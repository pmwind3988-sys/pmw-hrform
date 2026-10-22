/**
 * Runs the Workflow check (src/utils/workflowPreflight.ts) against the live
 * site from a terminal, over app-only Graph reads. The guard loaded before it
 * refuses every request that is not a read, so nothing can be written or sent.
 *
 *   node --use-system-ca --import ./scripts/form-check/read-only-guard.mjs scripts/form-check/run-check.ts
 */
import { getGraphToken, queryAllListItems, getListColumns, queryListItems } from "../../api/_utils/graphClient.ts";
import { searchRecipients } from "../../api/_utils/recipientSearch.ts";
import { mapDirectoryColumns, toApprovalDirectoryRow } from "../../api/_utils/approvalDirectorySchema.ts";
import { expandDistributionList } from "../../api/_utils/groupMembers.ts";
import { checkForm, departmentDirectoryKey, tallyChecks, type PreflightFormInput } from "../../src/utils/workflowPreflight.ts";
import { forEachSurveyElement } from "../../src/utils/surveyWalk.ts";
import { getDepartmentApproverLookupConfig } from "../../src/utils/departmentApproverLookup.ts";

const token = await getGraphToken();
const text = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));

const listCache = new Map<string, Record<string, unknown>[]>();
async function rows(list: string) {
  if (!listCache.has(list)) {
    listCache.set(list, (await queryAllListItems(token, list).catch(() => [])).map((i) => i.fields as Record<string, unknown>));
  }
  return listCache.get(list)!;
}

// List-backed choices: every value the list can offer (filters ignored, so every option is tried).
async function enrich(surveyJson: unknown) {
  const pending: Promise<void>[] = [];
  forEachSurveyElement(surveyJson, (el) => {
    const src = (el.spChoicesSource ?? null) as { list?: string; column?: string } | null;
    const filtered = (el.spFilteredListSource ?? null) as { list?: string; valueColumn?: string } | null;
    const list = src?.list || filtered?.list;
    const column = src?.column || filtered?.valueColumn;
    if (!list || !column) return;
    pending.push(rows(list).then((items) => {
      const values = [...new Set(items.map((r) => text(r[column])).filter(Boolean))];
      if (values.length) el.choices = values;
    }));
  });
  await Promise.all(pending);
  return surveyJson;
}

const versions = await rows("Web Form Versions");
const inputs: PreflightFormInput[] = [];
for (const form of await rows("Master Form")) {
  const title = text(form.Title);
  const version = text(form.CurrentVersion) || "1.0";
  const mine = versions.filter((v) => text(v.FormTitle) === title && text(v.FormVersion) === version);
  const base = mine.find((v) => (text(v.PublishKey) || "production") === "production");
  const profiles = [];
  for (const row of mine) {
    const payload = JSON.parse(text(row.SurveyJSON) || "{}");
    const basePayload = base ? JSON.parse(text(base.SurveyJSON) || "{}") : payload;
    profiles.push({
      key: text(row.PublishKey) || "production",
      label: text(row.PublishLabel) || text(row.PublishKey) || "production",
      status: text(row.PublishStatus) || "active",
      expiresAt: text(row.PublishExpiresAt),
      surveyJson: await enrich(basePayload.surveyJson ?? basePayload),
      layerConfig: payload.layerConfig ?? null,
    });
  }
  const columns = await getListColumns(token, title).then((c) => c.map((x) => x.name)).catch(() => null);
  // When this form last delivered an email, and last failed to, from its recent submissions.
  const recent = await queryListItems(token, title, { top: 50 }).catch(() => null);
  let emailHistory = null;
  if (recent) {
    emailHistory = { lastSentAt: "", lastFailedAt: "", lastError: "" };
    for (const item of recent) {
      let log: any = null;
      try { log = JSON.parse(text((item.fields as any).WorkflowEmailLog) || "null"); } catch { log = null; }
      for (const entry of Object.values(log ?? {}) as any[]) {
        if (entry?.status === "sent" && text(entry.sentAt) > emailHistory.lastSentAt) emailHistory.lastSentAt = text(entry.sentAt);
        if (entry?.status === "failed" && text(entry.lastAttemptAt) > emailHistory.lastFailedAt) {
          emailHistory.lastFailedAt = text(entry.lastAttemptAt);
          emailHistory.lastError = text(entry.error);
        }
      }
    }
  }
  inputs.push({ title, slug: text(form.Slug), version, isPublic: form.IsPublic !== false, responseColumns: columns, profiles, emailHistory });
}

const dirColumns = await getListColumns(token, "Approval Directory");
const map = mapDirectoryColumns(dirColumns.map((c) => ({ key: c.name, aliases: [c.name, c.displayName] })));
const directoryRows = (await rows("Approval Directory")).map((f) => toApprovalDirectoryRow(f, map));

const departmentDirectories = new Map();
for (const input of inputs) for (const p of input.profiles) {
  const layers = [...(p.layerConfig?.layers ?? []), ...(p.layerConfig?.manualBranches ?? []).flatMap((b: any) => b.layers ?? [])];
  for (const layer of layers) {
    if (layer.assignee?.type !== "department-approver") continue;
    const cfg = getDepartmentApproverLookupConfig(layer.assignee);
    const all = await rows(cfg.listName);
    departmentDirectories.set(departmentDirectoryKey(layer.assignee), all
      .filter((r) => text(r[cfg.roleColumn]).toLowerCase() === cfg.roleValue.toLowerCase())
      .map((r, i) => ({ id: i, department: text(r[cfg.departmentColumn]), approverName: text(r[cfg.nameColumn]), approverEmail: text(r[cfg.emailColumn]), role: text(r[cfg.roleColumn]) })));
  }
}

const env = {
  directoryRows,
  directoryUsable: true,
  departmentDirectories,
  expandDistributionList: async (_slug: string, _n: number) => [] as string[],
  manualPaperAddress: process.env.HR_FORM_MANUAL_PAPER_ADDRESS ?? "",
  now: new Date(),
  companyDomains: ["pmw-group.com"],
  // The same directory search the builder's recipient picker uses.
  lookupMailbox: async (email: string) => {
    const matches = await searchRecipients(token, email);
    const match = matches.find((m) => m.email.toLowerCase() === email.toLowerCase());
    return match ? match.kind : "missing";
  },
};
void expandDistributionList;

const results = [];
for (const input of inputs) results.push(await checkForm(input, env));
console.log(JSON.stringify(tallyChecks(results)));
for (const form of results) {
  console.log(`\n=== ${form.title} [${form.verdict}]`);
  for (const f of form.findings) console.log(`  (${f.level}) ${f.message}`);
  for (const p of form.passes) console.log(`  (ok) ${p}`);
  for (const p of form.profiles) {
    console.log(`  -- profile ${p.label} live=${p.live} [${p.verdict}]`);
    for (const f of p.findings) console.log(`    (${f.level}) ${f.message}`);
    for (const w of p.workflows) for (const s of w.steps) {
      console.log(`    ${w.branchLabel ? `[${w.branchLabel}] ` : ""}Step ${s.layerNumber} "${s.title}" [${s.verdict}] ${s.routingLabel}`);
      for (const f of s.findings) console.log(`      (${f.level}) ${f.message}`);
      for (const p of s.passes) console.log(`      (ok) ${p}`);
      for (const g of s.groups) console.log(`      > ${g.outcome} -> ${g.to.join("; ") || "-"} :: ${g.cases.length} case(s): ${g.cases.slice(0, 4).join(" | ")}${g.cases.length > 4 ? " …" : ""}${g.outcome !== "routed" ? ` :: ${g.detail}` : ""}`);
    }
  }
}
console.log("\nblocked requests:", (globalThis as any).__blockedRequests.length);

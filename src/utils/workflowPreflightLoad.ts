/**
 * workflowPreflightLoad.ts — reads everything the workflow check needs, with
 * the signed-in Form Builder user's own SharePoint token.
 *
 * Reads only. The one request that is not a GET is the distribution-list
 * expansion (`/api/expand-group`), which only reads group membership.
 * Covers forms on the home SharePoint site — the one `/form/:formId` serves.
 */
import type { LayerConfig, LayerConfigItem } from "../types";
import { loadApprovalDirectory } from "./approvalDirectory";
import { loadDepartmentApproverDirectory, type DepartmentApproverEntry } from "./departmentApproverDirectory";
import { expandLayerDistributionList } from "./expandLayerGroup";
import {
  getAllFormConfigs,
  getFilteredListChoices,
  getFormVersion,
  getFormVersionHistory,
  getSharePointChoices,
  spGet,
} from "./formBuilderSP";

import { enrichSurveyJsonChoices } from "./surveyChoiceEnrichment";
import {
  checkForm,
  departmentDirectoryKey,
  type EmailHistory,
  type FormCheck,
  type MailboxKind,
  type PreflightEnvironment,
  type PreflightFormInput,
  type PreflightProfileInput,
} from "./workflowPreflight";

const DEFAULT_PUBLISH_KEY = "production";
/** The home site: the one `/form/:formId` serves. */
const SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asLayerConfig(value: unknown): LayerConfig | null {
  const parsed = typeof value === "string" ? (() => { try { return JSON.parse(value) as unknown; } catch { return null; } })() : value;
  return isRecord(parsed) ? parsed as unknown as LayerConfig : null;
}

const GRAPH_USERS = "https://graph.microsoft.com/v1.0/users";

async function graphCount(token: string, query: string, advanced: boolean): Promise<number> {
  const response = await fetch(`${GRAPH_USERS}?${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(advanced ? { ConsistencyLevel: "eventual" } : {}),
    },
  });
  if (!response.ok) throw new Error(`Directory lookup failed (${response.status})`);
  const data = await response.json() as { value?: unknown[] };
  return data.value?.length ?? 0;
}

/**
 * Whether the company directory has an account behind an address, read with
 * the signed-in author's own `User.ReadBasic.All` (the people picker's grant).
 *
 * Tries the primary address and sign-in name, then any alias. Only an answer
 * of "nobody" from both is "missing"; a lookup that fails is "unknown", so an
 * unreachable directory never reads as a person who does not exist.
 */
async function lookupMailboxKind(token: string, email: string): Promise<MailboxKind> {
  const quoted = email.replace(/'/g, "''");
  try {
    const direct = await graphCount(
      token,
      `$select=id&$top=1&$filter=${encodeURIComponent(`mail eq '${quoted}' or userPrincipalName eq '${quoted}'`)}`,
      false,
    );
    if (direct > 0) return "user";
    const alias = await graphCount(
      token,
      `$select=id&$top=1&$count=true&$filter=${encodeURIComponent(`proxyAddresses/any(x:x eq 'smtp:${quoted}')`)}`,
      true,
    );
    return alias > 0 ? "user" : "missing";
  } catch {
    return "unknown";
  }
}

/**
 * When this form last delivered an email, and when one last failed, from the
 * delivery log on its most recent submissions. null when there is no log to read.
 */
async function loadEmailHistory(token: string, listTitle: string): Promise<EmailHistory | null> {
  try {
    const data = await spGet(
      token,
      `${SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items?$select=WorkflowEmailLog&$orderby=Id desc&$top=50`,
    ) as { value?: { WorkflowEmailLog?: string | null }[] };
    const history: EmailHistory = { lastSentAt: "", lastFailedAt: "", lastError: "" };
    for (const item of data.value ?? []) {
      let log: unknown = null;
      try { log = JSON.parse(item.WorkflowEmailLog || "null"); } catch { log = null; }
      if (!isRecord(log)) continue;
      for (const entry of Object.values(log)) {
        if (!isRecord(entry)) continue;
        const sentAt = typeof entry.sentAt === "string" ? entry.sentAt : "";
        const attemptAt = typeof entry.lastAttemptAt === "string" ? entry.lastAttemptAt : "";
        if (entry.status === "sent" && sentAt > history.lastSentAt) history.lastSentAt = sentAt;
        if (entry.status === "failed" && attemptAt > history.lastFailedAt) {
          history.lastFailedAt = attemptAt;
          history.lastError = typeof entry.error === "string" ? entry.error : "";
        }
      }
    }
    return history;
  } catch {
    return null;
  }
}

async function responseColumns(token: string, listTitle: string): Promise<string[] | null> {
  try {
    const data = await spGet(
      token,
      `${SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/fields?$select=InternalName&$filter=Hidden eq false`,
    ) as { value?: { InternalName?: string }[] };
    return (data.value ?? []).map((field) => field.InternalName ?? "").filter(Boolean);
  } catch {
    return null;
  }
}

async function loadProfiles(token: string, title: string, version: string): Promise<PreflightProfileInput[]> {
  const history = await getFormVersionHistory(token, title).catch(() => []);
  const keys = [...new Set(history
    .filter((row) => String(row.FormVersion ?? "") === version)
    .map((row) => String(row.PublishKey ?? "").trim() || DEFAULT_PUBLISH_KEY))];
  if (keys.length === 0) keys.push(DEFAULT_PUBLISH_KEY);

  const profiles: PreflightProfileInput[] = [];
  for (const key of keys) {
    const row = await getFormVersion(token, title, version, key).catch(() => null);
    if (!row) continue;
    const survey = isRecord(row.surveyJson) ? row.surveyJson : {};
    const surveyJson = await enrichSurveyJsonChoices(survey, {
      getSharePointChoices: (list, column) => getSharePointChoices(list, column, token),
      getFilteredListChoices: (list, valueColumn, filterColumn, filterValue, labelColumn) =>
        getFilteredListChoices(list, valueColumn, token, filterColumn, filterValue, labelColumn),
    });
    profiles.push({
      key,
      label: row.publishLabel || key,
      status: row.publishStatus || "active",
      expiresAt: row.publishExpiresAt || "",
      surveyJson,
      layerConfig: asLayerConfig(row.layerConfig),
    });
  }
  return profiles;
}

function everyLayer(config: LayerConfig | null): LayerConfigItem[] {
  return [...(config?.layers ?? []), ...(config?.manualBranches ?? []).flatMap((branch) => branch.layers ?? [])];
}

export type DirectoryLookupState = "ok" | "needs-consent" | "off";

export interface PreflightRun {
  forms: FormCheck[];
  directoryRows: number;
  /** Whether addresses could be checked against the company directory. */
  directoryLookup: DirectoryLookupState;
  ranAt: Date;
}

/** Reads every form and checks it. `onProgress` names the form being read. */
export interface PreflightOptions {
  /**
   * A Graph token carrying `User.ReadBasic.All` for the signed-in author, or
   * null when that permission has not been granted yet.
   */
  getPeopleToken?: () => Promise<string | null>;
  /** The company's mail domains, e.g. the signed-in account's own. */
  companyDomains?: string[];
  onProgress?: (label: string) => void;
}

export async function runWorkflowPreflight(
  token: string,
  { getPeopleToken, companyDomains = [], onProgress }: PreflightOptions = {},
): Promise<PreflightRun> {
  onProgress?.("Reading the form list");
  const configs = await getAllFormConfigs(token);

  const inputs: PreflightFormInput[] = [];
  for (const config of configs) {
    onProgress?.(`Reading ${config.Title}`);
    const version = String(config.CurrentVersion || "1.0");
    const [profiles, columns, emailHistory] = await Promise.all([
      loadProfiles(token, config.Title, version),
      responseColumns(token, config.Title),
      loadEmailHistory(token, config.Title),
    ]);
    inputs.push({
      title: config.Title,
      slug: String(config.Slug ?? ""),
      version,
      isPublic: config.IsPublic !== false,
      responseColumns: columns,
      emailHistory,
      profiles,
    });
  }

  onProgress?.("Reading the approval directories");
  const directory = await loadApprovalDirectory(token).catch(() => null);
  const departmentDirectories = new Map<string, DepartmentApproverEntry[] | null>();
  for (const layer of inputs.flatMap((input) => input.profiles.flatMap((p) => everyLayer(p.layerConfig)))) {
    if (layer.assignee.type !== "department-approver") continue;
    const key = departmentDirectoryKey(layer.assignee);
    if (departmentDirectories.has(key)) continue;
    const loaded = await loadDepartmentApproverDirectory(token, layer.assignee).catch(() => null);
    departmentDirectories.set(key, loaded?.exists ? loaded.entries : null);
  }

  const env: PreflightEnvironment = {
    directoryRows: directory?.rows ?? [],
    directoryUsable: directory?.usable ?? false,
    departmentDirectories,
    expandDistributionList: (slug, layerNumber, branch) => expandLayerDistributionList(slug, layerNumber, branch),
    manualPaperAddress: (import.meta.env.VITE_HR_FORM_MANUAL_PAPER_ADDRESS || "").trim(),
    now: new Date(),
    companyDomains,
  };
  let directoryLookup: DirectoryLookupState = "off";
  const peopleToken = getPeopleToken ? await getPeopleToken().catch(() => null) : null;
  if (getPeopleToken) directoryLookup = peopleToken ? "ok" : "needs-consent";
  if (peopleToken) {
    // One lookup per address for the whole run; a step re-asking costs nothing.
    const known = new Map<string, Promise<MailboxKind>>();
    env.lookupMailbox = (email) => {
      const key = email.toLowerCase();
      let kind = known.get(key);
      if (!kind) {
        kind = lookupMailboxKind(peopleToken, key);
        known.set(key, kind);
      }
      return kind;
    };
  }

  const forms: FormCheck[] = [];
  for (const input of inputs) {
    onProgress?.(`Checking ${input.title}`);
    forms.push(await checkForm(input, env));
  }
  return { forms, directoryRows: env.directoryRows.length, ranAt: env.now, directoryLookup };
}

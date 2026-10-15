/**
 * emailScheduleOverview.ts — every workflow email on All Submissions, in one place.
 *
 * Each submission keeps its own schedule (`WorkflowEmailSchedule`) and delivery
 * log (`WorkflowEmailLog`). This lays them side by side and answers the
 * question an admin actually has when something goes wrong: what has gone,
 * what goes in tomorrow's summary and with whom, what is waiting for a later
 * date, and what failed.
 *
 * The grouping copies the daily run's rule (`api/workflow-email-cron.ts`): two
 * or more signed-in steps due to the same addresses by the next run become one
 * summary; one alone goes as its own email. `isSignedInReviewLink`,
 * `recipientKey` and `nextDigestRunAt` mirror `api/_utils/workflowDigest.ts`
 * and `api/_utils/workflowSummaryHold.ts`, which src/ cannot import — keep
 * them in step.
 */
import { parseValidEmailList } from "./layerRecipients";
import { getWorkflowEmailStatus } from "./workflowEmailLog";
import type { ScheduledWorkflowEmail } from "./workflowEmailSchedule";

/** The daily run stops retrying after this many attempts (`WORKFLOW_EMAIL_MAX_ATTEMPTS`). */
const MAX_ATTEMPTS = 5;

export type EmailScheduleState =
  | "next-summary"
  | "next-alone"
  | "later"
  | "failed"
  | "stopped"
  | "sent-summary"
  | "sent-alone";

export interface EmailScheduleRow {
  formTitle: string;
  itemId: number;
  submittedBy: string;
  currentLayer: number;
  isTest: boolean;
  scheduleRaw: unknown;
  logRaw: unknown;
}

export interface EmailScheduleEntry {
  key: string;
  formTitle: string;
  itemId: number;
  layer: number;
  layerType: "approval" | "evaluation";
  submittedBy: string;
  recipient: string;
  recipientKey: string;
  dueAt: string;
  state: EmailScheduleState;
  /** Held from going out at once to join a summary. */
  held: boolean;
  /** For a summary: how many requests it carries (or carried). */
  summarySize?: number;
  sentAt?: string;
  attempts: number;
  /** Can be picked for "Send selected now". */
  selectable: boolean;
}

export function isSignedInReviewLink(link: unknown): boolean {
  const path = String(link || "").trim().replace(/^https?:\/\/[^/]+/i, "");
  return /^\/(?:eval|approval)\/[^/?#]+\/[^/?#]+\/\d+\/?$/.test(path);
}

export function recipientKey(recipient: string): string {
  return parseValidEmailList(recipient).map((email) => email.toLowerCase()).sort().join(";");
}

/** The daily run fires at 00:00 UTC (08:00 Malaysia), per `vercel.json`. */
export function nextDigestRunAt(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

function parseSchedule(raw: unknown): Record<string, ScheduledWorkflowEmail> {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, ScheduledWorkflowEmail>
      : {};
  } catch {
    return {};
  }
}

/**
 * One entry per scheduled email still relevant to its submission — a
 * schedule for a step the submission has already moved past is left out,
 * because the daily run skips it too.
 */
export function compileEmailSchedule(rows: EmailScheduleRow[], now = new Date()): EmailScheduleEntry[] {
  const runAt = nextDigestRunAt(now).getTime();
  const entries: EmailScheduleEntry[] = [];

  for (const row of rows) {
    for (const scheduled of Object.values(parseSchedule(row.scheduleRaw))) {
      const layer = Number(scheduled.layer);
      if (!layer) continue;
      const delivery = getWorkflowEmailStatus(row.logRaw, layer);
      const sent = scheduled.status === "sent" || delivery.status === "sent";
      if (!sent && row.currentLayer && row.currentLayer !== layer) continue;

      const attempts = Math.max(scheduled.attempts ?? 0, delivery.status === "not_sent" ? 0 : delivery.attempts);
      const due = Date.parse(scheduled.dueAt);
      const base = {
        key: `${row.formTitle}::${row.itemId}::${layer}`,
        formTitle: row.formTitle,
        itemId: row.itemId,
        layer,
        layerType: scheduled.layerType === "approval" ? "approval" as const : "evaluation" as const,
        submittedBy: row.submittedBy,
        recipient: scheduled.recipient || "",
        recipientKey: recipientKey(scheduled.recipient || ""),
        dueAt: scheduled.dueAt,
        held: !!scheduled.heldForSummary,
        attempts,
      };

      if (sent) {
        const viaSummary = delivery.status === "sent" && delivery.via === "summary";
        entries.push({
          ...base,
          state: viaSummary ? "sent-summary" : "sent-alone",
          held: false,
          ...(viaSummary && delivery.summarySize ? { summarySize: delivery.summarySize } : {}),
          ...(delivery.status === "sent" ? { sentAt: delivery.sentAt || delivery.lastAttemptAt } : {}),
          selectable: false,
        });
        continue;
      }
      if (attempts >= MAX_ATTEMPTS) {
        entries.push({ ...base, state: "stopped", selectable: true });
        continue;
      }
      if (scheduled.status === "failed" || delivery.status === "failed") {
        entries.push({ ...base, state: "failed", selectable: true });
        continue;
      }
      if (Number.isFinite(due) && due > runAt) {
        entries.push({ ...base, state: "later", selectable: true });
        continue;
      }
      // Due by the next run. Whether it goes alone is settled once everything
      // due then is known, below.
      const bundles = !row.isTest && isSignedInReviewLink(scheduled.reviewLink) && !!base.recipientKey;
      entries.push({ ...base, state: bundles ? "next-summary" : "next-alone", selectable: true });
    }
  }

  const sizes = new Map<string, number>();
  for (const entry of entries) {
    if (entry.state === "next-summary") sizes.set(entry.recipientKey, (sizes.get(entry.recipientKey) ?? 0) + 1);
  }
  for (const entry of entries) {
    if (entry.state !== "next-summary") continue;
    const size = sizes.get(entry.recipientKey) ?? 1;
    if (size < 2) entry.state = "next-alone";
    else entry.summarySize = size;
  }

  const order: Record<EmailScheduleState, number> = {
    failed: 0, stopped: 1, "next-summary": 2, "next-alone": 3, later: 4, "sent-summary": 5, "sent-alone": 6,
  };
  return entries.sort((a, b) =>
    order[a.state] - order[b.state]
    || a.recipientKey.localeCompare(b.recipientKey)
    || (a.state.startsWith("sent")
      ? String(b.sentAt || "").localeCompare(String(a.sentAt || ""))
      : String(a.dueAt).localeCompare(String(b.dueAt)))
    || a.itemId - b.itemId);
}

/** What the admin reads in the Status column. */
export function emailScheduleLabel(entry: EmailScheduleEntry): string {
  switch (entry.state) {
    case "next-summary":
      return `${entry.held ? "Held for" : "In"} next summary · ${entry.summarySize} requests`;
    case "next-alone":
      return "Sends alone at next run";
    case "later":
      return "Scheduled";
    case "failed":
      return "Failed · retries at next run";
    case "stopped":
      return "Stopped after 5 attempts";
    case "sent-summary":
      return entry.summarySize ? `Sent in a summary of ${entry.summarySize}` : "Sent in a summary";
    case "sent-alone":
      return "Sent on its own";
  }
}

const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";

export interface SendSelectedResult {
  sent: number;
  failed: number;
  summaries: number;
  skipped: string[];
}

/**
 * Sends the picked scheduled emails now. The server regroups them the way the
 * morning run would and checks the caller is a Form Builder superuser from the
 * SharePoint token — the same token this page already reads SharePoint with.
 */
export async function sendSelectedScheduledEmails(
  sharePointToken: string,
  entries: Pick<EmailScheduleEntry, "formTitle" | "itemId" | "layer">[],
): Promise<SendSelectedResult> {
  const res = await fetch("/api/workflow-email-cron", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
      "X-SharePoint-Token": sharePointToken,
    },
    body: JSON.stringify({
      action: "send-selected",
      items: entries.map((entry) => ({ formTitle: entry.formTitle, itemId: entry.itemId, layer: entry.layer })),
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<SendSelectedResult> & { error?: string };
  if (!res.ok) throw new Error(json.error || "Could not send the selected emails.");
  return {
    sent: json.sent ?? 0,
    failed: json.failed ?? 0,
    summaries: json.summaries ?? 0,
    skipped: Array.isArray(json.skipped) ? json.skipped : [],
  };
}

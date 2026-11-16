/**
 * formEmailList.ts — the Emails sent & pending tab in Available forms.
 *
 * The submissions whose request email has already gone to the approver or
 * evaluator, and who have not acted on it yet: the step the submission is at,
 * emailed, still open. Emails still waiting for their scheduled date are not
 * here (nobody has been asked yet), nor is anything already decided. Pure.
 */
import type { LayerConfig, Submission } from "../types";
import { isManualPaperStatus, isNeedsRoutingStatus } from "./layerParkStatus";
import { calendarDaysBetween, getWorkflowEmailStatus, OVERDUE_AFTER_DAYS } from "./workflowEmailLog";
import { isCompletedFormStatus, isRejectedStatus, isTerminalLayerStatus } from "./workflowStatus";

export interface WaitingEmail {
  key: string;
  submission: Submission;
  layer: number;
  layerType: "approval" | "evaluation";
  /** Who the request email went to. */
  recipient: string;
  sentAt: string;
  /** Malaysian calendar days since the email went out. */
  daysWaiting: number;
  /** Waited `OVERDUE_AFTER_DAYS` or more, the same rule as All Submissions' Overdue chip. */
  overdue: boolean;
  /** Reminder emails sent so far (day 3 and day 7). */
  reminders: number;
}

/** Whether the step is an evaluation, read off the steps this submission was sent through. */
function layerTypeFor(item: Submission, layer: number): "approval" | "evaluation" {
  const config: LayerConfig | null | undefined = item.versionLayerConfig ?? item.layerConfig;
  const branch = (item.selectedBranch ?? "").trim().toLowerCase();
  const steps = config?.manualBranches?.length
    ? config.manualBranches.find((candidate) =>
      [candidate.name, candidate.label].some((name) => typeof name === "string" && name.trim().toLowerCase() === branch))?.layers ?? []
    : config?.layers ?? [];
  return steps.find((step) => Number(step.layerNumber) === layer)?.type === "evaluation" ? "evaluation" : "approval";
}

function closed(formStatus: string | null): boolean {
  const normalized = (formStatus ?? "").toLowerCase().replace(/[\s_-]/g, "");
  return isCompletedFormStatus(formStatus) || isRejectedStatus(formStatus) || normalized === "cancelled";
}

/** The submission's open, already-emailed step, or null. */
function waitingFor(item: Submission, now: Date): WaitingEmail | null {
  const columns = item.emailColumns;
  if (item.isTest || !columns || closed(item.formStatus)) return null;
  const layer = columns.currentLayer;
  if (!layer) return null;
  const status = columns.layerStatuses[layer];
  // Decided, or parked where the reviewer cannot act on it.
  if (isTerminalLayerStatus(status) || isNeedsRoutingStatus(status) || isManualPaperStatus(status)) return null;
  const delivery = getWorkflowEmailStatus(columns.logRaw, layer);
  if (delivery.status !== "sent") return null;
  const sentAt = delivery.sentAt || delivery.lastAttemptAt;
  const sent = new Date(sentAt);
  if (!Number.isFinite(sent.getTime())) return null;
  const daysWaiting = Math.max(0, calendarDaysBetween(sent, now));
  return {
    key: `${item.listTitle}::${item.id}::${layer}`,
    submission: item,
    layer,
    layerType: layerTypeFor(item, layer),
    recipient: delivery.recipient,
    sentAt,
    daysWaiting,
    overdue: daysWaiting >= OVERDUE_AFTER_DAYS,
    reminders: Math.max(0, Math.trunc(delivery.reminders ?? 0)),
  };
}

/** Every submission waiting on someone who has been emailed, longest-waiting first. */
export function formEmailEntries(submissions: Submission[], now = new Date()): WaitingEmail[] {
  return submissions
    .map((item) => waitingFor(item, now))
    .filter((entry): entry is WaitingEmail => entry !== null)
    .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt) || Number(a.submission.id) - Number(b.submission.id));
}

/** How many are waiting, and how many of those are overdue. */
export function formEmailCounts(entries: WaitingEmail[]): { waiting: number; overdue: number } {
  return { waiting: entries.length, overdue: entries.filter((entry) => entry.overdue).length };
}

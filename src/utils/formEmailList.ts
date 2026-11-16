/**
 * formEmailList.ts — the Emails sent & pending tab in Available forms.
 *
 * One form's workflow request emails (approval and evaluation, any step),
 * compiled by the same rules as All Submissions → Email schedule
 * (`compileEmailSchedule`) so the two never disagree on an email's state.
 *
 * That compiler reads only the schedule column, which holds an email only when
 * it was set for later, held for a summary, or failed. An email sent the moment
 * someone submitted or the previous step approved is recorded in the sent-email
 * log alone, so this list adds those as sent rows. Pure.
 */
import type { LayerConfig, Submission } from "../types";
import { compileEmailSchedule, recipientKey, type EmailScheduleEntry } from "./emailScheduleOverview";
import { getWorkflowEmailStatus } from "./workflowEmailLog";

function isSent(entry: EmailScheduleEntry): boolean {
  return entry.state === "sent-summary" || entry.state === "sent-alone";
}

function time(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function entryKey(formTitle: string, itemId: number, layer: number): string {
  return `${formTitle}::${itemId}::${layer}`;
}

/** Step numbers the sent-email log has a record for. */
function loggedLayers(raw: unknown): number[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.keys(parsed).map(Number).filter((layer) => Number.isInteger(layer) && layer > 0);
  } catch {
    return [];
  }
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

/** Emails the log says went out, for steps the schedule column never held. */
function sentOnlyInLog(item: Submission, covered: Set<string>): EmailScheduleEntry[] {
  const columns = item.emailColumns;
  if (!columns) return [];
  const itemId = Number(item.id);
  const entries: EmailScheduleEntry[] = [];
  for (const layer of loggedLayers(columns.logRaw)) {
    const key = entryKey(item.listTitle, itemId, layer);
    if (covered.has(key)) continue;
    const delivery = getWorkflowEmailStatus(columns.logRaw, layer);
    if (delivery.status !== "sent") continue;
    const sentAt = delivery.sentAt || delivery.lastAttemptAt;
    const viaSummary = delivery.via === "summary";
    entries.push({
      key,
      formTitle: item.listTitle,
      itemId,
      layer,
      layerType: layerTypeFor(item, layer),
      submittedBy: item.submittedByEmail,
      recipient: delivery.recipient,
      recipientKey: recipientKey(delivery.recipient),
      dueAt: sentAt,
      state: viaSummary ? "sent-summary" : "sent-alone",
      held: false,
      ...(viaSummary && delivery.summarySize ? { summarySize: delivery.summarySize } : {}),
      sentAt,
      attempts: delivery.attempts,
      selectable: false,
    });
  }
  return entries;
}

/**
 * Every workflow request email on these submissions: still to go (soonest
 * first), then already sent (newest first). Test runs and rows without the
 * email columns are left out.
 */
export function formEmailEntries(submissions: Submission[], now = new Date()): EmailScheduleEntry[] {
  const real = submissions.filter((item) => !item.isTest && item.emailColumns);
  const scheduled = compileEmailSchedule(
    real.map((item) => ({
      formTitle: item.listTitle,
      itemId: Number(item.id),
      submittedBy: item.submittedByEmail,
      currentLayer: item.emailColumns!.currentLayer,
      isTest: false,
      scheduleRaw: item.emailColumns!.scheduleRaw,
      logRaw: item.emailColumns!.logRaw,
      assignmentRaw: item.emailColumns!.assignmentRaw,
      layerStatuses: item.emailColumns!.layerStatuses,
    })),
    now,
  );
  const covered = new Set(scheduled.map((entry) => entry.key));
  const entries = [...scheduled, ...real.flatMap((item) => sentOnlyInLog(item, covered))];
  const pending = entries.filter((entry) => !isSent(entry)).sort((a, b) => time(a.dueAt) - time(b.dueAt));
  const sent = entries.filter(isSent).sort((a, b) => time(b.sentAt) - time(a.sentAt));
  return [...pending, ...sent];
}

/** Sent, or still to go (scheduled, held or failed). */
export function formEmailCounts(entries: EmailScheduleEntry[]): { sent: number; pending: number } {
  const sent = entries.filter(isSent).length;
  return { sent, pending: entries.length - sent };
}

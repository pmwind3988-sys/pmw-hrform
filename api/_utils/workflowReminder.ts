/**
 * workflowReminder.ts — one nudge for a step nobody has picked up.
 *
 * A reviewer who missed the request email had nothing to bring them back to
 * it: the step sat untouched until somebody in HR noticed. The daily run now
 * reminds them, twice at most, so a buried email costs days rather than weeks
 * without turning the workflow into a stream of mail:
 *
 * - **Day 3 and day 7** after the request email, counted in Malaysian
 *   calendar days so a reminder lands on that morning's run whatever hour the
 *   request went out. Never a third.
 * - **Bundled.** A reminder for a signed-in step joins that person's daily
 *   summary with anything else due that morning, so nobody gets more than
 *   one workflow email a day from the run.
 * - **Only while the step is genuinely waiting for them** — the same rules as
 *   the "Waiting for me" page (`queueEntryForViewer`), so a reminder never
 *   points at a step the reviewer page would refuse, a decided submission, a
 *   parked step, or an evaluation whose date has not come yet.
 * - **Signed-in steps only.** A public step's link carries a key only its
 *   original email holds; a reminder without it would be a dead link.
 * - **From `REMINDERS_FROM` on.** Requests already sitting in inboxes when this
 *   shipped are not suddenly reminded all at once; HR resends those by hand.
 *
 * The count lives on the step's own `WorkflowEmailLog` entry. A fresh send of
 * the step's email (a resend, a reassignment) rewrites that entry, which
 * starts the clock again for whoever has the step now.
 */
import { isLayerEmail, joinEmailList, parseValidEmailList, readLayerDeliveryRecipients } from "./layerRecipients.js";
import { queueEntryForViewer, type QueueForm, type ReviewQueueEntry } from "./reviewQueue.js";
import { isSuperuserOnlyForm } from "./superuserOnlyForms.js";
import { isTestRow } from "./testRun.js";
import type { WorkflowEmailLog, WorkflowEmailMessage, WorkflowEmailScheduleEntry } from "./workflowEmail.js";
import { buildWorkflowEmailSubject, renderWorkflowEmail, requestSubmitterName, WORKFLOW_EMAIL_STATUS } from "./workflowEmailTemplate.js";

/** Days after the request email that each reminder is due. Its length is the cap. */
export const REMINDER_DAYS = [3, 7] as const;

/**
 * Request emails sent before this are never reminded about. Set to the day
 * reminders shipped, so the first run after deploy does not remind everyone
 * about everything at once.
 */
export const REMINDERS_FROM = Date.parse("2026-10-27T00:00:00Z");

/** Malaysia is UTC+8 all year; the daily run is 08:00 there. */
const LOCAL_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole Malaysian calendar days from `from` to `to`. */
export function calendarDaysBetween(from: Date, to: Date): number {
  const day = (time: number) => Math.floor((time + LOCAL_OFFSET_MS) / DAY_MS);
  return day(to.getTime()) - day(from.getTime());
}

export interface ReminderDue {
  layer: number;
  /** 1 for the first reminder, 2 for the last. */
  number: number;
  daysWaiting: number;
  /** Who the request email went to, read back off the row. */
  recipients: string[];
  step: ReviewQueueEntry;
  totalLayers: number;
}

function parseLog(raw: unknown): WorkflowEmailLog {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as WorkflowEmailLog : {};
  } catch {
    return {};
  }
}

function layerCount(form: QueueForm, selectedBranch: string): number {
  const key = selectedBranch.trim().toLowerCase();
  const branch = key
    ? form.layerConfig?.manualBranches?.find((entry) =>
      [entry.name, entry.label].some((name) => typeof name === "string" && name.trim().toLowerCase() === key))
    : undefined;
  return (branch?.layers ?? form.layerConfig?.layers ?? []).length;
}

/**
 * The reminder this submission is due this morning, or null. Pure.
 *
 * A test run is judged as though it were real, so a rehearsal exercises the
 * same rules; the caller sends its reminder to the tester alone.
 */
export function reminderDueFor(
  form: QueueForm,
  item: { id: string; fields: Record<string, unknown> },
  now = new Date(),
): ReminderDue | null {
  const fields = item.fields;
  const testRun = isTestRow(fields);
  // Real rows on a test-only form are nobody's work.
  if (!testRun && isSuperuserOnlyForm(form.title)) return null;

  const layer = Number(fields.CurrentLayer || fields.CurrentApprovalLayer || 0);
  if (!layer) return null;
  const sent = parseLog(fields.WorkflowEmailLog)[String(layer)];
  if (!sent || sent.status !== "sent" || !sent.sentAt) return null;
  const sentAt = new Date(sent.sentAt);
  if (!Number.isFinite(sentAt.getTime()) || sentAt.getTime() < REMINDERS_FROM) return null;

  const already = Math.max(0, Math.trunc(Number(sent.reminders) || 0));
  if (already >= REMINDER_DAYS.length) return null;
  const daysWaiting = calendarDaysBetween(sentAt, now);
  if (daysWaiting < REMINDER_DAYS[already]) return null;
  // A first reminder that went out late must not put the second on its heels.
  const last = sent.lastReminderAt ? new Date(sent.lastReminderAt) : null;
  if (last && Number.isFinite(last.getTime()) && calendarDaysBetween(last, now) < 2) return null;

  const primary = parseValidEmailList(fields[`L${layer}_Email`])[0] || "";
  if (!isLayerEmail(primary)) return null;
  const judged = testRun ? { ...fields, IsTest: false } : fields;
  const step = queueEntryForViewer(form, { id: item.id, fields: judged }, primary, now);
  if (!step || step.layerNumber !== layer) return null;

  const recipients = readLayerDeliveryRecipients(fields, layer);
  const fallback = parseValidEmailList(fields[`L${layer}_Emails`]);
  return {
    layer,
    number: already + 1,
    daysWaiting,
    recipients: recipients.length ? recipients : fallback.length ? fallback : [primary],
    step,
    totalLayers: Math.max(layerCount(form, String(fields.SelectedBranch || "")), layer),
  };
}

/** The log with this step's reminder counted, claimed before anything is sent. */
export function recordReminder(raw: unknown, layer: number, at: Date): WorkflowEmailLog {
  const log = parseLog(raw);
  const entry = log[String(layer)];
  if (!entry) return log;
  return {
    ...log,
    [String(layer)]: {
      ...entry,
      reminders: Math.max(0, Math.trunc(Number(entry.reminders) || 0)) + 1,
      lastReminderAt: at.toISOString(),
    },
  };
}

/** The reminder in the shape the daily summary bundles, with an absolute link. */
export function reminderScheduleEntry(
  due: ReminderDue,
  baseUrl: string,
  submittedBy: string,
  now = new Date(),
): WorkflowEmailScheduleEntry {
  return {
    layer: due.layer,
    recipient: joinEmailList(due.recipients),
    dueAt: now.toISOString(),
    status: "scheduled",
    updatedAt: now.toISOString(),
    layerType: due.step.layerType,
    totalLayers: due.totalLayers,
    reviewLink: `${baseUrl.replace(/\/$/, "")}${due.step.link}`,
    submittedBy,
  };
}

/** A reminder that goes out on its own, when it is the only thing due for that person. */
export function buildWorkflowReminderEmail(params: {
  due: ReminderDue;
  reviewLink: string;
  submittedBy: string;
  trainingTitle?: string;
  submitterName?: string;
}): WorkflowEmailMessage {
  const { due } = params;
  const { step } = due;
  const evaluation = step.layerType === "evaluation";
  const noun = evaluation ? "evaluation" : "approval";
  const actionLabel = evaluation ? "Review & submit evaluation" : "Review & approve form";
  const days = `${due.daysWaiting} day${due.daysWaiting === 1 ? "" : "s"}`;
  return {
    to: due.recipients.length === 1 ? due.recipients[0] : due.recipients,
    subject: buildWorkflowEmailSubject({
      prefix: "Reminder",
      formTitle: step.formTitle,
      applicantName: step.applicantName,
      submittedBy: params.submittedBy,
      referenceNo: step.referenceNo,
      responseItemId: step.responseItemId,
    }),
    body: renderWorkflowEmail({
      preheader: `${step.formTitle} #${step.responseItemId} has been waiting ${days} for your ${noun}.`,
      eyebrow: due.number >= REMINDER_DAYS.length ? "Final reminder" : "Reminder",
      status: WORKFLOW_EMAIL_STATUS.actionRequired,
      heading: `${step.formTitle} is still waiting for your ${noun}`,
      intro: `We emailed you about this submission ${days} ago and it has not been ${evaluation ? "evaluated" : "approved"} yet. `
        + "The person who submitted it cannot move on until you record your decision.",
      details: [
        { label: "Form", value: step.formTitle },
        { label: "Training", value: params.trainingTitle ?? "" },
        { label: "Reference no.", value: step.referenceNo },
        { label: "Submission ID", value: `#${step.responseItemId}` },
        { label: "Applicant", value: step.applicantName },
        { label: "Submitted by", value: requestSubmitterName(params.submittedBy, step.applicantName, params.submitterName) },
        { label: "Workflow stage", value: `Layer ${due.layer} of ${due.totalLayers}` },
        { label: "Waiting", value: days },
      ].filter((detail) => String(detail.value).trim()),
      actionUrl: params.reviewLink,
      actionLabel,
      portalIdentity: true,
      note: due.number >= REMINDER_DAYS.length
        ? "This is the last reminder we will send. Everything assigned to you is also on the Waiting for me page."
        : "Everything assigned to you is also on the Waiting for me page.",
    }),
    followUp: true,
  };
}

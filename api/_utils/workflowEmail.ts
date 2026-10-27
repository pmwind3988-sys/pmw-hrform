import {
  ensureListColumns,
  queryListItemById,
  updateListItemFields,
} from "./graphClient.js";
import { logWarn } from "./logger.js";
import {
  buildWorkflowEmailSubject,
  renderActionRequestEmail,
  renderWorkflowEmail,
  WORKFLOW_EMAIL_STATUS,
  type WorkflowEmailDetail,
} from "./workflowEmailTemplate.js";
import { redirectTestMessage, type TestRunRedirect } from "./testRun.js";
import { isSignedInReviewLink } from "./workflowDigest.js";

export type WorkflowEmailDeliveryStatus = "sent" | "failed";

export interface WorkflowEmailEntry {
  layer: number;
  recipient: string;
  status: WorkflowEmailDeliveryStatus;
  attempts: number;
  lastAttemptAt: string;
  sentAt?: string;
  error?: string;
  /**
   * Set when this notice went out inside a daily summary rather than as its
   * own email, with how many requests that summary carried. Absent means it
   * was sent on its own.
   */
  via?: "summary";
  summarySize?: number;
  /**
   * Reminders the daily run has sent for this step since the email above,
   * and when the last one went. A fresh send of the step's email rebuilds
   * this entry, so a resend starts the reminder clock again.
   * See `workflowReminder.ts`.
   */
  reminders?: number;
  lastReminderAt?: string;
}

export type WorkflowEmailLog = Record<string, WorkflowEmailEntry>;
export type WorkflowEmailScheduleMode = "immediate" | "three_months" | "custom_days";
export type WorkflowEmailScheduleStatus = "scheduled" | "sending" | "sent" | "failed";

export interface WorkflowEmailScheduleConfig {
  mode: WorkflowEmailScheduleMode;
  customDays?: number;
}

export interface WorkflowEmailScheduleEntry {
  layer: number;
  recipient: string;
  dueAt: string;
  status: WorkflowEmailScheduleStatus;
  updatedAt: string;
  /**
   * Delivery attempts so far, carried over from the delivery log. Bounds the
   * cron's retries so one permanently bad address cannot be re-tried daily
   * forever.
   */
  attempts?: number;
  layerType: "approval" | "evaluation";
  totalLayers: number;
  reviewLink: string;
  submittedBy: string;
  /**
   * An email that would have gone out at once, held for the next morning's
   * summary because the same person already had one due then. See
   * `workflowSummaryHold.ts`.
   */
  heldForSummary?: boolean;
}

export type WorkflowEmailScheduleLog = Record<string, WorkflowEmailScheduleEntry>;

interface WorkflowEmailAttempt {
  layer: number;
  recipient: string;
  status: WorkflowEmailDeliveryStatus;
  attemptedAt: string;
  error?: string;
  via?: "summary";
  summarySize?: number;
}

export interface WorkflowEmailMessage {
  to: string | string[];
  subject: string;
  body: string;
  attachments?: WorkflowEmailAttachment[];
  /**
   * Sent at high importance and flagged for follow-up, due in
   * `FOLLOW_UP_DAYS`. Only for emails that ask somebody to act.
   */
  followUp?: boolean;
}

/** When the follow-up flag on an action email falls due. */
export const FOLLOW_UP_DAYS = 3;

function graphDateTime(date: Date) {
  return { dateTime: date.toISOString().replace(/Z$/, ""), timeZone: "UTC" };
}

/**
 * The Graph message fields that mark an email as needing action: the red "!"
 * and an Outlook follow-up flag, which puts it on the reader's To-Do list and
 * reminds them on the due date.
 *
 * Whether the flag survives delivery is up to Exchange: it reliably does for
 * mailboxes inside the tenant, and an outside mail system may drop it. The
 * daily reminder (`workflowReminder.ts`) is what does not depend on it.
 */
export function followUpMessageFields(now = new Date()) {
  const due = new Date(now.getTime() + FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000);
  return {
    importance: "high",
    flag: {
      flagStatus: "flagged",
      startDateTime: graphDateTime(now),
      dueDateTime: graphDateTime(due),
    },
  };
}

export interface WorkflowEmailAttachment {
  name: string;
  contentType: string;
  contentBytes: string;
}

export interface WorkflowEmailContext {
  listTitle: string;
  responseItemId: string | number;
  layer: number;
  /**
   * Set only on a test run. Present here rather than at each call site because
   * this is the one place every workflow email passes through — a redirect that
   * a future caller could forget to apply would mail a real approver.
   */
  testRun?: TestRunRedirect;
}

export interface WorkflowActionEmailParams {
  formTitle: string;
  submittedBy: string;
  responseItemId: string | number;
  layer: number;
  totalLayers: number;
  /** One address, or the full delivery list when the layer fans out to several. */
  recipient: string | string[];
  layerType: "approval" | "evaluation";
  reviewLink: string;
  /** Shown ahead of the numeric item ID when the form issues references. */
  referenceNo?: string;
  /** The name the form collected, which is who the request is actually about. */
  applicantName?: string;
  /**
   * Says who on the email is standing in for whom, when the step also went to
   * someone's PA. See standInEmailNote in _utils/standIns.ts.
   */
  standInNote?: string;
}

export interface ManualPaperWorkflowEmailParams {
  formTitle: string;
  submittedBy: string;
  responseItemId: string | number;
  layer: number;
  totalLayers: number;
  /** One address, or the full delivery list when the layer fans out to several. */
  recipient: string | string[];
  layerType: "approval" | "evaluation";
  layerTitle?: string;
  surveyElements?: Record<string, unknown>[];
  /** Shown ahead of the numeric item ID when the form issues references. */
  referenceNo?: string;
  /** The name the form collected, which is who the request is actually about. */
  applicantName?: string;
}

function parseWorkflowEmailLog(raw: unknown): WorkflowEmailLog {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as WorkflowEmailLog
      : {};
  } catch {
    return {};
  }
}

export function parseWorkflowEmailSchedule(raw: unknown): WorkflowEmailScheduleLog {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as WorkflowEmailScheduleLog;
  }
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as WorkflowEmailScheduleLog
      : {};
  } catch {
    return {};
  }
}

function addCalendarMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date);
  const targetDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  result.setUTCDate(Math.min(targetDay, lastDay));
  return result;
}

export function resolveWorkflowEmailDueAt(
  schedule: WorkflowEmailScheduleConfig | undefined,
  activatedAt = new Date(),
): string {
  if (!schedule || schedule.mode === "immediate") return activatedAt.toISOString();
  if (schedule.mode === "three_months") {
    return addCalendarMonthsClamped(activatedAt, 3).toISOString();
  }
  const days = Math.max(1, Math.trunc(schedule.customDays ?? 1));
  const result = new Date(activatedAt);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString();
}

export function setWorkflowEmailSchedule(
  raw: unknown,
  entry: WorkflowEmailScheduleEntry,
): WorkflowEmailScheduleLog {
  return {
    ...parseWorkflowEmailSchedule(raw),
    [String(entry.layer)]: entry,
  };
}

/** How many delivery attempts one layer's notification gets before we stop. */
export const WORKFLOW_EMAIL_MAX_ATTEMPTS = 5;

/**
 * How long a row may sit in "sending" before another run may claim it.
 *
 * The cron marks a row "sending" *before* it sends, so a run killed in between
 * (a timeout, a redeploy) leaves the row claimed by a process that is never
 * coming back. Without a staleness window nothing would ever move it out of
 * "sending", and the notification would be stranded permanently.
 */
export const WORKFLOW_EMAIL_SENDING_STALE_MS = 15 * 60 * 1000;

/**
 * The schedule rows a cron run should attempt now.
 *
 * Deliberately wider than "scheduled": a "failed" row is a delivery that still
 * has not happened, and abandoning it is why one transient sendMail failure
 * used to lose the notification outright. "sent" is the only finished status.
 */
export function getDueWorkflowEmailSchedules(
  raw: unknown,
  now = new Date(),
): WorkflowEmailScheduleEntry[] {
  const nowTime = now.getTime();
  return Object.values(parseWorkflowEmailSchedule(raw)).filter((entry) => {
    if (entry.status === "sent") return false;
    if ((entry.attempts ?? 0) >= WORKFLOW_EMAIL_MAX_ATTEMPTS) return false;
    if (entry.status === "sending") {
      const claimedAt = Date.parse(entry.updatedAt);
      return Number.isFinite(claimedAt)
        && nowTime - claimedAt >= WORKFLOW_EMAIL_SENDING_STALE_MS;
    }
    const dueTime = Date.parse(entry.dueAt);
    return Number.isFinite(dueTime) && dueTime <= nowTime;
  });
}

export function recordWorkflowEmailAttempt(
  raw: unknown,
  attempt: WorkflowEmailAttempt,
): WorkflowEmailLog {
  const log = parseWorkflowEmailLog(raw);
  const key = String(attempt.layer);
  const previous = log[key];
  const next: WorkflowEmailEntry = {
    layer: attempt.layer,
    recipient: attempt.recipient,
    status: attempt.status,
    attempts: (previous?.attempts ?? 0) + 1,
    lastAttemptAt: attempt.attemptedAt,
  };
  if (attempt.via === "summary") {
    next.via = "summary";
    if (attempt.summarySize) next.summarySize = attempt.summarySize;
  }
  if (attempt.status === "sent") {
    next.sentAt = attempt.attemptedAt;
  } else {
    next.error = attempt.error || "Email delivery failed";
  }
  return { ...log, [key]: next };
}

export function resolveHrFormSender(): string {
  return (
    process.env.HR_FORM_EMAIL_FROM_ADDRESS ||
    process.env.VITE_HR_FORM_EMAIL_FROM_ADDRESS ||
    process.env.EMAIL_FROM_ADDRESS ||
    process.env.VITE_EMAIL_FROM_ADDRESS ||
    ""
  );
}

// ─── Paper/manual sentinel address ────────────────────────────────────────────
// The mailbox that represents "no online reviewer — handle this layer on paper".
// When a layer's resolved approver/evaluator equals this address, the layer is
// flagged manual and the notice is emailed to it instead of assigning an online
// review link. This is deliberately SEPARATE from resolveHrFormSender() (the
// Graph sendMail "from" mailbox), so the sentinel can be pmw.hrform@pmw-group.com
// while emails keep sending from the shared EMAIL_FROM_ADDRESS mailbox.
// ─────────────────────────────────────────────────────────────────────────────
export function resolveManualPaperAddress(): string {
  return (
    process.env.HR_FORM_MANUAL_PAPER_ADDRESS ||
    process.env.VITE_HR_FORM_MANUAL_PAPER_ADDRESS ||
    ""
  );
}

export async function sendGraphEmail(
  token: string,
  message: WorkflowEmailMessage,
): Promise<void> {
  const recipients = typeof message.to === "string" ? [message.to] : message.to;
  const fromAddress = resolveHrFormSender();
  if (!fromAddress) {
    throw new Error("HR form email sender is not configured.");
  }

  const graphRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromAddress)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: message.subject,
          body: {
            contentType: "HTML",
            content: message.body,
          },
          toRecipients: recipients.map((recipient) => ({
            emailAddress: { address: recipient },
          })),
          ...(message.followUp ? followUpMessageFields() : {}),
          ...(message.attachments?.length ? {
            attachments: message.attachments.map((attachment) => ({
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: attachment.name,
              contentType: attachment.contentType,
              contentBytes: attachment.contentBytes,
            })),
          } : {}),
        },
        saveToSentItems: false,
      }),
    },
  );

  if (!graphRes.ok) {
    throw new Error(`Graph sendMail failed with status ${graphRes.status}.`);
  }
}

export async function persistWorkflowEmailAttempt(
  token: string,
  context: WorkflowEmailContext,
  attempt: WorkflowEmailAttempt,
): Promise<WorkflowEmailEntry> {
  await ensureListColumns(token, context.listTitle, [
    {
      name: "WorkflowEmailLog",
      displayName: "WorkflowEmailLog",
      type: "note",
    },
  ]);
  const item = await queryListItemById(
    token,
    context.listTitle,
    String(context.responseItemId),
  );
  const log = recordWorkflowEmailAttempt(item?.fields.WorkflowEmailLog, attempt);
  const schedule = parseWorkflowEmailSchedule(item?.fields.WorkflowEmailSchedule);
  const scheduledEntry = schedule[String(context.layer)];
  const fields: Record<string, unknown> = { WorkflowEmailLog: JSON.stringify(log) };
  if (scheduledEntry) {
    fields.WorkflowEmailSchedule = JSON.stringify(setWorkflowEmailSchedule(schedule, {
      ...scheduledEntry,
      status: attempt.status,
      updatedAt: attempt.attemptedAt,
      // Taken from the delivery log so the cron's retry cap counts every
      // attempt, including whichever one was made inline at submit time.
      attempts: log[String(context.layer)]?.attempts ?? scheduledEntry.attempts,
    }));
  }
  await updateListItemFields(
    token,
    context.listTitle,
    String(context.responseItemId),
    fields,
  );
  return log[String(context.layer)];
}

export async function persistWorkflowEmailSchedule(
  token: string,
  context: WorkflowEmailContext,
  entry: WorkflowEmailScheduleEntry,
): Promise<WorkflowEmailScheduleEntry> {
  await ensureListColumns(token, context.listTitle, [
    { name: "WorkflowEmailSchedule", displayName: "WorkflowEmailSchedule", type: "note" },
    { name: "WorkflowEmailLog", displayName: "WorkflowEmailLog", type: "note" },
  ]);
  const item = await queryListItemById(token, context.listTitle, String(context.responseItemId));
  const schedule = setWorkflowEmailSchedule(item?.fields.WorkflowEmailSchedule, entry);
  await updateListItemFields(token, context.listTitle, String(context.responseItemId), {
    WorkflowEmailSchedule: JSON.stringify(schedule),
  });
  return schedule[String(entry.layer)];
}

/**
 * Sends a layer's notification now, or parks it until its due date.
 *
 * An immediate notification is **sent before anything is written to the list**.
 * The reverse order cost three list round-trips before the mail even left, and
 * if the request died in between, the row was left "scheduled" for the next cron
 * run to find - which is how an immediate notification arrived a day late.
 */
export async function scheduleOrDeliverWorkflowEmail(
  token: string,
  message: WorkflowEmailMessage,
  context: WorkflowEmailContext,
  config: WorkflowEmailScheduleConfig | undefined,
  details: Omit<WorkflowEmailScheduleEntry, "recipient" | "dueAt" | "status" | "updatedAt">,
  options?: {
    /**
     * Allow an immediate notice to wait for the next morning's summary when
     * the same person already has one due then. Only the action email for a
     * signed-in step asks for this; an admin's "send now" never does.
     */
    mayHoldForSummary?: boolean;
  },
): Promise<WorkflowEmailScheduleEntry> {
  const now = new Date();
  const recipient = typeof message.to === "string" ? message.to : message.to.join(", ");
  const base = { ...details, layer: context.layer, recipient };

  if (
    options?.mayHoldForSummary
    && (!config || config.mode === "immediate")
    && !context.testRun
    && isSignedInReviewLink(details.reviewLink)
  ) {
    // Loaded on demand: the hold check reads this module's schedule parser.
    const { summaryHoldUntil } = await import("./workflowSummaryHold.js");
    const holdUntil = await summaryHoldUntil(token, recipient, {
      listTitle: context.listTitle,
      responseItemId: String(context.responseItemId),
      layer: context.layer,
    }, now).catch(() => null);
    if (holdUntil) {
      const held: WorkflowEmailScheduleEntry = {
        ...base,
        dueAt: holdUntil,
        status: "scheduled",
        updatedAt: now.toISOString(),
        heldForSummary: true,
      };
      await persistWorkflowEmailSchedule(token, context, held);
      return held;
    }
  }

  // Only a deferred send needs a row to wait in.
  if (config && config.mode !== "immediate") {
    const entry: WorkflowEmailScheduleEntry = {
      ...base,
      dueAt: resolveWorkflowEmailDueAt(config, now),
      status: "scheduled",
      updatedAt: now.toISOString(),
    };
    await persistWorkflowEmailSchedule(token, context, entry);
    return entry;
  }

  try {
    await deliverWorkflowEmail(token, message, context);
    return { ...base, dueAt: now.toISOString(), status: "sent", updatedAt: new Date().toISOString() };
  } catch (error) {
    // The mail arrived and only the bookkeeping failed: queueing a retry would
    // deliver the same notification twice.
    if (error instanceof WorkflowEmailRecordError) throw error;
    // Best effort - the point is to leave the cron something to retry from, and
    // the caller needs to hear about the send failure either way.
    await persistWorkflowEmailSchedule(token, context, {
      ...base,
      dueAt: now.toISOString(),
      status: "failed",
      updatedAt: new Date().toISOString(),
      attempts: 1,
    }).catch(() => { /* the thrown send error is the signal that matters */ });
    throw error;
  }
}

/**
 * Thrown when the mail went out but recording it did not.
 *
 * Distinct from a send failure because the two want opposite handling: a send
 * failure should be queued for retry, while re-sending a mail that already
 * arrived would deliver the notification twice.
 */
export class WorkflowEmailRecordError extends Error {
  constructor(detail: string) {
    super(`Workflow email was sent but could not be recorded: ${detail}`);
    this.name = "WorkflowEmailRecordError";
  }
}

export async function deliverWorkflowEmail(
  token: string,
  message: WorkflowEmailMessage,
  context: WorkflowEmailContext,
): Promise<WorkflowEmailEntry> {
  const outgoing = context.testRun ? redirectTestMessage(message, context.testRun) : message;
  const recipient = typeof outgoing.to === "string" ? outgoing.to : outgoing.to.join(", ");
  const attemptedAt = new Date().toISOString();
  let sent = false;
  try {
    await sendGraphEmail(token, outgoing);
    sent = true;
    return await persistWorkflowEmailAttempt(token, context, {
      layer: context.layer,
      recipient,
      status: "sent",
      attemptedAt,
    });
  } catch (error) {
    if (sent) {
      throw new WorkflowEmailRecordError(error instanceof Error ? error.message : String(error));
    }
    await persistWorkflowEmailAttempt(token, context, {
      layer: context.layer,
      recipient,
      status: "failed",
      attemptedAt,
      error: "Email delivery failed",
    });
    throw error;
  }
}

/**
 * The reference row. Blank values are dropped by the template, so this simply
 * disappears on a form that does not issue references.
 */
function referenceDetail(referenceNo: string | undefined): WorkflowEmailDetail {
  return { label: "Reference no.", value: (referenceNo ?? "").trim() };
}

/**
 * Who the request is about, as the form recorded it — dropped, like the
 * reference, when the form collected no name to show.
 */
function applicantDetail(applicantName: string | undefined): WorkflowEmailDetail {
  return { label: "Applicant", value: (applicantName ?? "").trim() };
}

export function buildManualPaperWorkflowEmail(
  params: ManualPaperWorkflowEmailParams,
): WorkflowEmailMessage {
  const noun = params.layerType === "evaluation" ? "manual evaluation" : "manual approval";
  const layerName = params.layerTitle?.trim() || `Layer ${params.layer}`;
  return {
    to: params.recipient,
    subject: buildWorkflowEmailSubject({
      prefix: "Manual Action Required",
      formTitle: params.formTitle,
      applicantName: params.applicantName,
      submittedBy: params.submittedBy,
      referenceNo: params.referenceNo,
      responseItemId: params.responseItemId,
    }),
    body: renderWorkflowEmail({
      preheader: `${params.formTitle} #${params.responseItemId} needs ${noun}.`,
      eyebrow: "Manual workflow",
      status: WORKFLOW_EMAIL_STATUS.manual,
      heading: `${params.formTitle} needs ${noun}`,
      // Worded like the browser's submit-time notice (src/utils/manualPaperEmail.ts), which attaches the PDF; this one does not.
      intro: `Nobody completes this step online, so it is handled on paper. Print the submission's PDF record, complete the ${params.layerType} by hand, and return the signed copy to HR.`,
      details: [
        { label: "Form", value: params.formTitle },
        referenceDetail(params.referenceNo),
        { label: "Submission ID", value: `#${params.responseItemId}` },
        applicantDetail(params.applicantName),
        { label: "Submitted by", value: params.submittedBy },
        { label: "Workflow stage", value: `Layer ${params.layer} of ${params.totalLayers}` },
        { label: "Layer", value: layerName },
      ],
    }),
  };
}

export interface LayerNeedsRoutingEmailParams {
  formTitle: string;
  submittedBy: string;
  responseItemId: string | number;
  layer: number;
  totalLayers: number;
  recipient: string | string[];
  layerType: "approval" | "evaluation";
  /** Why routing could not be decided, in the resolver's own words. */
  reason: string;
  referenceNo?: string;
  /** The name the form collected, which is who the request is actually about. */
  applicantName?: string;
}

/**
 * The notice for a layer that arrived but could not be routed to anybody.
 *
 * Deliberately has **no action link**. The layer has no actors, so any link
 * would be refused by the access check the moment somebody clicked it; telling
 * the team the submission exists and what needs fixing is the honest message.
 */
export function buildLayerNeedsRoutingEmail(
  params: LayerNeedsRoutingEmailParams,
): WorkflowEmailMessage {
  const noun = params.layerType === "evaluation" ? "evaluation" : "approval";
  return {
    to: params.recipient,
    subject: buildWorkflowEmailSubject({
      prefix: "Awaiting Routing",
      formTitle: params.formTitle,
      applicantName: params.applicantName,
      submittedBy: params.submittedBy,
      referenceNo: params.referenceNo,
      responseItemId: params.responseItemId,
    }),
    body: renderWorkflowEmail({
      preheader: `${params.formTitle} #${params.responseItemId} is waiting to be routed.`,
      eyebrow: "System notification",
      status: WORKFLOW_EMAIL_STATUS.awaitingRouting,
      heading: `${params.formTitle} is waiting to be routed`,
      intro: `This submission has been saved, but the ${noun} layer below could not be assigned to anyone automatically. An administrator needs to route it before it can be actioned — there is nothing to click yet.`,
      details: [
        { label: "Form", value: params.formTitle },
        referenceDetail(params.referenceNo),
        { label: "Submission ID", value: `#${params.responseItemId}` },
        applicantDetail(params.applicantName),
        { label: "Submitted by", value: params.submittedBy },
        { label: "Workflow stage", value: `Layer ${params.layer} of ${params.totalLayers}` },
      ],
      callout: `**Why it stopped:** ${params.reason}`,
    }),
  };
}

export function buildWorkflowActionEmail(
  params: WorkflowActionEmailParams,
): WorkflowEmailMessage {
  return {
    to: params.recipient,
    subject: buildWorkflowEmailSubject({
      prefix: "Action Required",
      formTitle: params.formTitle,
      applicantName: params.applicantName,
      submittedBy: params.submittedBy,
      referenceNo: params.referenceNo,
      responseItemId: params.responseItemId,
    }),
    // Worded once, in the template, so the browser's copy of this email is the same email.
    body: renderActionRequestEmail({ ...params, sender: resolveHrFormSender() }),
    followUp: true,
  };
}

/** Last-resort origin, correct only for the HR deployment. */
const FALLBACK_APP_BASE_URL = "https://pmw-hrform.vercel.app";

/**
 * The origin every review link in an outgoing email is built from.
 *
 * Worth being fussy about, because OSHES forms are served by a *different*
 * deployment from HR's: a link built with the wrong origin sends the reviewer to
 * an app where their submission does not exist. The last resort below is the HR
 * app, so any other deployment that reaches it is misconfigured - and it says so
 * rather than quietly mailing links into the wrong app.
 */
export function getApplicationBaseUrl(): string {
  const configured = process.env.APP_BASE_URL || process.env.VITE_APP_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  logWarn("api:workflow-email", "No application base URL configured; guessing", {
    guessed: FALLBACK_APP_BASE_URL,
    fix: "Set APP_BASE_URL to this deployment's own origin - required on any deployment that is not PMW HR.",
  });
  return FALLBACK_APP_BASE_URL;
}

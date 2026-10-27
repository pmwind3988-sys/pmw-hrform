export interface WorkflowEmailStatusEntry {
  status: "sent" | "failed";
  recipient: string;
  attempts: number;
  lastAttemptAt: string;
  sentAt?: string;
  error?: string;
  /** Went out inside a daily summary of this many requests, not on its own. */
  via?: "summary";
  summarySize?: number;
  /** Reminders the daily run has sent since this email, and when the last went. */
  reminders?: number;
  lastReminderAt?: string;
}

export type WorkflowEmailStatus =
  | WorkflowEmailStatusEntry
  | { status: "not_sent" };

export function getWorkflowEmailStatus(
  raw: unknown,
  layerNumber: number,
): WorkflowEmailStatus {
  if (typeof raw !== "string" || !raw.trim()) return { status: "not_sent" };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entry = parsed[String(layerNumber)];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { status: "not_sent" };
    }
    const record = entry as Record<string, unknown>;
    if (record.status !== "sent" && record.status !== "failed") {
      return { status: "not_sent" };
    }
    return {
      status: record.status,
      recipient: typeof record.recipient === "string" ? record.recipient : "",
      attempts: typeof record.attempts === "number" ? record.attempts : 0,
      lastAttemptAt: typeof record.lastAttemptAt === "string" ? record.lastAttemptAt : "",
      ...(typeof record.sentAt === "string" ? { sentAt: record.sentAt } : {}),
      ...(typeof record.error === "string" ? { error: record.error } : {}),
      ...(record.via === "summary" ? { via: "summary" as const } : {}),
      ...(typeof record.summarySize === "number" ? { summarySize: record.summarySize } : {}),
      ...(typeof record.reminders === "number" ? { reminders: record.reminders } : {}),
      ...(typeof record.lastReminderAt === "string" ? { lastReminderAt: record.lastReminderAt } : {}),
    };
  } catch {
    return { status: "not_sent" };
  }
}

/**
 * Days after the request email that a still-waiting step counts as overdue: the
 * day the daily run sends its last reminder (`REMINDER_DAYS` in
 * api/_utils/workflowReminder.ts — keep the two in step). From then on nobody
 * is going to be emailed again, so HR has to chase the reviewer directly.
 */
export const OVERDUE_AFTER_DAYS = 7;

/** Malaysian calendar days between two instants, as the daily run counts them. */
export function calendarDaysBetween(from: Date, to: Date): number {
  const offset = 8 * 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((to.getTime() + offset) / dayMs) - Math.floor((from.getTime() + offset) / dayMs);
}

/**
 * How many days a step's request email has gone unanswered, when that is
 * long enough to call it overdue; null otherwise. The caller decides whether
 * the step is still waiting — this reads only the delivery record.
 */
export function overdueDays(delivery: WorkflowEmailStatus, now = new Date()): number | null {
  if (delivery.status !== "sent") return null;
  const sentAt = new Date(delivery.sentAt || delivery.lastAttemptAt);
  if (!Number.isFinite(sentAt.getTime())) return null;
  const days = calendarDaysBetween(sentAt, now);
  return days >= OVERDUE_AFTER_DAYS ? days : null;
}

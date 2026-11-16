/**
 * How a workflow email's state is drawn, shared by All Submissions → Email
 * schedule and Available forms → Emails sent & pending so the two read alike.
 */
import { editorial } from "../../theme/editorial";
import { nextDigestRunAt, type EmailScheduleEntry, type EmailScheduleState } from "../../utils/emailScheduleOverview";

export const STATE_TONE: Record<EmailScheduleState, { bg: string; fg: string }> = {
  held: { bg: editorial.errorSoft, fg: editorial.error },
  failed: { bg: editorial.errorSoft, fg: editorial.error },
  stopped: { bg: editorial.errorSoft, fg: editorial.error },
  "next-summary": { bg: editorial.sky, fg: editorial.navyDeep },
  "next-alone": { bg: editorial.accentSoft, fg: editorial.accentText },
  later: { bg: editorial.blueWash, fg: editorial.muted },
  "sent-summary": { bg: editorial.successSoft, fg: editorial.success },
  "sent-alone": { bg: editorial.successSoft, fg: editorial.success },
};

export function formatWhen(iso: string | undefined): string {
  if (!iso) return "—";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "—";
  return new Date(time).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** When it went, or when it will go. */
export function emailWhenText(entry: EmailScheduleEntry): string {
  return entry.state.startsWith("sent")
    ? `Sent ${formatWhen(entry.sentAt)}`
    : entry.state === "later" ? formatWhen(entry.dueAt)
      : entry.state === "stopped" ? `${entry.attempts} attempts`
        : entry.state === "held" ? "Not sent yet"
          : `Next run · ${formatWhen(nextDigestRunAt().toISOString())}`;
}

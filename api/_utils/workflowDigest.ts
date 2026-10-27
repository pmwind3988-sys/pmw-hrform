/**
 * workflowDigest.ts — one morning email instead of one per submission.
 *
 * A scheduled step (a Training Evaluation three months after the course) falls
 * due for every trainee of a class on the same morning, so their HOD used to
 * wake to a stack of near-identical emails, each with its own link. When the
 * daily run finds two or more signed-in steps due for the same person, it now
 * sends one summary pointing at the "Waiting for me" page, where they can be
 * done one after another.
 *
 * Only **signed-in** links are bundled. A public link's `k` is the reviewer's
 * only way in, so it stays in its own email; and a test run's mail is
 * redirected to its tester, so it is never bundled with real work.
 */
import { parseValidEmailList } from "./layerRecipients.js";
import { renderWorkflowEmail, WORKFLOW_EMAIL_STATUS } from "./workflowEmailTemplate.js";
import type { WorkflowEmailMessage, WorkflowEmailScheduleEntry } from "./workflowEmail.js";

/** The page the summary opens. Signed-in, and lists only the reader's own work. */
export const REVIEW_QUEUE_PATH = "/reviews";

/** Rows printed in one summary; the page holds the rest. */
const MAX_LISTED = 25;

/**
 * Whether a stored review link is the signed-in shape,
 * `/(eval|approval)/{slug}/{id}/{layer}` with no query string.
 *
 * The public shape is `/(eval|approval)/{token}?item=…&k=…`, and anything this
 * does not recognise is treated as not signed-in, so it keeps its own email.
 */
export function isSignedInReviewLink(link: string): boolean {
  const path = String(link || "").trim().replace(/^https?:\/\/[^/]+/i, "");
  return /^\/(?:eval|approval)\/[^/?#]+\/[^/?#]+\/\d+\/?$/.test(path);
}

/** The same set of addresses always gives the same key, in any order or case. */
export function digestRecipientKey(recipient: string): string {
  return parseValidEmailList(recipient).map((email) => email.toLowerCase()).sort().join(";");
}

export interface DigestCandidate {
  formTitle: string;
  itemId: string;
  entry: WorkflowEmailScheduleEntry;
  referenceNo: string;
  applicantName: string;
  /** The course, on a training form, so a line says which class it is about. */
  trainingTitle?: string;
  /**
   * Set when this line is a reminder for a step already emailed, not a new
   * request: which reminder it is and how many days the step has waited.
   * See `workflowReminder.ts`.
   */
  reminder?: { number: number; daysWaiting: number };
}

/** Candidates grouped by who receives them, in the order first seen. */
export function groupDigestCandidates<T extends DigestCandidate>(candidates: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const candidate of candidates) {
    // An entry with no readable address has nobody to bundle with; it goes
    // alone and the single-email path reports whatever is wrong with it.
    const key = digestRecipientKey(candidate.entry.recipient) || `__alone__${candidate.formTitle}#${candidate.itemId}`;
    const group = groups.get(key);
    if (group) group.push(candidate);
    else groups.set(key, [candidate]);
  }
  return Array.from(groups.values());
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function buildWorkflowDigestEmail(params: {
  recipient: string | string[];
  candidates: DigestCandidate[];
  baseUrl: string;
}): WorkflowEmailMessage {
  const { candidates } = params;
  const count = candidates.length;
  const evaluations = candidates.filter((c) => c.entry.layerType === "evaluation").length;
  const noun = evaluations === count
    ? plural(count, "evaluation", "evaluations")
    : evaluations === 0
      ? plural(count, "approval", "approvals")
      : plural(count, "request", "requests");
  const reminders = candidates.filter((c) => c.reminder).length;
  const listed = candidates.slice(0, MAX_LISTED).map((candidate, index) => {
    const course = candidate.trainingTitle?.trim() ? ` · ${candidate.trainingTitle.trim()}` : "";
    const where = candidate.referenceNo
      ? `${candidate.formTitle}${course} · Ref ${candidate.referenceNo}`
      : `${candidate.formTitle}${course} · #${candidate.itemId}`;
    return {
      label: `${index + 1}. ${candidate.applicantName || candidate.entry.submittedBy || `Submission #${candidate.itemId}`}`,
      value: candidate.reminder
        ? `${where} · waiting ${plural(candidate.reminder.daysWaiting, "day", "days")}`
        : where,
    };
  });
  if (count > MAX_LISTED) {
    listed.push({ label: "And more", value: `${count - MAX_LISTED} more on the Waiting for me page` });
  }
  const actionUrl = `${params.baseUrl.replace(/\/$/, "")}${REVIEW_QUEUE_PATH}`;

  return {
    to: params.recipient,
    subject: `${reminders === count ? "Reminder" : "Action Required"}: ${noun} waiting for you`,
    body: renderWorkflowEmail({
      preheader: `${noun} are waiting for you in the PMW HR Portal. Do them all in one sitting.`,
      eyebrow: "Your daily summary",
      status: WORKFLOW_EMAIL_STATUS.actionRequired,
      heading: `${noun} waiting for you`,
      intro: "Instead of one email per submission, here is everything that is now due for you. "
        + "Open the Waiting for me page and work through them one after another. "
        + "Each one opens the next when you submit.",
      callout: reminders > 0
        ? `**${reminders === count ? "These have" : reminders === 1 ? "One of these has" : `${reminders} of these have`} been waiting for a while.** `
          + "We emailed you about them before; the people who submitted them are still waiting for your decision."
        : undefined,
      details: listed,
      actionUrl,
      actionLabel: "Start reviewing",
      portalIdentity: true,
      note: "Sign in with your PMW work account. The page lists only the requests assigned to you.",
    }),
    followUp: true,
  };
}

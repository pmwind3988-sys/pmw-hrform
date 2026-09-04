import type { Submission } from "../types";

/**
 * The three buckets the dashboard counts submissions into.
 *
 * This rule lived inline in `StatsRow`. It moved here because the Dashboard
 * section now states the pending count in prose above the tiles that also show
 * it, and two copies of "what counts as pending" is a defect with a delay on
 * it: the first person to add a status value fixes one and not the other, and
 * the page then contradicts itself in a way no test would catch.
 *
 * WHY THE NORMALISATION IS SO LOOSE. `formStatus` is a free-text SharePoint
 * column, not an enum. `SP_FORM_STATUS` names the five values the app writes
 * (Submitted, In Review, Completed, Rejected, Cancelled) but rows predating it
 * hold "Fully Approved", "fully_approved" and "APPROVED" — so case, spaces,
 * underscores and hyphens are all stripped before comparison, and rejection is
 * matched on a substring.
 *
 * `pending` is the fallback rather than a list of its own values, deliberately:
 * an unrecognised status means the chain has not demonstrably finished, and
 * counting it as pending shows it to someone. Counting it as approved would
 * hide it.
 */
export interface SubmissionBuckets {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
}

export function isApprovedStatus(formStatus: string | null): boolean {
  const status = normalizeStatus(formStatus);
  return status === "fullyapproved" || status === "approved" || status === "completed";
}

export function isRejectedFormStatus(formStatus: string | null): boolean {
  return normalizeStatus(formStatus).includes("reject");
}

function normalizeStatus(formStatus: string | null): string {
  return (formStatus ?? "").toLowerCase().replace(/[\s_-]/g, "");
}

/**
 * Rehearsals are excluded.
 *
 * A test run is a real row in the real list, flagged `IsTest`, and the
 * submissions LIST already hides it -- `submissionMatchesFilters` drops it
 * unless `includeTestRuns` is on. The dashboard tiles were counting the raw
 * array instead, so starting one rehearsal moved the headline from "129
 * visible submissions" to 130 while the list below still showed 129. The
 * count and the thing it counts have to agree, and the launcher promises a
 * test run "will not appear in normal submission listings".
 *
 * Filtered here rather than at each call site so the tiles and the summary
 * line above them cannot drift apart.
 */
export function bucketSubmissions(submissions: Submission[]): SubmissionBuckets {
  let approved = 0;
  let pending = 0;
  let rejected = 0;
  let total = 0;

  for (const submission of submissions) {
    if (submission.isTest) continue;
    total++;
    if (isApprovedStatus(submission.formStatus)) approved++;
    else if (isRejectedFormStatus(submission.formStatus)) rejected++;
    else pending++;
  }

  return { total, approved, pending, rejected };
}

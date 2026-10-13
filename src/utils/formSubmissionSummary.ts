import type { Submission } from "../types";
import { isApprovedStatus, isRejectedFormStatus } from "./submissionStatusBuckets";
import { signOffName } from "./signOff";

/**
 * Per-form counts and per-row labels for the Forms section's grids.
 *
 * Available forms shows, beside every form, how many of its submissions sit in
 * each state; picking a form lists them underneath. Both grids, and My
 * Submissions, describe a row with the same four words, so the rule for which
 * word a row gets lives here once.
 *
 * FOUR STATES, NOT THREE. `bucketSubmissions` folds everything unfinished into
 * "pending", which is right for a headline. A grid someone works from needs to
 * tell "nobody has looked yet" from "someone is on it", because those are
 * different people to chase.
 */
export type SubmissionState = "pending" | "review" | "approved" | "rejected";

export const SUBMISSION_STATE_LABELS: Record<SubmissionState, string> = {
  pending: "Pending",
  review: "In review",
  approved: "Approved",
  rejected: "Rejected",
};

export const SUBMISSION_STATES: SubmissionState[] = ["pending", "review", "approved", "rejected"];

type StateSource = Pick<Submission, "formStatus" | "currentLayer">;

/**
 * "In review" means the request has cleared at least one step. Step 1 still
 * waiting is "Pending": nobody has acted on it at all, which is the case a
 * requester asks about.
 *
 * The stored status is NOT consulted for this: routing writes "In Review" the
 * moment a submission is assigned its first step, so on real data every open
 * row would read "In review" and "Pending" would never appear.
 */
export function submissionState(item: StateSource): SubmissionState {
  if (isApprovedStatus(item.formStatus)) return "approved";
  if (isRejectedFormStatus(item.formStatus)) return "rejected";
  if ((item.currentLayer ?? 0) > 1) return "review";
  return "pending";
}

export interface FormSubmissionSummary {
  pending: number;
  review: number;
  approved: number;
  rejected: number;
  total: number;
  /** ISO time of the newest submission, or null when there are none. */
  lastSubmittedAt: string | null;
}

export function emptyFormSummary(): FormSubmissionSummary {
  return { pending: 0, review: 0, approved: 0, rejected: 0, total: 0, lastSubmittedAt: null };
}

/**
 * Counts keyed by form (the response list title).
 *
 * Test runs are skipped for the same reason `bucketSubmissions` skips them: the
 * lists hide them, and a count that disagrees with the rows beneath it reads as
 * a lost submission.
 */
export function summariseByForm(
  submissions: Pick<Submission, "listTitle" | "formStatus" | "currentLayer" | "submittedAt" | "isTest">[],
): Map<string, FormSubmissionSummary> {
  const byForm = new Map<string, FormSubmissionSummary>();
  for (const item of submissions) {
    if (item.isTest) continue;
    const summary = byForm.get(item.listTitle) ?? emptyFormSummary();
    summary[submissionState(item)]++;
    summary.total++;
    if (item.submittedAt && (!summary.lastSubmittedAt || timeOf(item.submittedAt) > timeOf(summary.lastSubmittedAt))) {
      summary.lastSubmittedAt = item.submittedAt;
    }
    byForm.set(item.listTitle, summary);
  }
  return byForm;
}

function timeOf(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Where an unfinished request is sitting: "Step 2 of 3 · HOD Approval".
 * Empty once it is decided — a finished row is waiting on nobody.
 */
export function waitingAt(item: Pick<Submission, "formStatus" | "currentLayer" | "totalLayers" | "layers">): string {
  const state = submissionState(item);
  if (state === "approved" || state === "rejected") return "";
  const current = item.currentLayer ?? 0;
  if (current < 1) return item.totalLayers > 0 ? "Not started" : "";
  const step = item.totalLayers > 0 ? `Step ${current} of ${item.totalLayers}` : `Step ${current}`;
  const title = item.layers[current - 1]?.layerTitle?.trim();
  return title ? `${step} · ${title}` : step;
}

/**
 * A form's approval steps in order, "Supervisor → HOD → HR", read from its
 * stored `LayerConfig` JSON. A form that branches says so instead of listing
 * one branch as though it were the only route.
 */
export function approvalRouteText(layerConfigJson: string | undefined | null): string {
  if (!layerConfigJson) return "No approval";
  try {
    const parsed = JSON.parse(layerConfigJson) as { layers?: { title?: unknown }[]; manualBranches?: unknown[] };
    if ((parsed.manualBranches?.length ?? 0) > 0) return "Depends on branch";
    const titles = (parsed.layers ?? [])
      .map((layer, index) => (typeof layer.title === "string" && layer.title.trim()) || `Step ${index + 1}`);
    return titles.length > 0 ? titles.join(" → ") : "No approval";
  } catch {
    return "—";
  }
}

export type TrailTone = "done" | "rejected" | "current" | "waiting" | "skipped";

export interface TrailStep {
  step: number;
  role: string;
  decidedBy: string;
  decision: string;
  tone: TrailTone;
  signedAt: string | null;
  remarks: string;
}

/**
 * One line per approval step: who decided, what, when, and why if rejected.
 *
 * A step nobody has acted on says whether it is the one currently waiting or
 * one further down the route, because "pending" on every unreached step reads
 * as though they were all sitting in somebody's inbox at once.
 */
export function approvalTrail(item: Pick<Submission, "formStatus" | "currentLayer" | "layers">): TrailStep[] {
  const finished = submissionState(item) === "approved" || submissionState(item) === "rejected";
  const current = item.currentLayer ?? 0;
  return item.layers.map((layer, index) => {
    const step = index + 1;
    const role = layer?.layerTitle?.trim() || `Step ${step}`;
    const status = layer?.status ?? "pending";
    const decided = status === "approved" || status === "confirmed" || status === "rejected";
    let tone: TrailTone;
    let decision: string;
    if (status === "approved") { tone = "done"; decision = "Approved"; }
    else if (status === "confirmed") { tone = "done"; decision = "Evaluated"; }
    else if (status === "rejected") { tone = "rejected"; decision = "Rejected"; }
    else if (status === "skipped" || status === "cancelled") { tone = "skipped"; decision = status === "skipped" ? "Skipped" : "Cancelled"; }
    else if (!finished && step === current) { tone = "current"; decision = "Waiting"; }
    else { tone = "waiting"; decision = finished ? "Not needed" : "Not reached"; }
    return {
      step,
      role,
      decidedBy: decided ? signOffName(layer?.actedByName, layer?.actedBy || layer?.email) : "",
      decision,
      tone,
      signedAt: decided ? layer?.signedAt ?? null : null,
      remarks: layer?.rejectionReason?.trim() ?? "",
    };
  });
}

/** Whole days since submission, for unfinished rows only; null otherwise. */
export function daysOpen(
  item: Pick<Submission, "formStatus" | "currentLayer" | "submittedAt">,
  now: Date = new Date(),
): number | null {
  const state = submissionState(item);
  if (state === "approved" || state === "rejected") return null;
  if (!item.submittedAt) return null;
  const submitted = new Date(item.submittedAt).getTime();
  if (Number.isNaN(submitted)) return null;
  return Math.max(0, Math.floor((now.getTime() - submitted) / 86_400_000));
}

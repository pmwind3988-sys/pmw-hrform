import { isCompletedFormStatus, isRejectedStatus } from "./workflowStatus";

/** Canonical tab / dropdown order. */
export const LIFECYCLE_STAGES = [
  "pending",
  "in_review",
  "needs_routing",
  "manual_paper",
  "completed",
  "rejected",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export interface LifecycleInput {
  /** Normalised form status (an SP_FORM_STATUS value) when available. */
  formStatus?: string | null;
  /** Legacy free-text Status column, used when formStatus is absent. */
  status?: string | null;
  /** Raw L{n}_Status of the layer currently awaiting action. */
  currentLayerStatus?: string | null;
}

/**
 * The two sentinel statuses written by the API when a layer has no online
 * reviewer and must be handled on paper by HR.
 * Mirrors manualPaperStatusForLayer() in api/submit-form.ts.
 */
export function isManualPaperStatus(value: string | null | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "manual approval required" || normalized === "manual evaluation required";
}

/**
 * Written to `L{n}_Status` when the directory has no answer for a layer. An
 * out-of-band sentinel like the manual-paper pair above, deliberately not part
 * of SP_LAYER_STATUS, which holds only the states the workflow itself moves
 * through. Mirrored as LAYER_NEEDS_ROUTING_STATUS in api/submit-form.ts.
 */
export const NEEDS_ROUTING_LAYER_STATUS = "Needs Routing";

/**
 * The layer resolved to nobody — the directory has no answer for this person
 * yet. The submission is kept and parked here for an admin to route once;
 * it is a question, not a failure, and never a reason to lose a submission.
 */
export function isNeedsRoutingStatus(value: string | null | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === "needs routing";
}

/**
 * Drops one layer's line from the recorded routing reasons.
 *
 * Called when an admin names the person the directory could not supply: the
 * reason explained why the layer was waiting, and once it is no longer waiting
 * the explanation is stale. Any other layer's reason is left untouched, because
 * a submission can park on more than one layer at a time.
 */
export function removeRoutingNoteForLayer(raw: unknown, layerNumber: number): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  const prefix = `Layer ${layerNumber}: `;
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith(prefix))
    .join("\n");
}

/**
 * Collapse a submission's workflow state into one housekeeping stage.
 * Terminal states win, then offline handling, then progress.
 */
export function resolveLifecycleStage(input: LifecycleInput): LifecycleStage {
  const formStatus = input.formStatus ?? input.status ?? "";
  if (isRejectedStatus(formStatus)) return "rejected";
  if (isCompletedFormStatus(formStatus)) return "completed";
  if (isNeedsRoutingStatus(input.currentLayerStatus)) return "needs_routing";
  if (isManualPaperStatus(input.currentLayerStatus)) return "manual_paper";

  const normalized = formStatus.toLowerCase().replace(/[\s_-]/g, "");
  if (normalized.includes("review") || normalized.includes("progress") || normalized.includes("approvedlayer")) {
    return "in_review";
  }
  return "pending";
}

export function lifecycleLabel(stage: LifecycleStage): string {
  const labels: Record<LifecycleStage, string> = {
    pending: "Pending",
    in_review: "In review",
    needs_routing: "Needs routing",
    manual_paper: "Manual / paper",
    completed: "Completed",
    rejected: "Rejected",
  };
  return labels[stage];
}

import { isCompletedFormStatus, isRejectedStatus } from "./workflowStatus";

/** Canonical tab / dropdown order. */
export const LIFECYCLE_STAGES = [
  "pending",
  "in_review",
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
 * Collapse a submission's workflow state into one housekeeping stage.
 * Terminal states win, then offline handling, then progress.
 */
export function resolveLifecycleStage(input: LifecycleInput): LifecycleStage {
  const formStatus = input.formStatus ?? input.status ?? "";
  if (isRejectedStatus(formStatus)) return "rejected";
  if (isCompletedFormStatus(formStatus)) return "completed";
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
    manual_paper: "Manual / paper",
    completed: "Completed",
    rejected: "Rejected",
  };
  return labels[stage];
}

/**
 * layerParkStatus.ts — the two out-of-band step statuses: parked for routing,
 * and handed to paper.
 *
 * Mirrored at `api/_utils/layerParkStatus.ts`; a test keeps the two identical
 * below this header. `submissionLifecycle.ts` re-exports these for the pages.
 */

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

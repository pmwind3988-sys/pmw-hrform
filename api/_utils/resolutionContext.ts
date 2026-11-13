/**
 * resolutionContext.ts — server copy of `src/utils/resolutionContext.ts`.
 *
 * Keep identical below this header; a test asserts it.
 */
import { valueToText, type ResolutionContext } from "./resolveAssignee.js";
import { readOnBehalfOf } from "./layerRecipients.js";

/** The layer that ran before this one, and who acted on it. */
export interface PreviousStep {
  layerNumber: number;
  /** Whoever is acting right now, for when the item has not been patched yet. */
  actedBy?: string;
}

/**
 * Identities for chain routing, read off the stored response item.
 *
 * The previous layer's actor is whoever is acting now when that is known,
 * then `L{n}_ActedBy` where one was recorded, then `L{n}_Email` — public-token
 * and paper layers historically closed without naming anybody, so the assigned
 * address is the best available answer for those.
 */
export function resolutionContextFromItem(
  item: Record<string, unknown>,
  layerNumber: number,
  previousStep?: PreviousStep,
): ResolutionContext {
  const previous = previousStep?.layerNumber ?? layerNumber - 1;
  return {
    submitterEmail: valueToText(item.SubmittedBy),
    previousActorEmail: previous >= 1
      ? previousStep?.actedBy?.trim()
        // A stand-in's decision routes on from the person they stood in for:
        // a PA's own manager is not the CEO's next approver.
        || readOnBehalfOf(item, previous)?.email
        || valueToText(item[`L${previous}_ActedBy`])
        || valueToText(item[`L${previous}_Email`])
      : "",
  };
}

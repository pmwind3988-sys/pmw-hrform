/**
 * workflowChainContext.ts — what a chain layer starts counting from.
 *
 * A layer set to "whoever approved the previous step" needs two facts that the
 * dashboard used to infer, and inferred wrongly in ways that route silently to
 * a real but incorrect approver rather than failing visibly:
 *
 * - **Which layer ran before.** Not always `n - 1`. A manual branch numbers its
 *   layers by their place in the whole workflow, so approving layer 1 can
 *   advance to layer 3; reading layer 2 finds a layer that never ran.
 * - **Who acted on it.** The approve path resolves the next layer before it
 *   patches `L{n}_ActedBy`, from a copy of the item read earlier still. The
 *   stored fallback is `L{n}_Email` — only the primary of a shared layer — so
 *   the chain would follow the wrong person whenever somebody else approved.
 *
 * Kept apart from ApprovalDashboard.tsx because both are pure and both are
 * worth pinning: the failure they guard against is invisible at the point it
 * happens and only shows up as an approval sitting with the wrong person.
 */
import type { PreviousStep } from "../../utils/resolutionContext";

// Moved to src/utils so the server can share them; re-exported for existing importers.
export { resolutionContextFromItem, type PreviousStep } from "../../utils/resolutionContext";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A SharePoint cell reduced to text, looking inside the shapes it wraps values in. */
export function valueToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (isRecord(value)) {
    for (const key of ["email", "Email", "value", "Value", "text", "Title"]) {
      const next = value[key];
      if (typeof next === "string" && next.trim()) return next.trim();
    }
  }
  return "";
}

/**
 * The layer immediately before `layerNumber` in this workflow, or undefined
 * when it is the first. Counterpart to `getNextWorkflowLayer`.
 *
 * Works off position in the sorted list rather than arithmetic, so a workflow
 * whose numbers skip resolves to the layer that actually ran.
 */
export function getPreviousWorkflowLayer<T extends { layerNumber: number }>(
  layers: T[] | null | undefined,
  layerNumber: number,
): T | undefined {
  if (!layers?.length) return undefined;
  const sorted = [...layers].sort((a, b) => a.layerNumber - b.layerNumber);
  const index = sorted.findIndex((layer) => layer.layerNumber === layerNumber);
  const earlier = index === -1
    ? sorted.filter((layer) => layer.layerNumber < layerNumber)
    : sorted.slice(0, index);
  return earlier[earlier.length - 1];
}

/**
 * What `layerNumber` should start from, given the workflow it sits in.
 *
 * Undefined when there is no earlier layer or the shape is unknown, which
 * leaves the `n - 1` reading in place rather than inventing an answer.
 */
export function previousStepFor<T extends { layerNumber: number }>(
  layers: T[] | null | undefined,
  layerNumber: number,
  actedBy?: string,
): PreviousStep | undefined {
  const previous = getPreviousWorkflowLayer(layers, layerNumber);
  return previous ? { layerNumber: previous.layerNumber, actedBy } : undefined;
}

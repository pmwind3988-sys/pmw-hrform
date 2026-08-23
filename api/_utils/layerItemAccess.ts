/**
 * Whether one submission may be reached through one workflow layer.
 *
 * A public approval/evaluation link carries a token that identifies the
 * *layer*, and the submission id travels beside it in the query string
 * (`/approval/<token>?item=<id>` — see `workflowLink.ts`). One token is minted
 * per layer and reused for every submission to that form, so the id is the only
 * thing separating the submission the recipient was sent from every other one.
 *
 * The act path has always checked that the two belong together. The read path
 * did not, which meant anybody holding a single link could increment the id and
 * read every submission to the form. Both now come through here, so the answer
 * cannot drift between "what you may look at" and "what you may approve".
 *
 * This is a narrowing, not a fix for the underlying shape: while the token is
 * per-layer rather than per-submission, submissions sitting at the same layer
 * at the same time remain reachable from one another's links. Binding the link
 * to the item is the real repair, and it invalidates every link already in an
 * inbox — a separate, scheduled change.
 */

export type LayerItemAccessDenial = "already-completed" | "not-current-layer";

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]/g, "");
}

/** Outcomes recorded in `L{n}_Status` that mean the layer is finished with. */
export function isTerminalLayerStatus(value: unknown): boolean {
  const normalized = normalizeStatus(value);
  return ["approved", "confirmed", "rejected", "skipped", "cancelled"].includes(normalized)
    || normalized.includes("reject");
}

/** States in `FormStatus`/`Status` that mean the submission itself is closed. */
export function isTerminalFormStatus(value: unknown): boolean {
  return ["completed", "rejected", "cancelled", "fullyapproved"].includes(normalizeStatus(value));
}

/**
 * `null` means the caller may proceed. Anything else names why not, leaving the
 * wording to the caller: a refused read is a 403, a refused write a 409.
 */
export function denyLayerItemAccess(params: {
  layerNumber: number;
  currentLayer: unknown;
  layerStatus: unknown;
  formStatus: unknown;
}): LayerItemAccessDenial | null {
  if (isTerminalFormStatus(params.formStatus) || isTerminalLayerStatus(params.layerStatus)) {
    return "already-completed";
  }

  // Rows written before `CurrentLayer` existed carry nothing here. A missing
  // marker has always been read as "no opinion" rather than a refusal, and
  // tightening only this side would leave a row that can be approved but not
  // read.
  const currentLayer = Number(params.currentLayer) || 0;
  if (currentLayer && currentLayer !== params.layerNumber) return "not-current-layer";

  return null;
}

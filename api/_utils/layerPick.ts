/**
 * layerPick.ts — which layer config a numbered step means on one submission.
 *
 * Shared by the reviewer endpoint and the "Waiting for me" queue, which must
 * agree on it: a queue that pointed at a different step than the page then
 * opens would list work the reviewer is refused.
 */

/**
 * The layer a signed-in reviewer is asking for, honouring the branch the
 * submission was routed down.
 *
 * A public link names its layer with the token, so the public path never needs
 * this. A signed-in link carries the layer *number*, which on a branched form
 * can describe a different step per branch — so the number alone is not enough.
 */
export function pickLayerByNumber(
  config: { layers?: Record<string, unknown>[]; manualBranches?: { name?: string; label?: string; layers?: Record<string, unknown>[] }[] } | null,
  selectedBranch: string,
  layerNumber: number,
): Record<string, unknown> | null {
  if (!config || !layerNumber) return null;
  const branchKey = selectedBranch.trim().toLowerCase();
  if (branchKey && config.manualBranches?.length) {
    const branch = config.manualBranches.find((entry) =>
      [entry.name, entry.label].some((candidate) =>
        typeof candidate === "string" && candidate.trim().toLowerCase() === branchKey));
    const onBranch = branch?.layers?.find((layer) => Number(layer.layerNumber) === layerNumber);
    if (onBranch) return onBranch;
  }
  return (config.layers ?? []).find((layer) => Number(layer.layerNumber) === layerNumber) ?? null;
}


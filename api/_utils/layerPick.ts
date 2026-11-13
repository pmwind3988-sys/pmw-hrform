/**
 * layerPick.ts — which layer config a numbered step means on one submission.
 *
 * Shared by the reviewer endpoint and the "Waiting for me" queue, which must
 * agree on it: a queue that pointed at a different step than the page then
 * opens would list work the reviewer is refused.
 */

type BranchedLayerConfig = {
  layers?: Record<string, unknown>[];
  manualBranches?: { name?: string; label?: string; layers?: Record<string, unknown>[] }[];
} | null;

/**
 * The layers of the branch a submission was routed down (matched by name or
 * label, case-insensitively), or null when it names none of them.
 */
export function branchLayers(config: BranchedLayerConfig, selectedBranch: string): Record<string, unknown>[] | null {
  const branchKey = selectedBranch.trim().toLowerCase();
  if (!config || !branchKey || !config.manualBranches?.length) return null;
  const branch = config.manualBranches.find((entry) =>
    [entry.name, entry.label].some((candidate) =>
      typeof candidate === "string" && candidate.trim().toLowerCase() === branchKey));
  return branch?.layers ?? null;
}

/**
 * The layer a signed-in reviewer is asking for, honouring the branch the
 * submission was routed down.
 *
 * A public link names its layer with the token, so the public path never needs
 * this. A signed-in link carries the layer *number*, which on a branched form
 * can describe a different step per branch — so the number alone is not enough.
 */
export function pickLayerByNumber(
  config: BranchedLayerConfig,
  selectedBranch: string,
  layerNumber: number,
): Record<string, unknown> | null {
  if (!config || !layerNumber) return null;
  const onBranch = branchLayers(config, selectedBranch)?.find((layer) => Number(layer.layerNumber) === layerNumber);
  if (onBranch) return onBranch;
  return (config.layers ?? []).find((layer) => Number(layer.layerNumber) === layerNumber) ?? null;
}


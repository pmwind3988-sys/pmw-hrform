/**
 * workflowReviewLink.ts — finds the layer a workflow notice is about, so the
 * link in that notice can be built for the right one.
 *
 * `workflowLink.ts` builds the URL but has to be told what the layer is:
 * approval or evaluation, sign-in or public, and which public token. That comes
 * out of the form's saved layer configuration, and picking the right entry is
 * not simply "the layer with this number" — a form with manual branches defines
 * a layer 2 per branch, and only the branch this submission was routed down
 * describes the person actually being emailed.
 *
 * When the submission has not recorded a branch yet, the number alone can match
 * several entries. If those entries disagree about what the link should be, no
 * link is returned rather than a guessed one: a notice with no button is a
 * nuisance, a notice pointing at the wrong layer is a hole.
 */
import { getActiveLayers } from "../components/builder/approvalDashboardLayerProgress";
import type { LayerConfigItem, ManualBranch } from "../types";

export interface ParsedLayerConfig {
  layers: LayerConfigItem[];
  manualBranches?: ManualBranch[];
}

/** `LayerConfig` as stored on Master Form — a JSON string, or already parsed. */
export function parseLayerConfig(raw: unknown): ParsedLayerConfig | null {
  let value: unknown = raw;
  if (typeof value === "string") {
    if (!value.trim()) return null;
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as { layers?: unknown; manualBranches?: unknown };
  const layers = Array.isArray(record.layers) ? record.layers as LayerConfigItem[] : [];
  const manualBranches = Array.isArray(record.manualBranches)
    ? record.manualBranches as ManualBranch[]
    : undefined;
  if (!layers.length && !manualBranches?.length) return null;
  return manualBranches ? { layers, manualBranches } : { layers };
}

/** What two candidate layers must agree on before either may build the link. */
function linkShape(layer: LayerConfigItem): string {
  return [
    String(layer.type || ""),
    String(layer.authMode || ""),
    String(layer.publicToken || ""),
  ].join("|");
}

/**
 * The layer a notice for `layerNumber` is about, or `undefined` when the
 * configuration cannot say for certain.
 */
export function selectWorkflowLayer(
  rawLayerConfig: unknown,
  selectedBranch: string | undefined,
  layerNumber: number,
): LayerConfigItem | undefined {
  const parsed = parseLayerConfig(rawLayerConfig);
  if (!parsed || !Number.isFinite(layerNumber) || layerNumber <= 0) return undefined;

  // The branch this submission was routed down, when it has one, describes the
  // layer that was actually assigned.
  const active = getActiveLayers(parsed, selectedBranch);
  const onBranch = active.find((layer) => Number(layer.layerNumber) === layerNumber);
  if (onBranch) return onBranch;

  // No branch recorded: every branch that defines this layer is a candidate.
  const candidates = [
    ...parsed.layers,
    ...(parsed.manualBranches ?? []).flatMap((branch) => branch.layers ?? []),
  ].filter((layer) => Number(layer.layerNumber) === layerNumber);
  if (!candidates.length) return undefined;

  const shape = linkShape(candidates[0]);
  return candidates.every((layer) => linkShape(layer) === shape) ? candidates[0] : undefined;
}

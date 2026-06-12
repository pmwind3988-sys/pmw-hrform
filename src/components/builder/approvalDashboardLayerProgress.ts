import type { LayerConfigItem, ManualBranch } from "../../types";

export interface LayerConfigSource {
  layers?: LayerConfigItem[];
  manualBranches?: ManualBranch[];
}

export interface LayerProgressItem {
  CurrentApprovalLayer?: number;
  CurrentLayer?: number;
  L1_Status?: string;
  totalLayers?: number;
}

function normalizeLayerCount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

/** Get the active layer sequence, respecting manual branch selection. */
export function getActiveLayers(
  layerConfig: LayerConfigSource | null | undefined,
  selectedBranch?: string,
): LayerConfigItem[] {
  if (!layerConfig) return [];
  if (layerConfig.manualBranches?.length && selectedBranch) {
    const branch = layerConfig.manualBranches.find((b) => b.name === selectedBranch);
    if (branch) return branch.layers;
  }
  return layerConfig.layers || [];
}

export function resolveTotalLayerCount(
  layerConfig: LayerConfigSource | null | undefined,
  selectedBranch: string | undefined,
  legacyLayerCount: number | null | undefined,
): number {
  const activeLayers = getActiveLayers(layerConfig, selectedBranch);
  if (activeLayers.length > 0) return activeLayers.length;
  return normalizeLayerCount(legacyLayerCount);
}

export function formatLayerProgress(item: LayerProgressItem): string {
  const rawLayer = item.CurrentLayer || item.CurrentApprovalLayer;
  const inferredLayer = item.L1_Status && !["", "Pending"].includes(item.L1_Status) ? 2 : 1;
  const currentLayer = rawLayer || inferredLayer || 1;
  const totalLayers = normalizeLayerCount(item.totalLayers);
  return `Layer ${currentLayer} of ${totalLayers || "?"}`;
}

import { SP_FORM_STATUS, SP_LAYER_STATUS } from "./statusConstants";

export function rejectedAtLayerStatus(layerNumber: number): string {
  return `Rejected at Layer ${layerNumber}`;
}

export function isRejectedStatus(status: string | null | undefined): boolean {
  return (status ?? "").toLowerCase().includes("reject");
}

export function isCompletedFormStatus(status: string | null | undefined): boolean {
  const normalized = (status ?? "").toLowerCase().replace(/[\s_-]/g, "");
  return normalized === "approved" || normalized === "completed" || normalized === "fullyapproved";
}

export function isTerminalLayerStatus(status: string | null | undefined): boolean {
  const normalized = (status ?? "").toLowerCase().replace(/[\s_-]/g, "");
  return (
    normalized === "approved" ||
    normalized === "confirmed" ||
    normalized === "skipped" ||
    normalized === "cancelled" ||
    normalized.includes("reject")
  );
}

export function buildRejectedWorkflowPatch(
  rejectedLayer: number,
  totalLayers: number,
  signedAt: string,
  reason?: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    Status: SP_FORM_STATUS.REJECTED,
    FormStatus: SP_FORM_STATUS.REJECTED,
    CurrentLayer: rejectedLayer,
    CurrentApprovalLayer: rejectedLayer,
    [`L${rejectedLayer}_Status`]: SP_LAYER_STATUS.REJECTED,
    [`L${rejectedLayer}_SignedAt`]: signedAt,
  };

  if (reason !== undefined) {
    patch[`L${rejectedLayer}_Rejection`] = reason;
  }

  for (let layer = rejectedLayer + 1; layer <= totalLayers; layer++) {
    patch[`L${layer}_Status`] = rejectedAtLayerStatus(rejectedLayer);
  }

  return patch;
}

export function shouldGenerateTerminalPdf(args: {
  formStatus?: string | null;
  currentLayer?: number;
  totalLayers: number;
  layerStatuses?: (string | null | undefined)[];
}): boolean {
  if (isRejectedStatus(args.formStatus) || isCompletedFormStatus(args.formStatus)) return true;
  if (args.layerStatuses?.some(isRejectedStatus)) return true;
  if (args.layerStatuses?.length && args.layerStatuses.every(isTerminalLayerStatus)) return true;
  return args.totalLayers > 0 && (args.currentLayer ?? 0) >= args.totalLayers && isCompletedFormStatus(args.formStatus);
}

/** defaultTemplate.ts — The built-in layout expressed as blocks. */
import type { PdfTemplate, SmartBlockType } from "./types";

export const DEFAULT_SMART_ORDER: SmartBlockType[] = [
  "header",
  "documentControl",
  "statusBadge",
  "submissionMeta",
  "answers",
  "approvals",
  "signatures",
  "evaluationDetails",
  "isoStandards",
];

export function buildDefaultTemplate(): PdfTemplate {
  return {
    version: 1,
    blocks: DEFAULT_SMART_ORDER.map((smart) => ({ id: `default-${smart}`, kind: "smart" as const, smart })),
  };
}

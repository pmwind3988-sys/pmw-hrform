/** blockNames.ts — Human names for block kinds, shared by BlockList and BlockSettings. */
import type { PdfBlock, SmartBlockType } from "../../../utils/pdfTemplate/types";

const SMART_NAMES: Record<SmartBlockType, string> = {
  header: "Header",
  documentControl: "Document control",
  statusBadge: "Status badge",
  submissionMeta: "Submission details",
  answers: "Answers table",
  approvals: "Approval chain",
  signatures: "Signatures",
  evaluationDetails: "Evaluation details",
  isoStandards: "ISO standards",
};

const CONTENT_NAMES: Record<Exclude<PdfBlock["kind"], "smart">, string> = {
  text: "Text",
  table: "Table",
  image: "Image",
  divider: "Divider",
  spacer: "Spacer",
  pageBreak: "Page break",
};

/** The `pdfConfig` switch that hides/shows each smart block, for the settings-rail note. */
export const SMART_CONFIG_SWITCH: Partial<Record<SmartBlockType, string>> = {
  statusBadge: "showStatusBadge",
  submissionMeta: "showSubmissionDate",
  approvals: "showApproverChain",
  signatures: "showSignatures",
  evaluationDetails: "showEvaluationDetails",
};

export function blockDisplayName(block: PdfBlock): string {
  if (block.kind === "smart") return SMART_NAMES[block.smart] ?? block.smart;
  return CONTENT_NAMES[block.kind] ?? block.kind;
}

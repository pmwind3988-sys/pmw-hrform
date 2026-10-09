/**
 * publishDefaults.ts — what a newly published form carries when its author has
 * not set it. Shared by the builder and the file import (`formImport.ts`) so a
 * form published either way starts out the same.
 */
import type { DocumentControlHeader, PdfConfig } from "../types";
import { editorial } from "../theme/editorial";

export const DEFAULT_COMPANIES = [
  "PMW INDUSTRIES SDN BHD",
  "PMW CONCRETE INDUSTRIES SDN BHD",
  "PMW LIGHTING INDUSTRIES SDN BHD",
  "PMW WINABUMI SDN BHD",
].join("\n");

export const DEFAULT_ISO_STANDARDS = "ISO 9001 · ISO 14001 · ISO 45001";

export const DEFAULT_PDF_CONFIG: PdfConfig = {
  enabled: true,
  title: "Form Submission",
  deliveryMethod: "sharepoint",
  showSubmissionDate: true,
  showApproverChain: true,
  showEvaluationDetails: true,
  showSignatures: true,
  showStatusBadge: true,
  includeEmptyEvaluationFields: false,
  density: "compact",
  primaryColor: editorial.pmwBlue,
  secondaryColor: editorial.pmwPurple,
};

export const DEFAULT_DOCUMENT_HEADER: DocumentControlHeader = {
  documentNumber: "",
  issueNumber: "",
  effectiveDate: "",
  revisionNumber: "",
  revisionDate: "",
};

/** Fills a blank document number and revision from the form ID and version. */
export function withDocumentHeaderDefaults(header: DocumentControlHeader, formId: string, version: string): DocumentControlHeader {
  return {
    ...DEFAULT_DOCUMENT_HEADER,
    ...header,
    documentNumber: header.documentNumber?.trim() || formId.trim(),
    revisionNumber: header.revisionNumber?.trim() || version.trim(),
  };
}

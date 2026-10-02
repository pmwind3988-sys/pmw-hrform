/** context.ts — The derived values every PDF section reads. */
import { buildFormSubmissionSections, type FormSubmissionSection } from "../formSubmissionLayout";
import { getSelectedCompany } from "../companySelection";
import { REFERENCE_NO_FIELD } from "../referenceNumber";
import { C } from "./styles";
import type { PdfFormData } from "../FormPdfDocument";
import type { PdfConfig } from "../../types";

export interface PdfSectionContext {
  data: PdfFormData;
  formSections: FormSubmissionSection[];
  title: string;
  primary: string;
  secondary: string;
  comfortable: boolean;
  referenceNo: string;
  selectedCompany: string;
  effectiveLogoUrl?: string;
  layoutConfig?: PdfConfig;
  /** Draw-time bookkeeping shared by the sections of one document. */
  state: { evaluationDrawn: boolean };
}

// Every form has carried one of these as its stored primary colour: they are
// the builder's old defaults, not a choice anybody made, so they print as the
// house navy. Any other colour is deliberate and is honoured.
const LEGACY_PRIMARY = new Set(["#0078d4", "#0f3d91", "#1e4fa0"]);

function customColour(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed && !LEGACY_PRIMARY.has(trimmed.toLowerCase()) ? trimmed : "";
}

// The title is the form's own name; the generic "Form Submission" default
// carries no information and is never printed over it.
function documentTitle(configured: string | undefined, formTitle: string, surveyTitle: string | undefined): string {
  const custom = (configured ?? "").trim();
  if (custom && custom.toLowerCase() !== "form submission") return custom;
  return formTitle || surveyTitle || "";
}

export function buildPdfSectionContext(data: PdfFormData): PdfSectionContext {
  const { surveyJson, responseData, meta, logoUrl, pdfConfig } = data;
  const layoutConfig = pdfConfig?.enabled === false ? undefined : pdfConfig;
  return {
    data,
    formSections: buildFormSubmissionSections(surveyJson, responseData, {
      fallbackSectionTitle: "Main Page",
      includeAdditionalFields: false,
    }),
    title: documentTitle(layoutConfig?.title, meta.formTitle, surveyJson?.title),
    primary: customColour(layoutConfig?.primaryColor) || C.primary,
    secondary: layoutConfig?.secondaryColor?.trim() || C.secondary,
    comfortable: layoutConfig?.density === "comfortable",
    referenceNo: (meta.referenceNo || String(responseData?.[REFERENCE_NO_FIELD] ?? "")).trim(),
    selectedCompany: getSelectedCompany(responseData, surveyJson),
    effectiveLogoUrl: layoutConfig?.headerLogoUrl?.trim() || logoUrl,
    layoutConfig,
    state: { evaluationDrawn: false },
  };
}

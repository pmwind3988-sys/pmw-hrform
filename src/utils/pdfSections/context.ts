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
    title: layoutConfig?.title?.trim() || surveyJson?.title || meta.formTitle,
    primary: layoutConfig?.primaryColor?.trim() || C.primary,
    secondary: layoutConfig?.secondaryColor?.trim() || C.secondary,
    comfortable: layoutConfig?.density === "comfortable",
    referenceNo: (meta.referenceNo || String(responseData?.[REFERENCE_NO_FIELD] ?? "")).trim(),
    selectedCompany: getSelectedCompany(responseData, surveyJson),
    effectiveLogoUrl: layoutConfig?.headerLogoUrl?.trim() || logoUrl,
    layoutConfig,
  };
}

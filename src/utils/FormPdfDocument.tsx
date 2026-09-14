/**
 * FormPdfDocument.tsx — Corporate-style PDF for form submissions with approval/evaluation layers.
 */
import { Document, Page } from "@react-pdf/renderer";
import { S } from "./pdfSections/styles";
import { buildPdfSectionContext } from "./pdfSections/context";
import {
  HeaderSection,
  DocumentControlSection,
  StatusBadgeSection,
  SubmissionMetaSection,
  AnswersSection,
  ApprovalsSection,
  SignaturesSection,
  EvaluationDetailsSection,
  IsoStandardsSection,
  FooterChrome,
} from "./pdfSections/sections";
import type { DocumentControlHeader, PdfConfig } from "../types";
// ── Types ─────────────────────────────────────────────────────────────────

export interface PdfFormData {
  surveyJson: {
    title?: string;
    description?: string;
    pages?: { name?: string; elements: Record<string, unknown>[] }[];
  };
  responseData: Record<string, unknown>;
  meta: {
    submittedBy: string;
    submittedAt: string;
    formTitle: string;
    formVersion: string;
    formStatus?: string;
    /** `[PREFIX-]DDMMYY-NNNN`, when the form issues reference numbers. */
    referenceNo?: string;
  };
  /** Layer results: each entry is one layer's data */
  layerResults?: PdfLayerResult[];
  isoStandards?: string;
  logoUrl?: string;
  pdfConfig?: PdfConfig;
  /** Document control header for the specific published profile. */
  documentHeader?: DocumentControlHeader;
}

export interface PdfLayerResult {
  layerNumber: number;
  type: "approval" | "evaluation";
  status: string;
  email: string;
  signedAt?: string;
  rejection?: string;
  signature?: string;
  /** For evaluation layers: submitted field values */
  evaluationFields?: Record<string, unknown>;
  /** Evaluation SurveyJS elements used to render labels and field-aware values */
  evaluationSurveyElements?: Record<string, unknown>[];
  /** For evaluation layers: confirmer name/email */
  confirmerEmail?: string;
  confirmerName?: string;
}

// ── Main Document ─────────────────────────────────────────────────────────

export default function FormPdfDocument(data: PdfFormData) {
  const ctx = buildPdfSectionContext(data);
  return (
    <Document>
      <Page size="A4" style={[S.page, ctx.comfortable ? { fontSize: 9.3, lineHeight: 1.35 } : {}]}>
        {HeaderSection({ ctx })}
        {DocumentControlSection({ ctx })}
        {StatusBadgeSection({ ctx })}
        {SubmissionMetaSection({ ctx })}
        {AnswersSection({ ctx })}
        {ApprovalsSection({ ctx })}
        {SignaturesSection({ ctx })}
        {EvaluationDetailsSection({ ctx })}
        {IsoStandardsSection({ ctx })}
        {FooterChrome({ ctx })}
      </Page>
    </Document>
  );
}

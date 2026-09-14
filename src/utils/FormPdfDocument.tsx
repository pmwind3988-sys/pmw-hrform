/**
 * FormPdfDocument.tsx — Corporate-style PDF for form submissions with approval/evaluation layers.
 */
import { Document, Page } from "@react-pdf/renderer";
import { S } from "./pdfSections/styles";
import { buildPdfSectionContext } from "./pdfSections/context";
import type { PdfSectionContext } from "./pdfSections/context";
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
import { readTemplate } from "./pdfTemplate/safeTemplate";
import { TemplateBody } from "./pdfTemplate/renderTemplate";
import type { PdfTemplate } from "./pdfTemplate/types";
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
  /** Per-form block layout; falls back to the built-in layout when absent. */
  pdfTemplate?: PdfTemplate;
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

// Sections are composed by direct function call, not JSX (`{Section({ ctx })}`
// rather than `<Section ctx={ctx} />`). renderToJson in testSupport.tsx reads
// .type/.props/.children off the literal element without invoking function
// components, so a JSX element would serialize as an opaque unresolved node
// and fail to match the characterisation snapshot. This is safe because no
// section uses hooks. Do not "clean up" back to JSX.
// Returns a plain array, not a JSX fragment: a <>...</> wrapper is itself an
// element and would add an extra node around the nine sections, breaking
// equivalence with the templated path (see renderTemplate.tsx's TemplateBody).
function BuiltInBody({ ctx }: { ctx: PdfSectionContext }) {
  return [
    HeaderSection({ ctx }),
    DocumentControlSection({ ctx }),
    StatusBadgeSection({ ctx }),
    SubmissionMetaSection({ ctx }),
    AnswersSection({ ctx }),
    ApprovalsSection({ ctx }),
    SignaturesSection({ ctx }),
    EvaluationDetailsSection({ ctx }),
    IsoStandardsSection({ ctx }),
  ];
}

export default function FormPdfDocument(data: PdfFormData) {
  const ctx = buildPdfSectionContext(data);
  const template = readTemplate(data.pdfTemplate);
  return (
    <Document>
      <Page size="A4" style={[S.page, ctx.comfortable ? { fontSize: 9.3, lineHeight: 1.35 } : {}]}>
        {[...(template ? TemplateBody({ template, ctx }) : BuiltInBody({ ctx })), FooterChrome({ ctx, footer: template?.footer })]}
      </Page>
    </Document>
  );
}

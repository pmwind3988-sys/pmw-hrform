/**
 * submissionPaperView.ts — The paper-form layout for a submission shown on
 * screen, built from what the dashboard and the reviewer page already hold
 * rather than from a fresh SharePoint read.
 *
 * Used for the Training Evaluation Form only (`isTrainingEvaluationForm`), the
 * one form whose screen view follows its Word form. Pure: no React, no PDF.
 */
import type { ApprovalLayerResult, EvaluationLayerResult, Submission } from "../../types";
import type { PdfFormData, PdfLayerResult } from "../FormPdfDocument";
import { formatPdfDateTimeValue } from "../pdfFieldFormatting";
import { responseKeyForQuestion } from "../formSubmissionLayout";
import { buildPaperDocument, type PaperDocument } from "./paperLayout";
import { questionsMatchingAnswers } from "../evaluationQuestionMatch";

type El = Record<string, unknown>;

function isRecord(value: unknown): value is El {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function day(iso: string): string {
  const formatted = formatPdfDateTimeValue(iso, false);
  return formatted === iso || formatted === "—" ? "" : formatted;
}

function dateTime(iso: string): string {
  const formatted = formatPdfDateTimeValue(iso, true);
  return formatted === "—" ? "" : formatted;
}

/** Every question name a published form asks, panels and nested containers included. */
export function surveyQuestionNames(surveyJson: unknown): Set<string> {
  const names = new Set<string>();
  const visit = (element: unknown) => {
    if (!isRecord(element)) return;
    if (typeof element.name === "string" && element.name.trim()) names.add(element.name.trim());
    for (const key of ["elements", "templateElements", "questions", "pages"]) {
      const children = element[key];
      if (Array.isArray(children)) children.forEach(visit);
    }
    if (Array.isArray(element.columns)) {
      for (const column of element.columns) if (isRecord(column) && Array.isArray(column.elements)) column.elements.forEach(visit);
    }
  };
  visit(surveyJson);
  return names;
}

/**
 * The keys of a response row that answer one of the form's questions — the
 * question names themselves, and any stored under a name SharePoint cut short.
 * Everything else in the row is "more details".
 */
export function surveyAnswerKeys(surveyJson: unknown, responseData: Record<string, unknown>): Set<string> {
  const keys = surveyQuestionNames(surveyJson);
  for (const name of [...keys]) {
    const stored = responseKeyForQuestion(responseData, name);
    if (stored) keys.add(stored);
  }
  return keys;
}

/** The evaluation questions a layer asked, read off the form's layer configuration. */
function evaluationElementsFor(layerConfig: unknown, layerNumber: number): El[] | undefined {
  if (!isRecord(layerConfig)) return undefined;
  const branches = Array.isArray(layerConfig.manualBranches) ? layerConfig.manualBranches.filter(isRecord) : [];
  const layers = [
    ...(Array.isArray(layerConfig.layers) ? layerConfig.layers : []),
    ...branches.flatMap((b) => (Array.isArray(b.layers) ? b.layers : [])),
  ].filter(isRecord);
  const layer = layers.find((l) => Number(l.layerNumber) === layerNumber && l.type === "evaluation");
  return layer && Array.isArray(layer.surveyElements) ? layer.surveyElements.filter(isRecord) : undefined;
}

function layerResult(layer: ApprovalLayerResult | EvaluationLayerResult, layerConfigs: readonly unknown[]): PdfLayerResult {
  const shared = {
    layerNumber: layer.layerNumber,
    status: layer.rawStatus || layer.status,
    signerName: layer.actedByName || undefined,
    signerPosition: layer.actedByPosition || undefined,
    onBehalfOf: layer.onBehalfOf ?? undefined,
    layerTitle: layer.layerTitle || undefined,
  };
  if (layer.type === "evaluation") {
    return {
      ...shared,
      type: "evaluation",
      email: layer.actedBy || layer.email || "",
      signedAt: layer.signedAt || layer.confirmedAt || undefined,
      signerName: shared.signerName || layer.confirmerName || undefined,
      signOffDate: layer.signOffDate || undefined,
      signature: layer.signature || undefined,
      evaluationFields: layer.fields ?? {},
      // The submission's own link first; the live setup for answers saved
      // against it. See evaluationQuestionMatch.ts.
      evaluationSurveyElements: questionsMatchingAnswers(
        layerConfigs.map((config) => evaluationElementsFor(config, layer.layerNumber)),
        layer.fields,
      ),
    };
  }
  return {
    ...shared,
    type: "approval",
    email: layer.actedBy || layer.email || "",
    signedAt: layer.signedAt || undefined,
    rejection: layer.rejectionReason || undefined,
    signature: layer.signature || undefined,
  };
}

interface PaperViewInput {
  title: string;
  surveyJson: unknown;
  responseData: Record<string, unknown>;
  submittedBy?: string;
  submittedAt?: string | null;
  formStatus?: string | null;
  formVersion?: string;
  referenceNo?: string;
  layerResults?: PdfLayerResult[];
}

/** The paper layout for any set of answers — the reviewer page uses this directly. */
export function paperDocumentFromAnswers(input: PaperViewInput): PaperDocument {
  const data: PdfFormData = {
    surveyJson: (isRecord(input.surveyJson) ? input.surveyJson : { pages: [] }) as PdfFormData["surveyJson"],
    responseData: input.responseData,
    layerResults: input.layerResults ?? [],
    meta: {
      submittedBy: input.submittedBy ?? "",
      submittedAt: input.submittedAt ?? "",
      formTitle: input.title,
      formVersion: input.formVersion ?? "",
      formStatus: input.formStatus ?? "",
      referenceNo: input.referenceNo,
    },
  };
  // The screen has no document-control values to show; they live in the PDF.
  return buildPaperDocument(data, { fmtDay: day, fmtDateTime: dateTime, control: [], title: input.title });
}

/** The paper layout of a dashboard submission, workflow steps included. */
export function paperDocumentFromSubmission(item: Submission, submissionData: Record<string, unknown>): PaperDocument {
  const layers = (item.enhancedLayers ?? []).filter((l): l is ApprovalLayerResult | EvaluationLayerResult => l !== null);
  return paperDocumentFromAnswers({
    title: item.listTitle,
    surveyJson: item.surveyJson,
    responseData: submissionData,
    submittedBy: item.submitterName || item.submittedByEmail,
    submittedAt: item.submittedAt,
    formStatus: item.formStatus,
    formVersion: item.formVersion,
    referenceNo: item.referenceNo,
    layerResults: layers.map((l) => layerResult(l, [item.versionLayerConfig, item.layerConfig])),
  });
}

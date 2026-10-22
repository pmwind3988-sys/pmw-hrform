/**
 * submissionPdfData.ts — rebuilding a stored submission's PDF input from
 * SharePoint: the published form version, the response row and its layer
 * results. Shared by All Submissions and the /forms detail popup, which both
 * offer the paper-form design beside the stored PDF.
 */
import { spGet, getFormConfigByTitle } from "./formBuilderSP";
import type { PdfFormData } from "./FormPdfDocument";
import { REFERENCE_NO_FIELD } from "./referenceNumber";
import { readTemplate } from "./pdfTemplate/safeTemplate";
import { isRecord } from "../components/builder/workflowChainContext";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

/** The few fields of a response row needed to find and redraw its PDF. */
export interface PdfSubmissionRef {
  /** The form's title, which is also its response list's title. */
  Title: string;
  /** The response list item id. */
  Id: number;
  FormVersion?: string;
  PublishKey?: string;
  SubmittedBy?: string;
  SubmittedAt?: string;
  FormStatus?: string;
  Status?: string;
}

export async function getVersionSurveyJson(
  token: string,
  formTitle: string,
  formVersion: string,
  publishKey?: string,
): Promise<string | undefined> {
  const baseFilter = `FormTitle eq '${encodeURIComponent(formTitle)}' and FormVersion eq '${encodeURIComponent(formVersion)}'`;
  const getByFilter = async (filter: string): Promise<{ value?: { SurveyJSON?: string }[] }> => spGet(
    token,
    `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=${filter}&$select=SurveyJSON&$top=1`,
  ) as Promise<{ value?: { SurveyJSON?: string }[] }>;

  if (publishKey) {
    try {
      const keyed = await getByFilter(`${baseFilter} and PublishKey eq '${encodeURIComponent(publishKey)}'`);
      return keyed.value?.[0]?.SurveyJSON;
    } catch {
      // Older SharePoint version lists may not have the profile column yet.
    }
  }

  const legacy = await getByFilter(baseFilter);
  return legacy.value?.[0]?.SurveyJSON;
}

export async function loadPdfData(item: PdfSubmissionRef, token: string): Promise<PdfFormData | null> {
  try {
    const cfg = await getFormConfigByTitle(token, item.Title);
    if (!cfg) return null;

    let formVersion = item.FormVersion || (cfg as unknown as Record<string, unknown>).CurrentVersion as string || "1.0";
    let publishKey = item.PublishKey || (cfg as unknown as Record<string, unknown>).CurrentPublishKey as string || "";
    if (!formVersion || !publishKey) {
      try {
        const respItem = await spGet(
          token,
          `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(item.Title)}')/items(${item.Id})?$select=FormVersion,PublishKey`
        ) as { FormVersion?: string; PublishKey?: string };
        formVersion = respItem?.FormVersion || "1.0";
        publishKey = respItem?.PublishKey || publishKey;
      } catch { /* keep fallback */ }
    }

    const rawSurvey = await getVersionSurveyJson(token, cfg.Title, formVersion, publishKey);
    if (!rawSurvey) return null;
    const parsed = JSON.parse(rawSurvey);
    const surveyContent = parsed.surveyJson || parsed;
    const versionMeta = isRecord(parsed.meta) ? parsed.meta : {};

    // Load response data
    const respItem = await spGet(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(item.Title)}')/items(${item.Id})`
    ) as Record<string, unknown>;

    const SYSTEM_FIELDS = new Set([
      'Id','Title','SubmittedBy','SubmittedAt','Status','CurrentApprovalLayer',
      'FormVersion','PublishKey','FormID','RawJSON','CurrentLayer','FormStatus','EvaluationData','WorkflowAssignmentData','WorkflowEmailLog','WorkflowEmailSchedule',
      'PDPAConsent','PDPANoticeVersion','PDPAConsentAt','RetentionUntil',
      'Author','Editor','Created','Modified','ContentType','PermMask',
      'L1_Status','L1_Email','L1_SignedAt','L1_Rejection','L1_Signature',
      'L2_Status','L2_Email','L2_SignedAt','L2_Rejection','L2_Signature',
      'L3_Status','L3_Email','L3_SignedAt','L3_Rejection','L3_Signature',
      'SelectedBranch',
    ]);

    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(respItem)) {
      if (!SYSTEM_FIELDS.has(k) && !/^L\d+_/.test(k) && v !== null && v !== undefined) {
        data[k] = v;
      }
    }

    const { buildPdfLayerResults } = await import("./generateFormPdf");
    return {
      surveyJson: surveyContent as PdfFormData["surveyJson"],
      responseData: data,
      layerResults: buildPdfLayerResults(respItem, 10, parsed.layerConfig ?? cfg.LayerConfig),
      meta: {
        submittedBy: item.SubmittedBy || "",
        submittedAt: item.SubmittedAt || "",
        formTitle: item.Title,
        formVersion,
        formStatus: "",
        referenceNo: respItem[REFERENCE_NO_FIELD] ? String(respItem[REFERENCE_NO_FIELD]) : undefined,
      },
      isoStandards: typeof versionMeta.isoStandards === "string" ? versionMeta.isoStandards : undefined,
      companies: typeof versionMeta.companies === "string" ? versionMeta.companies : undefined,
      logoUrl: typeof versionMeta.logoUrl === "string" && versionMeta.logoUrl.trim() ? versionMeta.logoUrl : "/logo-128.png",
      pdfConfig: isRecord(versionMeta.pdfConfig) ? versionMeta.pdfConfig as PdfFormData["pdfConfig"] : undefined,
      pdfTemplate: readTemplate(versionMeta.pdfTemplate) ?? undefined,
      documentHeader: isRecord(versionMeta.documentHeader) ? versionMeta.documentHeader as PdfFormData["documentHeader"] : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * The submission redrawn in the paper-form design, for the PDF viewer's design
 * switch — mainly for files saved before paper became the only design. Never
 * stored: the saved PDF is left as it was.
 */
export async function buildPaperDesignPdf(item: PdfSubmissionRef, token: string): Promise<Blob> {
  const pdfData = await loadPdfData(item, token);
  if (!pdfData) throw new Error("Could not load this submission to draw the paper-form design.");
  pdfData.meta.formStatus = item.FormStatus || item.Status || "submitted";
  pdfData.pdfConfig = { ...(pdfData.pdfConfig ?? { enabled: false, title: "", deliveryMethod: "download" }), design: "paper" };
  const { generatePdfBlob } = await import("./generateFormPdf");
  return generatePdfBlob(token, item.Id, pdfData);
}

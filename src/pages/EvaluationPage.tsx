/**
 * EvaluationPage.tsx — Layer evaluation/approval interface.
 * Route: /eval/:token (public) or /eval/:formSlug/:responseId/:layerNumber (365)
 */
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import NativeFormView from "../native/NativeForm";
import { parseForm, type NativeElement, type NativeForm } from "../native/schema";
import { useNativeForm } from "../native/useNativeForm";
import "../native/native-form.css";

import { getFormConfigByTitle, spGet, triggerApprovalNotification } from "../utils/formBuilderSP";
import type { MatrixColumnDef } from "../utils/formBuilderSP";
import { normalizeLayerStatus } from "../utils/statusConstants";
import { buildSurveyJson } from "../utils/FormBuilderEngine";
import type { LayerConfigItem, EvaluationDataEntry, EvaluationLayerConfig, FormBuilderField } from "../types";
import DOMPurify from "dompurify";
import EvaluationSummary from "../components/builder/EvaluationSummary";
import { loginRequest } from "../auth/msalConfig";
import { acquireAccessTokenSilentOrRedirect, fetchWithAuthRecovery } from "../utils/authRecovery";
import type { PdfFormData } from "../utils/FormPdfDocument";
import { readTemplate } from "../utils/pdfTemplate/safeTemplate";
import { rowsToHtml } from "../utils/matrixData";
import { collectPreviewSections, countPreviewAnswers } from "../utils/submissionPreviewSections";
import ReadOnlySubmissionPreview from "../components/builder/ReadOnlySubmissionPreview";
import ReviewerStyles from "../components/reviewer/ReviewerStyles";
import ReviewerHeader from "../components/reviewer/ReviewerHeader";
import StepCards from "../components/reviewer/StepCards";
import type { ReviewerStep } from "../components/reviewer/StepCards";
import CollapsiblePanel from "../components/reviewer/CollapsiblePanel";
import DecisionCard from "../components/reviewer/DecisionCard";
import SignatureField from "../components/reviewer/SignatureField";
import SignOffBlock from "../components/reviewer/SignOffBlock";
import { DeadEndCard, LoadingScreen, SignInRequiredCard, SubmittingOverlay, SuccessCard } from "../components/reviewer/StatusScreens";
import { btnDanger, btnDangerOutline, btnDisabled, btnGhost, btnPrimary, eyebrowStyle, R } from "../components/reviewer/reviewerTheme";
import LockIcon from "@mui/icons-material/Lock";
import { foldOtherAnswers } from "../utils/surveyOtherAnswers";
import { REFERENCE_NO_FIELD } from "../utils/referenceNumber";
import { parseLayerConfig } from "../utils/workflowReviewLink";
import { getActiveLayers } from "../components/builder/approvalDashboardLayerProgress";
import { apiIdentityHeaders } from "../utils/apiIdentity";
import { approverDisplayName } from "../utils/approverIdentity";
import {
  signOffLabel,
  signOffName,
  signOffPosition,
  signOffVerdictForLayer,
  signOffVerdictFromStatus,
} from "../utils/signOff";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";

function odataString(value: string): string {
  return encodeURIComponent(value.replace(/'/g, "''"));
}

async function getVersionPayload(
  token: string,
  formTitle: string,
  formVersion: string,
  publishKey?: string,
): Promise<Record<string, unknown> | null> {
  const baseFilter = `FormTitle eq '${odataString(formTitle)}' and FormVersion eq '${odataString(formVersion)}'`;
  const keyedFilter = publishKey?.trim()
    ? `${baseFilter} and PublishKey eq '${odataString(publishKey.trim())}'`
    : baseFilter;
  let versionData: { value?: { SurveyJSON?: string }[] };
  try {
    versionData = await spGet(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=${keyedFilter}&$select=SurveyJSON&$top=1`
    ) as { value?: { SurveyJSON?: string }[] };
  } catch {
    if (!publishKey?.trim()) throw new Error("Could not load published form version.");
    versionData = await spGet(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=${baseFilter}&$select=SurveyJSON&$top=1`
    ) as { value?: { SurveyJSON?: string }[] };
  }
  const rawSurvey = versionData.value?.[0]?.SurveyJSON;
  if (!rawSurvey) return null;
  return JSON.parse(rawSurvey) as Record<string, unknown>;
}

// ── PDF Helper ─────────────────────────────────────────────────────────────
async function loadPdfAndGenerate(token: string, listTitle: string, responseItemId: number, formTitle: string, formStatus: string): Promise<void> {
  try {
    const cfg = await getFormConfigByTitle(token, formTitle);
    if (!cfg) return;

    const respItem = await spGet(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${responseItemId})`
    ) as Record<string, unknown>;
    const formVersion = valueToText(respItem.FormVersion) || valueToText((cfg as unknown as Record<string, unknown>).CurrentVersion) || "1.0";
    const publishKey = valueToText(respItem.PublishKey) || valueToText((cfg as unknown as Record<string, unknown>).CurrentPublishKey);
    const parsed = await getVersionPayload(token, String(cfg.Title), formVersion, publishKey);
    if (!parsed) return;
    const surveyContent = parsed.surveyJson || parsed;
    const versionMeta = typeof parsed.meta === "object" && parsed.meta !== null && !Array.isArray(parsed.meta)
      ? parsed.meta as Record<string, unknown>
      : {};

    const SYSTEM_FIELDS = new Set([
      'Id','Title','SubmittedBy','SubmittedAt','Status','CurrentApprovalLayer',
      'FormVersion','PublishKey','FormID','RawJSON','CurrentLayer','FormStatus','EvaluationData','WorkflowAssignmentData','WorkflowEmailLog','WorkflowEmailSchedule',
      'PDPAConsent','PDPANoticeVersion','PDPAConsentAt','RetentionUntil',
      'Author','Editor','Created','Modified','ContentType','PermMask',
      'L1_Status','L1_Email','L1_SignedAt','L1_Rejection','L1_Signature',
      'L2_Status','L2_Email','L2_SignedAt','L2_Rejection','L2_Signature',
      'L3_Status','L3_Email','L3_SignedAt','L3_Rejection','L3_Signature',
    ]);

    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(respItem)) {
      if (!SYSTEM_FIELDS.has(k) && !/^L\d+_/.test(k) && v !== null && v !== undefined) {
        data[k] = v;
      }
    }

    const { generateAndStorePdf, buildPdfLayerResults } = await import("../utils/generateFormPdf");
    await generateAndStorePdf(token, listTitle, responseItemId, {
      surveyJson: surveyContent as PdfFormData["surveyJson"],
      responseData: data,
      layerResults: buildPdfLayerResults(respItem, 10, parsed.layerConfig ?? cfg.LayerConfig),
      meta: {
        submittedBy: (respItem.SubmittedBy as string) || "",
        submittedAt: (respItem.SubmittedAt as string) || "",
        formTitle,
        formVersion,
        formStatus,
      },
      isoStandards: typeof versionMeta.isoStandards === "string" ? versionMeta.isoStandards : undefined,
      logoUrl: typeof versionMeta.logoUrl === "string" && versionMeta.logoUrl.trim() ? versionMeta.logoUrl : "/logo-128.png",
      pdfConfig: typeof versionMeta.pdfConfig === "object" && versionMeta.pdfConfig !== null && !Array.isArray(versionMeta.pdfConfig)
        ? versionMeta.pdfConfig as PdfFormData["pdfConfig"]
        : undefined,
      pdfTemplate: readTemplate(versionMeta.pdfTemplate) ?? undefined,
      documentHeader: typeof versionMeta.documentHeader === "object" && versionMeta.documentHeader !== null && !Array.isArray(versionMeta.documentHeader)
        ? versionMeta.documentHeader as PdfFormData["documentHeader"]
        : undefined,
    });
  } catch {
    /* PDF generation is best-effort after the workflow state is persisted. */
  }
}

type AuthState = "checking" | "authorized" | "unauthorized" | "error";
type ActionState = "idle" | "submitting" | "success" | "error";
type SubmitAction = "approve" | "reject" | "confirm";
type PublicPreviousLayerSummary = {
  layerNumber: number;
  type?: string;
  title?: string;
  description?: string;
  surveyElements?: Record<string, unknown>[];
};

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}

const SYSTEM_FIELDS = new Set([
  "Id", "Title", "SubmittedBy", "SubmittedAt", "Status", "CurrentApprovalLayer",
  "FormVersion", "PublishKey", "FormID", "RawJSON", "CurrentLayer", "FormStatus", "EvaluationData", "WorkflowAssignmentData", "WorkflowEmailLog", "WorkflowEmailSchedule",
  "PDPAConsent", "PDPANoticeVersion", "PDPAConsentAt", "RetentionUntil",
  "Author", "Editor", "Created", "Modified", "ContentType", "PermMask",
  "SelectedBranch",
]);

function isWorkflowField(key: string): boolean {
  return SYSTEM_FIELDS.has(key) || /^L\d+_/.test(key) || key.startsWith("odata.");
}

function getSubmissionPreviewData(fields: Record<string, unknown> | null): Record<string, unknown> {
  if (!fields) return {};
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (isWorkflowField(key) || value === null || value === undefined || value === "") continue;
    data[key] = value;
  }
  return data;
}

function isTerminalLayerStatus(status: unknown): boolean {
  const normalized = normalizeLayerStatus(valueToText(status));
  return ["approved", "confirmed", "rejected", "skipped", "cancelled"].includes(normalized);
}

function isTerminalFormStatus(status: unknown): boolean {
  const normalized = valueToText(status).toLowerCase().replace(/[\s_-]/g, "");
  return normalized === "completed" || normalized === "rejected" || normalized === "cancelled" || normalized === "fullyapproved";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatDateTime(value: unknown): string {
  const text = valueToText(value);
  if (!text) return "-";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).replace(",", "");
}

function buildEvaluationSurveyJson(elements: Record<string, unknown>[], title: string): Record<string, unknown> {
  const mapped = buildSurveyJson(elements as unknown as FormBuilderField[], {
    title,
    titleLocation: "hidden",
    showQuestionNumbers: "off",
  }) as unknown as Record<string, unknown>;
  return {
    ...mapped,
    showNavigationButtons: false,
    showQuestionNumbers: "off",
    titleLocation: "hidden",
  };
}

function isCurrencyQuestion(question: Record<string, unknown>): boolean {
  const name = valueToText(question.name);
  const title = valueToText(question.title);
  const inputType = valueToText(question.inputType);
  const type = typeof question.getType === "function" ? valueToText((question.getType as () => unknown)()) : valueToText(question.type);
  const format = valueToText(question.displayFormat || question.format).toLowerCase();
  if (type === "currency" || question.currency || question.currencySymbol || format === "currency") return true;
  return inputType === "number" && /\b(cost|amount|price|fee|claim|expense|budget|total|subtotal)\b/i.test(`${name} ${title}`);
}

function currencySymbolFor(question: Record<string, unknown>): string {
  const explicit = valueToText(question.currencySymbol);
  if (explicit) return explicit;
  const named = valueToText(question.currency);
  return !named || named === "MYR" ? "RM" : named;
}

/**
 * Marks money questions with the symbol they should be typed against.
 *
 * The SurveyJS build did this after every render by reaching into the DOM and
 * inserting a span next to the input. The native engine draws a question's
 * `prefix` itself, so the same result comes from saying so in the document —
 * which also means the symbol survives re-renders instead of being re-applied
 * after each one. The `currencySymbol` case needs no help; it is only the
 * name-based guess ("claim amount", "total cost") that has to be written down.
 */
function withCurrencyPrefixes(elements: Record<string, unknown>[]): Record<string, unknown>[] {
  return elements.map((element) => {
    const next = { ...element };
    if (Array.isArray(next.elements)) {
      next.elements = withCurrencyPrefixes(next.elements as Record<string, unknown>[]);
    }
    if (!next.prefix && isCurrencyQuestion(next)) next.prefix = currencySymbolFor(next);
    return next;
  });
}

function surveyElementsForLayer(layerSequence: LayerConfigItem[], layerNumber: unknown): Record<string, unknown>[] {
  const layer = layerSequence.find((entry) => entry.layerNumber === Number(layerNumber));
  return layer?.type === "evaluation" ? (layer as EvaluationLayerConfig).surveyElements || [] : [];
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2 Oct 2026" and "11:30" for a stored timestamp, or null when it is not one. */
function reviewerDateParts(value: unknown): { date: string; short: string; time: string } | null {
  const text = valueToText(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  const month = MONTH_NAMES[parsed.getMonth()];
  return {
    date: `${parsed.getDate()} ${month} ${parsed.getFullYear()}`,
    short: `${parsed.getDate()} ${month}`,
    time: `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`,
  };
}

/** "2 Oct 2026, 11:30" — how the prototype prints when something happened. */
function formatReviewerDateTime(value: unknown): string {
  const parts = reviewerDateParts(value);
  return parts ? `${parts.date}, ${parts.time}` : valueToText(value);
}

/** Does any question here draw as a Yes/No or rating statement row? */
function hasStatementRows(elements: NativeElement[]): boolean {
  return elements.some((el) => el.kind === "boolean" || el.kind === "rating" || (el.kind === "section" && hasStatementRows(el.elements)));
}

/** Today, as the sign-off prints a date that has not been recorded yet. */
function todayLabel(): string {
  return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Component ──
export default function EvaluationPage() {
  const { token: routeToken, formSlug, responseId, layerNumber } = useParams<{
    token: string;
    formSlug: string;
    responseId: string;
    layerNumber: string;
  }>();
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const [authState, setAuthState] = useState<AuthState>("checking");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /** Set when the link itself is fine but this account is not the approver.
   *  A different situation from a broken link, and different advice. */
  const [notYourRequest, setNotYourRequest] = useState(false);

  const [responseData, setResponseData] = useState<Record<string, unknown> | null>(null);
  const [currentLayer, setCurrentLayer] = useState<LayerConfigItem | null>(null);
  const [layerSequence, setLayerSequence] = useState<LayerConfigItem[]>([]);
  const [totalLayers, setTotalLayers] = useState(0);
  const [previousResults, setPreviousResults] = useState<Record<string, unknown>[]>([]);
  const [formTitle, setFormTitle] = useState("");
  const [surveyJson, setSurveyJson] = useState<unknown>(null);
  const [currentLayerStatus, setCurrentLayerStatus] = useState("");
  const [formStatus, setFormStatus] = useState("");
  const [mediaSrcByField, setMediaSrcByField] = useState<Record<string, string | string[]>>({});
  const [logoUrl, setLogoUrl] = useState("");
  const [publicPreviousLayerSummaries, setPublicPreviousLayerSummaries] = useState<PublicPreviousLayerSummary[]>([]);
  /** The signed-in reviewer's directory name and post, read by the server. */
  const [viewerSignOff, setViewerSignOff] = useState<{ name: string; position: string } | null>(null);

  /**
   * The evaluation questions this layer asks, as a native document.
   *
   * Null when the layer is a plain approval (nothing to fill in) or when its
   * question list is empty, which the confirm button reads as "not ready".
   */
  const evalForm = useMemo<NativeForm | null>(() => {
    if (currentLayer?.type !== "evaluation") return null;
    const elements = (currentLayer as EvaluationLayerConfig).surveyElements || [];
    if (elements.length === 0) return null;
    try {
      return parseForm(
        buildEvaluationSurveyJson(withCurrencyPrefixes(elements), currentLayer.title || "Evaluation"),
      );
    } catch {
      return null;
    }
  }, [currentLayer]);

  const placeholderForm = useMemo(() => parseForm(null), []);
  const evalRuntime = useNativeForm(evalForm ?? placeholderForm);

  // A plain approval layer asks nothing, so it is ready as soon as it loads.
  // An evaluation layer is ready once every required question has an answer —
  // the button says which of the two it is rather than failing on click.
  const evalValid = currentLayer?.type !== "evaluation"
    ? true
    : evalForm !== null && evalRuntime.answered >= evalRuntime.required;

  const [actionState, setActionState] = useState<ActionState>("idle");
  /** Which decision is in flight — the blocking overlay names it. */
  const [submitAction, setSubmitAction] = useState<SubmitAction>("approve");
  const [rejectionReason, setRejectionReason] = useState("");
  /** The inline reject panel replaces the decision form; Back returns to it. */
  const [rejecting, setRejecting] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [checkboxApproved, setCheckboxApproved] = useState(false);
  const [matrixTables, setMatrixTables] = useState<Record<string, { columns: MatrixColumnDef[]; rows: Record<string, unknown>[]; html: string }>>({});

  /**
   * Which of the two link shapes was opened. Both mount this page, so the
   * prefix is not routing — it is a claim about what the recipient was asked
   * for, checked against the layer once the record says what it really is.
   */
  const { pathname } = useLocation();
  const routePrefix = pathname.startsWith("/approval/") ? "approval" as const : "eval" as const;

  const isPublic = !!routeToken;
  const displayLayerNumber = isPublic
    ? 1  // Will be resolved from token
    : parseInt(layerNumber || "0", 10);

  // ── Auth ──
  useEffect(() => {
    if (isPublic) {
      // Public mode — no auth needed, but need SP token for potential writes
      setAuthState("authorized");
      setUserEmail("SYSTEM");
      return;
    }
    if (inProgress !== InteractionStatus.None) return;
    if (!isAuthenticated) {
      setAuthState("unauthorized");
      setLoading(false);
      return;
    }
    const email = accounts[0]?.username || null;
    setUserEmail(email);
    const origin = new URL(SP_SITE_URL).origin;
    acquireAccessTokenSilentOrRedirect(instance, { scopes: [`${origin}/AllSites.Manage`], account: accounts[0] })
      .then((accessToken) => { setToken(accessToken); setAuthState("authorized"); })
      .catch(() => { setAuthState("error"); setError("Failed to acquire token."); });
  }, [isPublic, isAuthenticated, inProgress, instance, accounts]);

  // ── Load data ──
  useEffect(() => {
    if (authState !== "authorized") return;
    if (isPublic) {
      // Public: fetch filtered data from API
      const loadPublic = async () => {
        try {
          const params = new URLSearchParams(window.location.search);
          const itemId = params.get("item");
          if (!itemId) { setError("the link does not say which submission it is for"); setLoading(false); return; }
          // `k` binds this link to one submission. Sent as given — including not
          // at all, which is how a link issued before bindings existed asks the
          // server to mail its reviewer a fresh one.
          const linkToken = params.get("k") || "";

          const res = await fetch(
            `/api/evaluate?token=${encodeURIComponent(routeToken || "")}&responseItemId=${itemId}`
            + (linkToken ? `&k=${encodeURIComponent(linkToken)}` : ""),
            {
              headers: {
                ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
              },
            },
          );
          const json = await res.json();
          if (!json.success) { setError(json.error || "Failed to load data."); setLoading(false); return; }

          // No prefix check here, deliberately. A public link names its layer
          // with the token itself, so there is no layer number to edit onto a
          // step of the other kind — the thing the prefix check exists to
          // catch cannot happen on this path. Applying it anyway would only
          // give pre-split public approval links a way to stop working.

          setFormTitle(json.data.formTitle);
          setResponseData(json.data.fields);
          setCurrentLayer({
            layerNumber: json.data.layerNumber,
            type: json.data.layerType,
            authMode: "public" as const,
            assignee: { type: "user" as const, value: "" },
            title: json.data.layerTitle,
            description: json.data.layerDescription,
            surveyElements: Array.isArray(json.data.surveyElements) ? json.data.surveyElements : [],
            confirmationLabel: json.data.confirmationLabel,
            confirmationType: json.data.confirmationType,
          } as LayerConfigItem);
          setTotalLayers(Number(json.data.totalLayers) || 0);
          setSurveyJson(json.data.surveyJson || null);
          setLogoUrl(valueToText(json.data.logoUrl));
          setPublicPreviousLayerSummaries(Array.isArray(json.data.previousLayerSummaries) ? json.data.previousLayerSummaries as PublicPreviousLayerSummary[] : []);
          setMediaSrcByField(typeof json.data.mediaSrcByField === "object" && json.data.mediaSrcByField !== null ? json.data.mediaSrcByField : {});
          setCurrentLayerStatus(valueToText(json.data.layerStatus || json.data.fields?.[`L${json.data.layerNumber}_Status`]));
          setFormStatus(valueToText(json.data.formStatus || json.data.fields?.FormStatus));

          // Build previous results from the filtered fields
          const prev: Record<string, unknown>[] = [];
          let visibleEvaluationData: Record<string, EvaluationDataEntry> = {};
          if (typeof json.data.fields?.EvaluationData === "string") {
            try {
              visibleEvaluationData = JSON.parse(json.data.fields.EvaluationData) as Record<string, EvaluationDataEntry>;
            } catch {
              visibleEvaluationData = {};
            }
          }
          if (json.data.totalLayers > 0) {
            for (let n = 1; n < json.data.layerNumber; n++) {
              prev.push({
                layerNumber: n,
                status: json.data.fields[`L${n}_Status`] || null,
                email: json.data.fields[`L${n}_Email`] || null,
                actedBy: json.data.fields[`L${n}_ActedBy`] || null,
                actedByName: json.data.fields[`L${n}_ActedByName`] || null,
                actedByPosition: json.data.fields[`L${n}_ActedByPosition`] || null,
                signedAt: json.data.fields[`L${n}_SignedAt`] || null,
                evaluationData: visibleEvaluationData[String(n)],
              });
            }
          }
          setPreviousResults(prev);
          setLoading(false);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to load evaluation data.");
          setLoading(false);
        }
      };
      loadPublic();
      return; // Skip the 365 load path
    }
    if (!formSlug || !responseId || !displayLayerNumber) {
      setError("the link is incomplete");
      setLoading(false);
      return;
    }

    const load = async () => {
      if (!token) return;
      try {
        // Resolve formTitle from slug
        const slugData = await fetchWithAuthRecovery(`${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items?$filter=Slug eq '${encodeURIComponent(formSlug)}'&$select=Title,LayerConfig&$top=1`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata" },
        });
        const slugJson = await slugData.json();
        const resolvedTitle = slugJson.value?.[0]?.Title;
        if (!resolvedTitle) { setError("the form this request belongs to no longer exists"); setLoading(false); return; }
        setFormTitle(resolvedTitle);

        const respItemId = parseInt(responseId, 10);

        // The submission is fetched by the server, not by this browser.
        //
        // It used to be read straight from SharePoint here with the reviewer's
        // own token, and only then checked. By that point the record had
        // arrived: the check decided whether to *draw* it, having already
        // handed it over. Now the same question is settled before anything is
        // sent — the server works out the layer, proves the caller is its
        // assigned reviewer, and returns only the fields that layer may show.
        //
        // The form's own definition is still read from here. A layer
        // configuration is not anybody's personal data, and the page needs the
        // whole sequence to know what comes next.
        const res = await fetchWithAuthRecovery(
          `/api/evaluate?slug=${encodeURIComponent(formSlug)}`
          + `&responseItemId=${encodeURIComponent(String(respItemId))}`
          + `&layerNumber=${encodeURIComponent(String(displayLayerNumber))}`
          + `&prefix=${routePrefix}`,
          // The SharePoint token rides along so the tester of a test run can be
          // proved a builder superuser; see api/_utils/testRunReviewer.ts.
          { headers: { ...(await apiIdentityHeaders(instance, accounts[0])), "X-SharePoint-Token": token } },
        );
        const json = await res.json();
        if (!res.ok || !json.success) {
          // The server said no and said why. A refusal about who this request
          // belongs to gets the "not yours" treatment, which offers different
          // advice from a broken link.
          setNotYourRequest(res.status === 403 || res.status === 401);
          setError(json.error || "the details for this request could not be loaded");
          setLoading(false);
          return;
        }

        const fields = (json.data.fields || {}) as Record<string, unknown>;
        // Branch-aware, using the branch the server read off the record, so the
        // sequence here is the one the submission is actually following.
        const sequence = getActiveLayers(
          parseLayerConfig(slugJson.value?.[0]?.LayerConfig),
          valueToText(json.data.selectedBranch),
        );
        setResponseData(fields);
        setCurrentLayer(sequence.find((entry) => entry.layerNumber === displayLayerNumber) ?? null);
        setLayerSequence(sequence);
        setTotalLayers(sequence.length || Number(json.data.totalLayers) || displayLayerNumber);
        setPreviousResults(
          sequence
            .filter((entry) => entry.layerNumber < displayLayerNumber)
            .map((entry) => ({
              layerNumber: entry.layerNumber,
              status: fields[`L${entry.layerNumber}_Status`] ?? null,
              email: fields[`L${entry.layerNumber}_Email`] ?? null,
              actedBy: fields[`L${entry.layerNumber}_ActedBy`] ?? null,
              actedByName: fields[`L${entry.layerNumber}_ActedByName`] ?? null,
              actedByPosition: fields[`L${entry.layerNumber}_ActedByPosition`] ?? null,
              signedAt: fields[`L${entry.layerNumber}_SignedAt`] ?? null,
              title: entry.title || "",
            })),
        );
        setCurrentLayerStatus(valueToText(json.data.layerStatus || fields[`L${displayLayerNumber}_Status`]));
        setFormStatus(valueToText(json.data.formStatus || fields.FormStatus || fields.Status));
        setMediaSrcByField(isRecord(json.data.mediaSrcByField) ? json.data.mediaSrcByField as Record<string, string | string[]> : {});
        applyMatrixTables(json.data.matrixTables);
        setViewerSignOff(isRecord(json.data.viewerSignOff)
          ? { name: valueToText(json.data.viewerSignOff.name), position: valueToText(json.data.viewerSignOff.position) }
          : null);
        const data = { responseFields: fields };

        // The form's own definition — what to draw, and the logo to draw it
        // under. Not anybody's personal data, so it is still read from here.
        const itemFormVersion = data.responseFields.FormVersion as string | undefined;
        if (itemFormVersion) {
          const itemPublishKey = valueToText(data.responseFields.PublishKey);
          const parsed = await getVersionPayload(token, resolvedTitle, itemFormVersion, itemPublishKey);
          if (parsed) {
            setSurveyJson(parsed.surveyJson || parsed);
            const meta = isRecord(parsed.meta) ? parsed.meta : {};
            setLogoUrl(valueToText(meta.logoUrl));
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load data.");
      }
      setLoading(false);
    };
    load();
  }, [authState, isPublic, routePrefix, formSlug, responseId, displayLayerNumber, token, userEmail]);

  /**
   * The gate on a signed-in decision used to live here, re-reading the record
   * from SharePoint in the browser before writing to it.
   *
   * It has moved to `api/evaluate.ts`, which now records the decision itself.
   * A check made here could only ever be advice: the page held a SharePoint
   * token, so anything it declined to write it could still have written. The
   * server holds the record and the rules together — the assignment on the
   * row, the layer the submission has actually reached, and the order of the
   * steps before it. Do not reinstate a copy of them here.
   */

  // While the overlay is up the page behind it must not scroll, or the
  // reviewer can drift away from a screen that is asking them to wait.
  useEffect(() => {
    if (actionState !== "submitting") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [actionState]);

  // ── Submit action ──
  const handleSubmit = useCallback(async (action: "approve" | "reject" | "confirm") => {
    if (!userEmail) return;
    // Validation paints the errors and focuses the first one, so a rejected
    // confirm leaves the evaluator looking at what still needs answering.
    if (action === "confirm" && evalForm && !evalRuntime.validateAll().ok) return;
    setSubmitAction(action);
    setActionState("submitting");
    try {
      if (isPublic) {
        const params = new URLSearchParams(window.location.search);
        const itemId = Number(params.get("item"));
        if (!routeToken || !itemId || !currentLayer) throw new Error("This evaluation link is missing required details.");
        // Acting is held to the same binding as looking, so the link's `k` is
        // handed back with the decision.
        const linkToken = params.get("k") || "";
        const res = await fetch("/api/evaluate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
          },
          body: JSON.stringify({
            token: routeToken,
            formTitle,
            responseItemId: itemId,
            linkToken,
            layerNumber: currentLayer.layerNumber,
            action,
            fields: evalForm ? foldOtherAnswers(evalRuntime.collect()) : {},
            signature: signatureData || undefined,
            rejection: rejectionReason || undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to submit this decision.");
        }
        setActionState("success");
        return;
      }

      if (!token) return;
      const listTitle = formTitle; // list is named after form title
      const respId = parseInt(responseId || "0", 10);
      /**
       * The decision is recorded by the server, not by this browser.
       *
       * Everything that decides whether it may be recorded at all — which form,
       * which submission, which layer — sits in the address bar, where the
       * reviewer can edit it. None of it can therefore be proof of anything.
       * The server re-reads the record, satisfies itself that the signed-in
       * address is the one this step was assigned to, writes the outcome,
       * advances the workflow and mails whoever is next.
       *
       * What is left here is the paperwork that follows a finished workflow:
       * the PDF record, and the closing note to whoever submitted.
       */
      const res = await fetchWithAuthRecovery("/api/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await apiIdentityHeaders(instance, accounts[0])),
          "X-SharePoint-Token": token,
        },
        body: JSON.stringify({
          slug: formSlug,
          prefix: routePrefix,
          responseItemId: respId,
          layerNumber: displayLayerNumber,
          action,
          fields: evalForm ? foldOtherAnswers(evalRuntime.collect()) : {},
          signature: signatureData || undefined,
          rejection: rejectionReason || undefined,
          confirmerName: accounts[0]?.name || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to submit this decision.");
      }

      // Whether anything comes after this step is the server's answer, read off
      // the record it has just written rather than guessed at from here.
      const isFinal = !json.advancedToLayer;
      if (action === "reject") {
        await loadPdfAndGenerate(token, listTitle, respId, formTitle, "rejected");
      } else if (isFinal) {
        await loadPdfAndGenerate(token, listTitle, respId, formTitle, "completed");
      }

      // The next reviewer's email goes out from the server, in the same breath
      // as the advance it announces. Left here is the note to whoever submitted,
      // which is only due once the workflow has finished one way or the other.
      if (action === "reject" || isFinal) {
        await triggerApprovalNotification(token, {
          formTitle,
          submittedBy: valueToText(responseData?.SubmittedBy) || userEmail,
          responseItemId: respId,
          layer: displayLayerNumber,
          // The completion notice is the one sent when the layer just finished
          // is the last one, so on a run that ends early these must agree.
          totalLayers: action === "reject"
            ? Math.max(totalLayers || displayLayerNumber, displayLayerNumber)
            : displayLayerNumber,
          action: action === "reject" ? "reject" : "approve",
        });
      }
      setActionState("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit this decision.");
      setActionState("error");
    }
  }, [token, userEmail, evalForm, evalRuntime, isPublic, routeToken, currentLayer, formTitle, formSlug, routePrefix, instance, signatureData, rejectionReason, responseId, displayLayerNumber, accounts, totalLayers, responseData]);

  /**
   * Show the repeating-table answers the server sent with the submission.
   *
   * These used to be fetched here, one SharePoint list per table question,
   * after the record itself had already moved to the server. They are answers
   * like any other, so they come with it now — and the question of whether
   * this reviewer may see them is settled once, before any of it is sent.
   * Building the table markup stays here, where it is displayed.
   */
  const applyMatrixTables = useCallback((payload: unknown) => {
    if (!isRecord(payload)) return;
    const tables: Record<string, { columns: MatrixColumnDef[]; rows: Record<string, unknown>[]; html: string }> = {};
    for (const [fieldName, entry] of Object.entries(payload)) {
      if (!isRecord(entry)) continue;
      const columns = Array.isArray(entry.columns) ? entry.columns as MatrixColumnDef[] : [];
      const rows = Array.isArray(entry.rows) ? entry.rows as Record<string, unknown>[] : [];
      if (!columns.length || !rows.length) continue;
      tables[fieldName] = { columns, rows, html: rowsToHtml(columns, rows) };
    }
    if (!Object.keys(tables).length) return;

    setMatrixTables(tables);
    // Also folded into the answers in the shape SurveyJS expects, so the
    // read-only preview renders them alongside everything else.
    setResponseData((prev) => {
      if (!prev) return prev;
      const enriched = { ...prev };
      for (const [fieldName, entry] of Object.entries(tables)) {
        enriched[fieldName] = {
          rows: entry.rows,
          html: entry.html,
          json: JSON.stringify(entry.rows),
        };
      }
      return enriched;
    });
  }, []);

  // ── Display-only helpers: tab title, focus handling ──
  const rejectButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!formTitle) return;
    document.title = `${formTitle} — ${currentLayer?.type === "evaluation" ? "Evaluation" : "Approval"}`;
  }, [formTitle, currentLayer]);

  // Hand focus back to the Reject button when the reject panel closes.
  useEffect(() => {
    if (!rejecting) return;
    return () => { rejectButtonRef.current?.focus(); };
  }, [rejecting]);

  // The reference the page and the header print. A form with no reference
  // number falls back to "Submission 12", which is what HR can look up.
  const referenceText = valueToText(responseData?.[REFERENCE_NO_FIELD]);
  const submissionIdText = isPublic ? (new URLSearchParams(window.location.search).get("item") || "") : (responseId || "");
  const referenceLabel = referenceText || (/^\d+$/.test(submissionIdText) ? `Submission ${submissionIdText}` : "");

  // ── Render ──
  if (authState === "checking" || loading) {
    return <LoadingScreen />;
  }

  if (authState === "unauthorized") {
    return (
      <SignInRequiredCard
        kind={routePrefix === "approval" ? "approval" : "evaluation"}
        onSignIn={() => { void instance.loginRedirect({ ...loginRequest }); }}
      />
    );
  }

  // Only a failure to LOAD takes the whole page. A failed decision keeps the
  // page (and the reviewer's answers) and shows an alert by the buttons; a
  // retry must not fall through to this screen while the old error lingers.
  if (error && actionState === "idle") {
    // The people who land here are approvers following a link from an email,
    // not staff who can read a status code. Say what happened and what to do
    // next; the raw reason stays last, for whoever they ask.
    return (
      <DeadEndCard
        tone={notYourRequest ? "grey" : "amber"}
        icon={notYourRequest ? "user-x" : "link-off"}
        eyebrow={notYourRequest ? "Wrong account" : "Link not working"}
        title={notYourRequest ? "This one isn\u2019t assigned to you" : "This approval link could not be opened"}
        footer={notYourRequest ? <>Reason: {error}</> : <>{referenceLabel ? <>Quote <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>{referenceLabel}</span> to HR. </> : null}Reason: {error}</>}
        action={notYourRequest ? (
          <button
            type="button"
            className="rv-btn"
            onClick={() => { void instance.loginRedirect({ ...loginRequest, prompt: "select_account" }); }}
            style={{ ...btnGhost, height: 44, padding: "0 20px" }}
          >
            Switch account
          </button>
        ) : undefined}
      >
        {notYourRequest ? (
          <>
            <p style={{ margin: 0 }}>
              You{"\u2019"}re signed in as <strong style={{ color: R.ink }}>{userEmail || "this account"}</strong>, which
              isn{"\u2019"}t the account this step was sent to. Nothing is wrong with the link.
            </p>
            <p style={{ margin: 0 }}>
              Sign in with the address the request was sent to, or ask HR to reassign it.
            </p>
          </>
        ) : (
          <>
            <p style={{ margin: 0 }}>
              The link may have expired, been used already, or been cut short by your email app.
              Nothing was submitted.
            </p>
            <p style={{ margin: 0 }}>
              Use the latest email, or ask HR to send it again.
            </p>
          </>
        )}
      </DeadEndCard>
    );
  }

  if (actionState === "success") {
    const doneStep = currentLayer?.layerNumber || displayLayerNumber;
    const isRejected = submitAction === "reject";
    const nextStep = layerSequence.find((entry) => entry.layerNumber > doneStep);
    const nextLine = isRejected
      ? "The submitter will be told it was rejected. The workflow stops here."
      : nextStep
        ? `It now moves to the next step: ${nextStep.title || `Step ${nextStep.layerNumber}`}.`
        : totalLayers > doneStep
          ? `It now moves to step ${doneStep + 1} of ${totalLayers}.`
          : "This was the final step — the submitter will be notified.";
    return (
      <SuccessCard
        rejected={isRejected}
        heading={isRejected ? "Rejected" : submitAction === "confirm" ? "Evaluation submitted" : "Approved"}
        formTitle={formTitle}
        reference={referenceLabel}
        nextLine={nextLine}
      />
    );
  }

  const isEvaluation = currentLayer?.type === "evaluation";
  const isSignatureRequired = currentLayer?.type === "approval" && (currentLayer as unknown as Record<string, unknown>).confirmationType === "signature";
  const isCheckboxMode = currentLayer?.type === "approval" && (currentLayer as unknown as Record<string, unknown>).confirmationType === "checkbox";
  const isLayerAlreadyComplete = isTerminalLayerStatus(currentLayerStatus) || isTerminalFormStatus(formStatus);
  const currentLayerLabel = currentLayerStatus || (isLayerAlreadyComplete ? "Completed" : "Pending");
  const effectiveLayerNumber = currentLayer?.layerNumber || displayLayerNumber;
  // Who is signing, printed above the buttons so the record says it and not
  // only the audit trail. A public link has no signed-in account to name.
  const signedInApprover = isPublic ? "" : approverDisplayName(accounts[0]?.name, userEmail);
  const stepLabel = totalLayers > 0 ? `Step ${effectiveLayerNumber} of ${totalLayers}` : `Step ${effectiveLayerNumber}`;
  const approverRoleLabel = currentLayer?.title || `Step ${effectiveLayerNumber}`;
  // A short description doubles as the label above the name; a long one is
  // subtitle material and would read as a sentence there.
  const layerDescription = currentLayer?.description?.trim() || "";
  const descriptionIsLabel = layerDescription !== "" && layerDescription.length <= 30;
  const showHeaderDescription = layerDescription !== "" && !(descriptionIsLabel && !!signedInApprover);
  const normalizedPill = normalizeLayerStatus(currentLayerLabel);
  const pillLower = currentLayerLabel.toLowerCase();
  const isRejectedLayer = normalizedPill === "rejected" || normalizedPill === "cancelled";
  const isGoodLayer = normalizedPill === "approved" || normalizedPill === "confirmed" || pillLower.includes("complet");
  const actedSignedAt = valueToText(responseData?.[`L${effectiveLayerNumber}_SignedAt`]);
  const actedBy = valueToText(responseData?.[`L${effectiveLayerNumber}_ActedBy`]) || valueToText(responseData?.[`L${effectiveLayerNumber}_Email`]);
  const savedRejection = valueToText(responseData?.[`L${effectiveLayerNumber}_Rejection`]);
  const savedSignatureText = valueToText(responseData?.[`L${effectiveLayerNumber}_Signature`]);
  const savedSignature = savedSignatureText.startsWith("data:image/") ? savedSignatureText : "";
  const submitRef = referenceLabel || "this request";
  const submittedBy = valueToText(responseData?.SubmittedBy);
  // A public-link submission is recorded as "GUEST"; say what that means.
  const submitterLabel = submittedBy.toUpperCase() === "GUEST" ? "Guest (submitted via public link)" : submittedBy;
  const submittedParts = reviewerDateParts(responseData?.SubmittedAt);
  const submittedAtText = submittedParts ? `${submittedParts.date} at ${submittedParts.time}` : "";
  const previewData = getSubmissionPreviewData(responseData);
  const previewSections = collectPreviewSections(surveyJson, previewData);
  const answerCount = previewSections.length > 0 ? countPreviewAnswers(previewSections) : Object.keys(previewData).length;
  const answersLeft = Math.max(0, evalRuntime.required - evalRuntime.answered);
  const isFinalStep = totalLayers > 0 ? effectiveLayerNumber >= totalLayers : true;
  const evalHint = evalValid
    ? (isFinalStep ? "This is the last step. Submitting generates the PDF record." : "Submitting sends this to the next step.")
    : `${answersLeft} ${answersLeft === 1 ? "answer" : "answers"} left`;
  const decisionDate = reviewerDateParts(actedSignedAt);
  const isSubmitting = actionState === "submitting";
  const approveBlocked = isSubmitting || (isCheckboxMode && !checkboxApproved) || (isSignatureRequired && !signatureData);
  const confirmBlocked = isSubmitting || !evalForm || !evalValid;

  const steps: ReviewerStep[] = Array.from({ length: Math.max(totalLayers, effectiveLayerNumber) }, (_, index) => {
    const n = index + 1;
    const title = layerSequence.find((entry) => entry.layerNumber === n)?.title
      || publicPreviousLayerSummaries.find((summary) => Number(summary.layerNumber) === n)?.title
      || (n === effectiveLayerNumber ? currentLayer?.title : "")
      || `Step ${n}`;
    if (n < effectiveLayerNumber) {
      const previous = previousResults.find((entry) => Number(entry.layerNumber) === n);
      const previousStatus = valueToText(previous?.status);
      return {
        number: n,
        title,
        state: normalizeLayerStatus(previousStatus) === "rejected" ? "rejected" : "done",
        caption: previousStatus
          ? `${previousStatus}${reviewerDateParts(previous?.signedAt) ? ` \u00b7 ${reviewerDateParts(previous?.signedAt)?.short}` : ""}`
          : "Completed",
      };
    }
    if (n === effectiveLayerNumber) {
      if (isLayerAlreadyComplete) {
        return { number: n, title, state: isRejectedLayer ? "rejected" : "done", isYou: true, caption: decisionDate ? `${currentLayerLabel} \u00b7 ${decisionDate.short}` : currentLayerLabel };
      }
      return { number: n, title, state: "current", isYou: true, caption: "Waiting for your decision" };
    }
    return { number: n, title, state: "upcoming", caption: "Not reached yet" };
  });

  const submitErrorAlert = actionState === "error" ? (
    <div role="alert" style={{ background: R.redSoft, color: R.red, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Your decision may not have been saved</div>
      <div style={{ fontSize: 13, lineHeight: 1.6 }}>
        Check your connection and try again. If this keeps happening, contact HR and quote reference {submitRef}.
      </div>
      {error && <div style={{ fontSize: 12, marginTop: 6 }}>Details: {error}</div>}
    </div>
  ) : null;
  // The directory name wins over Azure's display name, so the page prints what
  // the record will be stamped with. Position falls back to the layer title.
  const signerName = viewerSignOff?.name || signedInApprover;
  const signerPosition = signOffPosition(viewerSignOff?.position, approverRoleLabel);
  const pendingVerdict = signOffVerdictForLayer(currentLayer?.type);
  const customSignOffLabel = descriptionIsLabel ? layerDescription : undefined;
  // Once decided, the sign-off already on the record — for a link opened later.
  const recordedVerdict = signOffVerdictFromStatus(currentLayerStatus);
  const recordedSignerName = responseData
    ? signOffName(responseData[`L${effectiveLayerNumber}_ActedByName`], responseData[`L${effectiveLayerNumber}_ActedBy`])
    : "";

  const completeTone = isRejectedLayer
    ? { bg: R.redSoft, fg: R.red }
    : { bg: R.greenSoft, fg: R.green };

  return (
    <div className="rv-page" style={{ minHeight: "100vh", background: R.paper }}>
      <ReviewerStyles />
      <ReviewerHeader logoUrl={logoUrl} reference={referenceLabel} />
      <main className="rv-main" style={{ maxWidth: 720, margin: "0 auto", padding: "56px 24px 96px", display: "flex", flexDirection: "column", gap: 40 }}>

        {/* Intro */}
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="rv-eyebrow" style={eyebrowStyle}>{isEvaluation ? "Evaluation" : "Approval"} {"\u00b7"} {stepLabel}</div>
          <h1 className="rv-title" style={{ margin: 0, fontWeight: 700, fontSize: 34, lineHeight: 1.15, letterSpacing: "-0.02em", color: R.ink }}>
            {formTitle || currentLayer?.title || (isEvaluation ? "Evaluation" : "Approval")}
          </h1>
          {(submittedBy || submittedAtText) && (
            <p className="rv-lead" style={{ margin: 0, color: R.muted }}>
              {submittedBy ? <>From <strong style={{ color: R.ink, fontWeight: 600 }}>{submitterLabel}</strong>{submittedAtText ? ", " : ""}</> : null}
              {submittedAtText ? `submitted ${submittedAtText}` : null}
            </p>
          )}
          {showHeaderDescription && <p className="rv-lead" style={{ margin: 0, color: R.muted }}>{layerDescription}</p>}
        </section>

        <StepCards steps={steps} />

        {isLayerAlreadyComplete && (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", background: completeTone.bg, borderRadius: 10, padding: "16px 18px" }}>
            <LockIcon aria-hidden="true" style={{ fontSize: 22, color: completeTone.fg, marginTop: 1 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: R.ink }}>This step is already complete</div>
              <div style={{ fontSize: 13, color: R.ink, marginTop: 4, lineHeight: 1.6 }}>
                Status: <strong style={{ color: isGoodLayer || isRejectedLayer ? completeTone.fg : R.ink }}>{currentLayerLabel}</strong>
                {actedSignedAt ? <> {"\u00b7"} {formatReviewerDateTime(actedSignedAt)}</> : null}
                {actedBy ? <> {"\u00b7"} by {actedBy}</> : null}
              </div>
            </div>
          </div>
        )}

        {/* Previous Layer Results */}
        {previousResults.length > 0 && (
          <section>
            <h2 style={{ ...eyebrowStyle, fontSize: 13, margin: "0 0 12px" }}>Previous steps</h2>
            {previousResults.map((pr, i) => {
              const evalData = pr.evaluationData as EvaluationDataEntry | undefined;
              const previousLayerNumber = Number(pr.layerNumber);
              const publicSummary = publicPreviousLayerSummaries.find((summary) => Number(summary.layerNumber) === previousLayerNumber);
              const previousSurveyElements = publicSummary?.surveyElements || surveyElementsForLayer(layerSequence, previousLayerNumber);
              const previousTitle = publicSummary?.title || valueToText(pr.title) || `Step ${previousLayerNumber}`;
              const previousVerdict = signOffVerdictFromStatus(pr.status);
              const previousSignerName = signOffName(
                pr.actedByName || evalData?.confirmerName,
                pr.actedBy || evalData?.confirmerEmail || pr.email,
              );
              const previousSignOff = previousVerdict && previousSignerName ? (
                <div style={{ marginTop: 12 }}>
                  <SignOffBlock
                    compact
                    align="start"
                    verdict={previousVerdict}
                    label={signOffLabel(previousVerdict)}
                    name={previousSignerName}
                    position={signOffPosition(pr.actedByPosition, previousTitle)}
                    date={formatDateTime(pr.signedAt)}
                  />
                </div>
              ) : null;
              if (evalData?.status === "confirmed") {
                return (
                  <EvaluationSummary
                    key={i}
                    result={{
                      layerNumber: previousLayerNumber,
                      type: "evaluation",
                      status: "confirmed",
                      email: evalData.confirmerEmail || null,
                      confirmedAt: evalData.confirmedAt || null,
                      fields: evalData.fields || {},
                      notes: evalData.notes,
                    }}
                    layerTitle={publicSummary?.title || `Step ${previousLayerNumber}`}
                    layerDescription={publicSummary?.description}
                    surveyElements={previousSurveyElements}
                    footer={previousSignOff}
                  />
                );
              }
              return (
                <div key={i} style={{ background: R.navyTint, borderRadius: 6, padding: "12px 16px", marginBottom: 10, fontSize: 13, color: R.ink }}>
                  {previousTitle}: <strong>{String(pr.status || "Completed")}</strong>
                  {previousSignOff ?? (
                    <>
                      {pr.email ? <span style={{ color: R.muted, marginLeft: 8 }}>by {String(pr.email)}</span> : null}
                      {pr.signedAt ? <span style={{ color: R.label, marginLeft: 8 }}>- {formatDateTime(pr.signedAt)}</span> : null}
                    </>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* Submission Data Preview */}
        {responseData && (
          <CollapsiblePanel title="Submission details" meta={`\u00b7 ${answerCount} ${answerCount === 1 ? "answer" : "answers"}`}>
            <ReadOnlySubmissionPreview
              variant="reviewer"
              surveyJson={surveyJson}
              data={previewData}
              accessToken={token}
              mediaSrcByField={mediaSrcByField}
              fallbackData={previewData}
            />

            {/* Matrix Tables — from child lists */}
            {!surveyJson && Object.keys(matrixTables).length > 0 && (
              <CollapsiblePanel variant="group" title="Matrix tables">
                {Object.entries(matrixTables).map(([fieldName, entry]) => (
                  <div key={fieldName} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: R.label, marginBottom: 4 }}>
                      {entry.columns[0]?.title || fieldName}
                    </div>
                    <div
                      style={{ overflow: "auto", border: `1px solid ${R.line}`, borderRadius: 6 }}
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(entry.html) }}
                    />
                    <div style={{ fontSize: 12, color: R.label, marginTop: 4 }}>
                      {entry.rows.length} row{entry.rows.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                ))}
              </CollapsiblePanel>
            )}
          </CollapsiblePanel>
        )}

        {/* Current Layer Action */}
        <DecisionCard
          id="eval-decision"
          variant={isEvaluation ? "bar" : "card"}
          title={rejecting ? "Reject this request?" : isEvaluation ? "Your evaluation" : "Your decision"}
          meta={
            isEvaluation
              ? isLayerAlreadyComplete
                ? currentLayerLabel
                : evalForm ? `${evalRuntime.answered} of ${evalRuntime.required} answered` : undefined
              : undefined
          }
        >
          {isLayerAlreadyComplete ? (
            <>
              {submitErrorAlert}
              <div style={{ padding: "12px 14px", background: R.paper, borderRadius: 4, color: R.muted, fontSize: 14 }}>
                This link can no longer be used to record a decision.
              </div>
              <dl style={{ margin: 0, display: "flex", flexDirection: "column" }}>
                {([
                  ["Decision", currentLayerLabel, true],
                  ...(actedSignedAt ? [["When", formatReviewerDateTime(actedSignedAt), false]] : []),
                  ...(savedRejection ? [["Reason", savedRejection, false]] : []),
                ] as [string, string, boolean][]).map(([label, value, strong]) => (
                  <div
                    key={label}
                    className="rv-meta-row"
                    style={{ display: "grid", gridTemplateColumns: "160px minmax(0, 1fr)", gap: 16, padding: "10px 0", borderTop: `1px solid ${R.line}` }}
                  >
                    <dt style={{ color: R.label }}>{label}</dt>
                    <dd
                      style={{
                        margin: 0,
                        color: strong && (isGoodLayer || isRejectedLayer) ? completeTone.fg : R.ink,
                        fontWeight: strong ? 600 : 400,
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {value}
                    </dd>
                  </div>
                ))}
                <div style={{ borderTop: `1px solid ${R.line}` }} />
              </dl>
              {recordedVerdict && recordedSignerName && responseData && (
                <SignOffBlock
                  verdict={recordedVerdict}
                  label={signOffLabel(recordedVerdict, customSignOffLabel)}
                  name={recordedSignerName}
                  position={signOffPosition(responseData[`L${effectiveLayerNumber}_ActedByPosition`], approverRoleLabel)}
                  date={formatDateTime(responseData[`L${effectiveLayerNumber}_SignedAt`])}
                  signature={savedSignature || null}
                />
              )}
            </>
          ) : rejecting ? (
            <>
              {submitErrorAlert}
              <p style={{ margin: 0, color: R.muted }}>The submitter is told it was rejected and the workflow stops here.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="eval-reject-reason" style={{ fontSize: 13.5, fontWeight: 600, color: R.body }}>
                  Reason <span style={{ fontWeight: 400, color: R.label }}>(optional)</span>
                </label>
                <textarea
                  id="eval-reject-reason"
                  className="rv-reason"
                  autoFocus
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Tell the submitter why"
                  disabled={isSubmitting}
                  style={{ fontFamily: "inherit", padding: "10px 12px", border: `1px solid ${R.inputBorder}`, borderRadius: 4, resize: "vertical", color: R.ink, boxSizing: "border-box", width: "100%" }}
                />
              </div>
              {signerName && (
                <SignOffBlock
                  verdict="rejected"
                  label={signOffLabel("rejected")}
                  name={signerName}
                  position={signerPosition}
                  date={todayLabel()}
                />
              )}
              <div className="rv-reject-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button type="button" className="rv-btn" onClick={() => setRejecting(false)} style={btnGhost} disabled={isSubmitting}>
                  Back
                </button>
                <button
                  type="button"
                  className="rv-btn"
                  onClick={() => { setRejecting(false); void handleSubmit("reject"); }}
                  style={{ ...btnDanger, padding: "0 24px", opacity: isSubmitting ? 0.6 : 1 }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting..." : "Reject request"}
                </button>
              </div>
            </>
          ) : (
            <>
              {isEvaluation && (
                evalForm ? (
                  <NativeFormView
                    runtime={evalRuntime}
                    variant="reviewer"
                    legend={hasStatementRows(evalForm.pages.flatMap((p) => p.elements)) ? "Answer each statement" : undefined}
                  />
                ) : (
                  <div style={{ fontSize: 13, color: R.red, background: R.redSoft, borderRadius: 4, padding: 12 }}>
                    This review step has no questions set up yet. Please let HR know — nothing has been submitted.
                  </div>
                )
              )}

              {isSignatureRequired && (
                <SignatureField value={signatureData} onChange={setSignatureData} disabled={isSubmitting} />
              )}

              {isCheckboxMode && (
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", minHeight: 40 }}>
                  <input
                    type="checkbox"
                    checked={checkboxApproved}
                    onChange={(e) => setCheckboxApproved(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: R.navy }}
                  />
                  <span style={{ fontSize: 15, color: R.ink }}>I approve this submission</span>
                </label>
              )}

              {/* Who is signing: what they are doing, their name and post as the
                  routing directory has them. The signature line appears only
                  once there is a signature. */}
              {signerName && (
                <SignOffBlock
                  verdict={pendingVerdict}
                  label={signOffLabel(pendingVerdict, customSignOffLabel)}
                  name={signerName}
                  position={signerPosition}
                  date={todayLabel()}
                  signature={isSignatureRequired ? signatureData : null}
                />
              )}

              {submitErrorAlert}

              {/* Action buttons */}
              {isEvaluation ? (
                <div
                  className="rv-eval-actions"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, paddingTop: 20, borderTop: `1px solid ${R.line}` }}
                >
                  <span style={{ fontSize: 13.5, color: R.label }}>{evalForm ? evalHint : ""}</span>
                  <button
                    type="button"
                    className="rv-btn"
                    onClick={() => handleSubmit("confirm")}
                    style={confirmBlocked ? btnDisabled : btnPrimary}
                    disabled={confirmBlocked}
                  >
                    {isSubmitting ? "Submitting..." : !evalForm ? "Unavailable" : "Submit evaluation"}
                  </button>
                </div>
              ) : (
                <div className="rv-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, paddingTop: 4 }}>
                  <button
                    type="button"
                    ref={rejectButtonRef}
                    className="rv-btn"
                    onClick={() => setRejecting(true)}
                    style={btnDangerOutline}
                    disabled={isSubmitting}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className="rv-btn"
                    onClick={() => handleSubmit("approve")}
                    style={approveBlocked ? btnDisabled : btnPrimary}
                    disabled={approveBlocked}
                  >
                    {isSubmitting ? "Submitting..." : isSignatureRequired && !signatureData ? "Sign to approve" : "Approve request"}
                  </button>
                </div>
              )}
            </>
          )}
        </DecisionCard>
      </main>

      {/* Phones: the decision is far below the details, so offer a way down. */}
      {!isLayerAlreadyComplete && !isSubmitting && !rejecting && (
        <div className="rv-jump">
          <button
            type="button"
            className="rv-btn"
            style={{ ...btnPrimary, width: "100%" }}
            onClick={() => {
              const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              document.getElementById("eval-decision")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
            }}
          >
            Go to your decision ↓
          </button>
        </div>
      )}

      {isSubmitting && <SubmittingOverlay action={submitAction} />}
    </div>
  );
}

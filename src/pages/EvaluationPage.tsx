/**
 * EvaluationPage.tsx — Layer evaluation/approval interface.
 * Route: /eval/:token (public) or /eval/:formSlug/:responseId/:layerNumber (365)
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import NativeFormView from "../native/NativeForm";
import { parseForm, type NativeForm } from "../native/schema";
import { useNativeForm } from "../native/useNativeForm";
import "../native/native-form.css";

import { getLayerResponseData, updateLayerStatus, submitEvaluationData, getFormConfigByTitle, spGet, spPatch, readMatrixChildItems, triggerApprovalNotification } from "../utils/formBuilderSP";
import type { MatrixColumnDef } from "../utils/formBuilderSP";
import { SP_LAYER_STATUS, normalizeLayerStatus } from "../utils/statusConstants";
import { buildRejectedWorkflowPatch } from "../utils/workflowStatus";
import { buildSurveyJson } from "../utils/FormBuilderEngine";
import type { LayerConfigItem, EvaluationDataEntry, EvaluationLayerConfig, FormBuilderField } from "../types";
import DOMPurify from "dompurify";
import EvaluationSummary from "../components/builder/EvaluationSummary";
import { loginRequest } from "../auth/msalConfig";
import { acquireAccessTokenSilentOrRedirect, fetchWithAuthRecovery } from "../utils/authRecovery";
import type { PdfFormData } from "../utils/FormPdfDocument";
import { rowsToHtml, getDynamicMatrixFields } from "../utils/matrixData";
import { SignatureCapture } from "../utils/signatureCapture";
import { getSelectedCompany } from "../utils/companySelection";
import ReadOnlySubmissionPreview from "../components/builder/ReadOnlySubmissionPreview";
import Logo from "../components/Logo";
import LockIcon from "@mui/icons-material/Lock";
import WarningIcon from "@mui/icons-material/Warning";
import { foldOtherAnswers } from "../utils/surveyOtherAnswers";
import { REFERENCE_NO_FIELD } from "../utils/referenceNumber";
import { isLayerActor, parseValidEmailList } from "../utils/layerRecipients";
import { approverDisplayName } from "../utils/approverIdentity";

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
type PublicPreviousLayerSummary = {
  layerNumber: number;
  type?: string;
  title?: string;
  description?: string;
  surveyElements?: Record<string, unknown>[];
};

// ── Styling ──
const COLORS = {
  purple: "#0078D4", purpleLight: "#106EBE", purplePale: "#EAF5FC",
  bg: "linear-gradient(180deg, #EEF6FC 0%, #F7FAFD 48%, #F7F8FA 100%)", cardBg: "#FFFFFF", border: "#D6DCE5",
  textPrimary: "#101010", textSecond: "#5F646D", textMuted: "#747B86",
  green: "#107C10", greenPale: "#E3F1E3",
  red: "#C62828", redPale: "#F8E4E4",
  shadow: "0 0 0 1px rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.08), 0 8px 20px rgba(26, 31, 43, 0.06)",
  shadowHover: "0 0 0 1px rgba(0, 120, 212, 0.18), 0 2px 4px -1px rgba(0, 120, 212, 0.12), 0 10px 24px rgba(26, 31, 43, 0.08)",
};

const sectionCard: React.CSSProperties = {
  background: COLORS.cardBg,
  borderRadius: 12,
  padding: 24,
  marginBottom: 20,
  boxShadow: COLORS.shadow,
};

const btnPrimary: React.CSSProperties = {
  padding: "12px 32px",
  minHeight: 44,
  borderRadius: 8,
  border: "none",
  background: COLORS.purple,
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "'Segoe UI', system-ui, sans-serif",
};

const btnOutline: React.CSSProperties = {
  ...btnPrimary,
  background: "transparent",
  border: `1px solid ${COLORS.red}`,
  color: COLORS.red,
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
  const [rejectionReason, setRejectionReason] = useState("");
  /** The reject dialog is opened by the Reject button and closed only by Cancel. */
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [checkboxApproved, setCheckboxApproved] = useState(false);
  const [matrixTables, setMatrixTables] = useState<Record<string, { columns: MatrixColumnDef[]; rows: Record<string, unknown>[]; html: string }>>({});

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

        const data = await getLayerResponseData(token, resolvedTitle, parseInt(responseId, 10), displayLayerNumber);
        if (!data) { setError("the details for this request could not be loaded"); setLoading(false); return; }
        // Everything in this route — the slug, the id, the layer number — is
        // typed into the address bar, so none of it decides what may be opened.
        // The record does.
        //
        // A public layer is not reachable this way at all. Its link is
        // `/eval/<layer token>?item=…&k=…`, where `k` is the value minted for
        // that one submission and checked by the server before a field is
        // returned. Accepting the slug form for such a layer would be a way
        // round that check: any signed-in account could walk the ids. The
        // reviewer's own emailed link works; this shape never was one.
        if (data.currentLayer?.authMode === "public") {
          setNotYourRequest(true);
          setError("this request can only be opened from the link that was emailed to its reviewer");
          setLoading(false);
          return;
        }
        // A layer can be assigned to several people (or an expanded distribution
        // list) — any one of them may act. L{n}_Emails carries the full set;
        // older submissions only have the single L{n}_Email. Changing the id to
        // a neighbouring submission, or the layer number to another step, lands
        // on a record that does not name you and stops here.
        const signedInEmail = (userEmail || "").trim();
        if (
          !isLayerActor(
            signedInEmail,
            data.responseFields[`L${displayLayerNumber}_Emails`],
            data.responseFields[`L${displayLayerNumber}_Email`],
          )
        ) {
          setNotYourRequest(true);
          setError("this request is waiting for someone else");
          setLoading(false);
          return;
        }
        setResponseData(data.responseFields);
        setCurrentLayer(data.currentLayer || null);
        setLayerSequence(data.layerConfig);
        setTotalLayers(data.layerConfig.length || displayLayerNumber);
        setPreviousResults(data.previousResults);
        setCurrentLayerStatus(valueToText(data.responseFields[`L${displayLayerNumber}_Status`]));
        setFormStatus(valueToText(data.responseFields.FormStatus || data.responseFields.Status));

        // Load matrix child list data for dynamicmatrix fields
        const itemFormVersion = data.responseFields.FormVersion as string | undefined;
        if (itemFormVersion) {
          const itemPublishKey = valueToText(data.responseFields.PublishKey);
          const parsed = await getVersionPayload(token, resolvedTitle, itemFormVersion, itemPublishKey);
          if (parsed) {
            setSurveyJson(parsed.surveyJson || parsed);
            const meta = isRecord(parsed.meta) ? parsed.meta : {};
            setLogoUrl(valueToText(meta.logoUrl));
          }
          loadMatrixChildData(token, resolvedTitle, parseInt(responseId, 10), itemFormVersion, itemPublishKey);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load data.");
      }
      setLoading(false);
    };
    load();
  }, [authState, isPublic, formSlug, responseId, displayLayerNumber, token, userEmail]);

  /**
   * The gate on a signed-in decision, re-read from SharePoint at the moment it
   * is recorded rather than trusted from the page load.
   *
   * Every part of a sign-in review link — the form, the submission id, the
   * layer number — sits in the address bar where the reviewer can edit it, so
   * none of it may be taken as proof of anything. What decides is the record:
   * the layer the submission is actually on, and whether the signed-in address
   * is one this layer was assigned to. Editing the id to a neighbouring
   * submission, or the layer number to somebody else's step, lands on a record
   * that does not name you and is refused here.
   *
   * The page load applies the same assignee check before showing anything. This
   * repeats it against fresh data because the two are answering different
   * questions: what may be looked at, and what may be written — and an
   * assignment can be changed, or the submission moved on, in between.
   */
  const assertSignedInLayerCanSubmit = async (listTitle: string, respId: number, layer: number): Promise<void> => {
    if (!token) throw new Error("Missing SharePoint token.");
    // The whole row rather than a $select list, because SharePoint rejects a
    // $select naming a column the list does not have, and a response list
    // created before layers could fan out has no L{n}_Emails. The read path
    // fetches the row the same way for the same reason.
    const item = await spGet(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${respId})`
    ) as Record<string, unknown>;
    const latestStatus = item[`L${layer}_Status`];
    const latestCurrentLayer = Number(item.CurrentLayer || item.CurrentApprovalLayer || 0);

    // A layer may be shared by several people, or by an expanded distribution
    // list; L{n}_Emails carries the full set and L{n}_Email only the primary.
    if (!isLayerActor((userEmail || "").trim(), item[`L${layer}_Emails`], item[`L${layer}_Email`])) {
      throw new Error("This request is assigned to someone else, so it cannot be submitted from your account.");
    }
    if (isTerminalFormStatus(item.FormStatus || item.Status) || isTerminalLayerStatus(latestStatus)) {
      throw new Error("This layer has already been completed. Refresh the submissions page to see the latest status.");
    }
    if (latestCurrentLayer && latestCurrentLayer !== layer) {
      throw new Error("This link is no longer active because the submission has moved to another layer.");
    }
  };

  // ── Submit action ──
  const handleSubmit = useCallback(async (action: "approve" | "reject" | "confirm") => {
    if (!userEmail) return;
    // Validation paints the errors and focuses the first one, so a rejected
    // confirm leaves the evaluator looking at what still needs answering.
    if (action === "confirm" && evalForm && !evalRuntime.validateAll().ok) return;
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
      await assertSignedInLayerCanSubmit(listTitle, respId, displayLayerNumber);
      const now = new Date().toISOString();
      const effectiveTotalLayers = totalLayers || displayLayerNumber;
      const sortedLayers = [...layerSequence].sort((a, b) => a.layerNumber - b.layerNumber);
      const currentLayerIndex = sortedLayers.findIndex((layer) => layer.layerNumber === displayLayerNumber);
      const nextLayer = currentLayerIndex >= 0
        ? sortedLayers[currentLayerIndex + 1]
        : sortedLayers.find((layer) => layer.layerNumber > displayLayerNumber);
      const isFinal = !nextLayer && displayLayerNumber >= effectiveTotalLayers;
      const nextLayerNumber = nextLayer?.layerNumber ?? displayLayerNumber + 1;
      const itemUrl = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${respId})`;

      if (action === "reject") {
        await spPatch(token, itemUrl, {
          ...buildRejectedWorkflowPatch(displayLayerNumber, effectiveTotalLayers, now, rejectionReason),
          [`L${displayLayerNumber}_ActedBy`]: userEmail,
        });
        await loadPdfAndGenerate(token, listTitle, respId, formTitle, "rejected");
      } else if (action === "confirm" && currentLayer?.type === "evaluation") {
        await submitEvaluationData(token, listTitle, respId, displayLayerNumber, {
          confirmerEmail: userEmail,
          confirmerName: accounts[0]?.name ?? undefined,
          fields: evalForm ? foldOtherAnswers(evalRuntime.collect()) : {},
          signatureUrl: signatureData,
        });
        await updateLayerStatus(token, listTitle, respId, displayLayerNumber, {
          status: SP_LAYER_STATUS.CONFIRMED,
          signedAt: now,
          signature: signatureData || undefined,
          actedBy: userEmail,
        });
        await spPatch(token, itemUrl, {
          Status: isFinal ? "Completed" : "In Review",
          FormStatus: isFinal ? "Completed" : "In Review",
          CurrentLayer: isFinal ? displayLayerNumber : nextLayerNumber,
          CurrentApprovalLayer: isFinal ? displayLayerNumber : nextLayerNumber,
        });
        if (isFinal) {
          await loadPdfAndGenerate(token, listTitle, respId, formTitle, "completed");
        }
      } else if (action === "approve") {
        await updateLayerStatus(token, listTitle, respId, displayLayerNumber, {
          status: SP_LAYER_STATUS.APPROVED,
          signedAt: now,
          signature: signatureData || undefined,
          actedBy: userEmail,
        });
        await spPatch(token, itemUrl, {
          Status: isFinal ? "Approved" : `Approved Layer ${displayLayerNumber}`,
          FormStatus: isFinal ? "Completed" : "In Review",
          CurrentLayer: isFinal ? displayLayerNumber : nextLayerNumber,
          CurrentApprovalLayer: isFinal ? displayLayerNumber : nextLayerNumber,
        });
        if (isFinal) {
          await loadPdfAndGenerate(token, listTitle, respId, formTitle, "completed");
        }
      }

      const nextApproverEmail = !isFinal ? valueToText(responseData?.[`L${nextLayerNumber}_Email`]) : "";
      const nextRecipients = !isFinal
        ? parseValidEmailList(responseData?.[`L${nextLayerNumber}_NotifyEmails`])
        : [];
      await triggerApprovalNotification(token, {
        formTitle,
        submittedBy: valueToText(responseData?.SubmittedBy) || userEmail,
        responseItemId: respId,
        layer: displayLayerNumber,
        totalLayers: effectiveTotalLayers,
        action: action === "reject" ? "reject" : "approve",
        ...(nextApproverEmail ? { nextApproverEmail } : {}),
        ...(nextRecipients.length ? { nextRecipients } : {}),
        ...(nextLayer?.type ? { nextLayerType: nextLayer.type } : {}),
        ...(nextLayer?.layerNumber ? { nextLayerNumber: nextLayer.layerNumber } : {}),
        ...(nextLayer?.type === "evaluation" ? { nextEmailSchedule: nextLayer.emailSchedule } : {}),
      });

      setActionState("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit this decision.");
      setActionState("error");
    }
  }, [token, userEmail, evalForm, evalRuntime, isPublic, routeToken, currentLayer, formTitle, signatureData, rejectionReason, responseId, displayLayerNumber, accounts, totalLayers, layerSequence, responseData]);

  /** Load matrix child list data for dynamicmatrix fields and enrich responseData */
  const loadMatrixChildData = async (
    tkn: string,
    resolvedTitle: string,
    respId: number,
    formVersion: string,
    publishKey?: string,
  ) => {
    try {
      // Load the version's SurveyJSON to detect dynamicmatrix fields
      const parsed = await getVersionPayload(tkn, resolvedTitle, formVersion, publishKey);
      if (!parsed) return;
      const surveyDef = parsed.surveyJson || parsed;
      const matrixFields = getDynamicMatrixFields(surveyDef);

      if (matrixFields.length === 0) return;

      const tables: Record<string, { columns: MatrixColumnDef[]; rows: Record<string, unknown>[]; html: string }> = {};
      for (const mf of matrixFields) {
        const safeName = mf.name.replace(/[^a-zA-Z0-9_ -]/g, "").trim();
        const childListName = `${resolvedTitle} Matrix ${safeName}`;

        try {
          const rows = await readMatrixChildItems(tkn, childListName, respId);
          if (rows.length > 0) {
            const cols = mf.columns as MatrixColumnDef[];
            tables[mf.name] = {
              columns: cols,
              rows,
              html: rowsToHtml(mf.columns, rows),
            };
          }
        } catch {
          // Child list not found — skip this field
        }
      }

      setMatrixTables(tables);

      // Enrich responseData with matrix data in SurveyJS-compatible format
      if (Object.keys(tables).length > 0) {
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
      }
    } catch {
      // Silently fail — matrix data is non-critical
    }
  };

  // ── Render ──
  if (authState === "checking" || loading) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: COLORS.textMuted, fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  if (authState === "unauthorized") {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: COLORS.cardBg, borderRadius: 8, padding: "56px 44px", maxWidth: 420, width: "100%", textAlign: "center", border: `1px solid ${COLORS.border}`, boxShadow: COLORS.shadow }}>
          <div style={{ fontSize: 32, marginBottom: 16, display: 'flex', justifyContent: 'center' }}><LockIcon style={{ fontSize: 40 }} /></div>
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>Sign in required</div>
          <p style={{ color: COLORS.textSecond, fontSize: 13, marginBottom: 24 }}>You need to sign in with your Microsoft 365 account to access this evaluation.</p>
          <button onClick={() => instance.loginRedirect({ ...loginRequest })} style={btnPrimary}>Sign in with Microsoft 365</button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: COLORS.cardBg, borderRadius: 8, padding: "48px 44px", maxWidth: 460, textAlign: "center", border: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 32, marginBottom: 16, display: 'flex', justifyContent: 'center' }}><WarningIcon style={{ fontSize: 40 }} /></div>
          {/* The people who land here are approvers following a link from an
              email, not staff who can read a status code. Say what happened and
              what to do next; the raw reason stays last, for whoever they ask. */}
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.red, marginBottom: 10 }}>
            {notYourRequest ? "This request is not yours to approve" : "This approval link could not be opened"}
          </div>
          {notYourRequest ? (
            <>
              <p style={{ color: COLORS.textSecond, fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
                You are signed in as <strong>{userEmail || "this account"}</strong>, and this request is
                waiting on a different approver. Nothing is wrong with the link.
              </p>
              <p style={{ color: COLORS.textSecond, fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
                If you were expecting to approve this, you may be signed in with the wrong account —
                sign out and back in with the address the request was sent to, or ask HR to reassign it.
              </p>
            </>
          ) : (
            <>
              <p style={{ color: COLORS.textSecond, fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
                The link may have expired, been used already, or been cut short by your email app.
                Nothing has been approved or rejected, and nothing you do here can go wrong.
              </p>
              <p style={{ color: COLORS.textSecond, fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
                Please ask the HR team to send you a fresh approval link. Forwarding them this page
                helps them find the request.
              </p>
            </>
          )}
          <p style={{ color: COLORS.textSecond, fontSize: 12, opacity: 0.8, margin: 0, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
            Reason: {error}
          </p>
        </div>
      </div>
    );
  }

  if (actionState === "success") {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: COLORS.cardBg, borderRadius: 8, padding: "56px 44px", maxWidth: 420, textAlign: "center", border: `1px solid ${COLORS.border}`, boxShadow: COLORS.shadow }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.green, marginBottom: 8 }}>Submitted Successfully</div>
          <p style={{ color: COLORS.textSecond, fontSize: 13, marginBottom: 24 }}>
            Your response has been recorded. You may close this page.
          </p>
        </div>
      </div>
    );
  }

  const isEvaluation = currentLayer?.type === "evaluation";
  const isSignatureRequired = currentLayer?.type === "approval" && (currentLayer as unknown as Record<string, unknown>).confirmationType === "signature";
  const isCheckboxMode = currentLayer?.type === "approval" && (currentLayer as unknown as Record<string, unknown>).confirmationType === "checkbox";
  const selectedCompany = getSelectedCompany(responseData, surveyJson);
  const isLayerAlreadyComplete = isTerminalLayerStatus(currentLayerStatus) || isTerminalFormStatus(formStatus);
  const currentLayerLabel = currentLayerStatus || (isLayerAlreadyComplete ? "Completed" : "Pending");
  const effectiveLayerNumber = currentLayer?.layerNumber || displayLayerNumber;
  // Who is signing, printed under the signature so the record says it and not
  // only the audit trail. A public link has no signed-in account to name.
  const signedInApprover = isPublic ? "" : approverDisplayName(accounts[0]?.name, userEmail);
  const approverRoleLabel = currentLayer?.title || `Layer ${effectiveLayerNumber}`;
  const approverActionLabel = currentLayer?.description?.trim()
    || (isEvaluation ? "Confirmed By" : "Approved By");

  return (
    <div className="eval-page" style={{ minHeight: "100vh", background: COLORS.bg, padding: "clamp(16px, 3vw, 32px) 16px" }}>
      <style>{`
        .eval-page { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        .eval-page h1, .eval-page h2, .eval-page h3 { text-wrap: balance; }
        .eval-page p, .eval-page li, .eval-page span { text-wrap: pretty; }
        .eval-action-button { transition-property: transform, box-shadow, background-color, color; transition-duration: 150ms; transition-timing-function: cubic-bezier(0.2, 0, 0, 1); }
        .eval-action-button:active:not(:disabled) { transform: scale(0.96); }
        .eval-currency-prefix { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #5F646D; font-size: 13px; font-weight: 800; pointer-events: none; z-index: 1; font-variant-numeric: tabular-nums; }
        .eval-survey-wrap .sd-root-modern, .eval-survey-wrap .sd-container-modern { background: transparent !important; max-width: 100% !important; }
        .eval-survey-wrap .sd-row { display: flex !important; flex-wrap: wrap !important; }
        .eval-survey-wrap .sd-question { box-shadow: none !important; }
        @media (max-width: 640px) {
          .eval-meta-grid { grid-template-columns: 1fr !important; }
          .eval-header { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>

        {/* Header */}
        <div className="eval-header" style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", gap: 18, alignItems: "center", background: COLORS.cardBg, borderRadius: 16, padding: "18px 20px", marginBottom: 20, boxShadow: COLORS.shadow }}>
          <div style={{ width: 64, height: 64, borderRadius: 12, background: COLORS.purplePale, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {logoUrl ? (
              <img src={logoUrl} alt="Company logo" style={{ maxWidth: 54, maxHeight: 54, objectFit: "contain", outline: "1px solid rgba(0, 0, 0, 0.1)", outlineOffset: -1 }} />
            ) : (
              <Logo size={54} alt="PMW Logo" />
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.purple, textTransform: "uppercase", letterSpacing: 0, marginBottom: 4 }}>
              {isEvaluation ? "Evaluation Review" : "Approval Review"}
            </div>
            <h1 style={{ fontSize: "clamp(22px, 3vw, 32px)", lineHeight: 1.15, fontWeight: 800, color: COLORS.textPrimary, margin: 0 }}>
              {formTitle || currentLayer?.title || (isEvaluation ? "Evaluation" : "Approval")}
            </h1>
            <div style={{ fontSize: 13, color: COLORS.textSecond, marginTop: 8 }}>
              {currentLayer?.title ? `${currentLayer.title} / ` : ""}Layer {effectiveLayerNumber}
              {currentLayer?.description && <div style={{ marginTop: 4 }}>{currentLayer.description}</div>}
            </div>
          </div>
          <span style={{
            justifySelf: "start",
            fontSize: 12,
            fontWeight: 800,
            padding: "7px 12px",
            borderRadius: 999,
            color: isLayerAlreadyComplete ? COLORS.green : COLORS.purple,
            background: isLayerAlreadyComplete ? COLORS.greenPale : COLORS.purplePale,
            fontVariantNumeric: "tabular-nums",
          }}>
            {currentLayerLabel}
          </span>
        </div>

        {/* Previous Layer Results */}
        {previousResults.length > 0 && (
          <div style={sectionCard}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textSecond, textTransform: "uppercase", letterSpacing: 0, marginBottom: 12 }}>
              Previous Layers
            </div>
            {previousResults.map((pr, i) => {
              const evalData = pr.evaluationData as EvaluationDataEntry | undefined;
              const previousLayerNumber = Number(pr.layerNumber);
              const publicSummary = publicPreviousLayerSummaries.find((summary) => Number(summary.layerNumber) === previousLayerNumber);
              const previousSurveyElements = publicSummary?.surveyElements || surveyElementsForLayer(layerSequence, previousLayerNumber);
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
                    layerTitle={publicSummary?.title || `Layer ${previousLayerNumber}`}
                    layerDescription={publicSummary?.description}
                    surveyElements={previousSurveyElements}
                  />
                );
              }
              return (
                <div key={i} style={{ background: COLORS.purplePale, borderRadius: 8, padding: "12px 16px", marginBottom: 10, fontSize: 13, color: COLORS.textPrimary }}>
                  Layer {previousLayerNumber}: <strong>{String(pr.status || "Completed")}</strong>
                  {pr.signedAt ? <span style={{ color: COLORS.textMuted, marginLeft: 8 }}>- {formatDateTime(pr.signedAt)}</span> : null}
                </div>
              );
            })}
          </div>
        )}

        {/* Submission Data Preview */}
        {responseData && (
          <div style={sectionCard}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 4 }}>
                  Submission Details
                </div>
                <div style={{ fontSize: 12, color: COLORS.textSecond }}>
                  Review the submitted data before completing this layer.
                </div>
              </div>
            </div>
            <div className="eval-meta-grid" style={{ fontSize: 13, color: COLORS.textSecond, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 16, fontVariantNumeric: "tabular-nums" }}>
              {!!responseData[REFERENCE_NO_FIELD] && (
                <div>Reference no.: <strong style={{ color: COLORS.textPrimary }}>{String(responseData[REFERENCE_NO_FIELD])}</strong></div>
              )}
              <div>Form ID: {String(responseData.FormID || responseData.formId || "—")}</div>
              {selectedCompany && <div>Company: {selectedCompany}</div>}
              <div>Submitted: {formatDateTime(responseData.SubmittedAt)}</div>
              <div>Version: {String(responseData.FormVersion || responseData.formVersion || "—")}</div>
            </div>

            <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 16 }}>
              <ReadOnlySubmissionPreview
                surveyJson={surveyJson}
                data={getSubmissionPreviewData(responseData)}
                accessToken={token}
                mediaSrcByField={mediaSrcByField}
                fallbackData={getSubmissionPreviewData(responseData)}
              />
            </div>

            {/* Matrix Tables — from child lists */}
            {!surveyJson && Object.keys(matrixTables).length > 0 && (
              <div style={{ marginTop: 16, borderTop: `1px solid ${COLORS.border}`, paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.purple, marginBottom: 12 }}>
                  Matrix Tables
                </div>
                {Object.entries(matrixTables).map(([fieldName, entry]) => (
                  <div key={fieldName} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 4 }}>
                      {entry.columns[0]?.title || fieldName}
                    </div>
                    <div
                      style={{ overflow: "auto", border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(entry.html) }}
                    />
                    <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4 }}>
                      {entry.rows.length} row{entry.rows.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Current Layer Action */}
        <div style={sectionCard}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 16 }}>
            {isEvaluation ? "Your Evaluation" : "Your Decision"}
          </div>

          {isLayerAlreadyComplete ? (
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 14, borderRadius: 10, background: COLORS.greenPale, color: COLORS.textPrimary }}>
              <LockIcon style={{ fontSize: 20, color: COLORS.green, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>This layer is already completed</div>
                <div style={{ fontSize: 13, color: COLORS.textSecond, marginTop: 2 }}>
                  The submission cannot be approved, rejected, or evaluated again from this link.
                </div>
              </div>
            </div>
          ) : (
            <>
              {isEvaluation && (
                <div style={{ marginBottom: 16 }}>
                  {evalForm ? (
                    <div className="eval-survey-wrap approval-survey-preview">
                      <NativeFormView runtime={evalRuntime} />
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: COLORS.red, background: COLORS.redPale, borderRadius: 8, padding: 12 }}>
                      This evaluation layer has no configured fields. Ask a form builder superuser to update the layer configuration.
                    </div>
                  )}
                </div>
              )}

              {isSignatureRequired && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginBottom: 6 }}>
                    Signature
                  </div>
                  <SignatureCapture value={signatureData} onChange={setSignatureData} disabled={actionState === "submitting"} />
                </div>
              )}

              {isCheckboxMode && (
                <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, cursor: "pointer", minHeight: 40 }}>
                  <input
                    type="checkbox"
                    checked={checkboxApproved}
                    onChange={(e) => setCheckboxApproved(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: COLORS.purple }}
                  />
                  <span style={{ fontSize: 14, color: COLORS.textPrimary }}>I approve this submission</span>
                </label>
              )}

              {/* Who is signing: what they are doing, their name, their role. */}
              {signedInApprover && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginBottom: 4 }}>
                    {approverActionLabel}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>
                    {signedInApprover}
                  </div>
                  <div style={{ fontSize: 13, color: COLORS.textSecond, marginTop: 2 }}>
                    {approverRoleLabel}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {isEvaluation ? (
                  <button
                    className="eval-action-button"
                    onClick={() => handleSubmit("confirm")}
                    style={{ ...btnPrimary, opacity: actionState === "submitting" || !evalForm || !evalValid ? 0.6 : 1 }}
                    disabled={actionState === "submitting" || !evalForm || !evalValid}
                  >
                    {actionState === "submitting" ? "Submitting..." : !evalValid ? "Fill required fields" : "Submit Evaluation"}
                  </button>
                ) : (
                  <>
                    <button
                      className="eval-action-button"
                      onClick={() => handleSubmit("approve")}
                      style={{ ...btnPrimary, opacity: actionState === "submitting" || (isCheckboxMode && !checkboxApproved) || (isSignatureRequired && !signatureData) ? 0.6 : 1 }}
                      disabled={actionState === "submitting" || (isCheckboxMode && !checkboxApproved) || (isSignatureRequired && !signatureData)}
                    >
                      {actionState === "submitting" ? "Submitting..." : isSignatureRequired && !signatureData ? "Signature required" : "Approve"}
                    </button>
                    <button className="eval-action-button" onClick={() => setRejectDialogOpen(true)} style={btnOutline} disabled={actionState === "submitting"}>
                      Reject
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Reject dialog — a rejection ends the submission, so it is confirmed on
          purpose: the backdrop ignores clicks and only Cancel closes it. */}
      {rejectDialogOpen && (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(16, 24, 40, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="eval-reject-title"
            style={{
              background: COLORS.cardBg,
              borderRadius: 14,
              padding: 24,
              width: "100%",
              maxWidth: 460,
              boxShadow: "0 24px 48px rgba(16, 24, 40, 0.28)",
            }}
          >
            <div id="eval-reject-title" style={{ fontSize: 16, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 6 }}>
              Reject this submission?
            </div>
            <div style={{ fontSize: 13, color: COLORS.textSecond, marginBottom: 16 }}>
              The submitter is told it was rejected and the workflow stops here.
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginBottom: 6 }}>
              Rejection Reason <span style={{ fontWeight: 400, color: COLORS.textMuted }}>(optional)</span>
            </div>
            <textarea
              autoFocus
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter reason if rejecting..."
              disabled={actionState === "submitting"}
              style={{
                width: "100%",
                minHeight: 96,
                padding: 10,
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                fontSize: 13,
                fontFamily: "inherit",
                resize: "vertical",
                outline: "none",
                marginBottom: 20,
              }}
            />
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button
                className="eval-action-button"
                onClick={() => setRejectDialogOpen(false)}
                style={{ ...btnPrimary, background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.textSecond }}
                disabled={actionState === "submitting"}
              >
                Cancel
              </button>
              <button
                className="eval-action-button"
                onClick={() => { setRejectDialogOpen(false); void handleSubmit("reject"); }}
                style={{ ...btnPrimary, background: COLORS.red, opacity: actionState === "submitting" ? 0.6 : 1 }}
                disabled={actionState === "submitting"}
              >
                {actionState === "submitting" ? "Submitting..." : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

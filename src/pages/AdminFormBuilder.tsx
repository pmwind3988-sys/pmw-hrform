/**
 * AdminFormBuilder.tsx — Full admin form builder with sidebar
 * Integrates with custom FormBuilder component
 */
import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { pdf } from "@react-pdf/renderer";
import FormBuilder from "../components/builder/FormBuilder";
import VersionHistory from "../components/builder/VersionHistory";
import AuditLog from "../components/builder/AuditLog";
import ProvisionOverlay from "../components/builder/ProvisionOverlay";
import LayerConfigPanel from "../components/builder/LayerConfigPanel";
import PrefilledQrPanel from "../components/builder/PrefilledQrPanel";
import TestRunLauncher from "../components/builder/TestRunLauncher";
import TestRunPanel from "../components/builder/TestRunPanel";
import { C } from "../components/builder/constants";
import { Icon } from "../components/builder/BuilderIcons";
import type { BuilderMode, BuilderToolCommand, BuilderToolKey } from "../components/builder/builderTheme";
import "../components/builder/BuilderShell.css";
import { validateLayerConfig } from "../components/builder/layerValidation";
import type { LayerFieldOption } from "../components/builder/layerValidation";
import { flattenQuestions } from "../utils/FormBuilderEngine";
import { createSpClient } from "../utils/sharepointClient";
import { acquireAccessTokenSilentOrRedirect, fetchWithAuthRecovery } from "../utils/authRecovery";
import { SP_STATIC } from "../utils/spConfig";
import {
  DEFAULT_REFERENCE_CONFIG,
  formatReferenceNumber,
  malaysiaDateKey,
  normalizeReferencePrefix,
  parseReferenceNumberConfig,
  previewReferenceNumber,
  serializeReferenceNumberConfig,
  type ReferenceNumberConfig,
} from "../utils/referenceNumber";
import FormPdfDocument, { type PdfFormData, type PdfLayerResult } from "../utils/FormPdfDocument";
import type { SurveyJson, LayerConfig, LayerConfigItem, PdfConfig } from "../types";
import type { DocumentControlHeader } from "../types";

// MUI Icons
import WarningIcon from "@mui/icons-material/Warning";
import CloseIcon from "@mui/icons-material/Close";

import {
  slugify,
  getAllFormConfigs,
  getFormConfig,
  upsertFormConfig,
  upsertApprovers,
  saveFormVersion,
  getFormVersionHistory,
  getFormVersion,
  updatePublishProfile,
  setDefaultPublishProfile,
  updatePublishProfileLayerConfig,
  updatePublishProfileDocumentHeader,
  logEvent,
  getFormLog,
  diffSurveyJson,
  DEFAULT_PUBLISH_KEY,
  normalizePublishKey,
  bootstrapSystemLists,
  provisionFormList,
  deleteForm,
  hardDeleteForm,
  setActiveBuilderSite,
  resetActiveBuilderSite,
  getActiveBuilderSiteUrl,
} from "../utils/formBuilderSP";
import { resolveSite, availableSites, isSiteKey, siteAppOrigin, HOME_SITE_KEY, type SiteKey } from "../config/sites";

/**
 * `isGroupMember` returns false for a missing group, a 403 and a network error
 * alike, so a denial on a secondary site cannot be told apart from its result.
 * List the groups that actually exist there — a name mismatch is by far the
 * likeliest cause, and without this the only way to find the right name is to
 * guess and redeploy.
 */
async function describeSiteGroups(
  client: { acquireToken: () => Promise<string> },
  siteUrl: string,
  expected: string,
): Promise<string> {
  try {
    const token = await client.acquireToken();
    const res = await fetch(`${siteUrl}/_api/web/sitegroups?$select=Title`, {
      headers: { Accept: "application/json;odata=nometadata", Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return `Could not list groups on ${siteUrl} — HTTP ${res.status}.`;
    const titles: string[] = ((await res.json()).value || []).map((g: { Title: string }) => g.Title);
    if (titles.includes(expected)) {
      return `The group "${expected}" does exist there, so this is a membership problem, not a naming one.`;
    }
    return `That site has no group named "${expected}". It has: ${titles.map((t) => `"${t}"`).join(", ")}.`;
  } catch (e) {
    return `Could not list groups on ${siteUrl}: ${e instanceof Error ? e.message : String(e)}`;
  }
}

const DEFAULT_COMPANIES = [
  "PMW INDUSTRIES SDN BHD",
  "PMW CONCRETE INDUSTRIES SDN BHD",
  "PMW LIGHTING INDUSTRIES SDN BHD",
  "PMW WINABUMI SDN BHD",
].join("\n");
const COMPANY_FIELD_NAME = "company";
const COMPANY_FIELD_LABEL = "Company";
type MetaTextKey = "formTitle" | "formId" | "formVersion" | "slug" | "isoStandards" | "companies" | "logoUrl";
type DocumentHeaderKey = keyof DocumentControlHeader;
type PublishIntent = "profile" | "live";
const DEFAULT_PDF_CONFIG: PdfConfig = {
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
  primaryColor: "#0078D4",
  secondaryColor: "#6264A7",
};
const DEFAULT_DOCUMENT_HEADER: DocumentControlHeader = {
  documentNumber: "",
  issueNumber: "",
  effectiveDate: "",
  revisionNumber: "",
  revisionDate: "",
};

function getLayerFieldOptions(json: SurveyJson | null | undefined): LayerFieldOption[] {
  if (!json) return [];
  return flattenQuestions(json)
    .map((field) => ({
      name: field.name,
      title: typeof field.title === "string" ? field.title : undefined,
      type: field.type,
      inputType: field.inputType,
    }))
    .filter((field) => !!field.name);
}

function getEffectiveLayerCount(config: LayerConfig | null, fallback: number): number {
  if (!config) return fallback;
  const branchCounts = (config.manualBranches ?? []).map((branch) => branch.layers.length);
  return Math.max(config.layers.length, ...branchCounts, 0);
}

function withDocumentHeaderDefaults(header: DocumentControlHeader, formId: string, version: string): DocumentControlHeader {
  return {
    ...DEFAULT_DOCUMENT_HEADER,
    ...header,
    documentNumber: header.documentNumber?.trim() || formId.trim(),
    revisionNumber: header.revisionNumber?.trim() || version.trim(),
  };
}

function firstLayerValidationMessage(errors: string[]): string {
  if (errors.length <= 1) return errors[0] || "Layer configuration is invalid.";
  return `${errors[0]} (+${errors.length - 1} more)`;
}

// ── Design tokens ─────────────────────────────────────────────────────────────
// Layout, type and colour for the workspace live in BuilderShell.css. What's
// left here is what the legacy panels rendered inside the modes still expect.
const G = `body{background:${C.offWhite};color:${C.textPrimary}}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important;scroll-behavior:auto!important}}`;
const inp = {
  width: "100%",
  height: 34,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "0 11px",
  fontSize: 13,
  fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif",
  color: C.textPrimary,
  background: C.white,
  outline: "none",
};

// ── Simple Spinner component (inline) ─────────────────────────────────────
const Spinner = ({ size = 18 }: { size?: number }) => (
  <div style={{
    width: size,
    height: size,
    border: `2px solid #D1D5DB`,
    borderTop: `2px solid ${C.purple}`,
    borderRadius: "50%",
    animation: "spin 0.9s linear infinite",
    flexShrink: 0,
  }} />
);

// ── Inline helper components ──────────────────────────────────────────────────

function TextInput({ value, onChange, placeholder, error, disabled, ...rest }: { value: string; onChange: (v: string) => void; placeholder?: string; error?: string; disabled?: boolean; [k: string]: unknown }) {
  const [f, setF] = useState(false);
  return (
    <>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          ...inp,
          borderColor: error ? C.red : f ? C.purple : C.border,
          boxShadow: f ? `0 0 0 3px ${error ? C.redPale : C.purplePale}` : "none",
          transition: "border-color .15s, box-shadow .15s, opacity .15s",
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? "not-allowed" : "text",
        }}
        onFocus={() => setF(true)}
        onBlur={() => setF(false)}
        {...rest}
      />
      {error && <div style={{ fontSize: 10, color: C.red, marginTop: 3 }}>{error}</div>}
    </>
  );
}



type SampleAssets = {
  signatureDataUrl: string;
  photoDataUrl: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function choiceValue(choice: unknown): unknown {
  if (isRecord(choice)) return choice.value ?? choice.text ?? choice.Title ?? "";
  return choice;
}

function firstChoiceValue(choices: unknown): unknown {
  return Array.isArray(choices) && choices.length > 0 ? choiceValue(choices[0]) : "Sample option";
}

function firstTwoChoiceValues(choices: unknown): unknown[] {
  if (!Array.isArray(choices) || choices.length === 0) return ["Sample option A", "Sample option B"];
  return choices.slice(0, 2).map(choiceValue);
}

function collectPdfSampleElements(json: SurveyJson): Record<string, unknown>[] {
  const elements: Record<string, unknown>[] = [];
  const walk = (items: unknown[]) => {
    for (const item of items) {
      if (!isRecord(item)) continue;
      const type = textValue(item.type).toLowerCase();
      if (textValue(item.name) && type !== "panel") elements.push(item);
      if (type === "dynamicmatrix" || type === "matrixdynamic" || type === "tableinput") continue;
      if (Array.isArray(item.elements)) walk(item.elements);
      if (Array.isArray(item.columns)) {
        for (const column of item.columns) {
          if (isRecord(column) && Array.isArray(column.elements)) walk(column.elements);
        }
      }
    }
  };
  for (const page of json.pages ?? []) walk(page.elements ?? []);
  return elements;
}

function fieldLooksLikeImage(field: Record<string, unknown>): boolean {
  const haystack = [
    textValue(field.type),
    textValue(field.inputType),
    textValue(field.name),
    textValue(field.title),
    textValue(field.acceptedTypes),
  ].join(" ").toLowerCase();
  return /\b(image|photo|picture|camera|png|jpg|jpeg)\b/.test(haystack);
}

function sampleValueForElement(field: Record<string, unknown>, index: number, assets: SampleAssets): unknown {
  const type = textValue(field.type).toLowerCase();
  const inputType = textValue(field.inputType).toLowerCase();
  const name = textValue(field.name).toLowerCase();
  const title = textValue(field.title).toLowerCase();

  if (type.includes("signature") || name.includes("signature") || title.includes("signature")) return assets.signatureDataUrl;
  if (fieldLooksLikeImage(field)) return assets.photoDataUrl;
  if (type === "file" || type === "fileupload") return "sample-document.pdf";
  if (type === "boolean") return true;
  if (type === "checkbox" || type === "tagbox") return firstTwoChoiceValues(field.choices);
  if (["dropdown", "radiogroup", "imagepicker"].includes(type)) return firstChoiceValue(field.choices);
  if (type === "rating") {
    const rateValues = field.rateValues;
    if (Array.isArray(rateValues) && rateValues.length > 0) return choiceValue(rateValues[rateValues.length - 1]);
    return typeof field.rateMax === "number" ? field.rateMax : 5;
  }
  if (type === "multipletext") {
    const items = Array.isArray(field.items) ? field.items : [];
    return Object.fromEntries(items.filter(isRecord).map((item, itemIndex) => [textValue(item.name) || `item${itemIndex + 1}`, `Sample ${itemIndex + 1}`]));
  }
  if (inputType === "number" || inputType === "range" || ["number", "currency", "counter"].includes(type)) return 100 + index;
  if (inputType === "date" || type === "date") return "2026-06-29";
  if (inputType === "datetime-local" || type === "datetime") return "2026-06-29T09:30";
  if (inputType === "time" || type === "time") return "09:30";
  if (inputType === "email" || name.includes("email")) return "sample.submitter@example.com";
  if (inputType === "tel" || name.includes("phone")) return "+60 12-345 6789";
  if (name.includes("employee") || name.includes("staff")) return "EMP-0001";
  if (name === COMPANY_FIELD_NAME) return DEFAULT_COMPANIES.split("\n")[0] || "PMW INDUSTRIES SDN BHD";
  if (type === "comment" || type === "richedit" || type === "html") {
    return "This is sample long-form content generated to preview wrapping, spacing, and PDF field layout.";
  }
  return `Sample answer ${index + 1}`;
}

function sampleMatrixRows(field: Record<string, unknown>, assets: SampleAssets): Record<string, unknown>[] {
  const columns = Array.isArray(field.columns) ? field.columns.filter(isRecord) : [];
  if (columns.length === 0) return [];
  return [0, 1].map((rowIndex) => {
    const row: Record<string, unknown> = {};
    columns.forEach((column, columnIndex) => {
      const name = textValue(column.name) || `Column${columnIndex + 1}`;
      row[name] = sampleValueForElement(column, rowIndex + columnIndex, assets);
    });
    return row;
  });
}

function buildSampleResponseData(json: SurveyJson, assets: SampleAssets): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const fields = collectPdfSampleElements(json);
  fields.forEach((field, index) => {
    const name = textValue(field.name);
    if (!name) return;
    const type = textValue(field.type).toLowerCase();
    if (type === "dynamicmatrix" || type === "matrixdynamic" || type === "tableinput") {
      const rows = sampleMatrixRows(field, assets);
      data[`${name}_childRows`] = { columns: field.columns, rows };
      data[name] = rows;
      return;
    }
    data[name] = sampleValueForElement(field, index, assets);
  });
  return data;
}

function sampleWorkflowLayers(config: LayerConfig | null): LayerConfigItem[] {
  if (!config) return [];
  if (config.layers.length > 0) return config.layers;
  return config.manualBranches?.[0]?.layers ?? [];
}

function hasSampleEvaluationLayer(config: LayerConfig | null): boolean {
  return sampleWorkflowLayers(config).some((layer) => layer.type === "evaluation");
}

function buildSampleLayerResults(config: LayerConfig | null, assets: SampleAssets, manualPhysical: boolean): PdfLayerResult[] {
  const layers = sampleWorkflowLayers(config);
  return layers.map((layer, index) => {
    const email = layer.assignee.type === "user" && layer.assignee.value
      ? layer.assignee.value
      : `${layer.type}${layer.layerNumber}@example.com`;
    if (layer.type === "evaluation") {
      if (manualPhysical) {
        return {
          layerNumber: layer.layerNumber,
          type: "evaluation",
          status: "Manual Evaluation Required",
          email: "",
          evaluationFields: {},
          evaluationSurveyElements: layer.surveyElements ?? [],
          confirmerEmail: "",
          confirmerName: "Manual / physical evaluator",
        };
      }
      return {
        layerNumber: layer.layerNumber,
        type: "evaluation",
        status: index === 0 ? "Pending" : "Approved",
        email,
        signedAt: "2026-06-29T10:30:00.000Z",
        signature: assets.signatureDataUrl,
        evaluationFields: buildSampleResponseData({ pages: [{ name: "Evaluation", elements: layer.surveyElements ?? [] }] }, assets),
        evaluationSurveyElements: layer.surveyElements ?? [],
        confirmerEmail: email,
        confirmerName: `Sample Evaluator ${layer.layerNumber}`,
      };
    }
    return {
      layerNumber: layer.layerNumber,
      type: "approval",
      status: index === 0 ? "Pending" : "Approved",
      email,
      signedAt: "2026-06-29T10:30:00.000Z",
      signature: assets.signatureDataUrl,
    };
  });
}

function makeCanvasPng(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  draw(ctx);
  return canvas.toDataURL("image/png");
}

function makeSamplePdfAssets(): SampleAssets {
  const signatureDataUrl = makeCanvasPng(360, 120, (ctx) => {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, 360, 120);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(36, 72);
    ctx.bezierCurveTo(88, 18, 120, 110, 168, 58);
    ctx.bezierCurveTo(205, 18, 230, 98, 316, 46);
    ctx.stroke();
    ctx.strokeStyle = "#D1D5DB";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(28, 94);
    ctx.lineTo(330, 94);
    ctx.stroke();
  });
  const photoDataUrl = makeCanvasPng(360, 220, (ctx) => {
    const gradient = ctx.createLinearGradient(0, 0, 360, 220);
    gradient.addColorStop(0, "#DBEAFE");
    gradient.addColorStop(1, "#EEF2FF");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 360, 220);
    ctx.fillStyle = "#0078D4";
    ctx.fillRect(28, 28, 304, 164);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 26px Arial";
    ctx.fillText("SAMPLE PHOTO", 72, 116);
    ctx.font = "14px Arial";
    ctx.fillText("Generated preview image", 98, 145);
  });
  return { signatureDataUrl, photoDataUrl };
}

function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 15_000);
}

/** A disclosure card. A closed card still answers the question it hides via its
 *  right-aligned summary. */
function Disclosure({ title, sub, summary, open, onToggle, children }: { title: string; sub?: string; summary?: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="bx-disclosure">
      <button type="button" className="bx-disc-head" onClick={onToggle} aria-expanded={open}>
        <span style={{ minWidth: 0 }}>
          <span className="bx-disc-title">{title}</span>
          {sub && <span className="bx-disc-sub">{sub}</span>}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
          {summary && <span className="bx-meta">{summary}</span>}
          <Icon name="chevdown" size={16} strokeWidth={1.6} className={`bx-chev${open ? " is-open" : ""}`} />
        </span>
      </button>
      {open && <div className="bx-disc-body">{children}</div>}
    </div>
  );
}

/** `{label / hint} … {value} [action]` — the Publish disclosures’ one row shape. */
function ActionRow({ label, hint, value, action, onAction, disabled, busy }: { label: string; hint?: string; value?: ReactNode; action: string; onAction: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <div className="bx-actionrow">
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontSize: 15 }}>{label}</div>
        {hint && <div className="bx-meta">{hint}</div>}
      </div>
      {value !== undefined && value !== "" && <span className="bx-meta bx-num">{value}</span>}
      <button type="button" className="bx-btn bx-btn-secondary bx-btn-sm" onClick={onAction} disabled={disabled || busy}>
        {busy && <span className="bx-spinner" style={{ width: 13, height: 13 }} />}
        {action}
      </button>
    </div>
  );
}

function TextField({ id, label, value, onChange, placeholder, disabled, error, note, type }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; error?: string; note?: ReactNode; type?: string }) {
  return (
    <div className="bx-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type || "text"}
        className={`bx-input${error ? " is-error" : ""}`}
        style={{ height: 40 }}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      {error ? <div style={{ fontSize: 13.5, fontWeight: 400, color: C.red, marginTop: 5 }}>{error}</div> : note ? <div style={{ marginTop: 5 }}>{note}</div> : null}
    </div>
  );
}

function CheckRow({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="bx-check">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>
        <span style={{ display: "block" }}>{label}</span>
        {hint && <span className="bx-check-hint">{hint}</span>}
      </span>
    </label>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminFormBuilder() {
  const navigate = useNavigate();
  const { formTitle: paramTitle } = useParams<{ formTitle: string }>();
  const [searchParams] = useSearchParams();

  // The target site lives in the URL so it survives a refresh. Deriving it from
  // component state instead would let a reload silently drop back to the home
  // site while the banner still claimed otherwise — and the next publish would
  // write the wrong site's lists.
  const requestedSiteKey = searchParams.get("site") || HOME_SITE_KEY;
  const siteKey: SiteKey = isSiteKey(requestedSiteKey) ? requestedSiteKey : HOME_SITE_KEY;
  const [siteError, setSiteError] = useState<string | null>(null);
  const activeSite = useMemo(() => {
    try {
      return resolveSite(siteKey);
    } catch {
      return null;
    }
  }, [siteKey]);
  const isSecondarySite = siteKey !== HOME_SITE_KEY;
  // Every navigation that stays inside the builder has to carry the site with
  // it. Routing to a bare /admin/builder path drops the query parameter, and
  // because the site is read back from the URL the page would reload as the home
  // site — banner, form library and the next publish all silently switching to
  // PMW HR while the form on screen still belongs to OSHES.
  const builderPath = useCallback(
    (formTitle?: string) => {
      const base = formTitle ? `/admin/builder/${encodeURIComponent(formTitle)}` : "/admin/builder";
      return isSecondarySite ? `${base}?site=${encodeURIComponent(siteKey)}` : base;
    },
    [siteKey, isSecondarySite],
  );
  // Every link this page hands out belongs to the deployment that serves the
  // target site's forms, not to the one the builder is open on. Derived from the
  // URL like the site key itself, so it can never disagree with the banner.
  const appOrigin = activeSite ? siteAppOrigin(activeSite) : window.location.origin;

  // Bind the SharePoint layer to the requested site before anything reads it,
  // and put it back on the way out so a later in-app navigation cannot inherit
  // this page's target.
  useLayoutEffect(() => {
    try {
      setActiveBuilderSite(siteKey);
      setSiteError(null);
    } catch (e) {
      setSiteError(e instanceof Error ? e.message : String(e));
    }
    return () => { resetActiveBuilderSite(); };
  }, [siteKey]);
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const [authChecked, setAuthChecked] = useState(false);
  const [siteUsers, setSiteUsers] = useState<{ email: string; name: string }[]>([]);
  const tokenRef = useRef<string | null>(null);
  /** Render-safe copy of the SharePoint token for panels that fetch on demand. */
  const [spToken, setSpToken] = useState<string | null>(null);
  const [allForms, setAllForms] = useState<{ Id?: string; Title: string; FormID?: string; CurrentVersion?: string; CurrentPublishKey?: string; CurrentPublishLabel?: string; Slug?: string; NumberOfApprovalLayer?: number; IsPublic?: boolean; IsPublished?: boolean; ApprovalRules?: string }[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [originalVersion, setOriginalVersion] = useState<string | null>(null);
  const [meta, setMeta] = useState({
    formTitle: "",
    formId: "",
    formVersion: "1.0",
    slug: "",
    isoStandards: "ISO 9001 · ISO 14001 · ISO 45001",
    companies: DEFAULT_COMPANIES,
    companyChoiceEnabled: false,
    logoUrl: "",
    publishKey: DEFAULT_PUBLISH_KEY,
    publishLabel: "Production",
    documentHeader: DEFAULT_DOCUMENT_HEADER,
    pdfConfig: DEFAULT_PDF_CONFIG,
  });
  const [showBanner, setShowBanner] = useState(true);
  const [isPublic, setIsPublic] = useState(true);
  const [referenceConfig, setReferenceConfig] = useState<ReferenceNumberConfig>(DEFAULT_REFERENCE_CONFIG);
  const [samplePdfGenerating, setSamplePdfGenerating] = useState<"" | "filled" | "manual">("");
  const setM = useCallback((k: MetaTextKey, v: string) => setMeta(m => ({ ...m, [k]: v })), []);
  const setPdfConfig = useCallback((patch: Partial<PdfConfig>) => {
    setMeta(m => ({ ...m, pdfConfig: { ...m.pdfConfig, ...patch } }));
  }, []);
  const [slugError, setSlugError] = useState("");
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugLocked, setSlugLocked] = useState(false);
  const [slugManual, setSlugManual] = useState(false);
  const [isDraft, setIsDraft] = useState(false);
  const [numLayers, setNumLayers] = useState(0);
  const [layers, setLayers] = useState<{ email: string; name: string }[]>(Array.from({ length: 5 }, () => ({ email: "", name: "" })));
  const [surveyJson, setSurveyJson] = useState<SurveyJson | null>(null);
  const [initialJson, setInitialJson] = useState<SurveyJson | null>(null);
  const prevSurveyRef = useRef<SurveyJson | null>(null);
  /** Which of the four modes owns the work area. Chrome stays constant. */
  const [mode, setMode] = useState<BuilderMode>("build");
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [isFormBuilderSuperuser, setIsFormBuilderSuperuser] = useState(false);
  const [testRunOpen, setTestRunOpen] = useState(false);
  const [testRunPanelOpen, setTestRunPanelOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [previewMenuOpen, setPreviewMenuOpen] = useState(false);
  const [toolCommand, setToolCommand] = useState<BuilderToolCommand | null>(null);
  const toolNonceRef = useRef(0);
  /** Every disclosure on Settings and Publish, collapsed until asked for. */
  const [disc, setDisc] = useState<Record<string, boolean>>({});
  const toggleDisc = useCallback((k: string) => setDisc(d => ({ ...d, [k]: !d[k] })), []);
  const [saveBusy, setSaveBusy] = useState<"" | "draft" | "publish">("");
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [saveStamp, setSaveStamp] = useState(0);
  const markSaved = useCallback(() => setSaveStamp(s => s + 1), []);
  const runTool = useCallback((key: BuilderToolKey) => {
    toolNonceRef.current += 1;
    setToolCommand({ key, nonce: toolNonceRef.current });
    setToolsOpen(false);
    setPreviewMenuOpen(false);
    // Every tool panel — preview included — belongs to the form itself, so the
    // work area returns to Builder rather than opening a modal over Settings.
    setMode("build");
  }, []);
  const [versionHistory, setVersionHistory] = useState<{ FormVersion: string; PublishKey?: string; PublishLabel?: string; PublishStatus?: "active" | "off"; PublishExpiresAt?: string; DisabledAt?: string; DisabledBy?: string; PublishedBy?: string; PublishedAt?: string }[]>([]);
  const [viewingOld, setViewingOld] = useState<{ version: string; publishKey: string; json: SurveyJson } | null>(null);
  const [auditLog, setAuditLog] = useState<{ EventType: string; EventSummary?: string; BeforeJSON?: string; AfterJSON?: string; EventAt?: string }[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [provLogs, setProvLogs] = useState<{ m: string; t: string }[]>([]);
  const [provisioning, setProvisioning] = useState(false);
  const [provOk, setProvOk] = useState(false);
  const [provErr, setProvErr] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ Id?: string; Title: string } | null>(null);
  const [hardDeleteConfirm, setHardDeleteConfirm] = useState<{ Id?: string; Title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [approvalRules, setApprovalRules] = useState<{ conditionField: string; rules: { when: string; layers: { email: string; name: string; role: string }[] }[] } | null>(null);
  const [layerConfig, setLayerConfig] = useState<LayerConfig | null>(null);
  const [profileLayerEdit, setProfileLayerEdit] = useState<{ version: string; publishKey: string; publishLabel: string } | null>(null);
  const [profileLayerSaving, setProfileLayerSaving] = useState(false);
  const [renameProfileBusy, setRenameProfileBusy] = useState("");
  const [qrProfile, setQrProfile] = useState<{ surveyJson: SurveyJson; version: string; publishKey: string; publishLabel: string } | null>(null);
  const [qrProfileLoading, setQrProfileLoading] = useState("");
  const [docHeaderProfile, setDocHeaderProfile] = useState<{ version: string; publishKey: string; publishLabel: string; header: DocumentControlHeader } | null>(null);
  const [docHeaderLoading, setDocHeaderLoading] = useState("");
  const [docHeaderSaving, setDocHeaderSaving] = useState(false);
  const setDocumentHeader = (key: DocumentHeaderKey, value: string) => {
    setMeta(m => ({ ...m, documentHeader: { ...m.documentHeader, [key]: value } }));
  };

  const pLog = useCallback((m: string, t: string = "info") => setProvLogs(l => [...l, { m, t }]), []);
  const showToast = useCallback((msg: string, type: string = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    if (accessDenied) {
      showToast(accessDenied, "err");
      setAccessDenied(null);
    }
  }, [accessDenied, showToast]);

  // Escape closes the two header/nav menus; the modals own their own handling.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSwitcherOpen(false);
      setToolsOpen(false);
      setPreviewMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const proposedVersion = meta.formVersion.trim() || originalVersion || "1.0";

  useEffect(() => {
    if (slugManual || slugLocked) return;
    setM("slug", slugify(meta.formTitle));
  }, [meta.formTitle, slugManual, slugLocked, setM]);

  useEffect(() => {
    if (!meta.slug) {
      setSlugError("");
      return;
    }
    let cancelled = false;
    setSlugChecking(true);
    const t = setTimeout(() => {
      const slugToCheck = slugify(meta.slug);
      if (!slugToCheck) {
        if (!cancelled) { setSlugError(""); setSlugChecking(false); }
        return;
      }
      const others = allForms.filter(
        f => f.Slug && slugify(f.Slug) === slugToCheck && f.Title !== (isEditing ? meta.formTitle : null)
      );
      const conflict = others.length > 0 ? others[0].Title : null;
      if (!cancelled) {
        setSlugError(conflict ? `Used by: "${conflict}"` : "");
        setSlugChecking(false);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [meta.slug, isEditing, meta.formTitle, allForms]);

  useEffect(() => {
    if (inProgress !== InteractionStatus.None) return;
    if (!isAuthenticated) {
      navigate("/user/dashboard");
      return;
    }
    if (siteError || !activeSite) return;

    const homeClient = createSpClient(instance, accounts);
    // Authority for a secondary site comes from that site's own group, not from
    // HR's. Membership is per-site in SharePoint, so this check has to run
    // against the site the builder is about to write to.
    const targetGroup = activeSite.adminGroup;
    const targetClient = isSecondarySite
      ? createSpClient(instance, accounts, activeSite.url)
      : homeClient;

    Promise.all([
      homeClient.isGroupMember(SP_STATIC.adminGroup),
      homeClient.isGroupMember(SP_STATIC.formBuilderSuperuserGroup),
      isSecondarySite && targetGroup
        ? targetClient.isGroupMember(targetGroup).catch(() => false)
        : Promise.resolve(true),
    ]).then(async ([admin, builderSuperuser, mayUseTargetSite]) => {
      if (!admin || !builderSuperuser || !mayUseTargetSite) {
        // Name the check that actually failed. The redirect below unmounts the
        // toast almost immediately, so the console line is the one that survives.
        const missing = [
          !admin && `"${SP_STATIC.adminGroup}" on ${resolveSite(HOME_SITE_KEY).label}`,
          !builderSuperuser && `"${SP_STATIC.formBuilderSuperuserGroup}" on ${resolveSite(HOME_SITE_KEY).label}`,
          !mayUseTargetSite && `"${targetGroup}" on ${activeSite.label}`,
        ].filter(Boolean).join(" · ");
        let detail = `Form builder access denied — not a member of: ${missing}.`;
        if (!mayUseTargetSite && targetGroup) {
          detail += ` ${await describeSiteGroups(targetClient, activeSite.url, targetGroup)}`;
        }
        console.error(detail);
        setAccessDenied(detail);
        setTimeout(() => navigate("/user/dashboard"), 200);
        return;
      }
      setAuthChecked(true);
      // Reaching this point already required `builderSuperuser` above (the
      // redirect a few lines up fires otherwise), so this just makes that
      // membership available to gate UI, rather than re-deriving it.
      setIsFormBuilderSuperuser(true);
      const origin = new URL(activeSite.url || "https://placeholder.sharepoint.com").origin;
      try {
        const token = await acquireAccessTokenSilentOrRedirect(instance, { scopes: [`${origin}/AllSites.Manage`], account: accounts[0] });
        tokenRef.current = token;
        setSpToken(token);
        bootstrapSystemLists(token, () => { }).catch(() => { /* best-effort system list bootstrap */ });
        try {
          const ud = await fetchWithAuthRecovery(`${getActiveBuilderSiteUrl()}/_api/web/siteusers?$select=Email,Title&$filter=PrincipalType eq 1`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata" },
          }).then(res => res.json());
          setSiteUsers((ud.value || []).filter((u: { Email: string }) => u.Email).map((u: { Email: string; Title: string }) => ({ email: u.Email, name: u.Title })));
        } catch { /* ignore */ }
        getAllFormConfigs(token).then(setAllForms).catch(e => showToast(`Could not load forms: ${e.message}`, "err"));
      } catch (e) {
        showToast("Authentication error. Please refresh.", "err");
      }
    }).catch(() => {
      showToast("Could not initialize the form builder.", "err");
    });
  }, [isAuthenticated, inProgress, navigate, instance, accounts, showToast, activeSite, isSecondarySite, siteError]);

  const refreshLib = useCallback(() => {
    setTimeout(() => {
      getAllFormConfigs(tokenRef.current!).then(setAllForms).catch(() => { /* ignore */ });
    }, 800);
  }, []);

  const loadForEdit = useCallback(async (cfg: Record<string, unknown> | string) => {
    try {
      const token = tokenRef.current;
      if (!token) return;
      const c = typeof cfg === "object" ? cfg : await getFormConfig(token, cfg);
      if (!c) {
        showToast("Form not found.", "err");
        return;
      }
      const activePublishKey = normalizePublishKey(c.CurrentPublishKey as string | undefined);
      const data = await getFormVersion(token, c.Title as string, c.CurrentVersion as string || "1.0", activePublishKey);
      if (!data) {
        showToast("Version data not found.", "err");
        return;
      }
      const loaded = (data.surveyJson || data) as SurveyJson;
      const loadedMeta = (data.meta as Record<string, unknown>) || {};
      const loadedDocumentHeader = loadedMeta.documentHeader && typeof loadedMeta.documentHeader === "object" && !Array.isArray(loadedMeta.documentHeader)
        ? loadedMeta.documentHeader as DocumentControlHeader
        : {};
      setInitialJson(loaded);
      setSurveyJson(loaded);
      prevSurveyRef.current = loaded;
      setViewingOld(null);
      setProfileLayerEdit(null);
      setMeta({
        formTitle: c.Title as string,
        formId: (c.FormID as string) || "",
        formVersion: (c.CurrentVersion as string) || "1.0",
        slug: (c.Slug as string) || slugify(c.Title as string),
        isoStandards: (data.meta as Record<string, unknown>)?.isoStandards as string || "ISO 9001 · ISO 14001 · ISO 45001",
        companies: loadedMeta.companies as string || DEFAULT_COMPANIES,
        companyChoiceEnabled: loadedMeta.companyChoiceEnabled === true,
        logoUrl: ((data.meta as Record<string, unknown>)?.logoUrl as string) || "",
        publishKey: activePublishKey,
        publishLabel: (loadedMeta.publishLabel as string) || (c.CurrentPublishLabel as string) || "Production",
        documentHeader: {
          ...DEFAULT_DOCUMENT_HEADER,
          ...loadedDocumentHeader,
          documentNumber: loadedDocumentHeader.documentNumber || (c.FormID as string) || "",
          revisionNumber: loadedDocumentHeader.revisionNumber || (c.CurrentVersion as string) || "",
        },
        pdfConfig: loadedMeta.pdfConfig && typeof loadedMeta.pdfConfig === "object" && !Array.isArray(loadedMeta.pdfConfig)
          ? { ...DEFAULT_PDF_CONFIG, ...(loadedMeta.pdfConfig as Partial<PdfConfig>) }
          : DEFAULT_PDF_CONFIG,
      });
      setShowBanner((data.meta as Record<string, unknown>)?.showBanner !== false);
      setOriginalVersion(c.CurrentVersion as string);
      setNumLayers((c.NumberOfApprovalLayer as number) || 0);
      setSlugLocked(true);
      setIsEditing(true);
      setIsDraft(c.IsPublished === false);
      setIsPublic(c.IsPublic !== false);
      setReferenceConfig(parseReferenceNumberConfig(c.ReferenceConfig));
      if (c.ApprovalRules) {
        try {
          setApprovalRules(JSON.parse(c.ApprovalRules as string));
        } catch {
          setApprovalRules(null);
        }
      } else {
        setApprovalRules(null);
      }
      // Load enhanced LayerConfig if present, otherwise derive from legacy fields
      if (c.LayerConfig) {
        try {
          const parsed = JSON.parse(c.LayerConfig as string) as LayerConfig;
          setLayerConfig(parsed);
          // Derive numLayers from layerConfig for backward compat
          setNumLayers(parsed.layers.length);
        } catch {
          setLayerConfig(null);
        }
      } else {
        setLayerConfig(null);
      }
      markSaved();
      getFormVersionHistory(token, c.Title as string).then(setVersionHistory).catch(() => {});
      setLogLoading(true);
      getFormLog(token, c.Title as string).then(l => {
        setAuditLog(l);
        setLogLoading(false);
      }).catch(() => { setLogLoading(false); });
    } catch (e) {
      showToast(`Could not load form: ${(e as Error).message}`, "err");
    }
  }, [showToast, markSaved]);

  useEffect(() => {
    if (!paramTitle || !authChecked || !tokenRef.current) return;
    loadForEdit(decodeURIComponent(paramTitle)).catch(() => { /* loadForEdit reports user-facing errors */ });
  }, [paramTitle, authChecked, loadForEdit]);

  const handleNew = () => {
    setIsEditing(false);
    setOriginalVersion(null);
    setInitialJson(null);
    prevSurveyRef.current = null;
    setSlugLocked(false);
    setSlugManual(false);
    setVersionHistory([]);
    setAuditLog([]);
    setViewingOld(null);
    setProfileLayerEdit(null);
    setShowBanner(true);
    setMeta({
      formTitle: "",
      formId: "",
      formVersion: "1.0",
      slug: "",
      isoStandards: "ISO 9001 · ISO 14001 · ISO 45001",
      companies: DEFAULT_COMPANIES,
      companyChoiceEnabled: false,
      logoUrl: "",
      publishKey: DEFAULT_PUBLISH_KEY,
      publishLabel: "Production",
      documentHeader: DEFAULT_DOCUMENT_HEADER,
      pdfConfig: DEFAULT_PDF_CONFIG,
    });
    setNumLayers(0);
    setLayers(Array.from({ length: 5 }, () => ({ email: "", name: "" })));
    setLayerConfig(null);
    setIsDraft(false);
    setIsPublic(true);
    setReferenceConfig(DEFAULT_REFERENCE_CONFIG);
    setMode("build");
    setDisc({});
    setSavedSignature(null);
    navigate(builderPath());
  };

  const handleGenerateSamplePdf = async (mode: "filled" | "manual") => {
    if (!isEditing || !meta.formTitle.trim() || !surveyJson) {
      showToast("Select an existing form before generating a sample PDF.", "err");
      return;
    }
    if (mode === "manual" && !hasSampleEvaluationLayer(layerConfig)) {
      showToast("Add at least one evaluation layer before generating a manual / physical evaluation sample.", "err");
      return;
    }

    setSamplePdfGenerating(mode);
    try {
      const assets = makeSamplePdfAssets();
      const manualPhysical = mode === "manual";
      const sampleData: PdfFormData = {
        surveyJson,
        responseData: buildSampleResponseData(surveyJson, assets),
        layerResults: buildSampleLayerResults(layerConfig, assets, manualPhysical),
        meta: {
          submittedBy: "sample.submitter@example.com",
          submittedAt: "2026-06-29T09:30:00.000Z",
          formTitle: meta.formTitle,
          formVersion: proposedVersion || meta.formVersion,
          formStatus: manualPhysical ? "manual evaluation sample" : "sample",
        },
        isoStandards: meta.isoStandards,
        logoUrl: meta.logoUrl || "/logo-128.png",
        pdfConfig: manualPhysical
          ? { ...meta.pdfConfig, enabled: true, title: meta.pdfConfig.title || "Manual Evaluation Form", includeEmptyEvaluationFields: true, showEvaluationDetails: true }
          : meta.pdfConfig,
        documentHeader: withDocumentHeaderDefaults(meta.documentHeader, meta.formId, proposedVersion || meta.formVersion),
      };
      const blob = await pdf(FormPdfDocument(sampleData)).toBlob();
      const safeTitle = slugify(meta.formTitle) || "form";
      downloadPdfBlob(blob, `${safeTitle}-${manualPhysical ? "manual-physical-evaluation-sample" : "sample-layout"}.pdf`);
      showToast(manualPhysical ? "Manual / physical evaluation sample PDF generated." : "Sample PDF generated with fake data.", "ok");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not generate sample PDF.", "err");
    } finally {
      setSamplePdfGenerating("");
    }
  };

  const handleSaveDraft = useCallback(async () => {
    if (!meta.formTitle.trim()) {
      showToast("Form title is required.", "err");
      setMode("settings");
      return;
    }
    const draftCompanyOptions = meta.companies.split(/\r?\n/).map(c => c.trim()).filter(Boolean);
    if (meta.companyChoiceEnabled && draftCompanyOptions.length < 2) {
      showToast("Add at least two companies before saving the required Company selector.", "err");
      setMode("settings");
      return;
    }
    const token = tokenRef.current;
    if (!token) { showToast("Authentication is unavailable. Please refresh and try again.", "err"); return; }
    const usedJson = surveyJson;
    if (!usedJson) { showToast("Add at least one field before saving.", "err"); return; }
    const version = meta.formVersion.trim() || "1.0";
    const publishKey = normalizePublishKey(meta.publishKey);
    const publishLabel = meta.publishLabel.trim() || (publishKey === DEFAULT_PUBLISH_KEY ? "Production" : publishKey);
    const documentHeader = withDocumentHeaderDefaults(meta.documentHeader, meta.formId, version);
    const userEmail = accounts[0]?.username || "admin";
    setSaveBusy("draft");
    try {
      const layerConfigToSave: LayerConfig | null = layerConfig || (numLayers > 0 ? {
        version: "1.0" as const,
        layers: layers.slice(0, numLayers).map((l, i): LayerConfigItem => ({
          layerNumber: i + 1,
          type: "approval" as const,
          authMode: "365" as const,
          assignee: { type: "user" as const, value: l.email },
          title: `Layer ${i + 1}`,
          confirmationType: "signature" as const,
          allowRejectionReason: true,
        })),
      } : null);
      const layerValidation = validateLayerConfig(layerConfigToSave, getLayerFieldOptions(usedJson));
      if (layerValidation.errors.length > 0) {
        showToast(firstLayerValidationMessage(layerValidation.errors), "err");
        setMode("flow");
        return;
      }
      await upsertFormConfig(token, meta.formTitle.trim(), {
        formId: meta.formId.trim() || undefined,
        numLayers: getEffectiveLayerCount(layerConfigToSave, numLayers),
        slug: meta.slug,
        version,
        currentPublishKey: publishKey,
        currentPublishLabel: publishLabel,
        isPublished: false,
        isPublic,
        conditionField: approvalRules?.conditionField || layerConfig?.routing?.[0]?.conditionField || "",
        approvalRules: approvalRules || null,
        layerConfig: layerConfigToSave ? JSON.stringify(layerConfigToSave) : "",
        referenceConfig: serializeReferenceNumberConfig(referenceConfig),
      });
      await saveFormVersion(token, {
        listTitle: meta.formTitle.trim(),
        slug: meta.slug,
        version,
        publishKey,
        publishLabel,
        surveyJson: usedJson,
        meta: { isoStandards: meta.isoStandards, companies: meta.companies, companyChoiceEnabled: meta.companyChoiceEnabled, formId: meta.formId, formVersion: version, publishKey, publishLabel, documentHeader, showBanner, logoUrl: meta.logoUrl, pdfConfig: meta.pdfConfig },
        changedBy: userEmail,
        layerConfig: layerConfigToSave,
      });
      setIsDraft(true);
      setIsEditing(true);
      setOriginalVersion(version);
      setSlugLocked(true);
      setMeta(m => ({ ...m, formVersion: version, publishKey, publishLabel, documentHeader }));
      showToast(`Draft saved for "${meta.formTitle}".`, "ok");
      markSaved();
      refreshLib();
    } catch (e) {
      showToast(`Could not save draft: ${(e as Error).message}`, "err");
    } finally {
      setSaveBusy("");
    }
  }, [meta, surveyJson, numLayers, layers, slugError, isPublic, referenceConfig, showBanner, approvalRules, layerConfig, accounts, showToast, refreshLib, markSaved]);

  const handleDelete = (f: { Id?: string; Title: string }) => {
    setDeleteConfirm({ Id: f.Id, Title: f.Title });
  };

  const handleHardDelete = (f: { Id?: string; Title: string }) => {
    setHardDeleteConfirm({ Id: f.Id, Title: f.Title });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm || !tokenRef.current) return;
    setDeleting(true);
    try {
      const result = await deleteForm(
        tokenRef.current,
        deleteConfirm.Title,
        deleteConfirm.Id || "",
      );
      showToast(
        `Form deleted. Removed "${deleteConfirm.Title}" with ${result.versionsDeleted} version${result.versionsDeleted === 1 ? "" : "s"}, ${result.logEntriesDeleted} log entr${result.logEntriesDeleted === 1 ? "y" : "ies"}, and ${result.approversDeleted} approver${result.approversDeleted === 1 ? "" : "s"}.`,
        "ok"
      );
      if (meta.formTitle === deleteConfirm.Title) {
        handleNew();
      }
      refreshLib();
    } catch (e) {
      showToast(`Could not delete form: ${(e as Error).message}`, "err");
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const handleHardDeleteConfirm = async () => {
    if (!hardDeleteConfirm || !tokenRef.current) return;
    setDeleting(true);
    try {
      const result = await hardDeleteForm(
        tokenRef.current,
        hardDeleteConfirm.Title,
        hardDeleteConfirm.Id || "",
      );
      const parts: string[] = [];
      if (result.responseListDeleted) {
        parts.push("response list deleted entirely");
      }
      parts.push(`${result.versionsDeleted} versions, ${result.logEntriesDeleted} log entries, ${result.approversDeleted} approvers removed`);
      showToast(
        `Form and submission data deleted. Removed "${hardDeleteConfirm.Title}"; ${parts.join("; ")}.`,
        "ok"
      );
      if (meta.formTitle === hardDeleteConfirm.Title) {
        handleNew();
      }
      refreshLib();
    } catch (e) {
      showToast(`Could not permanently delete form: ${(e as Error).message}`, "err");
    } finally {
      setDeleting(false);
      setHardDeleteConfirm(null);
    }
  };

  const handleViewVersion = async (ver: string, publishKey?: string) => {
    try {
      const data = await getFormVersion(tokenRef.current!, meta.formTitle, ver, publishKey || DEFAULT_PUBLISH_KEY);
      if (!data) {
        showToast(`v${ver} (${publishKey || DEFAULT_PUBLISH_KEY}) not found.`, "err");
        return;
      }
      setViewingOld({ version: ver, publishKey: publishKey || DEFAULT_PUBLISH_KEY, json: (data.surveyJson || data) as SurveyJson });
      setMode("publish"); setDisc(d => ({ ...d, versions: true }));
    } catch (e) {
      showToast(`Could not load version: ${(e as Error).message}`, "err");
    }
  };

  const refreshVersionHistory = useCallback(() => {
    const token = tokenRef.current;
    if (!token || !meta.formTitle) return;
    getFormVersionHistory(token, meta.formTitle).then(setVersionHistory).catch(() => { /* non-blocking */ });
  }, [meta.formTitle]);

  const handleSetDefaultProfile = async (version: string, publishKey: string, publishLabel: string) => {
    const token = tokenRef.current;
    if (!token) return;
    try {
      await setDefaultPublishProfile(token, {
        listTitle: meta.formTitle,
        version,
        publishKey,
        publishLabel,
      });
      const data = await getFormVersion(token, meta.formTitle, version, publishKey);
      if (data?.surveyJson) {
        const loaded = data.surveyJson as SurveyJson;
        setInitialJson(loaded);
        setSurveyJson(loaded);
        prevSurveyRef.current = loaded;
      }
      if (data?.layerConfig) {
        setLayerConfig(data.layerConfig as LayerConfig);
      }
      setOriginalVersion(version);
      setMeta(m => ({ ...m, formVersion: version, publishKey, publishLabel }));
      refreshLib();
      refreshVersionHistory();
      showToast(`"${publishLabel}" is now the default public profile.`, "ok");
    } catch (e) {
      showToast(`Could not set default profile: ${(e as Error).message}`, "err");
    }
  };

  const handleToggleProfileStatus = async (version: string, publishKey: string, nextStatus: "active" | "off") => {
    const token = tokenRef.current;
    if (!token) return;
    if (nextStatus === "off" && version === originalVersion && publishKey === normalizePublishKey(meta.publishKey)) {
      showToast("Set another profile as default before turning this one off.", "err");
      return;
    }
    try {
      await updatePublishProfile(token, {
        listTitle: meta.formTitle,
        version,
        publishKey,
        publishStatus: nextStatus,
        changedBy: accounts[0]?.username || "admin",
      });
      refreshVersionHistory();
      showToast(nextStatus === "active" ? "Profile turned on." : "Profile turned off.", "ok");
    } catch (e) {
      showToast(`Could not update profile: ${(e as Error).message}`, "err");
    }
  };

  const handleRenameProfile = async (version: string, publishKey: string, publishLabel: string) => {
    const token = tokenRef.current;
    if (!token) return;
    const nextLabel = publishLabel.trim();
    if (!nextLabel) {
      showToast("Enter a name for this profile.", "err");
      return;
    }
    setRenameProfileBusy(`${version}::${publishKey}`);
    try {
      await updatePublishProfile(token, {
        listTitle: meta.formTitle,
        version,
        publishKey,
        publishLabel: nextLabel,
        changedBy: accounts[0]?.username || "admin",
      });
      // Mirror the new name in the builder when the renamed profile is the open one.
      if (version === originalVersion && normalizePublishKey(publishKey) === normalizePublishKey(meta.publishKey)) {
        setMeta(m => ({ ...m, publishLabel: nextLabel }));
      }
      if (profileLayerEdit?.version === version && normalizePublishKey(profileLayerEdit.publishKey) === normalizePublishKey(publishKey)) {
        setProfileLayerEdit(edit => edit && { ...edit, publishLabel: nextLabel });
      }
      refreshVersionHistory();
      refreshLib();
      showToast(`Profile renamed to "${nextLabel}".`, "ok");
    } catch (e) {
      showToast(`Could not rename profile: ${(e as Error).message}`, "err");
    } finally {
      setRenameProfileBusy("");
    }
  };

  const handleSetProfileExpiry = async (version: string, publishKey: string, expiryDate: string) => {
    const token = tokenRef.current;
    if (!token) return;
    const publishExpiresAt = expiryDate ? new Date(`${expiryDate}T23:59:59`).toISOString() : "";
    if (
      publishExpiresAt &&
      Date.parse(publishExpiresAt) <= Date.now() &&
      version === originalVersion &&
      publishKey === normalizePublishKey(meta.publishKey)
    ) {
      showToast("Set another profile as default before expiring this one.", "err");
      return;
    }
    try {
      await updatePublishProfile(token, {
        listTitle: meta.formTitle,
        version,
        publishKey,
        publishExpiresAt,
        changedBy: accounts[0]?.username || "admin",
      });
      refreshVersionHistory();
      showToast(expiryDate ? "Profile expiry updated." : "Profile expiry cleared.", "ok");
    } catch (e) {
      showToast(`Could not update expiry: ${(e as Error).message}`, "err");
    }
  };

  const handleCopyProfileLink = async (publishKey: string) => {
    const normalized = normalizePublishKey(publishKey);
    const path = `/form/${meta.slug}${normalized === DEFAULT_PUBLISH_KEY ? "" : `?publish=${normalized}`}`;
    try {
      await navigator.clipboard.writeText(`${appOrigin}${path}`);
      showToast("Profile link copied.", "ok");
    } catch {
      showToast(`${appOrigin}${path}`, "info");
    }
  };

  const handleOpenProfileQr = async (version: string, publishKey: string, publishLabel: string) => {
    const token = tokenRef.current;
    if (!token) return;
    if (!meta.slug) {
      showToast("Publish this form first so the QR targets the live /form route.", "err");
      return;
    }
    const qrKey = `${version}::${publishKey}`;
    setQrProfileLoading(qrKey);
    try {
      // Load this profile's own survey version so prefill fields match exactly
      // what a scanner of that profile will see.
      const data = await getFormVersion(token, meta.formTitle, version, publishKey);
      const profileSurveyJson = (data?.surveyJson ?? data) as SurveyJson | undefined;
      if (!profileSurveyJson) {
        showToast(`Profile "${publishLabel}" v${version} not found.`, "err");
        return;
      }
      setQrProfile({ surveyJson: profileSurveyJson, version, publishKey, publishLabel });
    } catch (e) {
      showToast(`Could not load profile for QR: ${(e as Error).message}`, "err");
    } finally {
      setQrProfileLoading("");
    }
  };

  const handleOpenProfileDocHeader = async (version: string, publishKey: string, publishLabel: string) => {
    const token = tokenRef.current;
    if (!token) return;
    const docKey = `${version}::${publishKey}`;
    setDocHeaderLoading(docKey);
    try {
      // Load this profile's own stored header so edits are per-profile.
      const data = await getFormVersion(token, meta.formTitle, version, publishKey);
      const loadedMeta = data?.meta && typeof data.meta === "object" && !Array.isArray(data.meta)
        ? data.meta as Record<string, unknown>
        : {};
      const loadedHeader = loadedMeta.documentHeader && typeof loadedMeta.documentHeader === "object" && !Array.isArray(loadedMeta.documentHeader)
        ? loadedMeta.documentHeader as DocumentControlHeader
        : {};
      setDocHeaderProfile({ version, publishKey, publishLabel, header: { ...DEFAULT_DOCUMENT_HEADER, ...loadedHeader } });
    } catch (e) {
      showToast(`Could not load profile header: ${(e as Error).message}`, "err");
    } finally {
      setDocHeaderLoading("");
    }
  };

  const handleSaveProfileDocHeader = async () => {
    const token = tokenRef.current;
    if (!token || !docHeaderProfile) return;
    setDocHeaderSaving(true);
    try {
      const documentHeader = withDocumentHeaderDefaults(docHeaderProfile.header, meta.formId, docHeaderProfile.version);
      await updatePublishProfileDocumentHeader(token, {
        listTitle: meta.formTitle,
        version: docHeaderProfile.version,
        publishKey: docHeaderProfile.publishKey,
        documentHeader,
        changedBy: accounts[0]?.username || "admin",
      });
      // If this profile is the one currently loaded in the builder, mirror the change.
      if (normalizePublishKey(meta.publishKey) === normalizePublishKey(docHeaderProfile.publishKey) && meta.formVersion === docHeaderProfile.version) {
        setMeta(m => ({ ...m, documentHeader }));
      }
      refreshVersionHistory();
      showToast(`Document header saved for ${docHeaderProfile.publishLabel} v${docHeaderProfile.version}.`, "ok");
      setDocHeaderProfile(null);
    } catch (e) {
      showToast(`Could not save profile header: ${(e as Error).message}`, "err");
    } finally {
      setDocHeaderSaving(false);
    }
  };

  const handleEditProfileLayers = async (version: string, publishKey: string, publishLabel: string) => {
    const token = tokenRef.current;
    if (!token) return;
    try {
      const data = await getFormVersion(token, meta.formTitle, version, publishKey);
      if (!data) {
        showToast(`Profile "${publishLabel}" v${version} not found.`, "err");
        return;
      }
      const loadedLayerConfig = data.layerConfig && typeof data.layerConfig === "object" && !Array.isArray(data.layerConfig)
        ? data.layerConfig as LayerConfig
        : { version: "1.0" as const, layers: [] };
      if (data.surveyJson) {
        const loadedSurveyJson = data.surveyJson as SurveyJson;
        setSurveyJson(loadedSurveyJson);
        setInitialJson(loadedSurveyJson);
        prevSurveyRef.current = loadedSurveyJson;
      }
      setLayerConfig(loadedLayerConfig);
      setProfileLayerEdit({ version, publishKey, publishLabel });
      setMeta(m => ({ ...m, formVersion: version, publishKey, publishLabel }));
      setNumLayers(getEffectiveLayerCount(loadedLayerConfig, 0));
      setMode("flow");
      showToast(`Editing layers for ${publishLabel} v${version}.`, "ok");
    } catch (e) {
      showToast(`Could not load profile layers: ${(e as Error).message}`, "err");
    }
  };

  const handleSaveProfileLayers = async () => {
    const token = tokenRef.current;
    if (!token || !profileLayerEdit) return;
    const configToSave = layerConfig || { version: "1.0" as const, layers: [] };
    const layerValidation = validateLayerConfig(configToSave, getLayerFieldOptions(surveyJson));
    if (layerValidation.errors.length > 0) {
      showToast(firstLayerValidationMessage(layerValidation.errors), "err");
      return;
    }
    setProfileLayerSaving(true);
    try {
      await updatePublishProfileLayerConfig(token, {
        listTitle: meta.formTitle,
        version: profileLayerEdit.version,
        publishKey: profileLayerEdit.publishKey,
        layerConfig: configToSave,
        changedBy: accounts[0]?.username || "admin",
      });
      setNumLayers(getEffectiveLayerCount(configToSave, 0));
      refreshVersionHistory();
      showToast(`Layer settings saved for ${profileLayerEdit.publishLabel} v${profileLayerEdit.version}.`, "ok");
    } catch (e) {
      showToast(`Could not save profile layers: ${(e as Error).message}`, "err");
    } finally {
      setProfileLayerSaving(false);
    }
  };

  const handleStartProfileLayersFromScratch = () => {
    setLayerConfig({ version: "1.0", layers: [] });
    setNumLayers(0);
    setProfileLayerEdit(null);
    showToast("Layer editor reset for this profile draft. Existing published profiles are unchanged until you publish.", "ok");
  };

  const handleCreateNewProfileDraft = () => {
    const publishKey = `profile-${Date.now().toString(36)}`;
    setMeta((current) => ({
      ...current,
      publishKey,
      publishLabel: "New Profile",
    }));
    // Inherit the workflow that is already loaded. Blanking it here meant every
    // evaluation layer's questions had to be rebuilt by hand for each profile;
    // "Start from scratch" in the profile layer editor still clears them.
    setNumLayers(getEffectiveLayerCount(layerConfig, numLayers));
    setProfileLayerEdit(null);
    setMode("flow");
    showToast("New profile draft ready, inheriting the current layers. The active profile remains unchanged.", "ok");
  };

  // Refresh the log the moment its disclosure on Publish is opened.
  const logOpen = !!disc.log;
  useEffect(() => {
    if (!logOpen || !isEditing || !tokenRef.current) return;
    setLogLoading(true);
    getFormLog(tokenRef.current, meta.formTitle).then(l => {
      setAuditLog(l);
      setLogLoading(false);
    }).catch(() => setLogLoading(false));
  }, [logOpen, isEditing, meta.formTitle]);

  const handlePublish = useCallback(async (jsonArg?: SurveyJson, intent: PublishIntent = "live") => {
    if (!meta.formTitle.trim()) {
      showToast("Form title required.", "err");
      setMode("settings");
      return;
    }
    if (!meta.formId.trim()) {
      showToast("Form ID required.", "err");
      setMode("settings");
      return;
    }
    const publishCompanyOptions = meta.companies.split(/\r?\n/).map(c => c.trim()).filter(Boolean);
    if (meta.companyChoiceEnabled && publishCompanyOptions.length < 2) {
      showToast("Add at least two companies before publishing the required Company selector.", "err");
      setMode("settings");
      return;
    }
    if (slugError) {
      showToast(`Slug conflict: ${slugError}`, "err");
      return;
    }
    const usedJson = jsonArg || surveyJson as SurveyJson;
    if (!usedJson) {
      showToast("No fields yet.", "err");
      return;
    }
    if (intent === "profile" && !isEditing) {
      showToast("Use Actual publish for the first live form, then add extra profiles.", "err");
      return;
    }
    const token = tokenRef.current;
    if (!token) {
      showToast("Auth unavailable.", "err");
      return;
    }
    const version = meta.formVersion.trim() || "1.0";
    const publishKey = normalizePublishKey(meta.publishKey);
    const publishLabel = meta.publishLabel.trim() || (publishKey === DEFAULT_PUBLISH_KEY ? "Production" : publishKey);
    const documentHeader = withDocumentHeaderDefaults(meta.documentHeader, meta.formId, version);
    const title = meta.formTitle.trim();
    const userEmail = accounts[0]?.username || "admin";
    const layerConfigToSave: LayerConfig | null = layerConfig || (numLayers > 0 ? {
      version: "1.0" as const,
      layers: layers.slice(0, numLayers).map((l, i): LayerConfigItem => ({
        layerNumber: i + 1,
        type: "approval" as const,
        authMode: "365" as const,
        assignee: { type: "user" as const, value: l.email },
        title: `Layer ${i + 1}`,
        confirmationType: "signature" as const,
        allowRejectionReason: true,
      })),
    } : null);
    const layerValidation = validateLayerConfig(layerConfigToSave, getLayerFieldOptions(usedJson));
    if (layerValidation.errors.length > 0) {
      showToast(firstLayerValidationMessage(layerValidation.errors), "err");
      setMode("flow");
      return;
    }
    const effectiveNumLayers = getEffectiveLayerCount(layerConfigToSave, numLayers);
    const activeLayers = layers.slice(0, effectiveNumLayers);
    setProvLogs([]);
    setProvOk(false);
    setProvErr(false);
    setProvisioning(true);
    try {
      const diffs = diffSurveyJson(prevSurveyRef.current, usedJson) as { type: string; summary: string; before: unknown; after: unknown }[];
      const slugToCheck = slugify(meta.slug);
      const others = allForms.filter(
        f => f.Slug && slugify(f.Slug) === slugToCheck && f.Title !== (isEditing ? title : null)
      );
      const conflict = others.length > 0 ? others[0].Title : null;
      if (conflict) throw new Error(`Slug "${meta.slug}" used by "${conflict}".`);

      await provisionFormList(token, title, usedJson, pLog, {
        numLayers: effectiveNumLayers,
        minLayerColumns: 3,
      });

      if (intent === "live") {
        pLog(`Updating Form Config…`);
        await upsertFormConfig(token, title, {
          formId: meta.formId.trim(),
          numLayers: effectiveNumLayers,
          slug: meta.slug,
          version,
          currentPublishKey: publishKey,
          currentPublishLabel: publishLabel,
          isPublished: true,
          isPublic,
          conditionField: approvalRules?.conditionField || layerConfig?.routing?.[0]?.conditionField || "",
          approvalRules: approvalRules || null,
          layerConfig: layerConfigToSave ? JSON.stringify(layerConfigToSave) : "",
          referenceConfig: serializeReferenceNumberConfig(referenceConfig),
        });
        pLog(`Form Config saved`, "ok");
      } else {
        pLog(`Saving profile only; default /form route stays unchanged.`);
      }

      if (intent === "live" && effectiveNumLayers > 0) {
        pLog(`Writing approvers…`);
        // When using the new LayerConfigPanel, layer assignee emails are stored
        // in layerConfig.layers[].assignee.value (type: "user") or as field references.
        // The old `activeLayers` (from `layers` state) is empty in that case,
        // so we must extract from layerConfig instead.
        const approversToWrite = layerConfig
          ? layerConfig.layers.map((l) => ({
              email: l.assignee.type === "user" ? l.assignee.value : "",
              name: l.title ?? "",
            }))
          : activeLayers;
        await upsertApprovers(token, title, approversToWrite);
        pLog(`Approvers saved`, "ok");
      }

      pLog(`Saving version v${version}…`);
      await saveFormVersion(token, {
        listTitle: title,
        slug: meta.slug,
        version,
        publishKey,
        publishLabel,
        surveyJson: usedJson,
        meta: { isoStandards: meta.isoStandards, companies: meta.companies, companyChoiceEnabled: meta.companyChoiceEnabled, formId: meta.formId, formVersion: version, publishKey, publishLabel, documentHeader, showBanner, logoUrl: meta.logoUrl, pdfConfig: meta.pdfConfig },
        changedBy: userEmail,
        layerConfig: layerConfigToSave,
      });
      pLog(`Version saved`, "ok");

      if (!isEditing) {
        await logEvent(token, {
          formTitle: title,
          eventType: "FORM_CREATED",
          changedBy: userEmail,
          summary: `Created form at /form/${meta.slug}`,
          before: null,
          after: { slug: meta.slug, version, publishKey, publishLabel },
        });
      } else if (intent === "live") {
        for (const d of diffs) {
          await logEvent(token, {
            formTitle: title,
            eventType: d.type,
            changedBy: userEmail,
            summary: d.summary,
            before: d.before,
            after: d.after,
          });
        }
        await logEvent(token, {
          formTitle: title,
          eventType: "VERSION_BUMPED",
          changedBy: userEmail,
          summary: `v${originalVersion} to v${version}`,
          before: { version: originalVersion },
          after: { version, publishKey },
        });
        await logEvent(token, {
          formTitle: title,
          eventType: "PUBLISHED",
          changedBy: userEmail,
          summary: `Published v${version} (${publishLabel})`,
          before: null,
          after: { version, slug: meta.slug, publishKey, publishLabel },
        });
      } else {
        await logEvent(token, {
          formTitle: title,
          eventType: "PUBLISH_PROFILE_SAVED",
          changedBy: userEmail,
          summary: `Saved profile ${publishLabel} for v${version}`,
          before: null,
          after: { version, slug: meta.slug, publishKey, publishLabel },
        });
      }
      pLog(
        intent === "live"
          ? `"${title}" v${version} (${publishLabel}) live at /form/${meta.slug}`
          : `"${title}" v${version} (${publishLabel}) profile saved; actual live profile unchanged`,
        "ok"
      );
      setProvOk(true);
      markSaved();
      if (intent === "live") prevSurveyRef.current = usedJson;
      if (intent === "live") setOriginalVersion(version);
      setMeta(m => ({ ...m, formVersion: version, publishKey, publishLabel, documentHeader }));
      setIsEditing(true);
      if (intent === "live") setIsDraft(false);
      setProfileLayerEdit(null);
      setSlugLocked(true);
      refreshLib();
      getFormVersionHistory(token, title).then(setVersionHistory);
    } catch (e) {
      pLog(`Could not ${intent === "live" ? "publish" : "save profile"}: ${(e as Error).message}`, "err");
      setProvErr(true);
    }
  }, [meta, surveyJson, numLayers, layers, isEditing, originalVersion, slugError, isPublic, referenceConfig, showBanner, pLog, refreshLib, approvalRules, layerConfig, accounts, showToast, markSaved]);

  /**
   * The header's save dot reflects the real thing: this builder does not
   * auto-persist, so it compares the working state against whatever was last
   * loaded, saved or published rather than running a fake timer.
   */
  const stateSignature = useMemo(
    () => JSON.stringify([surveyJson, meta, showBanner, isPublic, layerConfig, referenceConfig]),
    [surveyJson, meta, showBanner, isPublic, layerConfig, referenceConfig]
  );
  const signatureRef = useRef(stateSignature);
  signatureRef.current = stateSignature;
  useEffect(() => {
    if (saveStamp === 0) return;
    // Runs after the commit that bumped the stamp, so the ref already holds the
    // state the save actually wrote, including the version the handler set.
    setSavedSignature(signatureRef.current);
  }, [saveStamp]);
  const unsaved = savedSignature !== null && savedSignature !== stateSignature;

  // A misconfigured site must stop the builder outright. Falling back to the home
  // site would leave the operator authoring against HR's lists while believing
  // they were somewhere else.
  if (siteError) {
    return (
      <div style={{ minHeight: "100vh", background: C.offWhite, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{G}</style>
        <div style={{ maxWidth: 460, background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "32px 28px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.red, marginBottom: 8 }}>Site not available</div>
          <p style={{ fontSize: 13, lineHeight: 1.65, color: C.textSecond, margin: "0 0 18px" }}>{siteError}</p>
          <button type="button" className="bx-btn" onClick={() => navigate("/admin/builder")}>
            Back to {resolveSite(HOME_SITE_KEY).label}
          </button>
        </div>
      </div>
    );
  }

  if (!authChecked) {
    return (
      <div style={{ minHeight: "100vh", background: C.offWhite, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{G}</style>
        <Spinner size={36} />
      </div>
    );
  }

  const formBuilderKey = viewingOld
    ? `view_${meta.formTitle}_v${viewingOld.version}_${viewingOld.publishKey}`
    : initialJson
      ? `edit_${meta.formTitle}_${JSON.stringify(initialJson).slice(0, 60)}`
      : "new";
  // Recomputed on every render rather than memoised on the date: the builder can
  // be left open across midnight, and a stale preview would misstate the format.
  const referencePreview = previewReferenceNumber(referenceConfig);
  const companyOptions = meta.companies
    .split(/\r?\n/)
    .map(c => c.trim())
    .filter(Boolean);
  const companyFieldCandidates = surveyJson
    ? flattenQuestions(surveyJson).filter(q => {
        const name = String(q.name || "").toLowerCase();
        const title = String(q.title || "").toLowerCase();
        return name.includes("company") || title.includes("company");
      })
    : [];
  const extraCompanyFields = companyFieldCandidates.filter(q => q.name !== COMPANY_FIELD_NAME);
  const layerFieldOptions = getLayerFieldOptions(surveyJson);
  const toastColor = toast?.type === "err" ? C.red : toast?.type === "ok" ? C.green : C.purple;

  const activePublishKey = normalizePublishKey(meta.publishKey);
  const fieldCount = surveyJson ? flattenQuestions(surveyJson).length : 0;
  const publishBlocked = !meta.formTitle.trim() || !meta.formId.trim() || !!slugError || !!viewingOld;

  const MODES: { id: BuilderMode; label: string; icon: string; hint: string }[] = [
    { id: "build", label: "Builder", icon: "blocks", hint: "Fields, labels and layout" },
    { id: "flow", label: "Workflow", icon: "flow", hint: "Who approves or evaluates, and in what order" },
    { id: "settings", label: "Settings", icon: "gear", hint: "Identity, route and access" },
    { id: "publish", label: "Publish", icon: "rocket", hint: "Review, then make it live" },
  ];
  const modeHint = MODES.find(m => m.id === mode)?.hint ?? "";
  const modeLabel = MODES.find(m => m.id === mode)?.label ?? "";

  const TOOL_GROUPS: { name: string; items: { key: BuilderToolKey; label: string; hint: string }[] }[] = [
    {
      name: "Content",
      items: [
        { key: "templates", label: "Field templates", hint: "Templates" },
        { key: "i18n", label: "Translations", hint: "i18n" },
        { key: "comments", label: "Field comments", hint: "Comments" },
        { key: "theme", label: "Theme editor", hint: "Theme" },
        { key: "display", label: "Form display", hint: "SurveyJS" },
      ],
    },
    {
      name: "Data",
      items: [
        { key: "data", label: "Data sources", hint: "SharePoint" },
        { key: "integrations", label: "Integrations", hint: "Webhooks" },
        { key: "export", label: "Export", hint: "JSON / XLSX" },
        { key: "provisioning", label: "Provisioning preview", hint: "SP columns" },
        { key: "json", label: "Survey JSON", hint: "Raw" },
      ],
    },
    {
      name: "Governance",
      items: [
        { key: "permissions", label: "Field permissions", hint: "Roles" },
        { key: "submission", label: "Submission settings", hint: "Behaviour" },
      ],
    },
  ];

  const saveState = saveBusy
    ? { text: "Saving…", color: C.textMuted }
    : unsaved
      ? { text: "Unsaved changes", color: C.amber }
      : savedSignature === null
        ? { text: "Nothing saved yet", color: C.textMuted }
        : { text: "All changes saved", color: C.purple };

  const effectiveLayerCount = getEffectiveLayerCount(layerConfig, numLayers);

  const readiness = [
    { label: "Form title", value: meta.formTitle || "Not set", done: !!meta.formTitle.trim() },
    { label: "Form ID / document no.", value: meta.formId || "Not set", done: !!meta.formId.trim() },
    { label: "Route slug", value: meta.slug ? `/form/${meta.slug}` : "Not set", done: !!meta.slug.trim() && !slugError },
    { label: "Fields on the form", value: String(fieldCount), done: fieldCount > 0 },
    // Read the live layer config, not the legacy `numLayers` counter — that one is
    // only written on load and never re-synced when the Workflow tab edits layers,
    // so it reported "None (files direct)" for forms that do have approvers.
    { label: "Workflow layers", value: effectiveLayerCount ? String(effectiveLayerCount) : "None (files direct)", done: true },
  ];

  return (
    <div className="bx-root">
      <style>{G}</style>

      {toast && (
        <div className="bx-toast" role="status" aria-live="polite">
          <span className="bx-dot" style={{ background: toastColor, marginTop: 6 }} />
          <span>{toast.msg}</span>
        </div>
      )}

      {/* A builder pointed somewhere other than the home site says so on every
          screen. The whole risk of this feature is authoring against the wrong
          site without noticing, so this is deliberately hard to miss. */}
      {isSecondarySite && activeSite && (
        <div className="bx-site-banner" role="status">
          <Icon name="doc" size={13} strokeWidth={1.8} />
          <span>
            Editing forms on <strong>{activeSite.label}</strong> — changes here do not affect {resolveSite(HOME_SITE_KEY).label}.
            {" "}Links open on <strong>{appOrigin.replace(/^https?:\/\//, "")}</strong>.
          </span>
          <button type="button" className="bx-site-banner-exit" onClick={() => navigate("/admin/builder")}>
            Back to {resolveSite(HOME_SITE_KEY).label}
          </button>
        </div>
      )}

      {/* ── Brand header ─────────────────────────────────────────────── */}
      <header className="bx-header">
        <span className="bx-mark"><Icon name="doc" size={17} strokeWidth={1.6} /></span>
        <span className="bx-wordmark">PMW Forms</span>
        {availableSites().length > 1 && (
          <label className="bx-site-picker">
            <span className="bx-site-picker-label">Site</span>
            <select
              value={siteKey}
              // A full navigation, not a state change: it reloads the builder
              // against the new site, so no request started under the previous
              // site can land afterwards.
              onChange={(e) => {
                const next = e.target.value;
                window.location.assign(next === HOME_SITE_KEY ? "/admin/builder" : `/admin/builder?site=${encodeURIComponent(next)}`);
              }}
            >
              {availableSites().map((site) => (
                <option key={site.key} value={site.key}>{site.label}</option>
              ))}
            </select>
          </label>
        )}
        <span className="bx-vrule" />

        <div style={{ flex: "none", position: "relative" }}>
          <button
            type="button"
            className="bx-switcher"
            onClick={() => { setSwitcherOpen(o => !o); setToolsOpen(false); setPreviewMenuOpen(false); }}
            aria-expanded={switcherOpen}
            aria-haspopup="true"
            title="Switch form"
          >
            <span className="bx-switcher-label">{meta.formTitle || "New form"}</span>
            <Icon name="chevdown" size={13} strokeWidth={1.6} style={{ opacity: 0.6, flex: "none" }} />
          </button>
          {switcherOpen && (
            <div className="bx-dropdown">
              <div className="bx-dropdown-head">
                <span className="bx-eyebrow">Form library</span>
                <button
                  type="button"
                  className="bx-btn bx-btn-primary bx-btn-sm"
                  style={{ height: 30 }}
                  onClick={() => { setSwitcherOpen(false); handleNew(); }}
                >
                  New form
                </button>
              </div>
              <div className="bx-dropdown-list">
                {allForms.length === 0 && (
                  <div style={{ padding: "18px 14px", fontSize: 14, color: C.textMuted }}>No forms yet. Start one with “New form”.</div>
                )}
                {allForms.map(f => (
                  <div key={f.Id || f.Title} style={{ display: "flex", alignItems: "stretch" }}>
                    <button
                      type="button"
                      className="bx-libraryrow"
                      aria-current={f.Title === meta.formTitle}
                      onClick={() => { setSwitcherOpen(false); void loadForEdit(f as unknown as Record<string, unknown>); }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontWeight: 600, fontSize: 15, letterSpacing: "-0.006em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.Title}</span>
                        <span style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 2 }}>
                          <span className="bx-meta bx-num">{f.FormID || "No form ID"}</span>
                          <span className="bx-meta">v{f.CurrentVersion || "1.0"}</span>
                          <span className={`bx-tag ${f.IsPublished === false ? "bx-tag-warn" : "bx-tag-accent"}`}>{f.IsPublished === false ? "Draft" : "Published"}</span>
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="bx-ghost bx-ghost-bare"
                      style={{ alignSelf: "center", marginRight: 2 }}
                      title={`Delete “${f.Title}” — keeps its submissions`}
                      onClick={() => { setSwitcherOpen(false); handleDelete(f); }}
                    >
                      <Icon name="trash" size={15} strokeWidth={1.6} />
                    </button>
                    <button
                      type="button"
                      className="bx-ghost bx-ghost-bare"
                      style={{ alignSelf: "center", marginRight: 8 }}
                      title={`Delete “${f.Title}” and ALL its submissions — irreversible`}
                      onClick={() => { setSwitcherOpen(false); handleHardDelete(f); }}
                    >
                      <Icon name="trashall" size={15} strokeWidth={1.6} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: "none", display: "flex", gap: 6, alignItems: "center" }}>
          <span className="bx-tag bx-tag-outline">Admin</span>
          {isEditing && <span className="bx-tag bx-tag-neutral bx-chip-sec">v{meta.formVersion}</span>}
          {isDraft && <span className="bx-tag bx-tag-warn bx-chip-sec">Draft</span>}
          {/* Rehearse this form's approval workflow with every email redirected
              to one nominated address. Enabled for drafts as well as published
              forms — only a form that has never been saved (nothing loaded
              into `meta` yet) has nothing to test. */}
          {isFormBuilderSuperuser && isEditing && (
            <button
              type="button"
              className="bx-btn bx-btn-sm"
              title="Rehearse this form's approval workflow — every email goes only to the address you enter"
              onClick={() => setTestRunOpen(true)}
            >
              Test workflow
            </button>
          )}
          {isFormBuilderSuperuser && isEditing && (
            <button
              type="button"
              className="bx-btn bx-btn-sm"
              title="See past test runs, their checklists, and render each one's PDF"
              onClick={() => setTestRunPanelOpen(true)}
            >
              Test runs
            </button>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }} />

        <div className="bx-save" role="status" aria-live="polite">
          {saveBusy ? <span className="bx-spinner" style={{ width: 12, height: 12 }} /> : <span className="bx-dot" style={{ background: saveState.color }} />}
          {saveState.text}
        </div>
      </header>

      {/* ── Mode rail ────────────────────────────────────────────────── */}
      <nav className="bx-nav" aria-label="Builder modes">
        <button type="button" className="bx-navitem bx-navhome" title="Back to the admin dashboard" onClick={() => window.location.assign("/")}>
          <Icon name="home" size={19} strokeWidth={1.6} />
        </button>
        {MODES.map(m => (
          <button
            key={m.id}
            type="button"
            className={`bx-navitem${mode === m.id ? " is-on" : ""}`}
            aria-current={mode === m.id}
            aria-label={m.label}
            title={`${m.label} — ${m.hint}`}
            onClick={() => { setMode(m.id); setToolsOpen(false); setSwitcherOpen(false); setPreviewMenuOpen(false); }}
          >
            <Icon name={m.icon} size={17} strokeWidth={1.6} />
            <span className="bx-navitem-label">{m.label}</span>
          </button>
        ))}

        <div style={{ flex: 1 }} />
        <div className="bx-navhint">{modeHint}</div>

        <div style={{ position: "relative", display: "flex", alignItems: "center", paddingRight: 8 }}>
          <button
            type="button"
            className="bx-navbtn is-icon"
            onClick={() => { setToolsOpen(o => !o); setSwitcherOpen(false); setPreviewMenuOpen(false); }}
            aria-expanded={toolsOpen}
            aria-haspopup="true"
            aria-label="Tools"
            title="Templates, translations, data sources, permissions and the raw survey JSON"
          >
            <Icon name="wrench" size={16} strokeWidth={1.6} />
            <span className="bx-sr">Tools</span>
          </button>
          {toolsOpen && (
            <div className="bx-menu">
              {TOOL_GROUPS.map(group => (
                <div key={group.name} className="bx-menu-group">
                  <div className="bx-eyebrow bx-eyebrow-sm" style={{ marginBottom: 5 }}>{group.name}</div>
                  {group.items.map(item => (
                    <button key={item.key} type="button" className="bx-menurow" onClick={() => runTool(item.key)}>
                      <span>{item.label}</span>
                      <span className="bx-menurow-hint">{item.hint}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, padding: "0 16px 0 4px" }}>
          <button
            type="button"
            className="bx-navbtn is-icon"
            onClick={() => { setPreviewMenuOpen(o => !o); setToolsOpen(false); setSwitcherOpen(false); }}
            aria-expanded={previewMenuOpen}
            aria-haspopup="true"
            aria-label="Preview"
            title="Open a live preview of this form"
          >
            <Icon name="eye" size={16} strokeWidth={1.6} />
            <span className="bx-sr">Preview</span>
          </button>
          {previewMenuOpen && (
            <div className="bx-menu" style={{ width: 230, right: "auto", left: 0 }}>
              <div className="bx-menu-group">
                <div className="bx-eyebrow bx-eyebrow-sm" style={{ marginBottom: 5 }}>Live preview</div>
                {([["preview-desktop", "Desktop"], ["preview-tablet", "Tablet"], ["preview-mobile", "Mobile"]] as const).map(([key, label]) => (
                  <button key={key} type="button" className="bx-menurow" onClick={() => runTool(key)}>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {meta.slug ? (
            <a
              className="bx-navbtn is-solid"
              href={`${appOrigin}/form/${meta.slug}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Access form"
              title={`Open ${appOrigin}/form/${meta.slug} in a new tab`}
              style={{ textDecoration: "none" }}
            >
              {/* The label hides at ≤780px, so the name lives on aria-label —
                  a solid icon-only button with only a title has no accessible
                  name at all. */}
              <span className="bx-navitem-label">Access form</span>
              <Icon name="external" size={14} strokeWidth={1.6} />
            </a>
          ) : (
            <button
              type="button"
              className="bx-navbtn is-solid"
              disabled
              aria-label="Access form"
              title="Publish this form to give it a public route"
            >
              <span className="bx-navitem-label">Access form</span>
              <Icon name="external" size={14} strokeWidth={1.6} />
            </button>
          )}
        </div>
      </nav>

      {viewingOld && (
        <div style={{ flex: "none", background: C.amberPale, borderBottom: "1px solid #FDE68A", padding: "9px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 14, color: C.amber }}>
          <span>Viewing archived <strong>v{viewingOld.version}</strong> / {viewingOld.publishKey} — read only.</span>
          <button type="button" className="bx-btn bx-btn-secondary bx-btn-sm" onClick={() => setViewingOld(null)}>Back to current</button>
        </div>
      )}

      {/* ── Work area ────────────────────────────────────────────────── */}
      {/* A <main> landmark, and an h1 that names the page for screen readers.
          The visible form title is an editable input, so it cannot be the
          heading itself — without this the outline started at h2. */}
      <main className="bx-work">
        <h1 className="bx-sr">
          {`Form builder — ${meta.formTitle || "untitled form"} — ${modeLabel}`}
        </h1>

        <div style={{ display: mode === "build" ? "flex" : "none", flex: 1, minWidth: 0 }}>
          {/* The other three modes carry a visible h2; this one is the canvas
              itself, so the heading is for the outline only. */}
          <h2 className="bx-sr">Fields, labels and layout</h2>
          <FormBuilder
            key={formBuilderKey}
            initialJson={viewingOld?.json || initialJson}
            onChange={json => { if (!viewingOld) setSurveyJson(json); }}
            height="100%"
            readOnly={!!viewingOld}
            token={tokenRef.current || undefined}
            showBanner={showBanner}
            meta={{ isoStandards: meta.isoStandards, companies: meta.companies, formTitle: meta.formTitle, logoUrl: meta.logoUrl, companyChoiceEnabled: meta.companyChoiceEnabled }}
            companyChoice={{
              enabled: meta.companyChoiceEnabled,
              choices: companyOptions,
              fieldName: COMPANY_FIELD_NAME,
              title: COMPANY_FIELD_LABEL,
            }}
            sheet={{
              formId: meta.formId,
              version: meta.formVersion,
              slug: meta.slug,
              isoStandards: showBanner ? meta.isoStandards : "",
              title: meta.formTitle,
              titleLocked: isEditing,
            }}
            onTitleChange={v => setM("formTitle", v)}
            toolCommand={toolCommand}
          />
        </div>

        {/* ── Workflow ───────────────────────────────────────────────── */}
        {mode === "flow" && (
          <div className="bx-scroller">
            <div className="bx-col bx-col-wide">
              <div className="bx-eyebrow" style={{ marginBottom: 8 }}>Workflow</div>
              <h2 className="bx-h2" style={{ marginBottom: 8 }}>Approval &amp; evaluation layers</h2>
              <p className="bx-lede" style={{ marginBottom: 26 }}>
                The sequence a submission travels through. Each layer is an approval or an evaluation; with none set, submissions file straight to SharePoint.
              </p>

              {profileLayerEdit && (
                <div className="bx-card" style={{ marginBottom: 16, borderLeft: `1px solid ${C.border}`, background: "var(--bx-a100)", borderColor: "var(--bx-a300)" }}>
                  <div style={{ fontFamily: "var(--bx-head)", fontWeight: 600, fontSize: 20 }}>
                    Editing {profileLayerEdit.publishLabel} · v{profileLayerEdit.version}
                  </div>
                  <p className="bx-lede" style={{ fontSize: 14, margin: "6px 0 14px" }}>
                    Layer and evaluation changes save only to <strong>{profileLayerEdit.publishLabel}</strong> / v{profileLayerEdit.version} / {profileLayerEdit.publishKey}. Approver directory rows save to SharePoint as you edit them. Publish only when you want to republish the whole profile.
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="bx-btn bx-btn-primary bx-btn-sm" onClick={handleSaveProfileLayers} disabled={profileLayerSaving}>
                      {profileLayerSaving && <span className="bx-spinner" style={{ width: 13, height: 13 }} />}
                      {profileLayerSaving ? "Saving…" : "Save profile settings"}
                    </button>
                    <button type="button" className="bx-btn bx-btn-secondary bx-btn-sm" onClick={() => setProfileLayerEdit(null)} disabled={profileLayerSaving}>
                      Exit layer edit
                    </button>
                  </div>
                </div>
              )}

              {isEditing && !viewingOld && (
                <div className="bx-actionrow" style={{ marginBottom: 16 }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 15 }}>Start this profile’s layers from scratch</div>
                    <div className="bx-meta">Clears the layer draft only. Published profiles keep their saved layers until you publish.</div>
                  </div>
                  <button type="button" className="bx-btn bx-btn-secondary bx-btn-sm" onClick={handleStartProfileLayersFromScratch} disabled={profileLayerSaving}>
                    Reset layers
                  </button>
                </div>
              )}

              <div className="bx-legacy">
                <LayerConfigPanel
                  value={layerConfig}
                  onChange={setLayerConfig}
                  siteUsers={siteUsers}
                  formFields={layerFieldOptions}
                  slug={meta.slug}
                  appOrigin={appOrigin}
                  token={spToken || undefined}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Settings ───────────────────────────────────────────────── */}
        {mode === "settings" && (
          <div className="bx-scroller">
            <div className="bx-col">
              <div className="bx-eyebrow" style={{ marginBottom: 8 }}>Settings</div>
              <h2 className="bx-h2" style={{ marginBottom: 8 }}>Form setup</h2>
              <p className="bx-lede" style={{ marginBottom: 26 }}>Identity, route and access. Everything below opens only when you need it.</p>

              <div className="bx-card" style={{ marginBottom: 20 }}>
                <TextField
                  id="set-title"
                  label="Form title *"
                  value={meta.formTitle}
                  onChange={v => setM("formTitle", v)}
                  placeholder="Training Application Form"
                  disabled={isEditing}
                  note={isEditing ? <span className="bx-meta">Becomes the SharePoint list name — locked after the first publish.</span> : undefined}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
                  <TextField id="set-formid" label="Form ID / Doc no. *" value={meta.formId} onChange={v => setM("formId", v)} placeholder="PMW-HR-001" />
                  <TextField id="set-version" label="Version" value={meta.formVersion} onChange={v => setM("formVersion", v)} placeholder="1.0" />
                </div>
                <div className="bx-field" style={{ marginBottom: 0 }}>
                  <label htmlFor="set-slug">Route slug</label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="set-slug"
                      className={`bx-input${slugError ? " is-error" : ""}`}
                      style={{ height: 40 }}
                      value={meta.slug}
                      onChange={e => { setM("slug", slugify(e.target.value)); setSlugManual(true); }}
                      placeholder="training-application"
                      disabled={slugLocked}
                    />
                    {slugChecking && <span className="bx-spinner" style={{ width: 14, height: 14, position: "absolute", right: 11, top: 13 }} />}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 400, marginTop: 6, color: slugError ? C.red : meta.slug ? "var(--bx-a700)" : "var(--bx-n600)" }}>
                    {slugError
                      ? `Slug conflict — ${slugError}. Pick another route before publishing.`
                      : meta.slug
                        ? `Public route: /form/${meta.slug}${slugLocked ? " — locked after first publish" : ""}`
                        : "Filled from the title; edit it before publishing."}
                  </div>
                </div>
              </div>

              <Disclosure open={!!disc.branding} onToggle={() => toggleDisc("branding")} title="Branding & banner" summary={showBanner ? "Banner on" : "Banner off"}>
                <TextField id="set-iso" label="ISO standards" value={meta.isoStandards} onChange={v => setM("isoStandards", v)} placeholder="ISO 9001 · ISO 14001" />
                <div className="bx-field">
                  <label htmlFor="set-companies">Companies (one per line)</label>
                  <textarea
                    id="set-companies"
                    className="bx-input"
                    rows={4}
                    value={meta.companies}
                    onChange={e => setM("companies", e.target.value)}
                  />
                </div>
                <TextField id="set-logo" label="Logo URL" value={meta.logoUrl} onChange={v => setM("logoUrl", v)} placeholder="/logo-128.png" />
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 4 }}>
                  <CheckRow
                    checked={showBanner}
                    onChange={setShowBanner}
                    label="Show header banner"
                    hint="ISO standards and company names at the top of the form."
                  />
                  <CheckRow
                    checked={meta.companyChoiceEnabled}
                    onChange={v => setMeta(m => ({ ...m, companyChoiceEnabled: v }))}
                    label="Required company selector"
                    hint={`Adds a required single-select field (${COMPANY_FIELD_LABEL} / ${COMPANY_FIELD_NAME}) using the company list above.`}
                  />
                </div>
                {meta.companyChoiceEnabled && companyOptions.length < 2 && (
                  <div style={{ background: C.amberPale, border: "1px solid #F0D79A", padding: "9px 12px", fontSize: 13.5, color: C.amber, marginTop: 8 }}>
                    Add at least two company lines before publishing the selector.
                  </div>
                )}
                {meta.companyChoiceEnabled && extraCompanyFields.length > 0 && (
                  <div style={{ background: C.redPale, border: "1px solid #E8B4B4", padding: "9px 12px", fontSize: 13.5, color: C.red, marginTop: 8 }}>
                    Possible duplicate company fields on the form: {extraCompanyFields.map(f => f.name || f.title).join(", ")}. None were removed.
                  </div>
                )}
              </Disclosure>

              <Disclosure open={!!disc.doc} onToggle={() => toggleDisc("doc")} title="Document control header" summary={meta.documentHeader.documentNumber || meta.formId || "Defaults"}>
                <p className="bx-lede" style={{ fontSize: 14, marginBottom: 14 }}>
                  Shown under the form title, above the company logo row. Blank Document and Revision values fall back to the Form ID and Version.
                </p>
                <TextField id="doc-number" label="Document number" value={meta.documentHeader.documentNumber || ""} onChange={v => setDocumentHeader("documentNumber", v)} placeholder={meta.formId || "PMW-HR-001"} />
                <TextField id="doc-issue" label="Issue number" value={meta.documentHeader.issueNumber || ""} onChange={v => setDocumentHeader("issueNumber", v)} placeholder="01" />
                <TextField id="doc-eff" label="Effective date" type="date" value={meta.documentHeader.effectiveDate || ""} onChange={v => setDocumentHeader("effectiveDate", v)} />
                <TextField id="doc-rev" label="Revision number" value={meta.documentHeader.revisionNumber || ""} onChange={v => setDocumentHeader("revisionNumber", v)} placeholder={meta.formVersion || "1.0"} />
                <TextField id="doc-revdate" label="Revision date" type="date" value={meta.documentHeader.revisionDate || ""} onChange={v => setDocumentHeader("revisionDate", v)} />
              </Disclosure>

              <Disclosure open={!!disc.access} onToggle={() => toggleDisc("access")} title="Access" summary={isPublic ? "Public" : "Private"}>
                <CheckRow
                  checked={isPublic}
                  onChange={setIsPublic}
                  label="Public — any Microsoft 365 user"
                  hint="Turn this off for an explicit sign-in gate."
                />
              </Disclosure>

              <Disclosure
                open={!!disc.reference}
                onToggle={() => toggleDisc("reference")}
                title="Reference number"
                sub="A per-day ID each submission is filed under"
                summary={referenceConfig.enabled ? referencePreview : "Off"}
              >
                <p className="bx-lede" style={{ fontSize: 14, marginBottom: 14 }}>
                  Gives every submission an ID like <code>{referencePreview}</code> — the Malaysian date, then a counter
                  that restarts at 1 after midnight. Each form counts separately, and the number is shown to the
                  submitter, printed on the PDF, quoted in approval emails and searchable from the dashboard.
                </p>
                <CheckRow
                  checked={referenceConfig.enabled}
                  onChange={v => setReferenceConfig(c => ({ ...c, enabled: v }))}
                  label="Give each submission a reference number"
                  hint="Existing submissions keep their blank reference; numbering starts from the next one."
                />
                {referenceConfig.enabled && (
                  <>
                    <TextField
                      id="set-ref-prefix"
                      label="Prefix (optional)"
                      value={referenceConfig.prefix}
                      onChange={v => setReferenceConfig(c => ({ ...c, prefix: normalizeReferencePrefix(v) }))}
                      placeholder="OSH"
                      note={
                        <span style={{ fontSize: 13.5, color: C.textSecond }}>
                          Letters and digits only, up to 12. Useful when several forms are filed side by side.
                        </span>
                      }
                    />
                    <div className="bx-field">
                      <label htmlFor="set-ref-pad">Counter digits</label>
                      <select
                        id="set-ref-pad"
                        className="bx-input"
                        style={{ height: 40 }}
                        value={String(referenceConfig.pad)}
                        onChange={e => setReferenceConfig(c => ({ ...c, pad: Number(e.target.value) }))}
                      >
                        {[3, 4, 5, 6].map(n => (
                          <option key={n} value={n}>
                            {n} digits — {formatReferenceNumber(malaysiaDateKey(), 1, { prefix: "", pad: n }).split("-").pop()}
                          </option>
                        ))}
                      </select>
                      <div style={{ fontSize: 13.5, color: C.textSecond, marginTop: 5 }}>
                        Padding only. A busier day than this allows keeps counting rather than wrapping around.
                      </div>
                    </div>
                    {!isEditing && (
                      <div style={{ background: C.amberPale, border: "1px solid #F0D79A", padding: "9px 12px", fontSize: 13.5, color: C.amber, marginTop: 8 }}>
                        Numbering begins once the form is published.
                      </div>
                    )}
                  </>
                )}
              </Disclosure>
            </div>
          </div>
        )}

        {/* ── Publish ────────────────────────────────────────────────── */}
        {mode === "publish" && (
          <div className="bx-scroller">
            <div className="bx-col">
              <div className="bx-eyebrow" style={{ marginBottom: 8 }}>Publish</div>
              <h2 className="bx-h2" style={{ marginBottom: 8 }}>Make it live</h2>
              <p className="bx-lede" style={{ marginBottom: 26 }}>
                One primary action. Profiles, PDF layout, versions, the audit log and QR codes stay folded away until you need them.
              </p>

              <div className="bx-card" style={{ padding: "20px 24px", marginBottom: 22 }}>
                <div className="bx-eyebrow" style={{ marginBottom: 12 }}>Readiness</div>
                {readiness.map(r => (
                  <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                    <span
                      aria-hidden="true"
                      style={{
                        flex: "none", width: 22, height: 22, display: "grid", placeItems: "center",
                        border: `1.5px solid ${r.done ? "var(--bx-a700)" : "var(--bx-n500)"}`,
                        color: r.done ? "var(--bx-a700)" : "var(--bx-n500)",
                      }}
                    >
                      <Icon name={r.done ? "tick" : "minus"} size={13} strokeWidth={2} />
                    </span>
                    <span style={{ flex: 1, fontSize: 15 }}>
                      {r.label}
                      <span className="bx-sr">{r.done ? " — ready" : " — not set"}</span>
                    </span>
                    <span className="bx-meta bx-num">{r.value}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="bx-btn bx-btn-primary"
                  style={{ height: 50, padding: "0 26px", fontSize: 16 }}
                  onClick={() => handlePublish(surveyJson as SurveyJson, "live")}
                  disabled={publishBlocked}
                >
                  <Icon name="rocket" size={18} strokeWidth={1.6} />
                  Publish to /form/{meta.slug || "slug"}
                </button>
                <button
                  type="button"
                  className="bx-btn bx-btn-secondary"
                  style={{ height: 50, padding: "0 22px", fontSize: 16 }}
                  onClick={() => handleSaveDraft()}
                  disabled={!meta.formTitle.trim() || !!viewingOld || !!saveBusy}
                >
                  {saveBusy === "draft" && <span className="bx-spinner" style={{ width: 14, height: 14 }} />}
                  Save draft
                </button>
              </div>
              <p className="bx-lede" style={{ fontSize: 13.5, marginBottom: 26 }}>
                {viewingOld
                  ? "Close the archived version preview before publishing."
                  : publishBlocked
                    ? "Add a form title and Form ID in Settings, and clear any slug conflict, before publishing."
                    : "Makes this version the default public route. Nothing else on this screen changes what is live."}
              </p>

              <Disclosure open={!!disc.profile} onToggle={() => toggleDisc("profile")} title="Publish profile" sub="Same version, separate workflow — advanced" summary={`${meta.publishLabel || "Production"} · ${activePublishKey}`}>
                <TextField id="pub-label" label="Profile label" value={meta.publishLabel} onChange={v => setMeta(m => ({ ...m, publishLabel: v }))} placeholder="Production" note={<span className="bx-meta">Shown in version history.</span>} />
                <TextField id="pub-key" label="Publish key" value={meta.publishKey} onChange={v => setMeta(m => ({ ...m, publishKey: normalizePublishKey(v) }))} placeholder="production" note={<span className="bx-meta">The <code>?publish=</code> parameter on the route.</span>} />
                <ActionRow
                  label="Save profile only"
                  hint="Publishes this profile for direct links; leaves the live /form route alone."
                  action="Save"
                  onAction={() => handlePublish(surveyJson as SurveyJson, "profile")}
                  disabled={!isEditing || publishBlocked}
                />
                <ActionRow
                  label="Publish new profile"
                  hint="Copies the current workflow into a new same-version profile. The active profile is unchanged."
                  action="Create"
                  onAction={handleCreateNewProfileDraft}
                  disabled={!isEditing || publishBlocked}
                />
              </Disclosure>

              <Disclosure open={!!disc.pdf} onToggle={() => toggleDisc("pdf")} title="PDF layout" sub="Document title, colours, sections, sample generation" summary={meta.pdfConfig.enabled ? "Custom" : "Default"}>
                <ActionRow
                  label="Custom PDF layout"
                  hint="Off falls back to the default layout."
                  value={meta.pdfConfig.enabled ? "On" : "Off"}
                  action={disc.pdfCfg ? "Close" : "Configure"}
                  onAction={() => toggleDisc("pdfCfg")}
                />
                {disc.pdfCfg && (
                  <div style={{ padding: "0 0 14px 15px", borderLeft: `1px solid ${C.border}`, marginBottom: 10 }}>
                    <CheckRow checked={meta.pdfConfig.enabled} onChange={enabled => setPdfConfig({ enabled })} label="Use the custom layout" />
                    <TextField id="pdf-title" label="Document title" value={meta.pdfConfig.title} onChange={title => setPdfConfig({ title })} placeholder="Form Submission" />
                    <TextField id="pdf-logo" label="Header logo URL" value={meta.pdfConfig.headerLogoUrl || ""} onChange={headerLogoUrl => setPdfConfig({ headerLogoUrl })} placeholder="https://example.com/logo.png" />
                    <TextField id="pdf-footer" label="Footer text" value={meta.pdfConfig.footerText || ""} onChange={footerText => setPdfConfig({ footerText })} placeholder="Generated date appears when blank" />
                    <div className="bx-field">
                      <span className="bx-label">Density</span>
                      <div className="bx-seg">
                        {(["compact", "comfortable"] as const).map(density => (
                          <button key={density} type="button" className={meta.pdfConfig.density === density ? "is-on" : ""} onClick={() => setPdfConfig({ density })}>
                            {density === "compact" ? "Compact" : "Comfortable"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div className="bx-field">
                        <label htmlFor="pdf-c1">Primary colour</label>
                        <input id="pdf-c1" type="color" className="bx-input" style={{ height: 40, padding: 4 }} value={meta.pdfConfig.primaryColor || "#0078D4"} onChange={e => setPdfConfig({ primaryColor: e.target.value })} />
                      </div>
                      <div className="bx-field">
                        <label htmlFor="pdf-c2">Secondary colour</label>
                        <input id="pdf-c2" type="color" className="bx-input" style={{ height: 40, padding: 4 }} value={meta.pdfConfig.secondaryColor || "#6264A7"} onChange={e => setPdfConfig({ secondaryColor: e.target.value })} />
                      </div>
                    </div>
                  </div>
                )}
                <ActionRow
                  label="Sections"
                  hint="Status badge, approval chain, evaluation details, signatures."
                  value={`${[meta.pdfConfig.showStatusBadge, meta.pdfConfig.showApproverChain, meta.pdfConfig.showEvaluationDetails, meta.pdfConfig.showSignatures].filter(Boolean).length} shown`}
                  action={disc.pdfSections ? "Close" : "Edit"}
                  onAction={() => toggleDisc("pdfSections")}
                />
                {disc.pdfSections && (
                  <div style={{ padding: "0 0 14px 15px", borderLeft: `1px solid ${C.border}`, marginBottom: 10 }}>
                    {([
                      ["showStatusBadge", "Show status badge"],
                      ["showApproverChain", "Show approval / evaluation chain"],
                      ["showEvaluationDetails", "Show evaluation details"],
                      ["showSignatures", "Show signature blocks"],
                      ["includeEmptyEvaluationFields", "Include blank evaluation fields for paper evaluation"],
                    ] as const).map(([key, label]) => (
                      <CheckRow
                        key={key}
                        checked={Boolean(meta.pdfConfig[key])}
                        onChange={v => setPdfConfig({ [key]: v } as Partial<PdfConfig>)}
                        label={label}
                      />
                    ))}
                  </div>
                )}
                <ActionRow
                  label="Sample PDF"
                  hint="A local preview filled with fake submission, signature, photo, approval and evaluation data."
                  action={disc.pdfSample ? "Close" : "Generate"}
                  onAction={() => toggleDisc("pdfSample")}
                  disabled={!isEditing || !surveyJson}
                />
                {disc.pdfSample && (
                  <div style={{ padding: "0 0 14px 15px", borderLeft: `1px solid ${C.border}`, display: "grid", gap: 8 }}>
                    <button
                      type="button"
                      className="bx-btn bx-btn-primary bx-btn-sm"
                      onClick={() => void handleGenerateSamplePdf("filled")}
                      disabled={!!samplePdfGenerating || !isEditing || !surveyJson}
                    >
                      {samplePdfGenerating === "filled" && <span className="bx-spinner" style={{ width: 13, height: 13 }} />}
                      {samplePdfGenerating === "filled" ? "Generating…" : "Generate filled sample PDF"}
                    </button>
                    <button
                      type="button"
                      className="bx-btn bx-btn-secondary bx-btn-sm"
                      onClick={() => void handleGenerateSamplePdf("manual")}
                      disabled={!!samplePdfGenerating || !isEditing || !surveyJson || !hasSampleEvaluationLayer(layerConfig)}
                      title={hasSampleEvaluationLayer(layerConfig) ? undefined : "Add an evaluation layer in Workflow first"}
                    >
                      {samplePdfGenerating === "manual" && <span className="bx-spinner" style={{ width: 13, height: 13 }} />}
                      {samplePdfGenerating === "manual" ? "Generating…" : "Generate manual / physical evaluation sample"}
                    </button>
                  </div>
                )}
              </Disclosure>

              <Disclosure open={!!disc.versions} onToggle={() => toggleDisc("versions")} title="Versions & profiles" sub="Rename, expire, set default, QR codes, restore" summary={`${versionHistory.length} published`}>
                {!isEditing ? (
                  <p className="bx-lede" style={{ fontSize: 14 }}>Publish this form to start its version history.</p>
                ) : (
                  <>
                    <p className="bx-lede" style={{ fontSize: 14, marginBottom: 14 }}>
                      Each card is one published profile. Off or expired profiles cannot be opened by public users; the default profile answers <strong>/form/{meta.slug || "slug"}</strong>.
                    </p>
                    <div className="bx-legacy"><VersionHistory
                      history={versionHistory}
                      current={originalVersion || ""}
                      currentPublishKey={activePublishKey}
                      slug={meta.slug}
                      formTitle={meta.formTitle}
                      onRename={handleRenameProfile}
                      renameBusyKey={renameProfileBusy}
                      onView={handleViewVersion}
                      onSetDefault={handleSetDefaultProfile}
                      onToggleStatus={handleToggleProfileStatus}
                      onSetExpiry={handleSetProfileExpiry}
                      onCopyLink={handleCopyProfileLink}
                      onEditLayers={handleEditProfileLayers}
                      onOpenQr={handleOpenProfileQr}
                      qrBusyKey={qrProfileLoading}
                      onOpenDocHeader={handleOpenProfileDocHeader}
                      docHeaderBusyKey={docHeaderLoading}
                    /></div>
                  </>
                )}
              </Disclosure>

              <Disclosure open={!!disc.log} onToggle={() => toggleDisc("log")} title="Audit log" sub="Every change, with a before/after diff" summary={isEditing ? `${auditLog.length} entries` : "Not published"}>
                {logLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
                    <span className="bx-spinner" style={{ width: 22, height: 22 }} />
                  </div>
                ) : (
                  <div className="bx-legacy"><AuditLog logs={auditLog} /></div>
                )}
              </Disclosure>

              <Disclosure open={!!disc.qr} onToggle={() => toggleDisc("qr")} title="Prefilled QR codes" sub="Generate links with fields already answered" summary={isEditing && !isDraft && meta.slug ? "Available" : "After publish"}>
                <div className="bx-legacy">
                  <PrefilledQrPanel
                    surveyJson={surveyJson}
                    slug={meta.slug}
                    appOrigin={appOrigin}
                    canGenerate={isEditing && !isDraft && !!meta.slug && !viewingOld}
                    publishKey={meta.publishKey}
                    publishLabel={meta.publishLabel}
                  />
                </div>
              </Disclosure>
            </div>
          </div>
        )}
      </main>

      {docHeaderProfile && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget && !docHeaderSaving) setDocHeaderProfile(null); }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10001,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(30,27,75,0.45)",
            animation: "fadeUp .15s ease",
            padding: 20,
          }}
        >
          <div style={{
            background: C.white,
            borderRadius: 10,
            padding: "20px 22px",
            maxWidth: 440,
            width: "100%",
            maxHeight: "88vh",
            overflowY: "auto",
            boxShadow: C.shadowMd,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary }}>Document header — {docHeaderProfile.publishLabel}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                  v{docHeaderProfile.version} · {docHeaderProfile.publishKey}. Saved to this profile only; blank Document / Revision fall back to Form ID and version.
                </div>
              </div>
              <button
                onClick={() => { if (!docHeaderSaving) setDocHeaderProfile(null); }}
                title="Close"
                style={{ background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 8, width: 32, height: 32, cursor: docHeaderSaving ? "not-allowed" : "pointer", color: C.textSecond, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >
                <CloseIcon style={{ fontSize: 18 }} />
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
              <TextInput value={docHeaderProfile.header.documentNumber || ""} onChange={v => setDocHeaderProfile(p => p && ({ ...p, header: { ...p.header, documentNumber: v } }))} placeholder={meta.formId || "Document Number"} disabled={docHeaderSaving} />
              <TextInput value={docHeaderProfile.header.issueNumber || ""} onChange={v => setDocHeaderProfile(p => p && ({ ...p, header: { ...p.header, issueNumber: v } }))} placeholder="Issue Number" disabled={docHeaderSaving} />
              <TextInput value={docHeaderProfile.header.effectiveDate || ""} onChange={v => setDocHeaderProfile(p => p && ({ ...p, header: { ...p.header, effectiveDate: v } }))} placeholder="Effective Date" type="date" disabled={docHeaderSaving} />
              <TextInput value={docHeaderProfile.header.revisionNumber || ""} onChange={v => setDocHeaderProfile(p => p && ({ ...p, header: { ...p.header, revisionNumber: v } }))} placeholder={docHeaderProfile.version || "Revision Number"} disabled={docHeaderSaving} />
              <TextInput value={docHeaderProfile.header.revisionDate || ""} onChange={v => setDocHeaderProfile(p => p && ({ ...p, header: { ...p.header, revisionDate: v } }))} placeholder="Revision Date" type="date" disabled={docHeaderSaving} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}>
              <button
                onClick={() => { if (!docHeaderSaving) setDocHeaderProfile(null); }}
                disabled={docHeaderSaving}
                style={{ minHeight: 38, borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.textSecond, fontSize: 13, fontWeight: 700, cursor: docHeaderSaving ? "not-allowed" : "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfileDocHeader}
                disabled={docHeaderSaving}
                style={{ minHeight: 38, borderRadius: 8, border: "none", background: docHeaderSaving ? C.border : `linear-gradient(135deg,${C.purple},${C.purpleLight})`, color: docHeaderSaving ? C.textMuted : C.white, fontSize: 13, fontWeight: 700, cursor: docHeaderSaving ? "not-allowed" : "pointer" }}
              >
                {docHeaderSaving ? "Saving…" : "Save header"}
              </button>
            </div>
          </div>
        </div>
      )}

      {qrProfile && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setQrProfile(null); }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10001,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(30,27,75,0.45)",
            animation: "fadeUp .15s ease",
            padding: 20,
          }}
        >
          <div style={{
            background: C.white,
            borderRadius: 10,
            padding: "20px 22px",
            maxWidth: 420,
            width: "100%",
            maxHeight: "88vh",
            overflowY: "auto",
            boxShadow: C.shadowMd,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary }}>Prefilled QR — {qrProfile.publishLabel}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                  v{qrProfile.version} · {qrProfile.publishKey} · generate as many QR instances as you need for this profile.
                </div>
              </div>
              <button
                onClick={() => setQrProfile(null)}
                title="Close"
                style={{ background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: C.textSecond, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >
                <CloseIcon style={{ fontSize: 18 }} />
              </button>
            </div>
            <PrefilledQrPanel
              surveyJson={qrProfile.surveyJson}
              slug={meta.slug}
              appOrigin={appOrigin}
              canGenerate={!!meta.slug}
              publishKey={qrProfile.publishKey}
              publishLabel={qrProfile.publishLabel}
            />
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 10001,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(30,27,75,0.45)",
          animation: "fadeUp .15s ease",
        }}>
          <div style={{
            background: C.white,
            borderRadius: 8,
            padding: "24px 28px",
            maxWidth: 400,
            width: "90%",
            boxShadow: C.shadowMd,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 32, marginBottom: 8, display: 'flex', justifyContent: 'center' }}><WarningIcon style={{ fontSize: 40 }} /></div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.textPrimary, marginBottom: 6 }}>
              Delete &ldquo;{deleteConfirm.Title}&rdquo;?
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6, marginBottom: 20 }}>
              This will permanently remove this form and all related data: versions, audit logs, and approver records.
              <br /><br />
              <span style={{ color: C.amber }}>Submission data in the form&rsquo;s list will NOT be deleted.</span>
            </div>
            <div style={{ display: "flex", gap: 9, justifyContent: "center" }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                style={{
                  height: 36,
                  padding: "0 20px",
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                  background: C.white,
                  color: C.textSecond,
                  fontSize: 13,
                  cursor: deleting ? "not-allowed" : "pointer",
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                style={{
                  height: 36,
                  padding: "0 20px",
                  borderRadius: 8,
                  border: "none",
                  background: `linear-gradient(135deg,${C.red},#B91C1C)`,
                  color: C.white,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: deleting ? "not-allowed" : "pointer",
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                  opacity: deleting ? 0.6 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {deleting && <Spinner size={14} />}
                {deleting ? "Deleting…" : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}

      {hardDeleteConfirm && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 10001,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(127,29,29,0.45)",
          animation: "fadeUp .15s ease",
        }}>
          <div style={{
            background: C.white,
            borderRadius: 8,
            padding: "24px 28px",
            maxWidth: 420,
            width: "90%",
            boxShadow: C.shadowMd,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>💀</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#991B1B", marginBottom: 6 }}>
              Permanently delete ALL data for &ldquo;{hardDeleteConfirm.Title}&rdquo;?
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6, marginBottom: 6 }}>
              This will completely destroy everything related to this form:
            </div>
            <div style={{
              fontSize: 12,
              color: "#991B1B",
              lineHeight: 1.7,
              marginBottom: 16,
              textAlign: "left",
              background: "#FEF2F2",
              borderRadius: 8,
              padding: "10px 14px",
              border: "1px solid #FECACA",
            }}>
              <div>✦ Form configuration (Master Form)</div>
              <div>✦ All version history (Web Form Versions)</div>
              <div>✦ Audit log entries (Form Builder Log)</div>
              <div>✦ Approver records (Approvers)</div>
              <div style={{ fontWeight: 700 }}>✦ ALL submissions in &ldquo;{hardDeleteConfirm.Title} Responses&rdquo; list</div>
            </div>
            <div style={{ fontSize: 11, color: C.red, fontWeight: 600, marginBottom: 18 }}>
              <WarningIcon style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} /> This action is irreversible. All submission data will be permanently lost.
            </div>
            {/* Naming the site here is the last chance to catch a delete aimed at
                the wrong product. */}
            {activeSite && (
              <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 18 }}>
                On site <strong style={{ color: C.textPrimary }}>{activeSite.label}</strong>
              </div>
            )}
            <div style={{ display: "flex", gap: 9, justifyContent: "center" }}>
              <button
                onClick={() => setHardDeleteConfirm(null)}
                disabled={deleting}
                style={{
                  height: 36,
                  padding: "0 20px",
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                  background: C.white,
                  color: C.textSecond,
                  fontSize: 13,
                  cursor: deleting ? "not-allowed" : "pointer",
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleHardDeleteConfirm}
                disabled={deleting}
                style={{
                  height: 36,
                  padding: "0 24px",
                  borderRadius: 8,
                  border: "none",
                  background: `linear-gradient(135deg,#DC2626,#991B1B)`,
                  color: C.white,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: deleting ? "not-allowed" : "pointer",
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                  opacity: deleting ? 0.6 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {deleting && <Spinner size={14} />}
                {deleting ? "Deleting…" : "Delete Everything"}
              </button>
            </div>
          </div>
        </div>
      )}

      {provisioning && (
        <ProvisionOverlay
          logs={provLogs}
          success={provOk}
          error={provErr}
          onDone={() => {
            setProvisioning(false);
            if (provOk) navigate(builderPath(meta.formTitle));
          }}
        />
      )}

      {testRunOpen && (
        <TestRunLauncher
          open={testRunOpen}
          onClose={() => setTestRunOpen(false)}
          form={{ Title: meta.formTitle, Slug: meta.slug }}
          siteUrl={activeSite?.url}
        />
      )}

      {testRunPanelOpen && (
        <TestRunPanel
          open={testRunPanelOpen}
          onClose={() => setTestRunPanelOpen(false)}
          form={{ Title: meta.formTitle, Slug: meta.slug }}
          siteUrl={activeSite?.url}
        />
      )}
    </div>
  );
}

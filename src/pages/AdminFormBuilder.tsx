/**
 * AdminFormBuilder.tsx — Full admin form builder with sidebar
 * Integrates with custom FormBuilder component
 */
import { useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { pdf } from "@react-pdf/renderer";
import FormBuilder from "../components/builder/FormBuilder";
import FormLibrary from "../components/builder/FormLibrary";
import VersionHistory from "../components/builder/VersionHistory";
import AuditLog from "../components/builder/AuditLog";
import ProvisionOverlay from "../components/builder/ProvisionOverlay";
import LayerConfigPanel from "../components/builder/LayerConfigPanel";
import PrefilledQrPanel from "../components/builder/PrefilledQrPanel";
import { C } from "../components/builder/constants";
import { validateLayerConfig } from "../components/builder/layerValidation";
import type { LayerFieldOption } from "../components/builder/layerValidation";
import { flattenQuestions } from "../utils/FormBuilderEngine";
import { createSpClient } from "../utils/sharepointClient";
import { acquireAccessTokenSilentOrRedirect, fetchWithAuthRecovery } from "../utils/authRecovery";
import { SP_STATIC } from "../utils/spConfig";
import FormPdfDocument, { type PdfFormData, type PdfLayerResult } from "../utils/FormPdfDocument";
import type { SurveyJson, LayerConfig, LayerConfigItem, PdfConfig } from "../types";
import type { DocumentControlHeader } from "../types";

// MUI Icons
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FolderIcon from "@mui/icons-material/Folder";
import SettingsIcon from "@mui/icons-material/Settings";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import DescriptionIcon from "@mui/icons-material/Description";
import HistoryIcon from "@mui/icons-material/History";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LayersIcon from "@mui/icons-material/Layers";
import SaveIcon from "@mui/icons-material/Save";
import EditNoteIcon from "@mui/icons-material/EditNote";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningIcon from "@mui/icons-material/Warning";
import CloseIcon from "@mui/icons-material/Close";
import PublicIcon from "@mui/icons-material/Public";
import BlockIcon from "@mui/icons-material/Block";
import LockIcon from "@mui/icons-material/Lock";
import BusinessIcon from "@mui/icons-material/Business";
import RadioButtonCheckedIcon from "@mui/icons-material/RadioButtonChecked";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

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
} from "../utils/formBuilderSP";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
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
const G = `*{box-sizing:border-box;margin:0;padding:0;font-family:var(--pmw-font-main)!important}body{font-family:var(--pmw-font-main);background:${C.offWhite};color:${C.textPrimary}}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#D1D5DB;border-radius:10px}
button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid ${C.purple};outline-offset:2px}
@media(max-width:860px){.afb-header{height:auto!important;min-height:52px;align-items:flex-start!important;flex-wrap:wrap;padding:8px 12px!important;gap:8px}.afb-header-left{width:100%;overflow-x:auto;padding-bottom:2px}.afb-header-actions{width:100%;overflow-x:auto;justify-content:flex-start!important;padding-bottom:2px}.afb-header-title{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
@media(max-width:520px){.afb-header-left{gap:8px!important}.afb-header-title{max-width:150px}.afb-header-actions button{flex:0 0 auto}}
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
const Tag = ({ children, color = C.purple, bg = C.purplePale }: { children: ReactNode; color?: string; bg?: string }) => (
  <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, borderRadius: 6, padding: "2px 8px", textTransform: "uppercase", letterSpacing: 0 }}>{children}</span>
);

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

function FB({ label, hint, children, required }: { label: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textPrimary, marginBottom: 4 }}>
        {label}{required && <span style={{ color: C.red, marginLeft: 3 }}>*</span>}
      </label>
      {hint && <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4, lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </div>
  );
}

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 40, height: 22, borderRadius: 999, flexShrink: 0,
          background: checked ? C.purple : "#D1D5DB", position: "relative",
          transition: "background-color 0.2s", cursor: "pointer",
        }}
      >
        <div style={{
          position: "absolute", top: 3, left: checked ? 21 : 3,
          width: 16, height: 16, borderRadius: "50%", background: C.white,
          transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </div>
      {label && <span style={{ fontSize: 12, color: C.textSecond }}>{label}</span>}
    </label>
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
  if (["dropdown", "radiogroup", "imagepicker", "ranking"].includes(type)) return firstChoiceValue(field.choices);
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

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminFormBuilder() {
  const navigate = useNavigate();
  const { formTitle: paramTitle } = useParams<{ formTitle: string }>();
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const [authChecked, setAuthChecked] = useState(false);
  const [siteUsers, setSiteUsers] = useState<{ email: string; name: string }[]>([]);
  const tokenRef = useRef<string | null>(null);
  const [allForms, setAllForms] = useState<{ Id?: string; Title: string; FormID?: string; CurrentVersion?: string; CurrentPublishKey?: string; CurrentPublishLabel?: string; Slug?: string; NumberOfApprovalLayer?: number; IsPublic?: boolean; IsPublished?: boolean; ApprovalRules?: string }[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(true);
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
  const [sidebarTab, setSidebarTab] = useState("meta");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarTabsRef = useRef<HTMLDivElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const resizingRef = useRef(false);
  const [canSidebarScrollLeft, setCanSidebarScrollLeft] = useState(false);
  const [canSidebarScrollRight, setCanSidebarScrollRight] = useState(false);
  const [versionHistory, setVersionHistory] = useState<{ FormVersion: string; PublishKey?: string; PublishLabel?: string; PublishStatus?: "active" | "off"; PublishExpiresAt?: string; DisabledAt?: string; DisabledBy?: string; PublishedBy?: string; PublishedAt?: string }[]>([]);
  const [viewingOld, setViewingOld] = useState<{ version: string; publishKey: string; json: SurveyJson } | null>(null);
  const [auditLog, setAuditLog] = useState<{ EventType: string; EventSummary?: string; BeforeJSON?: string; AfterJSON?: string; EventAt?: string }[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [provLogs, setProvLogs] = useState<{ m: string; t: string }[]>([]);
  const [provisioning, setProvisioning] = useState(false);
  const [provOk, setProvOk] = useState(false);
  const [provErr, setProvErr] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ Id?: string; Title: string } | null>(null);
  const [hardDeleteConfirm, setHardDeleteConfirm] = useState<{ Id?: string; Title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [approvalRules, setApprovalRules] = useState<{ conditionField: string; rules: { when: string; layers: { email: string; name: string; role: string }[] }[] } | null>(null);
  const [layerConfig, setLayerConfig] = useState<LayerConfig | null>(null);
  const [profileLayerEdit, setProfileLayerEdit] = useState<{ version: string; publishKey: string; publishLabel: string } | null>(null);
  const [profileLayerSaving, setProfileLayerSaving] = useState(false);
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
      showToast("Access denied. You need Form Builder Superuser permissions. Redirecting to dashboard.", "err");
      setAccessDenied(false);
    }
  }, [accessDenied, showToast]);

  const checkSidebarScrollState = () => {
    const el = sidebarTabsRef.current;
    if (el) {
      setCanSidebarScrollLeft(el.scrollLeft > 0);
      setCanSidebarScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
    }
  };

  const sidebarScrollLeft = () => {
    const el = sidebarTabsRef.current;
    if (el) el.scrollBy({ left: -200, behavior: 'smooth' });
  };

  const sidebarScrollRight = () => {
    const el = sidebarTabsRef.current;
    if (el) el.scrollBy({ left: 200, behavior: 'smooth' });
  };

  useEffect(() => {
    checkSidebarScrollState();
    window.addEventListener('resize', checkSidebarScrollState);
    return () => window.removeEventListener('resize', checkSidebarScrollState);
  }, []);

  // ── Sidebar resize via drag ────────────────────────────────────────────
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      // side = right sidebar, so dragging from main content area
      // width = distance from right edge of viewport to cursor
      const newWidth = Math.max(220, Math.min(800, window.innerWidth - e.clientX));
      setSidebarWidth(newWidth);
    };
    const onMouseUp = () => {
      resizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
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
    const spClient = createSpClient(instance, accounts);
    Promise.all([
      spClient.isGroupMember(SP_STATIC.adminGroup),
      spClient.isGroupMember(SP_STATIC.formBuilderSuperuserGroup),
    ]).then(async ([admin, builderSuperuser]) => {
      if (!admin || !builderSuperuser) {
        setAccessDenied(true);
        setTimeout(() => navigate("/user/dashboard"), 200);
        return;
      }
      setAuthChecked(true);
      const origin = new URL(import.meta.env.VITE_SP_SITE_URL || "https://placeholder.sharepoint.com").origin;
      try {
        const token = await acquireAccessTokenSilentOrRedirect(instance, { scopes: [`${origin}/AllSites.Manage`], account: accounts[0] });
        tokenRef.current = token;
        bootstrapSystemLists(token, () => { }).catch(() => { /* best-effort system list bootstrap */ });
        try {
          const ud = await fetchWithAuthRecovery(`${SP_SITE_URL}/_api/web/siteusers?$select=Email,Title&$filter=PrincipalType eq 1`, {
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
  }, [isAuthenticated, inProgress, navigate, instance, accounts, showToast]);

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
      getFormVersionHistory(token, c.Title as string).then(setVersionHistory).catch(() => {});
      setLogLoading(true);
      getFormLog(token, c.Title as string).then(l => {
        setAuditLog(l);
        setLogLoading(false);
      }).catch(() => { setLogLoading(false); });
    } catch (e) {
      showToast(`Could not load form: ${(e as Error).message}`, "err");
    }
  }, [showToast]);

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
    navigate("/admin/builder");
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
      setSidebarTab("meta");
      return;
    }
    const draftCompanyOptions = meta.companies.split(/\r?\n/).map(c => c.trim()).filter(Boolean);
    if (meta.companyChoiceEnabled && draftCompanyOptions.length < 2) {
      showToast("Add at least two companies before saving the required Company selector.", "err");
      setSidebarTab("meta");
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
        setSidebarTab("layers");
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
      refreshLib();
    } catch (e) {
      showToast(`Could not save draft: ${(e as Error).message}`, "err");
    }
  }, [meta, surveyJson, numLayers, layers, slugError, isPublic, showBanner, approvalRules, layerConfig, accounts, showToast, refreshLib]);

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
      setSidebarTab("version");
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
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      showToast("Profile link copied.", "ok");
    } catch {
      showToast(path, "info");
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
      setSidebarTab("layers");
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
    setLayerConfig({ version: "1.0", layers: [] });
    setNumLayers(0);
    setProfileLayerEdit(null);
    setSidebarTab("layers");
    showToast("New profile draft ready with fresh layers. The active profile remains unchanged.", "ok");
  };

  useEffect(() => {
    if (sidebarTab !== "log" || !isEditing || !tokenRef.current) return;
    setLogLoading(true);
    getFormLog(tokenRef.current, meta.formTitle).then(l => {
      setAuditLog(l);
      setLogLoading(false);
    });
  }, [sidebarTab, isEditing, meta.formTitle]);

  const handlePublish = useCallback(async (jsonArg?: SurveyJson, intent: PublishIntent = "live") => {
    if (!meta.formTitle.trim()) {
      showToast("Form title required.", "err");
      setSidebarTab("meta");
      return;
    }
    if (!meta.formId.trim()) {
      showToast("Form ID required.", "err");
      setSidebarTab("meta");
      return;
    }
    const publishCompanyOptions = meta.companies.split(/\r?\n/).map(c => c.trim()).filter(Boolean);
    if (meta.companyChoiceEnabled && publishCompanyOptions.length < 2) {
      showToast("Add at least two companies before publishing the required Company selector.", "err");
      setSidebarTab("meta");
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
      setSidebarTab("layers");
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
  }, [meta, surveyJson, numLayers, layers, isEditing, originalVersion, slugError, isPublic, showBanner, pLog, refreshLib, approvalRules, layerConfig, accounts, showToast]);

  if (!authChecked) {
    return (
      <div style={{ minHeight: "100vh", background: C.offWhite, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{G}</style>
        <Spinner size={36} />
      </div>
    );
  }

  const sidebarTabs = [
    { id: "meta", label: "Form Setup", icon: <DescriptionIcon style={{ fontSize: 14 }} /> },
    { id: "pdf", label: "PDF Layout", icon: <ReceiptLongIcon style={{ fontSize: 14 }} /> },
    { id: "layers", label: "Layers", icon: <LayersIcon style={{ fontSize: 14 }} /> },
    { id: "version", label: "Versions", icon: <HistoryIcon style={{ fontSize: 14 }} /> },
    { id: "log", label: "Log", icon: <ReceiptLongIcon style={{ fontSize: 14 }} /> },
    { id: "publish", label: "Publish", icon: <RocketLaunchIcon style={{ fontSize: 14 }} /> },
  ];

  const formBuilderKey = viewingOld
    ? `view_${meta.formTitle}_v${viewingOld.version}_${viewingOld.publishKey}`
    : initialJson
      ? `edit_${meta.formTitle}_${JSON.stringify(initialJson).slice(0, 60)}`
      : "new";
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

  return (
    <div style={{ minHeight: "100vh", background: C.offWhite, display: "flex", flexDirection: "column" }}>
      <style>{G}</style>
      {toast && (
        <div style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 20000,
          background: C.white,
          color: C.black,
          padding: "12px 18px",
          borderRadius: 8,
          border: `1px solid ${toastColor}`,
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 1.45,
          boxShadow: "0 10px 28px rgba(26,31,43,0.16)",
          animation: "fadeUp .2s ease",
          maxWidth: 360,
          opacity: 1,
          wordBreak: "break-word",
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: toastColor, marginTop: 5, flexShrink: 0 }} />
          {toast.msg}
        </div>
      )}

      <header className="afb-header" style={{
        background: C.white,
        borderBottom: `1px solid ${C.border}`,
        height: 52,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 18px",
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 1px 0 rgba(91,33,182,.06)",
        flexShrink: 0,
      }}>
        <div className="afb-header-left" style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <button
            type="button"
            onClick={() => { window.location.assign("/"); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              height: 30,
              border: `1px solid ${C.border}`,
              borderRadius: 7,
              background: C.white,
              color: C.textSecond,
              fontSize: 12,
              cursor: "pointer",
              padding: "0 12px",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#F3F4F6"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = C.white; }}
          >
            <ArrowBackIcon style={{ fontSize: 14 }} /> Dashboard
          </button>
          <div style={{ width: 1, height: 17, background: C.border }} />
          <span style={{ fontSize: 18, color: C.black, display: 'inline-flex' }}><DescriptionIcon style={{ fontSize: 18 }} /></span>
          <span className="afb-header-title" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", fontWeight: 700, fontSize: 16, color: C.textPrimary }}>
            {isEditing ? `Editing: ${meta.formTitle}` : "New Form"}
          </span>
          <Tag color={C.amber} bg={C.amberPale}>Admin</Tag>
          {isEditing && <Tag>v{meta.formVersion}</Tag>}
          {isDraft && <Tag color={C.amber} bg={C.amberPale}>Draft</Tag>}
          {meta.slug && (
            <a
                  href={`/form/${meta.slug}`}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 10,
                color: C.purple,
                textDecoration: "none",
                background: C.purplePale,
                borderRadius: 6,
                padding: "2px 9px",
                border: `1px solid ${C.purpleMid}`,
              }}
            >
                    /form/{meta.slug} ↗
            </a>
          )}
        </div>
        <div className="afb-header-actions" style={{ display: "flex", gap: 7 }}>
          <button
            onClick={() => setLibraryOpen(o => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: 30,
              padding: "0 12px",
              border: `1px solid ${C.border}`,
              borderRadius: 7,
              background: libraryOpen ? C.purplePale : C.white,
              color: libraryOpen ? C.purple : C.textSecond,
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
            }}
            onMouseEnter={(e) => { if (!libraryOpen) { e.currentTarget.style.background = "#F9FAFB"; e.currentTarget.style.borderColor = C.purple; e.currentTarget.style.color = C.purple; } }}
            onMouseLeave={(e) => { if (!libraryOpen) { e.currentTarget.style.background = C.white; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSecond; } }}
          >
            <FolderIcon style={{ fontSize: 14 }} /> Forms
          </button>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: 30,
              padding: "0 12px",
              border: `1px solid ${C.border}`,
              borderRadius: 7,
              background: sidebarOpen ? C.purplePale : C.white,
              color: sidebarOpen ? C.purple : C.textSecond,
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
            }}
            onMouseEnter={(e) => { if (!sidebarOpen) { e.currentTarget.style.background = "#F9FAFB"; e.currentTarget.style.borderColor = C.purple; e.currentTarget.style.color = C.purple; } }}
            onMouseLeave={(e) => { if (!sidebarOpen) { e.currentTarget.style.background = C.white; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSecond; } }}
          >
            <SettingsIcon style={{ fontSize: 14 }} /> Settings
          </button>
          {(!isEditing || isDraft) && (
            <button
              onClick={() => handleSaveDraft()}
              disabled={!meta.formTitle.trim() || !!viewingOld}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                height: 30,
                padding: "0 14px",
                border: `1px solid ${C.border}`,
                borderRadius: 7,
                background: C.white,
                color: C.textSecond,
                fontSize: 12,
                fontWeight: 600,
                cursor: !meta.formTitle.trim() || viewingOld ? "not-allowed" : "pointer",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                opacity: !meta.formTitle.trim() || viewingOld ? 0.5 : 1,
              }}
              onMouseEnter={(e) => { if (!viewingOld) e.currentTarget.style.background = C.offWhite; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = C.white; }}
            >
              <SaveIcon style={{ fontSize: 14, marginRight: 4 }} /> Save Draft
            </button>
          )}
          <button
            onClick={() => handlePublish(surveyJson as SurveyJson, "live")}
            disabled={!!viewingOld}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: 30,
              padding: "0 16px",
              border: "none",
              borderRadius: 7,
              background: viewingOld ? C.border : `linear-gradient(135deg,${C.purple},${C.purpleLight})`,
              color: C.white,
              fontSize: 12,
              fontWeight: 600,
              cursor: viewingOld ? "not-allowed" : "pointer",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
              boxShadow: viewingOld ? "none" : "0 2px 8px rgba(91,33,182,.25)",
              opacity: viewingOld ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { if (!viewingOld) e.currentTarget.style.boxShadow = "0 4px 12px rgba(91,33,182,.35)"; }}
            onMouseLeave={(e) => { if (!viewingOld) e.currentTarget.style.boxShadow = "0 2px 8px rgba(91,33,182,.25)"; }}
          >
            <RocketLaunchIcon style={{ fontSize: 14 }} /> Actual Publish
          </button>
        </div>
      </header>

      {viewingOld && (
        <div style={{ background: C.amberPale, borderBottom: "1px solid #FDE68A", padding: "7px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: C.amber }}>
          <span>Viewing archived <strong>v{viewingOld.version}</strong> / {viewingOld.publishKey} (read only)</span>
          <button
            onClick={() => setViewingOld(null)}
            style={{ background: "none", border: "none", color: C.amber, cursor: "pointer", fontWeight: 600, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" }}
          >
            <CloseIcon style={{ fontSize: 14, marginRight: 4 }} /> Back to current
          </button>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden", height: "calc(100vh - 52px)" }}>
        {libraryOpen && (
          <div style={{ width: 215, flexShrink: 0, borderRight: `1px solid ${C.border}`, background: C.white, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <FormLibrary forms={allForms} onEdit={loadForEdit} onNew={handleNew} onDelete={handleDelete} onHardDelete={handleHardDelete} current={meta.formTitle} />
          </div>
        )}

        <div style={{ flex: 1, overflow: "hidden" }}>
          <FormBuilder
            key={formBuilderKey}
            initialJson={viewingOld?.json || initialJson}
            onChange={json => {
              if (!viewingOld) setSurveyJson(json);
            }}

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
          />
        </div>

        {sidebarOpen && (
          <div style={{ width: sidebarWidth, flexShrink: 0, borderLeft: `1px solid ${C.border}`, background: C.white, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
            {/* Drag handle for resizing */}
            <div
              onMouseDown={() => {
                resizingRef.current = true;
                document.body.style.cursor = "ew-resize";
                document.body.style.userSelect = "none";
              }}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 4,
                cursor: "ew-resize",
                zIndex: 10,
              }}
            />
            <div style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
              <button
                onClick={sidebarScrollLeft}
                style={{
                  visibility: canSidebarScrollLeft ? 'visible' : 'hidden',
                  flexShrink: 0,
                  width: 24,
                  height: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: C.white,
                  border: `1px solid ${C.border}`,
                  borderRadius: 4,
                  cursor: "pointer",
                  marginLeft: 4,
                  color: C.textSecond,
                }}
              >
                <ChevronLeftIcon style={{ fontSize: 16 }} />
              </button>
              <div
                ref={sidebarTabsRef}
                onScroll={checkSidebarScrollState}
                style={{ display: "flex", overflowX: "auto", gap: 6, padding: "8px 6px", scrollbarWidth: "none", flex: 1 }}
              >
                {sidebarTabs.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSidebarTab(t.id)}
                    style={{
                      flex: "0 0 auto",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      height: 30,
                      border: `1px solid ${sidebarTab === t.id ? C.purple : C.border}`,
                      borderRadius: 7,
                      background: sidebarTab === t.id ? C.purplePale : C.white,
                      color: sidebarTab === t.id ? C.purple : C.textSecond,
                      fontSize: 12,
                      fontWeight: sidebarTab === t.id ? 600 : 400,
                      cursor: "pointer",
                      padding: "0 12px",
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                      whiteSpace: "nowrap",
                    }}
                    onMouseEnter={(e) => { if (sidebarTab !== t.id) { e.currentTarget.style.background = "#F9FAFB"; e.currentTarget.style.borderColor = C.purple; e.currentTarget.style.color = C.purple; } }}
                    onMouseLeave={(e) => { if (sidebarTab !== t.id) { e.currentTarget.style.background = C.white; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSecond; } }}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
              <button
                onClick={sidebarScrollRight}
                style={{
                  visibility: canSidebarScrollRight ? 'visible' : 'hidden',
                  flexShrink: 0,
                  width: 24,
                  height: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: C.white,
                  border: `1px solid ${C.border}`,
                  borderRadius: 4,
                  cursor: "pointer",
                  marginRight: 4,
                  color: C.textSecond,
                }}
              >
                <ChevronRightIcon style={{ fontSize: 16 }} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "13px 13px 24px" }}>
              {sidebarTab === "meta" && (
                <div style={{ animation: "fadeUp .15s ease" }}>
                  <div style={{
                    background: C.offWhite,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    padding: "10px 11px",
                    marginBottom: 14,
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                  }}>
                    <InfoOutlinedIcon style={{ fontSize: 15, color: C.textMuted, marginTop: 1 }} />
                    <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.55 }}>
                      Form Setup controls identity, banner, access, and the managed Company selector. Canvas Properties now handles per-field and display behavior only; duplicate fields are flagged below instead of removed.
                    </div>
                  </div>
                  <FB label="Form Title" hint="Becomes the SP list name. Locked after first publish." required>
                    <TextInput
                      value={meta.formTitle}
                      onChange={v => setM("formTitle", v)}
                      placeholder="Training Application Form"
                      disabled={isEditing}
                    />
                    {isEditing && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3 }}>Locked after first publish</div>}
                  </FB>
                  <FB label="Form ID / Doc No." required>
                    <TextInput value={meta.formId} onChange={v => setM("formId", v)} placeholder="PMW-HR-001" />
                  </FB>
                  <FB label="Version" hint={isEditing ? `Current live version: v${originalVersion || "?"}. Reusing a version/profile overwrites that published profile.` : "Admin-controlled. Publish will use exactly this value."}>
                    <TextInput value={meta.formVersion} onChange={v => setM("formVersion", v)} placeholder="1.0" />
                  </FB>
                  <FB label="Publish Profile" hint="Use the same version with a separate evaluation / approval workflow. Saving a profile only preserves the current default /form route.">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 7 }}>
                      <TextInput
                        value={meta.publishKey}
                        onChange={v => setMeta(m => ({ ...m, publishKey: normalizePublishKey(v) }))}
                        placeholder="production"
                      />
                      <TextInput
                        value={meta.publishLabel}
                        onChange={v => setMeta(m => ({ ...m, publishLabel: v }))}
                        placeholder="Production"
                      />
                    </div>
                  </FB>
                  <FB label="Document Control Header" hint="Shown under the form title before the company logo row. Blank Document / Revision values fall back to Form ID and Version.">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                      <TextInput value={meta.documentHeader.documentNumber || ""} onChange={v => setDocumentHeader("documentNumber", v)} placeholder={meta.formId || "Document Number"} />
                      <TextInput value={meta.documentHeader.issueNumber || ""} onChange={v => setDocumentHeader("issueNumber", v)} placeholder="Issue Number" />
                      <TextInput value={meta.documentHeader.effectiveDate || ""} onChange={v => setDocumentHeader("effectiveDate", v)} placeholder="Effective Date" type="date" />
                      <TextInput value={meta.documentHeader.revisionNumber || ""} onChange={v => setDocumentHeader("revisionNumber", v)} placeholder={meta.formVersion || "Revision Number"} />
                      <TextInput value={meta.documentHeader.revisionDate || ""} onChange={v => setDocumentHeader("revisionDate", v)} placeholder="Revision Date" type="date" />
                    </div>
                  </FB>
                  <FB label="Route slug" hint="URL: /form/{slug}. Locked after first publish.">
                    <div style={{ position: "relative" }}>
                      <TextInput
                        value={meta.slug}
                        onChange={v => {
                          setM("slug", slugify(v));
                          setSlugManual(true);
                        }}
                        placeholder="training-application"
                        disabled={slugLocked}
                        error={slugError}
                      />
                      {slugChecking && (
                        <div style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)" }}>
                          <Spinner size={12} />
                        </div>
                      )}
                      {!slugError && !slugChecking && meta.slug && !slugLocked && (
                        <div style={{ fontSize: 10, color: C.green, marginTop: 3 }}>Slug available</div>
                      )}
                      {slugLocked && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3 }}>Locked after publish</div>}
                    </div>
                  </FB>
                  <FB label="ISO Standards">
                    <TextInput value={meta.isoStandards} onChange={v => setM("isoStandards", v)} />
                  </FB>
                  <FB label="Companies" hint="One per line">
                    <textarea
                      value={meta.companies}
                      onChange={e => setM("companies", e.target.value)}
                      rows={4}
                      style={{ ...inp, height: "auto", padding: "7px 10px", resize: "vertical", lineHeight: 1.7 }}
                    />
                  </FB>
                  <div style={{
                    background: meta.companyChoiceEnabled ? C.purplePale : C.offWhite,
                    border: `1px solid ${meta.companyChoiceEnabled ? C.purpleMid : C.border}`,
                    borderRadius: 10,
                    padding: "11px 12px",
                    marginBottom: 14,
                    boxShadow: meta.companyChoiceEnabled ? "0 8px 20px rgba(16,16,16,0.06)" : "none",
                    transition: "background-color .15s, border-color .15s, box-shadow .15s",
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                      <BusinessIcon style={{ fontSize: 16, color: meta.companyChoiceEnabled ? C.purple : C.textMuted, marginTop: 1 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary, marginBottom: 2 }}>Company selector</div>
                        <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.5 }}>
                          Uses the Companies list above as a required single-select field. Default answer stays empty.
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={meta.companyChoiceEnabled}
                        onChange={v => setMeta(m => ({ ...m, companyChoiceEnabled: v }))}
                        label={meta.companyChoiceEnabled ? "On" : "Off"}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      <button
                        type="button"
                        style={{
                          flex: 1,
                          minHeight: 34,
                          border: `1px solid ${meta.companyChoiceEnabled ? C.purple : C.border}`,
                          borderRadius: 8,
                          background: meta.companyChoiceEnabled ? C.white : C.offWhite,
                          color: meta.companyChoiceEnabled ? C.purple : C.textMuted,
                          fontSize: 11,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 5,
                          cursor: "default",
                        }}
                      >
                        <RadioButtonCheckedIcon style={{ fontSize: 14 }} /> Radio
                      </button>
                      <button
                        type="button"
                        disabled
                        title="Checkbox fields allow multiple selections, so they are not used for one-company selection."
                        style={{
                          flex: 1,
                          minHeight: 34,
                          border: `1px solid ${C.border}`,
                          borderRadius: 8,
                          background: C.white,
                          color: C.textMuted,
                          fontSize: 11,
                          fontWeight: 600,
                          opacity: 0.55,
                          cursor: "not-allowed",
                        }}
                      >
                        Checkbox
                      </button>
                    </div>
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 8, lineHeight: 1.5 }}>
                      Field maintained on the canvas: <strong>{COMPANY_FIELD_LABEL}</strong> / <code>{COMPANY_FIELD_NAME}</code>.
                    </div>
                    {meta.companyChoiceEnabled && companyOptions.length < 2 && (
                      <div style={{ background: C.amberPale, border: "1px solid #FDE68A", borderRadius: 8, padding: "7px 9px", fontSize: 10, color: C.amber, marginTop: 8, lineHeight: 1.45 }}>
                        <WarningIcon style={{ fontSize: 12, verticalAlign: "middle", marginRight: 4 }} />
                        Add at least two company lines before publishing.
                      </div>
                    )}
                    {meta.companyChoiceEnabled && extraCompanyFields.length > 0 && (
                      <div style={{ background: C.redPale, border: "1px solid #FCA5A5", borderRadius: 8, padding: "7px 9px", fontSize: 10, color: C.red, marginTop: 8, lineHeight: 1.45 }}>
                        <InfoOutlinedIcon style={{ fontSize: 12, verticalAlign: "middle", marginRight: 4 }} />
                        Possible duplicate company fields found: {extraCompanyFields.map(f => f.name || f.title).join(", ")}. None were removed.
                      </div>
                    )}
                  </div>
                  <FB label="Logo URL" hint="Custom logo URL for the banner (defaults to /logo-128.png)">
                    <TextInput value={meta.logoUrl} onChange={v => setM("logoUrl", v)} placeholder="https://example.com/logo.png" />
                  </FB>
                  <FB label="Header / Companies banner" hint="Show or hide the ISO + company banner at the top of the form.">
                    <div style={{
                      background: showBanner ? C.greenPale : C.offWhite,
                      border: `1px solid ${showBanner ? "#6EE7B7" : C.border}`,
                      borderRadius: 8,
                      padding: "10px 12px",
                      transition: "background-color .2s, border-color .2s",
                    }}>
                      <ToggleSwitch checked={showBanner} onChange={setShowBanner} label={showBanner ? "Banner visible" : "Banner hidden"} />
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 6, lineHeight: 1.5 }}>
                        {showBanner ? "ISO standards and company names appear at the top of the form." : "Form opens without the header banner."}
                      </div>
                    </div>
                  </FB>
                  <FB label="Form Access">
                    <div style={{ display: "flex", gap: 7 }}>
                      {[
                        { v: true, label: <><PublicIcon style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 2 }} /> Public</>, hint: "Any M365 user" },
                        { v: false, label: <><LockIcon style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 2 }} /> Private</>, hint: "Explicit sign-in gate" },
                      ].map(opt => (
                        <button
                          key={String(opt.v)}
                          onClick={() => setIsPublic(opt.v)}
                          style={{
                            flex: 1,
                            padding: "8px 4px",
                            borderRadius: 8,
                            cursor: "pointer",
                            border: `1.5px solid ${isPublic === opt.v ? C.purple : C.border}`,
                            background: isPublic === opt.v ? C.purplePale : C.white,
                            color: isPublic === opt.v ? C.purple : C.textSecond,
                            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                            transition: "background-color .13s, border-color .13s, color .13s",
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{opt.label}</div>
                          <div style={{ fontSize: 9, color: C.textMuted, marginTop: 2 }}>{opt.hint}</div>
                        </button>
                      ))}
                    </div>
                  </FB>
                </div>
              )}

              {sidebarTab === "pdf" && (
                <div style={{ animation: "fadeUp .15s ease" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginBottom: 10 }}>
                    PDF form layout
                  </div>
                  <FB label="Custom PDF layout">
                    <div style={{
                      background: meta.pdfConfig.enabled ? C.greenPale : C.offWhite,
                      border: `1px solid ${meta.pdfConfig.enabled ? "#6EE7B7" : C.border}`,
                      borderRadius: 8,
                      padding: "10px 12px",
                    }}>
                      <ToggleSwitch
                        checked={meta.pdfConfig.enabled}
                        onChange={enabled => setPdfConfig({ enabled })}
                        label={meta.pdfConfig.enabled ? "Use custom layout" : "Use default layout"}
                      />
                    </div>
                  </FB>
                  <FB label="Document title">
                    <TextInput
                      value={meta.pdfConfig.title}
                      onChange={title => setPdfConfig({ title })}
                      placeholder="Form Submission"
                    />
                  </FB>
                  <FB label="Header logo URL" hint="Overrides the form banner logo in generated PDFs.">
                    <TextInput
                      value={meta.pdfConfig.headerLogoUrl || ""}
                      onChange={headerLogoUrl => setPdfConfig({ headerLogoUrl })}
                      placeholder="https://example.com/logo.png"
                    />
                  </FB>
                  <FB label="Footer text">
                    <TextInput
                      value={meta.pdfConfig.footerText || ""}
                      onChange={footerText => setPdfConfig({ footerText })}
                      placeholder="Generated date appears when blank"
                    />
                  </FB>
                  <FB label="Density">
                    <div style={{ display: "flex", gap: 7 }}>
                      {(["compact", "comfortable"] as const).map(density => (
                        <button
                          key={density}
                          type="button"
                          onClick={() => setPdfConfig({ density })}
                          style={{
                            flex: 1,
                            minHeight: 34,
                            borderRadius: 8,
                            border: `1.5px solid ${meta.pdfConfig.density === density ? C.purple : C.border}`,
                            background: meta.pdfConfig.density === density ? C.purplePale : C.white,
                            color: meta.pdfConfig.density === density ? C.purple : C.textSecond,
                            cursor: "pointer",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {density === "compact" ? "Compact" : "Comfortable"}
                        </button>
                      ))}
                    </div>
                  </FB>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <FB label="Primary color">
                      <input
                        type="color"
                        value={meta.pdfConfig.primaryColor || "#0078D4"}
                        onChange={e => setPdfConfig({ primaryColor: e.target.value })}
                        style={{ ...inp, height: 38, padding: 4 }}
                      />
                    </FB>
                    <FB label="Secondary color">
                      <input
                        type="color"
                        value={meta.pdfConfig.secondaryColor || "#6264A7"}
                        onChange={e => setPdfConfig({ secondaryColor: e.target.value })}
                        style={{ ...inp, height: 38, padding: 4 }}
                      />
                    </FB>
                  </div>
                  {[
                    ["showStatusBadge", "Show status badge"],
                    ["showApproverChain", "Show approval/evaluation chain"],
                    ["showEvaluationDetails", "Show evaluation details"],
                    ["showSignatures", "Show signature blocks"],
                    ["includeEmptyEvaluationFields", "Include blank evaluation fields for paper/manual evaluation"],
                  ].map(([key, label]) => (
                    <label key={key} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 0",
                      fontSize: 11,
                      color: C.textSecond,
                      borderBottom: `1px solid ${C.borderLight}`,
                    }}>
                      <input
                        type="checkbox"
                        checked={Boolean(meta.pdfConfig[key as keyof PdfConfig])}
                        onChange={e => setPdfConfig({ [key]: e.target.checked } as Partial<PdfConfig>)}
                        style={{ width: 14, height: 14, accentColor: C.purple }}
                      />
                      {label}
                    </label>
                  ))}
                  <FB label="Sample PDF" hint="Select an existing form, then generate a local preview filled with fake submission, signature, photo, approval, and evaluation data.">
                    <div style={{ display: "grid", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => void handleGenerateSamplePdf("filled")}
                        disabled={!!samplePdfGenerating || !isEditing || !surveyJson}
                        style={{
                          width: "100%",
                          minHeight: 38,
                          border: "none",
                          borderRadius: 8,
                          background: samplePdfGenerating || !isEditing || !surveyJson ? C.border : C.purple,
                          color: C.white,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: samplePdfGenerating || !isEditing || !surveyJson ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                        }}
                      >
                        {samplePdfGenerating === "filled" && <Spinner size={14} />}
                        {samplePdfGenerating === "filled" ? "Generating sample..." : "Generate filled sample PDF"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleGenerateSamplePdf("manual")}
                        disabled={!!samplePdfGenerating || !isEditing || !surveyJson || !hasSampleEvaluationLayer(layerConfig)}
                        style={{
                          width: "100%",
                          minHeight: 38,
                          border: `1px solid ${C.purpleMid}`,
                          borderRadius: 8,
                          background: samplePdfGenerating || !isEditing || !surveyJson || !hasSampleEvaluationLayer(layerConfig) ? C.offWhite : C.purplePale,
                          color: samplePdfGenerating || !isEditing || !surveyJson || !hasSampleEvaluationLayer(layerConfig) ? C.textMuted : C.purple,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: samplePdfGenerating || !isEditing || !surveyJson || !hasSampleEvaluationLayer(layerConfig) ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                        }}
                      >
                        {samplePdfGenerating === "manual" && <Spinner size={14} />}
                        {samplePdfGenerating === "manual" ? "Generating manual sample..." : "Generate manual / physical evaluation sample"}
                      </button>
                    </div>
                  </FB>
                </div>
              )}

              {sidebarTab === "layers" && (
                <div>
                  {profileLayerEdit && (
                    <div style={{
                      background: C.purplePale,
                      border: `1px solid ${C.purpleMid}`,
                      borderRadius: 10,
                      padding: "10px 11px",
                      marginBottom: 12,
                      boxShadow: "0 8px 20px rgba(16,16,16,0.06)",
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: C.textPrimary, marginBottom: 3 }}>
                        Editing profile layers
                      </div>
                      <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.55, marginBottom: 9 }}>
                        Changes here save only to <strong>{profileLayerEdit.publishLabel}</strong> / v{profileLayerEdit.version} / {profileLayerEdit.publishKey}. Use Publish only when you want to republish the whole profile.
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                        <button
                          onClick={handleSaveProfileLayers}
                          disabled={profileLayerSaving}
                          style={{
                            minHeight: 32,
                            border: "none",
                            borderRadius: 7,
                            background: profileLayerSaving ? C.border : C.purple,
                            color: profileLayerSaving ? C.textMuted : C.white,
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: profileLayerSaving ? "wait" : "pointer",
                            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                          }}
                        >
                          {profileLayerSaving ? "Saving..." : "Save profile layers"}
                        </button>
                        <button
                          onClick={() => setProfileLayerEdit(null)}
                          disabled={profileLayerSaving}
                          style={{
                            minHeight: 32,
                            border: `1px solid ${C.border}`,
                            borderRadius: 7,
                            background: C.white,
                            color: C.textSecond,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: profileLayerSaving ? "not-allowed" : "pointer",
                            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                          }}
                        >
                          Exit layer edit
                        </button>
                      </div>
                    </div>
                  )}
                  {isEditing && !viewingOld && (
                    <div style={{
                      background: C.offWhite,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      padding: "9px 10px",
                      marginBottom: 10,
                      display: "grid",
                      gap: 8,
                    }}>
                      <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.55 }}>
                        Need a separate workflow for the same version? Publish New Profile creates a blank layer draft. Existing profiles keep their saved evaluation and approval layers.
                      </div>
                      <button
                        onClick={handleStartProfileLayersFromScratch}
                        disabled={profileLayerSaving}
                        style={{
                          minHeight: 32,
                          border: `1px dashed ${C.purpleMid}`,
                          borderRadius: 7,
                          background: C.white,
                          color: C.purple,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: profileLayerSaving ? "not-allowed" : "pointer",
                          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                        }}
                      >
                        <EditNoteIcon style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} />
                        Start this profile's layers from scratch
                      </button>
                    </div>
                  )}
                  <LayerConfigPanel
                    value={layerConfig}
                    onChange={setLayerConfig}
                    siteUsers={siteUsers}
                    formFields={layerFieldOptions}
                    slug={meta.slug}
                  />
                </div>
              )}

              {sidebarTab === "version" && (
                <div style={{ animation: "fadeUp .15s ease" }}>
                  {!isEditing ? (
                    <div style={{ fontSize: 11, color: C.textMuted, fontStyle: "italic" }}>
                      Publish a form first to see version history.
                    </div>
                  ) : (
                    <>
                      <div style={{
                        background: C.offWhite,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: "9px 10px",
                        fontSize: 10,
                        color: C.textMuted,
                        lineHeight: 1.55,
                        marginBottom: 10,
                      }}>
                        Manage published profiles here. Off or expired profiles cannot be opened by public users; the current profile is the default route for <strong>/form/{meta.slug || "slug"}</strong>.
                      </div>
                      {viewingOld && (
                        <div style={{
                          background: C.amberPale,
                          border: "1px solid #FDE68A",
                          borderRadius: 8,
                          padding: "8px 11px",
                          fontSize: 11,
                          color: C.amber,
                          marginBottom: 12,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}>
                          <span>Viewing v{viewingOld.version} / {viewingOld.publishKey}</span>
                          <button
                            onClick={() => setViewingOld(null)}
                            style={{ background: "none", border: "none", color: C.amber, cursor: "pointer", fontWeight: 600, fontSize: 11 }}
                          >
                            Back to current
                          </button>
                        </div>
                      )}
                      <VersionHistory
                        history={versionHistory}
                        current={originalVersion || ""}
                        currentPublishKey={normalizePublishKey(meta.publishKey)}
                        slug={meta.slug}
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
                      />
                    </>
                  )}
                </div>
              )}

              {sidebarTab === "log" && (
                <div style={{ animation: "fadeUp .15s ease" }}>
                  {logLoading ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
                      <Spinner />
                    </div>
                  ) : (
                    <AuditLog logs={auditLog} />
                  )}
                </div>
              )}

              {sidebarTab === "publish" && (
                <div style={{ animation: "fadeUp .15s ease" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 16 }}>
                    {[
                      ["Form", meta.formTitle || <em style={{ color: C.red }}>Missing <WarningIcon style={{ fontSize: 12, verticalAlign: 'middle' }} /></em>],
                      ["Form ID", meta.formId || <em style={{ color: C.red }}>Missing <WarningIcon style={{ fontSize: 12, verticalAlign: 'middle' }} /></em>],
                      ["Version", `v${proposedVersion}${isDraft ? " (draft)" : ""}`],
                      ["Profile", `${meta.publishLabel || "Production"} (${normalizePublishKey(meta.publishKey)})`],
                      ["Status", isDraft ? <span style={{ color: C.amber }}><EditNoteIcon style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 2 }} /> Draft</span> : isEditing ? <span style={{ color: C.green }}><CheckCircleIcon style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 2 }} /> Published</span> : "Not published"],
                      ["Route", meta.slug ? `/form/${meta.slug}${normalizePublishKey(meta.publishKey) === DEFAULT_PUBLISH_KEY ? "" : `?publish=${normalizePublishKey(meta.publishKey)}`}` : <em style={{ color: C.amber }}>No slug</em>],
                      ["Layers", numLayers || "None"],
                      ["Banner", showBanner ? <><CheckCircleIcon style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 2 }} /> Visible</> : <><BlockIcon style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 2 }} /> Hidden</>],
                      ["Company", meta.companyChoiceEnabled ? <><CheckCircleIcon style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 2 }} /> Required radio</> : "Not required"],
                      ["Access", isPublic ? <><PublicIcon style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 2 }} /> Public</> : <><LockIcon style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 2 }} /> Private</>],
                    ].map(([k, v]) => (
                      <div key={k as string} style={{ display: "flex", gap: 10, fontSize: 12 }}>
                        <span style={{ color: C.textMuted, minWidth: 70 }}>{k as string}:</span>
                        <span style={{ color: C.textPrimary, fontWeight: 500 }}>{v as ReactNode}</span>
                      </div>
                    ))}
                  </div>
                  {slugError && (
                    <div style={{ background: C.redPale, border: "1px solid #FCA5A5", borderRadius: 8, padding: "7px 10px", fontSize: 11, color: C.red, marginBottom: 10 }}>
                      <WarningIcon style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 4 }} /> {slugError}
                    </div>
                  )}
                  {(!isEditing || isDraft) && (
                    <button
                      onClick={() => handleSaveDraft()}
                      disabled={!meta.formTitle.trim() || !!viewingOld}
                      style={{
                        width: "100%",
                        padding: "10px 0",
                        borderRadius: 8,
                        border: `1px solid ${C.border}`,
                        background: C.white,
                        color: !meta.formTitle.trim() || viewingOld ? C.textMuted : C.textSecond,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: !meta.formTitle.trim() || viewingOld ? "not-allowed" : "pointer",
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                        marginBottom: 8,
                        opacity: !meta.formTitle.trim() || viewingOld ? 0.5 : 1,
                      }}
                    >
<SaveIcon style={{ fontSize: 14, marginRight: 4 }} /> Save Draft
                    </button>
                  )}
                  <div style={{ display: "grid", gap: 8 }}>
                    <button
                      onClick={handleCreateNewProfileDraft}
                      disabled={!isEditing || !meta.formTitle || !meta.formId || !!slugError || !!viewingOld}
                      style={{
                        width: "100%",
                        padding: "11px 0",
                        borderRadius: 8,
                        border: "none",
                        background: !isEditing || !meta.formTitle || !meta.formId || slugError || viewingOld ? C.border : C.purple,
                        color: !isEditing || !meta.formTitle || !meta.formId || slugError || viewingOld ? C.textMuted : C.white,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: !isEditing || !meta.formTitle || !meta.formId || slugError || viewingOld ? "not-allowed" : "pointer",
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                      }}
                    >
                      {viewingOld ? <><WarningIcon style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} /> Close version preview to create profile</> : <><EditNoteIcon style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} /> Publish new profile</>}
                    </button>
                    <button
                      onClick={() => handlePublish(surveyJson as SurveyJson, "profile")}
                      disabled={!isEditing || !meta.formTitle || !meta.formId || !!slugError || !!viewingOld}
                      style={{
                        width: "100%",
                        padding: "11px 0",
                        borderRadius: 8,
                        border: `1px solid ${!isEditing || !meta.formTitle || !meta.formId || slugError || viewingOld ? C.border : C.purpleMid}`,
                        background: !isEditing || !meta.formTitle || !meta.formId || slugError || viewingOld ? C.offWhite : C.white,
                        color: !isEditing || !meta.formTitle || !meta.formId || slugError || viewingOld ? C.textMuted : C.purple,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: !isEditing || !meta.formTitle || !meta.formId || slugError || viewingOld ? "not-allowed" : "pointer",
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                      }}
                    >
                      {viewingOld ? <><WarningIcon style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} /> Close version preview to save profile</> : <><SaveIcon style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} /> Save profile only</>}
                    </button>
                    <button
                      onClick={() => handlePublish(surveyJson as SurveyJson, "live")}
                      disabled={!meta.formTitle || !meta.formId || !!slugError || !!viewingOld}
                      style={{
                        width: "100%",
                        padding: "11px 0",
                        borderRadius: 8,
                        border: "none",
                        background: !meta.formTitle || !meta.formId || slugError || viewingOld ? C.border : `linear-gradient(135deg,${C.purple},${C.purpleLight})`,
                        color: !meta.formTitle || !meta.formId || slugError || viewingOld ? C.textMuted : C.white,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: !meta.formTitle || !meta.formId || slugError || viewingOld ? "not-allowed" : "pointer",
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                      }}
                    >
                      {viewingOld ? <><WarningIcon style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} /> Close version preview to publish</> : isDraft ? <><RocketLaunchIcon style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} /> Actual publish (make live)</> : <><RocketLaunchIcon style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} /> Actual publish to /form route</>}
                    </button>
                    <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.55 }}>
                      Publish New Profile opens a blank same-version workflow. Save Profile Only publishes that profile for direct links; Actual Publish also makes it the default public <strong>/form/{meta.slug || "slug"}</strong> route.
                    </div>
                  </div>
                  <PrefilledQrPanel
                    surveyJson={surveyJson}
                    slug={meta.slug}
                    canGenerate={isEditing && !isDraft && !!meta.slug && !viewingOld}
                    publishKey={meta.publishKey}
                    publishLabel={meta.publishLabel}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

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
            if (provOk) navigate(`/admin/builder/${encodeURIComponent(meta.formTitle)}`);
          }}
        />
      )}
    </div>
  );
}

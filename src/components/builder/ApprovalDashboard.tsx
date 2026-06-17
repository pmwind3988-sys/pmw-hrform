/**
 * ApprovalDashboard.tsx — Admin view for pending form approvals
 * Route: /admin/approvals
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import { FlatLightPanelless } from "survey-core/themes";
import "survey-core/survey-core.min.css";

import { spGet, spPatch, triggerApprovalNotification, getAllFormConfigs, getFormConfigByTitle, submitEvaluationData, updateLayerStatus, ensureWorkflowColumns, getSharePointChoices, getFilteredListChoices } from "../../utils/formBuilderSP";
import { registerSignaturePad } from "../../utils/SignaturePad";
import { createSpClient } from "../../utils/sharepointClient";
import { acquireAccessTokenSilentOrRedirect } from "../../utils/authRecovery";
import { SP_STATIC } from "../../utils/spConfig";
import { SP_FORM_STATUS, SP_LAYER_STATUS } from "../../utils/statusConstants";
import { clearStoredAuthDecision } from "../../utils/authDecision";
import { enrichSurveyJsonChoices } from "../../utils/surveyChoiceEnrichment";
import { buildRejectedWorkflowPatch } from "../../utils/workflowStatus";
import { formatLayerProgress, getActiveLayers, resolveTotalLayerCount } from "./approvalDashboardLayerProgress";
import { getSelectedCompany, splitCompanyLines } from "../../utils/companySelection";
import { getDepartmentApproverLookupConfig } from "../../utils/departmentApproverLookup";
import type { PdfFormData } from "../../utils/FormPdfDocument";
import type { LayerConfigSource } from "./approvalDashboardLayerProgress";
import type { LayerConfigItem, ManualBranch, EvaluationLayerConfig, Submission } from "../../types";
import BlockIcon from "@mui/icons-material/Block";
import LockIcon from "@mui/icons-material/Lock";
import DescriptionIcon from "@mui/icons-material/Description";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import DeleteIcon from "@mui/icons-material/Delete";
const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
registerSignaturePad();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBMISSIONS_PER_PAGE = 12;

// Theme
const C = {
  purple: "#0078D4",
  purpleLight: "#106EBE",
  purplePale: "#E6F2FB",
  purpleMid: "#B4D5F0",
  bg: "#F9FAFB",
  cardBg: "#FFFFFF",
  border: "#E5E7EB",
  textPrimary: "#111827",
  textSecond: "#6B7280",
  textMuted: "#9CA3AF",
  green: "#059669",
  greenPale: "#D1FAE5",
  greenBorder: "#6EE7B7",
  red: "#DC2626",
  redPale: "#FEE2E2",
  amber: "#D97706",
  amberPale: "#FEF3C7",
};

interface PendingItem {
  Id: number;
  Title: string;
  SubmittedBy: string;
  SubmittedAt: string;
  Status: string;
  CurrentApprovalLayer: number;
  FormVersion: string;
  RawJSON: string;
  CurrentLayer?: number;
  FormStatus?: string;
  L1_Status?: string;
  PdfUrl?: string;
  EvaluationData?: string;
  SelectedBranch?: string;
  totalLayers?: number;
}

function getPendingItemKey(item: Pick<PendingItem, "Title" | "Id">): string {
  return `${item.Title}::${item.Id}`;
}

interface FormConfig {
  Title: string;
  NumberOfApprovalLayer?: number;
  FormID?: string;
  LayerConfig?: string;
  [key: string]: unknown;
}

// ── PDF Helper ─────────────────────────────────────────────────────────────
async function loadPdfData(item: PendingItem, token: string): Promise<PdfFormData | null> {
  try {
    const cfg = await getFormConfigByTitle(token, item.Title);
    if (!cfg) return null;

    let formVersion = item.FormVersion || (cfg as unknown as Record<string, unknown>).CurrentVersion as string || "1.0";
    if (!formVersion) {
      try {
        const respItem = await spGet(
          token,
          `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(item.Title)}')/items(${item.Id})?$select=FormVersion`
        ) as { FormVersion?: string };
        formVersion = respItem?.FormVersion || "1.0";
      } catch { /* keep fallback */ }
    }

    // Load survey JSON
    const versionData = await spGet(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(cfg.Title)}' and FormVersion eq '${encodeURIComponent(formVersion)}'&$select=SurveyJSON&$top=1`
    ) as { value?: { SurveyJSON?: string }[] };

    const rawSurvey = versionData.value?.[0]?.SurveyJSON;
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
      'FormVersion','FormID','RawJSON','CurrentLayer','FormStatus','EvaluationData',
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

    const { buildPdfLayerResults } = await import("../../utils/generateFormPdf");
    return {
      surveyJson: surveyContent as PdfFormData["surveyJson"],
      responseData: data,
      layerResults: buildPdfLayerResults(respItem),
      meta: {
        submittedBy: item.SubmittedBy || "",
        submittedAt: item.SubmittedAt || "",
        formTitle: item.Title,
        formVersion,
        formStatus: "",
      },
      companyInfo: splitCompanyLines(versionMeta.companies),
      isoStandards: typeof versionMeta.isoStandards === "string" ? versionMeta.isoStandards : undefined,
      logoUrl: typeof versionMeta.logoUrl === "string" && versionMeta.logoUrl.trim() ? versionMeta.logoUrl : "/logo-128.png",
    };
  } catch {
    return null;
  }
}

// ── Status helpers ─────────────────────────────────────────────────────────
function getItemStatus(item: PendingItem): "pending" | "approved" | "rejected" {
  const s = (item.FormStatus || item.Status || "").toLowerCase();
  if (s.includes("reject") || s === "rejected") return "rejected";
  if (s === "approved" || s.includes("approved") || s === "completed" || s === "fully approved" || s.includes("confirmed")) return "approved";
  if (s === "submitted" || s === "in review" || s === "pending" || s === "") return "pending";
  return "pending";
}

function getItemDisplayStatus(item: PendingItem): string {
  const s = item.FormStatus || item.Status || "";
  if (!s) return "Pending";
  return s;
}

function formatDateTime(d: string | undefined | null): string {
  if (!d) return "N/A";
  try {
    const dt = new Date(d);
    return dt.toLocaleString("en-MY", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    }).replace(/\b(am|pm)\b/gi, m => m.toUpperCase());
  } catch {
    return d;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toAbsoluteSharePointUrl(url: string): string {
  if (!url || url.startsWith("http") || url.startsWith("data:")) return url;
  if (!url.startsWith("/")) return url;
  try {
    return `${new URL(SP_SITE_URL).origin}${url}`;
  } catch {
    return url;
  }
}

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (isRecord(value)) {
    for (const key of ["email", "Email", "value", "Value", "text", "Title"]) {
      const next = value[key];
      if (typeof next === "string" && next.trim()) return next.trim();
    }
  }
  return "";
}

function parseMaybeJsonRecord(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractImageUrl(value: unknown): string {
  if (typeof value === "string") {
    const parsed = parseMaybeJsonRecord(value);
    if (parsed) return extractImageUrl(parsed);
    return toAbsoluteSharePointUrl(value);
  }
  if (!isRecord(value)) return "";
  for (const key of ["Url", "url", "serverRelativeUrl", "ServerRelativeUrl"]) {
    const next = value[key];
    if (typeof next === "string" && next.trim()) return toAbsoluteSharePointUrl(next.trim());
  }
  const serverUrl = value.serverUrl || value.ServerUrl;
  const relativeUrl = value.serverRelativeUrl || value.ServerRelativeUrl;
  if (typeof serverUrl === "string" && typeof relativeUrl === "string") {
    return `${serverUrl.replace(/\/$/, "")}${relativeUrl}`;
  }
  return "";
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function normalizeDateInputValue(value: unknown, inputType: string): unknown {
  const text = valueToText(value);
  if (!text) return value;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;

  if (inputType === "date") {
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
  }
  if (inputType === "time") {
    return `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
  }
  if (inputType === "datetime-local") {
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}T${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
  }
  return text;
}

function walkSurveyElements(surveyJson: unknown, visit: (element: Record<string, unknown>) => void): void {
  const root = isRecord(surveyJson) && isRecord(surveyJson.surveyJson) ? surveyJson.surveyJson : surveyJson;
  const pages = isRecord(root) && Array.isArray(root.pages) ? root.pages : [];
  const walk = (elements: unknown): void => {
    if (!Array.isArray(elements)) return;
    for (const element of elements) {
      if (!isRecord(element)) continue;
      visit(element);
      walk(element.elements);
      walk(element.templateElements);
    }
  };
  for (const page of pages) {
    if (isRecord(page)) walk(page.elements);
  }
}

function normalizeResponseDataForSurvey(
  surveyJson: unknown,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...data };
  walkSurveyElements(surveyJson, (element) => {
    const name = typeof element.name === "string" ? element.name : "";
    if (!name || !(name in normalized)) return;
    const type = typeof element.type === "string" ? element.type : "";
    const inputType = typeof element.inputType === "string" ? element.inputType : "";

    if (type === "signaturepad") {
      normalized[name] = extractImageUrl(normalized[name]);
      return;
    }
    if (type === "text" && ["date", "datetime-local", "time"].includes(inputType)) {
      normalized[name] = normalizeDateInputValue(normalized[name], inputType);
    }
  });
  return normalized;
}

function stripFieldReference(value: string): string {
  return value.replace(/^\$\{/, "").replace(/\}$/, "");
}

async function resolveDepartmentApproverEmail(
  token: string,
  layer: LayerConfigItem,
  submittedData: Record<string, unknown>,
): Promise<{ email: string; name: string }> {
  if (layer.assignee.type !== "department-approver") return { email: "", name: "" };

  const layerLabel = layer.title || `Layer ${layer.layerNumber}`;
  const departmentField = layer.assignee.value.trim();
  const department = valueToText(submittedData[departmentField]);
  if (!departmentField) {
    throw new Error(`${layerLabel} needs a department field before the workflow can start.`);
  }
  if (!department) {
    throw new Error(`${layerLabel} needs a department value before the workflow can start.`);
  }

  const config = getDepartmentApproverLookupConfig(layer.assignee);
  const params = new URLSearchParams();
  const filters = [`${config.departmentColumn} eq '${department.replace(/'/g, "''")}'`];
  if (config.roleColumn && config.roleValue) {
    filters.push(`${config.roleColumn} eq '${config.roleValue.replace(/'/g, "''")}'`);
  }
  params.set("$filter", filters.join(" and "));
  params.set("$select", [config.departmentColumn, config.emailColumn, config.nameColumn].join(","));
  params.set("$top", "2");

  const data = await spGet(
    token,
    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(config.listName)}')/items?${params.toString()}`,
  ) as { value?: Record<string, unknown>[] };
  const matches = data.value ?? [];
  if (matches.length === 0) {
    throw new Error(`${layerLabel} could not find ${config.roleValue || "an approver"} for department "${department}".`);
  }
  if (matches.length > 1) {
    throw new Error(`${layerLabel} found more than one ${config.roleValue || "approver"} for department "${department}".`);
  }

  const email = valueToText(matches[0][config.emailColumn]);
  if (!EMAIL_RE.test(email)) {
    throw new Error(`${layerLabel} found an invalid approver email for department "${department}".`);
  }
  return {
    email,
    name: valueToText(matches[0][config.nameColumn]),
  };
}

async function resolveLayerAssigneeEmail(
  token: string,
  layer: LayerConfigItem,
  submittedData: Record<string, unknown>,
): Promise<{ email: string; error?: string }> {
  const layerLabel = layer.title || `Layer ${layer.layerNumber}`;
  if (layer.assignee.type === "department-approver") {
    try {
      const resolved = await resolveDepartmentApproverEmail(token, layer, submittedData);
      return { email: resolved.email };
    } catch (error) {
      return {
        email: "",
        error: error instanceof Error ? error.message : `${layerLabel} could not resolve the department approver.`,
      };
    }
  }

  const email = layer.assignee.type === "user"
    ? layer.assignee.value.trim()
    : valueToText(submittedData[stripFieldReference(layer.assignee.value)]);

  if (layer.authMode === "365" && !EMAIL_RE.test(email)) {
    return {
      email,
      error: `${layerLabel} needs a valid assignee email before the workflow can start.`,
    };
  }

  if (email && !EMAIL_RE.test(email)) {
    return {
      email,
      error: `${layerLabel} resolved to "${email}", which is not a valid email address.`,
    };
  }

  return { email };
}

/** Check if the current layer (based on selectedItem's CurrentLayer) already has a terminal status */
function isCurrentLayerTerminal(item: PendingItem, completedLayers: Record<number, { status: string }>): boolean {
  const clNum = Math.max(item.CurrentLayer || 0, item.CurrentApprovalLayer || 0) || 1;
  const clStatus = completedLayers[clNum]?.status || "";
  return ["Confirmed", "Approved", "Rejected", "Cancelled", "Skipped"].includes(clStatus);
}

export default function ApprovalDashboard() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => { document.title = "Approvals — PMW HR Form"; }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<PendingItem | null>(null);
  const [surveyJson, setSurveyJson] = useState<unknown>(null);
  const [responseData, setResponseData] = useState<Record<string, unknown> | null>(null);
  const [formConfig, setFormConfig] = useState<FormConfig | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [previewModel, setPreviewModel] = useState<Model | null>(null);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "evaluated">("pending");
  const [titleFilter, setTitleFilter] = useState("");
  const [submitterFilter, setSubmitterFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewMode, setViewMode] = useState<"approvals" | "evaluations">("approvals");
  const [listPage, setListPage] = useState(1);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [itemCurrentTypes, setItemCurrentTypes] = useState<Record<string, "approval" | "evaluation">>({});
  const formLayerConfigsRef = useRef<Record<string, LayerConfigSource>>({});
  const [needsBranchSelection, setNeedsBranchSelection] = useState(false);
  const [availableBranches, setAvailableBranches] = useState<ManualBranch[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PendingItem | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [currentLayerType, setCurrentLayerType] = useState<"approval" | "evaluation" | null>(null);
  const [evalSurveyModel, setEvalSurveyModel] = useState<Model | null>(null);
  const [evalValid, setEvalValid] = useState(true);
  const [actionSuccess, setActionSuccess] = useState<{
    type: "approved" | "rejected" | "confirmed";
    message: string;
    pdfUrl?: string;
  } | null>(null);
  const [completedLayers, setCompletedLayers] = useState<Record<number, { status: string; email?: string; signedAt?: string; rejection?: string; signature?: string; type?: string }>>({});


  const baseFilteredItems = useMemo(() => {
    let items = pendingItems;

    if (titleFilter.trim()) {
      const q = titleFilter.trim().toLowerCase();
      items = items.filter(i => i.Title.toLowerCase().includes(q));
    }

    if (submitterFilter.trim()) {
      const q = submitterFilter.trim().toLowerCase();
      items = items.filter(i => i.SubmittedBy.toLowerCase().includes(q));
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      items = items.filter(i => i.SubmittedAt && new Date(i.SubmittedAt) >= from);
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999); // end of day
      items = items.filter(i => i.SubmittedAt && new Date(i.SubmittedAt) <= to);
    }

    return [...items].sort((a, b) => {
      const bTime = b.SubmittedAt ? new Date(b.SubmittedAt).getTime() : 0;
      const aTime = a.SubmittedAt ? new Date(a.SubmittedAt).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;
      return b.Id - a.Id;
    });
  }, [pendingItems, titleFilter, submitterFilter, dateFrom, dateTo]);

  const categoryItems = useMemo(() => {
    return baseFilteredItems.filter(i =>
      viewMode === "evaluations" ? itemCurrentTypes[getPendingItemKey(i)] === "evaluation" : itemCurrentTypes[getPendingItemKey(i)] !== "evaluation"
    );
  }, [baseFilteredItems, itemCurrentTypes, viewMode]);

  const filteredItems = useMemo(() => {
    let items = categoryItems;

    if (statusFilter === "pending") {
      items = items.filter(i => getItemStatus(i) === "pending");
    } else if (statusFilter === "approved") {
      items = items.filter(i => getItemStatus(i) === "approved");
    } else if (statusFilter === "rejected") {
      items = items.filter(i => getItemStatus(i) === "rejected");
    } else if (statusFilter === "evaluated") {
      items = items.filter(i => getItemStatus(i) !== "pending");
    }

    return items;
  }, [categoryItems, statusFilter]);

  const totalListPages = Math.max(1, Math.ceil(filteredItems.length / SUBMISSIONS_PER_PAGE));
  const pagedItems = filteredItems.slice((listPage - 1) * SUBMISSIONS_PER_PAGE, listPage * SUBMISSIONS_PER_PAGE);

  useEffect(() => {
    setListPage(1);
  }, [viewMode, statusFilter, titleFilter, submitterFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (listPage > totalListPages) setListPage(totalListPages);
  }, [listPage, totalListPages]);

  // Admin access check (defense-in-depth backup for AdminGuard route wrapper)
  useEffect(() => {
    if (inProgress !== InteractionStatus.None) return;
    if (!isAuthenticated) return;

    createSpClient(instance, accounts).isGroupMember(SP_STATIC.adminGroup)
      .then((admin) => {
        setIsAdmin(admin);
        setAdminChecked(true);
      })
      .catch(() => {
        setIsAdmin(false);
        setAdminChecked(true);
      });
  }, [isAuthenticated, inProgress, instance, accounts]);

  // Get token
  useEffect(() => {
    if (!adminChecked || !isAdmin) return;
    if (inProgress !== InteractionStatus.None) return;
    if (!isAuthenticated) return;

    const origin = new URL(import.meta.env.VITE_SP_SITE_URL || "https://placeholder.sharepoint.com").origin;
    acquireAccessTokenSilentOrRedirect(instance, { scopes: [`${origin}/AllSites.Manage`], account: accounts[0] })
      .then(setToken)
      .catch(() => setError("Failed to acquire token"));
  }, [adminChecked, isAdmin, isAuthenticated, inProgress, instance, accounts]);

  // Load all items (pending, approved, rejected)
  useEffect(() => {
    if (!adminChecked || !isAdmin) return;
    if (!token) return;

    const loadData = async () => {
      try {
        const forms = await getAllFormConfigs(token);

        // Build form layer config map for item type resolution
        const formLayerConfigMap: Record<string, LayerConfigSource> = {};
        for (const form of forms ?? []) {
          try {
            const lc = form.LayerConfig ? JSON.parse(form.LayerConfig) : null;
            const layers: LayerConfigItem[] = lc?.layers ?? [];
            const branches: ManualBranch[] = (lc?.manualBranches ?? []) as ManualBranch[];
            formLayerConfigMap[form.Title] = { layers, manualBranches: branches };
          } catch {
            formLayerConfigMap[form.Title] = { layers: [] };
          }
        }
        formLayerConfigsRef.current = formLayerConfigMap;

        // Load version-specific LayerConfig from Web Form Versions
        const versionLayerMap: Record<string, LayerConfigSource> = {};
        try {
          const allVersions = await spGet(token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$select=FormTitle,FormVersion,SurveyJSON&$top=500`
          ) as { value?: { FormTitle: string; FormVersion: string; SurveyJSON: string }[] };
          for (const v of allVersions?.value ?? []) {
            try {
              const parsed = JSON.parse(v.SurveyJSON);
              if (parsed.layerConfig) {
                const key = `${v.FormTitle}__${v.FormVersion}`;
                versionLayerMap[key] = parsed.layerConfig;
              }
            } catch { /* skip unparseable */ }
          }
        } catch { /* version list may not exist */ }

        const allItems: PendingItem[] = [];
        for (const form of forms ?? []) {
          const hasApprovalLayers = (form.NumberOfApprovalLayer ?? 0) > 0;
          let hasEvalLayer = false;
          let hasBranches = false;
          if (form.LayerConfig) {
            try {
              const lc = JSON.parse(form.LayerConfig);
              hasEvalLayer = lc.layers?.some((l: { type: string }) => l.type === "evaluation") ?? false;
              hasBranches = (lc.manualBranches?.length ?? 0) > 0;
              if (hasBranches && !hasEvalLayer) {
                hasEvalLayer = (lc.manualBranches as ManualBranch[]).some(
                  (b) => b.layers?.some((l) => l.type === "evaluation")
                );
              }
            } catch {
              /* Invalid LayerConfig JSON — treat as no layers */
            }
          }
          // Branch-only forms store layers under manualBranches, not the main sequence.
          if (!hasApprovalLayers && !hasEvalLayer && !hasBranches) continue;

          const listName = form.Title;
          try {
            const items = await (async () => {
              // Query tiers: try progressively fewer custom columns.
              // SharePoint returns 400 if ANY selected column doesn't exist on the list.

              // Tier 1: core columns only (no CurrentLayer/SelectedBranch — may not exist on older lists)
              const tier1 = await (async () => {
                try {
                  return await spGet(token,
                    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,Title,SubmittedBy,SubmittedAt,FormVersion,Status,FormStatus,L1_Status,PdfUrl&$orderby=Created desc&$top=100`
                  ) as { value?: PendingItem[] };
                } catch { return null; }
              })();
              if (tier1) {
                // Fetch optional columns separately — any may not exist on older lists
                // CurrentLayer
                try {
                  const clData = await spGet(token,
                    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,CurrentLayer&$orderby=Created desc&$top=100`
                  ) as { value?: { Id: number; CurrentLayer?: number }[] };
                  if (clData.value) {
                    const clMap: Record<number, number> = {};
                    for (const c of clData.value) {
                      if (c.CurrentLayer !== undefined && c.CurrentLayer !== null) clMap[c.Id] = c.CurrentLayer;
                    }
                    for (const t1 of tier1.value || []) {
                      if (clMap[t1.Id] !== undefined) (t1 as unknown as Record<string, unknown>).CurrentLayer = clMap[t1.Id];
                    }
                  }
                } catch { /* column may not exist */ }
                // CurrentApprovalLayer
                try {
                  const calData = await spGet(token,
                    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,CurrentApprovalLayer&$orderby=Created desc&$top=100`
                  ) as { value?: { Id: number; CurrentApprovalLayer?: number }[] };
                  if (calData.value) {
                    const calMap: Record<number, number> = {};
                    for (const c of calData.value) {
                      if (c.CurrentApprovalLayer !== undefined && c.CurrentApprovalLayer !== null) calMap[c.Id] = c.CurrentApprovalLayer;
                    }
                    for (const t1 of tier1.value || []) {
                      if (calMap[t1.Id] !== undefined) (t1 as unknown as Record<string, unknown>).CurrentApprovalLayer = calMap[t1.Id];
                    }
                  }
                } catch { /* column may not exist */ }
                // SelectedBranch (only if the form has manual branches)
                if (hasBranches) {
                  try {
                    const sbData = await spGet(token,
                      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,SelectedBranch&$orderby=Created desc&$top=100`
                    ) as { value?: { Id: number; SelectedBranch?: string }[] };
                    if (sbData.value) {
                      const sbMap: Record<number, string> = {};
                      for (const c of sbData.value) {
                        if (c.SelectedBranch) sbMap[c.Id] = c.SelectedBranch;
                      }
                      for (const t1 of tier1.value || []) {
                        if (sbMap[t1.Id] !== undefined) (t1 as unknown as Record<string, unknown>).SelectedBranch = sbMap[t1.Id];
                      }
                    }
                  } catch { /* column may not exist */ }
                }
                return tier1;
              }

              // Tier 2: without PdfUrl, CurrentLayer
              const tier2 = await (async () => {
                try {
                  return await spGet(token,
                    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,Title,SubmittedBy,SubmittedAt,FormVersion,Status,FormStatus,L1_Status&$orderby=Created desc&$top=100`
                  ) as { value?: PendingItem[] };
                } catch { return null; }
              })();
              if (tier2) return tier2;

              // Tier 3: without FormStatus too
              const tier3 = await (async () => {
                try {
                  return await spGet(token,
                    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,Title,SubmittedBy,SubmittedAt,FormVersion,Status&$orderby=Created desc&$top=100`
                  ) as { value?: PendingItem[] };
                } catch { return null; }
              })();
              if (tier3) return {
                value: (tier3.value || []).map((item: PendingItem) => ({
                  ...item, FormStatus: '', CurrentLayer: 0, L1_Status: '',
                })) as PendingItem[],
              };

              // Tier 4: without Status too (ancient list)
              const basic = await spGet(token,
                `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,Title,Author/Name,Created&$expand=Author&$orderby=Created desc&$top=100`
              ) as { value?: Array<{ Id: number; Title?: string; Author?: { Name?: string }; Created?: string }> };

              return {
                value: (basic.value || []).map((item) => ({
                  Id: item.Id, Title: form.Title,
                  SubmittedBy: item.Author?.Name || '',
                  SubmittedAt: item.Created || '',
                  FormVersion: '', FormStatus: '', Status: '', CurrentLayer: 0, L1_Status: '',
                })) as PendingItem[],
              };
            })();

            if (items.value) {
              for (const item of items.value) {
                // Compute effective layers first so we can set totalLayers before pushing
                const versionKey = `${form.Title}__${item.FormVersion}`;
                const versionLc = versionLayerMap[versionKey];
                const baseLc = versionLc || formLayerConfigMap[form.Title];
                const effectiveLayers = getActiveLayers(baseLc, item.SelectedBranch);
                const totalLayers = resolveTotalLayerCount(baseLc, item.SelectedBranch, form.NumberOfApprovalLayer);

                // Set totalLayers on the item BEFORE pushing (spread creates a copy)
                if (totalLayers > 0) {
                  (item as unknown as Record<string, unknown>).totalLayers = totalLayers;
                }

                allItems.push({ ...item, Title: form.Title });

                // Compute item type
                let itemType: "approval" | "evaluation" = "approval";
                if (effectiveLayers.length > 0) {
                  let curr = Math.max(item.CurrentLayer || 0, item.CurrentApprovalLayer || 0);
                  // Only advance past L1 if it was successfully completed (Approved/Confirmed),
                  // NOT if it was Rejected/Cancelled — rejection is terminal
                  if (curr <= 1 && effectiveLayers.length > 1 && item.L1_Status && ["Approved", "Confirmed"].includes(item.L1_Status)) {
                    curr = 2;
                  }
                  if (curr < 1) curr = 1;
                  const current = effectiveLayers.find(l => l.layerNumber === curr);
                  if (current?.type === "evaluation") itemType = "evaluation";
                }
                setItemCurrentTypes((prev) => ({ ...prev, [getPendingItemKey(item)]: itemType }));
              }
            }
          } catch {
          }
        }

        setPendingItems(allItems);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [adminChecked, isAdmin, token]);

  // ── System columns to exclude from response data ──────────────────────
  const SYSTEM_FIELDS = new Set([
    'Id','Title','SubmittedBy','SubmittedAt','Status','CurrentApprovalLayer',
    'FormVersion','FormID','RawJSON','CurrentLayer','FormStatus','EvaluationData',
    'PDPAConsent','PDPANoticeVersion','PDPAConsentAt','RetentionUntil',
    'Author','Editor','Created','Modified','ContentType','PermMask',
    'L1_Status','L1_Email','L1_SignedAt','L1_Rejection','L1_Signature',
    'L2_Status','L2_Email','L2_SignedAt','L2_Rejection','L2_Signature',
    'L3_Status','L3_Email','L3_SignedAt','L3_Rejection','L3_Signature',
    'SelectedBranch',
  ]);

  // Load selected item details
  const loadItemDetails = useCallback(async (item: PendingItem) => {
    if (!token) return;

    setSelectedItem(item);
    setSurveyJson(null);
    setResponseData(null);
    setCurrentLayerType(null);
    setEvalSurveyModel(null);
    setEvalValid(true);
    setCompletedLayers({});

    try {
      // Get form config
      const cfg = await getFormConfigByTitle(token, item.Title) as FormConfig | null;
      setFormConfig(cfg);

      // Determine if manual branch selection is needed
      let pendingBranch = false;
      if (cfg?.LayerConfig) {
        try {
          const lc = JSON.parse(cfg.LayerConfig);
          const lcBranches = (lc.manualBranches || []) as ManualBranch[];
          if (lcBranches.length > 0 && !item.SelectedBranch) {
            pendingBranch = true;
            setNeedsBranchSelection(true);
            setAvailableBranches(lcBranches);
            setCurrentLayerType(null);
            setEvalSurveyModel(null);
          } else {
            setNeedsBranchSelection(false);
            setAvailableBranches([]);
          }
        } catch { setNeedsBranchSelection(false); }
      } else { setNeedsBranchSelection(false); setAvailableBranches([]); }

      // Load submitted form details before any workflow decision. Branch selection needs
      // the same read-only context as approval/evaluation actions.
      if (cfg) {
        // Resolve FormVersion
        let formVersion = item.FormVersion;
        if (!formVersion) {
          try {
            const respItem = await spGet(
              token,
              `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(item.Title)}')/items(${item.Id})?$select=FormVersion`
            ) as { FormVersion?: string };
            formVersion = respItem?.FormVersion || (cfg.CurrentVersion as string) || '1.0';
          } catch {
            formVersion = (cfg.CurrentVersion as string) || '1.0';
          }
        }

        // Get survey JSON from versions
        const versionData = await spGet(
          token,
          `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(cfg.Title)}' and FormVersion eq '${encodeURIComponent(formVersion)}'&$select=SurveyJSON&$top=1`
        ) as { value?: { SurveyJSON?: string }[] };

        const rawSurvey = versionData.value?.[0]?.SurveyJSON;
        let versionParsed: Record<string, unknown> | null = null;
        let surveyContentForPreview: unknown = null;
        if (rawSurvey) {
          versionParsed = JSON.parse(rawSurvey) as Record<string, unknown>;
          const surveyContent = versionParsed.surveyJson || versionParsed;
          surveyContentForPreview = isRecord(surveyContent)
            ? await enrichSurveyJsonChoices(surveyContent, {
              getSharePointChoices: (list, column) => getSharePointChoices(list, column, token),
              getFilteredListChoices: (list, valueColumn, filterColumn, filterValue) =>
                getFilteredListChoices(list, valueColumn, token, filterColumn, filterValue),
            })
            : surveyContent;
          setSurveyJson(surveyContentForPreview);
        }

        // Resolve LayerConfig: version-specific first, then current Master Form
        let versionLayerCfg: { layers?: LayerConfigItem[]; manualBranches?: ManualBranch[] } | null = null;
        if (versionParsed?.layerConfig) {
          versionLayerCfg = versionParsed.layerConfig as { layers?: LayerConfigItem[]; manualBranches?: ManualBranch[] };
        }

        // Load response item data (submitted field values)
        const respItem = await spGet(
          token,
          `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(item.Title)}')/items(${item.Id})`
        ) as Record<string, unknown>;

        // Filter out system columns, keep only survey question data
        const data: Record<string, unknown> = {};
        const layerHistory: Record<number, { status: string; email?: string; signedAt?: string; rejection?: string; signature?: string; type?: string }> = {};
        for (const [k, v] of Object.entries(respItem)) {
          if (!SYSTEM_FIELDS.has(k) && !/^L\d+_/.test(k) && v !== null && v !== undefined) {
            data[k] = v;
          }
          // Extract L{n}_Status, L{n}_Email, etc. for layer history display
          // Only create entries for non-null values to avoid phantom layers from SP columns that exist but are empty
          const layerMatch = k.match(/^L(\d+)_(Status|Email|SignedAt|Rejection|Signature)$/);
          if (layerMatch && v) {
            const ln = parseInt(layerMatch[1], 10);
            const suffix = layerMatch[2].toLowerCase() as "status" | "email" | "signedat" | "rejection" | "signature";
            if (!layerHistory[ln]) layerHistory[ln] = { status: "" };
            if (suffix === "status") layerHistory[ln].status = v as string;
            else if (suffix === "email") layerHistory[ln].email = v as string;
            else if (suffix === "signedat") layerHistory[ln].signedAt = v as string;
            else if (suffix === "rejection") layerHistory[ln].rejection = v as string;
            else if (suffix === "signature") layerHistory[ln].signature = v as string;
          }
        }
        setResponseData(surveyContentForPreview ? normalizeResponseDataForSurvey(surveyContentForPreview, data) : data);
        setCompletedLayers(layerHistory);

        // ── Correct stale FormStatus for old items ────────────────────
        // Before the evaluation-persistence fix, handleEvaluationSubmit never updated
        // FormStatus on SP. Detect this case and correct it.
        const rawFormStatus = (item.FormStatus || item.Status || "") as string;
        if (rawFormStatus === "In Review" || rawFormStatus === "Submitted" || !rawFormStatus) {
          const formLc = formLayerConfigsRef.current[item.Title];
          if (formLc) {
            let activeLayers = formLc.layers || [];
            if (formLc.manualBranches?.length && item.SelectedBranch) {
              const branch = formLc.manualBranches.find(b => b.name === item.SelectedBranch);
              if (branch) activeLayers = branch.layers;
            }
            const totalLayers = activeLayers.length;
            if (totalLayers > 0) {
              const allDone = Array.from({ length: totalLayers }, (_, i) => i + 1)
                .every(n => {
                  const s = layerHistory[n]?.status || "";
                  return ["Confirmed", "Approved", "Rejected", "Cancelled", "Skipped"].includes(s);
                });
              if (allDone) {
                const hasReject = Array.from({ length: totalLayers }, (_, i) => i + 1)
                  .some(n => (layerHistory[n]?.status || "").toLowerCase().includes("reject"));
                const correctedStatus = hasReject ? "Rejected" : "Completed";
                // Patch SP to fix the stale status
                try {
                  await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(item.Title)}')/items(${item.Id})`, {
                    Status: correctedStatus,
                    FormStatus: correctedStatus,
                  });
                  } catch {
                    /* Patch failure is non-critical */
                  }
                // Update local state
                setPendingItems((prev) => prev.map(i =>
                  i.Id === item.Id ? { ...i, FormStatus: correctedStatus, Status: correctedStatus } : i
                ));
                // Replace selectedItem ref so the detail panel reflects the fix immediately
                setSelectedItem((prev) =>
                  prev?.Id === item.Id ? { ...prev, FormStatus: correctedStatus, Status: correctedStatus } as PendingItem : prev
                );
              }
            }
          }
        }

        if (pendingBranch) {
          setCurrentLayerType(null);
          setEvalSurveyModel(null);
          return;
        }

        // Determine current layer type (approval vs evaluation)
        // Determine current layer number
        const currLayerNum = Math.max(item.CurrentLayer || 0, item.CurrentApprovalLayer || 0) || 1;

        // Determine layer type from globally computed itemCurrentTypes (version-aware + branch-aware)
        const detectedType = itemCurrentTypes[getPendingItemKey(item)];
        if (detectedType === "evaluation") {
          setCurrentLayerType("evaluation");
          // Load evaluation form elements by targeting current layer in all available config sources
          const evalElements = ((): Record<string, unknown>[] => {
            // Collect all layer config sources (deduplicated)
            const allConfs: ({ layers?: LayerConfigItem[]; manualBranches?: ManualBranch[] } | null)[] = [];
            // Priority: version-specific > Master Form (direct fetch) > pre-loaded ref
            if (versionLayerCfg) allConfs.push(versionLayerCfg);
            if (versionParsed?.layerConfig) {
              const vl = versionParsed.layerConfig as { layers?: LayerConfigItem[]; manualBranches?: ManualBranch[] };
              if (!allConfs.some(c => c === vl)) allConfs.push(vl);
            }
            if (cfg?.LayerConfig) {
              try { allConfs.push(JSON.parse(cfg.LayerConfig) as { layers?: LayerConfigItem[]; manualBranches?: ManualBranch[] }); } catch {
                /* Invalid JSON — skip */
              }
            }
            const refCfg = formLayerConfigsRef.current[item.Title];
            if (refCfg && !allConfs.some(c => c === refCfg)) allConfs.push(refCfg);
            // If branching, use branch layers instead of main layers
            const findBranchLayers = (src: { layers?: LayerConfigItem[]; manualBranches?: ManualBranch[] }): LayerConfigItem[] => {
              if (src.manualBranches?.length && item.SelectedBranch) {
                const branch = src.manualBranches.find(b => b.name === item.SelectedBranch);
                if (branch) return branch.layers;
              }
              return src.layers || [];
            };
            for (const conf of allConfs) {
              if (!conf) continue;
              const checkLayers = findBranchLayers(conf);
              const current = checkLayers.find(l => l.layerNumber === currLayerNum);
              if (current?.type === "evaluation") {
                const el = (current as EvaluationLayerConfig).surveyElements;
                if (el?.length) return el;
              }
            }
            return [];
          })();
          if (evalElements.length > 0) {
            const evalJson = { pages: [{ name: "evaluation", elements: evalElements }], showNavigationButtons: false };
            const m = new Model(evalJson as object);
            m.applyTheme(FlatLightPanelless);
            const checkValid = () => { setEvalValid(!m.hasErrors()); };
            m.onValueChanged.add(checkValid);
            setTimeout(checkValid, 0);
            setEvalSurveyModel((prev) => { prev?.dispose(); return m; });
          } else {
            setEvalSurveyModel(null);
            setEvalValid(false);
          }
        } else {
          setCurrentLayerType("approval");
          setEvalSurveyModel(null);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token, itemCurrentTypes]);

  // Handle evaluation submit
  const handleEvaluationSubmit = async () => {
    if (!token || !selectedItem || !formConfig) return;
    // Validate required fields before submitting
    if (evalSurveyModel) {
      const valid = evalSurveyModel.validate();
      if (!valid) { setEvalValid(false); return; }
    }

    setActionLoading(true);
    try {
      const listName = selectedItem.Title;
      const respId = selectedItem.Id;
      const currLayerNum = Math.max(selectedItem.CurrentLayer || 0, selectedItem.CurrentApprovalLayer || 0) || 1;
      const now = new Date().toISOString();

      // Compute total layers from config (same pattern as handleApprove)
      let branchLayers: LayerConfigItem[] | null = null;
      if (formConfig.LayerConfig) {
        try { const lc = JSON.parse(formConfig.LayerConfig); branchLayers = getActiveLayers(lc, selectedItem.SelectedBranch); } catch {
          /* Invalid JSON — keep null */
        }
      }
      const totalLayers = branchLayers?.length || formConfig.NumberOfApprovalLayer || 0;
      const isFinal = currLayerNum >= totalLayers;

      const fields = evalSurveyModel ? evalSurveyModel.data as Record<string, unknown> : {};

      await submitEvaluationData(token, listName, respId, currLayerNum, {
        confirmerEmail: accounts[0]?.username || "SYSTEM",
        confirmerName: accounts[0]?.name,
        fields,
      });

      await updateLayerStatus(token, listName, respId, currLayerNum, {
        status: SP_LAYER_STATUS.CONFIRMED,
        signedAt: now,
      });

      // Patch FormStatus, CurrentLayer, Status to SP so the change persists on refresh
      const nextLayerNum = currLayerNum + 1;
      const evalPatch: Record<string, unknown> = {
        Status: isFinal ? "Completed" : "In Review",
        FormStatus: isFinal ? "Completed" : "In Review",
        CurrentLayer: isFinal ? currLayerNum : nextLayerNum,
        CurrentApprovalLayer: isFinal ? currLayerNum : nextLayerNum,
      };
      await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${respId})`, evalPatch);

      let nextApproverEmail = "";
      const nextLayerConfig = !isFinal && branchLayers
        ? branchLayers.find(l => l.layerNumber === nextLayerNum)
        : undefined;
      if (nextLayerConfig) {
        try {
          const itemEmail = await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${respId})?$select=L${nextLayerNum}_Email`
          ) as Record<string, unknown>;
          nextApproverEmail = valueToText(itemEmail[`L${nextLayerNum}_Email`]);
        } catch {
          nextApproverEmail = "";
        }
        if (!nextApproverEmail) {
          const submittedData = responseData ?? (await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${respId})`
          ) as Record<string, unknown>);
          const result = await resolveLayerAssigneeEmail(token, nextLayerConfig, submittedData);
          if (result.error) throw new Error(result.error);
          nextApproverEmail = result.email;
          if (nextApproverEmail) {
            await spPatch(
              token,
              `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${respId})`,
              { [`L${nextLayerNum}_Email`]: nextApproverEmail },
            );
          }
        }
        if (nextLayerConfig.authMode === "365" && !EMAIL_RE.test(nextApproverEmail)) {
          throw new Error(`Layer ${nextLayerNum} has no valid assignee email. Fix the workflow before advancing.`);
        }
      }

      let pdfUrl: string | undefined;
      if (isFinal) {
        try {
          const pdfData = await loadPdfData(selectedItem, token);
          if (pdfData) {
            pdfData.meta.formStatus = "completed";
            const { generateAndStorePdf } = await import("../../utils/generateFormPdf");
            pdfUrl = await generateAndStorePdf(token, selectedItem.Title, selectedItem.Id, pdfData);
          }
        } catch {
          // Keep the workflow moving even if PDF generation is unavailable.
        }
      }

      await triggerApprovalNotification(token, {
        formTitle: selectedItem.Title,
        submittedBy: selectedItem.SubmittedBy,
        responseItemId: selectedItem.Id,
        layer: currLayerNum,
        totalLayers,
        action: "approve",
        nextApproverEmail,
        pdfUrl,
      });

      // Update local state — advance CurrentLayer so item type re-computes correctly
      setPendingItems((prev) => prev.map((i) =>
        i.Id === selectedItem.Id
          ? { ...i, Status: isFinal ? "Completed" : "In Review", FormStatus: isFinal ? "Completed" : "In Review",
              CurrentLayer: isFinal ? currLayerNum : nextLayerNum, PdfUrl: pdfUrl || i.PdfUrl }
          : i
      ));

      // If advancing to a new layer with a different type, update itemCurrentTypes
      if (nextLayerConfig) {
        setItemCurrentTypes((prev) => ({ ...prev, [getPendingItemKey(selectedItem)]: nextLayerConfig.type }));
      }

      setActionSuccess({
        type: "confirmed",
        message: "Evaluation submitted successfully!" + (isFinal ? " Form completed." : ""),
        pdfUrl,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle branch selection
  const handleSelectBranch = async (branchName: string) => {
    if (!token || !selectedItem || !formConfig) return;
    setBranchLoading(true);
    try {
      const listName = selectedItem.Title;
      const respId = selectedItem.Id;
      const patchUrl = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${respId})`;

      let bLayers: LayerConfigItem[] = [];
      if (formConfig.LayerConfig) {
        try {
          const lc = JSON.parse(formConfig.LayerConfig);
          const branch = (lc.manualBranches as ManualBranch[] | undefined)?.find((b) => b.name === branchName);
          bLayers = branch?.layers ?? lc.layers ?? [];
        } catch { /* keep empty */ }
      }
      if (bLayers.length === 0) {
        throw new Error("Selected branch has no approval or evaluation layers.");
      }

      const submittedData = responseData ?? (await spGet(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${respId})`
      ) as Record<string, unknown>);
      const resolvedEmails: Record<number, string> = {};
      const assigneeErrors: string[] = [];
      for (let n = 1; n <= bLayers.length; n++) {
        const result = await resolveLayerAssigneeEmail(token, bLayers[n - 1], submittedData);
        if (result.error) assigneeErrors.push(result.error);
        if (result.email) resolvedEmails[n] = result.email;
      }
      if (assigneeErrors.length > 0) {
        throw new Error(`Cannot start branch: ${assigneeErrors.join(" ")}`);
      }

      const patchBody: Record<string, unknown> = {
        SelectedBranch: branchName,
        FormStatus: SP_FORM_STATUS.IN_REVIEW,
        Status: SP_FORM_STATUS.IN_REVIEW,
        CurrentLayer: 1,
        CurrentApprovalLayer: 1,
      };
      for (let n = 1; n <= bLayers.length; n++) {
        patchBody[`L${n}_Status`] = SP_LAYER_STATUS.PENDING;
        if (resolvedEmails[n]) {
          patchBody[`L${n}_Email`] = resolvedEmails[n];
        }
      }

      await ensureWorkflowColumns(token, listName, bLayers.length);
      // SharePoint needs a moment after adding columns before they can be written
      await new Promise((r) => setTimeout(r, 1500));
      await spPatch(token, patchUrl, patchBody);

      const firstApproverEmail = resolvedEmails[1] || "";
      if (firstApproverEmail) {
        await triggerApprovalNotification(token, {
          formTitle: selectedItem.Title,
          submittedBy: selectedItem.SubmittedBy,
          responseItemId: selectedItem.Id,
          layer: 1,
          totalLayers: bLayers.length,
          action: "submit",
          nextApproverEmail: firstApproverEmail,
          reviewLink: `${window.location.origin}/admin/approvals?form=${encodeURIComponent(listName)}&item=${respId}`,
        });
      }

      const updatedItem: PendingItem = {
        ...selectedItem,
        SelectedBranch: branchName,
        FormStatus: SP_FORM_STATUS.IN_REVIEW,
        Status: SP_FORM_STATUS.IN_REVIEW,
        CurrentLayer: 1,
        CurrentApprovalLayer: 1,
        L1_Status: SP_LAYER_STATUS.PENDING,
      };
      setPendingItems((prev) => prev.map((i) => i.Id === selectedItem.Id ? updatedItem : i));
      await loadItemDetails(updatedItem);
    } catch (e) { setError((e as Error).message); }
    finally { setBranchLoading(false); }
  };

  const handleDeleteSubmission = async () => {
    if (!token || !deleteTarget) return;

    setDeleteLoading(true);
    setError("");
    try {
      const rawItem = await spGet(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(deleteTarget.Title)}')/items(${deleteTarget.Id})`
      ) as Record<string, unknown>;

      const submissionData: Record<string, unknown> = {};
      const layerNumbers = new Set<number>();
      for (const [key, value] of Object.entries(rawItem)) {
        if (!SYSTEM_FIELDS.has(key) && value !== null && value !== undefined) {
          submissionData[key] = value;
        }
        const layerMatch = key.match(/^L(\d+)_(Status|Email|SignedAt|Rejection|Signature)$/);
        if (layerMatch) layerNumbers.add(parseInt(layerMatch[1], 10));
      }
      const totalLayers = deleteTarget.totalLayers || Math.max(deleteTarget.CurrentLayer || 0, deleteTarget.CurrentApprovalLayer || 0, layerNumbers.size);
      for (let n = 1; n <= totalLayers; n++) layerNumbers.add(n);

      const layers: Submission["layers"] = Array.from(layerNumbers)
        .sort((a, b) => a - b)
        .map((layerNumber) => ({
          status: valueToText(rawItem[`L${layerNumber}_Status`]),
          outcome: undefined,
          email: valueToText(rawItem[`L${layerNumber}_Email`]) || null,
          signedAt: valueToText(rawItem[`L${layerNumber}_SignedAt`]) || null,
          rejectionReason: valueToText(rawItem[`L${layerNumber}_Rejection`]) || null,
          signature: valueToText(rawItem[`L${layerNumber}_Signature`]) || null,
        }));

      const client = createSpClient(instance, accounts);
      const result = await client.hardDeleteSubmission({
        id: String(deleteTarget.Id),
        submissionId: String(deleteTarget.Id),
        listTitle: deleteTarget.Title,
        formId: valueToText(rawItem.FormID),
        formVersion: deleteTarget.FormVersion || valueToText(rawItem.FormVersion),
        title: deleteTarget.Title,
        submittedByEmail: deleteTarget.SubmittedBy || valueToText(rawItem.SubmittedBy),
        submittedAt: deleteTarget.SubmittedAt || valueToText(rawItem.SubmittedAt) || null,
        formStatus: deleteTarget.FormStatus || deleteTarget.Status || valueToText(rawItem.FormStatus) || null,
        totalLayers,
        layers,
        meta: { icon: "", color: "", pale: "", category: "" },
        submissionData,
        currentLayer: deleteTarget.CurrentLayer,
        selectedBranch: deleteTarget.SelectedBranch,
      });

      setPendingItems((prev) => prev.filter((item) => !(item.Id === deleteTarget.Id && item.Title === deleteTarget.Title)));
      setItemCurrentTypes((prev) => {
        const next = { ...prev };
        delete next[getPendingItemKey(deleteTarget)];
        return next;
      });
      if (selectedItem?.Id === deleteTarget.Id && selectedItem.Title === deleteTarget.Title) {
        setSelectedItem(null);
        setSurveyJson(null);
        setResponseData(null);
        setPreviewModel(null);
        setEvalSurveyModel(null);
        setCompletedLayers({});
      }
      setDeleteTarget(null);
      setDeleteConfirmText("");
      if (result.warnings.length > 0) {
        setError(`Submission deleted. Cleanup warnings: ${result.warnings.join(" ")}`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Handle approve
  const handleApprove = async () => {
    if (!token || !selectedItem || !formConfig) return;

    setActionLoading(true);
    try {
      const currentLayer = Math.max(selectedItem.CurrentLayer || 0, selectedItem.CurrentApprovalLayer || 0) || 1;
      let branchLayers: LayerConfigItem[] | null = null;
      if (formConfig.LayerConfig) {
        try { const lc = JSON.parse(formConfig.LayerConfig); branchLayers = getActiveLayers(lc, selectedItem.SelectedBranch); } catch {
          /* Invalid JSON — keep null */
        }
      }
      const totalLayers = branchLayers?.length || formConfig.NumberOfApprovalLayer || 1;
      const listName = selectedItem.Title; // list is named after form title

      // Get next approver email
      let nextApproverEmail = "";
      if (currentLayer < totalLayers) {
        const nextLayerNumber = currentLayer + 1;
        try {
          const itemEmail = await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${selectedItem.Id})?$select=L${nextLayerNumber}_Email`
          ) as Record<string, unknown>;
          nextApproverEmail = valueToText(itemEmail[`L${nextLayerNumber}_Email`]);
        } catch {
          nextApproverEmail = "";
        }
        if (!nextApproverEmail) {
          const approvers = await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('Approvers')/items?$filter=FormTitle eq '${encodeURIComponent(selectedItem.Title)}' and LayerNumber eq ${nextLayerNumber}&$select=ApproverEmail&$top=1`
          ) as { value?: { ApproverEmail: string }[] };
          nextApproverEmail = approvers.value?.[0]?.ApproverEmail || "";
        }
        const nextLayer = branchLayers?.find((layer) => layer.layerNumber === nextLayerNumber);
        if (!nextApproverEmail && nextLayer?.assignee.type === "department-approver") {
          const submittedData = responseData ?? (await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${selectedItem.Id})`
          ) as Record<string, unknown>);
          const result = await resolveLayerAssigneeEmail(token, nextLayer, submittedData);
          if (result.error) throw new Error(result.error);
          nextApproverEmail = result.email;
          if (nextApproverEmail) {
            await spPatch(
              token,
              `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${selectedItem.Id})`,
              { [`L${nextLayerNumber}_Email`]: nextApproverEmail },
            );
          }
        }
        if (nextLayer?.authMode === "365" && !EMAIL_RE.test(nextApproverEmail)) {
          throw new Error(`Layer ${nextLayerNumber} has no valid assignee email. Fix the workflow before advancing.`);
        }
      }

      // Update status (legacy + enhanced columns)
      const isFinal = currentLayer >= totalLayers;
      const newStatus = isFinal ? "Approved" : `Approved Layer ${currentLayer}`;
      const patchBody: Record<string, unknown> = {
        Status: newStatus,
        CurrentApprovalLayer: isFinal ? currentLayer : currentLayer + 1,
        CurrentLayer: isFinal ? currentLayer : currentLayer + 1, // Keep in sync
        FormStatus: isFinal ? "Completed" : "In Review",
      };
      // Also update enhanced L{n}_Status so the PDF reflects the correct status
      patchBody[`L${currentLayer}_Status`] = SP_LAYER_STATUS.APPROVED;
      patchBody[`L${currentLayer}_SignedAt`] = new Date().toISOString();
      await spPatch(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${selectedItem.Id})`,
        patchBody,
      );

      // For terminal states, generate PDF first so we can include the link in the email
      let pdfUrl: string | undefined;
      if (currentLayer >= totalLayers) {
        try {
          const pdfData = await loadPdfData(selectedItem, token);
          if (pdfData) {
            pdfData.meta.formStatus = "completed";
            const { generateAndStorePdf } = await import("../../utils/generateFormPdf");
            pdfUrl = await generateAndStorePdf(token, selectedItem.Title, selectedItem.Id, pdfData);
          }
        } catch {
          // Keep the workflow moving even if PDF generation is unavailable.
        }
      }

      // Send notification (with PDF link for terminal states)
      await triggerApprovalNotification(token, {
        formTitle: selectedItem.Title,
        submittedBy: selectedItem.SubmittedBy,
        responseItemId: selectedItem.Id,
        layer: currentLayer,
        totalLayers,
        action: "approve",
        nextApproverEmail,
        pdfUrl,
      });

      // Update local list (keep item with new status instead of removing)
      const itemFormStatus = isFinal ? "Completed" : "In Review";
      setPendingItems((prev) => prev.map((i) =>
        i.Id === selectedItem.Id
          ? { ...i, Status: newStatus, FormStatus: itemFormStatus, CurrentLayer: isFinal ? currentLayer : currentLayer + 1, CurrentApprovalLayer: isFinal ? currentLayer : currentLayer + 1, L1_Status: i.L1_Status || SP_LAYER_STATUS.APPROVED, PdfUrl: pdfUrl || i.PdfUrl }
          : i
      ));
      setSelectedItem(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle reject
  const handleReject = async (reason: string) => {
    if (!token || !selectedItem || !formConfig) return;

    setActionLoading(true);
    try {
      const listName = selectedItem.Title; // list is named after form title

      const currentLayer = selectedItem.CurrentApprovalLayer || selectedItem.CurrentLayer || 1;
      let branchLayers: LayerConfigItem[] | null = null;
      if (formConfig.LayerConfig) {
        try { const lc = JSON.parse(formConfig.LayerConfig); branchLayers = getActiveLayers(lc, selectedItem.SelectedBranch); } catch {
          /* Invalid JSON — keep null */
        }
      }
      const totalLayers = branchLayers?.length || formConfig.NumberOfApprovalLayer || selectedItem.totalLayers || currentLayer;
      await spPatch(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${selectedItem.Id})`,
        buildRejectedWorkflowPatch(currentLayer, totalLayers, new Date().toISOString(), reason),
      );

      // Generate PDF after writing all terminal layer statuses so the chain is accurate.
      let pdfUrl: string | undefined;
      try {
        const pdfData = await loadPdfData(selectedItem, token);
        if (pdfData) {
          pdfData.meta.formStatus = "rejected";
          const { generateAndStorePdf } = await import("../../utils/generateFormPdf");
          pdfUrl = await generateAndStorePdf(token, selectedItem.Title, selectedItem.Id, pdfData);
        }
      } catch {
        // Keep the workflow moving even if PDF generation is unavailable.
      }

      await triggerApprovalNotification(token, {
        formTitle: selectedItem.Title,
        submittedBy: selectedItem.SubmittedBy,
        responseItemId: selectedItem.Id,
        layer: currentLayer,
        totalLayers,
        action: "reject",
        pdfUrl,
      });

      // Update local list (keep item with new status)
      setPendingItems((prev) => prev.map((i) =>
        i.Id === selectedItem.Id
          ? { ...i, Status: "Rejected", FormStatus: "Rejected", CurrentLayer: currentLayer, CurrentApprovalLayer: currentLayer, PdfUrl: pdfUrl || i.PdfUrl }
          : i
      ));
      setSelectedItem(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  // Build preview model when survey JSON + response data are available
  useEffect(() => {
    if (!surveyJson) {
      setPreviewModel(null);
      return;
    }
    try {
      const m = new Model(surveyJson as object);
      m.applyTheme(FlatLightPanelless);
      m.mode = "display";
      if (responseData) {
        m.data = responseData;
      }
      setPreviewModel((prev) => { prev?.dispose(); return m; });
      return () => { m.dispose(); };
    } catch {
      setPreviewModel(null);
    }
  }, [surveyJson, responseData]);

  const selectedCompany = getSelectedCompany(responseData, surveyJson);

  if (loading || !adminChecked) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: C.textMuted }}>Loading approvals...</div>
      </div>
    );
  }

  if (adminChecked && !isAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: C.cardBg, borderRadius: 16, padding: 40, textAlign: "center", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 32, marginBottom: 16, display: 'flex', justifyContent: 'center' }}><BlockIcon style={{ fontSize: 40 }} /></div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.red, marginBottom: 8 }}>Access Denied</div>
          <div style={{ color: C.textSecond }}>You need HR Form Owner permissions to view this page.</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: C.cardBg, borderRadius: 16, padding: 40, textAlign: "center", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 32, marginBottom: 16, display: 'flex', justifyContent: 'center' }}><LockIcon style={{ fontSize: 40 }} /></div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.textPrimary, marginBottom: 8 }}>Sign in required</div>
          <div style={{ color: C.textSecond }}>You must be signed in to view approvals.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Auth banner — topmost */}
        <div style={{ background: C.greenPale, border: `1px solid ${C.greenBorder}`, borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg,${C.green},#34D399)`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
            {((accounts[0]?.username?.[0] || "?").toUpperCase())}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.green }}>Signed in</div>
            <div style={{ fontSize: 11, color: C.textSecond }}>{accounts[0]?.username || "—"}</div>
          </div>
          <button onClick={() => { clearStoredAuthDecision(); instance.logoutRedirect({ postLogoutRedirectUri: window.location.href }); }}
            style={{ fontSize: 11, color: C.textSecond, background: "none", border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 11px", cursor: "pointer" }}>
            Sign out
          </button>
        </div>

        <header style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.textPrimary, margin: 0 }}>Approvals</h1>
          <p style={{ color: C.textSecond, marginTop: 4 }}>Review and manage all form submissions</p>
        </header>

        {error && (
          <div style={{ background: C.redPale, border: "1px solid #FCA5A5", borderRadius: 8, padding: 12, color: C.red, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Category tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {(["approvals", "evaluations"] as const).map((mode) => {
            const modeCount = baseFilteredItems.filter(i =>
              mode === "evaluations" ? itemCurrentTypes[getPendingItemKey(i)] === "evaluation" : itemCurrentTypes[getPendingItemKey(i)] !== "evaluation"
            ).length;
            return (
              <button
                key={mode}
                onClick={() => { setViewMode(mode); setStatusFilter("pending"); }}
                style={{
                  padding: "6px 16px", borderRadius: 20, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: 600,
                  background: viewMode === mode ? C.purple : "#fff",
                  color: viewMode === mode ? "#fff" : C.textSecond,
                  boxShadow: viewMode === mode ? "none" : "0 1px 2px rgba(0,0,0,0.06)",
                }}
              >
                {mode === "approvals" ? "Approvals" : "Evaluations"} ({modeCount})
              </button>
            );
          })}
        </div>

        {/* Status tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(viewMode === "evaluations"
            ? (["pending", "evaluated"] as const)
            : (["pending", "approved", "rejected"] as const)
          ).map((tab) => {
            const count = categoryItems.filter((item) => {
              if (tab === "pending") return getItemStatus(item) === "pending";
              if (tab === "approved") return getItemStatus(item) === "approved";
              if (tab === "rejected") return getItemStatus(item) === "rejected";
              return getItemStatus(item) !== "pending";
            }).length;
            return (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                style={{
                  padding: "6px 16px", borderRadius: 20, border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 600,
                  background: statusFilter === tab ? C.purple : "#fff",
                  color: statusFilter === tab ? "#fff" : C.textSecond,
                  boxShadow: statusFilter === tab ? "none" : "0 1px 2px rgba(0,0,0,0.06)",
                }}
              >
                {tab === "evaluated" ? "Evaluated" : tab.charAt(0).toUpperCase() + tab.slice(1)} ({count})
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Filter by form title..."
            value={titleFilter}
            onChange={e => setTitleFilter(e.target.value)}
            style={{
              flex: "1 1 180px", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
              fontSize: 13, color: C.textPrimary, outline: "none", minWidth: 0,
            }}
          />
          <input
            type="text"
            placeholder="Filter by submitter email..."
            value={submitterFilter}
            onChange={e => setSubmitterFilter(e.target.value)}
            style={{
              flex: "1 1 180px", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
              fontSize: 13, color: C.textPrimary, outline: "none", minWidth: 0,
            }}
          />
          <div style={{ display: "flex", gap: 6, alignItems: "center", flex: "0 0 auto" }}>
            <span style={{ fontSize: 12, color: C.textMuted }}>From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{
                padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
                fontSize: 12, color: C.textPrimary, outline: "none",
              }}
            />
            <span style={{ fontSize: 12, color: C.textMuted }}>To</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{
                padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
                fontSize: 12, color: C.textPrimary, outline: "none",
              }}
            />
          </div>
          {(titleFilter || submitterFilter || dateFrom || dateTo) && (
            <button
              onClick={() => { setTitleFilter(""); setSubmitterFilter(""); setDateFrom(""); setDateTo(""); }}
              style={{
                padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
                background: "transparent", color: C.textMuted, fontSize: 12, cursor: "pointer",
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Reject Reason Dialog */}
        {showRejectDialog && (
          <div
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onClick={() => setShowRejectDialog(false)}
          >
            <div
              style={{
                background: C.cardBg, borderRadius: 14, padding: 24, width: 420, maxWidth: "90vw",
                boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontSize: 17, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>Reject Submission</div>
              <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 16 }}>
                Provide a reason for rejecting this submission.
              </div>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="Enter rejection reason..."
                rows={4}
                autoFocus
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
                  fontSize: 13, color: C.textPrimary, resize: "vertical", outline: "none",
                  fontFamily: "inherit", boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
                <button
                  onClick={() => { setShowRejectDialog(false); setRejectionReason(""); }}
                  style={{
                    padding: "9px 18px", borderRadius: 8, border: `1px solid ${C.border}`,
                    background: "#fff", color: C.textSecond, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleReject(rejectionReason);
                    setShowRejectDialog(false);
                    setRejectionReason("");
                  }}
                  disabled={!rejectionReason.trim() || actionLoading}
                  style={{
                    padding: "9px 18px", borderRadius: 8, border: "none",
                    background: rejectionReason.trim() && !actionLoading ? C.red : C.border,
                    color: rejectionReason.trim() && !actionLoading ? "#fff" : C.textMuted,
                    fontSize: 13, fontWeight: 600, cursor: rejectionReason.trim() && !actionLoading ? "pointer" : "not-allowed",
                  }}
                >
                  Confirm Reject
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.42)", zIndex: 1000,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onClick={() => { if (!deleteLoading) { setDeleteTarget(null); setDeleteConfirmText(""); } }}
          >
            <div
              style={{
                background: C.cardBg, borderRadius: 14, padding: 24, width: 460, maxWidth: "90vw",
                boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.redPale, color: C.red, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <DeleteIcon style={{ fontSize: 18 }} />
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: C.textPrimary }}>Delete Submission Permanently</div>
                  <div style={{ fontSize: 12, color: C.textSecond }}>This removes the submission item and related managed files where possible.</div>
                </div>
              </div>
              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, margin: "14px 0", fontSize: 12, color: C.textSecond }}>
                <div style={{ fontWeight: 700, color: C.textPrimary }}>{deleteTarget.Title}</div>
                <div>Submitted by {deleteTarget.SubmittedBy || "Unknown"} on {formatDateTime(deleteTarget.SubmittedAt)}</div>
                <div>Item ID: {deleteTarget.Id}</div>
              </div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.textPrimary, marginBottom: 6 }}>
                Type DELETE to confirm
              </label>
              <input
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                disabled={deleteLoading}
                autoFocus
                style={{
                  width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8,
                  border: `1px solid ${C.border}`, fontSize: 13, color: C.textPrimary, outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
                <button
                  onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}
                  disabled={deleteLoading}
                  style={{
                    padding: "9px 18px", borderRadius: 8, border: `1px solid ${C.border}`,
                    background: "#fff", color: C.textSecond, fontSize: 13, fontWeight: 600,
                    cursor: deleteLoading ? "not-allowed" : "pointer", opacity: deleteLoading ? 0.6 : 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteSubmission}
                  disabled={deleteConfirmText !== "DELETE" || deleteLoading}
                  style={{
                    padding: "9px 18px", borderRadius: 8, border: "none",
                    background: deleteConfirmText === "DELETE" && !deleteLoading ? C.red : C.border,
                    color: deleteConfirmText === "DELETE" && !deleteLoading ? "#fff" : C.textMuted,
                    fontSize: 13, fontWeight: 600,
                    cursor: deleteConfirmText === "DELETE" && !deleteLoading ? "pointer" : "not-allowed",
                  }}
                >
                  {deleteLoading ? "Deleting..." : "Delete permanently"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Items + Detail Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Items List */}
          <div style={{ background: C.cardBg, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: 16, borderBottom: `1px solid ${C.border}`, background: C.purplePale, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontWeight: 600, color: C.purple }}>
                {viewMode === "approvals" ? "Approval" : "Evaluation"} {statusFilter === "evaluated" ? "Evaluated" : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} ({filteredItems.length})
              </span>
              <span style={{ fontSize: 11, color: C.textSecond }}>
                Newest first
              </span>
            </div>
            <div style={{ maxHeight: 600, overflow: "auto" }}>
              {filteredItems.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: C.textMuted }}>No submissions</div>
              ) : (
                pagedItems.map((item) => (
                  <div
                    key={getPendingItemKey(item)}
                    onClick={() => loadItemDetails(item)}
                    style={{
                      padding: 16,
                      borderBottom: `1px solid ${C.border}`,
                      cursor: "pointer",
                      background: selectedItem?.Id === item.Id && selectedItem.Title === item.Title ? C.purplePale : "transparent",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: C.textPrimary, marginBottom: 4 }}>{item.Title}</div>
                        <div style={{ fontSize: 13, color: C.textSecond }}>
                          By {item.SubmittedBy} • {formatDateTime(item.SubmittedAt)}
                        </div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                          v{item.FormVersion || "Legacy"}
                        </div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
                          {formatLayerProgress(item)}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {item.PdfUrl && (
                          <a
                            href={item.PdfUrl.startsWith("http") ? item.PdfUrl : `${new URL(SP_SITE_URL).origin}${item.PdfUrl}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 8,
                              background: C.purplePale, color: C.purple, textDecoration: "none",
                            }}
                          >
                            PDF
                          </a>
                        )}
                        <span
                          style={{
                            fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
                            background: getItemStatus(item) === "approved" ? C.greenPale
                              : getItemStatus(item) === "rejected" ? C.redPale : C.amberPale,
                            color: getItemStatus(item) === "approved" ? "#065F46"
                              : getItemStatus(item) === "rejected" ? "#991B1B" : "#92400E",
                          }}
                        >
                          {getItemDisplayStatus(item)}
                        </span>
                        <button
                          title="Delete submission permanently"
                          aria-label={`Delete ${item.Title} submission ${item.Id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(item);
                            setDeleteConfirmText("");
                          }}
                          disabled={deleteLoading}
                          style={{
                            width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.redPale}`,
                            background: "#fff", color: C.red, display: "inline-flex", alignItems: "center", justifyContent: "center",
                            cursor: deleteLoading ? "not-allowed" : "pointer", opacity: deleteLoading ? 0.55 : 1,
                          }}
                        >
                          <DeleteIcon style={{ fontSize: 15 }} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {filteredItems.length > SUBMISSIONS_PER_PAGE && (
              <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 12, color: C.textSecond }}>
                  Showing {(listPage - 1) * SUBMISSIONS_PER_PAGE + 1}-{Math.min(listPage * SUBMISSIONS_PER_PAGE, filteredItems.length)} of {filteredItems.length}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={() => setListPage((page) => Math.max(1, page - 1))}
                    disabled={listPage <= 1}
                    style={{
                      padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
                      background: "#fff", color: listPage <= 1 ? C.textMuted : C.textSecond,
                      fontSize: 12, fontWeight: 600, cursor: listPage <= 1 ? "not-allowed" : "pointer",
                    }}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: 12, color: C.textSecond }}>Page {listPage} of {totalListPages}</span>
                  <button
                    onClick={() => setListPage((page) => Math.min(totalListPages, page + 1))}
                    disabled={listPage >= totalListPages}
                    style={{
                      padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
                      background: "#fff", color: listPage >= totalListPages ? C.textMuted : C.textSecond,
                      fontSize: 12, fontWeight: 600, cursor: listPage >= totalListPages ? "not-allowed" : "pointer",
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Detail Panel */}
          <div style={{ background: C.cardBg, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {!selectedItem ? (
              <div style={{ padding: 48, textAlign: "center", color: C.textMuted }}>Select an item to review</div>
            ) : (
              <>
                <div style={{ padding: 16, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontWeight: 600, color: C.textPrimary }}>{selectedItem.Title}</div>
                  <div style={{ fontSize: 13, color: C.textSecond, marginTop: 4 }}>
                    Submitted by {selectedItem.SubmittedBy} • {formatDateTime(selectedItem.SubmittedAt)}
                  </div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                    Form Version: {selectedItem.FormVersion || "Legacy"}
                  </div>
                  {selectedCompany && (
                    <div style={{ fontSize: 12, color: C.purple, marginTop: 2, fontWeight: 600 }}>
                      Company: {selectedCompany}
                    </div>
                  )}
                  {selectedItem.SelectedBranch && (
                    <div style={{ fontSize: 12, color: C.purple, marginTop: 2, fontWeight: 500 }}>
                      Branch: {(() => { try {
                        const lc = formConfig?.LayerConfig ? JSON.parse(formConfig.LayerConfig) : null;
                        const branch = lc?.manualBranches?.find((b: ManualBranch) => b.name === selectedItem.SelectedBranch);
                        return branch?.label || selectedItem.SelectedBranch;
                      } catch { return selectedItem.SelectedBranch; }})()}
                    </div>
                  )}
                </div>

                {needsBranchSelection && getItemStatus(selectedItem) === "pending" ? (
                  <>
                    <div style={{ padding: 16, maxHeight: 400, overflow: "auto" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginBottom: 12 }}>
                        Submitted Form Details
                      </div>
                      {previewModel ? (
                        <div className="approval-survey-preview">
                          <Survey model={previewModel} />
                        </div>
                      ) : (
                        <div style={{ color: C.textMuted }}>Loading form preview...</div>
                      )}
                    </div>
                    <div style={{ padding: 24, textAlign: "center", borderTop: `1px solid ${C.border}` }}>
                      <div style={{ width: 56, height: 56, borderRadius: "50%", background: C.purplePale, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24 }}>⑂</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>Select Branch</div>
                      <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 20, maxWidth: 360, margin: "0 auto 20px" }}>
                        Review the submitted form details, then assign the branch that should handle this approval/evaluation flow.
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 260, margin: "0 auto" }}>
                        {availableBranches.map((branch) => (
                          <button key={branch.name} onClick={() => handleSelectBranch(branch.name)} disabled={branchLoading}
                            style={{ padding: "12px 16px", borderRadius: 10, border: `1.5px solid ${C.purpleMid}`, background: C.cardBg, cursor: branchLoading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, color: C.purple, fontFamily: "inherit", opacity: branchLoading ? 0.6 : 1 }}
                            onMouseEnter={e => { if (!branchLoading) { e.currentTarget.style.borderColor = C.purple; e.currentTarget.style.background = C.purplePale; }}}
                            onMouseLeave={e => { if (!branchLoading) { e.currentTarget.style.borderColor = C.purpleMid; e.currentTarget.style.background = C.cardBg; }}}>
                            {branch.label || branch.name}
                          </button>
                        ))}
                      </div>
                      {branchLoading && <div style={{ marginTop: 12, fontSize: 11, color: C.textMuted }}>Saving branch selection...</div>}
                    </div>
                  </>
                ) : (
                  <>
                <div style={{ padding: 16, maxHeight: 400, overflow: "auto" }}>
                  {previewModel ? (
                    <div className="approval-survey-preview">
                      <Survey model={previewModel} />
                    </div>
                  ) : (
                    <div style={{ color: C.textMuted }}>Loading form preview...</div>
                  )}
                </div>

                {/* Layer History: show completed layers for context */}
                {Object.keys(completedLayers).length > 0 && (
                  <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginBottom: 8 }}>Layer History</div>
                    {Object.entries(completedLayers)
                      .sort(([a], [b]) => parseInt(a) - parseInt(b))
                      .map(([layerNum, layer]) => {
                        const isRejected = layer.status?.toLowerCase().includes("reject");
                        const isApproved = layer.status?.toLowerCase().includes("approv") || layer.status?.toLowerCase().includes("confirm");
                        return (
                          <div key={layerNum} style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", marginBottom: 4,
                            borderRadius: 8, fontSize: 12,
                            background: isRejected ? C.redPale : isApproved ? C.greenPale : "transparent",
                          }}>
                            <span style={{
                              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                              background: isRejected ? C.red : isApproved ? C.green : C.textMuted,
                            }} />
                            <span style={{ fontWeight: 600, color: C.textPrimary, minWidth: 16 }}>
                              L{layerNum}
                            </span>
                            <span style={{ color: isRejected ? C.red : isApproved ? "#065F46" : C.textMuted, fontWeight: 500, minWidth: 80 }}>
                              {layer.status || "Pending"}
                            </span>
                            {layer.email && (
                              <span style={{ color: C.textSecond }}>{layer.email}</span>
                            )}
                            {layer.rejection && (
                              <span style={{ color: C.red, marginLeft: 4 }}>— {layer.rejection}</span>
                            )}
                            {layer.signedAt && (
                              <span style={{ color: C.textMuted, marginLeft: "auto" }}>
                                {formatDateTime(layer.signedAt)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* Evaluation Form: editable SurveyJS for evaluation layers */}
                {currentLayerType === "evaluation" && getItemStatus(selectedItem) === "pending" && !isCurrentLayerTerminal(selectedItem, completedLayers) && evalSurveyModel && (
                  <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginBottom: 12 }}>
                      Evaluation Form
                    </div>
                    <div className="approval-survey-preview">
                      <Survey model={evalSurveyModel} />
                    </div>
                  </div>
                )}

                <div style={{ padding: 16, borderTop: `1px solid ${C.border}`, display: "flex", gap: 12 }}>
                  {currentLayerType === "evaluation" && getItemStatus(selectedItem) === "pending" && !isCurrentLayerTerminal(selectedItem, completedLayers) ? (
                    <button onClick={handleEvaluationSubmit} disabled={actionLoading || (!!evalSurveyModel && !evalValid)}
                      style={{ flex: 1, padding: "12px 16px", borderRadius: 8, border: "none",
                        background: (!evalSurveyModel || evalValid) ? C.purple : C.border, color: "#fff", fontWeight: 600,
                        cursor: (actionLoading || (!!evalSurveyModel && !evalValid)) ? "not-allowed" : "pointer", opacity: (actionLoading || (!!evalSurveyModel && !evalValid)) ? 0.6 : 1 }}>
                      {actionLoading ? "Submitting..." : evalSurveyModel && !evalValid ? "Fill required fields" : <><DescriptionIcon style={{ fontSize: 14, marginRight: 4 }} /> Submit Evaluation</>}
                    </button>
                  ) : getItemStatus(selectedItem) === "pending" && !isCurrentLayerTerminal(selectedItem, completedLayers) ? (
                    <>
                      <button onClick={handleApprove} disabled={actionLoading}
                        style={{ flex: 1, padding: "12px 16px", borderRadius: 8, border: "none",
                          background: C.green, color: "#fff", fontWeight: 600,
                          cursor: actionLoading ? "not-allowed" : "pointer", opacity: actionLoading ? 0.6 : 1 }}>
                        ✓ Approve
                      </button>
                      <button onClick={() => setShowRejectDialog(true)} disabled={actionLoading}
                        style={{ flex: 1, padding: "12px 16px", borderRadius: 8,
                          border: `1px solid ${C.red}`, background: "transparent", color: C.red, fontWeight: 600,
                          cursor: actionLoading ? "not-allowed" : "pointer", opacity: actionLoading ? 0.6 : 1 }}>
                        <CloseIcon style={{ fontSize: 14, marginRight: 4 }} /> Reject
                      </button>
                    </>
                  ) : (
                    <div style={{ flex: 1, textAlign: "center", color: C.textMuted, fontSize: 13 }}>
                      {getItemDisplayStatus(selectedItem)} — {selectedItem.PdfUrl ? (
                        <a href={selectedItem.PdfUrl.startsWith("http") ? selectedItem.PdfUrl : `${new URL(SP_SITE_URL).origin}${selectedItem.PdfUrl}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ color: C.purple, fontWeight: 600 }}>View PDF</a>
                      ) : "No PDF available"}
                    </div>
                  )}
                </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Success Animation Overlay ── */}
      {actionSuccess && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(255,255,255,0.92)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: actionSuccess.type === "rejected" ? C.red : C.green, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <span style={{ fontSize: 36, color: "#fff", fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>
              {actionSuccess.type === "rejected" ? <CloseIcon style={{ fontSize: 36 }} /> : <CheckIcon style={{ fontSize: 36 }} />}
            </span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: actionSuccess.type === "rejected" ? C.red : C.green }}>{actionSuccess.message}</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8 }}>{actionSuccess.message}</div>
            {actionSuccess.pdfUrl && (
              <a href={actionSuccess.pdfUrl.startsWith("http") ? actionSuccess.pdfUrl : `${new URL(SP_SITE_URL).origin}${actionSuccess.pdfUrl}`}
                target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 16, padding: "8px 20px", borderRadius: 8, background: C.purple, color: "#fff", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                <DescriptionIcon style={{ fontSize: 14, marginRight: 4 }} /> View PDF
              </a>
            )}
            <div style={{ marginTop: 12 }}>
              <button onClick={() => { setActionSuccess(null); setSelectedItem(null); }}
                style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`, background: "#fff", color: C.textSecond, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                Back to Approvals
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

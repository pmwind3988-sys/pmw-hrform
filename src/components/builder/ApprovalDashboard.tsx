/**
 * ApprovalDashboard.tsx — Admin view for pending form approvals
 * Route: /admin/approvals
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import { FlatLightPanelless } from "survey-core/themes";
import "survey-core/survey-core.min.css";

import { spGet, spPatch, triggerApprovalNotification, getAllFormConfigs, getFormConfigByTitle } from "../../utils/formBuilderSP";
import { SP_LAYER_STATUS } from "../../utils/statusConstants";
import { generateAndStorePdf, buildPdfLayerResults } from "../../utils/generateFormPdf";
import type { PdfFormData } from "../../utils/FormPdfDocument";
const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

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
}

interface FormConfig {
  Title: string;
  NumberOfApprovalLayer?: number;
  FormID?: string;
  LayerConfig?: string;
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

    // Load response data
    const respItem = await spGet(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(item.Title)}')/items(${item.Id})`
    ) as Record<string, unknown>;

    const SYSTEM_FIELDS = new Set([
      'Id','Title','SubmittedBy','SubmittedAt','Status','CurrentApprovalLayer',
      'FormVersion','FormID','RawJSON','CurrentLayer','FormStatus','EvaluationData',
      'Author','Editor','Created','Modified','ContentType','PermMask',
      'L1_Status','L1_Email','L1_SignedAt','L1_Rejection','L1_Signature',
      'L2_Status','L2_Email','L2_SignedAt','L2_Rejection','L2_Signature',
      'L3_Status','L3_Email','L3_SignedAt','L3_Rejection','L3_Signature',
    ]);

    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(respItem)) {
      if (!SYSTEM_FIELDS.has(k) && v !== null && v !== undefined) {
        data[k] = v;
      }
    }

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
      logoUrl: "/logo-128.png",
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
  const [previewModel, setPreviewModel] = useState<Model | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  const filteredItems = useMemo(() => {
    if (statusFilter === "all") return pendingItems;
    return pendingItems.filter(i => getItemStatus(i) === statusFilter);
  }, [pendingItems, statusFilter]);

  // Get token
  useEffect(() => {
    if (inProgress !== InteractionStatus.None) return;
    if (!isAuthenticated) return;

    const origin = new URL(import.meta.env.VITE_SP_SITE_URL || "https://placeholder.sharepoint.com").origin;
    instance
      .acquireTokenSilent({ scopes: [`${origin}/AllSites.Manage`], account: accounts[0] })
      .then((r) => setToken(r.accessToken))
      .catch(() => setError("Failed to acquire token"));
  }, [isAuthenticated, inProgress, instance, accounts]);

  // Load all items (pending, approved, rejected)
  useEffect(() => {
    if (!token) return;

    const loadData = async () => {
      try {
        const forms = await getAllFormConfigs(token);

        const allItems: PendingItem[] = [];
        for (const form of forms ?? []) {
          if (!form.NumberOfApprovalLayer || form.NumberOfApprovalLayer === 0) continue;

          const listName = form.Title;
          try {
            const items = await (async () => {
              // Query tiers: try progressively fewer custom columns.
              // SharePoint returns 400 if ANY selected column doesn't exist on the list.

              // Tier 1: all columns (includes PdfUrl, CurrentLayer, FormStatus, legacy Status)
              const tier1 = await (async () => {
                try {
                  return await spGet(token,
                    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,Title,SubmittedBy,SubmittedAt,FormVersion,Status,FormStatus,CurrentLayer,L1_Status,PdfUrl&$orderby=Created desc&$top=100`
                  ) as { value?: PendingItem[] };
                } catch { return null; }
              })();
              if (tier1) return tier1;

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
                allItems.push({ ...item, Title: form.Title });
              }
            }
          } catch (e) {
            console.warn(`[Approval] skipped "${form.Title}" — list error:`, (e as Error).message);
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
  }, [token]);

  // ── System columns to exclude from response data ──────────────────────
  const SYSTEM_FIELDS = new Set([
    'Id','Title','SubmittedBy','SubmittedAt','Status','CurrentApprovalLayer',
    'FormVersion','FormID','RawJSON','CurrentLayer','FormStatus','EvaluationData',
    'Author','Editor','Created','Modified','ContentType','PermMask',
    'L1_Status','L1_Email','L1_SignedAt','L1_Rejection','L1_Signature',
    'L2_Status','L2_Email','L2_SignedAt','L2_Rejection','L2_Signature',
    'L3_Status','L3_Email','L3_SignedAt','L3_Rejection','L3_Signature',
  ]);

  // Load selected item details
  const loadItemDetails = useCallback(async (item: PendingItem) => {
    if (!token) return;

    setSelectedItem(item);
    setSurveyJson(null);
    setResponseData(null);

    try {
      // Get form config
      const cfg = await getFormConfigByTitle(token, item.Title);
      setFormConfig(cfg);

      if (cfg) {
        // Resolve FormVersion
        let formVersion = item.FormVersion;
        if (!formVersion) {
          try {
            const respItem = await spGet(
              token,
              `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(item.Title)}')/items(${item.Id})?$select=FormVersion`
            ) as { FormVersion?: string };
            formVersion = respItem?.FormVersion || cfg.CurrentVersion || '1.0';
          } catch {
            formVersion = cfg.CurrentVersion || '1.0';
          }
        }

        // Get survey JSON from versions
        const versionData = await spGet(
          token,
          `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(cfg.Title)}' and FormVersion eq '${encodeURIComponent(formVersion)}'&$select=SurveyJSON&$top=1`
        ) as { value?: { SurveyJSON?: string }[] };

        const rawSurvey = versionData.value?.[0]?.SurveyJSON;
        if (rawSurvey) {
          const parsed = JSON.parse(rawSurvey);
          const surveyContent = parsed.surveyJson || parsed;
          setSurveyJson(surveyContent);
        }

        // Load response item data (submitted field values)
        const respItem = await spGet(
          token,
          `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(item.Title)}')/items(${item.Id})`
        ) as Record<string, unknown>;

        // Filter out system columns, keep only survey question data
        const data: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(respItem)) {
          if (!SYSTEM_FIELDS.has(k) && v !== null && v !== undefined) {
            data[k] = v;
          }
        }
        setResponseData(data);
      }
    } catch (e) {
      console.error("[Approval] load details error:", e);
    }
  }, [token]);

  // Handle approve
  const handleApprove = async () => {
    if (!token || !selectedItem || !formConfig) return;

    setActionLoading(true);
    try {
      const currentLayer = selectedItem.CurrentApprovalLayer || 1;
      const totalLayers = formConfig.NumberOfApprovalLayer || 1;
      const listName = selectedItem.Title; // list is named after form title

      // Get next approver email
      let nextApproverEmail = "";
      if (currentLayer < totalLayers) {
        const approvers = await spGet(
          token,
          `${SP_SITE_URL}/_api/web/lists/getbytitle('Approvers')/items?$filter=FormTitle eq '${encodeURIComponent(selectedItem.Title)}' and LayerNumber eq ${currentLayer + 1}&$select=ApproverEmail&$top=1`
        ) as { value?: { ApproverEmail: string }[] };
        nextApproverEmail = approvers.value?.[0]?.ApproverEmail || "";
      }

      // Update status (legacy + enhanced columns)
      const isFinal = currentLayer >= totalLayers;
      const newStatus = isFinal ? "Approved" : `Approved Layer ${currentLayer}`;
      const patchBody: Record<string, unknown> = {
        Status: newStatus,
        CurrentApprovalLayer: currentLayer + 1,
        FormStatus: isFinal ? "Approved" : "In Review",
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
            pdfData.meta.formStatus = "approved";
            pdfUrl = await generateAndStorePdf(token, selectedItem.Title, selectedItem.Id, pdfData);
          }
        } catch (pdfErr) {
          console.warn("[Approval] PDF generation failed:", pdfErr);
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
      const itemFormStatus = isFinal ? "Approved" : "In Review";
      setPendingItems((prev) => prev.map((i) =>
        i.Id === selectedItem.Id
          ? { ...i, Status: newStatus, FormStatus: itemFormStatus, L1_Status: i.L1_Status || SP_LAYER_STATUS.APPROVED, PdfUrl: pdfUrl || i.PdfUrl }
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
  const handleReject = async () => {
    if (!token || !selectedItem || !formConfig) return;

    setActionLoading(true);
    try {
      const listName = selectedItem.Title; // list is named after form title

      // Generate PDF before notification so we can include the link in the email
      let pdfUrl: string | undefined;
      try {
        const pdfData = await loadPdfData(selectedItem, token);
        if (pdfData) {
          pdfData.meta.formStatus = "rejected";
          pdfUrl = await generateAndStorePdf(token, selectedItem.Title, selectedItem.Id, pdfData);
        }
      } catch (pdfErr) {
        console.warn("[Approval] PDF generation failed:", pdfErr);
      }

      const currentLayer = selectedItem.CurrentApprovalLayer || selectedItem.CurrentLayer || 1;
      await spPatch(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${selectedItem.Id})`,
        {
          Status: "Rejected",
          FormStatus: "Rejected",
          [`L${currentLayer}_Status`]: SP_LAYER_STATUS.REJECTED,
          [`L${currentLayer}_SignedAt`]: new Date().toISOString(),
        }
      );

      await triggerApprovalNotification(token, {
        formTitle: selectedItem.Title,
        submittedBy: selectedItem.SubmittedBy,
        responseItemId: selectedItem.Id,
        layer: selectedItem.CurrentApprovalLayer || 1,
        totalLayers: formConfig.NumberOfApprovalLayer || 1,
        action: "reject",
        pdfUrl,
      });

      // Update local list (keep item with new status)
      setPendingItems((prev) => prev.map((i) =>
        i.Id === selectedItem.Id
          ? { ...i, Status: "Rejected", FormStatus: "Rejected", PdfUrl: pdfUrl || i.PdfUrl }
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
      setPreviewModel(m);
    } catch {
      setPreviewModel(null);
    }
  }, [surveyJson, responseData]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: C.textMuted }}>Loading approvals...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: C.cardBg, borderRadius: 16, padding: 40, textAlign: "center", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>🔒</div>
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
          <button onClick={() => instance.logoutRedirect({ postLogoutRedirectUri: window.location.href })}
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

        {/* Status Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(["all", "pending", "approved", "rejected"] as const).map((tab) => {
            const count = tab === "all" ? pendingItems.length
              : pendingItems.filter((i: PendingItem) => getItemStatus(i) === tab).length;
            return (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                style={{
                  padding: "6px 16px",
                  borderRadius: 20,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  background: statusFilter === tab ? C.purple : "#fff",
                  color: statusFilter === tab ? "#fff" : C.textSecond,
                  boxShadow: statusFilter === tab ? "none" : "0 1px 2px rgba(0,0,0,0.06)",
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)} ({count})
              </button>
            );
          })}
        </div>

        {/* Items + Detail Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Items List */}
          <div style={{ background: C.cardBg, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: 16, borderBottom: `1px solid ${C.border}`, background: C.purplePale }}>
              <span style={{ fontWeight: 600, color: C.purple }}>{statusFilter === "all" ? "All" : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} Submissions ({filteredItems.length})</span>
            </div>
            <div style={{ maxHeight: 600, overflow: "auto" }}>
              {filteredItems.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: C.textMuted }}>No submissions</div>
              ) : (
                filteredItems.map((item) => (
                  <div
                    key={item.Id}
                    onClick={() => loadItemDetails(item)}
                    style={{
                      padding: 16,
                      borderBottom: `1px solid ${C.border}`,
                      cursor: "pointer",
                      background: selectedItem?.Id === item.Id ? C.purplePale : "transparent",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: C.textPrimary, marginBottom: 4 }}>{item.Title}</div>
                        <div style={{ fontSize: 13, color: C.textSecond }}>
                          By {item.SubmittedBy} • {item.SubmittedAt ? new Date(item.SubmittedAt).toLocaleDateString() : "N/A"}
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
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
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
                    Submitted by {selectedItem.SubmittedBy} • {selectedItem.SubmittedAt ? new Date(selectedItem.SubmittedAt).toLocaleString() : "N/A"}
                  </div>
                </div>

                <div style={{ padding: 16, maxHeight: 400, overflow: "auto" }}>
                  {previewModel ? (
                    <div className="approval-survey-preview">
                      <Survey model={previewModel} />
                    </div>
                  ) : (
                    <div style={{ color: C.textMuted }}>Loading form preview...</div>
                  )}
                </div>

                <div style={{ padding: 16, borderTop: `1px solid ${C.border}`, display: "flex", gap: 12 }}>
                  {getItemStatus(selectedItem) === "pending" ? (
                    <>
                      <button onClick={handleApprove} disabled={actionLoading}
                        style={{ flex: 1, padding: "12px 16px", borderRadius: 8, border: "none",
                          background: C.green, color: "#fff", fontWeight: 600,
                          cursor: actionLoading ? "not-allowed" : "pointer", opacity: actionLoading ? 0.6 : 1 }}>
                        ✓ Approve
                      </button>
                      <button onClick={handleReject} disabled={actionLoading}
                        style={{ flex: 1, padding: "12px 16px", borderRadius: 8,
                          border: `1px solid ${C.red}`, background: "transparent", color: C.red, fontWeight: 600,
                          cursor: actionLoading ? "not-allowed" : "pointer", opacity: actionLoading ? 0.6 : 1 }}>
                        ✕ Reject
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
          </div>
        </div>
      </div>
    </div>
  );
}
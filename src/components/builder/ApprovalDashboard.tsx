/**
 * ApprovalDashboard.tsx — Admin view for pending form approvals
 * Route: /admin/approvals
 */
import { useState, useEffect, useCallback } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import { FlatLightPanelless } from "survey-core/themes";
import "survey-core/survey-core.min.css";

import { spGet, spPatch, triggerApprovalNotification, getAllFormConfigs, getFormConfigByTitle } from "../../utils/formBuilderSP";

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
}

interface FormConfig {
  Title: string;
  NumberOfApprovalLayer?: number;
  FormID?: string;
}

export default function ApprovalDashboard() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<PendingItem | null>(null);
  const [surveyJson, setSurveyJson] = useState<unknown>(null);
  const [formConfig, setFormConfig] = useState<FormConfig | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

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

  // Load pending items
  useEffect(() => {
    if (!token) return;

    const loadData = async () => {
      try {
        // Get all forms with approval layers
        const forms = await getAllFormConfigs(token);

        // For each form, get pending items
        const allItems: PendingItem[] = [];
        for (const form of forms ?? []) {
          if (!form.NumberOfApprovalLayer || form.NumberOfApprovalLayer === 0) continue;

          const listName = `${form.Title} Responses`;
          const items = await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$filter=Status eq 'Pending Approval' or Status startswith 'Approved Layer'&$select=Id,Title,SubmittedBy,SubmittedAt,Status,CurrentApprovalLayer,FormVersion,RawJSON&$orderby=SubmittedAt desc&$top=50`
          ) as { value?: PendingItem[] };

          if (items.value) {
            for (const item of items.value) {
              allItems.push({ ...item, Title: form.Title });
            }
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

  // Load selected item details
  const loadItemDetails = useCallback(async (item: PendingItem) => {
    if (!token) return;

    setSelectedItem(item);
    setSurveyJson(null);

    try {
      // Get form config
      const cfg = await getFormConfigByTitle(token, item.Title);
      setFormConfig(cfg);

      if (cfg) {
        // Get survey JSON from versions
        const versionData = await spGet(
          token,
          `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(cfg.Title)}' and FormVersion eq '${encodeURIComponent(item.FormVersion)}'&$select=SurveyJSON&$top=1`
        ) as { value?: { SurveyJSON?: string }[] };

        if (versionData.value?.[0]?.SurveyJSON) {
          setSurveyJson(JSON.parse(versionData.value[0].SurveyJSON));
        }
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
      const listName = `${selectedItem.Title} Responses`;

      // Get next approver email
      let nextApproverEmail = "";
      if (currentLayer < totalLayers) {
        const approvers = await spGet(
          token,
          `${SP_SITE_URL}/_api/web/lists/getbytitle('Approvers')/items?$filter=FormTitle eq '${encodeURIComponent(selectedItem.Title)}' and LayerNumber eq ${currentLayer + 1}&$select=ApproverEmail&$top=1`
        ) as { value?: { ApproverEmail: string }[] };
        nextApproverEmail = approvers.value?.[0]?.ApproverEmail || "";
      }

      // Update status
      const newStatus = currentLayer >= totalLayers ? "Approved" : `Approved Layer ${currentLayer}`;
      await spPatch(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${selectedItem.Id})`,
        {
          Status: newStatus,
          CurrentApprovalLayer: currentLayer + 1,
        }
      );

      // Send notification
      await triggerApprovalNotification(token, {
        formTitle: selectedItem.Title,
        submittedBy: selectedItem.SubmittedBy,
        responseItemId: selectedItem.Id,
        layer: currentLayer,
        totalLayers,
        action: "approve",
        nextApproverEmail,
      });

      // Refresh list
      setPendingItems((prev) => prev.filter((i) => i.Id !== selectedItem.Id));
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
      const listName = `${selectedItem.Title} Responses`;

      await spPatch(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${selectedItem.Id})`,
        {
          Status: "Rejected",
        }
      );

      await triggerApprovalNotification(token, {
        formTitle: selectedItem.Title,
        submittedBy: selectedItem.SubmittedBy,
        responseItemId: selectedItem.Id,
        layer: selectedItem.CurrentApprovalLayer || 1,
        totalLayers: formConfig.NumberOfApprovalLayer || 1,
        action: "reject",
      });

      setPendingItems((prev) => prev.filter((i) => i.Id !== selectedItem.Id));
      setSelectedItem(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  // Render preview survey
  const previewSurvey = surveyJson
    ? (() => {
        try {
          const m = new Model(surveyJson as object);
          m.applyTheme(FlatLightPanelless);
          m.mode = "display";
          return m;
        } catch {
          return null;
        }
      })()
    : null;

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
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.textPrimary, margin: 0 }}>Approvals</h1>
          <p style={{ color: C.textSecond, marginTop: 4 }}>Review and approve form submissions</p>
        </header>

        {error && (
          <div style={{ background: C.redPale, border: "1px solid #FCA5A5", borderRadius: 8, padding: 12, color: C.red, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Pending Items List */}
          <div style={{ background: C.cardBg, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: 16, borderBottom: `1px solid ${C.border}`, background: C.purplePale }}>
              <span style={{ fontWeight: 600, color: C.purple }}>Pending Approvals ({pendingItems.length})</span>
            </div>
            <div style={{ maxHeight: 600, overflow: "auto" }}>
              {pendingItems.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: C.textMuted }}>No pending approvals</div>
              ) : (
                pendingItems.map((item) => (
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
                    <div style={{ fontWeight: 600, color: C.textPrimary, marginBottom: 4 }}>{item.Title}</div>
                    <div style={{ fontSize: 13, color: C.textSecond }}>
                      By {item.SubmittedBy} • {item.SubmittedAt ? new Date(item.SubmittedAt).toLocaleDateString() : "N/A"}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 12,
                          background: C.amberPale,
                          color: C.amber,
                        }}
                      >
                        {item.Status}
                      </span>
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
                  {previewSurvey ? (
                    <div className="approval-survey-preview">
                      <Survey model={previewSurvey} />
                    </div>
                  ) : (
                    <div style={{ color: C.textMuted }}>Loading form preview...</div>
                  )}
                </div>

                <div style={{ padding: 16, borderTop: `1px solid ${C.border}`, display: "flex", gap: 12 }}>
                  <button
                    onClick={handleApprove}
                    disabled={actionLoading}
                    style={{
                      flex: 1,
                      padding: "12px 16px",
                      borderRadius: 8,
                      border: "none",
                      background: C.green,
                      color: "#fff",
                      fontWeight: 600,
                      cursor: actionLoading ? "not-allowed" : "pointer",
                      opacity: actionLoading ? 0.6 : 1,
                    }}
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={actionLoading}
                    style={{
                      flex: 1,
                      padding: "12px 16px",
                      borderRadius: 8,
                      border: `1px solid ${C.red}`,
                      background: "transparent",
                      color: C.red,
                      fontWeight: 600,
                      cursor: actionLoading ? "not-allowed" : "pointer",
                      opacity: actionLoading ? 0.6 : 1,
                    }}
                  >
                    ✕ Reject
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
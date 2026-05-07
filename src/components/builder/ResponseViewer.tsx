/**
 * ResponseViewer.tsx — Admin view for all form submissions
 * Route: /admin/responses/:formTitle
 */
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import { FlatLightPanelless } from "survey-core/themes";
import "survey-core/survey-core.min.css";

import { spGet, getFormConfigByTitle } from "../../utils/formBuilderSP";

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

interface SubmissionItem {
  Id: number;
  Title: string;
  SubmittedBy: string;
  SubmittedAt: string;
  Status: string;
  CurrentApprovalLayer: number;
  CurrentLayer?: number;
  FormStatus?: string;
  FormVersion: string;
  RawJSON: string;
  PdfUrl?: string;
}

interface FormConfig {
  Title: string;
  NumberOfApprovalLayer?: number;
}

export default function ResponseViewer() {
  const { formTitle } = useParams<{ formTitle: string }>();
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [, setFormConfig] = useState<FormConfig | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionItem | null>(null);
  const [surveyJson, setSurveyJson] = useState<unknown>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

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

  // Load submissions
  useEffect(() => {
    if (!token || !formTitle) return;

    const loadData = async () => {
      try {
        // Get form config
        const cfg = await getFormConfigByTitle(token, formTitle);
        setFormConfig(cfg);

        // Get submissions from response list (named after form title, no " Responses" suffix)
        const listName = formTitle;
        const items = await spGet(
          token,
          `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,Title,SubmittedBy,SubmittedAt,Status,CurrentApprovalLayer,CurrentLayer,FormStatus,FormVersion,RawJSON,PdfUrl&$orderby=SubmittedAt desc&$top=100`
        ) as { value?: SubmissionItem[] };

        setSubmissions(items.value || []);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token, formTitle]);

  // Load survey JSON for selected submission
  const loadSubmissionDetails = async (item: SubmissionItem) => {
    if (!token) return;

    setSelectedSubmission(item);
    setSurveyJson(null);

    try {
      const versionData = await spGet(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(formTitle || "")}' and FormVersion eq '${encodeURIComponent(item.FormVersion)}'&$select=SurveyJSON&$top=1`
      ) as { value?: { SurveyJSON?: string }[] };

      if (versionData.value?.[0]?.SurveyJSON) {
        setSurveyJson(JSON.parse(versionData.value[0].SurveyJSON));
      }
    } catch (e) {
      console.error("[ResponseViewer] load details error:", e);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ["ID", "Submitted By", "Submitted At", "Status", "Form Status", "Current Layer", "Version"];
    const rows = filteredSubmissions.map((s) => [
      s.Id,
      s.SubmittedBy,
      s.SubmittedAt,
      s.Status,
      s.FormStatus || "",
      s.CurrentLayer ?? s.CurrentApprovalLayer,
      s.FormVersion,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${formTitle}-submissions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter submissions
  const filteredSubmissions =
    statusFilter === "all"
      ? submissions
      : submissions.filter((s) => s.Status.toLowerCase().includes(statusFilter.toLowerCase()));

  // Render preview survey with data
  const previewSurvey = surveyJson
    ? (() => {
        try {
          const m = new Model(surveyJson as object);
          m.applyTheme(FlatLightPanelless);
          m.mode = "display";
          // If there's a selected submission, load its data
          if (selectedSubmission?.RawJSON) {
            try {
              const data = JSON.parse(selectedSubmission.RawJSON);
              m.data = data;
            } catch {
              // Ignore parse errors
            }
          }
          return m;
        } catch {
          return null;
        }
      })()
    : null;

  // Status badge color
  const getStatusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes("approved") || s.includes("submitted")) return { bg: C.greenPale, color: C.green };
    if (s.includes("pending")) return { bg: C.amberPale, color: C.amber };
    if (s.includes("rejected")) return { bg: C.redPale, color: C.red };
    return { bg: C.purplePale, color: C.purple };
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: C.textMuted }}>Loading submissions...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: C.cardBg, borderRadius: 16, padding: 40, textAlign: "center", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.textPrimary, marginBottom: 8 }}>Sign in required</div>
          <div style={{ color: C.textSecond }}>You must be signed in to view submissions.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: 24 }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <header style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.textPrimary, margin: 0 }}>
              {formTitle} Responses
            </h1>
            <p style={{ color: C.textSecond, marginTop: 4 }}>
              {submissions.length} submission{submissions.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.cardBg,
                color: C.textPrimary,
                fontSize: 13,
              }}
            >
              <option value="all">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
            <button
              onClick={handleExportCSV}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.cardBg,
                color: C.textPrimary,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              📥 Export CSV
            </button>
          </div>
        </header>

        {error && (
          <div style={{ background: C.redPale, border: "1px solid #FCA5A5", borderRadius: 8, padding: 12, color: C.red, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Submissions List */}
          <div style={{ background: C.cardBg, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: 16, borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, color: C.textPrimary }}>Submissions</span>
              <span style={{ fontSize: 12, color: C.textMuted }}>{filteredSubmissions.length} items</span>
            </div>
            <div style={{ maxHeight: 600, overflow: "auto" }}>
              {filteredSubmissions.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: C.textMuted }}>No submissions found</div>
              ) : (
                filteredSubmissions.map((item) => {
                  const statusStyle = getStatusColor(item.Status);
                  return (
                    <div
                      key={item.Id}
                      onClick={() => loadSubmissionDetails(item)}
                      style={{
                        padding: 16,
                        borderBottom: `1px solid ${C.border}`,
                        cursor: "pointer",
                        background: selectedSubmission?.Id === item.Id ? C.purplePale : "transparent",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: C.textMuted }}>#{item.Id}</span>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: 12,
                            background: statusStyle.bg,
                            color: statusStyle.color,
                          }}
                        >
                          {item.Status}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: C.textSecond }}>
                        By {item.SubmittedBy}
                      </div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                        {item.SubmittedAt ? new Date(item.SubmittedAt).toLocaleString() : "N/A"}
                      </div>
                      {(item.CurrentLayer ?? item.CurrentApprovalLayer) > 0 && (
                        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                          Layer {item.CurrentLayer || item.CurrentApprovalLayer}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Detail Panel */}
          <div style={{ background: C.cardBg, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {!selectedSubmission ? (
              <div style={{ padding: 48, textAlign: "center", color: C.textMuted }}>
                Select a submission to view details
              </div>
            ) : (
              <>
                <div style={{ padding: 16, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: C.textPrimary }}>Submission #{selectedSubmission.Id}</div>
                      <div style={{ fontSize: 13, color: C.textSecond, marginTop: 4 }}>
                        {selectedSubmission.SubmittedAt ? new Date(selectedSubmission.SubmittedAt).toLocaleString() : "N/A"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {selectedSubmission.PdfUrl && (
                        <a
                          href={selectedSubmission.PdfUrl.startsWith("http") ? selectedSubmission.PdfUrl : `${SP_SITE_URL}${selectedSubmission.PdfUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "4px 12px",
                            borderRadius: 12,
                            background: C.purplePale,
                            color: C.purple,
                            textDecoration: "none",
                          }}
                        >
                          View PDF
                        </a>
                      )}
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "4px 12px",
                          borderRadius: 12,
                          ...getStatusColor(selectedSubmission.Status),
                        }}
                      >
                        {selectedSubmission.Status}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: C.textMuted }}>
                    Submitted by: <strong>{selectedSubmission.SubmittedBy}</strong> • Version: {selectedSubmission.FormVersion}
                    {(selectedSubmission.CurrentLayer ?? selectedSubmission.CurrentApprovalLayer) > 0 && (
                      <> • Layer: <strong>{selectedSubmission.CurrentLayer || selectedSubmission.CurrentApprovalLayer}</strong></>
                    )}
                  </div>
                </div>

                <div style={{ padding: 16, maxHeight: 500, overflow: "auto" }}>
                  {previewSurvey ? (
                    <div className="response-survey-preview">
                      <Survey model={previewSurvey} />
                    </div>
                  ) : (
                    <div style={{ color: C.textMuted }}>Loading form preview...</div>
                  )}
                </div>

                {selectedSubmission.RawJSON && (
                  <details style={{ padding: 16, borderTop: `1px solid ${C.border}`, background: C.bg }}>
                    <summary style={{ cursor: "pointer", color: C.textSecond, fontSize: 13 }}>
                      View Raw JSON
                    </summary>
                    <pre
                      style={{
                        marginTop: 12,
                        padding: 12,
                        background: C.cardBg,
                        borderRadius: 8,
                        fontSize: 11,
                        overflow: "auto",
                        maxHeight: 200,
                      }}
                    >
                      {selectedSubmission.RawJSON}
                    </pre>
                  </details>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
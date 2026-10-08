/**
 * ResponseViewer.tsx — Admin view for all form submissions
 * Route: /admin/responses/:formTitle
 */
import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import NativeFormView from "../../native/NativeForm";
import { parseForm } from "../../native/schema";
import { useNativeForm } from "../../native/useNativeForm";
import "../../native/native-form.css";

import DOMPurify from "dompurify";
import { spGet, getFormConfigByTitle, readMatrixChildItems } from "../../utils/formBuilderSP";
import type { MatrixColumnDef } from "../../utils/formBuilderSP";
import { createSpClient } from "../../utils/sharepointClient";
import { acquireAccessTokenSilentOrRedirect } from "../../utils/authRecovery";
import { SP_STATIC } from "../../utils/spConfig";
import { isSuperuserOnlyForm } from "../../utils/superuserOnlyForms";
import { csvRow, downloadCsv } from "../../utils/csv";
import { rowsToHtml, getDynamicMatrixFields } from "../../utils/matrixData";
import { getSelectedCompany } from "../../utils/companySelection";
import SubmissionFilterPanel from "./SubmissionFilterPanel";
import {
  DEFAULT_PROFILE_KEY,
  EMPTY_SUBMISSION_FILTERS,
  compareVersionsDescending,
  hasActiveFilters,
  recordMatchesFilters,
  type FormVersionOption,
  type SubmissionFilterState,
} from "../../utils/submissionFilters";
import {
  fieldsFromResponses,
  fieldsFromSurveyJson,
  mergeObservedValues,
  selectSnapshotFields,
} from "../../utils/formFieldCatalog";
import type { SchemaSnapshot } from "../../utils/formFieldCatalog";
import { resolveLifecycleStage } from "../../utils/submissionLifecycle";
import { isTestRow } from "../../utils/testRun";
import { isTestColumnKnownMissing, setTestColumnKnownMissing } from "../../utils/testColumnProbeCache";
import { absoluteSharePointUrl } from "../../utils/sharePointUrl";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import { editorial, si, siType } from "../../theme/editorial";
import Card from "../common/Card";
import PageHeader from "../common/PageHeader";
import PageSkeleton from "../common/PageSkeleton";
import StatusPanel from "../common/StatusPanel";
import { DownloadRounded } from "@mui/icons-material";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

// Theme
const C = {
  purple: editorial.pmwBlue,
  purpleLight: editorial.pmwBlueDark,
  purplePale: editorial.blueSoft,
  purpleMid: editorial.sky,
  bg: editorial.paperSoft,
  cardBg: editorial.white,
  border: editorial.border,
  textPrimary: editorial.ink,
  textSecond: editorial.muted,
  textMuted: editorial.softMuted,
  green: editorial.success,
  greenPale: editorial.successSoft,
  greenBorder: editorial.successFill,
  red: editorial.error,
  redPale: editorial.errorSoft,
  amber: editorial.accentText,
  amberPale: editorial.accentSoft,
};

interface MatrixTableEntry {
  /** The question's own title, for the heading above the table. */
  title: string;
  columns: MatrixColumnDef[];
  rows: Record<string, unknown>[];
  html: string;
}

interface SubmissionItem {
  Id: number;
  Title: string | null;
  SubmittedBy: string | null;
  SubmittedAt: string;
  /** Null on items whose Status column was never written. */
  Status: string | null;
  CurrentApprovalLayer: number;
  CurrentLayer?: number;
  FormStatus?: string;
  FormVersion: string;
  RawJSON: string;
  PdfUrl?: string;
  /** Tolerant reading via `isTestRow` — see `../../utils/testRun`. */
  IsTest?: string | boolean;
}

interface FormConfig {
  Title: string;
  NumberOfApprovalLayer?: number;
}

const SYSTEM_FIELDS = new Set([
  "Id", "Title", "SubmittedBy", "SubmittedAt", "Status", "CurrentApprovalLayer",
  "FormVersion", "FormID", "RawJSON", "CurrentLayer", "FormStatus", "EvaluationData", "WorkflowAssignmentData", "WorkflowEmailLog", "WorkflowEmailSchedule",
  "PDPAConsent", "PDPANoticeVersion", "PDPAConsentAt", "RetentionUntil",
  "Author", "Editor", "Created", "Modified", "ContentType", "PermMask", "PdfUrl",
  "L1_Status", "L1_Email", "L1_SignedAt", "L1_Rejection", "L1_Signature",
  "L2_Status", "L2_Email", "L2_SignedAt", "L2_Rejection", "L2_Signature",
  "L3_Status", "L3_Email", "L3_SignedAt", "L3_Rejection", "L3_Signature",
  "SelectedBranch", "IsTest", "TestEmail", "TestRunLog",
]);

function extractResponseFields(item: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (!SYSTEM_FIELDS.has(key) && value !== null && value !== undefined) {
      data[key] = value;
    }
  }
  return data;
}

export default function ResponseViewer() {
  const { formTitle } = useParams<{ formTitle: string }>();
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [, setFormConfig] = useState<FormConfig | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionItem | null>(null);
  const [selectedResponseData, setSelectedResponseData] = useState<Record<string, unknown> | null>(null);
  const [surveyJson, setSurveyJson] = useState<unknown>(null);
  const [filters, setFilters] = useState<SubmissionFilterState>(EMPTY_SUBMISSION_FILTERS);
  /** This form's questions, one entry per published version, for the filter panel. */
  const [schemaSnapshots, setSchemaSnapshots] = useState<SchemaSnapshot[]>([]);
  const [matrixTables, setMatrixTables] = useState<Record<string, MatrixTableEntry>>({});
  const [matrixLoading, setMatrixLoading] = useState(false);

  // Admin access check (defense-in-depth)
  useEffect(() => {
    if (inProgress !== InteractionStatus.None) return;
    if (!isAuthenticated) return;

    // A test-only form's responses also need the superuser group, so an HR
    // Forms Owner outside it cannot reach them by typing the URL.
    const client = createSpClient(instance, accounts);
    Promise.all([
      client.isGroupMember(SP_STATIC.adminGroup),
      isSuperuserOnlyForm(formTitle) ? client.isGroupMember(SP_STATIC.formBuilderSuperuserGroup) : true,
    ])
      .then(([admin, superuserIfNeeded]) => {
        setIsAdmin(admin && superuserIfNeeded);
        setAdminChecked(true);
      })
      .catch(() => {
        setIsAdmin(false);
        setAdminChecked(true);
      });
  }, [isAuthenticated, inProgress, instance, accounts, formTitle]);

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

  // Load submissions
  useEffect(() => {
    if (!adminChecked || !isAdmin) return;
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

        const loadedItems = items.value || [];

        // IsTest is provisioned lazily — it only exists on a list once someone
        // has minted a test ticket for that form — so it is fetched separately
        // and merged in. A list that has never been rehearsed 400s on this
        // query, which must not sink the submissions load above. The failure is
        // memoised per list (isTestColumnKnownMissing) so this guaranteed-failing
        // request is not repeated on every future load of a form that has never
        // been rehearsed.
        if (!isTestColumnKnownMissing(listName)) {
          try {
            const testData = await spGet(
              token,
              `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,IsTest&$orderby=SubmittedAt desc&$top=100`
            ) as { value?: { Id: number; IsTest?: string | boolean }[] };
            setTestColumnKnownMissing(listName, false);
            const testMap = new Map<number, string | boolean | undefined>();
            for (const row of testData.value || []) testMap.set(row.Id, row.IsTest);
            for (const item of loadedItems) {
              if (testMap.has(item.Id)) item.IsTest = testMap.get(item.Id);
            }
          } catch {
            // Column does not exist on this list — every row here reads as production.
            setTestColumnKnownMissing(listName, true);
          }
        }

        setSubmissions(loadedItems);

        // Every version this form has been published as, so the filter knows the
        // questions before any submission is opened — `surveyJson` below is
        // loaded per selected response and is null until then.
        try {
          const versions = await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(listName)}'&$select=FormVersion,SurveyJSON&$top=50`
          ) as { value?: { FormVersion?: string; SurveyJSON?: string }[] };
          const snapshots: SchemaSnapshot[] = [];
          for (const version of versions.value ?? []) {
            if (!version.SurveyJSON) continue;
            try {
              snapshots.push({
                formVersion: (version.FormVersion || "").trim(),
                profileKey: DEFAULT_PROFILE_KEY,
                fields: fieldsFromSurveyJson(JSON.parse(version.SurveyJSON)),
              });
            } catch { /* skip unparseable snapshot */ }
          }
          setSchemaSnapshots(snapshots);
        } catch { /* version list may not exist — the catalogue stays empty */ }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [adminChecked, isAdmin, token, formTitle]);

  // Load survey JSON for selected submission
  const loadSubmissionDetails = async (item: SubmissionItem) => {
    if (!token) return;

    setSelectedSubmission(item);
    setSelectedResponseData(null);
    setSurveyJson(null);
    setMatrixTables({});

    try {
      const fullItem = await spGet(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(formTitle || "")}')/items(${item.Id})`
      ) as Record<string, unknown>;
      setSelectedResponseData(extractResponseFields(fullItem));

      const versionData = await spGet(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(formTitle || "")}' and FormVersion eq '${encodeURIComponent(item.FormVersion)}'&$select=SurveyJSON&$top=1`
      ) as { value?: { SurveyJSON?: string }[] };

      if (versionData.value?.[0]?.SurveyJSON) {
        const parsed = JSON.parse(versionData.value[0].SurveyJSON);
        setSurveyJson(parsed);

        // Detect dynamicmatrix fields and load child list data
        const surveyDef = parsed.surveyJson || parsed;
        const dynamicMatrixFields = getDynamicMatrixFields(surveyDef);

        if (dynamicMatrixFields.length > 0 && formTitle) {
          setMatrixLoading(true);
          const tables: Record<string, MatrixTableEntry> = {};

          for (const mf of dynamicMatrixFields) {
            const safeName = mf.name.replace(/[^a-zA-Z0-9_ -]/g, "").trim();
            const childListName = `${formTitle} Matrix ${safeName}`;

            try {
              const rows = await readMatrixChildItems(token, childListName, item.Id, mf.columns);
              if (rows.length > 0) {
                tables[mf.name] = {
                  title: mf.title || mf.name,
                  columns: mf.columns as MatrixColumnDef[],
                  rows,
                  html: rowsToHtml(mf.columns, rows),
                };
              }
            } catch {
              // Child list not found or read failed — try _Html fallback from the response item
              try {
                const itemData = await spGet(
                  token,
                  `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(formTitle)}')/items(${item.Id})?$select=${mf.name}_Html`
                ) as Record<string, unknown>;
                const htmlVal = itemData[`${mf.name}_Html`] as string | undefined;
                if (htmlVal) {
                  tables[mf.name] = {
                    title: mf.title || mf.name,
                    columns: mf.columns as MatrixColumnDef[],
                    rows: [],
                    html: htmlVal,
                  };
                }
              } catch {
                // Both child list and _Html fallback failed — skip this matrix
              }
            }
          }

          setMatrixTables(tables);
          setMatrixLoading(false);
        }
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

    const csv = [csvRow(headers), ...rows.map(csvRow)].join("\r\n");
    downloadCsv(csv, `${formTitle}-submissions.csv`);
  };

  // Answers parsed once, so the field conditions do not re-parse every keystroke.
  const parsedItemData = useMemo(() => {
    const map = new Map<number, Record<string, unknown>>();
    for (const item of submissions) {
      let data: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(item.RawJSON || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          data = parsed as Record<string, unknown>;
        }
      } catch { /* unparseable payload — no answers to filter on */ }
      map.set(item.Id, data);
    }
    return map;
  }, [submissions]);

  /** Versions of this form that have submissions, newest first. */
  const formVersionOptions = useMemo<FormVersionOption[]>(() => {
    const counts = new Map<string, number>();
    for (const item of submissions) {
      const version = (item.FormVersion || "").trim();
      if (!version) continue;
      counts.set(version, (counts.get(version) ?? 0) + 1);
    }
    return Array.from(counts, ([version, count]) => ({ version, count }))
      .sort((a, b) => compareVersionsDescending(a.version, b.version));
  }, [submissions]);

  /**
   * This page is already scoped to one form, so the filter panel skips the form
   * step and starts at the version — then that version's own questions.
   */
  const fieldCatalog = useMemo(() => {
    const scopedItems = filters.formVersion
      ? submissions.filter((item) => (item.FormVersion || "").trim() === filters.formVersion)
      : submissions;
    const answers = scopedItems.map((item) => parsedItemData.get(item.Id) ?? {});
    const scoped = selectSnapshotFields(schemaSnapshots, { formVersion: filters.formVersion });
    const base = scoped.length ? scoped : fieldsFromResponses(answers);
    return mergeObservedValues(base, answers);
  }, [schemaSnapshots, submissions, parsedItemData, filters.formVersion]);

  const filteredSubmissions = useMemo(
    () =>
      submissions.filter((item) =>
        recordMatchesFilters(
          {
            formType: formTitle ?? "",
            profileKey: DEFAULT_PROFILE_KEY,
            formVersion: (item.FormVersion || "").trim(),
            stage: resolveLifecycleStage({
              formStatus: item.FormStatus,
              status: item.Status,
            }),
            submittedAt: item.SubmittedAt,
            searchTexts: [item.Title ?? "", String(item.Id)],
            submitterTexts: [item.SubmittedBy ?? ""],
            data: parsedItemData.get(item.Id) ?? {},
            isTest: isTestRow(item as unknown as Record<string, unknown>),
          },
          filters,
        ),
      ),
    [submissions, filters, formTitle, parsedItemData],
  );

  // The published document this response was answered against.
  const previewForm = useMemo(() => {
    if (!surveyJson) return null;
    try {
      return parseForm(surveyJson);
    } catch {
      return null;
    }
  }, [surveyJson]);

  /**
   * The answers to show in it. The response list's own columns win over
   * `RawJSON`, which is the snapshot taken at submission time and can lag
   * anything an approver corrected since.
   */
  const previewAnswers = useMemo<Record<string, unknown>>(() => {
    if (selectedResponseData) return selectedResponseData as Record<string, unknown>;
    if (selectedSubmission?.RawJSON) {
      try {
        return JSON.parse(selectedSubmission.RawJSON) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return {};
  }, [selectedSubmission?.RawJSON, selectedResponseData]);

  const placeholderForm = useMemo(() => parseForm(null), []);
  const previewRuntime = useNativeForm(previewForm ?? placeholderForm, previewAnswers, { readOnly: true });

  const selectedCompany = getSelectedCompany(selectedResponseData, surveyJson);

  // Status badge color. SharePoint returns null for a Status never written, so
  // this cannot assume a string.
  const getStatusColor = (status: string | null | undefined) => {
    const s = (status ?? "").toLowerCase();
    if (s.includes("approved") || s.includes("submitted")) return { bg: C.greenPale, color: C.green };
    if (s.includes("pending")) return { bg: C.amberPale, color: C.amber };
    if (s.includes("rejected")) return { bg: C.redPale, color: C.red };
    return { bg: C.purplePale, color: C.purple };
  };

  if (loading) {
    return <PageSkeleton label="Loading responses" rows={6} />;
  }

  if (!isAuthenticated) {
    return <StatusPanel tone="lock" title="Sign in required" body="You must be signed in to view submissions." />;
  }

  if (adminChecked && !isAdmin) {
    return (
      <StatusPanel
        tone="no-access"
        title="You do not have access to these responses"
        body={
          isSuperuserOnlyForm(formTitle)
            ? "This form's responses are limited to Form Builder superusers."
            : "You need HR Forms Owner permissions to view this page. Please return to the dashboard."
        }
      />
    );
  }

  return (
    <div>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <PageHeader
          title={`${formTitle} responses`}
          description={`${submissions.length} submission${submissions.length !== 1 ? "s" : ""}`}
          secondary={[{ label: "Export CSV", onClick: handleExportCSV, icon: <DownloadRounded /> }]}
        />

        {error && (
          <Box role="alert" sx={{ backgroundColor: editorial.errorSoft, borderRadius: `${si.radiusSm}px`, p: 1.5, color: editorial.error, mb: 2, ...siType.body }}>
            {error}
          </Box>
        )}

        <SubmissionFilterPanel
          filters={filters}
          setFilters={setFilters}
          formVersionOptions={formVersionOptions}
          fieldCatalog={fieldCatalog}
          total={submissions.length}
          filtered={filteredSubmissions.length}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 16 }}>
          {/* Submissions List */}
          <Card pad="none" clip>
            <div style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ ...siType.cardTitle, color: C.textPrimary }}>Submissions</span>
              <span style={{ fontSize: 12.5, color: C.textMuted }}>{filteredSubmissions.length} items</span>
            </div>
            <div style={{ maxHeight: 600, overflow: "auto" }}>
              {filteredSubmissions.length === 0 ? (
                <StatusPanel
                  tone="empty"
                  title="No submissions found"
                  body={hasActiveFilters(filters) ? "Nothing matches the filters you have set." : "Nobody has submitted this form yet."}
                  primary={hasActiveFilters(filters) ? { label: "Clear filters", onClick: () => setFilters(EMPTY_SUBMISSION_FILTERS) } : undefined}
                />
              ) : (
                filteredSubmissions.map((item) => {
                  const statusStyle = getStatusColor(item.Status);
                  return (
                    <Box
                      key={item.Id}
                      onClick={() => loadSubmissionDetails(item)}
                      sx={{
                        p: 2,
                        borderRadius: `${si.radius}px`,
                        cursor: "pointer",
                        backgroundColor: selectedSubmission?.Id === item.Id ? editorial.sky : "transparent",
                        "&:hover": { backgroundColor: selectedSubmission?.Id === item.Id ? editorial.sky : editorial.blueSoft },
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 12.5, color: C.textMuted }}>#{item.Id}</span>
                          {isTestRow(item as unknown as Record<string, unknown>) && (
                            <Chip label="Test run" size="small" sx={{ height: 20, ...siType.subtext, fontWeight: 600, backgroundColor: editorial.accentSoft, color: editorial.accentText }} />
                          )}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
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
                      <div style={{ fontSize: 13.5, color: C.textSecond }}>
                        By {item.SubmittedBy}
                      </div>
                      <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 4 }}>
                        {item.SubmittedAt ? new Date(item.SubmittedAt).toLocaleString() : "N/A"}
                      </div>
                      {(item.CurrentLayer ?? item.CurrentApprovalLayer) > 0 && (
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                          Layer {item.CurrentLayer || item.CurrentApprovalLayer}
                        </div>
                      )}
                    </Box>
                  );
                })
              )}
            </div>
          </Card>

          {/* Detail Panel */}
          <Card pad="none" clip>
            {!selectedSubmission ? (
              <div style={{ padding: 48, textAlign: "center", color: C.textMuted }}>
                Select a submission to see its details
              </div>
            ) : (
              <>
                <div style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: C.textPrimary }}>Submission #{selectedSubmission.Id}</div>
                      <div style={{ fontSize: 13.5, color: C.textSecond, marginTop: 4 }}>
                        {selectedSubmission.SubmittedAt ? new Date(selectedSubmission.SubmittedAt).toLocaleString() : "N/A"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {selectedSubmission.PdfUrl && (
                        <a
                          href={absoluteSharePointUrl(selectedSubmission.PdfUrl, SP_SITE_URL)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 11.5,
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
                          fontSize: 11.5,
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
                  <div style={{ marginTop: 8, fontSize: 12.5, color: C.textMuted }}>
                    Submitted by <strong>{selectedSubmission.SubmittedBy}</strong> • Version: {selectedSubmission.FormVersion}
                    {(selectedSubmission.CurrentLayer ?? selectedSubmission.CurrentApprovalLayer) > 0 && (
                      <> • Layer: <strong>{selectedSubmission.CurrentLayer || selectedSubmission.CurrentApprovalLayer}</strong></>
                    )}
                  </div>
                  {selectedCompany && (
                    <div style={{ marginTop: 4, fontSize: 12.5, color: C.purple, fontWeight: 600 }}>
                      Company: {selectedCompany}
                    </div>
                  )}
                </div>

                <div style={{ padding: 16, maxHeight: 500, overflow: "auto" }}>
                  {previewForm ? (
                    <div className="response-survey-preview">
                      <NativeFormView runtime={previewRuntime} />
                    </div>
                  ) : (
                    <div style={{ color: C.textMuted }}>Loading form preview...</div>
                  )}
                </div>

                {/* Matrix Tables — from child lists, fallback to _Html */}
                {Object.keys(matrixTables).length > 0 && (
                  <div style={{ padding: "0 16px 16px" }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: C.textSecond,
                        textTransform: "uppercase",
                        letterSpacing: "0.03em",
                        marginBottom: 12,
                      }}
                    >
                      Matrix tables
                    </div>
                    {Object.entries(matrixTables).map(([fieldName, entry]) => (
                      <div key={fieldName} style={{ marginBottom: 18 }}>
                        <div
                          style={{
                            fontSize: 11.5,
                            fontWeight: 600,
                            color: C.purple,
                            marginBottom: 4,
                          }}
                        >
                          {entry.title || fieldName}
                        </div>
                        <div
                          style={{
                            overflow: "auto",
                            borderRadius: 8,
                          }}
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(entry.html) }}
                        />
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                          {entry.rows.length} row{entry.rows.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {matrixLoading && (
                  <div style={{ padding: "0 16px 16px", color: C.textMuted, fontSize: 12.5 }}>Loading matrix data...</div>
                )}

                {selectedSubmission.RawJSON && (
                  <details style={{ padding: 16, background: C.bg }}>
                    <summary style={{ cursor: "pointer", color: C.textSecond, fontSize: 13.5 }}>
                      View raw data
                    </summary>
                    <pre
                      style={{
                        marginTop: 12,
                        padding: 12,
                        background: C.cardBg,
                        borderRadius: 8,
                        fontSize: 11.5,
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
          </Card>
        </div>
      </div>
    </div>
  );
}

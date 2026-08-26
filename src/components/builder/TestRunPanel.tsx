/**
 * TestRunPanel.tsx - shows a form's test runs and their checklists.
 *
 * Lists every `IsTest` row on the form's response list, newest first. Each
 * run's checklist comes from `TestRunLog`, the same trail the server writes
 * to via `record-test-run-step` / `recordTestRunStep`
 * (`api/_utils/testRunActions.ts`). The last step on that checklist — PDF
 * rendering — can only happen here, in the browser, because
 * `@react-pdf/renderer` (via `src/utils/generateFormPdf.ts`) has no server
 * equivalent.
 *
 * Deletion goes through `delete-test-runs`, which re-checks `IsTest` on the
 * server before touching anything — this panel's own `IsTest` filter is
 * a display convenience, never the security boundary.
 */
import { useCallback, useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { C } from "./constants";
import { acquireAccessTokenSilentOrRedirect } from "../../utils/authRecovery";
import { spGet, getFormConfigByTitle } from "../../utils/formBuilderSP";
import { isTestRow } from "../../utils/testRun";
import {
  parseTestRunTrail,
  orderedTestRunSteps,
  testRunOutcome,
  TEST_RUN_LOG_FIELD,
  type TestRunStep,
  type TestRunStepStatus,
} from "../../utils/testRunTrail";
import { REFERENCE_NO_FIELD } from "../../utils/referenceNumber";
import type { PdfFormData } from "../../utils/FormPdfDocument";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";

interface TestRunPanelProps {
  open: boolean;
  onClose: () => void;
  form: { Title: string; Slug?: string };
}

interface TestRunRow {
  id: string;
  fields: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueToText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

async function callTestRunAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch("/api/submit-form", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status}).`);
  return data;
}

async function getVersionSurveyJson(
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

const PDF_SYSTEM_FIELDS = new Set([
  "Id", "Title", "SubmittedBy", "SubmittedAt", "Status", "CurrentApprovalLayer",
  "FormVersion", "PublishKey", "FormID", "RawJSON", "CurrentLayer", "FormStatus",
  "EvaluationData", "WorkflowAssignmentData", "WorkflowEmailLog", "WorkflowEmailSchedule",
  "PDPAConsent", "PDPANoticeVersion", "PDPAConsentAt", "RetentionUntil",
  "Author", "Editor", "Created", "Modified", "ContentType", "PermMask",
  "SelectedBranch", "IsTest", "TestEmail", TEST_RUN_LOG_FIELD,
]);

/** Builds the PDF input for one test run's response row, for the browser-only render step. */
async function loadPdfDataForRow(
  token: string,
  listTitle: string,
  row: TestRunRow,
): Promise<PdfFormData> {
  const cfg = await getFormConfigByTitle(token, listTitle);
  if (!cfg) throw new Error("Could not find this form's configuration.");

  const respItem = await spGet(
    token,
    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${row.id})`,
  ) as Record<string, unknown>;

  const formVersion = valueToText(respItem.FormVersion) || valueToText((cfg as unknown as Record<string, unknown>).CurrentVersion) || "1.0";
  const publishKey = valueToText(respItem.PublishKey) || valueToText((cfg as unknown as Record<string, unknown>).CurrentPublishKey) || "";

  const rawSurvey = await getVersionSurveyJson(token, cfg.Title, formVersion, publishKey);
  if (!rawSurvey) throw new Error("Could not load this form's published schema.");
  const parsed = JSON.parse(rawSurvey);
  const surveyContent = parsed.surveyJson || parsed;
  const versionMeta = isRecord(parsed.meta) ? parsed.meta : {};

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(respItem)) {
    if (!PDF_SYSTEM_FIELDS.has(key) && !/^L\d+_/.test(key) && value !== null && value !== undefined) {
      data[key] = value;
    }
  }

  const { buildPdfLayerResults } = await import("../../utils/generateFormPdf");
  return {
    surveyJson: surveyContent as PdfFormData["surveyJson"],
    responseData: data,
    layerResults: buildPdfLayerResults(respItem, 10, parsed.layerConfig ?? cfg.LayerConfig),
    meta: {
      submittedBy: valueToText(respItem.SubmittedBy),
      submittedAt: valueToText(respItem.SubmittedAt),
      formTitle: listTitle,
      formVersion,
      formStatus: valueToText(respItem.FormStatus) || valueToText(respItem.Status),
      referenceNo: respItem[REFERENCE_NO_FIELD] ? String(respItem[REFERENCE_NO_FIELD]) : undefined,
    },
    isoStandards: typeof versionMeta.isoStandards === "string" ? versionMeta.isoStandards : undefined,
    logoUrl: typeof versionMeta.logoUrl === "string" && versionMeta.logoUrl.trim() ? versionMeta.logoUrl : "/logo-128.png",
    pdfConfig: isRecord(versionMeta.pdfConfig) ? versionMeta.pdfConfig as PdfFormData["pdfConfig"] : undefined,
    documentHeader: isRecord(versionMeta.documentHeader) ? versionMeta.documentHeader as PdfFormData["documentHeader"] : undefined,
  };
}

const STATUS_DOT: Record<TestRunStepStatus, { bg: string; fg: string; symbol: string }> = {
  pass: { bg: C.greenPale, fg: C.green, symbol: "✓" },
  warn: { bg: C.amberPale, fg: C.amber, symbol: "!" },
  fail: { bg: C.redPale, fg: C.red, symbol: "✕" },
  skip: { bg: C.offWhite, fg: C.textMuted, symbol: "–" },
  pending: { bg: C.purplePale, fg: C.purple, symbol: "" },
};

function StepBadge({ status }: { status: TestRunStepStatus }) {
  const style = STATUS_DOT[status];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 18, height: 18, borderRadius: "50%", background: style.bg, color: style.fg,
        fontSize: 11, fontWeight: 700, flex: "none",
      }}
    >
      {status === "pending" ? <Spinner size={10} color={style.fg} /> : style.symbol}
    </span>
  );
}

function Spinner({ size = 14, color = C.purple }: { size?: number; color?: string }) {
  return (
    <span
      style={{
        display: "inline-block", width: size, height: size,
        border: `2px solid ${color}33`, borderTopColor: color, borderRadius: "50%",
        animation: "bx-spin 0.8s linear infinite",
      }}
    />
  );
}

const OUTCOME_LABEL: Record<ReturnType<typeof testRunOutcome>, { text: string; bg: string; fg: string }> = {
  passed: { text: "Passed", bg: C.greenPale, fg: C.green },
  failed: { text: "Failed", bg: C.redPale, fg: C.red },
  running: { text: "Running", bg: C.purplePale, fg: C.purple },
};

export default function TestRunPanel({ open, onClose, form }: TestRunPanelProps) {
  const { instance, accounts } = useMsal();
  const [rows, setRows] = useState<TestRunRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [pdfErrorById, setPdfErrorById] = useState<Record<string, string>>({});
  /** True if the listing stopped before exhausting every page — shown so "N test runs" never silently understates what's really there. */
  const [rowsTruncated, setRowsTruncated] = useState(false);

  const getDelegatedToken = useCallback(async (): Promise<string> => {
    const origin = window.location.origin;
    return acquireAccessTokenSilentOrRedirect(instance, {
      scopes: [`${origin}/AllSites.Manage`],
      account: accounts[0],
    });
  }, [instance, accounts]);

  // Pages through every page of the response list's IsTest rows rather than
  // stopping at the first one — a `$top` cap here would make the panel quietly
  // under-report how many test runs exist on a busy list. `PAGE_SAFETY_CAP` is
  // a last-resort guard against a runaway loop, not a normal ceiling: if it is
  // ever hit, the panel says so instead of pretending the list shown is complete.
  const loadRows = useCallback(async () => {
    if (!form.Title) return;
    setLoading(true);
    setError("");
    setRowsTruncated(false);
    try {
      const delegatedToken = await getDelegatedToken();
      const PAGE_SIZE = 500;
      const PAGE_SAFETY_CAP = 40; // 40 * 500 = 20,000 rows before we give up and say so
      const items: TestRunRow[] = [];
      let nextUrl: string | null =
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(form.Title)}')/items?$filter=IsTest eq 'true'&$orderby=Id desc&$top=${PAGE_SIZE}`;
      let truncated = false;
      for (let page = 0; nextUrl && page < PAGE_SAFETY_CAP; page++) {
        const data = await spGet(delegatedToken, nextUrl) as { value?: Record<string, unknown>[]; "odata.nextLink"?: string };
        for (const fields of data.value || []) {
          const id = String(fields.Id ?? "");
          if (id && isTestRow(fields)) items.push({ id, fields });
        }
        nextUrl = data["odata.nextLink"] || null;
        if (nextUrl && page === PAGE_SAFETY_CAP - 1) truncated = true;
      }
      setRows(items);
      setRowsTruncated(truncated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load test runs.");
    } finally {
      setLoading(false);
    }
  }, [form.Title, getDelegatedToken]);

  useEffect(() => {
    if (open) loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.Title]);

  if (!open) return null;

  const deleteOne = async (itemId: string) => {
    if (!form.Slug) { setError("This form has no published slug yet — publish it before managing test runs."); return; }
    if (!window.confirm("Delete this test run? This cannot be undone.")) return;
    setBusyRowId(itemId);
    setError("");
    try {
      const delegatedToken = await getDelegatedToken();
      await callTestRunAction({ action: "delete-test-runs", slug: form.Slug, itemId, delegatedToken });
      setRows((prev) => prev.filter((row) => row.id !== itemId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete this test run.");
    } finally {
      setBusyRowId(null);
    }
  };

  const clearAll = async () => {
    if (rows.length === 0) return;
    if (!form.Slug) { setError("This form has no published slug yet — publish it before managing test runs."); return; }
    const countLabel = rowsTruncated ? `at least ${rows.length}` : String(rows.length);
    if (!window.confirm(`Delete all ${countLabel} test run(s) for this form? This cannot be undone.`)) return;
    setBusyAll(true);
    setError("");
    try {
      const delegatedToken = await getDelegatedToken();
      // The server pages through the whole list (see api/_utils/testRunActions.ts),
      // so this deletes every IsTest row regardless of what this panel had
      // managed to list — report what it actually says it deleted, honestly.
      const result = await callTestRunAction({ action: "delete-test-runs", slug: form.Slug, delegatedToken });
      const deletedIds = Array.isArray(result.deleted) ? (result.deleted as unknown[]).map(String) : [];
      setRows((prev) => prev.filter((row) => !deletedIds.includes(row.id)));
      setRowsTruncated(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear test runs.");
    } finally {
      setBusyAll(false);
    }
  };

  const renderPdf = async (row: TestRunRow) => {
    if (!form.Slug) {
      setPdfErrorById((prev) => ({ ...prev, [row.id]: "This form has no published slug yet — publish it before recording this step." }));
      return;
    }
    setPdfBusyId(row.id);
    setPdfErrorById((prev) => ({ ...prev, [row.id]: "" }));
    try {
      const delegatedToken = await getDelegatedToken();
      const pdfData = await loadPdfDataForRow(delegatedToken, form.Title, row);
      let bytes = 0;
      const { generateAndStorePdf } = await import("../../utils/generateFormPdf");
      const pdfUrl = await generateAndStorePdf(delegatedToken, form.Title, Number(row.id), pdfData, {
        onGeneratedBlob: (blob) => { bytes = blob.size; },
      });
      window.open(pdfUrl, "_blank", "noopener");
      const step: Omit<TestRunStep, "at"> = { step: "pdf", label: "PDF rendered", status: "pass", order: 1100, detail: `${bytes} bytes` };
      await callTestRunAction({ action: "record-test-run-step", slug: form.Slug, itemId: row.id, delegatedToken, step });
      setRows((prev) => prev.map((candidate) => (
        candidate.id === row.id
          ? { ...candidate, fields: { ...candidate.fields, [TEST_RUN_LOG_FIELD]: JSON.stringify({ ...parseTestRunTrail(candidate.fields[TEST_RUN_LOG_FIELD]), pdf: { ...step, at: new Date().toISOString() } }) } }
          : candidate
      )));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not render the PDF.";
      setPdfErrorById((prev) => ({ ...prev, [row.id]: message }));
      try {
        const delegatedToken = await getDelegatedToken();
        const step: Omit<TestRunStep, "at"> = { step: "pdf", label: "PDF rendered", status: "fail", order: 1100, detail: message };
        await callTestRunAction({ action: "record-test-run-step", slug: form.Slug, itemId: row.id, delegatedToken, step });
      } catch {
        // Reporting the failure is best-effort; the inline message above already tells the builder.
      }
    } finally {
      setPdfBusyId(null);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(17,24,39,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <style>{"@keyframes bx-spin { to { transform: rotate(360deg); } }"}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.white, borderRadius: 10, width: 640, maxWidth: "100%", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 48px rgba(0,0,0,0.25)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px 12px" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary }}>Test runs</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Rehearsals of "{form.Title}", newest first.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={clearAll}
              disabled={busyAll || rows.length === 0}
              style={{ height: 30, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 7, background: C.white, color: C.red, fontSize: 12, fontWeight: 600, cursor: busyAll || rows.length === 0 ? "default" : "pointer", opacity: busyAll || rows.length === 0 ? 0.5 : 1 }}
            >
              {busyAll ? "Clearing…" : "Clear all test runs"}
            </button>
            <button
              onClick={onClose}
              style={{ height: 30, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 7, background: C.white, color: C.textSecond, fontSize: 12, cursor: "pointer" }}
            >
              Close
            </button>
          </div>
        </div>

        {error && (
          <div style={{ margin: "0 22px 10px", fontSize: 12, color: C.red, background: C.redPale, borderRadius: 7, padding: "8px 10px", lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        {!loading && rowsTruncated && (
          <div style={{ margin: "0 22px 10px", fontSize: 12, color: C.amber, background: C.amberPale, borderRadius: 7, padding: "8px 10px", lineHeight: 1.5 }}>
            Showing the first {rows.length} test runs — this form has more than the panel could list. "Clear all test runs" still deletes every one of them.
          </div>
        )}

        <div style={{ overflowY: "auto", padding: "0 22px 20px", flex: 1 }}>
          {loading && <div style={{ fontSize: 12, color: C.textMuted, padding: "16px 0" }}>Loading test runs…</div>}
          {!loading && rows.length === 0 && (
            <div style={{ fontSize: 12, color: C.textMuted, padding: "16px 0" }}>No test runs yet. Start one from "Test workflow" above.</div>
          )}

          {rows.map((row) => {
            const trail = parseTestRunTrail(row.fields[TEST_RUN_LOG_FIELD]);
            const steps = orderedTestRunSteps(trail);
            const outcome = testRunOutcome(trail);
            const outcomeStyle = OUTCOME_LABEL[outcome];
            const expanded = expandedId === row.id;
            const reference = valueToText(row.fields[REFERENCE_NO_FIELD]) || `#${row.id}`;
            const submittedAt = valueToText(row.fields.SubmittedAt);
            const stage = valueToText(row.fields.FormStatus) || valueToText(row.fields.Status) || "Unknown";
            const stepsExcludingPdf = steps.filter((step) => step.step !== "pdf");
            const runFinished = stepsExcludingPdf.length > 0 && !stepsExcludingPdf.some((step) => step.status === "pending");
            const pdfStep = trail.pdf;

            return (
              <div key={row.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 10, overflow: "hidden" }}>
                <div
                  onClick={() => setExpandedId(expanded ? null : row.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" }}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: outcomeStyle.bg, color: outcomeStyle.fg, flex: "none" }}>
                    {outcomeStyle.text}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{reference}</div>
                    <div style={{ fontSize: 11, color: C.textMuted }}>
                      {submittedAt ? new Date(submittedAt).toLocaleString() : "Unknown time"} · {stage}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteOne(row.id); }}
                    disabled={busyRowId === row.id}
                    style={{ height: 26, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.white, color: C.red, fontSize: 11, fontWeight: 600, cursor: busyRowId === row.id ? "default" : "pointer", opacity: busyRowId === row.id ? 0.5 : 1 }}
                  >
                    {busyRowId === row.id ? "Deleting…" : "Delete"}
                  </button>
                </div>

                {expanded && (
                  <div style={{ borderTop: `1px solid ${C.borderLight}`, padding: "10px 14px 14px", background: C.offWhite }}>
                    {steps.map((step) => (
                      <div key={step.step} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0" }}>
                        <StepBadge status={step.status} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: C.textPrimary, fontWeight: 500 }}>{step.label}</div>
                          {step.detail && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>{step.detail}</div>}
                        </div>
                      </div>
                    ))}

                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
                      <button
                        onClick={() => renderPdf(row)}
                        disabled={!runFinished || pdfBusyId === row.id}
                        title={runFinished ? "Render this run's submission PDF" : "Finish the workflow before rendering the PDF"}
                        style={{
                          height: 28, padding: "0 12px", border: "none", borderRadius: 6,
                          background: runFinished ? C.purple : C.border, color: C.white, fontSize: 11, fontWeight: 600,
                          cursor: !runFinished || pdfBusyId === row.id ? "default" : "pointer",
                          opacity: pdfBusyId === row.id ? 0.7 : 1,
                          display: "flex", alignItems: "center", gap: 6,
                        }}
                      >
                        {pdfBusyId === row.id && <Spinner size={11} color={C.white} />}
                        {pdfBusyId === row.id ? "Rendering…" : pdfStep ? "Render PDF again" : "Render PDF"}
                      </button>
                      {pdfErrorById[row.id] && (
                        <span style={{ fontSize: 11, color: C.red }}>{pdfErrorById[row.id]}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * DynamicFormPage.tsx - Public form renderer
 * Route: /form/:formId
 */
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import NativeFormView from "../native/NativeForm";
import { parseForm, type NativeForm } from "../native/schema";
import { useNativeForm } from "../native/useNativeForm";
import "../native/native-form.css";

import { getLatestFormBySlug, getFormVersion, spGet, spPost, spPatch, spPatchUrlField, triggerApprovalNotification, getSharePointChoices, getFilteredListChoices, getScopedListRows, uploadSignatureImage, getFormConfigByTitle, writeMatrixChildItems, ensureMatrixChildList, readMatrixChildItems, uploadFileToDocLib, ensureDocLibrary, ensurePdpaColumns, ensureWorkflowColumns, toAbsoluteSharePointUrl, getSharePointColumnKeyResolver } from "../utils/formBuilderSP";
import { SharePointHttpError, isSharePointAccessDeniedError } from "../utils/sharepointClient";
import type { MatrixColumnDef } from "../utils/formBuilderSP";
import type { DocumentControlHeader, LayerConfig, LayerConfigItem } from "../types";
import { planLayerRouting } from "../utils/layerRoutingPlan";
import { SP_LAYER_STATUS, SP_FORM_STATUS } from "../utils/statusConstants";
import { getDepartmentApproverLookupConfig } from "../utils/departmentApproverLookup";
import { resolveEvaluationSubmitterRouting } from "../utils/evaluationSubmitterRouting";
import { hasEvaluationLayer, readHarvestConfig } from "../utils/directoryHarvest";
import { resolveScopedChoices } from "../utils/orgDirectory";
import { forEachSurveyElement } from "../utils/surveyWalk";
import { harvestSubmitter } from "../utils/directoryHarvestWrite";
import { loginRequest } from "../auth/msalConfig";
import { clearStoredAuthDecision } from "../utils/authDecision";
import { acquireAccessTokenSilentOrRedirect, fetchWithAuthRecovery } from "../utils/authRecovery";
import IosShareIcon from "@mui/icons-material/IosShare";
import Logo from "../components/Logo";
import type { PdfFormData } from "../utils/FormPdfDocument";
import { getPdpaNoticeVersion, getPdpaRetentionUntil } from "../utils/pdpa";
import { usePdpaLocale } from "../hooks/usePdpaLocale";
import PdpaLanguageToggle from "../components/PdpaLanguageToggle";
import { PREFILLED_QR_PARAM, cloneAndApplyPrefilledQr, decodePrefilledQrPayload } from "../utils/prefilledQr";

/**
 * What `/api/form-config` discloses about an instance link. Deliberately less
 * than the stored row — the endpoint is public. See api/_utils/formInstance.ts.
 */
interface PublicFormInstance {
  id: string;
  title: string;
  state: "open" | "closed" | "expired";
  expiresAt: string;
  requireSignIn: boolean;
  prefill: Record<string, unknown>;
  lockedFields: string[];
}
import { toSharePointMalaysiaDateTime } from "../utils/sharepointDateTime";
import { buildWorkflowReviewLink } from "../utils/workflowLink";
import { foldOtherAnswers } from "../utils/surveyOtherAnswers";
import { parseReferenceNumberConfig, REFERENCE_NO_FIELD } from "../utils/referenceNumber";
import { parseValidEmailList, writeLayerRecipientFields } from "../utils/layerRecipients";
import { expandLayerDistributionList } from "../utils/expandLayerGroup";
import {
  DirectoryGapError,
  isDeferredAssignee,
  resolveLayerAssignee as resolveSharedLayerAssignee,
  type ResolutionContext,
  type ResolvableLayer,
  type ResolvedLayerActors,
} from "../utils/resolveAssignee";
import { createApprovalDirectoryReader } from "../utils/approvalDirectory";
import { NEEDS_ROUTING_LAYER_STATUS } from "../utils/submissionLifecycle";
import { sampleAnswersFor } from "../utils/testRunLaunch";
import { getMultiChoiceFieldNames } from "../utils/multiChoiceFields";
import { getTabularFields, rowsToHtml, type MatrixRow, type MatrixColumn } from "../utils/matrixData";
import { readStoredGuestSession } from "../utils/guestMemberService";
import { editorial } from "../theme/editorial";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";
const CONFIGURED_SENDER_EMAIL = (
  import.meta.env.VITE_HR_FORM_EMAIL_FROM_ADDRESS ||
  import.meta.env.VITE_EMAIL_FROM_ADDRESS ||
  ""
).trim().toLowerCase();
// Paper/manual sentinel mailbox — a layer assigned to this address is handled on
// paper (no online reviewer). Kept separate from the email "from" mailbox above.
const CONFIGURED_MANUAL_PAPER_EMAIL = (
  import.meta.env.VITE_HR_FORM_MANUAL_PAPER_ADDRESS || ""
).trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Columns a submission tolerates being absent. ReferenceNo is here because a
// list provisioned before reference numbers existed has no such column, and a
// respondent should not be blocked on a schema gap only an admin can close.
const OPTIONAL_SIGNED_IN_SUBMISSION_COLUMNS = new Set(["FormStatus", "CurrentLayer", REFERENCE_NO_FIELD]);
// The multi-assignee columns are the same story: a list provisioned before a
// layer could have several actors has none of them, and the submission still
// works off L{n}_Email alone. Anchored to the L{n}_ prefix so a form field that
// merely ends in "_Emails" is still reported as a genuine schema gap.
const OPTIONAL_LAYER_COLUMN_RE = /^(L\d+_(Emails|NotifyEmails|ActedBy)|RoutingNotes)$/;

function isOptionalSignedInSubmissionColumn(fieldName: string): boolean {
  return (
    OPTIONAL_SIGNED_IN_SUBMISSION_COLUMNS.has(fieldName) ||
    OPTIONAL_LAYER_COLUMN_RE.test(fieldName) ||
    fieldName.endsWith("_Response") ||
    fieldName.endsWith("_Json") ||
    fieldName.endsWith("_RowIds")
  );
}

function mapBodyToSharePointColumnKeys(
  body: Record<string, unknown>,
  resolveColumnKey: (fieldName: string) => string | null,
  listTitle: string,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [fieldName, value] of Object.entries(body)) {
    const columnKey = resolveColumnKey(fieldName);
    if (!columnKey) {
      if (isOptionalSignedInSubmissionColumn(fieldName)) continue;
      throw new Error(`The form field "${fieldName}" is not provisioned in "${listTitle}". Please republish the form before trying again.`);
    }
    mapped[columnKey] = value;
  }
  return mapped;
}

/**
 * Claims this submission's reference from the server.
 *
 * Signed-in submissions write their own list item, so without this call two
 * people submitting at once would compute the same "next" number. `/api/next-reference`
 * is the only thing that hands numbers out; guests never come through here
 * because `api/submit-form.ts` allocates on their behalf.
 *
 * Failure is propagated rather than swallowed: the reference is the ID the
 * record is filed and searched under, so a submission saved without one is
 * worse than a submission the respondent is asked to retry.
 */
async function claimReferenceNumber(listTitle: string): Promise<string> {
  const res = await fetch("/api/next-reference", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
    },
    body: JSON.stringify({ listTitle }),
  });
  const data = await res.json().catch(() => ({})) as { enabled?: boolean; referenceNo?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Could not assign a reference number (${res.status}).`);
  }
  return data.enabled && typeof data.referenceNo === "string" ? data.referenceNo : "";
}

function documentHeaderFromMeta(meta: Record<string, unknown> | undefined, formId: string, formVersion: string): Required<DocumentControlHeader> {
  const raw = meta?.documentHeader;
  const header = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as DocumentControlHeader
    : {};
  return {
    documentNumber: header.documentNumber || formId,
    issueNumber: header.issueNumber || "",
    effectiveDate: header.effectiveDate || "",
    revisionNumber: header.revisionNumber || formVersion,
    revisionDate: header.revisionDate || "",
  };
}

function isExpiredPublishProfile(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "" && Date.parse(value) <= Date.now();
}

type LoadedFormData = {
  formConfig: Record<string, unknown>;
  surveyJson: Record<string, unknown>;
  meta: Record<string, unknown>;
};

/**
 * JSON.stringify with object keys emitted in sorted order, so two structurally
 * identical objects built by different code paths compare equal. The public
 * endpoint and the direct SharePoint read assemble formConfig in a different key
 * order, which a plain stringify would report as a difference.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function loadedFormDataEquals(a: LoadedFormData, b: LoadedFormData): boolean {
  try {
    return stableStringify(a) === stableStringify(b);
  } catch {
    return false; // circular or otherwise unserialisable — treat as changed
  }
}

/**
 * A reload normally resolves to exactly the same published form — a guest read
 * followed by the signed-in read once MSAL settles, say. Swapping in an equal but
 * newly allocated object there re-derives the document control header and rebuilds the
 * SurveyJS model, so the header blanks out and anything already typed is lost. Keep
 * the existing object unless the content actually changed.
 */
function applyLoadedFormData(
  setFormData: Dispatch<SetStateAction<LoadedFormData | null>>,
  next: LoadedFormData,
): void {
  setFormData(prev => (prev && loadedFormDataEquals(prev, next) ? prev : next));
}

function submittedValueToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["email", "Email", "value", "Value", "text", "Title"]) {
      const next = record[key];
      if (typeof next === "string" && next.trim()) return next.trim();
    }
  }
  return "";
}

function collectSharePointDateTimeFieldNames(surveyJson: unknown): Set<string> {
  const names = new Set<string>();
  const root = surveyJson && typeof surveyJson === "object" && !Array.isArray(surveyJson)
    ? surveyJson as Record<string, unknown>
    : {};
  const pages = Array.isArray(root.pages) ? root.pages : [];

  const walk = (elements: unknown): void => {
    if (!Array.isArray(elements)) return;
    for (const element of elements) {
      if (!element || typeof element !== "object" || Array.isArray(element)) continue;
      const record = element as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      const type = typeof record.type === "string" ? record.type : "";
      const inputType = typeof record.inputType === "string" ? record.inputType : "";
      if (name && (type === "date" || type === "datetime" || (type === "text" && (inputType === "date" || inputType === "datetime-local")))) {
        names.add(name);
      }
      walk(record.elements);
      walk(record.templateElements);
    }
  };

  for (const page of pages) {
    if (page && typeof page === "object" && !Array.isArray(page)) {
      walk((page as Record<string, unknown>).elements);
    }
  }
  return names;
}

function normalizeSharePointDateTimeFields(
  raw: Record<string, unknown>,
  surveyJson: unknown,
): void {
  for (const fieldName of collectSharePointDateTimeFieldNames(surveyJson)) {
    if (!(fieldName in raw)) continue;
    const normalized = toSharePointMalaysiaDateTime(raw[fieldName]);
    if (normalized) raw[fieldName] = normalized;
  }
}

interface UploadCandidate {
  content: string;
  name?: string;
}

interface UrlFieldPatch {
  fieldName: string;
  url: string;
  description: string;
}

function uploadCandidateFromValue(value: unknown): UploadCandidate | null {
  if (typeof value === "string" && value.trim().startsWith("data:")) {
    return { content: value.trim() };
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const content = record.content ?? record.data ?? record.fileContent;
    if (typeof content === "string" && content.trim().startsWith("data:")) {
      return {
        content: content.trim(),
        name: submittedValueToString(record.name) || submittedValueToString(record.fileName) || undefined,
      };
    }
  }
  return null;
}

function uploadFileName(fieldName: string, candidate: UploadCandidate, index?: number): string {
  const originalName = candidate.name?.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  if (originalName) return originalName;
  const mimeMatch = candidate.content.match(/^data:([\w/+-]+);/);
  const ext = (mimeMatch ? mimeMatch[1].split('/').pop() || 'bin' : 'bin').replace(/[^a-zA-Z0-9]/g, '') || 'bin';
  const suffix = index === undefined ? "" : `_${index}`;
  return `${fieldName}_${Date.now()}${suffix}.${ext}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      const commaIndex = value.indexOf(",");
      resolve(commaIndex >= 0 ? value.slice(commaIndex + 1) : value);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read generated PDF."));
    reader.readAsDataURL(blob);
  });
}

function safePdfFileName(title: string, id: number): string {
  const safeTitle = title.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "manual-workflow";
  return `${safeTitle}_submission_${id}_manual.pdf`;
}

function manualPaperStatusForLayer(layer: LayerConfigItem): string {
  return layer.type === "evaluation" ? "Manual Evaluation Required" : "Manual Approval Required";
}

function shouldUseManualPaperForSender(layer: LayerConfigItem, email: string): boolean {
  return layer.manualPaperWhenSenderEmail !== false &&
    !!CONFIGURED_MANUAL_PAPER_EMAIL &&
    email.trim().toLowerCase() === CONFIGURED_MANUAL_PAPER_EMAIL;
}

async function resolveDepartmentApproverEmail(
  token: string,
  layer: LayerConfigItem,
  submittedData: Record<string, unknown>,
): Promise<{ email: string; name: string }> {
  // Only ever reached as the shared resolver's department-approver port.
  if (layer.assignee.type !== "department-approver") {
    throw new Error(`Layer ${layer.layerNumber} is not a department approver layer.`);
  }

  const label = layer.title || `Layer ${layer.layerNumber}`;
  const departmentField = layer.assignee.value.trim();
  const department = submittedValueToString(submittedData[departmentField]);
  if (!departmentField) {
    throw new Error(`${label} needs a department field before this form can be submitted.`);
  }
  if (!department) {
    throw new DirectoryGapError(`${label} has no department to look an approver up with.`);
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

  // A directory that cannot be read is a directory with no answer: park, so a
  // missing list or a transient SharePoint failure never costs somebody their form.
  let data: { value?: Record<string, unknown>[] };
  try {
    data = await spGet(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(config.listName)}')/items?${params.toString()}`,
    ) as { value?: Record<string, unknown>[] };
  } catch (error) {
    throw new DirectoryGapError(
      `${label} could not read the "${config.listName}" list: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const matches = data.value ?? [];
  if (matches.length === 0) {
    throw new DirectoryGapError(`${label} could not find ${config.roleValue || "an approver"} for department "${department}".`);
  }
  if (matches.length > 1) {
    throw new DirectoryGapError(`${label} found more than one ${config.roleValue || "approver"} for department "${department}".`);
  }

  const email = submittedValueToString(matches[0][config.emailColumn]);
  if (layer.authMode === "365" && !EMAIL_RE.test(email)) {
    throw new DirectoryGapError(`${label} found an invalid approver email for department "${department}".`);
  }

  return {
    email,
    name: submittedValueToString(matches[0][config.nameColumn]),
  };
}

/**
 * Resolves one layer's actors through the shared resolver, supplying the
 * browser's ports: SharePoint REST for the directory, and /api/expand-group for
 * distribution lists, which a delegated token cannot read directly. The shared
 * function reports failures; a submission needs an actor, so they are rethrown.
 */
async function resolveLayerAssignee(
  layer: LayerConfigItem,
  submittedData: Record<string, unknown>,
  token: string | null,
  slug: string,
  context: ResolutionContext,
): Promise<ResolvedLayerActors> {
  const directory = token ? createApprovalDirectoryReader(token) : null;
  const resolved = await resolveSharedLayerAssignee(
    layer as ResolvableLayer,
    submittedData,
    {
      lookupDepartmentApprover: (target, data) => {
        if (!token) {
          throw new Error("Department approver lookup needs a SharePoint token or server-side submission.");
        }
        return resolveDepartmentApproverEmail(token, target as unknown as LayerConfigItem, data);
      },
      expandDistributionList: (target) => expandLayerDistributionList(slug, target.layerNumber),
      // A guest has no SharePoint token to read the directory with, so chain
      // layers park rather than resolving. That is the correct outcome: a
      // public respondent has no identity to route from either.
      ...(directory ? { lookupPerson: directory.lookupPerson, lookupRoleHolder: directory.lookupRoleHolder } : {}),
    },
    { blockedSuffix: "before this form can be submitted.", context },
  );
  if (resolved.error) throw new Error(resolved.error);
  return resolved;
}
const APP_FONT_FAMILY = "'Inter','Segoe UI','Aptos','Helvetica Neue',Arial,sans-serif";

/**
 * The native engine needs no registration step.
 *
 * The SurveyJS build opened here by teaching the library three things it did
 * not ship with: a signature question, a `now()` expression function, and an
 * `autocapitalize` property on text questions. The native engine reads all
 * three straight off the published JSON — signatures are a field kind,
 * `now()` a default-value marker, `autocapitalize` a parsed property — so the
 * form is drawn from what was published rather than from global side effects
 * that had to run before the first render.
 */

// Theme tokens
const LIGHT = {
  purple: editorial.ink, purpleLight: editorial.muted, purplePale: editorial.skySoft, purpleMid: editorial.sky,
  purpleDark: editorial.black, bg: editorial.paper, cardBg: editorial.white, offWhite: editorial.paper, border: editorial.border,
  textPrimary: editorial.ink, textSecond: editorial.muted, textMuted: editorial.softMuted,
  green: editorial.success, greenPale: editorial.successSoft, greenBorder: editorial.success,
  red: editorial.error, redPale: editorial.errorSoft, amber: editorial.accentText, amberPale: editorial.accentSoft,
  shadow: "none",
  shadowLg: "0 18px 42px rgba(16,16,16,0.14)", shadowFab: "0 10px 28px rgba(16,16,16,0.10)",
};

const DARK = {
  ...LIGHT, bg: "#101923", cardBg: "#17212B", offWhite: "#111B25", border: "#2F3B47",
  textPrimary: editorial.paperSoft, textSecond: "#CBD5E1", textMuted: "#94A3B8",
  greenPale: "#052e16", greenBorder: editorial.success, redPale: "#3b0707", amberPale: "#2d1b00",
  shadow: "0 1px 3px rgba(0,0,0,.4),0 4px 16px rgba(0,0,0,.3)",
  shadowLg: "0 8px 40px rgba(0,0,0,.5)", shadowFab: "0 4px 20px rgba(0,0,0,.4)",
};

type FormTheme = { [K in keyof typeof LIGHT]: string };

const globalCss = (t: FormTheme) => `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;font-family:${APP_FONT_FAMILY}!important}
  body{font-family:${APP_FONT_FAMILY};background:${t.bg};color:${t.textPrimary};transition:background .3s,color .3s}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  @keyframes dfpFade{from{opacity:0}to{opacity:1}}
  /* The tick is drawn, not faded in: the stroke unrolls from nothing to its
     full length, which is what makes it read as a confirmation rather than as
     another static icon. */
  @keyframes dfpDraw{to{stroke-dashoffset:0}}
  @keyframes dfpPop{0%{transform:scale(.55);opacity:0}55%{transform:scale(1.07);opacity:1}100%{transform:scale(1);opacity:1}}
  @keyframes dfpRipple{0%{transform:scale(.85);opacity:.45}100%{transform:scale(1.65);opacity:0}}
  .dfp-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(16,25,35,.55);backdrop-filter:blur(4px);animation:dfpFade .2s ease}
  .dfp-overlay-card{background:${t.cardBg};border:1px solid ${t.border};border-radius:12px;box-shadow:${t.shadowLg};padding:34px 30px;max-width:360px;width:100%;text-align:center;animation:fadeUp .25s ease}
  @media(prefers-reduced-motion:reduce){
    .dfp-check circle,.dfp-check path{animation:none!important;stroke-dashoffset:0!important}
    .dfp-check-disc,.dfp-check-ripple,.dfp-overlay,.dfp-overlay-card{animation:none!important}
    .dfp-check-ripple{display:none}
  }
  .dfp-header{flex-wrap:nowrap}
  /* The form already sits inside the page's own content column, which sets the
     width and the side padding — so the shell keeps only its vertical rhythm
     and lets the fields line up with everything above and below them. */
  .dfp-survey-wrap .nf-shell{max-width:100%;padding:0 0 8px}
  .dfp-banner-logo img{max-height:48px!important}
  /* The document control block is the banner row's flexible half, sitting to the
     right of the logo rather than in a full-width band of its own. */
  .dfp-doc-control{flex:1;min-width:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));background:${t.cardBg}}
  .dfp-doc-cell{min-height:42px;padding:7px 8px;border-right:1px solid ${t.border};display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px;text-align:center;font-size:12px;color:${t.textPrimary};line-height:1.35}
  .dfp-doc-cell:last-child{border-right:none}
  .dfp-doc-label{font-weight:700}
  .dfp-doc-value{font-weight:600;color:${t.textSecond}}
  @media(max-width:1024px){
    .dfp-doc-cell{font-size:11px;padding:6px}
  }
  @media(max-width:768px){
    .dfp-banner-logo{width:116px!important}
    .dfp-banner-row{flex-direction:column!important}
    .dfp-banner-logo{border-right:none!important;border-bottom:1px solid ${t.border};padding:10px 12px!important;width:100%!important;min-height:64px}
    .dfp-banner-logo img{max-height:40px!important}
    .dfp-doc-control{grid-template-columns:1fr}
    .dfp-doc-cell{border-right:none;border-bottom:1px solid ${t.border};justify-content:flex-start;text-align:left;padding:8px 12px}
    .dfp-doc-cell:last-child{border-bottom:none}
  }
  @media(max-width:640px){
    .dfp-header{padding:0 12px!important;min-height:48px!important}
    .dfp-header-left{gap:6px!important}
    .dfp-title{font-size:13px!important;max-width:140px}
    .dfp-user-name{display:none}
    .dfp-badge{font-size:9px!important;padding:1px 7px!important}
    .dfp-header-right{gap:6px!important}
    .dfp-version{display:none}
    .dfp-content{padding:20px 16px 72px!important}
  }
  @media(max-width:480px){
    .dfp-title{max-width:100px}
    .dfp-banner-logo img{max-height:34px!important}
  }
  ::-webkit-scrollbar{width:5px}
  ::-webkit-scrollbar-thumb{background:${t.purpleMid};border-radius:10px}
`;

const Spinner = ({ size = 30, t }: { size?: number; t: FormTheme }) => (
  <div style={{ width: size, height: size, border: `2.5px solid ${t.purpleMid}`, borderTop: `2.5px solid ${t.purple}`, borderRadius: "50%", animation: "spin .85s linear infinite", flexShrink: 0 }} />
);

const MsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="6.5" height="6.5" fill="#F25022" />
    <rect x="8.5" y="1" width="6.5" height="6.5" fill="#7FBA00" />
    <rect x="1" y="8.5" width="6.5" height="6.5" fill="#00A4EF" />
    <rect x="8.5" y="8.5" width="6.5" height="6.5" fill="#FFB900" />
  </svg>
);

const ScrollProgress = ({ t }: { t: FormTheme }) => {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const fn = () => {
      const el = document.documentElement;
      const total = el.scrollHeight - el.clientHeight;
      setPct(total > 0 ? Math.min(100, (el.scrollTop / total) * 100) : 0);
    };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 9999, pointerEvents: "none" }}>
      {/* Scaled rather than widened: this updates on every scroll event, and
          animating `width` there relayouts the page on each one. Same fix the
          native engine's progress meter carries. */}
      <div style={{ height: "100%", width: "100%", transform: `scaleX(${pct / 100})`, transformOrigin: "left center", background: `linear-gradient(90deg,${t.purple},${t.purpleLight})`, transition: "transform .1s linear", borderRadius: "0 2px 2px 0" }} />
    </div>
  );
};

/**
 * The confirmation mark: a ring and a tick that draw themselves once, over a
 * disc that pops in and a ripple that fades out. Drawn inline rather than
 * loaded as a GIF so it stays sharp at any size, follows the theme's green,
 * and needs no network request on the one screen that must never look broken.
 */
const SuccessCheck = ({ t }: { t: FormTheme }) => (
  <div className="dfp-check" aria-hidden="true" style={{ position: "relative", width: 96, height: 96, margin: "0 auto 22px" }}>
    <div className="dfp-check-ripple" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: t.green, opacity: 0, animation: "dfpRipple .9s .25s ease-out forwards" }} />
    <div className="dfp-check-disc" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: t.greenPale, animation: "dfpPop .45s cubic-bezier(.34,1.56,.64,1) forwards" }} />
    <svg viewBox="0 0 52 52" width="96" height="96" style={{ position: "relative", display: "block" }}>
      <circle cx="26" cy="26" r="23" fill="none" stroke={t.green} strokeWidth="2.4" strokeDasharray="145" strokeDashoffset="145" style={{ animation: "dfpDraw .55s cubic-bezier(.65,0,.45,1) forwards" }} />
      <path d="M15.5 26.8 L22.8 34 L36.5 19.4" fill="none" stroke={t.green} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="42" strokeDashoffset="42" style={{ animation: "dfpDraw .38s .5s cubic-bezier(.65,0,.45,1) forwards" }} />
    </svg>
  </div>
);

/**
 * The whole page is blocked while the submission is in flight. A banner under
 * the button was too easy to miss on a long form — the respondent could scroll
 * away, press Submit again, or close the tab mid-send. This takes over the
 * screen, says plainly not to close it, and leaves when the answer comes back.
 */
const SubmittingOverlay = ({ t, hasUploads }: { t: FormTheme; hasUploads: boolean }) => (
  <div className="dfp-overlay" role="alertdialog" aria-modal="true" aria-busy="true" aria-live="assertive" aria-label="Submitting your response">
    <div className="dfp-overlay-card">
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}><Spinner size={42} t={t} /></div>
      <div style={{ fontSize: 16, fontWeight: 700, color: t.textPrimary, marginBottom: 8 }}>Submitting your response</div>
      <div style={{ fontSize: 13, lineHeight: 1.7, color: t.textSecond }}>
        {/* The wait is only explained by uploads when this submission actually
            carries a file or a signature; otherwise the sentence describes work
            that is not happening. */}
        {hasUploads ? "This can take a moment while your files upload." : "This only takes a moment."}
        <br />
        <strong style={{ color: t.textPrimary }}>Please do not close or refresh this page.</strong>
      </div>
    </div>
  </div>
);

const SuccessScreen = ({ formTitle, referenceNo, t, isTestRun, testEmailDisplay }: { formTitle: string; referenceNo: string; t: FormTheme; isTestRun?: boolean; testEmailDisplay?: string }) => (
  <div style={{ textAlign: "center", padding: "60px 20px", animation: "fadeUp .3s ease" }}>
    {isTestRun && (
      <div role="status" style={{ maxWidth: 420, margin: "0 auto 20px", padding: "10px 16px", background: editorial.error, color: "#fff", borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
        TEST RUN — this was a rehearsal, not a real submission. Every email it generated went only to {testEmailDisplay || "the nominated test address"}.
      </div>
    )}
    <SuccessCheck t={t} />
    <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 26, color: t.textPrimary, marginBottom: 10 }}>Submission received</div>
    <p style={{ color: t.textSecond, fontSize: 14, lineHeight: 1.8, maxWidth: 420, margin: "0 auto 10px" }}>Your response for <strong>{formTitle}</strong> has been recorded.</p>
    {referenceNo && (
      // The reference is what the respondent has to quote later, so it is given
      // room to be read and copied rather than tucked into the sentence above.
      <div style={{ maxWidth: 420, margin: "18px auto 22px", padding: "14px 18px", background: t.greenPale, border: `1px solid ${t.greenBorder}`, borderRadius: 12 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.03em", textTransform: "uppercase", color: t.textSecond, marginBottom: 6 }}>Reference number</div>
        <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 20, fontWeight: 700, color: t.textPrimary, userSelect: "all", wordBreak: "break-all" }}>{referenceNo}</div>
        <div style={{ fontSize: 12, color: t.textSecond, marginTop: 6 }}>Keep this to track or ask about your submission.</div>
      </div>
    )}
    {/* No "submit another response" here on purpose: a second entry starts
        from a freshly loaded page, so the reference above cannot be confused
        with the next one. */}
    <p style={{ color: t.textMuted, fontSize: 12, marginTop: 4 }}>You can close this page. To send another response, reload the form.</p>
  </div>
);

const PrivateGate = ({ formTitle, onSignIn, t }: { formTitle: string; onSignIn: () => void; t: FormTheme }) => (
  <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
    <div style={{ background: t.cardBg, borderRadius: 12, padding: "56px 44px", maxWidth: 420, width: "100%", textAlign: "center", boxShadow: t.shadowLg, border: `1px solid ${t.border}`, animation: "fadeUp .3s ease" }}>
      <div style={{ width: 66, height: 66, borderRadius: 12, margin: "0 auto 22px", background: t.purplePale, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>LOCK</div>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, color: t.textPrimary, marginBottom: 10 }}>Sign in required</div>
      <p style={{ color: t.textSecond, fontSize: 13, lineHeight: 1.7, marginBottom: 32 }}><strong>{formTitle || "This form"}</strong> is restricted.</p>
      <button onClick={onSignIn} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${t.purple},${t.purpleLight})`, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans'", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <MsIcon /> Sign in with Microsoft 365
      </button>
    </div>
  </div>
);

export default function DynamicFormPage() {
  const { formId } = useParams<{ formId: string }>();
  const [searchParams] = useSearchParams();
  const pinVersion = searchParams.get("version");
  const publishKey = searchParams.get("publish") || searchParams.get("batch");
  const prefilledQrPayload = useMemo(() => decodePrefilledQrPayload(searchParams.get(PREFILLED_QR_PARAM)), [searchParams]);
  const instanceToken = searchParams.get("instance") || "";
  /*
    `undefined` while it is being looked up, `null` for a token that matched
    nothing. The three states are distinct: a bad QR must say so rather than
    quietly serving the general form.
  */
  const [instanceInfo, setInstanceInfo] = useState<PublicFormInstance | null | undefined>(
    instanceToken ? undefined : null,
  );
  // A test run in progress: the ticket is what the server verifies before it
  // redirects any email this submission generates. `testEmail` is display-only
  // — it came back from the mint call and is shown in the banner below, but
  // the server never trusts it; it re-derives the real address from the
  // signed ticket alone.
  const testTicket = searchParams.get("testTicket") || "";
  const testEmailDisplay = searchParams.get("testEmail") || "";
  const isTestRun = testTicket.length > 0;
  const { locale: pdpaLocale, setLocale: setPdpaLocale, content: pdpa } = usePdpaLocale();
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const [dark, _setDark] = useState(() => { try { return localStorage.getItem("dfp_dark") === "1"; } catch { return false; } });
  const t = dark ? DARK : LIGHT;

  useEffect(() => { document.body.style.background = t.bg; document.body.style.color = t.textPrimary; return () => { document.body.style.background = ""; document.body.style.color = ""; }; }, [t]);

  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<LoadedFormData | null>(null);
  const [enrichedSurveyJson, setEnrichedSurveyJson] = useState<Record<string, unknown> | null>(null);
  /**
   * The same value, readable from `doSubmitForm`.
   *
   * That callback is memoised on `formData` and friends, so it captured this
   * state on the render that first had a form — before the enrich effect had
   * run — and kept seeing `null` for the life of the page. Reads that had no
   * fallback simply did nothing: matrix rows never reached their child list,
   * and the PDF was built without them. Adding it to the dependency array
   * instead would rebuild the callback mid-submit, and the effect that calls it
   * would fire a second time and submit twice.
   */
  const enrichedSurveyJsonRef = useRef<Record<string, unknown> | null>(null);
  enrichedSurveyJsonRef.current = enrichedSurveyJson;
  const [error, setError] = useState("");
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  /** Reference allocated to the submission just made, for the success screen. */
  const [submittedReference, setSubmittedReference] = useState("");
  const [pdpaAccepted, setPdpaAccepted] = useState(false);
  const [pdpaConsentError, setPdpaConsentError] = useState("");
  /** Whether the answers being sent carry a file or a signature, which is the
   *  only reason this ever takes longer than a moment. */
  const [hasUploads, setHasUploads] = useState(false);
  /** The consent tick and the failure notice, so a rejected submit can put the
   *  respondent on the exact thing that stopped it. */
  const consentRef = useRef<HTMLInputElement | null>(null);
  const submitErrorRef = useRef<HTMLDivElement | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const shareUrl = (() => {
    const params = new URLSearchParams();
    if (pinVersion) params.set("version", pinVersion);
    if (publishKey) params.set("publish", publishKey);
    const query = params.toString();
    return window.location.origin + window.location.pathname + (query ? `?${query}` : "");
  })();
  const tokenRef = useRef<string | null>(null);
  // Set when the signed-in user's own SharePoint credentials cannot reach the form
  // lists, so reads and writes both have to go through the public endpoints instead.
  const spDirectUnavailableRef = useRef(false);
  const userEmail = accounts[0]?.username || null;
  // `accounts` is a fresh array on some MSAL events; key the loaders off the identity
  // itself so an unrelated event cannot re-trigger a full form reload.
  const activeAccountId = accounts[0]?.homeAccountId;
  const lastDataRef = useRef<Record<string, unknown> | null>(null);

  // main.tsx settles MSAL before React renders, but it caps that wait at 3s and gives
  // up silently if initialize() throws — so `inProgress` can still be pending here, or
  // never reach None at all. Give it a grace period, then load anyway: a guest filling
  // in a public form must never be held behind a sign-in state that is stuck.
  // Someone with a cached account waits longer, because giving up early loads the form
  // as a guest and then reloads it as them a moment later, which is what swaps the
  // header out from under a user whose session is slow to restore.
  const [msalSettleExpired, setMsalSettleExpired] = useState(false);
  useEffect(() => {
    if (inProgress === InteractionStatus.None) return;
    let hasCachedAccount = false;
    try { hasCachedAccount = instance.getAllAccounts().length > 0; } catch { /* not initialised yet */ }
    const timer = setTimeout(() => setMsalSettleExpired(true), hasCachedAccount ? 6000 : 1500);
    return () => clearTimeout(timer);
  }, [inProgress, instance]);
  const authStateSettled = inProgress === InteractionStatus.None || msalSettleExpired;

  useEffect(() => {
    if (inProgress !== InteractionStatus.None) return;
    if (!isAuthenticated) return;
    const account = instance.getAllAccounts()[0];
    if (!account) return;
    const origin = new URL(import.meta.env.VITE_SP_SITE_URL || "https://placeholder.sharepoint.com").origin;
    acquireAccessTokenSilentOrRedirect(instance, { scopes: [`${origin}/AllSites.Manage`], account }).then(token => { tokenRef.current = token; }).catch(() => {});
  }, [isAuthenticated, inProgress, instance, activeAccountId]);

  useEffect(() => {
    if (!formId) { setError("No form slug provided."); setLoading(false); return; }
    // Wait for the sign-in state to settle before reading anything. Loading while MSAL
    // is still restoring the session resolves the form as a guest, then re-runs as the
    // signed-in user and overwrites the first result — which is how the document header
    // and company selector rendered and then vanished a moment later.
    if (!authStateSettled) return;

    let cancelled = false;

    // Reads the published form through the public endpoint, which resolves it with
    // the app-only credential. Used for guests, and as a fallback for signed-in
    // users whose own SharePoint permissions cannot reach the version lists.
    const loadFromPublicApi = async () => {
      const params = new URLSearchParams({ slug: formId });
      if (pinVersion) params.set("version", pinVersion);
      if (publishKey) params.set("publish", publishKey);
      const res = await fetch(`/api/form-config?${params.toString()}`, {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
        },
      });
      const contentType = res.headers.get("content-type") || "";
      const responseText = await res.text();

      if (contentType.includes("text/html") || responseText.trim().startsWith("<")) {
        throw new Error("API endpoint not available (returned HTML). Are you running 'vercel dev'?");
      }

      // Detect if Vite served the raw TypeScript source instead of executing the API
      if (responseText.includes("export default async function") || responseText.includes('from "/api/_utils/')) {
        throw new Error("API route is returning source code instead of executing. Make sure you're running 'vercel dev' (not 'npm run dev').");
      }

      // Check HTTP status before attempting JSON parse
      if (!res.ok) {
        let errorDetail: string;
        try {
          const errJson = JSON.parse(responseText);
          errorDetail = errJson.error || `Server error: ${res.status}`;
        } catch {
          errorDetail = `Server returned status ${res.status}: ${responseText.substring(0, 200)}`;
        }
        throw new Error(errorDetail);
      }

      let parsed: { error?: string; formConfig?: Record<string, unknown>; surveyJson?: Record<string, unknown>; meta?: Record<string, unknown> };
      try {
        parsed = JSON.parse(responseText);
      } catch {
        throw new Error(`Server returned non-JSON: ${responseText.substring(0, 200)}`);
      }

      if (!parsed.formConfig) {
        throw new Error("Invalid API response: missing formConfig.");
      }
      if (!parsed.surveyJson) {
        throw new Error(`Form "${formId}" has no published content for this link. Please republish the form and share the link again.`);
      }

      return {
        formConfig: parsed.formConfig,
        surveyJson: parsed.surveyJson,
        meta: (parsed.meta || {}) as Record<string, unknown>,
      };
    };

    const load = async () => {
      try {
        const origin = new URL(import.meta.env.VITE_SP_SITE_URL || "https://placeholder.sharepoint.com").origin;
        let token = tokenRef.current;

        // Try to acquire token if authenticated
        const account = instance.getAllAccounts()[0];
        if (!token && isAuthenticated && account) {
          try {
            token = await acquireAccessTokenSilentOrRedirect(instance, { scopes: [`${origin}/AllSites.Manage`], account });
            tokenRef.current = token;
          } catch {
            // Guest/public loading remains available when silent authentication fails.
          }
        }

        // Signed-in users read straight from SharePoint under their own identity so
        // private forms work, but that read depends on their list permissions. When it
        // fails — or comes back without survey content — fall back to the public
        // endpoint instead of leaving the page with nothing to render.
        const loadFromSharePoint = async (accessToken: string) => {
          let cfgRaw: Record<string, unknown>;
          let ver: { surveyJson: unknown; meta: unknown; layerConfig?: unknown; publishStatus?: string; publishExpiresAt?: string } | null;
          if (pinVersion) {
            const cfgRes = await fetchWithAuthRecovery(`${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items?$filter=Slug eq '${encodeURIComponent(formId)}'&$select=Title,CurrentVersion,CurrentPublishKey,CurrentPublishLabel,FormID,NumberOfApprovalLayer,Slug,IsPublic,ApprovalRules,ConditionField,LayerConfig,ReferenceConfig&$top=1`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json;odata=nometadata" } });
            if (!cfgRes.ok) throw new SharePointHttpError("Failed to load form config", cfgRes);
            cfgRaw = (await cfgRes.json()).value?.[0];
            if (!cfgRaw) throw new Error(`Form "${formId}" not found.`);
            ver = await getFormVersion(accessToken, cfgRaw.Title as string, pinVersion, publishKey);
            if (!ver) throw new Error(`Version ${pinVersion} not found.`);
            if (ver.publishStatus === "off") throw new Error("This published form profile is turned off.");
            if (isExpiredPublishProfile(ver.publishExpiresAt)) throw new Error("This published form profile has expired.");
            if (ver.layerConfig) {
              cfgRaw.LayerConfig = JSON.stringify(ver.layerConfig);
            }
            cfgRaw.CurrentVersion = pinVersion;
            if (publishKey) cfgRaw.CurrentPublishKey = publishKey;
          } else {
            const latest = await getLatestFormBySlug(accessToken, formId, publishKey);
            if (!latest) throw new Error(`Form "${formId}" not found.`);
            cfgRaw = latest.formConfig as unknown as Record<string, unknown>;
            ver = { surveyJson: latest.surveyJson, meta: latest.meta };
          }
          if (!ver?.surveyJson) {
            throw new Error(`Published content for "${formId}" could not be read from SharePoint.`);
          }
          return {
            formConfig: cfgRaw,
            surveyJson: ver.surveyJson as Record<string, unknown>,
            meta: (ver.meta || {}) as Record<string, unknown>,
          };
        };

        if (token) {
          try {
            const direct = await loadFromSharePoint(token);
            if (cancelled) return;
            spDirectUnavailableRef.current = false;
            applyLoadedFormData(setFormData, direct);
          } catch (spError) {
            let fallback: Awaited<ReturnType<typeof loadFromPublicApi>>;
            try {
              fallback = await loadFromPublicApi();
            } catch {
              throw spError;
            }
            if (cancelled) return;
            // A private form has to be read and submitted under the signed-in user's
            // own identity, so report the access problem rather than quietly
            // downgrading them to an anonymous respondent.
            if (fallback.formConfig.IsPublic === false) {
              if (!isSharePointAccessDeniedError(spError)) throw spError;
              throw new Error(
                `You do not have access to "${String(fallback.formConfig.Title || formId)}". This form is restricted to named SharePoint users — ask HR to grant you access, then reload this page.`,
                { cause: spError },
              );
            }
            // Silent for the respondent — the public endpoint serves the same form —
            // but a permission gap here is a real configuration problem, so leave a
            // trace someone can find when diagnosing a report.
            console.warn(`[form] SharePoint read failed for "${formId}", served via /api/form-config instead:`, spError);
            spDirectUnavailableRef.current = true;
            applyLoadedFormData(setFormData, fallback);
          }
        } else {
          // Guests, and signed-in users whose token could not be acquired silently.
          const publicData = await loadFromPublicApi();
          if (cancelled) return;
          spDirectUnavailableRef.current = false;
          applyLoadedFormData(setFormData, publicData);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [formId, pinVersion, publishKey, isAuthenticated, authStateSettled, instance, activeAccountId]);

  /*
    Resolve the instance link.

    Always through the public endpoint, whichever way the form itself loaded.
    Signed-in staff read the form straight from SharePoint, but they may have no
    permission on the Form Instances list, and an instance that silently failed
    to resolve would drop its fixed answers without saying anything. The app-only
    credential behind this endpoint answers the same way for everyone.
  */
  useEffect(() => {
    if (!instanceToken) { setInstanceInfo(null); return; }
    let cancelled = false;
    setInstanceInfo(undefined);

    void (async () => {
      try {
        const params = new URLSearchParams({ slug: formId || "", instance: instanceToken });
        const res = await fetch(`/api/form-config?${params.toString()}`, {
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
          },
        });
        const parsed = (await res.json().catch(() => ({}))) as { instance?: PublicFormInstance | null };
        if (!cancelled) setInstanceInfo(parsed.instance ?? null);
      } catch {
        if (!cancelled) setInstanceInfo(null);
      }
    })();

    return () => { cancelled = true; };
  }, [instanceToken, formId]);

  /*
    An instance's fixed answers reuse the prefilled-QR machinery: same shape,
    same read-only treatment. The two never arrive together in practice, and
    where they did the instance is the recorded one, so it wins.
  */
  const effectivePrefill = useMemo(() => {
    if (instanceInfo) {
      return {
        v: 1 as const,
        values: instanceInfo.prefill || {},
        locked: instanceInfo.lockedFields || [],
      };
    }
    return prefilledQrPayload;
  }, [instanceInfo, prefilledQrPayload]);

  // Enrich survey JSON with SharePoint-sourced choices
  useEffect(() => {
    const baseJson = formData?.surveyJson;
    if (!baseJson) { setEnrichedSurveyJson(null); return; }

    const withAppFont = (json: Record<string, unknown>): Record<string, unknown> => ({ ...json, fontFamily: "Inter" });
    const applyPrefill = (json: Record<string, unknown>): Record<string, unknown> =>
      cloneAndApplyPrefilledQr(withAppFont(json), effectivePrefill);
    // When the direct SharePoint reads are unavailable the config already arrived
    // from the public endpoint with its choices resolved server-side.
    const tokenRaw = spDirectUnavailableRef.current ? null : tokenRef.current;
    if (!tokenRaw) { setEnrichedSurveyJson(applyPrefill(baseJson)); return; }
    const token = tokenRaw; // narrowed to string

    const clone = withAppFont(JSON.parse(JSON.stringify(baseJson)) as Record<string, unknown>);

    async function enrich(): Promise<void> {
      const pending: Promise<void>[] = [];

      // Every question, whatever container it sits in. This recursed into
      // panels alone, so a question inside a column layout never had its
      // choices loaded at all.
      function collect(el: Record<string, unknown>) {
          // Main field spChoicesSource
          const src = el.spChoicesSource as { list?: string; column?: string } | undefined;
          if (src?.list && src?.column) {
            pending.push(
              getSharePointChoices(src.list, src.column, token)
                .then((choices) => {
                  if (choices.length > 0) el.choices = choices;
                })
                .catch(() => {})
            );
          }

          // Main field spFilteredListSource
          const fls = el.spFilteredListSource as { list?: string; valueColumn?: string; labelColumn?: string; filterColumn?: string; filterValue?: string; includeBlankFilter?: boolean; scopeField?: string } | undefined;
          if (fls?.list && fls?.valueColumn && fls.scopeField && fls.filterColumn) {
            /*
              A list that narrows as another answer is given. Every row is
              fetched once, tagged with the scope it belongs to, and the subset
              to show is worked out while the form is filled - see
              `scopedChoices` in src/native/schema.ts. `choices` is also set to
              the unnarrowed set, so a renderer that ignores `scopedChoices`
              offers everything rather than nothing.
            */
            const scopeField = fls.scopeField;
            pending.push(
              getScopedListRows(fls.list, fls.valueColumn, fls.filterColumn, token, fls.labelColumn)
                .then((rows) => {
                  if (rows.length === 0) return;
                  el.scopedChoices = { scopeField, rows };
                  el.choices = resolveScopedChoices(rows, "").map((choice) => ({
                    value: choice.value,
                    text: choice.text,
                  }));
                })
                .catch(() => {})
            );
          } else if (fls?.list && fls?.valueColumn) {
            pending.push(
              getFilteredListChoices(fls.list, fls.valueColumn, token, fls.filterColumn, fls.filterValue, fls.labelColumn, fls.includeBlankFilter)
                .then((choices) => {
                  if (choices.length > 0) el.choices = choices;
                })
                .catch(() => {})
            );
          }

          // Matrix column choicesSource / filteredListSource
          if ((el.type === "matrixdynamic" || el.type === "dynamicmatrix") && Array.isArray(el.columns)) {
            const cols = el.columns as Record<string, unknown>[];
            for (const col of cols) {
              const colSrc = col.choicesSource as { list?: string; column?: string } | undefined;
              if (colSrc?.list && colSrc?.column) {
                pending.push(
                  getSharePointChoices(colSrc.list, colSrc.column, token)
                    .then((choices) => {
                      if (choices.length > 0) col.choices = choices;
                    })
                    .catch(() => {})
                );
              }
              const colFls = col.filteredListSource as { list?: string; valueColumn?: string; labelColumn?: string; filterColumn?: string; filterValue?: string } | undefined;
              if (colFls?.list && colFls?.valueColumn) {
                pending.push(
                  getFilteredListChoices(colFls.list, colFls.valueColumn, token, colFls.filterColumn, colFls.filterValue, colFls.labelColumn)
                    .then((choices) => {
                      if (choices.length > 0) col.choices = choices;
                    })
                    .catch(() => {})
                );
              }
            }
          }
        }

      forEachSurveyElement(clone, collect);

      await Promise.all(pending);
      setEnrichedSurveyJson(cloneAndApplyPrefilledQr(clone, effectivePrefill));
    }

    enrich().catch(() => setEnrichedSurveyJson(applyPrefill(baseJson)));
  }, [formData, effectivePrefill]);

  /**
   * The published document, parsed into the native engine's shape.
   *
   * Everything the SurveyJS path had to bolt on afterwards is gone with it:
   * formula fields are derived from their inputs on every render rather than
   * written back on a `setTimeout` (which meant a submission fired in the same
   * tick could carry a stale total), `autocapitalize` is a parsed property of
   * the question, and MYR renders as "RM" inside the readout control.
   */
  const nativeForm = useMemo<NativeForm | null>(() => {
    if (!enrichedSurveyJson) return null;
    try {
      return parseForm(enrichedSurveyJson);
    } catch {
      return null;
    }
  }, [enrichedSurveyJson]);

  // A hook cannot be called conditionally, so a form that has not loaded yet
  // runs an empty document rather than skipping the runtime entirely.
  const placeholderForm = useMemo(() => parseForm(null), []);
  // A test run prefills recognisably-fake answers so the tester is not
  // required to type through every field by hand; anything the sampler does
  // not confidently understand (signatures, file uploads) is left for them.
  const testRunSeed = useMemo(
    () => (isTestRun && enrichedSurveyJson ? sampleAnswersFor(enrichedSurveyJson as Record<string, unknown>) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isTestRun, enrichedSurveyJson],
  );
  const runtime = useNativeForm(nativeForm ?? placeholderForm, testRunSeed);
  const formReady = nativeForm !== null;

  const formVersion = String(formData?.formConfig?.CurrentVersion || "1.0");
  const formIdValue = String(formData?.formConfig?.FormID || "");
  const showBanner = (formData?.meta?.showBanner as boolean) !== false;
  const isoStandardsText = (formData?.meta?.isoStandards as string) || "ISO 9001 · ISO 14001 · ISO 45001";
  const logoUrl = (formData?.meta?.logoUrl as string) || "";
  const isPublicForm = formData?.formConfig?.IsPublic !== false;
  const formTitle = String(formData?.formConfig?.Title || formData?.surveyJson?.title || "Form");
  const documentHeader = documentHeaderFromMeta(formData?.meta, formIdValue, formVersion);

  useEffect(() => { document.title = formTitle ? `Form: ${formTitle}` : "Form — PMW HR Form"; }, [formTitle]);

  /**
   * The submit gate: the form's own validation first, then the one condition
   * that lives outside the document — the privacy consent below it. The company
   * is a required question inside the form, so `validateAll` already covers it.
   *
   * Nothing here submits. It fills `lastDataRef` and raises the loading state,
   * which is what `doSubmitForm` runs off, exactly as the SurveyJS
   * `onCompleting` handler it replaces did.
   */
  const handleSubmit = useCallback(() => {
    if (!formReady || submitStatus === "loading") return;

    // The form view scrolls to the first failure and focuses it, so a rejected
    // validation needs no message of its own here.
    if (!runtime.validateAll().ok) return;

    if (!pdpaAccepted) {
      setPdpaConsentError(pdpa.ui.consentRequired);
      document.querySelector(".dfp-pdpa-consent")?.scrollIntoView({ behavior: "smooth", block: "center" });
      consentRef.current?.focus({ preventScroll: true });
      return;
    }

    setPdpaConsentError("");
    const collected = runtime.collect();
    lastDataRef.current = collected;
    setHasUploads(
      runtime.form.questions.some((q) => {
        if (q.kind !== "file" && q.kind !== "signature") return false;
        const v = collected[q.name];
        return !(v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0));
      }),
    );
    setSubmitStatus("loading");
  }, [formReady, submitStatus, runtime, pdpaAccepted, pdpa.ui.consentRequired]);
  const doSubmitForm = useCallback(async () => {
    // Collapse "other" + "{name}-Comment" pairs into the free text the respondent
    // typed, before uploads or column mapping read the answers.
    const raw = foldOtherAnswers(lastDataRef.current ?? {});
    const cfg = formData?.formConfig;
    if (!cfg) { throw new Error("no form config"); }
    
      let activeLayers: { email: string; name: string; emails?: string[]; parked?: { reason: string } }[] = [];
      let resolvedLayerCount = 0;
      // Someone who could not read this form from SharePoint cannot write to the
      // response list either, so submit through the public endpoint (recorded as
      // GUEST) exactly as an anonymous respondent on the same public link would.
      const token = spDirectUnavailableRef.current ? null : tokenRef.current;
      const formId = String(cfg.FormID || "");

      // Step 1: Upload file/image/signature fields to document libraries
      const urlFieldPatches: UrlFieldPatch[] = [];
      if (token) {
        // Detect file/image/signature field names from survey JSON
        const fileFieldNames = new Set<string>();
        const signatureFieldNames = new Set<string>();
        const surveyData = formData?.surveyJson;
        if (surveyData) {
          const pages = (surveyData as unknown as Record<string, unknown>).pages as { elements?: Record<string, unknown>[] }[] | undefined;
          if (pages) {
            const walk = (els: Record<string, unknown>[]) => {
              for (const el of els) {
                if ((el.type === 'file' || el.type === 'imageupload') && el.name) {
                  fileFieldNames.add(el.name as string);
                }
                if (el.type === 'signaturepad' && el.name) {
                  signatureFieldNames.add(el.name as string);
                }
                if (el.elements) walk(el.elements as Record<string, unknown>[]);
              }
            };
            for (const page of pages) { if (page.elements) walk(page.elements); }
          }
        }

        let docLibName: string | null = null;

        for (const [k, v] of Object.entries(raw)) {
          // Handle base64 data values: signatures → Signature Images, file fields → per-form doc lib
          const candidate = uploadCandidateFromValue(v);
          if (candidate) {
            try {
              const isSignature = signatureFieldNames.has(k) || (candidate.content.startsWith("data:image/") && !fileFieldNames.has(k));
              if (isSignature) {
                const imageUrl = toAbsoluteSharePointUrl(await uploadSignatureImage(token, formId, "submission", candidate.content));
                raw[k] = imageUrl;
                urlFieldPatches.push({ fieldName: k, url: imageUrl, description: "Signature" });
              } else {
                if (!docLibName) {
                  docLibName = await ensureDocLibrary(token, cfg.Title as string);
                }
                const fileName = uploadFileName(k, candidate);
                const fileUrl = toAbsoluteSharePointUrl(await uploadFileToDocLib(token, docLibName, fileName, candidate.content));
                raw[k] = fileUrl;
              }
            } catch (e) {
              throw new Error(`Could not upload "${k}": ${e instanceof Error ? e.message : String(e)}`, { cause: e });
            }
          }
          // Handle multi-file arrays (SurveyJS file question with allowMultiple)
          if (Array.isArray(v)) {
            const urls: string[] = [];
            for (const item of v) {
              const itemCandidate = uploadCandidateFromValue(item);
              if (itemCandidate) {
                try {
                  if (!docLibName) {
                    docLibName = await ensureDocLibrary(token, cfg.Title as string);
                  }
                  const fileName = uploadFileName(k, itemCandidate, urls.length);
                  const fileUrl = toAbsoluteSharePointUrl(await uploadFileToDocLib(token, docLibName, fileName, itemCandidate.content));
                  urls.push(fileUrl);
                } catch (e) {
                  throw new Error(`Could not upload "${k}": ${e instanceof Error ? e.message : String(e)}`, { cause: e });
                }
              }
            }
            if (urls.length > 0) {
              raw[k] = urls;
            }
          }
        }
      }

      if (token) {
        normalizeSharePointDateTimeFields(raw, enrichedSurveyJsonRef.current || formData?.surveyJson);
      }

      // Step 2: Resolve layers — try LayerConfig first, fall back to old rules
      let layerConfigParsed: LayerConfig | null = null;
      const rawLayerConfig = cfg.LayerConfig as string | undefined;
      if (rawLayerConfig && rawLayerConfig.trim()) {
        try { layerConfigParsed = JSON.parse(rawLayerConfig); } catch {}
      }
      // A public respondent's config has no assignees in it to read, so the API
      // routes their submission from the server's own copy. See planLayerRouting.
      const { deferToApi: deferLayerRoutingToApi, hasManualBranches } = planLayerRouting(layerConfigParsed, { hasToken: Boolean(token) });

      if (hasManualBranches) {
        // Manual branch workflows start only after an HR Forms Owner chooses a branch.
        resolvedLayerCount = 0;
        activeLayers = [];
      } else if (layerConfigParsed?.layers?.length) {
        resolvedLayerCount = layerConfigParsed.layers.length;
        if (!deferLayerRoutingToApi) {
          const configSlug = (cfg.Slug as string) || (cfg.slug as string) || formId || "";
          // Matches what body.SubmittedBy is set to below; chain layers need it
          // before the body is assembled.
          const submitterEmail = token ? (userEmail || accounts[0]?.username || "") : "";
          for (const layer of layerConfigParsed.layers) {
            if (isDeferredAssignee(layer.assignee)) {
              // Routes from the previous layer's actor, who does not exist yet.
              activeLayers.push({ email: "", name: "", emails: [] });
              continue;
            }
            activeLayers.push(await resolveLayerAssignee(layer, raw, token, configSlug, { submitterEmail }));
          }
        }
      } else {
        // Old approval rules / approvers list fallback (keep existing logic)
        let approvalRules = null;
        try { approvalRules = cfg.ApprovalRules ? JSON.parse(cfg.ApprovalRules as string) : null; } catch {}
        if (approvalRules?.conditionField && approvalRules?.rules?.length) {
          const condVal = String(raw[approvalRules.conditionField] ?? "").toLowerCase();
          const matched = approvalRules.rules.find((r: Record<string, unknown>) => (r.when as string).toLowerCase() === condVal);
          if (matched) {
            activeLayers = matched.layers;
            resolvedLayerCount = matched.layers.length;
          }
        } else if (token) {
          const apData = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Approvers')/items?$filter=FormTitle eq '${encodeURIComponent(cfg.Title as string)}'&$select=LayerNumber,ApproverEmail,ApproverName&$orderby=LayerNumber asc&$top=10`).catch(() => ({ value: [] })) as { value: Record<string, string>[] };
          activeLayers = (apData.value ?? []).map((a) => ({ email: a.ApproverEmail, name: a.ApproverName }));
          resolvedLayerCount = activeLayers.length;
        }
      }

      let hasManualPaperWorkflow = false;

      // Step 3: Build body (keep existing logic)
      const body: Record<string, unknown> = {};
      const urlFieldPatchNames = new Set(urlFieldPatches.map((patch) => patch.fieldName));
      // Dynamic matrices and table inputs have no bare SharePoint column — they
      // are provisioned as `_Response` / `_Html` / `_Json` / `_RowIds` only (see
      // `getSpColumnKind`). The renderer hands their answers back as a plain
      // array of rows, which would otherwise fall through to `body[k]` below and
      // be rejected as an unprovisioned field, failing the whole submission.
      const tabularColumns = new Map(
        getTabularFields(enrichedSurveyJsonRef.current || formData?.surveyJson).map(f => [f.name, f.columns]),
      );
      // Checkbox groups live in SharePoint MultiChoice columns, which take a
      // real array. Everything else that arrives as an array is stored as JSON
      // in a text column. See `getMultiChoiceFieldNames`.
      const multiChoiceColumns = getMultiChoiceFieldNames(
        enrichedSurveyJsonRef.current || formData?.surveyJson,
      );
      for (const [k, v] of Object.entries(raw)) {
        if (urlFieldPatchNames.has(k)) continue;
        if (tabularColumns.has(k)) {
          const rows = (Array.isArray(v) ? v : []) as MatrixRow[];
          if (rows.length === 0) continue;
          body[`${k}_Response`] = rowsToHtml(tabularColumns.get(k) || [], rows);
          body[`${k}_Json`] = JSON.stringify(rows);
          continue;
        }
        if (v && typeof v === "object" && (v as Record<string, unknown>).html && (v as Record<string, unknown>).json) {
          body[`${k}_Response`] = (v as Record<string, unknown>).html;
          body[`${k}_Json`] = typeof (v as Record<string, unknown>).json === "string" ? (v as Record<string, unknown>).json : JSON.stringify((v as Record<string, unknown>).json);
        } else if (Array.isArray(v)) {
          /**
           * A MultiChoice column takes the array itself. Stringifying it made
           * SharePoint reject the whole item with "A 'StartArray' node was
           * expected", so no form with a checkbox group could be submitted.
           *
           * `odata=nometadata` is in use throughout, so a plain JSON array is
           * the right shape here -- the verbose
           * `{ __metadata: { type: "Collection(Edm.String)" }, results: [...] }`
           * form belongs to the metadata dialect this app does not speak.
           *
           * Every other array stays a JSON string, because its column is Text
           * or Note and would reject an array just as firmly.
           */
          body[k] = multiChoiceColumns.has(k) ? v : JSON.stringify(v);
        }
        else if (v && typeof v === "object") {
          if ("Url" in (v as Record<string, unknown>)) {
            body[k] = v;
          } else {
            body[k] = JSON.stringify(v);
          }
        }
        else if (typeof v === "number" || typeof v === "boolean") { body[k] = String(v); }
        else { body[k] = v; }
      }
      body.SubmittedAt = new Date().toISOString();
      body.FormVersion = cfg.CurrentVersion;
      body.PublishKey = cfg.CurrentPublishKey || publishKey || "production";
      body.FormID = cfg.FormID;
      body.PDPAConsent = "Accepted";
      body.PDPANoticeVersion = getPdpaNoticeVersion(pdpaLocale);
      body.PDPAConsentAt = new Date().toISOString();
      body.RetentionUntil = getPdpaRetentionUntil(new Date(body.PDPAConsentAt as string));
      body.SubmittedBy = token ? (userEmail || accounts[0]?.username || "authenticated-user") : "GUEST";

      // Claimed before the item is written so the number and the row appear
      // together. Guests skip this — api/submit-form.ts allocates for them,
      // keeping a single allocator regardless of how the row gets created.
      if (token && parseReferenceNumberConfig(cfg.ReferenceConfig).enabled) {
        const referenceNo = await claimReferenceNumber(cfg.Title as string);
        if (referenceNo) {
          body[REFERENCE_NO_FIELD] = referenceNo;
          setSubmittedReference(referenceNo);
        }
      }

      // Step 4: Write layer status columns
      const routingNotes: string[] = [];
      if (layerConfigParsed?.layers?.length && !deferLayerRoutingToApi) {
        // Enhanced path — use new constants
        for (let index = 0; index < layerConfigParsed.layers.length; index++) {
          const layer = layerConfigParsed.layers[index];
          const layerNumber = layer.layerNumber;
          const routed = resolveEvaluationSubmitterRouting(layer, body);
          if (routed?.manualPaper) {
            hasManualPaperWorkflow = true;
            body[`L${layerNumber}_Status`] = manualPaperStatusForLayer(layer);
            const senderEmail = routed.sendToConfiguredSender ? CONFIGURED_SENDER_EMAIL : "";
            const actors = senderEmail ? [senderEmail] : [];
            writeLayerRecipientFields(body, layer, actors);
            activeLayers[index] = { email: senderEmail, name: "", emails: actors };
          } else if (!routed?.email && activeLayers[index]?.parked) {
            // The directory has no answer for this person yet. Keep the
            // submission and flag the layer; losing a form over a missing
            // directory row would be the worst possible outcome here.
            routingNotes.push(`Layer ${layerNumber}: ${activeLayers[index].parked?.reason ?? "could not be routed"}`);
            body[`L${layerNumber}_Status`] = NEEDS_ROUTING_LAYER_STATUS;
            writeLayerRecipientFields(body, layer, []);
          } else {
            // A submitter routing rule names one evaluator, so it overrides the
            // layer's whole actor set rather than joining it.
            const fallbackEmail = routed?.email || activeLayers[index]?.email || "";
            const actors = routed?.email
              ? parseValidEmailList(routed.email)
              : activeLayers[index]?.emails ?? parseValidEmailList(activeLayers[index]?.email);
            const routedEmail = actors[0] ?? fallbackEmail;
            const manualPaperForSender = shouldUseManualPaperForSender(layer, routedEmail);
            if (manualPaperForSender) hasManualPaperWorkflow = true;
            body[`L${layerNumber}_Status`] = manualPaperForSender
              ? manualPaperStatusForLayer(layer)
              : SP_LAYER_STATUS.PENDING;
            writeLayerRecipientFields(body, layer, actors, fallbackEmail);
            activeLayers[index] = { ...(activeLayers[index] || { name: "" }), email: routedEmail, emails: actors };
          }
        }
        if (routingNotes.length > 0) body.RoutingNotes = routingNotes.join("\n");
        body.FormStatus = SP_FORM_STATUS.SUBMITTED;
        body.CurrentLayer = layerConfigParsed.layers[0]?.layerNumber ?? 0;
        body.CurrentApprovalLayer = body.CurrentLayer;
      } else if (layerConfigParsed?.layers?.length) {
        body.FormStatus = SP_FORM_STATUS.SUBMITTED;
        body.CurrentLayer = layerConfigParsed.layers[0]?.layerNumber ?? 0;
        body.CurrentApprovalLayer = body.CurrentLayer;
      } else if (hasManualBranches) {
        // Branch-only workflow — admin assigns branch in Approvals before layers start
        body.FormStatus = SP_FORM_STATUS.SUBMITTED;
        body.Status = SP_FORM_STATUS.SUBMITTED;
        body.CurrentLayer = 0;
        body.CurrentApprovalLayer = 0;
      } else {
        // Legacy path — keep old behavior
        for (let n = 1; n <= resolvedLayerCount; n++) {
          body[`L${n}_Status`] = n === 1 ? "Pending" : "Waiting";
          body[`L${n}_Email`] = activeLayers[n - 1]?.email ?? "";
        }
      }

      // Step 4b: add a brand-new submitter to the Approval Directory, when
      // this form has been set to do that.
      //
      // Runs after routing on purpose. Somebody the directory has never heard
      // of parks their layer, which is right — the row created here is a guess
      // for an admin to check, not an answer to send an appraisal off on.
      //
      // Needs a signed-in token, and is skipped when routing is deferred: in
      // both of those cases api/submit-form.ts harvests instead, so exactly
      // one side ever writes the row.
      if (token && !deferLayerRoutingToApi) {
        const harvestConfig = readHarvestConfig(layerConfigParsed);
        if (harvestConfig && hasEvaluationLayer(layerConfigParsed)) {
          const harvested = await harvestSubmitter(token, {
            config: harvestConfig,
            data: body,
            submittedBy: String(body.SubmittedBy || userEmail || ""),
          }).catch(() => null);
          if (harvested?.note) {
            body.RoutingNotes = [String(body.RoutingNotes || ""), harvested.note]
              .filter(Boolean)
              .join("\n");
          }
        }
      }

      // Step 5: Submit
      let submittedByEmail = "";
      if (token) {
        submittedByEmail = String(body.SubmittedBy || userEmail || accounts[0]?.username || "authenticated-user");
        await ensurePdpaColumns(token, cfg.Title as string);
        if (hasManualBranches) {
          const maxBranchLayers = Math.max(
            1,
            ...(layerConfigParsed?.manualBranches ?? []).map((b) => b.layers.length),
          );
          await ensureWorkflowColumns(token, cfg.Title as string, maxBranchLayers);
          await new Promise((r) => setTimeout(r, 1500));
        }
        const listUrl = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(cfg.Title as string)}')/items`;
        const resolveColumnKey = await getSharePointColumnKeyResolver(token, cfg.Title as string);

        /*
          Instance answers on the signed-in path, which writes to SharePoint
          directly and so never passes through api/submit-form's enforcement.

          Be clear about what this is: for a signed-in member of staff it is a
          correctness measure, NOT a security boundary. They hold a delegated
          token with write access to the response list, so they can already put
          any value in any column, instance or no instance. The boundary that
          matters guards the people an instance link is actually handed to —
          anonymous and guest respondents, who can only reach the list through
          the API, where the locked values are written from the record.

          What this does buy is that a stale tab or an edited read-only field
          cannot quietly file a response under the wrong event, and that the
          row records which link it came through either way.
        */
        if (instanceInfo) {
          for (const name of instanceInfo.lockedFields) {
            if (Object.prototype.hasOwnProperty.call(instanceInfo.prefill, name)) {
              body[name] = instanceInfo.prefill[name];
            }
          }
          // Guarded like ReferenceNo: an unrecognised column fails the whole
          // create, and the submission is worth more than the stamp.
          if (resolveColumnKey("InstanceId")) body.InstanceId = instanceInfo.id;
        }

        let result: { Id?: number } | undefined;
        try {
          result = await spPost(
            token,
            listUrl,
            mapBodyToSharePointColumnKeys(body, resolveColumnKey, cfg.Title as string),
          ) as { Id?: number };
        } catch (submitErr) {
          const msg = submitErr instanceof Error ? submitErr.message : String(submitErr);
          // If the response list is missing enhanced layer columns (pre-provisioning),
          // retry without FormStatus / CurrentLayer
          if ((msg.includes('FormStatus') || msg.includes('CurrentLayer')) && body.FormStatus !== undefined) {
            delete body.FormStatus;
            delete body.CurrentLayer;
            result = await spPost(
              token,
              listUrl,
              mapBodyToSharePointColumnKeys(body, resolveColumnKey, cfg.Title as string),
            ) as { Id?: number };
          } else if (msg.includes('_Response') || msg.includes('_Json')) {
            // Retry without _Response/_Json columns (matrix fields published before
            // dynamicmatrix column provisioning was added)
            for (const key of Object.keys(body)) {
              if (key.endsWith('_Response') || key.endsWith('_Json')) {
                delete body[key];
              }
            }
            result = await spPost(
              token,
              listUrl,
              mapBodyToSharePointColumnKeys(body, resolveColumnKey, cfg.Title as string),
            ) as { Id?: number };
          } else {
            throw submitErr;
          }
        }

        // A signed-in submission writes its row straight to SharePoint above,
        // never through the guest `/api/submit-form` flow that stamps
        // IsTest/TestEmail at create time. Everything downstream — the
        // approval dashboard, the evaluation page, the cron — decides
        // test-ness by reading those two columns off the row, so a
        // rehearsal that skips this call is indistinguishable from a real
        // submission the moment anyone approves layer 1. The server
        // re-verifies the ticket itself before writing anything; this call
        // only ever succeeds in flagging a row that a genuine mint-test-ticket
        // ticket authorises, never anything the browser asserts on its own.
        //
        // Unlike the trail-writing calls elsewhere in this flow, a failure
        // here is NOT swallowed: an unmarked row would go on to mail a real
        // layer-2+ approver the moment it is approved, which is worse than
        // telling the tester their rehearsal did not start cleanly.
        if (isTestRun && result?.Id) {
          const stampRes = await fetch("/api/submit-form", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Requested-With": "XMLHttpRequest",
              ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
            },
            body: JSON.stringify({
              action: "stamp-test-run",
              listTitle: cfg.Title,
              itemId: String(result.Id),
              slug: (cfg.Slug as string) || (cfg.slug as string) || formId || "",
              testTicket,
            }),
          });
          if (!stampRes.ok) {
            const stampData = await stampRes.json().catch(() => ({})) as { error?: string };
            throw new Error(stampData.error || "Could not mark this submission as a test run — stopped before any approver could be notified.");
          }
        }

        if (result?.Id && urlFieldPatches.length > 0) {
          for (const patch of urlFieldPatches) {
            const patchFieldName = resolveColumnKey(patch.fieldName);
            if (!patchFieldName) {
              throw new Error(`The form field "${patch.fieldName}" is not provisioned in "${cfg.Title as string}". Please republish the form before trying again.`);
            }
            try {
              await spPatchUrlField(token, cfg.Title as string, result.Id, patchFieldName, patch.url, patch.description);
            } catch (urlPatchErr) {
              try {
                await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(cfg.Title as string)}')/items(${result.Id})`, {
                  [patchFieldName]: patch.url,
                });
              } catch {
                throw new Error(`Could not save uploaded image link for "${patch.fieldName}": ${urlPatchErr instanceof Error ? urlPatchErr.message : String(urlPatchErr)}`);
              }
            }
          }
        }

        // Step 6: Write matrix child list items (dynamicmatrix fields)
        const matrixUpdateBody: Record<string, unknown> = {};
        if (result?.Id && enrichedSurveyJsonRef.current) {
          try {
            const pages = (enrichedSurveyJsonRef.current as unknown as Record<string, unknown>).pages as { elements?: Record<string, unknown>[] }[] | undefined;
            const matrixFields: { name: string; columns: MatrixColumnDef[] }[] = [];
            if (pages) {
              const walk = (els: Record<string, unknown>[]) => {
                for (const el of els) {
                  if (el.type === "dynamicmatrix" || el.type === "matrixdynamic") {
                    const cols = (el.columns as MatrixColumnDef[]) || [];
                    if (el.name && cols.length > 0) matrixFields.push({ name: el.name as string, columns: cols });
                  }
                  if (el.elements) walk(el.elements as Record<string, unknown>[]);
                }
              };
              for (const page of pages) { if (page.elements) walk(page.elements); }
            }
            for (const mf of matrixFields) {
              const rawVal = raw[mf.name];
              if (!rawVal || typeof rawVal !== "object") continue;
              // The renderer hands back a bare array of rows; only older answers
              // carry the `{ rows }` wrapper. Reading just the wrapper left the
              // child list empty, so a saved matrix showed no rows when the
              // submission was opened again.
              const rows = (Array.isArray(rawVal)
                ? rawVal
                : (rawVal as Record<string, unknown>).rows) as Record<string, unknown>[] | undefined;
              if (!Array.isArray(rows) || rows.length === 0) continue;
              const childList = await ensureMatrixChildList(token, cfg.Title as string, mf.name, mf.columns, () => {});
              if (childList) {
                const ids = await writeMatrixChildItems(token, childList.listName, result.Id, rows, mf.columns, {
                  formTitle: cfg.Title as string,
                  formVersion: String(body.FormVersion || ""),
                  submittedAt: String(body.SubmittedAt || ""),
                  submittedBy: String(body.SubmittedBy || ""),
                });
                matrixUpdateBody[`${mf.name}_RowIds`] = JSON.stringify(ids);
              }
            }
            // PATCH parent item with RowIds (if any matrix data was written)
            if (Object.keys(matrixUpdateBody).length > 0) {
              const mappedMatrixUpdateBody = mapBodyToSharePointColumnKeys(
                matrixUpdateBody,
                resolveColumnKey,
                cfg.Title as string,
              );
              if (Object.keys(mappedMatrixUpdateBody).length > 0) {
                await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(cfg.Title as string)}')/items(${result.Id})`, mappedMatrixUpdateBody);
              }
            }
          } catch (e) {
            void e;
          }
        }

        // Step 7: Trigger notification
        if (resolvedLayerCount > 0 && result?.Id) {
          const layer1Email = activeLayers[0]?.email;
          const firstLayerNumber = layerConfigParsed?.layers?.[0]?.layerNumber ?? 1;
          // Multiple evaluators and/or a shared mailbox: L{n}_NotifyEmails is
          // the delivery list, L{n}_Email only the primary actor.
          const layer1Recipients = parseValidEmailList(body[`L${firstLayerNumber}_NotifyEmails`]);
          const firstLayerManualPaper = String(body[`L${firstLayerNumber}_Status`] || "").toLowerCase().startsWith("manual ");
          const formSlug = (cfg.Slug as string) || (cfg.slug as string) || "";
          const baseUrl = window.location.origin;

          if (firstLayerManualPaper) {
            // Manual-paper workflow notices are sent with the generated PDF below.
          } else if (layerConfigParsed?.layers?.[0]?.type === "evaluation" && layerConfigParsed.layers[0].authMode === "365" && layer1Email) {
            const reviewLink = formSlug
              ? buildWorkflowReviewLink({
                  baseUrl,
                  layerType: layerConfigParsed.layers[0].type,
                  authMode: layerConfigParsed.layers[0].authMode,
                  publicToken: layerConfigParsed.layers[0].publicToken,
                  formSlug,
                  responseItemId: result.Id,
                  layerNumber: 1,
                })
              : undefined;
            await triggerApprovalNotification(token, {
              formTitle: cfg.Title as string,
              submittedBy: submittedByEmail,
              responseItemId: result.Id,
              layer: 1,
              totalLayers: resolvedLayerCount,
              action: "submit",
              nextApproverEmail: layer1Email,
              ...(layer1Recipients.length ? { nextRecipients: layer1Recipients } : {}),
              nextLayerType: layerConfigParsed.layers[0].type,
              nextEmailSchedule: layerConfigParsed.layers[0].emailSchedule,
              reviewLink,
              ...(isTestRun ? { testRun: { ticket: testTicket, slug: formSlug } } : {}),
            });
          } else if (resolvedLayerCount > 0) {
            await triggerApprovalNotification(token, {
              formTitle: cfg.Title as string,
              submittedBy: submittedByEmail,
              responseItemId: result.Id,
              layer: 1,
              totalLayers: resolvedLayerCount,
              action: "submit",
              ...(layer1Email ? { nextApproverEmail: layer1Email } : {}),
              ...(layer1Recipients.length ? { nextRecipients: layer1Recipients } : {}),
              ...(layerConfigParsed?.layers?.[0]?.type ? { nextLayerType: layerConfigParsed.layers[0].type } : {}),
              ...(layerConfigParsed?.layers?.[0]?.type === "evaluation"
                ? { nextEmailSchedule: layerConfigParsed.layers[0].emailSchedule }
                : {}),
              ...(isTestRun ? { testRun: { ticket: testTicket, slug: formSlug } } : {}),
            });
          }
        }

        // Step 7: Generate PDF for no-layers or manual-paper workflow submissions.
        if ((resolvedLayerCount === 0 || hasManualPaperWorkflow) && result?.Id && token) {
          try {
            const cfgData = await getFormConfigByTitle(token, cfg.Title as string);
            const formVer = cfgData ? (cfgData as unknown as Record<string, unknown>).CurrentVersion as string || "1.0" : "1.0";
            const verData = await spGet(
              token,
              `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(cfg.Title as string)}' and FormVersion eq '${encodeURIComponent(formVer)}'&$select=SurveyJSON&$top=1`
            ) as { value?: { SurveyJSON?: string }[] };
            const rawSurvey = verData.value?.[0]?.SurveyJSON;
            if (rawSurvey) {
              const parsed = JSON.parse(rawSurvey);
              const surveyContent = parsed.surveyJson || parsed;
              const versionMeta = parsed.meta && typeof parsed.meta === "object" && !Array.isArray(parsed.meta)
                ? parsed.meta as Record<string, unknown>
                : {};
              const respItem = await spGet(
                token,
                `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(cfg.Title as string)}')/items(${result.Id})`
              ) as Record<string, unknown>;
              const SYSTEM_FIELDS = new Set(['Id','Title','SubmittedBy','SubmittedAt','Status','CurrentApprovalLayer','FormVersion','PublishKey','FormID','RawJSON','CurrentLayer','FormStatus','EvaluationData','WorkflowAssignmentData','WorkflowEmailLog','WorkflowEmailSchedule','PDPAConsent','PDPANoticeVersion','PDPAConsentAt','RetentionUntil','Author','Editor','Created','Modified','ContentType','PermMask','PdfUrl','L1_Status','L1_Email','L1_SignedAt','L1_Rejection','L1_Signature','L2_Status','L2_Email','L2_SignedAt','L2_Rejection','L2_Signature','L3_Status','L3_Email','L3_SignedAt','L3_Rejection','L3_Signature']);
              const pdfData: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(respItem)) {
                if (SYSTEM_FIELDS.has(k) || v === null || v === undefined) continue;
                // Filter out matrix system columns — rendered separately as tables
                if (k.endsWith('_Html') || k.endsWith('_Json') || k.endsWith('_RowIds')) continue;
                pdfData[k] = v;
              }
              // ── Inject matrix child rows for table rendering ──────────
              // (generateAndStorePdf also does this independently; doing it here
              //  provides the data upfront for any future pdfData consumers.)
              try {
                const sPages = (surveyContent as Record<string, unknown>).pages as { elements?: Record<string, unknown>[] }[] | undefined;
                if (sPages) {
                  const walkEls = (els: Record<string, unknown>[]) => {
                    for (const el of els) {
                      const t = el.type as string | undefined;
                      if (t === 'dynamicmatrix' || t === 'matrixdynamic' || t === 'tableinput') {
                        const fName = el.name as string | undefined;
                        if (fName && respItem[`${fName}_RowIds`]) {
                          const safeName = fName.replace(/[^a-zA-Z0-9_ -]/g, '').trim();
                          const childListName = `${cfg.Title as string} Matrix ${safeName}`;
                          readMatrixChildItems(token, childListName, result.Id as number, (el.columns as MatrixColumn[]) || []).then(childRows => {
                            if (childRows.length > 0) {
                              pdfData[`${fName}_childRows`] = { columns: (el.columns as MatrixColumnDef[]) || [], rows: childRows };
                            }
                          }).catch(() => { /* ignore */ });
                        }
                      }
                      if (el.elements) walkEls(el.elements as Record<string, unknown>[]);
                    }
                  };
                  for (const page of sPages) { if (page.elements) walkEls(page.elements); }
                }
              } catch { /* ignore matrix injection errors */ }
              const { generateAndStorePdf, buildPdfLayerResults } = await import("../utils/generateFormPdf");
              let manualPdfAttachment: { name: string; contentType: string; contentBytes: string } | null = null;
              const responseItemId = result.Id;
              const pdfUrl = await generateAndStorePdf(token, cfg.Title as string, responseItemId, {
                surveyJson: surveyContent as PdfFormData["surveyJson"],
                responseData: pdfData,
                layerResults: buildPdfLayerResults(respItem, 10, cfg.LayerConfig),
                meta: { submittedBy: submittedByEmail, submittedAt: new Date().toISOString(), formTitle: cfg.Title as string, formVersion: formVer, formStatus: "submitted", referenceNo: respItem[REFERENCE_NO_FIELD] ? String(respItem[REFERENCE_NO_FIELD]) : undefined },
                isoStandards: isoStandardsText,
                logoUrl: logoUrl || "/logo-128.png",
                pdfConfig: versionMeta.pdfConfig && typeof versionMeta.pdfConfig === "object" && !Array.isArray(versionMeta.pdfConfig)
                  ? { ...(versionMeta.pdfConfig as NonNullable<PdfFormData["pdfConfig"]>), ...(hasManualPaperWorkflow ? { enabled: true, includeEmptyEvaluationFields: true } : {}) }
                  : hasManualPaperWorkflow ? { enabled: true, title: "Manual Workflow Form", deliveryMethod: "sharepoint", includeEmptyEvaluationFields: true } : undefined,
                documentHeader: versionMeta.documentHeader && typeof versionMeta.documentHeader === "object" && !Array.isArray(versionMeta.documentHeader)
                  ? versionMeta.documentHeader as PdfFormData["documentHeader"]
                  : undefined,
              }, {
                onGeneratedBlob: async (blob) => {
                  if (!hasManualPaperWorkflow) return;
                  manualPdfAttachment = {
                    name: safePdfFileName(cfg.Title as string, responseItemId),
                    contentType: "application/pdf",
                    contentBytes: await blobToBase64(blob),
                  };
                },
              });
              if (hasManualPaperWorkflow) {
                const pdfLink = pdfUrl.startsWith("http") ? pdfUrl : `${new URL(SP_SITE_URL).origin}${pdfUrl}`;
                const manualNoticeSlug = (cfg.Slug as string) || (cfg.slug as string) || formId || "";
                await fetch("/api/send-email", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Requested-With": "XMLHttpRequest",
                    ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
                  },
                  body: JSON.stringify({
                    sendToConfiguredSender: true,
                    subject: `Manual workflow PDF ready: ${cfg.Title as string}`,
                    body: `A submission matched a manual paper workflow rule.<br/><br/>Form: ${cfg.Title as string}<br/>Submission ID: ${result.Id}<br/>The manual evaluation/approval PDF is attached.<br/><a href="${pdfLink}">Open generated PDF record</a>`,
                    ...(isTestRun ? { testTicket, slug: manualNoticeSlug } : {}),
                    attachments: manualPdfAttachment ? [manualPdfAttachment] : undefined,
                  }),
                });
              }
            }
          } catch {
            // Submission remains successful when optional PDF generation is unavailable.
          }
        }
      } else {
        submittedByEmail = "GUEST";
        body.SubmittedBy = submittedByEmail;

        // Extract matrix data from raw submission (for server-side child list writing)
        const matrixData: Record<string, { rows: Record<string, unknown>[]; columns: { name: string; title: string; cellType?: string; choices?: string[] }[] }> = {};
        if (enrichedSurveyJsonRef.current) {
          const pages = (enrichedSurveyJsonRef.current as unknown as Record<string, unknown>).pages as { elements?: Record<string, unknown>[] }[] | undefined;
          if (pages) {
            const walk = (els: Record<string, unknown>[]) => {
              for (const el of els) {
                if ((el.type === "dynamicmatrix" || el.type === "matrixdynamic") && el.name) {
                  const rawVal = raw[el.name as string];
                  if (rawVal && typeof rawVal === "object") {
                    const rows = (rawVal as Record<string, unknown>).rows as Record<string, unknown>[] | undefined;
                    if (Array.isArray(rows) && rows.length > 0) {
                      matrixData[el.name as string] = {
                        rows,
                        columns: (el.columns as { name: string; title: string; cellType?: string; choices?: string[] }[]) || [],
                      };
                    }
                  }
                }
                if (el.elements) walk(el.elements as Record<string, unknown>[]);
              }
            };
            for (const page of pages) { if (page.elements) walk(page.elements); }
          }
        }

        // A guest member's own session, so the row records who sent it rather
        // than the word "GUEST". Absent for a genuinely anonymous visitor, who
        // still submits exactly as before. The server verifies this and ignores
        // any address in the body — this endpoint is public.
        const guestSession = readStoredGuestSession();

        const res = await fetch("/api/submit-form", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
            ...(guestSession ? { Authorization: `Bearer ${guestSession.token}` } : {}),
          },
          body: JSON.stringify({
            listTitle: cfg.Title,
            formVersion: cfg.CurrentVersion,
            publishKey: cfg.CurrentPublishKey || publishKey,
            body,
            matrixData: Object.keys(matrixData).length > 0 ? matrixData : undefined,
            pdpaConsent: true,
            pdpaNoticeVersion: getPdpaNoticeVersion(pdpaLocale),
            pdpaConsentedAt: body.PDPAConsentAt,
            retentionUntil: body.RetentionUntil,
            // The server re-reads the instance and writes the locked answers
            // from the record. Sending it is a claim, not a shortcut.
            ...(instanceToken ? { instanceToken } : {}),
            ...(isTestRun ? { testTicket } : {}),
          }),
        });
        const resData = await res.json().catch(() => ({})) as { id?: string; referenceNo?: string; error?: string };
        if (!res.ok) { throw new Error(resData.error || `Submit failed: ${res.status}`); }
        if (resData.referenceNo) setSubmittedReference(resData.referenceNo);

        // If API returned parent item ID and we have matrixData, try server-side child list write
        // (API creates child items using system credential; we verify via RowIds response field)
        if (resData.id && Object.keys(matrixData).length > 0) {
          // The API already handled child list creation if successful
          // Nothing more to do client-side for guest path
        }
      }
      // Success — function returns normally; errors propagate to caller (useEffect)
      // pdpaLocale must stay in the deps: a stale closure would stamp the consent
      // record with a language the respondent was no longer reading.
  }, [formData, userEmail, accounts, pdpaLocale, instanceInfo]);

  // Which page the respondent is on is runtime state now, not something to
  // mirror into React through event subscriptions.
  const isLastSurveyPage = !formReady || runtime.isLastPage;

  // Run submission logic when onCompleting triggers the loading state
  useEffect(() => {
    if (submitStatus !== "loading") return;
    let cancelled = false;
    doSubmitForm()
      .then(() => { if (!cancelled) setSubmitStatus("success"); })
      .catch((err) => {
        // Respondents get the generic message below; the reason goes to the
        // console only, because these carry SharePoint list and column names
        // and a public form can be filled in by anyone.
        console.error("[DynamicFormPage] submission failed:", err);
        if (!cancelled) setSubmitStatus("error");
      });
    return () => { cancelled = true; };
  }, [submitStatus, doSubmitForm]);

  const handleSignIn = useCallback(() => {
    try {
      sessionStorage.setItem("pmw_post_login_redirect", window.location.pathname + window.location.search);
    } catch {
      // May fail if storage is inaccessible
    }
    instance.loginRedirect({ ...loginRequest, redirectStartPage: window.location.href });
  }, [instance]);
  const handleSignOut = useCallback(() => {
    clearStoredAuthDecision();
    instance.logoutRedirect({ postLogoutRedirectUri: window.location.href });
  }, [instance]);

  // While the overlay is up the page behind it must not scroll, or the
  // respondent can drift away from a screen that is asking them to wait.
  useEffect(() => {
    if (submitStatus !== "loading") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [submitStatus]);

  // A failed submission is announced and focused, so it is not left sitting
  // below the fold on a form the respondent has already scrolled past.
  useEffect(() => {
    if (submitStatus !== "error") return;
    const node = submitErrorRef.current;
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.focus({ preventScroll: true });
  }, [submitStatus]);

  // Generate QR when modal opens
  useEffect(() => {
    if (!showQr) return;
    let cancelled = false;
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(shareUrl, { width: 280, margin: 2, color: { dark: editorial.navyDeep, light: editorial.white } }),
      )
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [showQr]);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <style>{globalCss(t)}</style>
      <Spinner t={t} />
      <div style={{ fontSize: 13, color: t.textMuted, animation: "pulse 1.5s infinite" }}>Loading form...</div>
    </div>
  );

  // A form that loaded without survey content can never be filled in or submitted —
  // say so instead of sitting on a spinner forever.
  if (!error && !formData?.surveyJson) return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{globalCss(t)}</style>
      <div style={{ background: t.cardBg, borderRadius: 12, padding: "56px 44px", maxWidth: 420, textAlign: "center", boxShadow: t.shadowLg, border: `1px solid ${t.border}` }}>
        <div style={{ fontSize: 44, marginBottom: 18 }}>ERR</div>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: t.red, marginBottom: 10 }}>Form unavailable</div>
        <p style={{ color: t.textSecond, fontSize: 13, lineHeight: 1.7 }}>This link has no published form content. Please ask HR to republish the form and share the link again.</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{globalCss(t)}</style>
      <div style={{ background: t.cardBg, borderRadius: 12, padding: "56px 44px", maxWidth: 420, textAlign: "center", boxShadow: t.shadowLg, border: `1px solid ${t.border}` }}>
        <div style={{ fontSize: 44, marginBottom: 18 }}>ERR</div>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: t.red, marginBottom: 10 }}>Form not found</div>
        <p style={{ color: t.textSecond, fontSize: 13, lineHeight: 1.7 }}>{error}</p>
      </div>
    </div>
  );

  // Still resolving the link: hold the spinner rather than flashing the general
  // form and then rewriting it with the event's answers a moment later.
  if (instanceToken && instanceInfo === undefined) return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <style>{globalCss(t)}</style>
      <Spinner t={t} />
      <div style={{ fontSize: 13, color: t.textMuted, animation: "pulse 1.5s infinite" }}>Loading form...</div>
    </div>
  );

  if (instanceToken && instanceInfo === null) return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{globalCss(t)}</style>
      <div style={{ background: t.cardBg, borderRadius: 12, padding: "56px 44px", maxWidth: 420, textAlign: "center", boxShadow: t.shadowLg, border: `1px solid ${t.border}` }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: t.red, marginBottom: 10 }}>Link not recognised</div>
        <p style={{ color: t.textSecond, fontSize: 13, lineHeight: 1.7 }}>
          This link does not match any current event for {formTitle}. Please check with whoever shared it.
        </p>
      </div>
    </div>
  );

  /*
    Closed and expired get a page naming the event, deliberately NOT a 404.
    Someone scanning a poster after the event should learn they are late, not
    that the link is broken.
  */
  if (instanceInfo && instanceInfo.state !== "open") return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{globalCss(t)}</style>
      <div style={{ background: t.cardBg, borderRadius: 12, padding: "56px 44px", maxWidth: 440, textAlign: "center", boxShadow: t.shadowLg, border: `1px solid ${t.border}` }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: t.textPrimary, marginBottom: 10 }}>
          This form has closed
        </div>
        <p style={{ color: t.textSecond, fontSize: 13, lineHeight: 1.7 }}>
          {instanceInfo.title || formTitle} is no longer accepting responses
          {instanceInfo.state === "expired" && instanceInfo.expiresAt
            ? `. It closed on ${new Date(instanceInfo.expiresAt).toLocaleDateString()}.`
            : "."}
        </p>
        <p style={{ color: t.textMuted, fontSize: 12.5, lineHeight: 1.7, marginTop: 12 }}>
          If you still need to respond, please contact HR.
        </p>
      </div>
    </div>
  );

  if (!isPublicForm && !isAuthenticated) return (<><style>{globalCss(t)}</style><PrivateGate formTitle={formTitle} onSignIn={handleSignIn} t={t} /></>);

  return (
    <div style={{ minHeight: "100vh", background: t.bg }}>
      <style>{globalCss(t)}</style>
      <ScrollProgress t={t} />
      {/*
        The test-run banner and the header stick together as one block
        rather than the banner being `position: fixed` over a hardcoded
        spacer. A hardcoded spacer height silently stops matching the
        banner's real height the moment the banner wraps to two lines (e.g.
        on a narrow viewport with a long test address) — the header would
        then sit half-covered. Stacking both inside one `position: sticky`
        container means the header is simply pushed down by however tall
        the banner actually rendered, on any viewport, with no height to
        keep in sync.
      */}
      <div style={{ position: "sticky", top: 0, zIndex: 50 }}>
        {isTestRun && (
          <div
            role="status"
            style={{
              background: editorial.error,
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.03em",
              textAlign: "center",
              padding: "10px 12px",
              lineHeight: 1.4,
              boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
            }}
          >
            TEST RUN — emails go only to {testEmailDisplay || "the nominated test address"}
          </div>
        )}
        <header className="dfp-header" style={{ background: t.cardBg, borderBottom: `1px solid ${t.border}`, minHeight: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", gap: 10, boxShadow: "0 1px 2px rgba(17,24,39,0.04)" }}>
          <div className="dfp-header-left" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <Logo size={{ xs: 26, sm: 28, md: 32 }} />
            <span className="dfp-title" style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 15, color: t.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{formTitle}</span>
            {pinVersion && <span className="dfp-badge" style={{ fontSize: 10, fontWeight: 700, color: t.amber, background: t.amberPale, borderRadius: 12, padding: "2px 8px", whiteSpace: "nowrap" }}>v{pinVersion}</span>}
            {!isPublicForm && <span className="dfp-badge" style={{ fontSize: 10, fontWeight: 700, color: t.purple, background: t.purplePale, borderRadius: 12, padding: "2px 8px", whiteSpace: "nowrap" }}>Private</span>}
          </div>
          <div className="dfp-header-right" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button onClick={() => { setShowQr(true); setCopied(false); }} title="Share this form" style={{ height: 30, width: 30, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${t.border}`, borderRadius: 12, background: "none", color: t.textSecond, cursor: "pointer", padding: 0, lineHeight: 0 }}><IosShareIcon style={{ fontSize: 15 }} /></button>
            {isAuthenticated ? (
              <>
                <div className="dfp-user-badge" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: t.textSecond }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: t.green, flexShrink: 0 }} />
                  <span className="dfp-user-name">{userEmail?.split("@")[0]}</span>
                </div>
                <button onClick={handleSignOut} style={{ height: 30, padding: "0 10px", border: `1px solid ${t.border}`, borderRadius: 12, background: "none", color: t.textSecond, fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans'", whiteSpace: "nowrap" }}>Sign out</button>
              </>
            ) : (<button onClick={handleSignIn} style={{ height: 30, padding: "0 12px", border: `1px solid ${t.purpleMid}`, borderRadius: 12, background: "none", color: t.purple, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans'", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}><MsIcon /> Sign in</button>)}
            <span className="dfp-version" style={{ fontSize: 10, color: t.textMuted, whiteSpace: "nowrap" }}>v{formVersion}</span>
          </div>
        </header>
      </div>

      {showBanner && (
        <div className="dfp-banner" style={{ borderBottom: `1px solid ${t.border}`, background: t.cardBg }}>
          <div style={{ background: `linear-gradient(135deg,${t.purpleDark},${t.purple})`, padding: "14px 20px" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0, marginBottom: 3 }}>{isoStandardsText}</div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 17, color: "#fff" }}>{formTitle}</div>
          </div>
          {/* Logo beside the document control block, the way the printed form
              carries them. The company used to sit here, because SurveyJS could
              not draw the managed field — the engine draws it inside the form
              now, so a chooser up here would only ask the same question twice. */}
          <div className="dfp-banner-row" style={{ display: "flex", alignItems: "stretch", borderTop: `1px solid ${t.border}` }}>
            <div className="dfp-banner-logo" style={{ width: 150, flexShrink: 0, borderRight: `1px solid ${t.border}`, background: t.offWhite, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src={logoUrl || "/logo-128.png"} alt="Company Logo" style={{ maxWidth: "100%", maxHeight: 48, objectFit: "contain" }} />
            </div>
            <div className="dfp-doc-control" aria-label="Document control metadata">
              {[
                ["Document Number:", documentHeader.documentNumber],
                ["Issue Number:", documentHeader.issueNumber],
                ["Effective Date:", documentHeader.effectiveDate],
                ["Revision Number:", documentHeader.revisionNumber],
                ["Revision Date:", documentHeader.revisionDate],
              ].map(([label, value]) => (
                <div className="dfp-doc-cell" key={label}>
                  <span className="dfp-doc-label">{label}</span>
                  {value && <span className="dfp-doc-value">{value}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="dfp-content" style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px 88px", animation: "fadeUp .3s ease" }}>
        {submitStatus === "success" ? (
          <SuccessScreen formTitle={formTitle} referenceNo={submittedReference} t={t} isTestRun={isTestRun} testEmailDisplay={testEmailDisplay} />
        ) : (
          <div>
            {!isPublicForm && isAuthenticated && (
              <div style={{ background: t.greenPale, border: `1px solid ${t.greenBorder}`, borderRadius: 12, padding: "12px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg,${t.green},#34D399)`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700 }}>{(userEmail?.[0] || "?").toUpperCase()}</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 700, color: t.green }}>Submitting as yourself</div><div style={{ fontSize: 11, color: t.textSecond }}>{userEmail}</div></div>
                <button onClick={handleSignOut} style={{ fontSize: 11, color: t.textSecond, background: "none", border: `1px solid ${t.border}`, borderRadius: 7, padding: "5px 11px", cursor: "pointer", fontFamily: "'DM Sans'" }}>Sign out</button>
              </div>
            )}
            {formReady ? <div className="dfp-survey-wrap"><NativeFormView runtime={runtime} dark={dark} /></div> : !enrichedSurveyJson && formData && !error ? <div style={{ textAlign: "center", padding: 40, color: t.textMuted, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}><Spinner t={t} /><span>Preparing form...</span></div> : <div style={{ textAlign: "center", padding: 40, color: t.textMuted }}>Unable to render form.</div>}
            {formReady && isLastSurveyPage && (
              <>
                {isTestRun && (
                  <div role="status" style={{ marginTop: 18, padding: "12px 16px", background: editorial.errorSoft, border: "1px solid #B91C1C", borderRadius: 12, color: editorial.error, fontSize: 13, fontWeight: 700, textAlign: "center" }}>
                    You are about to submit a TEST RUN, not a real request. Every email it generates will go only to {testEmailDisplay || "the nominated test address"}.
                  </div>
                )}
                <div className="dfp-pdpa-consent" style={{ background: t.cardBg, border: `1px solid ${pdpaConsentError ? t.red : t.border}`, borderRadius: 12, padding: "14px 16px", marginTop: 18, boxShadow: t.shadow }}>
                  <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      ref={consentRef}
                      aria-invalid={pdpaConsentError ? true : undefined}
                      aria-describedby={pdpaConsentError ? "dfp-consent-error" : undefined}
                      checked={pdpaAccepted}
                      onChange={(e) => {
                        setPdpaAccepted(e.target.checked);
                        if (e.target.checked) setPdpaConsentError("");
                      }}
                      style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 12, lineHeight: 1.7, color: t.textSecond }} lang={pdpaLocale}>
                      <span style={{ display: "block", marginBottom: 6 }}>
                        <PdpaLanguageToggle
                          locale={pdpaLocale}
                          onChange={setPdpaLocale}
                          color={t.purple}
                          mutedColor={t.textMuted}
                        />
                      </span>
                      <strong style={{ color: t.textPrimary }}>{pdpa.consentLabel}</strong><br />
                      {pdpa.summary}{" "}
                      <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: t.purple, fontWeight: 700 }}>
                        {pdpa.ui.viewNotice}
                      </a>
                    </span>
                  </label>
                  {pdpaConsentError && <div id="dfp-consent-error" role="alert" style={{ color: t.red, fontSize: 12, fontWeight: 700, marginTop: 8 }}>{pdpaConsentError}</div>}
                </div>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitStatus === "loading"}
                  style={{
                    width: "100%",
                    minHeight: 46,
                    marginTop: 14,
                    border: "none",
                    borderRadius: 12,
                    background: submitStatus === "loading" ? t.purpleMid : t.purple,
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: submitStatus === "loading" ? "wait" : "pointer",
                    boxShadow: t.shadowFab,
                  }}
                >
                  {submitStatus === "loading" ? "Submitting..." : "Submit"}
                </button>
              </>
            )}
            {submitStatus === "error" && <div ref={submitErrorRef} tabIndex={-1} role="alert" style={{ outline: "none", marginTop: 16, padding: "13px 16px", background: t.redPale, border: "1px solid #FCA5A5", borderRadius: 12, color: t.red, fontSize: 13, fontWeight: 700, display: "flex", flexDirection: "column", gap: 8 }}>
              <div>Submission could not be completed. Your answers are still on this page; review them and try again.</div>
              <button onClick={handleSubmit} style={{ alignSelf: "flex-start", padding: "8px 18px", border: "none", borderRadius: 12, background: t.red, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans'" }}>Retry submission</button>
            </div>}
          </div>
        )}
        <div style={{ marginTop: 32, textAlign: "center", fontSize: 11, color: t.textMuted }}>PMW International Berhad HR Forms</div>
      </div>

      {submitStatus === "loading" && <SubmittingOverlay t={t} hasUploads={hasUploads} />}

      {showQr && (
        <div onClick={() => setShowQr(false)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: "fadeUp .2s ease", backdropFilter: "blur(2px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: "32px 28px 24px", maxWidth: 320, width: "100%", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: editorial.navyDeep, marginBottom: 4 }}>Share this form</div>
            <div style={{ fontSize: 12, color: editorial.muted, marginBottom: 20, lineHeight: 1.5 }}>Scan the QR code or copy the link below</div>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Code" style={{ width: 200, height: 200, display: "block", margin: "0 auto 16px", borderRadius: 12 }} />
            ) : (
              <div style={{ width: 200, height: 200, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", color: editorial.softMuted, fontSize: 12 }}>Generating...</div>
            )}
            <div style={{ fontSize: 11, color: editorial.muted, wordBreak: "break-all", padding: "10px 12px", background: editorial.skySoft, borderRadius: 12, marginBottom: 18, lineHeight: 1.5 }}>
              {shareUrl}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => { navigator.clipboard.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {}); }} style={{ flex: 1, padding: "10px", border: `1px solid ${copied ? editorial.success : editorial.sky}`, borderRadius: 12, background: copied ? editorial.successSoft : "none", color: copied ? editorial.success : editorial.muted, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans'", transition: "all .2s" }}>{copied ? "Copied!" : "Copy Link"}</button>
              <button onClick={() => setShowQr(false)} style={{ flex: 1, padding: "10px", border: "none", borderRadius: 12, background: "linear-gradient(135deg,#005A9E,#0078D4)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans'" }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import {
  useMsal,
  useIsAuthenticated,
} from "@azure/msal-react";
import type { AccountInfo } from "@azure/msal-browser";
import { ThemeProvider, CssBaseline, Box } from "@mui/material";
import theme from "./theme";
import { loginRequest } from "./auth/msalConfig";
import { useGuestSession } from "./auth/useGuestSession";
import { createSpClient, isSharePointForbiddenError } from "./utils/sharepointClient";
import {
  AUTH_RECOVERY_REQUIRED_EVENT,
  acquireAccessTokenSilentOrRedirect,
  clearAuthTimeoutReloginAttempt,
  hasAuthTimeoutReloginAttempted,
  isAuthTimeoutReloginRequiredError,
  isStaleAuthError,
  markAuthTimeoutReloginAttempted,
  notifyAuthRecoveryRequired,
  startFreshReauthentication,
} from "./utils/authRecovery";
import type { AuthRecoveryEventDetail } from "./utils/authRecovery";
import { SP_STATIC, loadConfig, filterVisibleLists, getMissingConfigs, generateMeta, surveySnapshotKey } from "./utils/spConfig";
import { getStoredAuthDecision, setStoredAuthDecision, clearStoredAuthDecision } from "./utils/authDecision";
import type { PageState, Submission, ApprovalLayer, DiscoveredList, ListMetaEntry, LoadedConfig, LayerConfig, LayerConfigItem, ApprovalLayerConfig, ApprovalLayerResult, EvaluationLayerResult, EvaluationDataEntry, HardDeleteSubmissionResult, SurveyJson } from "./types";
import {
  fetchOwnMember,
  type GuestMemberSummary,
  type GuestSession,
} from "./utils/guestMemberService";
import { forgetGoogleAccount } from "./auth/googleSignIn";
import { normalizeLayerStatus } from "./utils/statusConstants";
import { coerceFieldDisplayText, isPlaceholderDisplayValue } from "./utils/submissionDisplay";
import { APPLICANT_NAME_FIELD_KEYS } from "./utils/applicantName";
import { isRejectedStatus, resolveWorkflowDisplayState } from "./utils/workflowStatus";
import {
  EMPTY_SUBMISSION_FILTERS,
  hasActiveFilters,
  sortSubmissions,
  submissionMatchesFilters,
} from "./utils/submissionFilters";
import type { SubmissionFilterState } from "./utils/submissionFilters";
import { REFERENCE_NO_FIELD } from "./utils/referenceNumber";
import { isTestRow } from "./utils/testRun";

// Auth screens
import ChoiceScreen from "./components/auth/ChoiceScreen";
import GuestLanding from "./components/auth/GuestLanding";
import WrongTenantScreen from "./components/auth/WrongTenantScreen";
import RestrictedAccessScreen from "./components/auth/RestrictedAccessScreen";
import LoadingScreen, { type LoadingStep } from "./components/auth/LoadingScreen";
import ErrorScreen from "./components/auth/ErrorScreen";
import AdminGuard from "./components/auth/AdminGuard";
import ErrorBoundary from "./components/ErrorBoundary";
import LazyRoute from "./components/LazyRoute";
import { DashboardProvider } from "./contexts/DashboardContext";
import AppShell from "./components/shell/AppShell";



const APP_BG = "var(--app-bg, linear-gradient(180deg, #BFDDF4 0%, #DCECF8 45%, #F7F5EF 100%))";
const DASHBOARD_LIST_FETCH_CONCURRENCY = 4;
// Rows per request. `queryList` follows SharePoint's page links from here to the
// end of each list, so this is a page size and not a ceiling on what is shown.
const DASHBOARD_LIST_PAGE_SIZE = 500;
// The screens that read `submissions`. Everything else - the builder,
// approvals, routing, careers - is served without them.
//
// Forms and My Submissions joined the two dashboards when the single dashboard
// page was split into sections: the form cards show a per-form submission count
// and the submissions list is the rows themselves, so both need the fetch that
// used to happen only on `/admin/dashboard`. Missing one off this set does not
// fail loudly -- the page simply renders as though the account had submitted
// nothing, which reads as data loss rather than as a missing fetch.
const DASHBOARD_ROUTE_PATHS = new Set([
  "/admin/dashboard",
  "/user/dashboard",
  "/forms",
  "/submissions",
]);
type SubmissionsLoadStatus = "idle" | "loading" | "ready";
const AUTH_PROFILE_REAUTH_TIMEOUT_MS = 60000;
const INTERNAL_EMAIL_DOMAINS = String(import.meta.env.VITE_INTERNAL_EMAIL_DOMAINS || "pmw-group.com")
  .split(",")
  .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);
type AuthProfileStatus = "unknown" | "loading" | "ready" | "restricted";
const AUTH_LOAD_STEP_ORDER = [
  "session",
  "site",
  "permissions",
  "lists",
  "finalizing",
  "reauth",
] as const;
type AuthLoadStep = (typeof AUTH_LOAD_STEP_ORDER)[number];
type AuthErrorMode = "generic" | "reauth";
const AUTH_LOAD_STEP_TEXT: Record<AuthLoadStep, Pick<LoadingStep, "label" | "description">> = {
  session: {
    label: "Confirm Microsoft 365 session",
    description: "Checking the signed-in account and token state.",
  },
  site: {
    label: "Check SharePoint access",
    description: "Confirming this account can reach the PMW HR Docs site.",
  },
  permissions: {
    label: "Load portal permissions",
    description: "Reading HR Forms Owner and Form Builder Superuser access.",
  },
  lists: {
    label: "Discover form lists",
    description: "Finding the form libraries this account can use.",
  },
  finalizing: {
    label: "Finish portal setup",
    description: "Preparing the dashboard view.",
  },
  reauth: {
    label: "Refresh Microsoft sign-in",
    description: "Starting one fresh sign-in attempt after the timeout.",
  },
};

const DETAIL_PASSTHROUGH_FIELDS = new Set([
  "Created",
  "Modified",
  "PDPAConsent",
  "PDPANoticeVersion",
  "PDPAConsentAt",
  "RetentionUntil",
]);

// Shared with the workflow emails, so the dashboard and the notification
// subject line never disagree about whose request a submission is.
const SUBMITTER_NAME_FIELD_KEYS = APPLICANT_NAME_FIELD_KEYS;

const SUBMITTER_IDENTITY_FIELD_KEYS = new Set([
  "submittedby",
  "submittedbyemail",
  "submitter",
  "submitteremail",
]);

function normalizeFieldKey(key: string): string {
  return key
    .replace(/_x[0-9a-f]{4}_/gi, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function findDisplayTextByKey(raw: Record<string, unknown>, keys: Set<string>): string {
  for (const [key, value] of Object.entries(raw)) {
    if (!keys.has(normalizeFieldKey(key))) continue;
    const text = coerceFieldDisplayText(value);
    if (!isPlaceholderDisplayValue(text)) return text;
  }
  return "";
}

function cleanIdentityText(value: string): string {
  const trimmed = value.trim();
  const lastPipeSegment = trimmed.includes("|") ? trimmed.split("|").pop() ?? trimmed : trimmed;
  return lastPipeSegment.replace(/^mailto:/i, "").trim();
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanIdentityText(value));
}

function resolveSubmittedByEmail(raw: Record<string, unknown>): string {
  const candidates = [
    raw.submittedByEmail,
    raw.SubmittedBy,
    raw.Submitted_x0020_By,
  ];

  for (const candidate of candidates) {
    const text = cleanIdentityText(coerceFieldDisplayText(candidate));
    if (!isPlaceholderDisplayValue(text) && isEmailLike(text)) return text;
  }

  return "";
}

function resolveCreatedByEmail(raw: Record<string, unknown>): string {
  const author = raw.Author as Record<string, unknown> | undefined;
  const email = cleanIdentityText(coerceFieldDisplayText(raw._authorEmail ?? author?.EMail ?? author?.Email));
  return !isPlaceholderDisplayValue(email) && isEmailLike(email) ? email : "";
}

function resolveSubmitterName(raw: Record<string, unknown>): string {
  const directName = findDisplayTextByKey(raw, SUBMITTER_NAME_FIELD_KEYS);
  if (!isPlaceholderDisplayValue(directName)) return cleanIdentityText(directName);

  const identityName = findDisplayTextByKey(raw, SUBMITTER_IDENTITY_FIELD_KEYS);
  if (!isPlaceholderDisplayValue(identityName) && !isEmailLike(identityName)) {
    return cleanIdentityText(identityName);
  }

  return "";
}

function resolveCreatedByName(raw: Record<string, unknown>): string {
  const author = raw.Author as Record<string, unknown> | undefined;
  const authorName = coerceFieldDisplayText(author?.Title ?? author?.Name ?? author?.DisplayName);
  if (!isPlaceholderDisplayValue(authorName)) return cleanIdentityText(authorName);

  const authorEmail = cleanIdentityText(coerceFieldDisplayText(raw._authorEmail ?? author?.EMail ?? author?.Email));
  if (!isPlaceholderDisplayValue(authorEmail)) return authorEmail;

  return "";
}

function resolveSubmissionTitle(rawTitle: unknown, submitterName: string, submittedByEmail: string, createdByName: string, createdByEmail: string): string {
  const title = coerceFieldDisplayText(rawTitle);
  if (!isPlaceholderDisplayValue(title)) return title;

  if (!isPlaceholderDisplayValue(submitterName)) return submitterName;
  if (!isPlaceholderDisplayValue(submittedByEmail)) return submittedByEmail;
  if (!isPlaceholderDisplayValue(createdByName)) return createdByName;
  if (!isPlaceholderDisplayValue(createdByEmail)) return createdByEmail;
  return "Untitled";
}

function resolveSelectedBranch(raw: Record<string, unknown>): string {
  return (
    coerceFieldDisplayText(raw.SelectedBranch) ||
    coerceFieldDisplayText(raw.Selected_x0020_Branch) ||
    coerceFieldDisplayText(raw.selectedBranch)
  );
}

function getActiveLayerConfig(cfg: LayerConfig | null, selectedBranch: string): LayerConfigItem[] {
  const manualBranches = cfg?.manualBranches ?? [];
  if (manualBranches.length > 0) {
    const normalizedBranch = selectedBranch.trim().toLowerCase();
    if (!normalizedBranch) return [];
    return (
      manualBranches.find((branch) =>
        [branch.name, branch.label].some((candidate) => candidate.trim().toLowerCase() === normalizedBranch)
      )?.layers ?? []
    );
  }

  return cfg?.layers ?? [];
}

function resolveSubmissionSurveyJson(
  listTitle: string,
  formVersion: string,
  publishKey: string,
  surveyJsonByFormVersion?: Record<string, Record<string, SurveyJson | null>>,
): SurveyJson | null {
  const formVersions = surveyJsonByFormVersion?.[listTitle];
  if (!formVersions) return null;

  // Exact profile first — two profiles on one version have different schemas.
  // Then the version-only entry for submissions predating PublishKey, then any
  // snapshot at all rather than rendering nothing.
  return formVersions[surveySnapshotKey(formVersion, publishKey)]
    ?? formVersions[formVersion]
    ?? Object.values(formVersions).find((surveyJson): surveyJson is SurveyJson => surveyJson !== null)
    ?? null;
}

function buildAuthLoadingSteps(activeStep: AuthLoadStep, errorStep: AuthLoadStep | null = null): LoadingStep[] {
  const activeIndex = AUTH_LOAD_STEP_ORDER.indexOf(activeStep);

  return AUTH_LOAD_STEP_ORDER.map((step, index) => {
    let status: LoadingStep["status"] = "pending";

    if (errorStep === step) {
      status = "error";
    } else if (index < activeIndex) {
      status = "complete";
    } else if (index === activeIndex) {
      status = "active";
    }

    return {
      ...AUTH_LOAD_STEP_TEXT[step],
      status,
    };
  });
}

const loadDynamicFormPage = () => import("./pages/DynamicFormPage");
const loadApprovalDashboard = () => import("./components/builder/ApprovalDashboard");
const loadResponseViewer = () => import("./components/builder/ResponseViewer");
const loadAdminFormBuilder = () => import("./pages/AdminFormBuilder");
const loadDashboardPage = () => import("./pages/DashboardPage");
const loadFormsPage = () => import("./pages/FormsPage");
const loadMySubmissionsPage = () => import("./pages/MySubmissionsPage");
const loadProfilePage = () => import("./pages/ProfilePage");
const loadAppearancePage = () => import("./pages/AppearancePage");
const loadAdminRoutingPage = () => import("./pages/AdminRoutingPage");
const loadAdminOrgPage = () => import("./pages/AdminOrgPage");
const loadEvaluationPage = () => import("./pages/EvaluationPage");
const loadCareersPage = () => import("./pages/CareersPage");
const loadJobApplyPage = () => import("./pages/JobApplyPage");
const loadJobDetailsPage = () => import("./pages/JobDetailsPage");
const loadPrivacyNoticePage = () => import("./pages/PrivacyNoticePage");
const loadNativeFormPreviewPage = () => import("./pages/NativeFormPreviewPage");
const loadAdminJobsPage = () => import("./pages/AdminJobsPage");
const loadAdminJobManagePage = () => import("./pages/AdminJobManagePage");
const loadAdminCareerPortalCardsPage = () => import("./pages/AdminCareerPortalCardsPage");
const loadLearningMaterialsPage = () => import("./pages/LearningMaterialsPage");
const loadAdminLearningPage = () => import("./pages/AdminLearningPage");
const loadAdminGuestMembersPage = () => import("./pages/AdminGuestMembersPage");
/*
  These two take props, which `LazyRoute` cannot forward — it loads a component
  with no arguments. They are lazily imported all the same, so a staff member
  who never sees either page never downloads them.
*/
const GuestMemberPage = lazy(() => import("./pages/GuestMemberPage"));
const GuestProfileSetupPage = lazy(() => import("./pages/GuestProfileSetupPage"));

function isPublicRoutePath(pathname: string): boolean {
  return (
    pathname === "/privacy" ||
    pathname === "/career-portal" ||
    pathname === "/careers" ||
    pathname.startsWith("/form/") ||
    pathname.startsWith("/native/") ||
    pathname.startsWith("/eval/") ||
    pathname.startsWith("/approval/") ||
    pathname.startsWith("/career-portal/") ||
    pathname.startsWith("/careers/")
  );
}

function getAccountKey(account: AccountInfo | null): string {
  if (!account) return "";
  return account.homeAccountId || account.localAccountId || account.username || "";
}

function getAccountClaim(account: AccountInfo | null, key: string): string {
  const claims = account?.idTokenClaims;
  if (!claims || typeof claims !== "object" || !(key in claims)) return "";
  const value = (claims as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function normalizeAccountEmail(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const loginName = trimmed.includes("|") ? trimmed.split("|").pop() || trimmed : trimmed;
  return loginName.replace(/^mailto:/, "");
}

function getAccountEmailCandidates(account: AccountInfo | null): string[] {
  const candidates = new Set<string>();
  for (const value of [
    account?.username,
    getAccountClaim(account, "preferred_username"),
    getAccountClaim(account, "email"),
    getAccountClaim(account, "upn"),
  ]) {
    if (!value) continue;
    const normalized = normalizeAccountEmail(value);
    if (normalized) candidates.add(normalized);
  }
  return [...candidates];
}

function isInternalAccount(account: AccountInfo | null): boolean {
  if (INTERNAL_EMAIL_DOMAINS.length === 0) return false;
  return getAccountEmailCandidates(account).some((email) => {
    if (email.includes("#ext#")) return false;
    const atIndex = email.lastIndexOf("@");
    if (atIndex === -1) return false;
    return INTERNAL_EMAIL_DOMAINS.includes(email.slice(atIndex + 1));
  });
}

function isUnauthorizedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b401\b/.test(message) || message.toLowerCase().includes("unauthorized");
}

function buildConfiguredListFallback(allowedTitles: Set<string>): DiscoveredList[] {
  return [...allowedTitles]
    .sort((a, b) => a.localeCompare(b))
    .map((title) => ({
      title,
      id: "",
      itemCount: 0,
      created: "",
      hidden: false,
      baseTemplate: 100,
      baseType: 0,
      isCatalog: false,
      isSiteAssetsLibrary: false,
      isApplicationList: false,
      isSystemList: false,
      noCrawl: false,
    }));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}

function mapSubmission(
  raw: Record<string, unknown>,
  listTitle: string,
  listMetaMap: Record<string, ListMetaEntry>,
  layerConfigs?: Record<string, LayerConfig | null>,
  surveyJsonByFormVersion?: Record<string, Record<string, SurveyJson | null>>,
): Submission {
  const id = String(raw.Id || "");
  const formId =
    coerceFieldDisplayText(raw.FormID) ||
    coerceFieldDisplayText(raw.FormId) ||
    coerceFieldDisplayText(raw.formId);
  const formVersion = coerceFieldDisplayText(raw.FormVersion) || "1";
  let formStatus = raw.FormStatus ? String(raw.FormStatus) : null;
  const submittedByEmail = resolveSubmittedByEmail(raw);
  const submitterName = resolveSubmitterName(raw);
  const createdByName = resolveCreatedByName(raw);
  const createdByEmail = resolveCreatedByEmail(raw);
  const title = resolveSubmissionTitle(raw.Title, submitterName, submittedByEmail, createdByName, createdByEmail);
  const submittedAt = raw.SubmittedAt ? String(raw.SubmittedAt) : null;
  const modifiedAt = raw.Modified ? String(raw.Modified) : null;
  const rawCurrentLayerValue = raw.CurrentLayer !== undefined && raw.CurrentLayer !== null && raw.CurrentLayer !== ""
    ? raw.CurrentLayer
    : raw.CurrentApprovalLayer;
  let currentLayer = rawCurrentLayerValue !== undefined && rawCurrentLayerValue !== null && rawCurrentLayerValue !== ""
    ? Number(rawCurrentLayerValue) || 0
    : 0;
  const selectedBranch = resolveSelectedBranch(raw);
  const publishKey = raw.PublishKey ? String(raw.PublishKey) : "";
  const surveyJson = resolveSubmissionSurveyJson(listTitle, formVersion, publishKey, surveyJsonByFormVersion);

  const cfg = layerConfigs?.[listTitle] ?? null;
  const layersConfig = getActiveLayerConfig(cfg, selectedBranch);
  const hasManualBranches = (cfg?.manualBranches?.length ?? 0) > 0;

  let totalLayers = layersConfig.length;
  if (!totalLayers && !hasManualBranches) {
    totalLayers = 1;
    if (raw.L2_Email) totalLayers = 2;
    if (raw.L3_Email) totalLayers = 3;
  }

  const layers: (ApprovalLayer | null)[] = [];
  const enhancedLayers: (ApprovalLayerResult | EvaluationLayerResult | null)[] = [];
  const layerStatusValues: (string | null)[] = [];

  if (layersConfig.length > 0) {
    for (let i = 0; i < layersConfig.length; i++) {
      const lc = layersConfig[i];
      const n = lc.layerNumber;
      const statusVal = raw[`L${n}_Status`] ? String(raw[`L${n}_Status`]) : null;
      const emailVal = raw[`L${n}_Email`] ? String(raw[`L${n}_Email`]) : null;
      const signedAtVal = raw[`L${n}_SignedAt`] ? String(raw[`L${n}_SignedAt`]) : null;
      const rejectionVal = raw[`L${n}_Rejection`] ? String(raw[`L${n}_Rejection`]) : null;
      const signatureVal = raw[`L${n}_Signature`] ? String(raw[`L${n}_Signature`]) : null;
      const canonicalStatus = normalizeLayerStatus(statusVal);
      const rejectionDisplay = rejectionVal || (isRejectedStatus(statusVal) && statusVal !== "Rejected" ? statusVal : null);
      layerStatusValues[i] = statusVal;

      layers.push({
        status: canonicalStatus,
        outcome: canonicalStatus === "approved" ? "approved" : canonicalStatus === "rejected" ? "rejected" : undefined,
        email: emailVal,
        signedAt: signedAtVal,
        rejectionReason: rejectionDisplay,
        signature: signatureVal,
      });

      if (lc.type === "evaluation") {
        let evalData: EvaluationDataEntry | null = null;
        const rawEvalData = raw.EvaluationData as string | undefined;
        if (rawEvalData) {
          try {
            const allEvalData = JSON.parse(rawEvalData) as Record<number, EvaluationDataEntry>;
            evalData = allEvalData[n] ?? null;
          } catch {
            /* Invalid JSON — no eval data */
          }
        }
        enhancedLayers.push({
          layerNumber: n,
          type: "evaluation",
          status: canonicalStatus,
          email: emailVal,
          confirmedAt: evalData?.confirmedAt ?? null,
          fields: evalData?.fields ?? {},
          notes: evalData?.notes ?? (isRejectedStatus(statusVal) && statusVal !== "Rejected" ? statusVal ?? undefined : undefined),
        });
      } else {
        enhancedLayers.push({
          layerNumber: n,
          type: "approval",
          status: canonicalStatus,
          outcome: canonicalStatus === "approved" ? "approved" : canonicalStatus === "rejected" ? "rejected" : undefined,
          email: emailVal,
          signedAt: signedAtVal,
          rejectionReason: rejectionDisplay,
          signature: signatureVal,
          confirmedVia: (lc as ApprovalLayerConfig).confirmationType ?? "signature",
        });
      }
    }
  } else {
    // Legacy path — old L1-L3 loop
    for (let i = 1; i <= 3; i++) {
      const statusVal = raw[`L${i}_Status`] ? String(raw[`L${i}_Status`]) : null;
      const emailVal = raw[`L${i}_Email`] ? String(raw[`L${i}_Email`]) : null;
      const signedAtVal = raw[`L${i}_SignedAt`] ? String(raw[`L${i}_SignedAt`]) : null;
      const rejectionVal = raw[`L${i}_Rejection`] ? String(raw[`L${i}_Rejection`]) : null;
      const signatureVal = raw[`L${i}_Signature`] ? String(raw[`L${i}_Signature`]) : null;
      const canonicalStatus = normalizeLayerStatus(statusVal);
      const rejectionDisplay = rejectionVal || (isRejectedStatus(statusVal) && statusVal !== "Rejected" ? statusVal : null);
      layerStatusValues[i - 1] = statusVal;
      if (i > totalLayers && (statusVal || emailVal || signedAtVal || rejectionVal || signatureVal)) {
        totalLayers = i;
      }
      if (statusVal || emailVal) {
        layers.push({
          status: canonicalStatus,
          outcome: canonicalStatus === "approved" ? "approved" : canonicalStatus === "rejected" ? "rejected" : undefined,
          email: emailVal,
          signedAt: signedAtVal,
          rejectionReason: rejectionDisplay,
          signature: signatureVal,
        });
      }
    }
  }

  const displayState = resolveWorkflowDisplayState({
    formStatus,
    currentLayer,
    totalLayers,
    layerStatuses: layerStatusValues,
  });
  formStatus = displayState.formStatus;
  currentLayer = displayState.currentLayer;

  // Filter internal fields
  const submissionData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const isDashboardInternalField =
      key.startsWith("odata.") ||
      /^L[1-9]_/.test(key) ||
      key === "FormStatus" ||
      key === "CurrentLayer" ||
      key === "EvaluationData" ||
      key === "WorkflowEmailLog" ||
      key === "WorkflowEmailSchedule" ||
      key === "WorkflowAssignmentData" ||
      key === "FormId" ||
      key === "FormID" ||
      key === "FormVersion" ||
      key === "Title" ||
      key === "Id" ||
      key === "_authorEmail" ||
      key === "Author" ||
      key === "SubmittedAt" ||
      key === "Modified" ||
      key === "SubmittedBy" ||
      key === "Submitted_x0020_By" ||
      key === "SelectedBranch" ||
      key === "Selected_x0020_Branch" ||
      key === "PDPAConsent" ||
      key === "PDPANoticeVersion" ||
      key === "PDPAConsentAt" ||
      key === "RetentionUntil" ||
      // Surfaced as the submission's own identifier, not as one answer among many.
      key === REFERENCE_NO_FIELD ||
      key === "AuthorId" ||
      key === "IsTest" ||
      key === "TestEmail" ||
      key === "TestRunLog";

    if (isDashboardInternalField && !DETAIL_PASSTHROUGH_FIELDS.has(key)) {
      continue;
    }
    submissionData[key] = value;
  }

  return {
    id,
    submissionId: id,
    listTitle,
    formId,
    formVersion,
    publishKey: publishKey || undefined,
    referenceNo: raw[REFERENCE_NO_FIELD] ? String(raw[REFERENCE_NO_FIELD]) : undefined,
    currentLayerStatus:
      currentLayer > 0 && layerStatusValues[currentLayer - 1]
        ? String(layerStatusValues[currentLayer - 1])
        : undefined,
    title,
    submittedByEmail,
    submitterName,
    createdByName,
    createdByEmail,
    submittedAt,
    modifiedAt,
    formStatus,
    totalLayers,
    layers: layers.filter(Boolean) as ApprovalLayer[],
    meta: listMetaMap[listTitle] ?? generateMeta(listTitle),
    submissionData,
    currentLayer,
    selectedBranch,
    enhancedLayers: enhancedLayers.length > 0 ? enhancedLayers : undefined,
    layerConfig: cfg,
    surveyJson,
    isTest: isTestRow(raw),
  };
}

/** Catch-all route fallback that redirects in an effect (not during render),
 *  preventing race conditions with user-initiated navigations. */
function CatchAllRedirect({ to }: { to: string }) {
  const nav = useNavigate();
  useEffect(() => { nav(to, { replace: true }); }, [nav, to]);
  return null;
}

export default function App() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const activeAccount = instance.getActiveAccount() ?? accounts[0] ?? null;
  const accountKey = getAccountKey(activeAccount);

  const [pageState, setPageState] = useState<PageState>("checking");
  const [errorMsg, setErrorMsg] = useState("");
  const userEmail = activeAccount?.username || "";
  const [isAdmin, setIsAdmin] = useState(false);
  const [canUseFormBuilder, setCanUseFormBuilder] = useState(false);
  const [authProfileStatus, setAuthProfileStatus] = useState<AuthProfileStatus>("unknown");

  // Dashboard data
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submissionsStatus, setSubmissionsStatus] = useState<SubmissionsLoadStatus>("idle");
  const [submissionsProgress, setSubmissionsProgress] = useState(0);
  const [submissionsLoadStatus, setSubmissionsLoadStatus] = useState("Loading submissions...");
  const [visibleLists, setVisibleLists] = useState<DiscoveredList[]>([]);
  const [loadedConfig, setLoadedConfig] = useState<LoadedConfig | null>(null);
  const [missingConfigs, setMissingConfigs] = useState<string[]>([]);
  const [detailItem, setDetailItem] = useState<Submission | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadStatus, setLoadStatus] = useState("Initializing...");
  const [authLoadStep, setAuthLoadStep] = useState<AuthLoadStep>("session");
  const [authErrorMode, setAuthErrorMode] = useState<AuthErrorMode>("generic");
  const [authErrorStep, setAuthErrorStep] = useState<AuthLoadStep | null>(null);

  // Filters
  const [filters, setFilters] = useState<SubmissionFilterState>(EMPTY_SUBMISSION_FILTERS);
  const [sortBy, setSortBy] = useState("newest");

  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const isPublicRoute = isPublicRoutePath(currentPath);

  const { session: guestSession, signIn: signInGuest, signOut: signOutGuest } = useGuestSession();
  /**
   * A Microsoft account always wins. The two identities can only coexist when
   * someone signs in with M365 on a browser that still holds a guest session,
   * and the richer identity is the right one to honour — the guest session
   * stays stored and takes over again once they sign out of Microsoft.
   */
  const memberModeActive = Boolean(guestSession) && !isAuthenticated;
  const [guestMember, setGuestMember] = useState<GuestMemberSummary | null>(null);

  /**
   * The member record behind the stored session.
   *
   * Re-read on load rather than kept in storage alongside the token, because
   * what it says — whether the profile is complete, whether HR has approved the
   * learning hub — is decided on somebody else's screen and can have changed
   * since this browser last looked. A stored copy would show an approval that
   * had been withdrawn.
   */
  useEffect(() => {
    if (!memberModeActive || !guestSession) {
      setGuestMember(null);
      return;
    }

    let cancelled = false;
    void fetchOwnMember(guestSession.token)
      .then((member) => {
        if (!cancelled) setGuestMember(member);
      })
      .catch(() => {
        // A token the server will not honour any more. Dropping it returns the
        // person to the sign-in screen rather than leaving them on a page whose
        // every request fails.
        if (!cancelled) signOutGuest();
      });

    return () => {
      cancelled = true;
    };
  }, [memberModeActive, guestSession, signOutGuest]);
  const authProfileAccountRef = useRef("");
  // Which account's submissions have been asked for, so opening the dashboard a
  // second time reuses what is already loaded and a new sign-in starts over.
  const submissionsFetchAccountRef = useRef("");
  const authProfileLoadingRef = useRef(false);
  const postAuthRedirectRef = useRef(false);
  const reauthRedirectInProgressRef = useRef(false);
  const authProfileReady = Boolean(accountKey) && authProfileStatus === "ready" && authProfileAccountRef.current === accountKey;
  const authProfileRestricted = Boolean(accountKey) && authProfileStatus === "restricted" && authProfileAccountRef.current === accountKey;

  useEffect(() => {
    if (accounts.length > 0 && !instance.getActiveAccount()) {
      instance.setActiveAccount(accounts[0]);
    }
  }, [instance, accounts]);

  useEffect(() => {
    if (authProfileAccountRef.current === accountKey) return;

    authProfileAccountRef.current = accountKey;
    setAuthProfileStatus("unknown");
    setIsAdmin(false);
    setCanUseFormBuilder(false);
    setSubmissions([]);
    setSubmissionsStatus("idle");
    submissionsFetchAccountRef.current = "";
    setVisibleLists([]);
    setLoadedConfig(null);
    setMissingConfigs([]);
    setDetailItem(null);
    setAuthLoadStep("session");
    setAuthErrorMode("generic");
    setAuthErrorStep(null);
    authProfileLoadingRef.current = false;
    reauthRedirectInProgressRef.current = false;
    postAuthRedirectRef.current = false;
  }, [accountKey]);

  // Auth state machine.
  useEffect(() => {
    if (inProgress !== "none") return;

    // After the initial auth flow completes, ignore subsequent MSAL
    // inProgress transitions (e.g. from token refreshes triggered
    // by app pages) to prevent redirecting
    // the user away from their current page.
    if (isAuthenticated && activeAccount) {
      if (isPublicRoute || authProfileReady) {
        setPageState("ready");
      } else if (authProfileRestricted) {
        setPageState("restricted");
      } else {
        setPageState("loading");
      }
      return;
    }

    if (isPublicRoute) {
      setPageState("guest");
      return;
    }

    // A guest member is signed in, so this is not the sign-in gate — but it is
    // not the staff dashboard either. `member` renders its own small route table.
    if (memberModeActive) {
      setPageState("member");
      return;
    }

    // Check for redirect result first before deciding page state
    const decision = getStoredAuthDecision();
    if (decision === "guest") {
      setPageState("guest");
    } else {
      setPageState("choice");
    }
  }, [isAuthenticated, inProgress, accountKey, isPublicRoute, authProfileReady, authProfileRestricted, memberModeActive]);

  useEffect(() => {
    if (!isAuthenticated || inProgress !== "none" || !activeAccount) return;

    const account = activeAccount;

    let validating = false;
    const validateActiveSession = () => {
      if (validating || document.visibilityState === "hidden") return;
      validating = true;
      void acquireAccessTokenSilentOrRedirect(instance, {
        scopes: loginRequest.scopes,
        account,
      })
        .catch((error: unknown) => {
          if (isAuthTimeoutReloginRequiredError(error) || isStaleAuthError(error)) {
            notifyAuthRecoveryRequired({
              reason: "silent_token_timeout",
              message: "Microsoft 365 session timed out. Reconnecting...",
            });
          }
        })
        .finally(() => {
          validating = false;
        });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        validateActiveSession();
      }
    };

    window.addEventListener("focus", validateActiveSession);
    window.addEventListener("pageshow", validateActiveSession);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", validateActiveSession);
      window.removeEventListener("pageshow", validateActiveSession);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAuthenticated, inProgress, instance, accountKey]);

  useEffect(() => {
    const handleAuthRecoveryRequired = (event: Event) => {
      if (!isAuthenticated || !activeAccount || inProgress !== "none") return;
      if (authProfileLoadingRef.current) return;
      if (reauthRedirectInProgressRef.current) return;

      const detail = event instanceof CustomEvent
        ? event.detail as AuthRecoveryEventDetail | undefined
        : undefined;

      if (hasAuthTimeoutReloginAttempted()) {
        setErrorMsg("The automatic re-login did not finish. Please re-login or sign out to recover your Microsoft 365 session.");
        setAuthErrorMode("reauth");
        setAuthErrorStep("reauth");
        setAuthProfileStatus("unknown");
        setPageState("error");
        return;
      }

      markAuthTimeoutReloginAttempted();
      reauthRedirectInProgressRef.current = true;
      setAuthErrorMode("reauth");
      setAuthErrorStep(null);
      setAuthLoadStep("reauth");
      setLoadProgress(90);
      setLoadStatus(detail?.message || "Microsoft 365 session expired. Reconnecting...");
      setPageState("loading");

      void startFreshReauthentication(instance, loginRequest.scopes, activeAccount).catch((error: unknown) => {
        reauthRedirectInProgressRef.current = false;
        setErrorMsg(error instanceof Error ? error.message : "Could not restart sign-in.");
        setAuthErrorStep("reauth");
        setAuthProfileStatus("unknown");
        setPageState("error");
      });
    };

    window.addEventListener(AUTH_RECOVERY_REQUIRED_EVENT, handleAuthRecoveryRequired);
    return () => window.removeEventListener(AUTH_RECOVERY_REQUIRED_EVENT, handleAuthRecoveryRequired);
  }, [isAuthenticated, inProgress, instance, accountKey]);

  
  useEffect(() => {
    if (pageState !== "loading" || !isAuthenticated || isPublicRoute || !activeAccount || inProgress !== "none") return;
    if (reauthRedirectInProgressRef.current) return;
    if (authProfileLoadingRef.current) return;
    if (authProfileReady) {
      setPageState("ready");
      return;
    }
    if (authProfileRestricted) {
      setPageState("restricted");
      return;
    }

    const account = activeAccount;
    const accountIsInternal = isInternalAccount(account);

    let cancelled = false;
    authProfileLoadingRef.current = true;
    setAuthProfileStatus("loading");
    setLoadProgress(0);
    setLoadStatus("Initializing...");
    setAuthLoadStep("session");
    setAuthErrorMode("generic");
    setAuthErrorStep(null);
    const spClient = createSpClient(instance, [account]);
    const finishProfileLoad = () => {
      authProfileLoadingRef.current = false;
      window.clearTimeout(reauthTimeoutId);
    };
    const showReauthenticationError = (message: string) => {
      finishProfileLoad();
      setErrorMsg(message);
      setAuthErrorMode("reauth");
      setAuthErrorStep("reauth");
      setAuthProfileStatus("unknown");
      setPageState("error");
    };
    const redirectToFreshSignIn = () => {
      window.clearTimeout(reauthTimeoutId);
      setAuthLoadStep("reauth");
      setLoadProgress((current) => Math.max(current, 85));
      if (hasAuthTimeoutReloginAttempted()) {
        showReauthenticationError("The automatic re-login did not finish before the session timed out again. Please re-login to refresh your Microsoft 365 session.");
        return;
      }

      markAuthTimeoutReloginAttempted();
      setLoadStatus("Authentication timed out. Starting a fresh Microsoft 365 sign-in...");
      void startFreshReauthentication(instance, loginRequest.scopes, account).catch((error: unknown) => {
        if (cancelled) return;
        showReauthenticationError(error instanceof Error ? error.message : "Could not restart sign-in.");
      });
    };
    const reauthTimeoutId = window.setTimeout(() => {
      if (!cancelled && authProfileLoadingRef.current) {
        redirectToFreshSignIn();
      }
    }, AUTH_PROFILE_REAUTH_TIMEOUT_MS);

    async function fetchData() {
      try {
        setAuthLoadStep(accountIsInternal ? "session" : "site");
        setLoadStatus(accountIsInternal ? "Preparing PMW account access..." : "Checking SharePoint site access...");
        setLoadProgress(10);
        if (!accountIsInternal) {
          await spClient.ensureSiteAccess();
          if (cancelled) return;
        }

        setAuthLoadStep("permissions");
        setLoadStatus("Loading permissions and form configuration...");
        setLoadProgress(20);
        const [adminResult, builderSuperuserResult, config] = await Promise.all([
          spClient.isGroupMember(SP_STATIC.adminGroup),
          spClient.isGroupMember(SP_STATIC.formBuilderSuperuserGroup),
          loadConfig(spClient),
        ]);
        if (cancelled) return;
        const builderAccessResult = adminResult && builderSuperuserResult;

        let allLists: DiscoveredList[];
        try {
          setAuthLoadStep("lists");
          setLoadStatus("Discovering SharePoint form lists...");
          allLists = await spClient.discoverLists();
        } catch (error) {
          if (!isSharePointForbiddenError(error)) {
            throw error;
          }
          allLists = buildConfiguredListFallback(config.allowedTitles);
        }
        if (cancelled) return;

        setIsAdmin(adminResult);
        setCanUseFormBuilder(builderAccessResult);
        setLoadedConfig(config);
        setLoadProgress(50);

        // Step 4: Filter visible lists
        const visible = filterVisibleLists(allLists, adminResult, config.allowedTitles);
        setVisibleLists(visible);

        // Step 5: Finalize
        //
        // The submissions are deliberately NOT read here. They are the heaviest
        // read the portal makes - every response on every visible list - and
        // only the two dashboard screens show them, so they are fetched when
        // someone opens one. See `loadDashboardSubmissions` below.
        setAuthLoadStep("finalizing");
        setLoadStatus("Finalizing...");
        setLoadProgress(98);
        setMissingConfigs(getMissingConfigs(visible, config.layerConfig));
        setLoadProgress(100);
        setLoadStatus("Ready.");
        clearAuthTimeoutReloginAttempt();
        setAuthErrorMode("generic");
        setAuthErrorStep(null);
        reauthRedirectInProgressRef.current = false;
        authProfileAccountRef.current = accountKey;
        finishProfileLoad();
        setAuthProfileStatus("ready");
        setPageState("ready");
      } catch (err: unknown) {
        if (cancelled) return;
        if (isAuthTimeoutReloginRequiredError(err)) {
          showReauthenticationError(err instanceof Error ? err.message : "Please re-login to refresh your Microsoft 365 session.");
          return;
        }
        if (isStaleAuthError(err)) {
          redirectToFreshSignIn();
          return;
        }
        if (isUnauthorizedError(err)) {
          redirectToFreshSignIn();
          return;
        }
        if (isSharePointForbiddenError(err)) {
          finishProfileLoad();
          setErrorMsg("");
          if (accountIsInternal) {
            setErrorMsg("SharePoint returned 403 for this PMW account while loading portal data. Please confirm the account can open the PMW HR Docs SharePoint site and lists.");
            setAuthErrorMode("generic");
            setAuthErrorStep(null);
            setAuthProfileStatus("unknown");
            setPageState("error");
            return;
          }
          authProfileAccountRef.current = accountKey;
          setAuthProfileStatus("restricted");
          setPageState("restricted");
          return;
        }
        const message = err instanceof Error ? err.message : "Unknown error occurred";
        finishProfileLoad();
        setErrorMsg(message);
        setAuthErrorMode("generic");
        setAuthErrorStep(null);
        setAuthProfileStatus("unknown");
        setPageState("error");
      }
    }

    fetchData();
    return () => {
      cancelled = true;
      finishProfileLoad();
    };
  }, [pageState, isAuthenticated, isPublicRoute, authProfileReady, authProfileRestricted, inProgress, instance, accountKey]);

  // Navigate to preserved route after successful login.
  useEffect(() => {
    if (
      pageState === "ready" &&
      isAuthenticated &&
      authProfileReady &&
      !isPublicRoute &&
      !postAuthRedirectRef.current
    ) {
      postAuthRedirectRef.current = true;
      try {
        const redirectPath = sessionStorage.getItem("pmw_post_login_redirect");
        if (redirectPath) {
          sessionStorage.removeItem("pmw_post_login_redirect");
          // Root or legacy adminhomepage → role-specific dashboard
          if (redirectPath === "/" || redirectPath === "/adminhomepage") {
            navigate(isAdmin ? "/admin/dashboard" : "/user/dashboard", { replace: true });
          } else {
            navigate(redirectPath);
          }
        } else if (currentPath === "/" || currentPath === "/adminhomepage") {
          // No stored redirect — go to role-appropriate dashboard
          navigate(isAdmin ? "/admin/dashboard" : "/user/dashboard", { replace: true });
        }
      } catch {
        // Ignore storage errors
      }
    }
  }, [pageState, isAuthenticated, authProfileReady, isPublicRoute, navigate, isAdmin, currentPath]);

  useEffect(() => {
    if (pageState === "ready" && authProfileReady && isAdmin && currentPath === "/user/dashboard") {
      navigate("/admin/dashboard", { replace: true });
    }
  }, [pageState, authProfileReady, isAdmin, currentPath, navigate]);

  const handleLogin = () => {
    // Check if login already in progress
    if (inProgress !== "none") {
      return;
    }
    
    setStoredAuthDecision("msal");
    clearAuthTimeoutReloginAttempt();
    reauthRedirectInProgressRef.current = false;

    // Preserve current route for post-login redirect
    try {
      sessionStorage.setItem("pmw_post_login_redirect", window.location.pathname + window.location.search);
    } catch {
      // May fail if storage is inaccessible
    }

    // Clear MSAL sessionStorage cache to remove stale interaction state
    // This is the key fix for interaction_in_progress error
    try {
      sessionStorage.removeItem("msal.interaction.status");
      sessionStorage.removeItem("msal.login.error");
    } catch {
      // May fail if storage is inaccessible
    }
    
    instance.loginRedirect(loginRequest);
  };

  const handleGuest = () => {
    setStoredAuthDecision("guest");
    setPageState("guest");
  };

  const handleGuestSignIn = (session: GuestSession, member: GuestMemberSummary) => {
    signInGuest(session);
    setGuestMember(member);
    setPageState("member");
    // Straight to their own page rather than the learning hub: a brand-new
    // member has not been approved for the hub, and landing on a "waiting for
    // review" screen as the very first thing reads as a rejection.
    navigate("/member", { replace: true });
  };

  const handleGuestSignOut = useCallback(() => {
    // Google keeps offering the last account it saw unless told to stop, which
    // makes "sign out" look broken: press it, press Google again, and you are
    // instantly back in as the same person with no chance to switch.
    forgetGoogleAccount();
    signOutGuest();
    setGuestMember(null);
    navigate("/", { replace: true });
  }, [signOutGuest, navigate]);

  const handleSwitchAccount = useCallback(() => {
    clearAuthTimeoutReloginAttempt();
    reauthRedirectInProgressRef.current = false;
    instance.logoutPopup().catch(() => {
      instance.logoutRedirect();
    });
    clearStoredAuthDecision();
    setTimeout(() => {
      instance.loginRedirect(loginRequest);
    }, 100);
  }, [instance]);

  const handleSignOut = useCallback(() => {
    clearAuthTimeoutReloginAttempt();
    reauthRedirectInProgressRef.current = false;
    instance.logoutRedirect();
    clearStoredAuthDecision();
  }, [instance]);

  const handleForgetChoice = () => {
    clearAuthTimeoutReloginAttempt();
    reauthRedirectInProgressRef.current = false;
    clearStoredAuthDecision();
    setPageState("choice");
  };

  const handleGenericRetry = () => {
    reauthRedirectInProgressRef.current = false;
    setAuthProfileStatus("unknown");
    setAuthErrorMode("generic");
    setAuthErrorStep(null);
    setAuthLoadStep("session");
    setLoadProgress(0);
    setLoadStatus("Initializing...");
    setPageState("loading");
  };

  const handleRelogin = () => {
    if (inProgress !== "none") {
      setAuthLoadStep("reauth");
      setLoadProgress((current) => Math.max(current, 85));
      setLoadStatus("Microsoft 365 sign-in is already in progress...");
      setPageState("loading");
      return;
    }

    clearAuthTimeoutReloginAttempt();
    reauthRedirectInProgressRef.current = true;
    setAuthErrorMode("reauth");
    setAuthErrorStep(null);
    setAuthLoadStep("reauth");
    setLoadProgress(90);
    setLoadStatus("Opening Microsoft 365 sign-in...");
    setPageState("loading");

    void startFreshReauthentication(instance, loginRequest.scopes, activeAccount ?? undefined).catch((error: unknown) => {
      reauthRedirectInProgressRef.current = false;
      setErrorMsg(error instanceof Error ? error.message : "Could not restart sign-in.");
      setAuthErrorStep("reauth");
      setAuthProfileStatus("unknown");
      setPageState("error");
    });
  };

  const handleRestrictedRetry = () => {
    reauthRedirectInProgressRef.current = false;
    setAuthProfileStatus("unknown");
    setAuthErrorMode("generic");
    setAuthErrorStep(null);
    setAuthLoadStep("session");
    setLoadProgress(0);
    setLoadStatus("Initializing...");
    setPageState("loading");
  };

  /**
   * The dashboard's submissions, fetched when someone actually opens a
   * dashboard rather than during sign-in.
   *
   * This is the heaviest read the portal makes - every response on every list
   * the account can see - and only the dashboard shows it, so signing in on the
   * way to the builder, routing or careers screens no longer waits behind it.
   * The fetch runs once per signed-in account: coming back to the dashboard
   * shows what is already loaded instead of reading every list again.
   */
  useEffect(() => {
    if (!DASHBOARD_ROUTE_PATHS.has(currentPath)) return;
    if (!authProfileReady || !loadedConfig) return;
    if (submissionsFetchAccountRef.current === accountKey) return;

    const account = activeAccount ?? accounts[0] ?? null;
    if (!account) return;

    const requestAccount = accountKey;
    submissionsFetchAccountRef.current = requestAccount;

    const config = loadedConfig;
    const lists = visibleLists;
    const forAdmin = isAdmin;
    const email = userEmail;

    void (async () => {
      const totalLists = lists.length;
      setSubmissionsStatus("loading");
      setSubmissionsProgress(0);
      setSubmissionsLoadStatus(
        totalLists > 0
          ? `Fetching submissions from ${totalLists} list${totalLists !== 1 ? "s" : ""}...`
          : "No lists to fetch from."
      );

      // Which emails may see a list's submissions without owning them - a layer
      // assignee has to see what is waiting on them.
      const assigneeVisibilityMap: Record<string, Set<string>> = {};
      for (const [title, cfg] of Object.entries(config.layerConfigs || {})) {
        if (!cfg?.layers) continue;
        for (const layer of cfg.layers) {
          if (layer.assignee.type === "user" && layer.assignee.value) {
            if (!assigneeVisibilityMap[title]) assigneeVisibilityMap[title] = new Set();
            assigneeVisibilityMap[title].add(layer.assignee.value.toLowerCase());
          }
        }
      }

      const fetchMetaMap: Record<string, ListMetaEntry> = { ...config.listMetaMap };
      for (const list of lists) {
        if (!fetchMetaMap[list.title]) {
          fetchMetaMap[list.title] = generateMeta(list.title);
        }
      }

      let finalSubmissions: Submission[] = [];
      try {
        const spClient = createSpClient(instance, [account]);
        let completedLists = 0;
        const submissionsByList = await mapWithConcurrency(
          lists,
          DASHBOARD_LIST_FETCH_CONCURRENCY,
          async (list) => {
            setSubmissionsLoadStatus(`Fetching submissions from "${list.title}"...`);

            try {
              const items = await spClient.queryList(list.title, {
                select: "*",
                orderby: "Created desc",
                top: DASHBOARD_LIST_PAGE_SIZE,
              });
              return items.map((item) => mapSubmission(item, list.title, fetchMetaMap, config.layerConfigs, config.surveyJsonByFormVersion));
            } catch {
              return [] as Submission[];
            } finally {
              completedLists += 1;
              setSubmissionsProgress(Math.round((completedLists / Math.max(totalLists, 1)) * 100));
              setSubmissionsLoadStatus(`Fetched ${completedLists}/${totalLists} list${totalLists !== 1 ? "s" : ""}...`);
            }
          },
        );

        const visibleTitles = new Set(lists.map((l) => l.title));
        finalSubmissions = submissionsByList.flat().filter((item) => visibleTitles.has(item.listTitle));
        if (!forAdmin && email) {
          const lowerEmail = email.toLowerCase();
          finalSubmissions = finalSubmissions.filter((item) => {
            // User's own submissions
            if (item.submittedByEmail.toLowerCase() === lowerEmail) return true;
            if (item.createdByEmail?.toLowerCase() === lowerEmail) return true;
            // Submissions where user is a layer assignee
            const assignees = assigneeVisibilityMap[item.listTitle];
            if (assignees?.has(lowerEmail)) return true;
            return false;
          });
        }
      } catch {
        // Each list already falls back to an empty result of its own, so only a
        // failure to build the client itself lands here. The dashboard opens
        // empty rather than holding on a spinner that will never finish.
      }

      // Someone signed in as somebody else while this was in flight - their
      // fetch owns the state now.
      if (submissionsFetchAccountRef.current !== requestAccount) return;
      setSubmissions(finalSubmissions);
      setSubmissionsStatus("ready");
    })();
  }, [currentPath, authProfileReady, loadedConfig, visibleLists, accountKey, activeAccount, accounts, instance, isAdmin, userEmail]);

  // Filter + sort logic
  const filteredSubmissions = submissions.filter((item) => submissionMatchesFilters(item, filters));
  const sortedSubmissions = sortSubmissions(filteredSubmissions, sortBy);

  const listMetaMap = { ...loadedConfig?.listMetaMap };
  for (const list of visibleLists) {
    if (!listMetaMap[list.title]) {
      listMetaMap[list.title] = generateMeta(list.title);
    }
  }

  const hasFilters = hasActiveFilters(filters);

  async function handleHardDeleteSubmission(item: Submission): Promise<HardDeleteSubmissionResult> {
    if (!isAdmin && !canUseFormBuilder) {
      throw new Error("Only HR Forms Owners or form builder superusers can delete submissions.");
    }

    const account = activeAccount ?? accounts[0] ?? null;
    if (!account) {
      throw new Error("No signed-in account is available for SharePoint deletion.");
    }

    const spClient = createSpClient(instance, [account]);
    const result = await spClient.hardDeleteSubmission(item);

    setSubmissions((current) =>
      current.filter((submission) => !(submission.listTitle === item.listTitle && submission.id === item.id))
    );
    setDetailItem((current) =>
      current?.listTitle === item.listTitle && current.id === item.id ? null : current
    );

    return result;
  }

  // ---- Render ----

  if (!isPublicRoute && pageState === "wrong_tenant") {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <WrongTenantScreen userEmail={userEmail} onLogout={handleSignOut} onSwitch={handleSwitchAccount} />
      </ThemeProvider>
    );
  }

  if (!isPublicRoute && pageState === "restricted") {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <RestrictedAccessScreen
          userEmail={userEmail}
          onRetry={handleRestrictedRetry}
          onSwitch={handleSwitchAccount}
          onSignOut={handleSignOut}
        />
      </ThemeProvider>
    );
  }

  if (pageState === "error" && (!isPublicRoute || authErrorMode === "reauth")) {
    const isReauthError = authErrorMode === "reauth";

    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ErrorScreen
          errorMsg={errorMsg}
          onRetry={isReauthError ? handleRelogin : handleGenericRetry}
          onSignOut={handleSignOut}
          title={isReauthError ? "Re-login needed" : undefined}
          primaryActionLabel={isReauthError ? "Re-login" : undefined}
          primaryActionIcon={isReauthError ? "login" : undefined}
          recoverySteps={isReauthError ? buildAuthLoadingSteps("reauth", authErrorStep ?? "reauth") : undefined}
        />
      </ThemeProvider>
    );
  }

  const privateRouteNeedsProfile = isAuthenticated && !isPublicRoute && !authProfileReady;
  if (
    (!isPublicRoute && (pageState === "checking" || pageState === "loading" || privateRouteNeedsProfile)) ||
    (isPublicRoute && pageState === "loading" && authErrorMode === "reauth")
  ) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LoadingScreen
          userEmail={userEmail || undefined}
          progress={loadProgress}
          status={loadStatus}
          steps={buildAuthLoadingSteps(authLoadStep)}
        />
      </ThemeProvider>
    );
  }

  // ---- Portal accounts ----
  //
  // A separate route table rather than a flag threaded through the main one.
  // The gate has to hold for every route that exists now and every route added
  // later, and an allowlist of two cannot leak a dashboard the way twenty
  // individually-guarded routes eventually would. Public routes never reach
  // here — they are handled above, and they are public to everyone anyway.
  if (pageState === "member") {
    // Still reading the member record. Rendering the route table first would
    // flash the profile form at somebody who completed it months ago.
    if (!guestMember) {
      return (
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <LoadingScreen status="Loading your account..." />
        </ThemeProvider>
      );
    }

    /*
      The blocking profile step. Rendered instead of the route table rather than
      as a route inside it, so there is no path — typed, bookmarked or
      redirected to — that reaches anything else while it is outstanding.
    */
    if (!guestMember.profileComplete && guestSession) {
      return (
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <ErrorBoundary>
            <Suspense fallback={<LoadingScreen status="Loading..." />}>
              <GuestProfileSetupPage
                token={guestSession.token}
                member={guestMember}
                onSaved={setGuestMember}
                onSignOut={handleGuestSignOut}
              />
            </Suspense>
          </ErrorBoundary>
        </ThemeProvider>
      );
    }

    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ErrorBoundary>
          <Routes>
            <Route
              path="/member"
              element={
                <ErrorBoundary>
                  <Suspense fallback={<LoadingScreen status="Loading your account..." />}>
                    <GuestMemberPage
                      token={guestSession?.token ?? ""}
                      member={guestMember}
                      onMemberChanged={setGuestMember}
                      onSignOut={handleGuestSignOut}
                    />
                  </Suspense>
                </ErrorBoundary>
              }
            />
            <Route
              path="/learning"
              element={
                <ErrorBoundary>
                  <LazyRoute
                    load={loadLearningMaterialsPage}
                    fallback={<LoadingScreen status="Loading learning materials..." />}
                  />
                </ErrorBoundary>
              }
            />
            <Route
              path="/privacy"
              element={
                <ErrorBoundary>
                  <LazyRoute load={loadPrivacyNoticePage} fallback={<LoadingScreen status="Loading page..." />} />
                </ErrorBoundary>
              }
            />
            <Route path="*" element={<Navigate to="/member" replace />} />
          </Routes>
        </ErrorBoundary>
      </ThemeProvider>
    );
  }

  const showAuthGate = !isAuthenticated && !isPublicRoute;

  if (showAuthGate && pageState === "choice") {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ChoiceScreen onLogin={handleLogin} onGuest={handleGuest} onGuestSignIn={handleGuestSignIn} />
      </ThemeProvider>
    );
  }

  if (showAuthGate && pageState === "guest") {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <GuestLanding onLogin={handleLogin} onForgetChoice={handleForgetChoice} />
      </ThemeProvider>
    );
  }

  // ---- The application shell ----
  //
  // Every signed-in screen renders inside it, so navigation is drawn once here
  // rather than by each page. Before the overhaul the dashboard imported a
  // `Header` of its own and the other twelve screens had none, which is why
  // most of the app could only be reached by typing a URL.
  //
  // `roleLabel` names every group held, highest first, because "why can I not
  // see the builder?" was unanswerable when permissions were implied only by
  // which menu items appeared.
  const roleLabel = [isAdmin ? "Administrator" : "", canUseFormBuilder ? "Form Builder" : ""]
    .filter(Boolean)
    .join(" · ");

  const dashboardValue = {
    userEmail,
    isAdmin,
    canUseFormBuilder,
    submissions,
    visibleLists,
    listMetaMap,
    missingConfigs,
    hasFilters,
    detailItem,
    setDetailItem,
    filters,
    setFilters,
    sortBy,
    setSortBy,
    sortedSubmissions,
    onSignOut: handleSignOut,
    onSwitchAccount: handleSwitchAccount,
    onOpenBuilder: () => navigate("/admin/builder"),
    onEditForm: (listTitle: string) =>
      navigate(`/admin/builder/${encodeURIComponent(listTitle)}`),
    onHardDeleteSubmission: handleHardDeleteSubmission,
  };

  /**
   * Wrap a page in the shell.
   *
   * A plain function rather than a component, deliberately: a component
   * declared inside a render is a new type on every render, so React unmounts
   * and remounts its whole subtree -- which would throw away the scroll
   * position, every open dialog and every unsaved form field on each keystroke
   * that touches App's state.
   *
   * The shell sits OUTSIDE `AdminGuard` at each call site, so an account that
   * lands on a screen it may not open still has the navigation to leave with.
   * Inside the guard, the restricted-access screen would be a dead end.
   */
  const inShell = (node: React.ReactNode) => (
    <ErrorBoundary>
      <DashboardProvider {...dashboardValue}>
        <AppShell
          userName={activeAccount?.name || ""}
          userEmail={userEmail}
          roleLabel={roleLabel}
          isAdmin={isAdmin}
          canUseFormBuilder={canUseFormBuilder}
          onSignOut={handleSignOut}
          onSwitchAccount={handleSwitchAccount}
        >
          {node}
        </AppShell>
      </DashboardProvider>
    </ErrorBoundary>
  );

  // Until the submissions land, a page that reads them would render an empty
  // state - "no submissions" is a claim, not a wait - so it holds on the
  // loading screen. Shared by Dashboard, Forms and My Submissions.
  const withSubmissions = (node: React.ReactNode) =>
    submissionsStatus === "ready" ? (
      inShell(node)
    ) : (
      <LoadingScreen
        userEmail={userEmail || undefined}
        progress={submissionsProgress}
        status={submissionsLoadStatus}
      />
    );

  // Mounted under both /eval/* and /approval/*. EvaluationPage resolves the layer
  // type from the data, so one component serves both; the prefix only tells the
  // recipient which of the two they were asked for.
  const workflowActionInner = (
    <ErrorBoundary>
      <Box sx={{ minHeight: "100vh", background: APP_BG }}>
        <LazyRoute load={loadEvaluationPage} fallback={<LoadingScreen status="Loading evaluation..." />} />
      </Box>
    </ErrorBoundary>
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <Routes>
          <Route
            path="/privacy"
            element={
              <ErrorBoundary>
                <LazyRoute load={loadPrivacyNoticePage} fallback={<LoadingScreen status="Loading page..." />} />
              </ErrorBoundary>
            }
          />
          <Route
            path="/form/:formId"
            element={
              <ErrorBoundary>
                <Box sx={{ minHeight: "100vh", background: APP_BG }}>
                  <LazyRoute load={loadDynamicFormPage} fallback={<LoadingScreen status="Loading form..." />} />
                </Box>
              </ErrorBoundary>
            }
          />
          {/* Same published form as /form/:formId, drawn by the native engine
              instead of SurveyJS. Read-only by design — see the page header. */}
          <Route
            path="/native/:formId"
            element={
              <ErrorBoundary>
                <LazyRoute load={loadNativeFormPreviewPage} fallback={<LoadingScreen status="Loading form..." />} />
              </ErrorBoundary>
            }
          />
          <Route
            path="/admin/submissions"
            element={
              <AdminGuard isAdmin={canUseFormBuilder} restrictedTo="the SharePoint superuser group">
                <ErrorBoundary>
                  {inShell(
                    <LazyRoute load={loadApprovalDashboard} fallback={<LoadingScreen status="Loading submissions..." />} />
                  )}
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/approvals"
            element={
              <AdminGuard isAdmin={canUseFormBuilder} restrictedTo="the SharePoint superuser group">
                <ErrorBoundary>
                  {inShell(
                    <LazyRoute load={loadApprovalDashboard} fallback={<LoadingScreen status="Loading approvals..." />} />
                  )}
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/org"
            element={
              <AdminGuard isAdmin={canUseFormBuilder} restrictedTo="the SharePoint superuser group">
                <ErrorBoundary>
                  {inShell(
                    <LazyRoute load={loadAdminOrgPage} fallback={<LoadingScreen status="Loading companies and departments..." />} />
                  )}
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/routing"
            element={
              <AdminGuard isAdmin={canUseFormBuilder} restrictedTo="the SharePoint superuser group">
                <ErrorBoundary>
                  {inShell(
                    <LazyRoute load={loadAdminRoutingPage} fallback={<LoadingScreen status="Loading approval routing..." />} />
                  )}
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/responses/:formTitle"
            element={
              <AdminGuard isAdmin={isAdmin}>
                <ErrorBoundary>
                  {inShell(
                    <LazyRoute load={loadResponseViewer} fallback={<LoadingScreen status="Loading responses..." />} />
                  )}
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/builder"
            element={
              <AdminGuard isAdmin={canUseFormBuilder} restrictedTo="the SharePoint superuser group">
                <ErrorBoundary>
                  {inShell(
                    <LazyRoute load={loadAdminFormBuilder} fallback={<LoadingScreen status="Loading builder..." />} />
                  )}
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/builder/:formTitle"
            element={
              <AdminGuard isAdmin={canUseFormBuilder} restrictedTo="the SharePoint superuser group">
                <ErrorBoundary>
                  {inShell(
                    <LazyRoute load={loadAdminFormBuilder} fallback={<LoadingScreen status="Loading builder..." />} />
                  )}
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <AdminGuard isAdmin={isAdmin}>
                {withSubmissions(
                  <LazyRoute load={loadDashboardPage} fallback={<LoadingScreen status="Loading dashboard..." />} />,
                )}
              </AdminGuard>
            }
          />
          <Route
            path="/user/dashboard"
            element={withSubmissions(
              <LazyRoute load={loadDashboardPage} fallback={<LoadingScreen status="Loading dashboard..." />} />,
            )}
          />
          {/* My Work. Both read `submissions`, so both wait for the fetch. */}
          <Route
            path="/forms"
            element={withSubmissions(
              <LazyRoute load={loadFormsPage} fallback={<LoadingScreen status="Loading forms..." />} />,
            )}
          />
          <Route
            path="/submissions"
            element={withSubmissions(
              <LazyRoute load={loadMySubmissionsPage} fallback={<LoadingScreen status="Loading submissions..." />} />,
            )}
          />
          {/* Profile. Neither page reads `submissions`, so neither waits. */}
          <Route
            path="/profile"
            element={inShell(
              <LazyRoute load={loadProfilePage} fallback={<LoadingScreen status="Loading profile..." />} />,
            )}
          />
          <Route
            path="/profile/appearance"
            element={inShell(
              <LazyRoute load={loadAppearancePage} fallback={<LoadingScreen status="Loading appearance..." />} />,
            )}
          />
          <Route
            path="/admin/career/applications"
            element={
              <AdminGuard isAdmin={isAdmin}>
                <ErrorBoundary>
                  {inShell(
                    <LazyRoute load={loadAdminJobsPage} fallback={<LoadingScreen status="Loading applications..." />} />
                  )}
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/career/opportunities"
            element={
              <AdminGuard isAdmin={isAdmin}>
                <ErrorBoundary>
                  {inShell(
                    <LazyRoute load={loadAdminJobManagePage} fallback={<LoadingScreen status="Loading opportunities..." />} />
                  )}
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/career/cards"
            element={
              <AdminGuard isAdmin={isAdmin}>
                <ErrorBoundary>
                  {inShell(
                    <LazyRoute load={loadAdminCareerPortalCardsPage} fallback={<LoadingScreen status="Loading cards..." />} />
                  )}
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          {/* The learning hub is for every signed-in employee, so it carries no
              AdminGuard — the API still requires a Microsoft 365 identity, and
              managing the content is gated separately below. */}
          <Route
            path="/learning"
            element={
              <ErrorBoundary>
                {inShell(
                  <LazyRoute load={loadLearningMaterialsPage} fallback={<LoadingScreen status="Loading learning materials..." />} />
                )}
              </ErrorBoundary>
            }
          />
          <Route
            path="/admin/learning"
            element={
              <AdminGuard isAdmin={isAdmin}>
                <ErrorBoundary>
                  {inShell(
                    <LazyRoute load={loadAdminLearningPage} fallback={<LoadingScreen status="Loading library manager..." />} />
                  )}
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/guest-members"
            element={
              <AdminGuard isAdmin={isAdmin}>
                <ErrorBoundary>
                  {inShell(
                    <LazyRoute
                      load={loadAdminGuestMembersPage}
                      fallback={<LoadingScreen status="Loading guest members..." />}
                    />
                  )}
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/jobs"
            element={
              <AdminGuard isAdmin={isAdmin}>
                <CatchAllRedirect to="/admin/career/applications" />
              </AdminGuard>
            }
          />
          <Route
            path="/admin/jobs/manage"
            element={
              <AdminGuard isAdmin={isAdmin}>
                <CatchAllRedirect to="/admin/career/opportunities" />
              </AdminGuard>
            }
          />
          {/*
            DO NOT REMOVE the /eval/* routes when they start to look redundant
            next to /approval/*. Approval-layer links were sent as /eval/... for
            the whole life of the app before the split, and scheduled evaluation
            emails persist their reviewLink into the SharePoint
            WorkflowEmailSchedule column — api/workflow-email-cron.ts re-sends
            that stored string verbatim, it never rebuilds the URL. With
            three-month scheduling, /eval/... links written today are still
            being posted months from now. These routes outlive the split.
          */}
          <Route path="/eval/:token" element={workflowActionInner} />
          <Route path="/eval/:formSlug/:responseId/:layerNumber" element={workflowActionInner} />
          <Route path="/approval/:token" element={workflowActionInner} />
          <Route path="/approval/:formSlug/:responseId/:layerNumber" element={workflowActionInner} />
          <Route
            path="/career-portal"
            element={
              <ErrorBoundary>
                <Box sx={{ minHeight: "100vh", background: APP_BG }}>
                  <LazyRoute load={loadCareersPage} fallback={<LoadingScreen status="Loading career portal..." />} />
                </Box>
              </ErrorBoundary>
            }
          />
          {/* Ranked matching puts /career-portal/:jobId/apply ahead of this,
              so the apply route is unaffected by the shared prefix. */}
          <Route
            path="/career-portal/:jobId"
            element={
              <ErrorBoundary>
                <Box sx={{ minHeight: "100vh", background: APP_BG }}>
                  <LazyRoute load={loadJobDetailsPage} fallback={<LoadingScreen status="Loading opportunity..." />} />
                </Box>
              </ErrorBoundary>
            }
          />
          <Route
            path="/career-portal/:jobId/apply"
            element={
              <ErrorBoundary>
                <Box sx={{ minHeight: "100vh", background: APP_BG }}>
                  <LazyRoute load={loadJobApplyPage} fallback={<LoadingScreen status="Loading application..." />} />
                </Box>
              </ErrorBoundary>
            }
          />
          <Route
            path="/careers"
            element={<CatchAllRedirect to="/career-portal" />}
          />
          <Route
            path="/careers/:jobId/apply"
            element={
              <ErrorBoundary>
                <Box sx={{ minHeight: "100vh", background: APP_BG }}>
                  <LazyRoute load={loadJobApplyPage} fallback={<LoadingScreen status="Loading application..." />} />
                </Box>
              </ErrorBoundary>
            }
          />
          <Route
            path="*"
            element={
              pageState === "ready" ? (
                <CatchAllRedirect to={isAdmin ? "/admin/dashboard" : "/user/dashboard"} />
              ) : (
                <LoadingScreen userEmail={userEmail || undefined} status="Loading..." />
              )
            }
          />
        </Routes>

      </ErrorBoundary>
    </ThemeProvider>
  );
}

import { useState, useEffect, useCallback, useRef } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import {
  useMsal,
  useIsAuthenticated,
} from "@azure/msal-react";
import type { AccountInfo } from "@azure/msal-browser";
import { ThemeProvider, CssBaseline, Box } from "@mui/material";
import theme from "./theme";
import { loginRequest } from "./auth/msalConfig";
import { createSpClient, isSharePointForbiddenError } from "./utils/sharepointClient";
import { acquireAccessTokenSilentOrRedirect, startFreshReauthentication } from "./utils/authRecovery";
import { SP_STATIC, loadConfig, filterVisibleLists, getMissingConfigs, generateMeta } from "./utils/spConfig";
import { getStoredAuthDecision, setStoredAuthDecision, clearStoredAuthDecision } from "./utils/authDecision";
import type { PageState, Submission, ApprovalLayer, DiscoveredList, ListMetaEntry, LoadedConfig, LayerConfig, ApprovalLayerConfig, ApprovalLayerResult, EvaluationLayerResult, EvaluationDataEntry } from "./types";
import { normalizeLayerStatus } from "./utils/statusConstants";

// Auth screens
import ChoiceScreen from "./components/auth/ChoiceScreen";
import GuestLanding from "./components/auth/GuestLanding";
import WrongTenantScreen from "./components/auth/WrongTenantScreen";
import RestrictedAccessScreen from "./components/auth/RestrictedAccessScreen";
import LoadingScreen from "./components/auth/LoadingScreen";
import ErrorScreen from "./components/auth/ErrorScreen";
import AdminGuard from "./components/auth/AdminGuard";
import ErrorBoundary from "./components/ErrorBoundary";
import LazyRoute from "./components/LazyRoute";
import { DashboardProvider } from "./contexts/DashboardContext";



const APP_BG = "var(--app-bg, linear-gradient(180deg, #BFDDF4 0%, #DCECF8 45%, #F7F5EF 100%))";
const DASHBOARD_LIST_FETCH_CONCURRENCY = 4;
const AUTH_PROFILE_REAUTH_TIMEOUT_MS = 60000;
const INTERNAL_EMAIL_DOMAINS = String(import.meta.env.VITE_INTERNAL_EMAIL_DOMAINS || "pmw-group.com")
  .split(",")
  .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);
type AuthProfileStatus = "unknown" | "loading" | "ready" | "restricted";

const loadDynamicFormPage = () => import("./pages/DynamicFormPage");
const loadApprovalDashboard = () => import("./components/builder/ApprovalDashboard");
const loadResponseViewer = () => import("./components/builder/ResponseViewer");
const loadAdminFormBuilder = () => import("./pages/AdminFormBuilder");
const loadAdminHomePage = () => import("./pages/AdminHomePage");
const loadEvaluationPage = () => import("./pages/EvaluationPage");
const loadCareersPage = () => import("./pages/CareersPage");
const loadJobApplyPage = () => import("./pages/JobApplyPage");
const loadPrivacyNoticePage = () => import("./pages/PrivacyNoticePage");
const loadAdminJobsPage = () => import("./pages/AdminJobsPage");
const loadAdminJobManagePage = () => import("./pages/AdminJobManagePage");
const loadAdminCareerPortalCardsPage = () => import("./pages/AdminCareerPortalCardsPage");

function isPublicRoutePath(pathname: string): boolean {
  return (
    pathname === "/privacy" ||
    pathname === "/career-portal" ||
    pathname === "/careers" ||
    pathname.startsWith("/form/") ||
    pathname.startsWith("/eval/") ||
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

function normalizeStatus(status: string | null): string {
  if (!status) return "pending";
  const normalized = status.toLowerCase().replace(/[\s_-]/g, "");
  if (normalized === "fullyapproved") return "fullyapproved";
  if (normalized === "approved") return "approved";
  if (normalized.includes("reject")) return "rejected";
  if (normalized.includes("progress") || normalized.includes("review")) return "inprogress";
  return "pending";
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
  layerConfigs?: Record<string, LayerConfig | null>
): Submission {
  const id = String(raw.Id || "");
  const title = String(raw.Title || "Untitled");
  const formId = String(raw.FormId || "");
  const formVersion = String(raw.FormVersion || "1");
  const formStatus = raw.FormStatus ? String(raw.FormStatus) : null;
  const submittedByEmail = String(
    raw._authorEmail ||
      (raw.Author as Record<string, unknown> | undefined)?.Email ||
      raw.submittedByEmail ||
      ""
  );
  const submittedAt = raw.SubmittedAt ? String(raw.SubmittedAt) : null;
  const currentLayer = raw.CurrentLayer ? Number(raw.CurrentLayer) : 0;

  const cfg = layerConfigs?.[listTitle] ?? null;
  const layersConfig = cfg?.layers ?? [];

  let totalLayers = layersConfig.length;
  if (!totalLayers) {
    totalLayers = 1;
    if (raw.L2_Email) totalLayers = 2;
    if (raw.L3_Email) totalLayers = 3;
  }

  const layers: (ApprovalLayer | null)[] = [];
  const enhancedLayers: (ApprovalLayerResult | EvaluationLayerResult | null)[] = [];

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

      layers.push({
        status: statusVal || "pending",
        outcome: canonicalStatus === "approved" ? "approved" : canonicalStatus === "rejected" ? "rejected" : undefined,
        email: emailVal,
        signedAt: signedAtVal,
        rejectionReason: rejectionVal,
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
          notes: evalData?.notes,
        });
      } else {
        enhancedLayers.push({
          layerNumber: n,
          type: "approval",
          status: canonicalStatus,
          outcome: canonicalStatus === "approved" ? "approved" : canonicalStatus === "rejected" ? "rejected" : undefined,
          email: emailVal,
          signedAt: signedAtVal,
          rejectionReason: rejectionVal,
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
      if (statusVal || emailVal) {
        layers.push({
          status: statusVal || "pending",
          outcome: statusVal === "approved" ? "approved" : statusVal === "rejected" ? "rejected" : undefined,
          email: emailVal,
          signedAt: signedAtVal,
          rejectionReason: rejectionVal,
          signature: signatureVal,
        });
      }
    }
  }

  // Filter internal fields
  const submissionData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (
      key.startsWith("odata.") ||
      /^L[1-9]_/.test(key) ||
      key === "FormStatus" ||
      key === "CurrentLayer" ||
      key === "EvaluationData" ||
      key === "FormId" ||
      key === "FormVersion" ||
      key === "Title" ||
      key === "Id" ||
      key === "_authorEmail" ||
      key === "SubmittedAt" ||
      key === "PDPAConsent" ||
      key === "PDPANoticeVersion" ||
      key === "PDPAConsentAt" ||
      key === "RetentionUntil" ||
      key === "AuthorId"
    ) {
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
    title,
    submittedByEmail,
    submittedAt,
    formStatus,
    totalLayers,
    layers: layers.filter(Boolean) as ApprovalLayer[],
    meta: listMetaMap[listTitle] ?? generateMeta(listTitle),
    submissionData,
    currentLayer,
    enhancedLayers: enhancedLayers.length > 0 ? enhancedLayers : undefined,
    layerConfig: cfg,
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
  const [visibleLists, setVisibleLists] = useState<DiscoveredList[]>([]);
  const [loadedConfig, setLoadedConfig] = useState<LoadedConfig | null>(null);
  const [missingConfigs, setMissingConfigs] = useState<string[]>([]);
  const [detailItem, setDetailItem] = useState<Submission | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadStatus, setLoadStatus] = useState("Initializing...");

  // Filters
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [submitterFilter, setSubmitterFilter] = useState("");

  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const isPublicRoute = isPublicRoutePath(currentPath);
  const authProfileAccountRef = useRef("");
  const authProfileLoadingRef = useRef(false);
  const postAuthRedirectRef = useRef(false);
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
    setVisibleLists([]);
    setLoadedConfig(null);
    setMissingConfigs([]);
    setDetailItem(null);
    authProfileLoadingRef.current = false;
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

    // Check for redirect result first before deciding page state
    const decision = getStoredAuthDecision();
    if (decision === "guest") {
      setPageState("guest");
    } else {
      setPageState("choice");
    }
  }, [isAuthenticated, inProgress, accountKey, isPublicRoute, authProfileReady, authProfileRestricted]);

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
        .catch(() => {
          // Non-auth token errors are handled by the request that needs the token.
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
    if (pageState !== "loading" || !isAuthenticated || isPublicRoute || !activeAccount) return;
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
    const email = account.username || "";

    let cancelled = false;
    authProfileLoadingRef.current = true;
    setAuthProfileStatus("loading");
    setLoadProgress(0);
    setLoadStatus("Initializing...");
    const spClient = createSpClient(instance, [account]);
    const finishProfileLoad = () => {
      authProfileLoadingRef.current = false;
      window.clearTimeout(reauthTimeoutId);
    };
    const redirectToFreshSignIn = () => {
      window.clearTimeout(reauthTimeoutId);
      setLoadStatus("Authentication is taking too long. Redirecting to sign in...");
      void startFreshReauthentication(instance, loginRequest.scopes, account).catch((error: unknown) => {
        if (cancelled) return;
        finishProfileLoad();
        setErrorMsg(error instanceof Error ? error.message : "Could not restart sign-in.");
        setAuthProfileStatus("unknown");
        setPageState("error");
      });
    };
    const reauthTimeoutId = window.setTimeout(() => {
      if (!cancelled && authProfileLoadingRef.current) {
        redirectToFreshSignIn();
      }
    }, AUTH_PROFILE_REAUTH_TIMEOUT_MS);

    async function fetchData() {
      try {
        setLoadStatus(accountIsInternal ? "Preparing PMW account access..." : "Checking SharePoint site access...");
        setLoadProgress(10);
        if (!accountIsInternal) {
          await spClient.ensureSiteAccess();
          if (cancelled) return;
        }

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

        // Build map of list → set of emails that should see submissions (including layer assignees)
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

        // Step 4: Filter visible lists
        const visible = filterVisibleLists(allLists, adminResult, config.allowedTitles);
        setVisibleLists(visible);

        const listMetaMap: Record<string, ListMetaEntry> = { ...config.listMetaMap };
        for (const list of visible) {
          if (!listMetaMap[list.title]) {
            listMetaMap[list.title] = generateMeta(list.title);
          }
        }

        // Step 5: Fetch submissions
        const totalLists = visible.length;
        setLoadStatus(
          totalLists > 0
            ? `Fetching submissions from ${totalLists} list${totalLists !== 1 ? "s" : ""}...`
            : "No lists to fetch from."
        );

        let completedLists = 0;
        const submissionsByList = await mapWithConcurrency(
          visible,
          DASHBOARD_LIST_FETCH_CONCURRENCY,
          async (list) => {
            setLoadStatus(`Fetching submissions from "${list.title}"...`);

            try {
              const items = await spClient.queryList(list.title, {
                select: "*",
                orderby: "Created desc",
                top: adminResult ? 5000 : 1000,
              });
              return items.map((item) => mapSubmission(item, list.title, listMetaMap, config.layerConfigs));
            } catch {
              return [] as Submission[];
            } finally {
              completedLists += 1;
              setLoadProgress(50 + Math.round((completedLists / Math.max(totalLists, 1)) * 45));
              setLoadStatus(`Fetched ${completedLists}/${totalLists} list${totalLists !== 1 ? "s" : ""}...`);
            }
          },
        );
        const allSubmissions = submissionsByList.flat();
        if (cancelled) return;

        // Step 6: Finalize
        setLoadStatus("Finalizing...");
        setLoadProgress(98);

        const visibleTitles = new Set(visible.map((l) => l.title));
        let finalSubmissions = allSubmissions.filter((s) => visibleTitles.has(s.listTitle));
        if (!adminResult && email) {
          const lowerEmail = email.toLowerCase();
          finalSubmissions = finalSubmissions.filter((s) => {
            // User's own submissions
            if (s.submittedByEmail.toLowerCase() === lowerEmail) return true;
            // Submissions where user is a layer assignee
            const assignees = assigneeVisibilityMap[s.listTitle];
            if (assignees?.has(lowerEmail)) return true;
            return false;
          });
        }

        setSubmissions(finalSubmissions);
        setMissingConfigs(getMissingConfigs(visible, config.layerConfig));
        setLoadProgress(100);
        setLoadStatus("Ready.");
        authProfileAccountRef.current = accountKey;
        finishProfileLoad();
        setAuthProfileStatus("ready");
        setPageState("ready");
      } catch (err: unknown) {
        if (cancelled) return;
        if (isUnauthorizedError(err)) {
          redirectToFreshSignIn();
          return;
        }
        if (isSharePointForbiddenError(err)) {
          finishProfileLoad();
          setErrorMsg("");
          if (accountIsInternal) {
            setErrorMsg("SharePoint returned 403 for this PMW account while loading portal data. Please confirm the account can open the PMW HR Docs SharePoint site and lists.");
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
        setAuthProfileStatus("unknown");
        setPageState("error");
      }
    }

    fetchData();
    return () => {
      cancelled = true;
      finishProfileLoad();
    };
  }, [pageState, isAuthenticated, isPublicRoute, authProfileReady, authProfileRestricted, instance, accountKey]);

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

  const handleSwitchAccount = useCallback(() => {
    instance.logoutPopup().catch(() => {
      instance.logoutRedirect();
    });
    clearStoredAuthDecision();
    setTimeout(() => {
      instance.loginRedirect(loginRequest);
    }, 100);
  }, [instance]);

  const handleSignOut = useCallback(() => {
    instance.logoutRedirect();
    clearStoredAuthDecision();
  }, [instance]);

  const handleForgetChoice = () => {
    clearStoredAuthDecision();
    setPageState("choice");
  };

  const handleRestrictedRetry = () => {
    setAuthProfileStatus("unknown");
    setLoadProgress(0);
    setLoadStatus("Initializing...");
    setPageState("loading");
  };

  // Filter + sort logic
  const filteredSubmissions = submissions.filter((item) => {
    if (search) {
      const searchLower = search.toLowerCase();
      if (
        !item.title.toLowerCase().includes(searchLower) &&
        !item.formId.toLowerCase().includes(searchLower) &&
        !item.submissionId.toLowerCase().includes(searchLower)
      ) {
        return false;
      }
    }
    if (listFilter && item.listTitle !== listFilter) return false;
    if (statusFilter !== "all" && normalizeStatus(item.formStatus) !== statusFilter.toLowerCase()) return false;
    if (submitterFilter && !item.submittedByEmail.toLowerCase().includes(submitterFilter.toLowerCase()))
      return false;
    return true;
  });

  const sortedSubmissions = [...filteredSubmissions].sort((a, b) => {
    switch (sortBy) {
      case "oldest":
        return (a.submittedAt || "").localeCompare(b.submittedAt || "");
      case "status":
        return normalizeStatus(a.formStatus).localeCompare(normalizeStatus(b.formStatus));
      case "list":
        return a.listTitle.localeCompare(b.listTitle);
      default: // newest
        return (b.submittedAt || "").localeCompare(a.submittedAt || "");
    }
  });

  const listMetaMap = { ...loadedConfig?.listMetaMap };
  for (const list of visibleLists) {
    if (!listMetaMap[list.title]) {
      listMetaMap[list.title] = generateMeta(list.title);
    }
  }

  const hasFilters = !!(search || listFilter || statusFilter !== "all" || submitterFilter);

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

  if (!isPublicRoute && pageState === "error") {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ErrorScreen errorMsg={errorMsg} onRetry={() => setPageState("loading")} onSignOut={handleSignOut} />
      </ThemeProvider>
    );
  }

  const privateRouteNeedsProfile = isAuthenticated && !isPublicRoute && !authProfileReady;
  if (!isPublicRoute && (pageState === "checking" || pageState === "loading" || privateRouteNeedsProfile)) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LoadingScreen userEmail={userEmail || undefined} progress={loadProgress} status={loadStatus} />
      </ThemeProvider>
    );
  }

  const showAuthGate = !isAuthenticated && !isPublicRoute;

  if (showAuthGate && pageState === "choice") {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ChoiceScreen onLogin={handleLogin} onGuest={handleGuest} />
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

  // ---- Dashboard (ready state) ----
  const adminDashboardInner = (
    <ErrorBoundary>
      <DashboardProvider
        userEmail={userEmail}
        isAdmin={isAdmin}
        canUseFormBuilder={canUseFormBuilder}
        submissions={submissions}
        visibleLists={visibleLists}
        listMetaMap={listMetaMap}
        missingConfigs={missingConfigs}
        hasFilters={hasFilters}
        detailItem={detailItem}
        setDetailItem={setDetailItem}
        search={search}
        setSearch={setSearch}
        listFilter={listFilter}
        setListFilter={setListFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        sortBy={sortBy}
        setSortBy={setSortBy}
        submitterFilter={submitterFilter}
        setSubmitterFilter={setSubmitterFilter}
        sortedSubmissions={sortedSubmissions}
        onSignOut={handleSignOut}
        onSwitchAccount={handleSwitchAccount}
        onOpenBuilder={() => navigate("/admin/builder")}
        onEditForm={(listTitle: string) => navigate(`/admin/builder/${encodeURIComponent(listTitle)}`)}
      >
        <LazyRoute load={loadAdminHomePage} fallback={<LoadingScreen status="Loading dashboard..." />} />
      </DashboardProvider>
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
          <Route
            path="/admin/approvals"
            element={
              <AdminGuard isAdmin={isAdmin}>
                <ErrorBoundary>
                  <Box sx={{ minHeight: "100vh", background: APP_BG }}>
                    <LazyRoute load={loadApprovalDashboard} fallback={<LoadingScreen status="Loading approvals..." />} />
                  </Box>
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/responses/:formTitle"
            element={
              <AdminGuard isAdmin={isAdmin}>
                <ErrorBoundary>
                  <Box sx={{ minHeight: "100vh", background: APP_BG }}>
                    <LazyRoute load={loadResponseViewer} fallback={<LoadingScreen status="Loading responses..." />} />
                  </Box>
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/builder"
            element={
              <AdminGuard isAdmin={canUseFormBuilder} restrictedTo="the SharePoint superuser group">
                <ErrorBoundary>
                  <Box sx={{ minHeight: "100vh" }}>
                    <LazyRoute load={loadAdminFormBuilder} fallback={<LoadingScreen status="Loading builder..." />} />
                  </Box>
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/builder/:formTitle"
            element={
              <AdminGuard isAdmin={canUseFormBuilder} restrictedTo="the SharePoint superuser group">
                <ErrorBoundary>
                  <Box sx={{ minHeight: "100vh" }}>
                    <LazyRoute load={loadAdminFormBuilder} fallback={<LoadingScreen status="Loading builder..." />} />
                  </Box>
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <AdminGuard isAdmin={isAdmin}>
                {adminDashboardInner}
              </AdminGuard>
            }
          />
          <Route
            path="/user/dashboard"
            element={
              <ErrorBoundary>
                {adminDashboardInner}
              </ErrorBoundary>
            }
          />
          <Route
            path="/admin/career/applications"
            element={
              <AdminGuard isAdmin={isAdmin}>
                <ErrorBoundary>
                  <Box sx={{ minHeight: "100vh", background: APP_BG }}>
                    <LazyRoute load={loadAdminJobsPage} fallback={<LoadingScreen status="Loading applications..." />} />
                  </Box>
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/career/opportunities"
            element={
              <AdminGuard isAdmin={isAdmin}>
                <ErrorBoundary>
                  <Box sx={{ minHeight: "100vh", background: APP_BG }}>
                    <LazyRoute load={loadAdminJobManagePage} fallback={<LoadingScreen status="Loading opportunities..." />} />
                  </Box>
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/career/cards"
            element={
              <AdminGuard isAdmin={isAdmin}>
                <ErrorBoundary>
                  <Box sx={{ minHeight: "100vh", background: APP_BG }}>
                    <LazyRoute load={loadAdminCareerPortalCardsPage} fallback={<LoadingScreen status="Loading cards..." />} />
                  </Box>
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
          <Route
            path="/eval/:token"
            element={
              <ErrorBoundary>
                <Box sx={{ minHeight: "100vh", background: APP_BG }}>
                  <LazyRoute load={loadEvaluationPage} fallback={<LoadingScreen status="Loading evaluation..." />} />
                </Box>
              </ErrorBoundary>
            }
          />
          <Route
            path="/eval/:formSlug/:responseId/:layerNumber"
            element={
              <ErrorBoundary>
                <Box sx={{ minHeight: "100vh", background: APP_BG }}>
                  <LazyRoute load={loadEvaluationPage} fallback={<LoadingScreen status="Loading evaluation..." />} />
                </Box>
              </ErrorBoundary>
            }
          />
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
                adminDashboardInner
              )
            }
          />
        </Routes>

      </ErrorBoundary>
    </ThemeProvider>
  );
}

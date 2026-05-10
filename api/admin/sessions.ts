/**
 * GET /api/admin/sessions
 *
 * Admin-only endpoint. Returns active sessions and Azure AD sign-in logs.
 * Requires the caller to have an active session with isAdmin=true.
 *
 * Pass the MSAL access token in Authorization header.
 * The token must be for a user whose session has admin privileges.
 */
import { validateAccessToken } from "../_utils/validateUserToken.ts";
import { getActiveSessions, getSessionHistory } from "../_utils/sessionStore.ts";
import { queryListItems, getGraphToken } from "../_utils/graphClient.ts";

interface ApiRequest {
  headers: Record<string, string | undefined>;
  query: Record<string, string | string[] | undefined>;
  method: string;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

// ── Graph API helpers for Azure AD sign-in logs ─────────────────────────

const TENANT_ID =
  process.env.VITE_AZURE_TENANT_ID || process.env.AZURE_TENANT_ID || "";

interface SignInLogEntry {
  id: string;
  userDisplayName: string;
  userPrincipalName: string;
  appDisplayName: string;
  createdDateTime: string;
  status: string;
  ipAddress: string;
  isInteractive: boolean;
  clientAppUsed: string;
  errorCode: number | null;
}

async function fetchSignInLogs(token: string): Promise<{
  logs: SignInLogEntry[];
  error?: string;
}> {
  try {
    // Try fetching sign-in logs with the app-only token
    // This requires AuditLog.Read.All application permission
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/auditLogs/signIns?$top=50&$orderby=createdDateTime desc`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (res.status === 403) {
      return { logs: [], error: "AuditLog.Read.All permission not granted" };
    }
    if (!res.ok) {
      return { logs: [], error: `Graph API error: ${res.status}` };
    }

    const data = (await res.json()) as {
      value: Array<{
        id: string;
        userDisplayName?: string;
        userPrincipalName?: string;
        appDisplayName?: string;
        createdDateTime: string;
        status?: { errorCode?: number };
        ipAddress?: string;
        isInteractive?: boolean;
        clientAppUsed?: string;
      }>;
    };

    const logs: SignInLogEntry[] = (data.value || []).map((entry) => ({
      id: entry.id,
      userDisplayName: entry.userDisplayName || "",
      userPrincipalName: entry.userPrincipalName || "",
      appDisplayName: entry.appDisplayName || "",
      createdDateTime: entry.createdDateTime,
      status: entry.status?.errorCode === 0 ? "Success" : "Failure",
      ipAddress: entry.ipAddress || "",
      isInteractive: entry.isInteractive ?? true,
      clientAppUsed: entry.clientAppUsed || "",
      errorCode: entry.status?.errorCode ?? null,
    }));

    return { logs };
  } catch (err) {
    return { logs: [], error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── Check admin status ─────────────────────────────────────────────────

async function checkAdminStatus(userObjectId: string): Promise<boolean> {
  try {
    // Use the SharePoint REST API via the app's client-credentials token
    const spSiteUrl = (process.env.VITE_SP_SITE_URL || process.env.SP_SITE_URL || "").replace(/\/$/, "");
    const adminGroupName = process.env.ADMIN_GROUP_NAME || "_HR_ Forms Owners";

    // Get an app-only token for SharePoint
    const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: process.env.SYSTEM_CLIENT_ID || process.env.VITE_AZURE_CLIENT_ID || "",
      client_secret: process.env.SYSTEM_CLIENT_SECRET || process.env.VITE_AZURE_CLIENT_SECRET || "",
      scope: `${spSiteUrl}/AllSites.Manage`,
      grant_type: "client_credentials",
    });

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!tokenRes.ok) return false;
    const tokenData = (await tokenRes.json()) as { access_token: string };

    // Check via SharePoint REST API
    const checkRes = await fetch(
      `${spSiteUrl}/_api/web/sitegroups/getByName('${encodeURIComponent(adminGroupName)}')/Users?$filter=UserId/NameId eq '${userObjectId}'&$select=Id`,
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/json;odata=nometadata",
        },
      }
    );

    if (!checkRes.ok) return false;
    const checkData = (await checkRes.json()) as { value: Array<unknown> };
    return (checkData.value?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

// ── Handler ────────────────────────────────────────────────────────────

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // Validate access token
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const validation = await validateAccessToken(token);
  if (!validation.valid || !validation.user) {
    return res.status(401).json({ error: validation.error || "Unauthorized" });
  }

  try {
    // Check admin via SharePoint group membership
    const isAdmin = await checkAdminStatus(validation.user.oid);
    if (!isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Fetch session data
    const [activeSessions, sessionHistory] = await Promise.all([
      getActiveSessions(),
      getSessionHistory(100),
    ]);

    // Attempt to fetch Azure AD sign-in logs (graceful if not permitted)
    let graphToken = "";
    let signInLogs: SignInLogEntry[] = [];
    let signInLogError: string | undefined;

    try {
      const { logs, error } = await fetchSignInLogs(token);
      signInLogs = logs;
      signInLogError = error;
    } catch {
      signInLogError = "Failed to fetch sign-in logs";
    }

    return res.status(200).json({
      activeSessions,
      sessionHistory,
      signInLogs,
      signInLogError,
    });
  } catch (err) {
    console.error("[API admin/sessions]", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
}

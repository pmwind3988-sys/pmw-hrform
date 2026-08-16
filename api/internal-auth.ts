import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken } from "./_utils/graphClient.js";
import {
  authenticateAccount,
  createAccount,
  deleteAccount,
  ensureInternalAccountsSchema,
  listAccounts,
  normalizeLoginId,
  resetAccountPassword,
  setAccountStatus,
  unlockAccount,
  LOCKOUT_MINUTES,
} from "./_utils/internalAccounts.js";
import {
  portalSessionsEnabled,
  signPortalSession,
  PORTAL_SESSIONS_DISABLED_MESSAGE,
} from "./_utils/internalSession.js";
import { ensureLearningAccessLogSchema, readAccessLog } from "./_utils/learningAccessLog.js";
import { resolveHrFormsOwner } from "./_utils/hrFormsOwner.js";
import { logError, logWarn } from "./_utils/logger.js";

/**
 * Portal accounts: sign-in for the accounts themselves, and the management
 * actions HR uses to issue them.
 *
 * The two halves authenticate completely differently. `sign-in` is reachable by
 * anyone who can load the page — it is the front door — and is protected by the
 * password check, per-account lockout, and nothing else. Every other action
 * carries an HR Forms Owner's delegated SharePoint token, exactly like the admin
 * half of `learning-materials.ts`.
 */

interface ApiRequest {
  body: Record<string, unknown>;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

const ADMIN_ACTIONS = new Set([
  "ensure-schema",
  "list-accounts",
  "create-account",
  "reset-password",
  "set-status",
  "unlock-account",
  "delete-account",
  "view-log",
]);

/** How long a portal session lasts before the person signs in again. */
const SESSION_TTL_HOURS = 12;

function getHeader(headers: Record<string, string | string[] | undefined>, name: string): string {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lowerName) continue;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value[0] || "";
  }
  return "";
}

function getBearerToken(headers: Record<string, string | string[] | undefined>): string {
  const authorization = getHeader(headers, "authorization");
  if (!authorization.toLowerCase().startsWith("bearer ")) return "";
  return authorization.slice(7).trim();
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers as Record<string, string | string[] | undefined>);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Credentials in, session out — never cached anywhere, by anyone.
  res.setHeader("Cache-Control", "no-store");

  const action = String(req.body?.action || "");

  try {
    const graphToken = await getGraphToken();

    if (ADMIN_ACTIONS.has(action)) {
      const admin = await resolveHrFormsOwner(getBearerToken(req.headers));
      if (!admin) {
        return res.status(403).json({ error: "Managing portal accounts is limited to HR Forms Owners." });
      }
      return await handleAdminAction(req, res, graphToken, action, admin);
    }

    if (action === "sign-in") return await handleSignIn(req, res, graphToken);

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    logError("api:internal-auth", "Portal account request failed", e);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

async function handleSignIn(req: ApiRequest, res: ApiResponse, graphToken: string): Promise<void> {
  if (!portalSessionsEnabled()) {
    // The fix is an environment variable, which is the admin's problem and not
    // the visitor's — so the reason goes to the log, and the person at the
    // sign-in box gets something they can actually act on. Admins see the real
    // state on `list-accounts`, which reports `sessionsConfigured`.
    logWarn("api:internal-auth", PORTAL_SESSIONS_DISABLED_MESSAGE, {});
    return res.status(503).json({
      error: "Portal account sign-in is unavailable right now. Use Microsoft 365, or contact HR.",
    });
  }

  const loginId = normalizeLoginId(req.body?.loginId);
  const password = String(req.body?.password ?? "");

  const result = await authenticateAccount(graphToken, loginId, password);

  if (!result.ok) {
    if (result.reason === "locked") {
      // Naming the lockout tells an attacker this login ID is real — but they
      // already had to guess it five times to get here, and the person actually
      // locked out otherwise has no idea why their correct password stopped
      // working. The support call costs more than the hint does.
      return res.status(429).json({
        error: `Too many failed attempts. Try again in ${result.minutes || LOCKOUT_MINUTES} minutes, or ask HR to unlock the account.`,
      });
    }
    if (result.reason === "disabled") {
      return res.status(403).json({ error: "This portal account has been disabled. Contact HR." });
    }
    return res.status(401).json({ error: "That login ID and password do not match." });
  }

  const { token, expiresAt } = signPortalSession(
    {
      loginId: result.account.loginId,
      fullName: result.account.fullName,
      tokenVersion: result.account.tokenVersion,
    },
    SESSION_TTL_HOURS,
  );

  return res.status(200).json({
    session: { token, loginId: result.account.loginId, fullName: result.account.fullName, expiresAt },
  });
}

async function handleAdminAction(
  req: ApiRequest,
  res: ApiResponse,
  graphToken: string,
  action: string,
  adminEmail: string,
): Promise<void> {
  const body = req.body || {};

  try {
    if (action === "ensure-schema") {
      // Both lists, one button. An accounts list without its log would let HR
      // issue accounts that quietly record nothing, and the promise made when
      // the account is handed over is that the viewing *is* recorded.
      const delegatedToken = getBearerToken(req.headers);
      await ensureInternalAccountsSchema(graphToken, delegatedToken);
      await ensureLearningAccessLogSchema(graphToken, delegatedToken);
      return res.status(200).json({ success: true, sessionsConfigured: portalSessionsEnabled() });
    }

    if (action === "list-accounts") {
      // A missing list is the ordinary first-run state, not a failure: the admin
      // screen turns `provisioned: false` into a "Set up" button. Reporting it as
      // an error instead would greet every new deployment with a red banner
      // describing a problem that has not happened yet.
      const listed = await listAccounts(graphToken).catch(() => null);
      return res.status(200).json({
        accounts: listed ?? [],
        provisioned: listed !== null,
        sessionsConfigured: portalSessionsEnabled(),
      });
    }

    if (action === "view-log") {
      return res.status(200).json({ entries: await readAccessLog(graphToken) });
    }

    if (action === "create-account") {
      const account = await createAccount(
        graphToken,
        {
          loginId: String(body.loginId ?? ""),
          fullName: String(body.fullName ?? ""),
          password: String(body.password ?? ""),
        },
        adminEmail,
      );
      return res.status(200).json({ success: true, account });
    }

    if (action === "reset-password") {
      await resetAccountPassword(graphToken, normalizeLoginId(body.loginId), String(body.password ?? ""));
      return res.status(200).json({ success: true });
    }

    if (action === "set-status") {
      const status = String(body.status ?? "") === "disabled" ? "disabled" : "active";
      await setAccountStatus(graphToken, normalizeLoginId(body.loginId), status);
      return res.status(200).json({ success: true, status });
    }

    if (action === "unlock-account") {
      await unlockAccount(graphToken, normalizeLoginId(body.loginId));
      return res.status(200).json({ success: true });
    }

    if (action === "delete-account") {
      await deleteAccount(graphToken, normalizeLoginId(body.loginId));
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    logWarn("api:internal-auth", "Portal account admin action failed", { action, errorMessage: raw });
    // Validation messages are written for the admin reading them and pass
    // through; a raw Graph failure carries site and drive ids and does not.
    if (/^(Graph|SP REST) /.test(raw)) {
      return res.status(400).json({ error: "SharePoint rejected the change. Please try again." });
    }
    return res.status(400).json({ error: raw.slice(0, 300) });
  }
}

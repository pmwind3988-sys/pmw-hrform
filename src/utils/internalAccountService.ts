/**
 * Portal accounts — the HR-issued login-ID + password identities that let
 * someone without a PMW Microsoft 365 mailbox reach the learning hub.
 *
 * The server half lives in `api/learning-materials.ts` under the `portal-`
 * actions, rather than an endpoint of its own: Vercel's Hobby plan caps a
 * deployment at 12 serverless functions and `api/` is at exactly 12. Adding a
 * thirteenth file builds fine and then fails at deploy, so new server-side
 * surface has to join an existing endpoint until that plan changes.
 */

const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";

/** Every portal action rides on the learning endpoint. See the note above. */
const PORTAL_API = "/api/learning-materials";

/** Where the signed session lives between page loads. */
const SESSION_STORAGE_KEY = "pmw_portal_session";

export interface PortalSession {
  /** Signed by the API. Sent back as `Authorization: Bearer <token>`. */
  token: string;
  loginId: string;
  fullName: string;
  /** ISO timestamp. The API rejects the token after this regardless. */
  expiresAt: string;
}

export class PortalSignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalSignInError";
  }
}

function apiHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
  };
}

/**
 * Exchanges a login ID and password for a signed session.
 *
 * The password leaves the browser once, over TLS, and is never stored on this
 * side — not in state that outlives the request, not in storage. What comes
 * back is a token that proves the exchange happened.
 */
export async function signInWithPortalAccount(
  loginId: string,
  password: string,
): Promise<PortalSession> {
  let response: Response;
  try {
    response = await fetch(PORTAL_API, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ action: "portal-sign-in", loginId, password }),
    });
  } catch {
    throw new PortalSignInError("Could not reach the sign-in service. Check your connection and try again.");
  }

  if (response.status === 404) {
    throw new PortalSignInError("Portal account sign-in is not enabled yet. Please use Microsoft 365.");
  }

  let body: { session?: PortalSession; error?: string } = {};
  try {
    body = (await response.json()) as { session?: PortalSession; error?: string };
  } catch {
    // A non-JSON body means the function itself failed; the status carries it.
  }

  if (!response.ok || !body.session?.token) {
    // Deliberately reuses one message for "no such login ID" and "wrong
    // password": telling them apart tells an attacker which login IDs exist.
    throw new PortalSignInError(body.error || "That login ID and password do not match.");
  }

  return body.session;
}

export function readStoredPortalSession(): PortalSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PortalSession>;
    if (!parsed.token || !parsed.loginId || !parsed.expiresAt) return null;

    // Expiry is re-checked server-side on every call — this only saves a doomed
    // round trip and stops a stale name showing in the header.
    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      clearStoredPortalSession();
      return null;
    }

    return parsed as PortalSession;
  } catch {
    return null;
  }
}

export function storePortalSession(session: PortalSession): void {
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private browsing with storage denied: the session still works for this
    // page load, it just will not survive a refresh.
  }
}

export function clearStoredPortalSession(): void {
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage was never reachable.
  }
}

// ── Admin API ────────────────────────────────────────────────────────────────

/**
 * Everything below is HR-only and carries the admin's own delegated SharePoint
 * token. The API re-checks HR Forms Owner membership on every one of these — the
 * admin screen deciding not to render a button is a courtesy, never the control.
 */

export interface PortalAccountSummary {
  loginId: string;
  fullName: string;
  status: "active" | "disabled";
  /** True while a lockout from repeated wrong passwords is still running. */
  locked: boolean;
  failedAttempts: number;
  lockedUntil: string;
  lastLoginAt: string;
  createdBy: string;
  createdAt: string;
}

export interface PortalAccessLogEntry {
  loginId: string;
  viewerName: string;
  materialId: string;
  materialName: string;
  viewedAt: string;
}

async function adminAction<T>(
  action: string,
  payload: Record<string, unknown>,
  spToken: string,
  fallbackMessage: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(PORTAL_API, {
      method: "POST",
      headers: { ...apiHeaders(), Authorization: `Bearer ${spToken}` },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

  let body: { error?: string } & Record<string, unknown> = {};
  try {
    body = (await response.json()) as { error?: string } & Record<string, unknown>;
  } catch {
    // A non-JSON body means the function itself failed; the status carries it.
  }

  if (!response.ok) {
    throw new Error(typeof body.error === "string" && body.error ? body.error : fallbackMessage);
  }
  return body as T;
}

/** Creates the accounts list and the access log. Safe to run repeatedly. */
export async function ensurePortalAccountsSchema(spToken: string): Promise<{ sessionsConfigured: boolean }> {
  return adminAction<{ sessionsConfigured: boolean }>(
    "portal-ensure-schema",
    {},
    spToken,
    "Could not set up portal account storage.",
  );
}

export interface PortalAccountsSnapshot {
  accounts: PortalAccountSummary[];
  /** False before the SharePoint lists exist — the screen offers to create them. */
  provisioned: boolean;
  /** False when `INTERNAL_SESSION_SECRET` is unset, which disables sign-in. */
  sessionsConfigured: boolean;
}

export async function listPortalAccounts(spToken: string): Promise<PortalAccountsSnapshot> {
  const data = await adminAction<Partial<PortalAccountsSnapshot>>(
    "portal-list-accounts",
    {},
    spToken,
    "Could not load portal accounts.",
  );
  return {
    accounts: data.accounts ?? [],
    provisioned: data.provisioned !== false,
    sessionsConfigured: data.sessionsConfigured !== false,
  };
}

export async function createPortalAccount(
  input: { loginId: string; fullName: string; password: string },
  spToken: string,
): Promise<PortalAccountSummary> {
  const data = await adminAction<{ account: PortalAccountSummary }>(
    "portal-create-account",
    input,
    spToken,
    "Could not create the account.",
  );
  return data.account;
}

/**
 * Replaces the password and signs the holder out everywhere. There is no way to
 * read an existing password from here or anywhere else — the server stores a
 * one-way hash — so a forgotten password is always replaced, never recovered.
 */
export async function resetPortalPassword(
  loginId: string,
  password: string,
  spToken: string,
): Promise<void> {
  await adminAction("portal-reset-password", { loginId, password }, spToken, "Could not reset the password.");
}

export async function setPortalAccountStatus(
  loginId: string,
  status: "active" | "disabled",
  spToken: string,
): Promise<void> {
  await adminAction("portal-set-status", { loginId, status }, spToken, "Could not change the account status.");
}

export async function unlockPortalAccount(loginId: string, spToken: string): Promise<void> {
  await adminAction("portal-unlock-account", { loginId }, spToken, "Could not unlock the account.");
}

export async function deletePortalAccount(loginId: string, spToken: string): Promise<void> {
  await adminAction("portal-delete-account", { loginId }, spToken, "Could not delete the account.");
}

export async function fetchPortalAccessLog(spToken: string): Promise<PortalAccessLogEntry[]> {
  const data = await adminAction<{ entries?: PortalAccessLogEntry[] }>(
    "portal-view-log",
    {},
    spToken,
    "Could not load the access log.",
  );
  return data.entries ?? [];
}

// ── Client-side input help ───────────────────────────────────────────────────

/**
 * The server's rule, repeated here so the form can say so before a round trip.
 * The server still enforces it — this copy exists to be helpful, not to guard.
 */
export const MIN_PORTAL_PASSWORD_LENGTH = 10;

/** Mirrors `normalizeLoginId` on the server, so the field shows what will be saved. */
export function normalizePortalLoginId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

/** "Nurul Aisyah binti Hamid" → "nurul.aisyah", as a starting point HR can edit. */
export function suggestLoginId(fullName: string): string {
  const parts = fullName.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 2);
  return normalizePortalLoginId(parts.join("."));
}

/**
 * A password HR can read down a phone line without spelling out which letters
 * are capitals. No `l`, `1`, `O` or `0`, because the person on the other end has
 * to type it correctly on the first try or burn one of their five attempts.
 */
export function generatePortalPassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  // Modulo bias is irrelevant at a 32-character alphabet against a 32-bit draw,
  // and this is a temporary password the holder is told to keep, not a key.
  const body = Array.from(bytes, (n) => alphabet[n % alphabet.length]).join("");
  return `${body.slice(0, 4)}-${body.slice(4, 9)}-${body.slice(9)}`;
}

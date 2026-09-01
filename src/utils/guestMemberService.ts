/**
 * Guest members — the people who sign in with Google.
 *
 * Anyone with a Google account may become one, and membership never expires.
 * This replaces the HR-issued portal account: no login ID, no password, nothing
 * generated on a hand-over panel and read down a phone line.
 *
 * The server half lives in `api/learning-materials.ts` under the `guest-`
 * actions, rather than an endpoint of its own: Vercel's Hobby plan caps a
 * deployment at 12 serverless functions and `api/` is at exactly 12. Adding a
 * thirteenth file builds fine and then fails at deploy, so new server-side
 * surface has to join an existing endpoint until that plan changes. These
 * actions took over the slots the deleted `portal-` ones left behind.
 */

const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";

/** Every guest action rides on the learning endpoint. See the note above. */
const GUEST_API = "/api/learning-materials";

/** Where the signed session lives between page loads. */
const SESSION_STORAGE_KEY = "pmw_guest_session";

export interface GuestSession {
  /** Signed by the API. Sent back as `Authorization: Bearer <token>`. */
  token: string;
  email: string;
  fullName: string;
  /** ISO timestamp. The API rejects the token after this regardless. */
  expiresAt: string;
}

export interface GuestMemberSummary {
  email: string;
  googleName: string;
  fullName: string;
  position: string;
  department: string;
  /** The one-time profile form has been completed. */
  profileComplete: boolean;
  /** An HR Forms Owner has granted access to the learning hub. */
  learningApproved: boolean;
  approvedBy: string;
  status: "active" | "disabled";
  tokenVersion: number;
  joinedAt: string;
  lastLoginAt: string;
}

export class GuestSignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuestSignInError";
  }
}

function apiHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
  };
}

/**
 * Exchanges the identity token Google handed the browser for a signed session
 * of our own.
 *
 * The Google token is forwarded once and never stored. Everything that decides
 * whether to trust it — that Google signed it, that it was issued for this
 * application, that the address is one Google has verified — happens on the
 * server, against keys fetched from Google. Nothing here is a check.
 */
export async function signInWithGoogle(
  credential: string,
): Promise<{ session: GuestSession; member: GuestMemberSummary }> {
  let response: Response;
  try {
    response = await fetch(GUEST_API, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ action: "guest-sign-in", credential }),
    });
  } catch {
    throw new GuestSignInError("Could not reach the sign-in service. Check your connection and try again.");
  }

  if (response.status === 404) {
    throw new GuestSignInError("Google sign-in is not enabled yet. Please use Microsoft 365.");
  }

  let body: { session?: GuestSession; member?: GuestMemberSummary; error?: string } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // A non-JSON body means the function itself failed; the status carries it.
  }

  if (!response.ok || !body.session?.token || !body.member) {
    throw new GuestSignInError(body.error || "That Google sign-in could not be completed. Please try again.");
  }

  return { session: body.session, member: body.member };
}

export function readStoredGuestSession(): GuestSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<GuestSession>;
    if (!parsed.token || !parsed.email || !parsed.expiresAt) return null;

    // Expiry is re-checked server-side on every call — this only saves a doomed
    // round trip and stops a stale name showing in the header.
    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      clearStoredGuestSession();
      return null;
    }

    return parsed as GuestSession;
  } catch {
    return null;
  }
}

export function storeGuestSession(session: GuestSession): void {
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private browsing with storage denied: the session still works for this
    // page load, it just will not survive a refresh.
  }
}

export function clearStoredGuestSession(): void {
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage was never reachable.
  }
}

// ── The member's own record ──────────────────────────────────────────────────

/**
 * These carry the member's own guest session. The server takes the address from
 * that session and never from the request body, so one member can only ever
 * read or write their own record.
 */
async function memberAction<T>(
  action: string,
  payload: Record<string, unknown>,
  token: string,
  fallbackMessage: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(GUEST_API, {
      method: "POST",
      headers: { ...apiHeaders(), Authorization: `Bearer ${token}` },
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

export async function fetchOwnMember(token: string): Promise<GuestMemberSummary> {
  const data = await memberAction<{ member: GuestMemberSummary }>(
    "guest-me",
    {},
    token,
    "Could not load your member details.",
  );
  return data.member;
}

/** The departments HR maintains for approval routing. Empty if the directory is unreadable. */
export async function fetchDepartments(token: string): Promise<string[]> {
  const data = await memberAction<{ departments?: string[] }>(
    "guest-departments",
    {},
    token,
    "Could not load the department list.",
  );
  return data.departments ?? [];
}

export interface GuestSubmission {
  kind: "job-application" | "form";
  title: string;
  reference: string;
  status: string;
  submittedAt: string;
}

/**
 * Everything this member has sent — job applications and HR forms.
 *
 * History starts when guest members shipped: public form submissions used to
 * record only the word "GUEST" as their submitter, so anything sent before this
 * existed cannot be traced back to a person and will not appear.
 */
export async function fetchMySubmissions(token: string): Promise<GuestSubmission[]> {
  const data = await memberAction<{ submissions?: GuestSubmission[] }>(
    "guest-my-submissions",
    {},
    token,
    "Could not load your submissions.",
  );
  return data.submissions ?? [];
}

export async function saveOwnProfile(
  input: { fullName: string; position: string; department: string },
  token: string,
): Promise<GuestMemberSummary> {
  const data = await memberAction<{ member: GuestMemberSummary }>(
    "guest-save-profile",
    input,
    token,
    "Could not save your details.",
  );
  return data.member;
}

// ── Admin API ────────────────────────────────────────────────────────────────

/**
 * Everything below is HR-only and carries the admin's own delegated SharePoint
 * token. The API re-checks HR Forms Owner membership on every one of these — the
 * admin screen deciding not to render a button is a courtesy, never the control.
 */

export interface GuestAccessLogEntry {
  email: string;
  viewerName: string;
  viewerPosition: string;
  viewerDepartment: string;
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
    response = await fetch(GUEST_API, {
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

/** Creates the members list and the access log. Safe to run repeatedly. */
export async function ensureGuestMembersSchema(
  spToken: string,
): Promise<{ sessionsConfigured: boolean; googleConfigured: boolean }> {
  return adminAction<{ sessionsConfigured: boolean; googleConfigured: boolean }>(
    "guest-ensure-schema",
    {},
    spToken,
    "Could not set up guest member storage.",
  );
}

export interface GuestMembersSnapshot {
  members: GuestMemberSummary[];
  /** Total matching the search, so the screen can say "showing 50 of 812". */
  total: number;
  pageSize: number;
  /** False before the SharePoint lists exist — the screen offers to create them. */
  provisioned: boolean;
  /** False when `INTERNAL_SESSION_SECRET` is unset, which disables sign-in. */
  sessionsConfigured: boolean;
  /** False when `GOOGLE_CLIENT_ID` is unset, which disables sign-in. */
  googleConfigured: boolean;
}

/**
 * One page of members.
 *
 * Paged rather than loaded whole, unlike the portal accounts this replaces:
 * that list only ever grew when HR issued an account by hand, and this one grows
 * every time somebody signs in.
 */
export async function listGuestMembers(
  options: { search?: string; skip?: number; take?: number },
  spToken: string,
): Promise<GuestMembersSnapshot> {
  const data = await adminAction<Partial<GuestMembersSnapshot>>(
    "guest-list-members",
    { search: options.search ?? "", skip: options.skip ?? 0, take: options.take ?? 50 },
    spToken,
    "Could not load guest members.",
  );
  return {
    members: data.members ?? [],
    total: data.total ?? 0,
    pageSize: data.pageSize ?? 50,
    provisioned: data.provisioned !== false,
    sessionsConfigured: data.sessionsConfigured !== false,
    googleConfigured: data.googleConfigured !== false,
  };
}

/**
 * Grants or withdraws the learning hub.
 *
 * Withdrawing takes effect on whoever is already signed in and reading, not
 * merely on their next visit — the server retires their session token.
 */
export async function setGuestLearningApproval(
  email: string,
  approved: boolean,
  spToken: string,
): Promise<void> {
  await adminAction(
    "guest-set-learning-approval",
    { email, approved },
    spToken,
    "Could not change the member's learning access.",
  );
}

export async function setGuestMemberStatus(
  email: string,
  status: "active" | "disabled",
  spToken: string,
): Promise<void> {
  await adminAction("guest-set-status", { email, status }, spToken, "Could not change the member's status.");
}

export async function fetchGuestAccessLog(spToken: string): Promise<GuestAccessLogEntry[]> {
  const data = await adminAction<{ entries?: GuestAccessLogEntry[] }>(
    "guest-view-log",
    {},
    spToken,
    "Could not load the access log.",
  );
  return data.entries ?? [];
}

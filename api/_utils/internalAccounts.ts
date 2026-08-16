import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  createListItem,
  queryAllListItems,
  queryListItemByFields,
  updateListItemFields,
  deleteListItem,
  type GraphListItem,
} from "./graphClient.js";
import { ensureListViaSPRest, ensureTextFieldViaSPRest } from "./sharepointRest.js";
import { logWarn } from "./logger.js";

/**
 * Portal accounts — login-ID + password identities HR issues to people who have
 * no PMW Microsoft 365 mailbox, so they can be let into the learning hub without
 * the site being opened to the public.
 *
 * One SharePoint list, all single-line text columns. Text rather than number and
 * dateTime columns because `ensureTextFieldViaSPRest` is the one column-creating
 * path this tenant permits (the app-only Graph principal is refused), and every
 * value here is short. Numbers and timestamps are parsed on read.
 */
export const INTERNAL_ACCOUNTS_LIST = "Internal Accounts";

/** Title holds the login ID — SharePoint indexes it, which is what lookups use. */
const COLUMN_FULL_NAME = "FullName";
const COLUMN_PASSWORD_HASH = "PasswordHash";
const COLUMN_STATUS = "AccountStatus";
const COLUMN_TOKEN_VERSION = "TokenVersion";
const COLUMN_FAILED_ATTEMPTS = "FailedAttempts";
const COLUMN_LOCKED_UNTIL = "LockedUntil";
const COLUMN_LAST_LOGIN = "LastLoginAt";
const COLUMN_CREATED_BY = "CreatedBy";
const COLUMN_CREATED_AT = "CreatedAt";

const ACCOUNT_COLUMNS = [
  COLUMN_FULL_NAME,
  COLUMN_PASSWORD_HASH,
  COLUMN_STATUS,
  COLUMN_TOKEN_VERSION,
  COLUMN_FAILED_ATTEMPTS,
  COLUMN_LOCKED_UNTIL,
  COLUMN_LAST_LOGIN,
  COLUMN_CREATED_BY,
  COLUMN_CREATED_AT,
] as const;

/** Consecutive misses before the account stops answering for a while. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

export const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 200;

// ── Password hashing ─────────────────────────────────────────────────────────

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * N=16384 costs about 128 * N * r = 16 MB and ~50-100ms per hash — heavy enough
 * to make offline guessing expensive, light enough that a serverless sign-in
 * still answers promptly. The parameters travel inside the stored string so a
 * future increase can re-hash on next sign-in without a migration.
 */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  try {
    const expected = Buffer.from(rawHash, "base64");
    const derived = await scrypt(password, Buffer.from(rawSalt, "base64"), expected.length, {
      N,
      r,
      p,
      maxmem: SCRYPT_MAXMEM,
    });
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

/**
 * Burns roughly the time a real verification would, for a login ID that does not
 * exist. Without it, "no such account" answers noticeably faster than "wrong
 * password", and that gap is a list of which login IDs are real.
 */
export async function burnVerificationTime(): Promise<void> {
  await scrypt("timing-equaliser", randomBytes(16), SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  }).catch(() => undefined);
}

// ── Input rules ──────────────────────────────────────────────────────────────

/**
 * Login IDs are lowercased and limited to characters that cannot confuse an
 * OData filter or read as two different people (`Ali` vs `ali`).
 */
export function normalizeLoginId(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

export function validateLoginId(raw: unknown): string {
  const loginId = normalizeLoginId(raw);
  if (loginId.length < 3 || loginId.length > 64) {
    throw new Error("Login ID must be 3-64 characters, using letters, numbers, dots, dashes or underscores.");
  }
  return loginId;
}

export function validatePassword(raw: unknown): string {
  const password = String(raw ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
  if (new Set(password).size < 4) {
    throw new Error("Password is too repetitive. Use a longer mix of characters.");
  }
  return password;
}

export function validateFullName(raw: unknown): string {
  const fullName = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (fullName.length < 2 || fullName.length > 120) {
    throw new Error("Full name must be 2-120 characters.");
  }
  return fullName;
}

// ── Lockout arithmetic ───────────────────────────────────────────────────────

export interface LockoutState {
  failedAttempts: number;
  /** ISO timestamp, or "" when not locked. */
  lockedUntil: string;
}

export function isLockedOut(state: LockoutState, now: Date = new Date()): boolean {
  if (!state.lockedUntil) return false;
  const until = Date.parse(state.lockedUntil);
  return Number.isFinite(until) && until > now.getTime();
}

/**
 * The state a failed attempt leaves behind. Hitting the limit starts the clock
 * and resets the counter, so a lockout that expires gives a full set of tries
 * back rather than locking again on the very next miss.
 */
export function nextFailureState(state: LockoutState, now: Date = new Date()): LockoutState {
  const attempts = (Number(state.failedAttempts) || 0) + 1;
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    return {
      failedAttempts: 0,
      lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000).toISOString(),
    };
  }
  return { failedAttempts: attempts, lockedUntil: "" };
}

export function minutesUntilUnlock(state: LockoutState, now: Date = new Date()): number {
  if (!isLockedOut(state, now)) return 0;
  return Math.max(1, Math.ceil((Date.parse(state.lockedUntil) - now.getTime()) / 60000));
}

// ── Records ──────────────────────────────────────────────────────────────────

export interface InternalAccount {
  itemId: string;
  loginId: string;
  fullName: string;
  status: "active" | "disabled";
  tokenVersion: number;
  failedAttempts: number;
  lockedUntil: string;
  lastLoginAt: string;
  createdBy: string;
  createdAt: string;
}

/** Everything except the password hash — what an admin screen may see. */
export type InternalAccountSummary = Omit<InternalAccount, "itemId"> & { locked: boolean };

function toAccount(item: GraphListItem): InternalAccount {
  const fields = item.fields || {};
  return {
    itemId: item.id,
    loginId: String(fields.Title || ""),
    fullName: String(fields[COLUMN_FULL_NAME] || ""),
    status: String(fields[COLUMN_STATUS] || "active") === "disabled" ? "disabled" : "active",
    tokenVersion: Number(fields[COLUMN_TOKEN_VERSION]) || 0,
    failedAttempts: Number(fields[COLUMN_FAILED_ATTEMPTS]) || 0,
    lockedUntil: String(fields[COLUMN_LOCKED_UNTIL] || ""),
    lastLoginAt: String(fields[COLUMN_LAST_LOGIN] || ""),
    createdBy: String(fields[COLUMN_CREATED_BY] || ""),
    createdAt: String(fields[COLUMN_CREATED_AT] || ""),
  };
}

export function toAccountSummary(account: InternalAccount, now: Date = new Date()): InternalAccountSummary {
  return {
    loginId: account.loginId,
    fullName: account.fullName,
    status: account.status,
    tokenVersion: account.tokenVersion,
    failedAttempts: account.failedAttempts,
    lockedUntil: account.lockedUntil,
    lastLoginAt: account.lastLoginAt,
    createdBy: account.createdBy,
    createdAt: account.createdAt,
    locked: isLockedOut(account, now),
  };
}

// ── Provisioning ─────────────────────────────────────────────────────────────

/**
 * Creates the list and its columns with the admin's own delegated token over
 * SharePoint REST. Both halves, not just the columns: the app-only principal is
 * refused list creation on this tenant as well, so a Graph `POST /sites/{id}/lists`
 * here came back `403 accessDenied` and the "Set up" button did nothing.
 */
export async function ensureInternalAccountsSchema(delegatedToken: string): Promise<void> {
  await ensureListViaSPRest(delegatedToken, INTERNAL_ACCOUNTS_LIST);
  for (const column of ACCOUNT_COLUMNS) {
    await ensureTextFieldViaSPRest(delegatedToken, INTERNAL_ACCOUNTS_LIST, column, column);
  }
}

// ── Reads and writes ─────────────────────────────────────────────────────────

/** The list has never been provisioned — the caller's "no such account" is right. */
function isMissingList(error: unknown): boolean {
  return error instanceof Error && error.message.includes(`List "${INTERNAL_ACCOUNTS_LIST}" not found`);
}

/**
 * Finds one account's list item, or null if there genuinely is not one.
 *
 * The filtered read is the fast path and stays the only path when it works. What
 * it must never again do is *fail silently*: this used to end in `.catch(() =>
 * null)`, so a Graph refusal and an absent account were indistinguishable, and
 * the first portal account ever issued could be created and then neither signed
 * into ("that login ID and password do not match") nor reset ("that portal
 * account no longer exists") — both describing a row that was sitting there.
 *
 * The scan runs only when the filter *errored*, never when it returned nothing.
 * That distinction is load-bearing twice over: a scan per failed sign-in attempt
 * would be wasteful, and — since a real account resolves on the fast path — it
 * would also make a nonexistent login ID answer measurably slower than a real
 * one, handing back exactly the enumeration signal `burnVerificationTime` exists
 * to remove.
 */
async function findAccountItem(graphToken: string, loginId: string): Promise<GraphListItem | null> {
  try {
    return await queryListItemByFields(graphToken, INTERNAL_ACCOUNTS_LIST, { Title: loginId });
  } catch (error) {
    if (isMissingList(error)) return null;
    logWarn("api:internal-auth", "Filtered account lookup failed; scanning the list instead", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    // Affordable precisely here: portal accounts are issued one at a time, by
    // hand, to people who have no mailbox. This is not a list that grows with use.
    const items = await queryAllListItems(graphToken, INTERNAL_ACCOUNTS_LIST, { maxItems: 2000 });
    return items.find((item) => String(item.fields?.Title ?? "") === loginId) ?? null;
  } catch (error) {
    if (isMissingList(error)) return null;
    throw error;
  }
}

export async function readAccountRow(
  graphToken: string,
  loginId: string,
): Promise<{ account: InternalAccount; passwordHash: string } | null> {
  const item = await findAccountItem(graphToken, loginId);
  if (!item) return null;
  return { account: toAccount(item), passwordHash: String(item.fields?.[COLUMN_PASSWORD_HASH] || "") };
}

export async function listAccounts(graphToken: string): Promise<InternalAccountSummary[]> {
  const items = await queryAllListItems(graphToken, INTERNAL_ACCOUNTS_LIST, { maxItems: 2000 });
  const now = new Date();
  return items
    .map((item) => toAccountSummary(toAccount(item), now))
    .filter((account) => account.loginId)
    .sort((a, b) => a.loginId.localeCompare(b.loginId));
}

export async function createAccount(
  graphToken: string,
  input: { loginId: string; fullName: string; password: string },
  createdBy: string,
): Promise<InternalAccountSummary> {
  const loginId = validateLoginId(input.loginId);
  const fullName = validateFullName(input.fullName);
  const password = validatePassword(input.password);

  if (await readAccountRow(graphToken, loginId)) {
    throw new Error(`A portal account with the login ID "${loginId}" already exists.`);
  }

  const createdAt = new Date().toISOString();
  await createListItem(graphToken, INTERNAL_ACCOUNTS_LIST, {
    Title: loginId,
    [COLUMN_FULL_NAME]: fullName,
    [COLUMN_PASSWORD_HASH]: await hashPassword(password),
    [COLUMN_STATUS]: "active",
    [COLUMN_TOKEN_VERSION]: "1",
    [COLUMN_FAILED_ATTEMPTS]: "0",
    [COLUMN_LOCKED_UNTIL]: "",
    [COLUMN_LAST_LOGIN]: "",
    [COLUMN_CREATED_BY]: createdBy,
    [COLUMN_CREATED_AT]: createdAt,
  });

  return {
    loginId,
    fullName,
    status: "active",
    tokenVersion: 1,
    failedAttempts: 0,
    lockedUntil: "",
    lastLoginAt: "",
    createdBy,
    createdAt,
    locked: false,
  };
}

/**
 * Sets a new password and retires every session the old one issued. There is no
 * "read the current password" counterpart anywhere in this module — the stored
 * value is a one-way hash, so an admin can replace a password but never learn it.
 */
export async function resetAccountPassword(
  graphToken: string,
  loginId: string,
  newPassword: string,
): Promise<void> {
  const password = validatePassword(newPassword);
  const row = await readAccountRow(graphToken, loginId);
  if (!row) throw new Error("That portal account no longer exists.");

  await updateListItemFields(graphToken, INTERNAL_ACCOUNTS_LIST, row.account.itemId, {
    [COLUMN_PASSWORD_HASH]: await hashPassword(password),
    [COLUMN_TOKEN_VERSION]: String(row.account.tokenVersion + 1),
    [COLUMN_FAILED_ATTEMPTS]: "0",
    [COLUMN_LOCKED_UNTIL]: "",
  });
  forgetCachedAccountState(loginId);
}

export async function setAccountStatus(
  graphToken: string,
  loginId: string,
  status: "active" | "disabled",
): Promise<void> {
  const row = await readAccountRow(graphToken, loginId);
  if (!row) throw new Error("That portal account no longer exists.");

  await updateListItemFields(graphToken, INTERNAL_ACCOUNTS_LIST, row.account.itemId, {
    [COLUMN_STATUS]: status,
    // Disabling has to cut off whoever is already signed in, not just refuse the
    // next sign-in. Bumping the version is what makes their token stop verifying.
    [COLUMN_TOKEN_VERSION]: String(row.account.tokenVersion + 1),
    ...(status === "active" ? { [COLUMN_FAILED_ATTEMPTS]: "0", [COLUMN_LOCKED_UNTIL]: "" } : {}),
  });
  forgetCachedAccountState(loginId);
}

/** Clears a lockout early, for the support call that follows one. */
export async function unlockAccount(graphToken: string, loginId: string): Promise<void> {
  const row = await readAccountRow(graphToken, loginId);
  if (!row) throw new Error("That portal account no longer exists.");

  await updateListItemFields(graphToken, INTERNAL_ACCOUNTS_LIST, row.account.itemId, {
    [COLUMN_FAILED_ATTEMPTS]: "0",
    [COLUMN_LOCKED_UNTIL]: "",
  });
}

export async function deleteAccount(graphToken: string, loginId: string): Promise<void> {
  const row = await readAccountRow(graphToken, loginId);
  if (!row) return;
  await deleteListItem(graphToken, INTERNAL_ACCOUNTS_LIST, row.account.itemId);
  forgetCachedAccountState(loginId);
}

// ── Live session checks ──────────────────────────────────────────────────────

interface CachedAccountState {
  tokenVersion: number;
  status: "active" | "disabled";
  expiresAt: number;
}

/**
 * A signed token is proof of who someone is, not proof they are still allowed
 * in. Disabling an account or resetting its password bumps the token version,
 * and this is where an already-issued token finds that out.
 *
 * Cached briefly because it runs on every request a portal account makes, while
 * the thing it reads changes when an admin clicks something. The cache is what
 * bounds a disable to taking effect within a minute rather than immediately —
 * an acceptable trade for not adding a SharePoint round trip to every call.
 */
const ACCOUNT_STATE_CACHE_MS = 60_000;
const accountStateCache = new Map<string, CachedAccountState>();

export async function isPortalSessionCurrent(
  graphToken: string,
  loginId: string,
  tokenVersion: number,
): Promise<boolean> {
  const key = normalizeLoginId(loginId);
  if (!key) return false;

  const cached = accountStateCache.get(key);
  const state =
    cached && cached.expiresAt > Date.now()
      ? cached
      : await (async (): Promise<CachedAccountState | null> => {
          const row = await readAccountRow(graphToken, key);
          if (!row) return null;
          const fresh: CachedAccountState = {
            tokenVersion: row.account.tokenVersion,
            status: row.account.status,
            expiresAt: Date.now() + ACCOUNT_STATE_CACHE_MS,
          };
          accountStateCache.set(key, fresh);
          return fresh;
        })();

  if (!state) return false;
  return state.status === "active" && state.tokenVersion === tokenVersion;
}

/** Drops the cached state so a status change is felt on the very next request. */
function forgetCachedAccountState(loginId: string): void {
  accountStateCache.delete(normalizeLoginId(loginId));
}

// ── Authentication ───────────────────────────────────────────────────────────

export type AuthResult =
  | { ok: true; account: InternalAccount }
  | { ok: false; reason: "mismatch" }
  | { ok: false; reason: "disabled" }
  | { ok: false; reason: "locked"; minutes: number };

/**
 * Checks a login ID and password, maintaining the lockout counters as it goes.
 *
 * A missing account and a wrong password both answer `mismatch`, and both take
 * about the same time — telling them apart hands an attacker a list of which
 * login IDs exist.
 */
export async function authenticateAccount(
  graphToken: string,
  rawLoginId: string,
  rawPassword: string,
): Promise<AuthResult> {
  const loginId = normalizeLoginId(rawLoginId);
  const password = String(rawPassword ?? "");
  if (!loginId || !password) {
    await burnVerificationTime();
    return { ok: false, reason: "mismatch" };
  }

  const row = await readAccountRow(graphToken, loginId);
  if (!row) {
    await burnVerificationTime();
    return { ok: false, reason: "mismatch" };
  }

  const now = new Date();
  if (isLockedOut(row.account, now)) {
    return { ok: false, reason: "locked", minutes: minutesUntilUnlock(row.account, now) };
  }

  const matched = await verifyPassword(password, row.passwordHash);

  if (!matched) {
    const next = nextFailureState(row.account, now);
    // Best effort: a counter that could not be written must not turn a wrong
    // password into a server error, which would read as "something else broke".
    await updateListItemFields(graphToken, INTERNAL_ACCOUNTS_LIST, row.account.itemId, {
      [COLUMN_FAILED_ATTEMPTS]: String(next.failedAttempts),
      [COLUMN_LOCKED_UNTIL]: next.lockedUntil,
    }).catch((error: unknown) => {
      logWarn("api:internal-auth", "Could not record a failed sign-in attempt", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    });

    if (next.lockedUntil) {
      return { ok: false, reason: "locked", minutes: LOCKOUT_MINUTES };
    }
    return { ok: false, reason: "mismatch" };
  }

  // Checked only now that the password is known to be right. Answering
  // "disabled" any earlier would let anyone confirm which login IDs exist by
  // typing nonsense at them; this way only the account's real holder is told,
  // which is exactly who needs to know why they cannot get in.
  if (row.account.status === "disabled") {
    return { ok: false, reason: "disabled" };
  }

  await updateListItemFields(graphToken, INTERNAL_ACCOUNTS_LIST, row.account.itemId, {
    [COLUMN_FAILED_ATTEMPTS]: "0",
    [COLUMN_LOCKED_UNTIL]: "",
    [COLUMN_LAST_LOGIN]: now.toISOString(),
  }).catch((error: unknown) => {
    logWarn("api:internal-auth", "Could not record a successful sign-in", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  });

  return { ok: true, account: row.account };
}

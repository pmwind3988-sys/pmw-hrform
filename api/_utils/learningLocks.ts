import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { hashPassword, verifyPassword } from "./internalAccounts.js";

/**
 * Password locks on learning content — a topic folder, or a single material,
 * that will not open until the password is typed.
 *
 * Three rules shape everything below:
 *
 * 1. **A lock hides, it does not merely refuse.** A locked topic's materials are
 *    not listed, not searchable, and carry no thumbnail, no media URL and no
 *    description. "Blocked from preview" is the requirement, and a card that
 *    autoplays the first eight seconds of a video it then asks a password for
 *    would not meet it.
 * 2. **The nearest lock wins.** A material's gate is its own password if it has
 *    one, otherwise the closest locked folder above it. Nobody is ever asked for
 *    two passwords to reach one file.
 * 3. **Nothing is remembered.** Unlocking issues a short-lived signed pass and
 *    the browser holds it in memory only — never localStorage, never a cookie.
 *    Opening a locked material asks again every single time.
 */

export type LockScope = "material" | "topic";

/** The one lock that stands between a caller and a piece of content. */
export interface EffectiveLock {
  scope: LockScope;
  /** A drive item id for `material`, a library-relative folder path for `topic`. */
  target: string;
  /** The stored scrypt string. Never leaves the server. */
  hash: string;
}

/** Every password currently set, keyed by what it protects. */
export interface LockIndex {
  materials: Record<string, string>;
  topics: Record<string, string>;
}

// ── Password rules ───────────────────────────────────────────────────────────

/**
 * Shorter than the 10 a portal account needs. These are handed out in a room —
 * read off a slide, said out loud at the end of a briefing — and a length that
 * forces people to write it on a whiteboard protects nothing. The cost of a
 * guess is what carries the weight here: scrypt at the same parameters portal
 * accounts use, plus the cooldown at the bottom of this file.
 */
export const MIN_LOCK_PASSWORD_LENGTH = 8;
const MAX_LOCK_PASSWORD_LENGTH = 200;

export function validateLockPassword(raw: unknown): string {
  const password = String(raw ?? "");
  if (password.length < MIN_LOCK_PASSWORD_LENGTH) {
    throw new Error(`The password must be at least ${MIN_LOCK_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > MAX_LOCK_PASSWORD_LENGTH) {
    throw new Error(`The password must be at most ${MAX_LOCK_PASSWORD_LENGTH} characters.`);
  }
  if (new Set(password).size < 4) {
    throw new Error("That password is too repetitive. Use a longer mix of characters.");
  }
  return password;
}

/** Same scrypt parameters, same stored format, as a portal account password. */
export function hashLockPassword(password: string): Promise<string> {
  return hashPassword(password);
}

export function verifyLockPassword(password: string, stored: string): Promise<boolean> {
  return verifyPassword(password, stored);
}

// ── Resolving which lock applies ─────────────────────────────────────────────

export function lockKey(scope: LockScope, target: string): string {
  return `${scope}:${target}`;
}

/** "a/b/c" → ["a/b/c", "a/b", "a"]. The library root cannot carry a lock. */
function selfAndAncestors(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  const paths: string[] = [];
  for (let end = segments.length; end > 0; end -= 1) {
    paths.push(segments.slice(0, end).join("/"));
  }
  return paths;
}

export function buildLockIndex(settings: {
  materials: Record<string, { passwordHash?: string }>;
  topics: Record<string, { passwordHash?: string }>;
}): LockIndex {
  const materials: Record<string, string> = {};
  for (const [id, value] of Object.entries(settings.materials)) {
    if (value?.passwordHash) materials[id] = value.passwordHash;
  }
  const topics: Record<string, string> = {};
  for (const [path, value] of Object.entries(settings.topics)) {
    if (value?.passwordHash) topics[path] = value.passwordHash;
  }
  return { materials, topics };
}

/** A folder's own password, if it has one. What "open this topic" asks for. */
export function topicOwnLock(index: LockIndex, path: string): EffectiveLock | null {
  const hash = path ? index.topics[path] : "";
  return hash ? { scope: "topic", target: path, hash } : null;
}

/**
 * The gate on one material: its own password, else the closest locked folder
 * above it. Returns null when the material is open to every signed-in learner.
 */
export function materialLock(index: LockIndex, materialId: string, folderPath: string): EffectiveLock | null {
  const own = index.materials[materialId];
  if (own) return { scope: "material", target: materialId, hash: own };

  for (const candidate of selfAndAncestors(folderPath)) {
    const hash = index.topics[candidate];
    if (hash) return { scope: "topic", target: candidate, hash };
  }
  return null;
}

/**
 * Whether every folder *above* this path is unlocked for this caller. A topic
 * whose parent is still locked is not listed at all — otherwise the tree itself
 * would spell out what is being kept back, one folder name at a time.
 *
 * Every ancestor is checked, not just the nearest. Reaching a nested folder
 * normally means unlocking its parents on the way down, but a pass is a bearer
 * token: checking only the nearest would let a pass for an inner folder stand in
 * for one that was never opened.
 */
export function ancestorsUnlocked(index: LockIndex, path: string, satisfied: Set<string>): boolean {
  const parentPath = path.split("/").slice(0, -1).join("/");
  return selfAndAncestors(parentPath).every(
    (candidate) => !index.topics[candidate] || satisfied.has(lockKey("topic", candidate)),
  );
}

/** Whether this folder's own contents may be listed for this caller. */
export function topicUnlocked(index: LockIndex, path: string, satisfied: Set<string>): boolean {
  return selfAndAncestors(path).every(
    (candidate) => !index.topics[candidate] || satisfied.has(lockKey("topic", candidate)),
  );
}

// ── Unlock passes ────────────────────────────────────────────────────────────

/**
 * Signed with a server-only secret, so a pass cannot be minted in the browser
 * that holds it. `INTERNAL_SESSION_SECRET` when it is configured, otherwise the
 * Graph client secret — which is never optional, because nothing on this route
 * answers at all without it. Deriving a subkey rather than signing with either
 * value directly keeps a pass from ever being mistaken for a portal session
 * token, and vice versa.
 */
function passSecret(): string {
  const base = process.env.INTERNAL_SESSION_SECRET || process.env.SYSTEM_CLIENT_SECRET || "";
  if (!base) return "";
  return createHmac("sha256", base).update("learning-lock-pass-v1").digest("base64");
}

const PASS_PREFIX = "pmwl1";

/** Material passes cover one open. Topic passes cover one browse of a folder. */
export const MATERIAL_PASS_TTL_SECONDS = 5 * 60;
export const TOPIC_PASS_TTL_SECONDS = 60 * 60;

/** A caller cannot be holding more than a handful of these legitimately. */
const MAX_PASSES_PER_REQUEST = 32;

interface PassClaims {
  s: LockScope;
  t: string;
  /** The viewer key this was issued to — a pass is not passed around. */
  v: string;
  /** Fingerprint of the password hash: changing the password retires the pass. */
  k: string;
  /** Expiry, epoch milliseconds. */
  x: number;
}

function passStamp(hash: string): string {
  return createHash("sha256").update(hash).digest("hex").slice(0, 12);
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`${PASS_PREFIX}.${payload}`).digest("base64url");
}

export function signLockPass(
  lock: EffectiveLock,
  viewer: string,
  ttlSeconds: number,
): { pass: string; expiresAt: string } {
  const secret = passSecret();
  if (!secret) throw new Error("Locked materials are not configured on this deployment.");

  const expiresAtMs = Date.now() + ttlSeconds * 1000;
  const payload = Buffer.from(
    JSON.stringify({
      s: lock.scope,
      t: lock.target,
      v: viewer,
      k: passStamp(lock.hash),
      x: expiresAtMs,
    } satisfies PassClaims),
    "utf8",
  ).toString("base64url");

  return {
    pass: `${PASS_PREFIX}.${payload}.${signPayload(payload, secret)}`,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

function readPassClaims(pass: string, secret: string): PassClaims | null {
  if (!pass.startsWith(`${PASS_PREFIX}.`)) return null;
  const parts = pass.split(".");
  if (parts.length !== 3) return null;

  const [, payload, signature] = parts;
  if (!payload || !signature) return null;

  const expected = Buffer.from(signPayload(payload, secret), "utf8");
  const received = Buffer.from(signature, "utf8");
  // A length mismatch is itself a timing signal, and `timingSafeEqual` throws on
  // one — so the lengths are compared first and the bytes in constant time.
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<PassClaims>;
    if (claims.s !== "material" && claims.s !== "topic") return null;
    if (typeof claims.t !== "string" || typeof claims.v !== "string" || typeof claims.k !== "string") return null;
    if (!Number.isFinite(claims.x) || Number(claims.x) <= Date.now()) return null;
    return { s: claims.s, t: claims.t, v: claims.v, k: claims.k, x: Number(claims.x) };
  } catch {
    return null;
  }
}

/**
 * Folds whatever passes the caller sent into the set of locks they have actually
 * satisfied. A pass counts only when it was signed by this server, issued to
 * this viewer, has not expired, and still matches the password now stored — so
 * changing a password shuts out everyone holding an old pass immediately.
 */
export function readSatisfiedLocks(raw: unknown, viewer: string, index: LockIndex): Set<string> {
  const satisfied = new Set<string>();
  if (!Array.isArray(raw) || raw.length === 0) return satisfied;

  const secret = passSecret();
  if (!secret) return satisfied;

  for (const entry of raw.slice(0, MAX_PASSES_PER_REQUEST)) {
    if (typeof entry !== "string" || !entry) continue;
    const claims = readPassClaims(entry, secret);
    if (!claims || claims.v !== viewer) continue;

    const hash = claims.s === "material" ? index.materials[claims.t] : index.topics[claims.t];
    if (!hash || passStamp(hash) !== claims.k) continue;

    satisfied.add(lockKey(claims.s, claims.t));
  }

  return satisfied;
}

// ── Guess throttling ─────────────────────────────────────────────────────────

/**
 * Best effort, and deliberately so. Serverless instances come and go, so this
 * map is not a durable counter the way a portal account's lockout column is —
 * it slows a run of guesses down a particular instance without ever locking a
 * shared password out for everyone else, which is the failure mode that would
 * matter here: one person guessing must not shut a whole department out of the
 * briefing they were told to watch. The real cost to a guesser is scrypt.
 */
const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 60_000;

interface AttemptState {
  failures: number;
  blockedUntil: number;
}

const attempts = new Map<string, AttemptState>();

function attemptKey(viewer: string, lock: EffectiveLock): string {
  return `${viewer}|${lockKey(lock.scope, lock.target)}`;
}

/** Seconds the caller must wait, or 0 when they may try now. */
export function lockCooldownSeconds(viewer: string, lock: EffectiveLock): number {
  const state = attempts.get(attemptKey(viewer, lock));
  if (!state || state.blockedUntil <= Date.now()) return 0;
  return Math.max(1, Math.ceil((state.blockedUntil - Date.now()) / 1000));
}

export function noteLockFailure(viewer: string, lock: EffectiveLock): void {
  const key = attemptKey(viewer, lock);
  const state = attempts.get(key);
  const failures = (state && state.blockedUntil <= Date.now() ? state.failures : state?.failures ?? 0) + 1;

  if (failures >= MAX_ATTEMPTS) {
    // The counter resets with the block, so a served cooldown hands back a full
    // set of tries rather than blocking again on the very next miss.
    attempts.set(key, { failures: 0, blockedUntil: Date.now() + COOLDOWN_MS });
    return;
  }
  attempts.set(key, { failures, blockedUntil: 0 });
}

export function noteLockSuccess(viewer: string, lock: EffectiveLock): void {
  attempts.delete(attemptKey(viewer, lock));
}

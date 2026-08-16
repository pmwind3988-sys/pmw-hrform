import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed sessions for portal accounts — the HR-issued login-ID identities that
 * have no Microsoft 365 token to prove who they are.
 *
 * The token is `pmwp1.<payload>.<signature>`, where the payload is readable
 * base64url JSON and the signature is an HMAC over it. Readable is fine: the
 * signature is what makes it unforgeable, and nothing secret is inside.
 */

/**
 * A dedicated secret, and deliberately NOT `API_SECRET_KEY`.
 *
 * The frontend ships that one to every browser as `VITE_API_SECRET_KEY` — it is
 * a public value that only keeps casual traffic off the API. Signing sessions
 * with it would let anyone holding the bundle mint a token for any login ID.
 * With no secret configured, this module issues nothing at all.
 */
const SESSION_SECRET = process.env.INTERNAL_SESSION_SECRET || "";

const TOKEN_PREFIX = "pmwp1";
const DEFAULT_TTL_HOURS = 12;

export interface PortalSessionClaims {
  loginId: string;
  fullName: string;
  /**
   * The account's token generation. A password reset or a disable bumps it,
   * which retires every session issued before — the only way to hang up on a
   * stolen token when the tokens themselves are stateless.
   */
  tokenVersion: number;
  issuedAt: string;
  expiresAt: string;
}

export function portalSessionsEnabled(): boolean {
  return SESSION_SECRET.length >= 32;
}

/** The message an admin can act on, rather than a 500 with no explanation. */
export const PORTAL_SESSIONS_DISABLED_MESSAGE =
  "Portal account sign-in is not configured. Set INTERNAL_SESSION_SECRET (32+ characters) in the environment.";

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", SESSION_SECRET).update(`${TOKEN_PREFIX}.${payload}`).digest("base64url");
}

export function signPortalSession(
  claims: Omit<PortalSessionClaims, "issuedAt" | "expiresAt">,
  ttlHours = DEFAULT_TTL_HOURS,
): { token: string; expiresAt: string } {
  if (!portalSessionsEnabled()) throw new Error(PORTAL_SESSIONS_DISABLED_MESSAGE);

  const now = Date.now();
  const expiresAt = new Date(now + ttlHours * 60 * 60 * 1000).toISOString();
  const payload = base64UrlEncode(
    JSON.stringify({
      loginId: claims.loginId,
      fullName: claims.fullName,
      tokenVersion: claims.tokenVersion,
      issuedAt: new Date(now).toISOString(),
      expiresAt,
    } satisfies PortalSessionClaims),
  );

  return { token: `${TOKEN_PREFIX}.${payload}.${sign(payload)}`, expiresAt };
}

/** Cheap enough to run on every request before reaching for a network call. */
export function looksLikePortalToken(token: string): boolean {
  return token.startsWith(`${TOKEN_PREFIX}.`);
}

/**
 * Returns the claims only for a token this server signed, that has not expired.
 * Every failure answers `null` — a caller that cannot tell "bad signature" from
 * "expired" cannot leak the difference either.
 */
export function verifyPortalSession(token: string): PortalSessionClaims | null {
  if (!portalSessionsEnabled() || !looksLikePortalToken(token)) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [, payload, signature] = parts;
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload), "utf8");
  const received = Buffer.from(signature, "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself be a timing
  // signal; the length check first keeps the comparison constant-time.
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const claims = JSON.parse(base64UrlDecode(payload)) as Partial<PortalSessionClaims>;
    if (!claims.loginId || !claims.expiresAt) return null;
    if (Date.parse(claims.expiresAt) <= Date.now()) return null;

    return {
      loginId: String(claims.loginId),
      fullName: String(claims.fullName || ""),
      tokenVersion: Number(claims.tokenVersion) || 0,
      issuedAt: String(claims.issuedAt || ""),
      expiresAt: String(claims.expiresAt),
    };
  } catch {
    return null;
  }
}

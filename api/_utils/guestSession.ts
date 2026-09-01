import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed sessions for guest members — the people who sign in with Google and
 * have no Microsoft 365 token to prove who they are.
 *
 * The token is `pmwg1.<payload>.<signature>`, where the payload is readable
 * base64url JSON and the signature is an HMAC over it. Readable is fine: the
 * signature is what makes it unforgeable, and nothing secret is inside.
 *
 * This replaces the `pmwp1` portal-account session. The prefix is deliberately
 * different rather than reused: a token minted for the deleted password system
 * must not verify as a guest member, and a stray old token in somebody's browser
 * should fail cleanly at the door rather than resolve to a person.
 */

/**
 * A dedicated secret, and deliberately NOT `API_SECRET_KEY`.
 *
 * The frontend ships that one to every browser as `VITE_API_SECRET_KEY` — it is
 * a public value that only keeps casual traffic off the API. Signing sessions
 * with it would let anyone holding the bundle mint a token for any address.
 * With no secret configured, this module issues nothing at all.
 */
const SESSION_SECRET = process.env.INTERNAL_SESSION_SECRET || "";

const TOKEN_PREFIX = "pmwg1";
const DEFAULT_TTL_HOURS = 12;

export interface GuestSessionClaims {
  /** The Google-verified address. Lowercased, and the key everything else uses. */
  email: string;
  /** The name the member declared, or Google's until they have. */
  fullName: string;
  /**
   * The member's token generation. Disabling them, or revoking their learning
   * approval, bumps it — which retires every session issued before, the only
   * way to hang up on a stolen token when the tokens themselves are stateless.
   */
  tokenVersion: number;
  issuedAt: string;
  expiresAt: string;
}

export function guestSessionsEnabled(): boolean {
  return SESSION_SECRET.length >= 32;
}

/** The message an admin can act on, rather than a 500 with no explanation. */
export const GUEST_SESSIONS_DISABLED_MESSAGE =
  "Guest sign-in is not configured. Set INTERNAL_SESSION_SECRET (32+ characters) in the environment.";

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", SESSION_SECRET).update(`${TOKEN_PREFIX}.${payload}`).digest("base64url");
}

export function signGuestSession(
  claims: Omit<GuestSessionClaims, "issuedAt" | "expiresAt">,
  ttlHours = DEFAULT_TTL_HOURS,
): { token: string; expiresAt: string } {
  if (!guestSessionsEnabled()) throw new Error(GUEST_SESSIONS_DISABLED_MESSAGE);

  const now = Date.now();
  const expiresAt = new Date(now + ttlHours * 60 * 60 * 1000).toISOString();
  const payload = base64UrlEncode(
    JSON.stringify({
      email: claims.email,
      fullName: claims.fullName,
      tokenVersion: claims.tokenVersion,
      issuedAt: new Date(now).toISOString(),
      expiresAt,
    } satisfies GuestSessionClaims),
  );

  return { token: `${TOKEN_PREFIX}.${payload}.${sign(payload)}`, expiresAt };
}

/** Cheap enough to run on every request before reaching for a network call. */
export function looksLikeGuestToken(token: string): boolean {
  return token.startsWith(`${TOKEN_PREFIX}.`);
}

/**
 * Returns the claims only for a token this server signed, that has not expired.
 * Every failure answers `null` — a caller that cannot tell "bad signature" from
 * "expired" cannot leak the difference either.
 */
export function verifyGuestSession(token: string): GuestSessionClaims | null {
  if (!guestSessionsEnabled() || !looksLikeGuestToken(token)) return null;

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
    const claims = JSON.parse(base64UrlDecode(payload)) as Partial<GuestSessionClaims>;
    if (!claims.email || !claims.expiresAt) return null;
    if (Date.parse(claims.expiresAt) <= Date.now()) return null;

    return {
      email: String(claims.email),
      fullName: String(claims.fullName || ""),
      tokenVersion: Number(claims.tokenVersion) || 0,
      issuedAt: String(claims.issuedAt || ""),
      expiresAt: String(claims.expiresAt),
    };
  } catch {
    return null;
  }
}

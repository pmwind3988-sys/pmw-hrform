import { createPublicKey, createVerify } from "node:crypto";
import { logWarn } from "./logger.js";

/**
 * Verification of the identity token Google hands the browser when someone
 * presses "Continue with Google".
 *
 * The browser is not trusted with any part of this. What it forwards is a token
 * Google signed, and everything that matters — that Google really signed it,
 * that it was issued for *this* application, that it has not expired, and that
 * Google has confirmed the address belongs to the holder — is decided here,
 * against keys fetched from Google rather than anything in the request.
 *
 * There is no Google client secret and no call to any Google API. The token is
 * the whole exchange: the application only ever needs to know who somebody is.
 */

/** Public by nature — it ships in the browser bundle too. The server needs it to check `aud`. */
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";

const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";

/** Google publishes both spellings and rotates between them. Both are legitimate. */
const VALID_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

/**
 * A minute of slack in both directions, for the ordinary case of a serverless
 * clock and Google's clock disagreeing slightly. Wide enough to stop spurious
 * "your sign-in expired" failures, far too narrow to be worth attacking.
 */
const CLOCK_SKEW_SECONDS = 60;

export function googleSignInEnabled(): boolean {
  return GOOGLE_CLIENT_ID.length > 0;
}

/** The message an admin can act on, rather than a 500 with no explanation. */
export const GOOGLE_SIGN_IN_DISABLED_MESSAGE =
  "Google sign-in is not configured. Set GOOGLE_CLIENT_ID in the environment.";

export interface GoogleIdentity {
  /** Lowercased. This is the key a guest member is stored and found by. */
  email: string;
  /** The name as Google holds it. The member declares their own separately. */
  name: string;
}

interface GoogleJwk {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

interface CachedKeys {
  keys: GoogleJwk[];
  expiresAt: number;
}

/**
 * Google's signing keys, cached.
 *
 * Fetching them on every sign-in would add a round trip to Google to a request
 * that already has one to SharePoint, for a set of keys that rotates on the
 * order of days. The cache honours the `max-age` Google sends and falls back to
 * an hour when it sends none.
 */
let cachedKeys: CachedKeys | null = null;

const FALLBACK_CACHE_SECONDS = 3600;

async function fetchGoogleKeys(): Promise<GoogleJwk[]> {
  if (cachedKeys && cachedKeys.expiresAt > Date.now()) return cachedKeys.keys;

  const response = await fetch(GOOGLE_CERTS_URL);
  if (!response.ok) {
    // A stale key set is far better than no sign-in: the keys we hold were valid
    // minutes ago and Google keeps retired keys verifiable for a grace period.
    if (cachedKeys) {
      logWarn("api:google", "Could not refresh Google signing keys; using the cached set", {
        status: response.status,
      });
      return cachedKeys.keys;
    }
    throw new Error(`Google signing keys could not be fetched (${response.status}).`);
  }

  const body = (await response.json()) as { keys?: GoogleJwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  if (keys.length === 0) throw new Error("Google returned no signing keys.");

  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("cache-control") || "")?.[1]);
  const ttlSeconds = Number.isFinite(maxAge) && maxAge > 0 ? maxAge : FALLBACK_CACHE_SECONDS;
  cachedKeys = { keys, expiresAt: Date.now() + ttlSeconds * 1000 };
  return keys;
}

/** Only for tests and for the retry after a key rotation invalidates the cache. */
export function forgetGoogleKeys(): void {
  cachedKeys = null;
}

function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function verifySignature(key: GoogleJwk, signingInput: string, signature: string): boolean {
  if (key.kty !== "RSA" || !key.n || !key.e) return false;
  try {
    const publicKey = createPublicKey({
      key: { kty: "RSA", n: key.n, e: key.e },
      format: "jwk",
    });
    return createVerify("RSA-SHA256")
      .update(signingInput)
      .verify(publicKey, Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}

/**
 * The verified identity behind a Google token, or `null`.
 *
 * Every failure answers `null` for the same reason the session verifier does: a
 * caller that cannot tell "forged" from "expired" cannot leak the difference to
 * whoever sent the token.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity | null> {
  if (!googleSignInEnabled() || !idToken) return null;

  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  const [rawHeader, rawPayload, signature] = parts;
  if (!rawHeader || !rawPayload || !signature) return null;

  const header = decodeSegment(rawHeader);
  const payload = decodeSegment(rawPayload);
  if (!header || !payload) return null;

  // RS256 only. Accepting the algorithm the token names is how "alg: none" and
  // HMAC-with-the-public-key forgeries get in; the algorithm is ours to fix.
  if (header.alg !== "RS256") return null;

  let keys: GoogleJwk[];
  try {
    keys = await fetchGoogleKeys();
  } catch (error) {
    logWarn("api:google", "Google signing keys are unavailable", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  const kid = typeof header.kid === "string" ? header.kid : "";
  // Matching on `kid` is the fast path. Trying every key covers the moment
  // straddling a rotation, when the token names a key we have not fetched yet.
  const candidates = keys.filter((key) => !kid || key.kid === kid);
  const signingInput = `${rawHeader}.${rawPayload}`;
  const matched = (candidates.length > 0 ? candidates : keys).some((key) =>
    verifySignature(key, signingInput, signature),
  );
  if (!matched) return null;

  // Signature good; now the claims. Each of these is a way a genuinely
  // Google-signed token can still be the wrong token to accept here.
  if (!VALID_ISSUERS.has(String(payload.iss || ""))) return null;

  // A token issued for some *other* Google application is validly signed and
  // completely useless as proof that this person meant to sign in here. Without
  // this check, anyone running any Google app could hand us their users' tokens.
  if (String(payload.aud || "") !== GOOGLE_CLIENT_ID) return null;

  const now = Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp);
  const iat = Number(payload.iat);
  if (!Number.isFinite(exp) || exp + CLOCK_SKEW_SECONDS <= now) return null;
  if (Number.isFinite(iat) && iat - CLOCK_SKEW_SECONDS > now) return null;

  const email = String(payload.email || "").trim().toLowerCase();
  if (!email) return null;

  // An unverified address is a claim, not an identity — Google says the holder
  // typed it, not that they can read mail sent to it. Accepting one would let
  // somebody register as a colleague and appear in the access log under that
  // name, which is the one thing the log exists to prevent.
  if (payload.email_verified !== true && payload.email_verified !== "true") return null;

  return { email, name: String(payload.name || "").trim() };
}

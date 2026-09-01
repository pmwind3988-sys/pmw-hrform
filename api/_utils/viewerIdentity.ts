import { resolveTenantIdentity } from "./careerPortalAccess.js";
import { isGuestSessionCurrent } from "./guestMembers.js";
import { looksLikeGuestToken, verifyGuestSession } from "./guestSession.js";

/**
 * "Is somebody signed in, and who?" across both identity systems.
 *
 * The site has two kinds of signed-in visitor: a PMW Microsoft 365 account, and
 * a guest member who signed in with Google and has no Microsoft identity at all.
 * Surfaces that only need to know *that* a visitor is signed in — a private
 * career portal, the learning hub — should ask this rather than reaching for
 * either one directly, or guest members get turned away from everything.
 *
 * This is deliberately not an authorisation check. It answers identity only;
 * what that identity may reach is each endpoint's own business — which for a
 * guest member matters more than it did for the portal accounts this replaces,
 * because signing in is open to anybody and reaching the learning hub is not.
 */

export type ViewerKind = "m365" | "guest";

export interface SignedInViewer {
  kind: ViewerKind;
  /** An address either way — the PMW one, or the Google one. Stable per person. */
  id: string;
  /** Empty for M365 callers, whose display name is not read here. */
  displayName: string;
}

export async function resolveSignedInViewer(
  bearer: string,
  graphToken: string,
): Promise<SignedInViewer | null> {
  if (!bearer) return null;

  // Recognised by prefix and verified with no network call, so a guest member
  // never pays for a Graph `/me` round trip that could not recognise it anyway.
  if (looksLikeGuestToken(bearer)) {
    const claims = verifyGuestSession(bearer);
    if (!claims) return null;
    // The signature proves who they are; this proves they are still allowed in
    // after being disabled retired their token generation.
    if (!(await isGuestSessionCurrent(graphToken, claims.email, claims.tokenVersion))) return null;
    return { kind: "guest", id: claims.email, displayName: claims.fullName };
  }

  const signedInEmail = await resolveTenantIdentity(bearer);
  return signedInEmail ? { kind: "m365", id: signedInEmail, displayName: "" } : null;
}

/**
 * The bearer token from a request's `Authorization` header, or "".
 *
 * Header names are case-insensitive on the wire and the runtime may hand back
 * either a string or an array, so neither can be assumed. Two endpoints grew
 * their own copy of this with subtly different rules; this is the one both now
 * use, so a caller cannot be recognised on one endpoint and not another.
 */
export function bearerFromHeaders(headers: Record<string, string | string[] | undefined>): string {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === "authorization")?.[1];
  const value = (Array.isArray(entry) ? entry[0] : entry) || "";
  if (!/^Bearer\s+/i.test(value)) return "";
  return value.replace(/^Bearer\s+/i, "").trim();
}

/**
 * Who is calling, straight from the request — or null if that cannot be proved.
 *
 * The API key alone answers "does the caller have the bundle", which every
 * browser that has loaded the site does. This answers "who is the caller",
 * which is the question any endpoint returning one person's data has to ask.
 * Verified against the identity provider rather than taken from the request, so
 * it cannot be asserted by whoever is making the call.
 */
export async function requireSignedInViewer(
  headers: Record<string, string | string[] | undefined>,
  graphToken: string,
): Promise<SignedInViewer | null> {
  const bearer = bearerFromHeaders(headers);
  if (!bearer) return null;
  return resolveSignedInViewer(bearer, graphToken);
}

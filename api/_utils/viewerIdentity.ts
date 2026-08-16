import { resolveTenantIdentity } from "./careerPortalAccess.js";
import { isPortalSessionCurrent } from "./internalAccounts.js";
import { looksLikePortalToken, verifyPortalSession } from "./internalSession.js";

/**
 * "Is somebody signed in, and who?" across both identity systems.
 *
 * The site has two kinds of signed-in visitor: a PMW Microsoft 365 account, and
 * an HR-issued portal account with no Microsoft identity at all. Surfaces that
 * only need to know *that* a visitor is signed in — a private career portal, the
 * learning hub — should ask this rather than reaching for either one directly,
 * or portal accounts get turned away from everything.
 *
 * This is deliberately not an authorisation check. It answers identity only;
 * what that identity may reach is each endpoint's own business.
 */

export type ViewerKind = "m365" | "portal";

export interface SignedInViewer {
  kind: ViewerKind;
  /** The M365 address, or the portal login ID. Stable per person, either way. */
  id: string;
  /** Empty for M365 callers, whose display name is not read here. */
  displayName: string;
}

export async function resolveSignedInViewer(
  bearer: string,
  graphToken: string,
): Promise<SignedInViewer | null> {
  if (!bearer) return null;

  // Recognised by prefix and verified with no network call, so a portal account
  // never pays for a Graph `/me` round trip that could not recognise it anyway.
  if (looksLikePortalToken(bearer)) {
    const claims = verifyPortalSession(bearer);
    if (!claims) return null;
    // The signature proves who they are; this proves they are still allowed in
    // after a disable or a password reset retired their token generation.
    if (!(await isPortalSessionCurrent(graphToken, claims.loginId, claims.tokenVersion))) return null;
    return { kind: "portal", id: claims.loginId, displayName: claims.fullName };
  }

  const signedInEmail = await resolveTenantIdentity(bearer);
  return signedInEmail ? { kind: "m365", id: signedInEmail, displayName: "" } : null;
}

/**
 * sharePointScope.ts — the delegated scope a signed-in user's SharePoint token
 * must be requested with.
 *
 * This exists because getting it wrong fails in a way that reads like a tenant
 * misconfiguration rather than a bug. Asking MSAL for
 * `https://<the app's own origin>/AllSites.Manage` — the mistake you make by
 * reaching for `window.location.origin`, which is right there and looks
 * plausible — produces:
 *
 *     AADSTS500011: The resource principal named https://<app> was not found
 *     in the tenant named <id>.
 *
 * Azure is telling you it has no idea what resource you are asking to access,
 * because the resource is SharePoint, not the web app serving the page. The
 * error names installation and admin consent, which sends people hunting
 * through app registrations for a problem that is one line of client code.
 *
 * The scope must therefore be built from the SHAREPOINT site's origin. Prefer
 * the site the form actually lives on — this tenant serves secondary sites
 * (OSHES, QAQC) whose forms must be reached with their own site's token — and
 * fall back to the home site only when no site is known.
 */

const PLACEHOLDER_ORIGIN = "https://placeholder.sharepoint.com";

/**
 * Builds the `AllSites.Manage` scope for a SharePoint site.
 *
 * `siteUrl` is the site the caller is working against. When it is missing or
 * unparseable, the home site from `VITE_SP_SITE_URL` is used; when that is
 * absent too, a placeholder keeps MSAL from throwing on a malformed scope, and
 * the token request then fails with a real Azure error rather than a crash.
 */
export function sharePointManageScope(siteUrl?: string): string {
  const candidates = [siteUrl, import.meta.env.VITE_SP_SITE_URL as string | undefined];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return `${new URL(candidate).origin}/AllSites.Manage`;
    } catch {
      // Try the next candidate rather than failing on one bad value.
    }
  }
  return `${PLACEHOLDER_ORIGIN}/AllSites.Manage`;
}

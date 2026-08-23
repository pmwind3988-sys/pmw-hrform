/**
 * sites.ts — the SharePoint sites this deployment's form builder may target.
 *
 * The builder is the only part of the app that switches sites. Everything else
 * (form rendering, approvals, dashboards, careers) is fixed to the home site,
 * because a deployment serves one product's forms.
 *
 * What crosses a site boundary here is a URL and a group name — never a secret.
 * The delegated SharePoint scope is granted per *origin*
 * (`https://tenant.sharepoint.com/AllSites.Manage`), so a signed-in user's
 * existing token already works on any site on the same host. Sites on a
 * different host would need their own consent and are deliberately not supported.
 */

export type SiteKey = "hr" | "oshes" | "qaqc";

export interface SiteDefinition {
  key: SiteKey;
  /** Shown in the builder banner and the site switcher. */
  label: string;
  /** Absolute site URL, no trailing slash. */
  url: string;
  /**
   * SharePoint group whose members may author forms on this site.
   * Undefined means "no separate gate" — the home site uses the app's own
   * builder-superuser check instead.
   */
  adminGroup?: string;
  /**
   * Origin of the deployment that serves this site's `/form` routes, no
   * trailing slash. Undefined for the home site, which is whichever origin the
   * builder is already running on.
   */
  appUrl?: string;
}

function trimUrl(value: string | undefined): string {
  return (value || "").replace(/\/$/, "");
}

const HOME_SITE_URL = trimUrl(import.meta.env.VITE_SP_SITE_URL);
const OSHES_SITE_URL = trimUrl(import.meta.env.VITE_SP_SITE_URL_OSHES);
const OSHES_ADMIN_GROUP = (import.meta.env.VITE_OSHES_ADMIN_GROUP || "").trim();
/**
 * A form authored on the OSHES site is served by the OSHES deployment, not this
 * one — this app cannot read that site at runtime, only the builder can write to
 * it. So every link the builder hands out for an OSHES form (public route, QR,
 * profile link) has to name that deployment rather than the origin the builder
 * happens to be open on, or the recipient lands on a form that does not exist.
 *
 * Defaulted rather than required because the sibling project's production URL is
 * a known constant; VITE_APP_URL_OSHES overrides it for a custom domain or a
 * preview deployment.
 */
const OSHES_APP_URL = trimUrl(import.meta.env.VITE_APP_URL_OSHES) || "https://pmw-oshes.vercel.app";

/** QA/QC, on the same terms as OSHES above — see the note on OSHES_APP_URL. */
const QAQC_SITE_URL = trimUrl(import.meta.env.VITE_SP_SITE_URL_QAQC);
const QAQC_ADMIN_GROUP = (import.meta.env.VITE_QAQC_ADMIN_GROUP || "").trim();
const QAQC_APP_URL = trimUrl(import.meta.env.VITE_APP_URL_QAQC) || "https://pmw-qaqc.vercel.app";

export const HOME_SITE_KEY: SiteKey = "hr";

/**
 * A secondary site is absent rather than empty when unconfigured, so a
 * deployment that has not opted in has no second site to switch to at all.
 */
const SITES: Partial<Record<SiteKey, SiteDefinition>> = {
  hr: { key: "hr", label: "PMW HR", url: HOME_SITE_URL },
  ...(OSHES_SITE_URL
    ? {
        oshes: {
          key: "oshes" as const,
          label: "PMW OSHES",
          url: OSHES_SITE_URL,
          adminGroup: OSHES_ADMIN_GROUP || undefined,
          appUrl: OSHES_APP_URL,
        },
      }
    : {}),
  ...(QAQC_SITE_URL
    ? {
        qaqc: {
          key: "qaqc" as const,
          label: "PMW QA/QC",
          url: QAQC_SITE_URL,
          adminGroup: QAQC_ADMIN_GROUP || undefined,
          appUrl: QAQC_APP_URL,
        },
      }
    : {}),
};

export function isSiteKey(value: string | undefined): value is SiteKey {
  return value === "hr" || value === "oshes" || value === "qaqc";
}

/**
 * Resolves a site key to its definition.
 *
 * Throws on anything unknown or unconfigured rather than falling back to the
 * home site. A typo in a URL must stop the builder, not silently point it at
 * HR's lists with full authority — that failure would be invisible until after
 * the writes had happened.
 */
export function resolveSite(key: string | undefined): SiteDefinition {
  const resolvedKey = key ?? HOME_SITE_KEY;
  if (!isSiteKey(resolvedKey)) {
    throw new Error(`Unknown SharePoint site "${resolvedKey}".`);
  }
  const site = SITES[resolvedKey];
  if (!site) {
    throw new Error(
      `SharePoint site "${resolvedKey}" is not configured for this deployment. ` +
        `Set VITE_SP_SITE_URL_${resolvedKey.toUpperCase()} to enable it, then rebuild — ` +
        `it is a VITE_ variable, so restarting is not enough.`,
    );
  }
  if (!site.url) {
    throw new Error(`SharePoint site "${resolvedKey}" has no URL configured.`);
  }
  return site;
}

/**
 * The origin every public link for this site's forms must be built from.
 *
 * The home site is served by whichever deployment is running, so it has no
 * configured URL and answers with the current origin — which keeps preview
 * deployments and localhost linking to themselves.
 */
export function siteAppOrigin(site: SiteDefinition): string {
  return site.appUrl || window.location.origin;
}

/** Sites this deployment can actually reach, home site first. */
export function availableSites(): SiteDefinition[] {
  return (Object.keys(SITES) as SiteKey[])
    .map((key) => SITES[key])
    .filter((site): site is SiteDefinition => !!site?.url);
}

export function isSecondarySiteConfigured(): boolean {
  return availableSites().length > 1;
}

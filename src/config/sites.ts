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

export type SiteKey = "hr" | "oshes";

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
}

function trimUrl(value: string | undefined): string {
  return (value || "").replace(/\/$/, "");
}

const HOME_SITE_URL = trimUrl(import.meta.env.VITE_SP_SITE_URL);
const OSHES_SITE_URL = trimUrl(import.meta.env.VITE_SP_SITE_URL_OSHES);
const OSHES_ADMIN_GROUP = (import.meta.env.VITE_OSHES_ADMIN_GROUP || "").trim();

export const HOME_SITE_KEY: SiteKey = "hr";

/**
 * OSHES is absent rather than empty when unconfigured, so a deployment that has
 * not opted in has no second site to switch to at all.
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
        },
      }
    : {}),
};

export function isSiteKey(value: string | undefined): value is SiteKey {
  return value === "hr" || value === "oshes";
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
        `Set VITE_SP_SITE_URL_OSHES to enable it.`,
    );
  }
  if (!site.url) {
    throw new Error(`SharePoint site "${resolvedKey}" has no URL configured.`);
  }
  return site;
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

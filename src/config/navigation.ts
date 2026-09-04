/* ---------------------------------------------------------------------------
   The shape of the app's navigation, in one place.

   Five categories, each opening a strip of tabs. Four things consume this map —
   the desktop sidebar, the phone bottom bar, the tab strip, and the redirect
   that decides where a signed-in account lands — which is exactly when one fact
   needs one home rather than four sets of props.

   WHY THIS IS A PRESENTATION LAYER AND NOT A ROUTING SCHEME

   Every path below already exists and none of them moves. Approval
   notification emails link to `/approval/:token`. Prefilled QR codes printed
   from the builder point at `/form/:formId`. Evaluators are sent `/eval/...`.
   Those links live in inboxes and on paper, and re-slugging a route to make the
   menu tidier would break them silently — surfacing weeks later as an approver
   reporting that a link "does nothing", with nothing to connect it back here.

   So categories and tabs are derived FROM the path. The router is untouched.
   The only new paths are the two the Profile section needs, which nothing has
   ever linked to.

   GATING MUST AGREE WITH `App.tsx`

   `visibleTo` mirrors the `AdminGuard` on each route. It is not decoration: a
   tab drawn for an account that cannot open it is a link that bounces straight
   back to a restricted-access screen, which is the "nothing works and nothing
   says why" that the guard exists to prevent. If a guard changes in App.tsx,
   this changes with it.
--------------------------------------------------------------------------- */

/**
 * Who may see an entry.
 *
 * - `everyone`  — any signed-in account.
 * - `admin`     — `isAdmin`, matching `<AdminGuard isAdmin={isAdmin}>`.
 * - `superuser` — `canUseFormBuilder`, matching the guards that name "the
 *                 SharePoint superuser group". A narrower group than `admin`,
 *                 and not a subset of it: they are two separate SharePoint
 *                 groups, so both are checked independently.
 */
export type NavAudience = "everyone" | "admin" | "superuser";

/** The icon each entry asks for, resolved to a component by the shell. */
export type NavIconKey =
  | "dashboard"
  | "forms"
  | "submissions"
  | "approvals"
  | "portal"
  | "learning"
  | "admin"
  | "profile"
  | "builder"
  | "routing"
  | "org"
  | "jobs"
  | "applications"
  | "cards"
  | "guests"
  | "appearance"
  | "privacy";

export interface NavTab {
  label: string;
  path: string;
  icon: NavIconKey;
  visibleTo: NavAudience;
  /**
   * Extra paths that belong to this tab without being it — a detail view, or a
   * legacy path that redirects here. Used only to decide which tab is active,
   * never rendered. `/admin/builder/:formTitle` must not light up a second tab,
   * and `/admin/jobs` (which redirects to Applications) must light up
   * Applications rather than nothing.
   */
  alsoMatches?: string[];
  /**
   * This tab's screen renders OUTSIDE the shell, at full viewport width.
   *
   * Only the form builder does. It is a three-pane authoring surface that was
   * losing 224px of the sheet to the sidebar, and it carries its own header,
   * mode rail and home button, so it can afford to leave.
   *
   * Recorded here because `categoryLandingPath` has to know: landing a category
   * button on a full-bleed tab means the menu disappears the instant you click
   * it, which reads as the app breaking rather than as a screen opening.
   */
  fullBleed?: boolean;
}

export interface NavCategory {
  key: string;
  label: string;
  /** Shortened for the phone bottom bar, where five labels share one row. */
  shortLabel: string;
  icon: NavIconKey;
  visibleTo: NavAudience;
  tabs: NavTab[];
}

export interface NavPermissions {
  isAdmin: boolean;
  canUseFormBuilder: boolean;
}

export const NAV_CATEGORIES: NavCategory[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    shortLabel: "Home",
    icon: "dashboard",
    visibleTo: "everyone",
    /**
     * No tabs. The dashboard is one overview, and a strip holding a single tab
     * labelled the same as the category it sits under is furniture that says
     * nothing.
     *
     * The two paths are one destination: `/admin/dashboard` and
     * `/user/dashboard` render the same component behind different guards, and
     * App.tsx already moves an admin off the user path.
     */
    tabs: [],
  },
  {
    key: "work",
    label: "My Work",
    shortLabel: "Work",
    icon: "forms",
    visibleTo: "everyone",
    tabs: [
      { label: "Forms", path: "/forms", icon: "forms", visibleTo: "everyone" },
      {
        label: "My Submissions",
        path: "/submissions",
        icon: "submissions",
        visibleTo: "everyone",
      },
      {
        label: "Approvals",
        path: "/admin/approvals",
        icon: "approvals",
        visibleTo: "superuser",
      },
      /**
       * The superuser-wide submissions view, distinct from "My Submissions"
       * above: that one is this account's own rows, this one is everybody's.
       * Both existed before; only the first was reachable without knowing the
       * URL.
       */
      {
        label: "All Submissions",
        path: "/admin/submissions",
        icon: "submissions",
        visibleTo: "superuser",
      },
    ],
  },
  {
    key: "portal",
    label: "Internal Portal",
    shortLabel: "Portal",
    icon: "portal",
    visibleTo: "everyone",
    tabs: [
      { label: "Job Portal", path: "/career-portal", icon: "portal", visibleTo: "everyone" },
      { label: "Learning", path: "/learning", icon: "learning", visibleTo: "everyone" },
    ],
  },
  {
    key: "admin",
    label: "Admin",
    shortLabel: "Admin",
    icon: "admin",
    /**
     * `everyone`, and the empty-category filter in `visibleCategories` does the
     * real work: the tabs below split across the two groups, so the category
     * should appear for an account holding either and vanish for one holding
     * neither. Gating the category on `admin` here instead would have hidden
     * the builder from a superuser who is not an admin.
     */
    visibleTo: "everyone",
    tabs: [
      {
        label: "Form Builder",
        path: "/admin/builder",
        icon: "builder",
        visibleTo: "superuser",
        alsoMatches: ["/admin/builder/"],
        fullBleed: true,
      },
      { label: "Routing", path: "/admin/routing", icon: "routing", visibleTo: "superuser" },
      { label: "Organisation", path: "/admin/org", icon: "org", visibleTo: "superuser" },
      {
        label: "Opportunities",
        path: "/admin/career/opportunities",
        icon: "jobs",
        visibleTo: "admin",
        alsoMatches: ["/admin/jobs/manage"],
      },
      {
        label: "Applications",
        path: "/admin/career/applications",
        icon: "applications",
        visibleTo: "admin",
        alsoMatches: ["/admin/jobs"],
      },
      { label: "Portal Cards", path: "/admin/career/cards", icon: "cards", visibleTo: "admin" },
      { label: "Learning", path: "/admin/learning", icon: "learning", visibleTo: "admin" },
      { label: "Guests", path: "/admin/guest-members", icon: "guests", visibleTo: "admin" },
    ],
  },
  {
    key: "profile",
    label: "Profile",
    shortLabel: "You",
    icon: "profile",
    visibleTo: "everyone",
    tabs: [
      { label: "My Profile", path: "/profile", icon: "profile", visibleTo: "everyone" },
      { label: "Appearance", path: "/profile/appearance", icon: "appearance", visibleTo: "everyone" },
      { label: "Privacy Notice", path: "/privacy", icon: "privacy", visibleTo: "everyone" },
    ],
  },
];

/** Paths that are the Dashboard category without appearing in any tab list. */
const DASHBOARD_PATHS = ["/admin/dashboard", "/user/dashboard"];

/**
 * Paths that render inside the shell but belong to no tab. They resolve to a
 * category so the sidebar still shows where you are, and light up no tab —
 * which is honest: a form-response view is somewhere below Admin, not one of
 * its eight sections.
 */
const ORPHAN_PATHS: Array<{ prefix: string; category: string }> = [
  { prefix: "/admin/responses/", category: "admin" },
];

/**
 * Strictly one group per audience, with no hierarchy between them.
 *
 * An earlier version let `admin` also pass for a superuser, so that the Admin
 * CATEGORY would appear for a superuser who is not an admin. Because tabs are
 * checked through this same function, that also handed them Portal Cards,
 * Guests and Learning admin -- every one of which sits behind
 * `<AdminGuard isAdmin={isAdmin}>` and would have bounced them to a
 * restricted-access screen. Category visibility is derived from its surviving
 * tabs instead; see `visibleCategories`.
 */
export function canSee(audience: NavAudience, permissions: NavPermissions): boolean {
  if (audience === "everyone") return true;
  if (audience === "superuser") return permissions.canUseFormBuilder;
  return permissions.isAdmin;
}

/** The categories this account may see, each holding only the tabs it may see. */
export function visibleCategories(permissions: NavPermissions): NavCategory[] {
  return NAV_CATEGORIES.filter((category) => canSee(category.visibleTo, permissions))
    .map((category) => ({
      ...category,
      tabs: category.tabs.filter((tab) => canSee(tab.visibleTo, permissions)),
    }))
    // A category whose every tab was filtered out has nothing behind it. Only
    // Dashboard is allowed to have no tabs, because it never had any.
    .filter((category) => category.key === "dashboard" || category.tabs.length > 0);
}

function pathMatches(candidate: string, pathname: string): boolean {
  if (pathname === candidate) return true;
  // A trailing slash in `alsoMatches` means "and everything under it".
  if (candidate.endsWith("/")) return pathname.startsWith(candidate);
  return pathname.startsWith(candidate + "/");
}

export interface NavLocation {
  categoryKey: string | null;
  tabPath: string | null;
}

/**
 * Which category and tab the current path belongs to.
 *
 * Longest match wins. Without that, `/admin/career/cards` matches both the
 * Portal Cards tab and nothing else — but `/admin/builder/My Form` matches both
 * the Form Builder tab and its own `alsoMatches` prefix, and a first-match walk
 * over an eight-tab category is order-dependent in a way that breaks the moment
 * someone reorders the list for visual reasons.
 */
export function resolveNavLocation(pathname: string): NavLocation {
  if (DASHBOARD_PATHS.some((path) => pathMatches(path, pathname))) {
    return { categoryKey: "dashboard", tabPath: null };
  }

  let best: NavLocation & { score: number } = { categoryKey: null, tabPath: null, score: -1 };

  for (const category of NAV_CATEGORIES) {
    for (const tab of category.tabs) {
      for (const candidate of [tab.path, ...(tab.alsoMatches ?? [])]) {
        if (!pathMatches(candidate, pathname)) continue;
        if (candidate.length <= best.score) continue;
        best = { categoryKey: category.key, tabPath: tab.path, score: candidate.length };
      }
    }
  }

  if (best.categoryKey) return { categoryKey: best.categoryKey, tabPath: best.tabPath };

  for (const orphan of ORPHAN_PATHS) {
    if (pathname.startsWith(orphan.prefix)) {
      return { categoryKey: orphan.category, tabPath: null };
    }
  }

  return { categoryKey: null, tabPath: null };
}

/**
 * Where a category's button goes: the first tab this account can both SEE and
 * stay in the shell for.
 *
 * "Can see" keeps an admin-only account off the builder, which would bounce
 * them to a restricted-access screen. "Stays in the shell" keeps a
 * form-builder superuser off it too -- for them the builder is the first
 * visible tab, so clicking Admin would drop them straight into a full-bleed
 * screen with no sidebar, which looks like the menu vanishing rather than like
 * a section opening. They reach the builder by choosing its tab, deliberately.
 *
 * A full-bleed tab is still the fallback if a category has nothing else, since
 * landing somewhere beats landing nowhere.
 */
export function categoryLandingPath(
  category: NavCategory,
  permissions: NavPermissions,
): string {
  if (category.key === "dashboard") {
    return permissions.isAdmin ? "/admin/dashboard" : "/user/dashboard";
  }
  const visible = category.tabs.filter((tab) => canSee(tab.visibleTo, permissions));
  const inShell = visible.find((tab) => !tab.fullBleed);
  return (inShell ?? visible[0])?.path ?? "/user/dashboard";
}

import { describe, expect, it } from "vitest";
import {
  NAV_CATEGORIES,
  canSee,
  categoryLandingPath,
  resolveNavLocation,
  visibleCategories,
} from "./navigation";

const NOBODY = { isAdmin: false, canUseFormBuilder: false };
const ADMIN = { isAdmin: true, canUseFormBuilder: false };
const SUPERUSER = { isAdmin: false, canUseFormBuilder: true };
const BOTH = { isAdmin: true, canUseFormBuilder: true };

describe("resolveNavLocation", () => {
  it("puts both dashboard paths in the Dashboard category with no tab", () => {
    expect(resolveNavLocation("/admin/dashboard")).toEqual({
      categoryKey: "dashboard",
      tabPath: null,
    });
    expect(resolveNavLocation("/user/dashboard")).toEqual({
      categoryKey: "dashboard",
      tabPath: null,
    });
  });

  it("resolves a plain tab path", () => {
    expect(resolveNavLocation("/admin/routing")).toEqual({
      categoryKey: "admin",
      tabPath: "/admin/routing",
    });
  });

  /**
   * The case the longest-match rule exists for. `/admin/builder/Leave Form`
   * matches the Form Builder tab's own path as a prefix AND its `alsoMatches`
   * entry; a first-match walk would resolve it to whichever appears earlier in
   * the list, which changes if anyone reorders the tabs for visual reasons.
   */
  it("keeps a builder detail path on the Form Builder tab", () => {
    expect(resolveNavLocation("/admin/builder/Leave%20Form")).toEqual({
      categoryKey: "admin",
      tabPath: "/admin/builder",
    });
  });

  /**
   * `/admin/jobs` and `/admin/jobs/manage` are redirects in App.tsx, to
   * Applications and Opportunities respectively. The deeper one must not be
   * swallowed by the shallower one's prefix match.
   */
  it("sends the two legacy job paths to different tabs", () => {
    expect(resolveNavLocation("/admin/jobs").tabPath).toBe("/admin/career/applications");
    expect(resolveNavLocation("/admin/jobs/manage").tabPath).toBe(
      "/admin/career/opportunities",
    );
  });

  it("distinguishes the two submissions views", () => {
    expect(resolveNavLocation("/submissions").tabPath).toBe("/submissions");
    expect(resolveNavLocation("/admin/submissions").tabPath).toBe("/admin/submissions");
  });

  it("keeps the two profile paths apart", () => {
    expect(resolveNavLocation("/profile").tabPath).toBe("/profile");
    expect(resolveNavLocation("/profile/appearance").tabPath).toBe("/profile/appearance");
  });

  it("places a response view under Admin with no tab lit", () => {
    expect(resolveNavLocation("/admin/responses/Leave%20Form")).toEqual({
      categoryKey: "admin",
      tabPath: null,
    });
  });

  it("returns nothing for a path outside the shell", () => {
    expect(resolveNavLocation("/form/abc123")).toEqual({ categoryKey: null, tabPath: null });
    expect(resolveNavLocation("/approval/sometoken")).toEqual({
      categoryKey: null,
      tabPath: null,
    });
  });
});

describe("canSee", () => {
  it("shows everyone-entries to an account with no groups", () => {
    expect(canSee("everyone", NOBODY)).toBe(true);
  });

  it("gates superuser entries on the form-builder group alone", () => {
    expect(canSee("superuser", ADMIN)).toBe(false);
    expect(canSee("superuser", SUPERUSER)).toBe(true);
  });

  /**
   * The two groups are separate SharePoint groups, not a hierarchy, and this
   * function must not blur them. Letting `admin` pass for a superuser would
   * also hand them Portal Cards, Guests and Learning admin -- all guarded by
   * `isAdmin` in App.tsx -- so each of those tabs would bounce them to a
   * restricted-access screen.
   */
  it("does not let the form-builder group stand in for admin", () => {
    expect(canSee("admin", SUPERUSER)).toBe(false);
  });
});

describe("category visibility for a superuser who is not an admin", () => {
  /**
   * The other half of that fix. Strict per-tab gating must not cost a superuser
   * the Admin category itself, or the app would grant them the builder and
   * offer no way to reach it. Visibility comes from having surviving tabs.
   */
  it("still shows Admin, holding only the tabs they can open", () => {
    const admin = visibleCategories(SUPERUSER).find((c) => c.key === "admin");
    expect(admin).toBeDefined();
    expect(admin?.tabs.map((t) => t.path)).toEqual([
      "/admin/builder",
      "/admin/routing",
      "/admin/org",
    ]);
  });

  it("hides Admin entirely from an account in neither group", () => {
    expect(visibleCategories(NOBODY).map((c) => c.key)).not.toContain("admin");
  });
});

describe("visibleCategories", () => {
  it("gives a plain employee the three non-admin categories", () => {
    const keys = visibleCategories(NOBODY).map((c) => c.key);
    expect(keys).toEqual(["dashboard", "work", "portal", "profile"]);
  });

  it("drops the two superuser tabs from My Work for a plain employee", () => {
    const work = visibleCategories(NOBODY).find((c) => c.key === "work");
    expect(work?.tabs.map((t) => t.path)).toEqual(["/forms", "/submissions"]);
  });

  it("gives an admin the Admin category without the builder tabs", () => {
    const admin = visibleCategories(ADMIN).find((c) => c.key === "admin");
    expect(admin?.tabs.map((t) => t.path)).not.toContain("/admin/builder");
    expect(admin?.tabs.map((t) => t.path)).toContain("/admin/career/cards");
  });

  it("shows every category and tab to an account in both groups", () => {
    const categories = visibleCategories(BOTH);
    expect(categories).toHaveLength(NAV_CATEGORIES.length);
    const totalTabs = categories.reduce((n, c) => n + c.tabs.length, 0);
    const definedTabs = NAV_CATEGORIES.reduce((n, c) => n + c.tabs.length, 0);
    expect(totalTabs).toBe(definedTabs);
  });
});

describe("categoryLandingPath", () => {
  const admin = NAV_CATEGORIES.find((c) => c.key === "admin")!;
  const dashboard = NAV_CATEGORIES.find((c) => c.key === "dashboard")!;

  it("routes the dashboard button by role", () => {
    expect(categoryLandingPath(dashboard, ADMIN)).toBe("/admin/dashboard");
    expect(categoryLandingPath(dashboard, NOBODY)).toBe("/user/dashboard");
  });

  /**
   * An admin who is not a superuser cannot open the builder, so the Admin
   * button must not take them there only to have AdminGuard bounce them to a
   * restricted-access screen.
   */
  it("lands each group on a tab it can actually open", () => {
    expect(categoryLandingPath(admin, ADMIN)).toBe("/admin/career/opportunities");
  });

  /**
   * The builder is full bleed, so it renders with no sidebar. It is a
   * superuser's first visible Admin tab, and landing them there would make the
   * menu disappear on the same click that opened the section. Routing is the
   * next tab they can see and it keeps the shell.
   */
  it("skips the full-bleed builder when the category has a shell tab", () => {
    expect(categoryLandingPath(admin, SUPERUSER)).toBe("/admin/routing");
  });

  it("never lands anyone on a tab they cannot open", () => {
    for (const perms of [NOBODY, ADMIN, SUPERUSER, BOTH]) {
      for (const category of visibleCategories(perms)) {
        const landing = categoryLandingPath(category, perms);
        const tab = category.tabs.find((t) => t.path === landing);
        // Dashboard has no tabs; every other landing must be a visible tab.
        if (category.key !== "dashboard") {
          expect(tab, `${category.key} -> ${landing}`).toBeDefined();
          expect(canSee(tab!.visibleTo, perms)).toBe(true);
        }
      }
    }
  });

  it("every category's landing path resolves back to that category", () => {
    for (const category of visibleCategories(BOTH)) {
      const landing = categoryLandingPath(category, BOTH);
      expect(resolveNavLocation(landing).categoryKey).toBe(category.key);
    }
  });
});

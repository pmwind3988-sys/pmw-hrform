import { describe, expect, it } from "vitest";

import { sharePointManageScope } from "./sharePointScope";

describe("SharePoint delegated scope", () => {
  it("asks for the site the form actually lives on", () => {
    expect(sharePointManageScope("https://pmwgroupcom.sharepoint.com/sites/PMWHRDocs"))
      .toBe("https://pmwgroupcom.sharepoint.com/AllSites.Manage");
  });

  it("keeps only the origin, so a deep site path does not leak into the scope", () => {
    expect(sharePointManageScope("https://tenant.sharepoint.com/sites/A/subsite/Lists/Things"))
      .toBe("https://tenant.sharepoint.com/AllSites.Manage");
  });

  it("never asks for the app's own origin, which is what AADSTS500011 punishes", () => {
    expect(sharePointManageScope("https://pmwgroupcom.sharepoint.com/sites/X"))
      .not.toContain("vercel.app");
  });

  it("falls back to the configured home site when the caller names no site", () => {
    // The test runner configures VITE_SP_SITE_URL; see vitest.config.ts.
    expect(sharePointManageScope()).toBe("https://sharepoint.invalid/AllSites.Manage");
  });

  it("falls back rather than throwing when handed something unparseable", () => {
    expect(sharePointManageScope("not a url")).toBe("https://sharepoint.invalid/AllSites.Manage");
    expect(sharePointManageScope("")).toBe("https://sharepoint.invalid/AllSites.Manage");
  });

  it("always produces a usable scope, so MSAL fails on Azure's terms not a crash", () => {
    expect(sharePointManageScope("://broken")).toMatch(/^https:\/\/[^/]+\/AllSites\.Manage$/);
  });
});

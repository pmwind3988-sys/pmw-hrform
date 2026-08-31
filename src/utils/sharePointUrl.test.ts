import { describe, expect, it } from "vitest";

import { absoluteSharePointUrl } from "./sharePointUrl";

const SITE = "https://pmwgroupcom.sharepoint.com/sites/PMWHRDocs";

describe("absolute SharePoint URLs", () => {
  it("puts a stored PDF on SharePoint's host, not the app's", () => {
    expect(absoluteSharePointUrl("/sites/PMWHRDocs/Form PDFs/run_8.pdf", SITE))
      .toBe("https://pmwgroupcom.sharepoint.com/sites/PMWHRDocs/Form PDFs/run_8.pdf");
  });

  it("does not repeat the site path, which is the other way to make a 404", () => {
    const result = absoluteSharePointUrl("/sites/PMWHRDocs/Form PDFs/run_8.pdf", SITE);
    expect(result).not.toContain("/sites/PMWHRDocs/sites/PMWHRDocs");
  });

  it("leaves a URL that is already absolute exactly as it is", () => {
    const absolute = "https://pmwgroupcom.sharepoint.com/sites/PMWHRDocs/Form%20PDFs/run_8.pdf";
    expect(absoluteSharePointUrl(absolute, SITE)).toBe(absolute);
  });

  it("leaves an inline data URL alone", () => {
    expect(absoluteSharePointUrl("data:application/pdf;base64,AAAA", SITE))
      .toBe("data:application/pdf;base64,AAAA");
  });

  it("joins a path that arrives without its leading slash", () => {
    expect(absoluteSharePointUrl("sites/PMWHRDocs/f.pdf", SITE))
      .toBe("https://pmwgroupcom.sharepoint.com/sites/PMWHRDocs/f.pdf");
  });

  it("hands back the path rather than inventing a host when the site is unusable", () => {
    expect(absoluteSharePointUrl("/sites/X/f.pdf", "")).toBe("/sites/X/f.pdf");
    expect(absoluteSharePointUrl("/sites/X/f.pdf", "not a url")).toBe("/sites/X/f.pdf");
    expect(absoluteSharePointUrl("/sites/X/f.pdf", undefined)).toBe("/sites/X/f.pdf");
  });

  it("treats an empty stored value as no link at all", () => {
    expect(absoluteSharePointUrl("", SITE)).toBe("");
    expect(absoluteSharePointUrl(undefined, SITE)).toBe("");
    expect(absoluteSharePointUrl("   ", SITE)).toBe("");
  });
});

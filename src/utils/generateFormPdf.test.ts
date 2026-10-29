import { describe, expect, it } from "vitest";
import { __test__ } from "./generateFormPdf";

describe("PDF image hydration", () => {
  it("recognizes SharePoint image URLs even when the download URL has no file extension", () => {
    expect(__test__.imageSourceFromString(
      "https://tenant.sharepoint.com/sites/hr/_layouts/15/download.aspx?UniqueId=abc",
      "https://tenant.sharepoint.com/sites/hr",
    )).toBe("https://tenant.sharepoint.com/sites/hr/_layouts/15/download.aspx?UniqueId=abc");
  });

  it("recognizes SharePoint URL field JSON values", () => {
    expect(__test__.imageSourceFromString(
      JSON.stringify({ Url: "/sites/hr/Signature%20Images/signed.png", Description: "Signature" }),
      "https://tenant.sharepoint.com/sites/hr",
    )).toBe("/sites/hr/Signature%20Images/signed.png");
  });

  it("leaves a typed answer with commas alone instead of reading it as a SharePoint link", () => {
    expect(__test__.imageSourceFromString(
      "The training objective have been achieved, and the employee has demonstrated improved skills.",
      "https://tenant.sharepoint.com/sites/hr",
    )).toBe("");
    expect(__test__.imageSourceFromString("No further comment", "https://tenant.sharepoint.com/sites/hr")).toBe("");
  });

  it("still reads a SharePoint URL field's 'address, description' form", () => {
    expect(__test__.imageSourceFromString(
      "https://tenant.sharepoint.com/sites/hr/Signature%20Images/signed.png, Signature",
      "https://tenant.sharepoint.com/sites/hr",
    )).toBe("https://tenant.sharepoint.com/sites/hr/Signature%20Images/signed.png");
  });
});

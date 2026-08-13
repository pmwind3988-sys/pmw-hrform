import { describe, expect, it } from "vitest";
import {
  fileExtension,
  materialKind,
  sanitizeFolderName,
  sanitizeFolderPath,
  stripExtension,
  viewerKey,
} from "./learningLibrary.js";

describe("materialKind", () => {
  it("routes each family to the renderer that can show it", () => {
    expect(materialKind("induction.mp4")).toBe("video");
    expect(materialKind("Safety Briefing.MOV")).toBe("video");
    expect(materialKind("floor-plan.png")).toBe("image");
    expect(materialKind("handbook.pdf")).toBe("pdf");
    expect(materialKind("policy.docx")).toBe("document");
    expect(materialKind("deck.pptx")).toBe("document");
    expect(materialKind("archive.zip")).toBe("other");
    expect(materialKind("no-extension")).toBe("other");
  });

  it("reads the extension, not the rest of a dotted name", () => {
    expect(fileExtension("2024.q1.report.pdf")).toBe("pdf");
    expect(stripExtension("2024.q1.report.pdf")).toBe("2024.q1.report");
  });
});

describe("sanitizeFolderName", () => {
  it("strips the characters SharePoint rejects", () => {
    expect(sanitizeFolderName('Fire/Safety: "drills"')).toBe("Fire Safety drills");
  });

  it("collapses to empty when nothing usable is left", () => {
    expect(sanitizeFolderName("///")).toBe("");
    expect(sanitizeFolderName(null)).toBe("");
  });
});

describe("sanitizeFolderPath", () => {
  it("normalises a nested topic path", () => {
    expect(sanitizeFolderPath("Safety//Fire Drill/")).toBe("Safety/Fire Drill");
    expect(sanitizeFolderPath("")).toBe("");
    expect(sanitizeFolderPath(undefined)).toBe("");
  });

  it("refuses to climb out of the library", () => {
    expect(() => sanitizeFolderPath("../../Shared Documents")).toThrow();
    expect(() => sanitizeFolderPath("Safety/../../secrets")).toThrow();
  });

  it("caps nesting depth", () => {
    expect(() => sanitizeFolderPath("a/b/c/d/e")).toThrow(/nested/i);
  });
});

describe("viewerKey", () => {
  it("is stable per person and independent of casing or padding", () => {
    expect(viewerKey("Person@pmw-group.com")).toBe(viewerKey("  person@pmw-group.com  "));
  });

  it("separates different people", () => {
    expect(viewerKey("a@pmw-group.com")).not.toBe(viewerKey("b@pmw-group.com"));
  });

  it("does not carry the address it was built from", () => {
    const key = viewerKey("person@pmw-group.com");
    expect(key).toMatch(/^[0-9a-f]{24}$/);
    expect(key).not.toContain("person");
  });
});

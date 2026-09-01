import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("recording a view when the tracking list is missing", () => {
  async function loadWithGraph(graph: Record<string, unknown>) {
    vi.resetModules();
    vi.doMock("./logger.js", () => ({ logWarn: vi.fn(), logError: vi.fn(), logInfo: vi.fn() }));
    vi.doMock("./sharepointRest.js", () => ({ ensureListViaSPRest: vi.fn() }));
    vi.doMock("./graphClient.js", () => ({
      createListItem: vi.fn(),
      getListDriveId: vi.fn(),
      graphDelete: vi.fn(),
      graphGet: vi.fn(),
      graphGetRedirectUrl: vi.fn(),
      graphPatch: vi.fn(),
      graphPost: vi.fn(),
      queryAllListItems: vi.fn(async () => []),
      queryListItemByFields: vi.fn(async () => null),
      queryListItems: vi.fn(async () => []),
      updateListItemFields: vi.fn(),
      ...graph,
    }));
    return import("./learningLibrary.js");
  }

  afterEach(() => {
    vi.doUnmock("./graphClient.js");
    vi.doUnmock("./logger.js");
    vi.doUnmock("./sharepointRest.js");
    vi.resetModules();
  });

  const missing = new Error('List "Learning Material Views" not found');

  it("returns a zero count instead of failing the whole request", async () => {
    // The caller writes the named access log *after* this. Throwing here used to
    // cost a guest member their audit trail as well as their view count.
    const { recordView } = await loadWithGraph({
      createListItem: vi.fn(async () => {
        throw missing;
      }),
      queryAllListItems: vi.fn(async () => {
        throw missing;
      }),
    });

    await expect(recordView("graph-token", "material-1", "abc123")).resolves.toBe(0);
  });

  it("still raises a failure that is not a missing list", async () => {
    const { recordView } = await loadWithGraph({
      createListItem: vi.fn(async () => {
        throw new Error("Graph POST 503: service unavailable");
      }),
    });

    await expect(recordView("graph-token", "material-1", "abc123")).rejects.toThrow(/503/);
  });

  it("reports the index as not ready so an admin is told to provision it", async () => {
    const { readViewIndex } = await loadWithGraph({
      queryAllListItems: vi.fn(async () => {
        throw missing;
      }),
    });

    const index = await readViewIndex("graph-token", "abc123");
    // Unknown, not zero — the distinction the admin banner is built on.
    expect(index.ready).toBe(false);
    expect(index.counts).toEqual({});
  });

  it("reports a readable list as ready", async () => {
    const { readViewIndex } = await loadWithGraph({
      queryAllListItems: vi.fn(async () => [{ id: "1", fields: { Title: "material-1::abc123" } }]),
    });

    const index = await readViewIndex("graph-token", "abc123");
    expect(index.ready).toBe(true);
    expect(index.counts["material-1"]).toBe(1);
    expect(index.viewedByMe.has("material-1")).toBe(true);
  });
});

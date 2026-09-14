import { describe, expect, it } from "vitest";
import { isPdfTemplate } from "./types";

describe("isPdfTemplate", () => {
  it("accepts a template with a version and a block list", () => {
    expect(isPdfTemplate({ version: 1, blocks: [{ id: "a", kind: "smart", smart: "header" }] })).toBe(true);
  });

  it("accepts an empty block list", () => {
    expect(isPdfTemplate({ version: 1, blocks: [] })).toBe(true);
  });

  it("rejects a missing block list", () => {
    expect(isPdfTemplate({ version: 1 })).toBe(false);
  });

  it("rejects blocks that are not objects", () => {
    expect(isPdfTemplate({ version: 1, blocks: ["header"] })).toBe(false);
  });

  it("rejects blocks with no id", () => {
    expect(isPdfTemplate({ version: 1, blocks: [{ kind: "smart", smart: "header" }] })).toBe(false);
  });

  it("rejects null, strings and arrays", () => {
    expect(isPdfTemplate(null)).toBe(false);
    expect(isPdfTemplate("{}")).toBe(false);
    expect(isPdfTemplate([])).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { buildDefaultTemplate, DEFAULT_SMART_ORDER } from "./defaultTemplate";
import { isPdfTemplate } from "./types";

describe("buildDefaultTemplate", () => {
  it("produces a valid template", () => {
    expect(isPdfTemplate(buildDefaultTemplate())).toBe(true);
  });

  it("carries every smart block in the built-in layout's order", () => {
    const blocks = buildDefaultTemplate().blocks;
    expect(blocks.map((b) => (b.kind === "smart" ? b.smart : b.kind))).toEqual([
      "header",
      "documentControl",
      "statusBadge",
      "submissionMeta",
      "answers",
      "approvals",
      "signatures",
      "evaluationDetails",
      "isoStandards",
    ]);
  });

  it("matches DEFAULT_SMART_ORDER", () => {
    expect(buildDefaultTemplate().blocks.map((b) => (b as { smart: string }).smart)).toEqual(DEFAULT_SMART_ORDER);
  });

  it("gives every block a distinct id", () => {
    const ids = buildDefaultTemplate().blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("applies no styling, leaving the built-in look alone", () => {
    expect(buildDefaultTemplate().blocks.every((b) => b.style === undefined)).toBe(true);
  });

  it("returns a fresh object each call so callers can mutate safely", () => {
    const a = buildDefaultTemplate();
    const b = buildDefaultTemplate();
    a.blocks.pop();
    expect(b.blocks).toHaveLength(9);
  });
});

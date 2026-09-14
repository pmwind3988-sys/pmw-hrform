import { describe, expect, it } from "vitest";
import { buildPdfSectionContext } from "../pdfSections/context";
import { sampleFormData } from "../pdfSections/testSupport";
import { unlockBlock, UNLOCKABLE } from "./unlock";

const ctx = () => buildPdfSectionContext(sampleFormData());

describe("unlockBlock", () => {
  it("turns the answers block into a table of the form's current fields", () => {
    const [block] = unlockBlock({ id: "a", kind: "smart", smart: "answers" }, ctx());
    expect(block.kind).toBe("table");
    const rows = (block as { rows: unknown[][] }).rows;
    expect(rows).toHaveLength(2);
  });

  it("keeps values live by writing them as variables, not as text", () => {
    const [block] = unlockBlock({ id: "a", kind: "smart", smart: "answers" }, ctx());
    expect(JSON.stringify(block)).toContain("field:employeeName");
    expect(JSON.stringify(block)).not.toContain("Aisyah binti Rahman");
  });

  it("turns the submission details block into a table of built-in variables", () => {
    const [block] = unlockBlock({ id: "m", kind: "smart", smart: "submissionMeta" }, ctx());
    expect(JSON.stringify(block)).toContain("meta:submittedBy");
  });

  it("gives every produced block a fresh unique id", () => {
    const blocks = unlockBlock({ id: "a", kind: "smart", smart: "answers" }, ctx());
    const ids = blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("a");
  });

  it("returns the block unchanged when its type cannot be unlocked", () => {
    const input = { id: "s", kind: "smart" as const, smart: "signatures" as const };
    expect(unlockBlock(input, ctx())).toEqual([input]);
    expect(UNLOCKABLE).not.toContain("signatures");
  });

  it("produces an empty table rather than throwing when the form has no fields", () => {
    const bare = buildPdfSectionContext({ ...sampleFormData(), responseData: {}, surveyJson: { pages: [] } });
    expect(() => unlockBlock({ id: "a", kind: "smart", smart: "answers" }, bare)).not.toThrow();
  });
});

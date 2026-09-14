/** adminFormBuilderPdfTemplate.test.ts — Pins the round-trip contract that the builder's save/load wiring relies on. */
import { describe, expect, it } from "vitest";
import { readTemplate } from "../utils/pdfTemplate/safeTemplate";
import { buildDefaultTemplate } from "../utils/pdfTemplate/defaultTemplate";

describe("template round-trip through form meta", () => {
  it("survives being stored as JSON and read back", () => {
    const stored = JSON.stringify({ pdfTemplate: buildDefaultTemplate() });
    const meta = JSON.parse(stored) as { pdfTemplate: unknown };
    expect(readTemplate(meta.pdfTemplate)?.blocks).toHaveLength(9);
  });

  it("reads back as no template when the form never had one", () => {
    const meta = JSON.parse(JSON.stringify({})) as { pdfTemplate?: unknown };
    expect(readTemplate(meta.pdfTemplate)).toBeNull();
  });

  it("does not lose blocks an older build does not recognise", () => {
    const template = { version: 1, blocks: [...buildDefaultTemplate().blocks, { id: "x", kind: "future" }] };
    expect(readTemplate(JSON.stringify(template))?.blocks).toHaveLength(10);
  });
});

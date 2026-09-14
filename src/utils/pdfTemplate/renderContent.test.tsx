import { describe, expect, it } from "vitest";
import { buildPdfSectionContext } from "../pdfSections/context";
import { renderToJson, sampleFormData } from "../pdfSections/testSupport";
import { renderBlock } from "./renderTemplate";
import type { PdfBlock } from "./types";

const ctx = () => buildPdfSectionContext(sampleFormData());
const json = (block: PdfBlock) => JSON.stringify(renderToJson(renderBlock(block, ctx())!));

describe("content blocks", () => {
  it("renders a table with one view per cell", () => {
    const block: PdfBlock = {
      id: "tb", kind: "table", widths: [50, 50], hasHeader: true,
      rows: [
        [[{ spans: [{ text: "Item" }] }], [{ spans: [{ text: "Value" }] }]],
        [[{ spans: [{ text: "Name" }] }], [{ spans: [{ variable: "field:employeeName" }] }]],
      ],
    };
    const out = json(block);
    expect(out).toContain("Item");
    expect(out).toContain("Aisyah binti Rahman");
  });

  it("renders a table with no rows without throwing", () => {
    expect(() => json({ id: "tb", kind: "table", widths: [], rows: [] })).not.toThrow();
  });

  it("renders an image block", () => {
    expect(json({ id: "im", kind: "image", src: "https://example.com/logo.png", width: 80 })).toContain("logo.png");
  });

  it("skips an image block with no source", () => {
    expect(renderBlock({ id: "im", kind: "image", src: "" }, ctx())).toBeNull();
  });

  it("renders a divider", () => {
    expect(json({ id: "dv", kind: "divider" })).toContain("borderBottomWidth");
  });

  it("renders a spacer at the requested height", () => {
    expect(json({ id: "sp", kind: "spacer", height: 24 })).toContain("24");
  });

  it("renders a page break", () => {
    expect(json({ id: "pb", kind: "pageBreak" })).toContain("break");
  });

  it("skips a block type it does not recognise", () => {
    expect(renderBlock({ id: "x", kind: "future" } as unknown as PdfBlock, ctx())).toBeNull();
  });
});

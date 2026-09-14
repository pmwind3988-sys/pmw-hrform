import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FormPdfDocument from "../FormPdfDocument";
import { renderToJson, sampleFormData } from "../pdfSections/testSupport";
import { buildDefaultTemplate } from "./defaultTemplate";
import { blockStyleToPdf } from "./renderTemplate";

describe("default template equivalence", () => {
  // The footer bakes in `new Date()` when there is no footerText override, so
  // the clock must be frozen or the two renders (legacy vs. templated) can
  // land on different wall-clock minutes and spuriously fail equivalence.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the same document as no template at all", () => {
    const legacy = renderToJson(FormPdfDocument(sampleFormData()));
    const templated = renderToJson(FormPdfDocument({ ...sampleFormData(), pdfTemplate: buildDefaultTemplate() }));
    expect(templated).toEqual(legacy);
  });

  it("stays equivalent for a submission with no layers and no answers", () => {
    const bare = { ...sampleFormData(), layerResults: [], responseData: {} };
    expect(renderToJson(FormPdfDocument({ ...bare, pdfTemplate: buildDefaultTemplate() })))
      .toEqual(renderToJson(FormPdfDocument(bare)));
  });

  it("reorders sections when the template reorders blocks", () => {
    // Under direct-call composition (ruling 1), component names never appear in
    // the tree, so we assert the same reorder behaviour via rendered content:
    // the document-control grid's "Document No." label should now precede the
    // header's own "Document Ref" text, once the two blocks are swapped.
    const template = buildDefaultTemplate();
    const [first, second] = [template.blocks[0], template.blocks[1]];
    template.blocks[0] = second;
    template.blocks[1] = first;
    const out = renderToJson(FormPdfDocument({ ...sampleFormData(), pdfTemplate: template }));
    const outJson = JSON.stringify(out);
    const docNoIdx = outJson.indexOf("Document No.");
    const docRefIdx = outJson.indexOf("Document Ref");
    expect(docNoIdx).toBeGreaterThan(-1);
    expect(docRefIdx).toBeGreaterThan(-1);
    expect(docNoIdx).toBeLessThan(docRefIdx);
  });

  it("drops a section when its block is removed", () => {
    const template = buildDefaultTemplate();
    template.blocks = template.blocks.filter((b) => (b as { smart: string }).smart !== "signatures");
    const out = JSON.stringify(renderToJson(FormPdfDocument({ ...sampleFormData(), pdfTemplate: template })));
    expect(out).not.toContain("SIGNATURES");
  });
});

describe("blockStyleToPdf", () => {
  it("returns an empty object for no style", () => {
    expect(blockStyleToPdf(undefined)).toEqual({});
  });

  it("maps bold and italic onto react-pdf font properties", () => {
    expect(blockStyleToPdf({ bold: true, italic: true })).toMatchObject({ fontWeight: "bold", fontStyle: "italic" });
  });

  it("passes spacing, colour and alignment through", () => {
    expect(blockStyleToPdf({ marginTop: 6, color: "#123456", align: "center", fontSize: 11 }))
      .toMatchObject({ marginTop: 6, color: "#123456", textAlign: "center", fontSize: 11 });
  });

  it("omits properties that were not set", () => {
    expect(blockStyleToPdf({ marginTop: 6 })).not.toHaveProperty("backgroundColor");
  });
});

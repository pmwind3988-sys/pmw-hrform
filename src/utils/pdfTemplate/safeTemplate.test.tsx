import { describe, expect, it, vi } from "vitest";
import { buildPdfSectionContext } from "../pdfSections/context";
import { renderToJson, sampleFormData } from "../pdfSections/testSupport";
import FormPdfDocument from "../FormPdfDocument";
import { readTemplate } from "./safeTemplate";
import { safeRenderBlock } from "./renderTemplate";
import type { PdfBlock } from "./types";

describe("readTemplate", () => {
  it("accepts a template object", () => {
    expect(readTemplate({ version: 1, blocks: [{ id: "1", kind: "smart", smart: "header" }] })).not.toBeNull();
  });

  it("parses a template stored as a JSON string", () => {
    expect(readTemplate('{"version":1,"blocks":[{"id":"1","kind":"smart","smart":"header"}]}')).not.toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(readTemplate("{not json")).toBeNull();
  });

  it("returns null for undefined, null and wrong shapes", () => {
    expect(readTemplate(undefined)).toBeNull();
    expect(readTemplate(null)).toBeNull();
    expect(readTemplate({ version: 1 })).toBeNull();
  });
});

describe("safeRenderBlock", () => {
  it("returns null and logs instead of throwing when a block fails", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const exploding = { id: "bad", kind: "text", content: null } as unknown as PdfBlock;
    expect(safeRenderBlock(exploding, buildPdfSectionContext(sampleFormData()))).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("FormPdfDocument fallback", () => {
  it("falls back to the built-in layout when the template is malformed", () => {
    const legacy = renderToJson(FormPdfDocument(sampleFormData()));
    const broken = renderToJson(FormPdfDocument({ ...sampleFormData(), pdfTemplate: "{not json" as never }));
    expect(broken).toEqual(legacy);
  });

  it("falls back when the template has no blocks at all", () => {
    const legacy = renderToJson(FormPdfDocument(sampleFormData()));
    const empty = renderToJson(FormPdfDocument({ ...sampleFormData(), pdfTemplate: { version: 1, blocks: [] } }));
    expect(empty).toEqual(legacy);
  });
});

import { describe, expect, it } from "vitest";
import { buildPdfSectionContext } from "../pdfSections/context";
import { sampleFormData } from "../pdfSections/testSupport";
import { resolveSpan, resolveVariable, unresolvedVariables } from "./resolve";

const ctx = () => buildPdfSectionContext(sampleFormData());

describe("resolveVariable", () => {
  it("reads a form field by its internal name", () => {
    expect(resolveVariable("field:employeeName", ctx())).toBe("Aisyah binti Rahman");
  });

  it("reads built-in submission values", () => {
    expect(resolveVariable("meta:submittedBy", ctx())).toBe("aisyah@example.com");
    expect(resolveVariable("meta:referenceNo", ctx())).toBe("LV-010926-0007");
    expect(resolveVariable("meta:formVersion", ctx())).toBe("3");
  });

  it("formats dates the same way the answers table does", () => {
    expect(resolveVariable("meta:submittedAt", ctx())).not.toBe("2026-09-01T08:30:00.000Z");
    expect(resolveVariable("meta:submittedAt", ctx())).not.toBe("");
  });

  it("reads per-layer values", () => {
    expect(resolveVariable("layer:1:email", ctx())).toBe("manager@example.com");
    expect(resolveVariable("layer:1:status", ctx())).toBe("Approved");
  });

  it("returns empty for a field that no longer exists", () => {
    expect(resolveVariable("field:deletedQuestion", ctx())).toBe("");
  });

  it("returns empty for a layer that did not run", () => {
    expect(resolveVariable("layer:9:email", ctx())).toBe("");
  });

  it("returns empty for a token it does not understand", () => {
    expect(resolveVariable("nonsense", ctx())).toBe("");
    expect(resolveVariable("", ctx())).toBe("");
  });
});

describe("resolveSpan", () => {
  it("returns literal text unchanged", () => {
    expect(resolveSpan({ text: "Dear Sir," }, ctx())).toBe("Dear Sir,");
  });

  it("uses the fallback when a variable resolves to nothing", () => {
    expect(resolveSpan({ variable: "field:gone", fallback: "N/A" }, ctx())).toBe("N/A");
  });

  it("prefers the value over the fallback when both exist", () => {
    expect(resolveSpan({ variable: "field:employeeName", fallback: "N/A" }, ctx())).toBe("Aisyah binti Rahman");
  });

  it("returns empty for a span with neither text nor variable", () => {
    expect(resolveSpan({}, ctx())).toBe("");
  });
});

describe("unresolvedVariables", () => {
  it("names every variable no longer in the catalogue", () => {
    const template = {
      version: 1 as const,
      blocks: [{ id: "t1", kind: "text" as const, content: [{ spans: [
        { variable: "field:employeeName" },
        { variable: "field:deletedQuestion" },
        { text: "hello" },
      ] }] }],
    };
    expect(unresolvedVariables(template, new Set(["field:employeeName"]))).toEqual(["field:deletedQuestion"]);
  });

  it("reports nothing for a template with no variables", () => {
    expect(unresolvedVariables({ version: 1, blocks: [] }, new Set())).toEqual([]);
  });
});

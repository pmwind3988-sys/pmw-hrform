import { describe, expect, it } from "vitest";
import { buildPdfSectionContext } from "../pdfSections/context";
import { renderToJson, sampleFormData } from "../pdfSections/testSupport";
import { renderBlock } from "./renderTemplate";
import type { TextBlock } from "./types";

const ctx = () => buildPdfSectionContext(sampleFormData());

function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object") return textOf((node as { children?: unknown }).children);
  return "";
}

describe("text blocks", () => {
  it("prints literal text", () => {
    const block: TextBlock = { id: "t", kind: "text", content: [{ spans: [{ text: "Declaration" }] }] };
    expect(textOf(renderToJson(renderBlock(block, ctx())!))).toContain("Declaration");
  });

  it("prints a variable's value, not its token", () => {
    const block: TextBlock = { id: "t", kind: "text", content: [{ spans: [
      { text: "Name: " }, { variable: "field:employeeName" },
    ] }] };
    const out = textOf(renderToJson(renderBlock(block, ctx())!));
    expect(out).toContain("Name: Aisyah binti Rahman");
    expect(out).not.toContain("field:employeeName");
  });

  it("renders an empty paragraph without throwing", () => {
    const block: TextBlock = { id: "t", kind: "text", content: [{ spans: [] }] };
    expect(() => renderToJson(renderBlock(block, ctx())!)).not.toThrow();
  });

  it("marks a bulleted paragraph", () => {
    const block: TextBlock = { id: "t", kind: "text", content: [{ list: "bullet", spans: [{ text: "One" }] }] };
    expect(textOf(renderToJson(renderBlock(block, ctx())!))).toContain("•");
  });
});

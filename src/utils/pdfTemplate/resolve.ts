/** resolve.ts — Turns template variables into printable text.
 *
 * Values go through the same formatters the answers table uses, so a date reads
 * the same inside a sentence as it does in the table above it. A token that no
 * longer resolves yields an empty string; it never throws and never prints the
 * token itself, which would look like a bug on a signed document.
 */
import { formatPdfDateTimeValue, formatPdfFieldValue } from "../pdfFieldFormatting";
import type { PdfSectionContext } from "../pdfSections/context";
import type { PdfTemplate, RichSpan } from "./types";

function fieldValue(name: string, ctx: PdfSectionContext): string {
  for (const section of ctx.formSections) {
    for (const field of section.fields) {
      if (field.key === name) return formatPdfFieldValue(field.value, field);
    }
  }
  const raw = ctx.data.responseData?.[name];
  return raw === undefined || raw === null ? "" : formatPdfFieldValue(raw);
}

function metaValue(name: string, ctx: PdfSectionContext): string {
  const { meta } = ctx.data;
  switch (name) {
    case "submittedBy": return meta.submittedBy || "";
    case "submittedAt": return meta.submittedAt ? formatPdfDateTimeValue(meta.submittedAt, true) : "";
    case "referenceNo": return ctx.referenceNo;
    case "formStatus": return meta.formStatus || "";
    case "formTitle": return meta.formTitle || "";
    case "formVersion": return meta.formVersion || "";
    case "company": return ctx.selectedCompany || "";
    case "isoStandards": return ctx.data.isoStandards || "";
    default: return "";
  }
}

function layerValue(layerNumber: number, property: string, ctx: PdfSectionContext): string {
  const layer = ctx.data.layerResults?.find((l) => l.layerNumber === layerNumber);
  if (!layer) return "";
  const value = (layer as unknown as Record<string, unknown>)[property];
  if (typeof value !== "string" || !value) return "";
  return property === "signedAt" ? formatPdfDateTimeValue(value, true) : value;
}

export interface FooterPageInfo {
  pageNumber: number;
  totalPages: number;
}

export function resolveVariable(token: string, ctx: PdfSectionContext, page?: FooterPageInfo): string {
  const [namespace, a, b] = token.split(":");
  if (namespace === "field" && a) return fieldValue(a, ctx);
  if (namespace === "meta" && a === "pageNumber") return page ? String(page.pageNumber) : "";
  if (namespace === "meta" && a === "pageCount") return page ? String(page.totalPages) : "";
  if (namespace === "meta" && a) return metaValue(a, ctx);
  if (namespace === "layer" && a && b) {
    const n = Number(a);
    return Number.isFinite(n) ? layerValue(n, b, ctx) : "";
  }
  return "";
}

export function resolveSpan(span: RichSpan, ctx: PdfSectionContext, page?: FooterPageInfo): string {
  if (span.variable) return resolveVariable(span.variable, ctx, page) || span.fallback || "";
  return span.text ?? "";
}

/** Variables pointing at something the form no longer has, for the editor's
 *  warnings list. Reported at edit time so nobody meets them on a submission. */
export function unresolvedVariables(template: PdfTemplate, known: Set<string>): string[] {
  const missing: string[] = [];
  const visit = (spans: RichSpan[]) => {
    for (const span of spans) {
      if (span.variable && !known.has(span.variable) && !missing.includes(span.variable)) missing.push(span.variable);
    }
  };
  for (const block of template.blocks) {
    if (block.kind === "text") block.content.forEach((p) => visit(p.spans));
    if (block.kind === "table") block.rows.forEach((row) => row.forEach((cell) => cell.forEach((p) => visit(p.spans))));
  }
  return missing;
}

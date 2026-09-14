/**
 * footer.ts — Which footer content a given sheet gets.
 *
 * A "sheet" is a page number. `all` repeats one strip on every page; `perPage`
 * repeats it too, but lets named pages override it. No footer at all means the
 * template is not overriding the built-in footer, which keeps using
 * `pdfConfig.footerText`.
 */
import type { RichText, TemplateFooter } from "./types";

export function footerContentForPage(footer: TemplateFooter | undefined, pageNumber: number): RichText | null {
  if (!footer) return null;
  if (footer.hideOnFirstPage && pageNumber === 1) return null;
  if (footer.mode === "perPage" && Array.isArray(footer.pages)) {
    const override = [...footer.pages].reverse().find((entry) => entry.page === pageNumber && entry.page >= 1);
    if (override) return override.content;
  }
  return footer.content;
}

import { describe, expect, it } from "vitest";
import { footerContentForPage } from "./footer";
import type { TemplateFooter } from "./types";

const text = (t: string) => [{ spans: [{ text: t }] }];

describe("footerContentForPage", () => {
  it("gives every page the same content in 'all' mode", () => {
    const footer: TemplateFooter = { mode: "all", content: text("Confidential") };
    expect(footerContentForPage(footer, 1)).toEqual(text("Confidential"));
    expect(footerContentForPage(footer, 7)).toEqual(text("Confidential"));
  });

  it("overrides the named page in 'perPage' mode", () => {
    const footer: TemplateFooter = {
      mode: "perPage",
      content: text("Page footer"),
      pages: [{ page: 2, content: text("Only on sheet two") }],
    };
    expect(footerContentForPage(footer, 2)).toEqual(text("Only on sheet two"));
  });

  it("falls back to the default content for pages with no override", () => {
    const footer: TemplateFooter = {
      mode: "perPage",
      content: text("Page footer"),
      pages: [{ page: 2, content: text("Only on sheet two") }],
    };
    expect(footerContentForPage(footer, 3)).toEqual(text("Page footer"));
  });

  it("honours hideOnFirstPage", () => {
    const footer: TemplateFooter = { mode: "all", content: text("Confidential"), hideOnFirstPage: true };
    expect(footerContentForPage(footer, 1)).toBeNull();
    expect(footerContentForPage(footer, 2)).toEqual(text("Confidential"));
  });

  it("returns null when the template defines no footer, so the built-in one stands", () => {
    expect(footerContentForPage(undefined, 1)).toBeNull();
  });

  it("ignores a page override with a nonsense page number", () => {
    const footer: TemplateFooter = { mode: "perPage", content: text("d"), pages: [{ page: 0, content: text("x") }] };
    expect(footerContentForPage(footer, 1)).toEqual(text("d"));
  });

  it("uses the last override when a page is listed twice", () => {
    const footer: TemplateFooter = {
      mode: "perPage", content: text("d"),
      pages: [{ page: 2, content: text("first") }, { page: 2, content: text("second") }],
    };
    expect(footerContentForPage(footer, 2)).toEqual(text("second"));
  });
});

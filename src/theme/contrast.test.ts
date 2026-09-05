import { describe, expect, it } from "vitest";
import { editorial } from "./editorial";
import {
  contrastRatio,
  ensureReadable,
  meetsAA,
  parseColor,
  readableInkOn,
  relativeLuminance,
} from "./contrast";

describe("parseColor", () => {
  it("reads the notations this codebase writes", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("#0F3D91")).toEqual({ r: 15, g: 61, b: 145 });
    expect(parseColor("rgb(15, 61, 145)")).toEqual({ r: 15, g: 61, b: 145 });
    expect(parseColor("rgba(15,61,145,0.5)")).toEqual({ r: 15, g: 61, b: 145 });
  });

  /**
   * A guess here silently produces unreadable text, which is the failure this
   * file exists to prevent. Unknown notations must say so.
   */
  it("returns null rather than guessing", () => {
    expect(parseColor("hsl(210 80% 40%)")).toBeNull();
    expect(parseColor("var(--app-bg)")).toBeNull();
    expect(parseColor("papayawhip")).toBeNull();
    expect(parseColor("")).toBeNull();
    expect(parseColor("#ggg")).toBeNull();
  });
});

describe("relativeLuminance and contrastRatio", () => {
  /** The two anchors WCAG itself defines. */
  it("puts black at 0 and white at 1", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("gives black on white the maximum 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
  });

  it("gives an identical pair 1:1", () => {
    expect(contrastRatio("#0F3D91", "#0F3D91")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#0F3D91", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#0F3D91") as number,
      10,
    );
  });

  it("returns null when either colour cannot be read", () => {
    expect(contrastRatio("var(--x)", "#fff")).toBeNull();
  });
});

describe("readableInkOn", () => {
  it("puts white on a dark surface and dark ink on a light one", () => {
    expect(readableInkOn("#0F3D91")).toBe(editorial.paper);
    expect(readableInkOn("#ffffff")).toBe(editorial.ink);
    expect(readableInkOn("#F6F8FB")).toBe(editorial.ink);
  });

  /** Whatever it returns has to actually pass, or the function is decorative. */
  it("returns ink that meets AA on the surfaces the app tints", () => {
    for (const surface of ["#0F3D91", "#F59E0B", "#FDE7C4", "#C62828", "#107C10", "#000000", "#ffffff"]) {
      expect(meetsAA(readableInkOn(surface), surface)).toBe(true);
    }
  });

  /**
   * An unreadable colour is worse than a merely low-contrast one: white text
   * that fails is invisible, dark text that fails is still there.
   */
  it("falls back to dark ink when the colour cannot be parsed", () => {
    expect(readableInkOn("var(--app-bg)")).toBe(editorial.ink);
  });
});

describe("ensureReadable", () => {
  /** A considered colour that works is left alone. */
  it("keeps a preferred colour that already passes", () => {
    expect(ensureReadable(editorial.navy, "#ffffff")).toBe(editorial.navy);
  });

  it("replaces a preferred colour that would fail", () => {
    expect(ensureReadable(editorial.navy, "#0F3D91")).toBe(editorial.paper);
  });

  /** Large text has a lower bar, and the function must honour it. */
  it("applies the large-text threshold when asked", () => {
    const surface = "#8FA8D8";
    const preferred = "#26467F";
    const ratio = contrastRatio(preferred, surface) as number;
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(4.5);
    expect(ensureReadable(preferred, surface, { large: true })).toBe(preferred);
    expect(ensureReadable(preferred, surface)).not.toBe(preferred);
  });
});

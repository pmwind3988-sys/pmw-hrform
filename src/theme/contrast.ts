import { editorial } from "./editorial";

/**
 * contrast.ts — picking ink that can actually be read on a given surface.
 *
 * The palette fixes the colours the design uses, and `paletteContrast.test.ts`
 * pins the pairs it ships. This file is for the other case: a surface whose
 * colour is decided at runtime — a status badge tinted from config, a stat card
 * given an accent, a learning topic's wash, a background an admin chose. There
 * the ink cannot be written down in advance, because the surface is not known
 * until it renders.
 *
 * The maths is WCAG 2.1: relative luminance, then the (L1+0.05)/(L2+0.05)
 * ratio. Nothing here invents a rule — it applies the one the accessibility
 * guidelines already state, so a result can be checked against any contrast
 * checker rather than taken on trust.
 */

/** WCAG AA for body text. */
export const AA_NORMAL = 4.5;
/** WCAG AA for text at 18.66px bold or 24px regular and above. */
export const AA_LARGE = 3;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Parses the colour notations this codebase actually writes: #rgb, #rrggbb,
 * and rgb()/rgba(). Anything else returns null rather than a guess — a wrong
 * guess here silently produces unreadable text, which is the exact failure
 * this file exists to prevent.
 */
export function parseColor(color: string): Rgb | null {
  const value = (color || "").trim().toLowerCase();

  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const digits = hex[1];
    const full =
      digits.length === 3
        ? digits.split("").map((d) => d + d).join("")
        : digits;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }

  const rgb = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number);
    if ([r, g, b].every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) {
      return { r, g, b };
    }
  }

  return null;
}

function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(color: string): number | null {
  const rgb = parseColor(color);
  if (!rgb) return null;
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  );
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function meetsAA(foreground: string, background: string, large = false): boolean {
  const ratio = contrastRatio(foreground, background);
  return ratio !== null && ratio >= (large ? AA_LARGE : AA_NORMAL);
}

/**
 * The readable ink for a surface: the palette's dark or its white, whichever
 * the eye can actually read against that colour.
 *
 * Ties and unparseable colours both fall to the dark ink. That is the safer
 * default here because every surface in this app is light unless it has
 * deliberately been made dark, so dark ink is wrong less often than white —
 * and white text that fails is invisible, while dark text that fails is merely
 * low-contrast.
 */
export function readableInkOn(
  background: string,
  options: { dark?: string; light?: string } = {},
): string {
  const dark = options.dark ?? editorial.ink;
  const light = options.light ?? editorial.paper;

  const onDark = contrastRatio(dark, background);
  const onLight = contrastRatio(light, background);
  if (onDark === null || onLight === null) return dark;

  return onLight > onDark ? light : dark;
}

/**
 * Keeps a preferred colour when it is legible on the surface, and falls back to
 * readable ink when it is not.
 *
 * This is the one to reach for at a call site that already has a considered
 * colour — a brand navy on a pale wash, say. It only intervenes when that
 * choice would actually fail, so a deliberate design decision is not
 * overridden by an automatic one that merely computes better.
 */
export function ensureReadable(
  preferred: string,
  background: string,
  options: { large?: boolean; dark?: string; light?: string } = {},
): string {
  return meetsAA(preferred, background, options.large)
    ? preferred
    : readableInkOn(background, options);
}

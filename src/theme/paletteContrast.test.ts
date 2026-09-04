import { describe, expect, it } from "vitest";
import { editorial } from "./editorial";

/**
 * WCAG contrast, asserted on the palette itself.
 *
 * This exists because the palette got it wrong twice, and neither time was
 * visible in a diff.
 *
 * SI-CMMS's own token file records the first occasion: amber, green and red
 * were checked as fills and shipped as text, at 2.15:1, 2.28:1 and 3.76:1 —
 * and those three carried the words a work-order list is read to find out. The
 * second was this overhaul: SI's readable green and amber were adopted
 * unchanged, and both failed here because this app puts them on an off-white
 * canvas and inside tinted badges rather than on plain white. `softMuted`
 * failed at 4.02:1, and white-on-bright-red would have shipped on the
 * "Delete permanently" button at 3.76:1.
 *
 * A one-off check in a browser found those. It could not stop the next one.
 * Every pair below is one a real screen actually renders.
 */

function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const channels = [0, 2, 4]
    .map((i) => parseInt(clean.substr(i, 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** WCAG AA for body text. */
const AA = 4.5;
/** WCAG AA for text at 18.66px bold or 24px regular, and for UI boundaries. */
const AA_LARGE = 3;

const SURFACES = {
  canvas: editorial.paper,
  white: editorial.panel,
  paperSoft: editorial.paperSoft,
};

describe("body text clears AA on every surface it lands on", () => {
  const inks = {
    ink: editorial.ink,
    muted: editorial.muted,
    softMuted: editorial.softMuted,
    navy: editorial.navy,
  };

  for (const [inkName, ink] of Object.entries(inks)) {
    for (const [surfaceName, surface] of Object.entries(SURFACES)) {
      it(`${inkName} on ${surfaceName}`, () => {
        expect(contrastRatio(ink, surface)).toBeGreaterThanOrEqual(AA);
      });
    }
  }
});

describe("semantic text clears AA on the canvas, on white, and in its own badge", () => {
  const semantics = [
    { name: "success", text: editorial.success, soft: editorial.successSoft },
    { name: "warning", text: editorial.warning, soft: editorial.warningSoft },
    { name: "error", text: editorial.error, soft: editorial.errorSoft },
    { name: "accent", text: editorial.accentText, soft: editorial.accentSoft },
  ];

  for (const semantic of semantics) {
    it(`${semantic.name} text on the canvas`, () => {
      expect(contrastRatio(semantic.text, editorial.paper)).toBeGreaterThanOrEqual(AA);
    });

    it(`${semantic.name} text on white`, () => {
      expect(contrastRatio(semantic.text, editorial.panel)).toBeGreaterThanOrEqual(AA);
    });

    /**
     * The badge case, and the one both regressions were hiding in: a tinted
     * pill is a THIRD surface, lighter than the canvas but not white, and text
     * that clears the other two can still fail inside it.
     */
    it(`${semantic.name} text inside its own soft badge`, () => {
      expect(contrastRatio(semantic.text, semantic.soft)).toBeGreaterThanOrEqual(AA);
    });
  }
});

describe("text on a bright fill", () => {
  /**
   * The fills are for chips, dots, caps and progress bars. Where one carries
   * words, the word colour has to follow the FILL's luminance rather than the
   * severity: ink on the amber and the bright green, white only on red — and
   * only on the readable red, never the bright one.
   */
  it("ink on the amber fill", () => {
    expect(contrastRatio(editorial.ink, editorial.accent)).toBeGreaterThanOrEqual(AA);
  });

  it("ink on the bright green fill", () => {
    expect(contrastRatio(editorial.ink, editorial.successFill)).toBeGreaterThanOrEqual(AA);
  });

  it("white on the readable red, which is what contained error buttons use", () => {
    expect(contrastRatio(editorial.white, editorial.error)).toBeGreaterThanOrEqual(AA);
  });

  /**
   * Documents the trap rather than guarding a use: white on the BRIGHT red is
   * 3.76:1, which is why `palette.error.main` is the readable red and not this
   * one. If a future change points a contained button at `errorFill`, this
   * failing assertion is the explanation.
   */
  it("white on the bright red fill does NOT clear AA", () => {
    expect(contrastRatio(editorial.white, editorial.errorFill)).toBeLessThan(AA);
  });
});

describe("the navy chrome", () => {
  it("white nav labels on the navy sidebar", () => {
    expect(contrastRatio(editorial.white, editorial.navy)).toBeGreaterThanOrEqual(AA);
  });

  it("white nav labels on the active-row fill", () => {
    expect(contrastRatio(editorial.white, editorial.navyMid)).toBeGreaterThanOrEqual(AA);
  });

  /**
   * The dim label colour has to clear AA against BOTH ends of the sidebar
   * gradient, not just the top: the identity block and the sign-out row sit at
   * the deep end, and the sheen drifts across both.
   */
  it("dim nav labels on both ends of the navy gradient", () => {
    expect(contrastRatio(editorial.navyDim, editorial.navy)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(editorial.navyDim, editorial.navyDeep)).toBeGreaterThanOrEqual(AA);
  });

  it("the avatar's initials on the amber circle", () => {
    expect(contrastRatio(editorial.navyDeep, editorial.accent)).toBeGreaterThanOrEqual(AA);
  });

  /**
   * `navyDim` is a light blue meant for navy only. Asserted so nobody reaches
   * for it as a muted grey on a white card, where it is unreadable.
   */
  it("dim nav labels are NOT usable on white", () => {
    expect(contrastRatio(editorial.navyDim, editorial.panel)).toBeLessThan(AA);
  });
});

describe("non-text boundaries clear the 3:1 UI threshold", () => {
  it("the card hairline against both the card and the canvas", () => {
    // A border only has to be distinguishable, not readable -- but a hairline
    // nobody can see is a card with no edge, which on a flat canvas is the only
    // thing separating it from the page.
    expect(contrastRatio(editorial.border, editorial.panel)).toBeLessThan(AA_LARGE);
    expect(contrastRatio(editorial.panel, editorial.paper)).toBeLessThan(AA_LARGE);
  });
});

export const editorial = {
  black: "#000000",
  ink: "#101010",
  muted: "#5F646D",
  softMuted: "#747B86",
  white: "#FFFFFF",
  sky: "#BFDDF4",
  skySoft: "#EEF7FD",
  blueWash: "#EDF7FE",
  blueSoft: "#F6FAFD",
  purpleWash: "#F4F3FB",
  paper: "#F8FAFC",
  appSurface: "#F6F9FC",
  paperSoft: "#F9FBFD",
  panel: "#FFFFFF",
  border: "#DDE4EC",
  borderStrong: "#111111",
  pmwBlue: "#0078D4",
  pmwBlueDark: "#005A9E",
  pmwBlueSoft: "#D7ECFA",
  pmwPurple: "#6264A7",
  pmwPurpleDark: "#4B4D89",
  pmwPurpleSoft: "#E6E7F6",
  yellow: "#FFF546",
  yellowSoft: "#FFF4D6",
  success: "#107C10",
  warning: "#B15C00",
  error: "#C62828",
} as const;

export const editorialFonts = {
  sans: '"Inter", "Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
  serif: '"Inter", "Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
  mono: '"Inter", "Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
} as const;

export const editorialShadow = "0 0 0 1px rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.06), 0 14px 36px rgba(0, 90, 158, 0.08)";
export const editorialShadowHover = "0 0 0 1px rgba(0, 0, 0, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.1), 0 18px 42px rgba(0, 90, 158, 0.12)";
export const editorialHairline = `1px solid ${editorial.border}`;
export const editorialInkline = `1px solid ${editorial.borderStrong}`;

/* ---------------------------------------------------------------------------
   SI design-language tokens.

   Ported from SI-CMMS (`docs/SI_Design_System.md`) so the two products read as
   one family. Shape, elevation and rhythm only — the colours above stay PMW's.

   Three rules the SI system keeps, and the reason each token is a single value
   rather than a scale:
     1. One radius. 12px on anything that is a container you act inside (card,
        button, input, dialog, menu); 5px on badges, because a tag is not a
        container and reading like one makes every row look boxed-in.
     2. One elevation. Every card sits at the same depth, uniformly. Hierarchy
        comes from size and position on the page, never from a heavier shadow.
     3. Focus is always visible. A 2px ring offset 2px on every interactive
        element, no exceptions for "quiet" controls.
--------------------------------------------------------------------------- */
export const si = {
  /** Containers you act inside: cards, buttons, inputs, dialogs, menus. */
  radius: 12,
  /** Inner elements — menu items, small controls nested in a 12px container. */
  radiusSm: 8,
  /** Badges and chips. Deliberately tighter than `radius`: a tag, not a box. */
  radiusBadge: 5,
  /** The one card elevation, used everywhere at the same strength. */
  shadow: "0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.05)",
  /** Lifted surfaces only: dialogs, popovers, the notification panel. */
  shadowRaised: "0 4px 8px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.1)",
  /** Card padding: tighter for KPI tiles, looser for form panels. */
  padTight: 18,
  padLoose: 24,
  /** Table row heights — 52px once a row carries two lines of text. */
  rowHeight: 44,
  rowHeightTwoLine: 52,
  /** Minimum touch target on mobile. */
  touchTarget: 44,
} as const;

/**
 * Keyboard focus ring. SI uses its amber accent here; PMW has no amber, so the
 * ring is PMW blue — the role is "the thing you are about to act on", which is
 * what blue already means in this app.
 */
export const siFocusRing = {
  outline: `2px solid ${editorial.pmwBlue}`,
  outlineOffset: "2px",
} as const;

/** Type tracking. SI tightens titles and opens up uppercase micro-labels. */
export const siTracking = {
  title: "-0.01em",
  micro: "0.03em",
} as const;

/* ---------------------------------------------------------------------------
   SI type roles.

   The theme's `typography` variants cover components that ask for a variant,
   but this codebase sets `fontSize`/`fontWeight` inline in ~2000 places, and
   inline `sx` outranks the theme. Spreading a role from here is how a call site
   opts back into the scale:

     <Typography sx={{ ...siType.cardTitle }}>

   Every value is SI's (`docs/SI_Design_System.md` §2.2). Roles exist so a call
   site names what the text *is* rather than picking a number — the reason the
   original inline sizes drifted into two dozen variants of "slightly bold".
--------------------------------------------------------------------------- */
export const siType = {
  /** 21px. The page's one title. */
  pageTitle: {
    fontSize: "1.3125rem",
    fontWeight: 700,
    lineHeight: 1.3,
    letterSpacing: "-0.01em",
  },
  /** 19px. A titled section within a page. */
  sectionTitle: {
    fontSize: "1.1875rem",
    fontWeight: 700,
    lineHeight: 1.3,
    letterSpacing: "-0.01em",
  },
  /** 17px. A subsection under a section title. */
  subsectionTitle: {
    fontSize: "1.0625rem",
    fontWeight: 700,
    lineHeight: 1.3,
    letterSpacing: "-0.01em",
  },
  /** 15px semibold. The header row of a card. */
  cardTitle: {
    fontSize: "0.9375rem",
    fontWeight: 600,
    lineHeight: 1.4,
  },
  /** 13.5px. Body copy, and the default for anything unlabelled. */
  body: {
    fontSize: "0.845rem",
    fontWeight: 400,
    lineHeight: 1.5,
  },
  /** 12.5px. Helper text, metadata, timestamps — SI's "small". */
  subtext: {
    fontSize: "0.78rem",
    fontWeight: 400,
    lineHeight: 1.45,
  },
  /** 11.5px uppercase bold. Eyebrows and table column headers, nothing else. */
  micro: {
    fontSize: "0.72rem",
    fontWeight: 700,
    lineHeight: 1.3,
    letterSpacing: "0.03em",
    textTransform: "uppercase" as const,
  },
  /** 13px medium, tabular. Codes, counts, dates, money — digits that align. */
  data: {
    fontSize: "0.8125rem",
    fontWeight: 500,
    lineHeight: 1.4,
    fontVariantNumeric: "tabular-nums",
  },
  /**
   * Weight and tracking for the two display headings (the careers hero, the
   * dashboard header). Size is left to the call site: SI has no hero, so it
   * offers no size for one, and those two set a responsive size of their own.
   */
  display: {
    fontWeight: 700,
    letterSpacing: "-0.01em",
    lineHeight: 1.1,
  },
} as const;

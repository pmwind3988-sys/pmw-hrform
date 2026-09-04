/* ---------------------------------------------------------------------------
   The PMW HR Forms palette, expressed in the SI-CMMS design language.

   Every name in `editorial` predates the overhaul and is kept, because ~48
   files import them and 860 call sites spell colours out by hand. The names
   stayed; the values are all SI's now. Where a name no longer describes what it
   holds (`pmwPurple`, `yellow`, `sky`) the comment says what it resolves to, so
   a call site reading `editorial.purpleWash` can see it is getting an amber
   wash before wondering why the page looks wrong.

   ONE DELIBERATE DIVERGENCE from SI's own token file, and it is the important
   one on this codebase.

   SI names its semantic colours after the FILL and hangs the readable value off
   a `.text` suffix: `danger` is the bright `#EF4444`, `danger.text` the darker
   `#C1291F`. That is the right default for SI, where those tokens are reached
   for to paint a chip.

   Here it would be a regression. `editorial.success` today is `#107C10` — dark,
   4.5:1 on white — and it is used as a TEXT colour at most of its call sites
   (`<Typography sx={{ color: editorial.success }}>`). Renaming the bright green
   onto `success` would silently drop every one of those to 2.28:1 while the
   diff looked like a palette swap. There are too many for "check each one" to
   be honest.

   So the polarity is inverted: the bare name is the READABLE value, and the
   bright fill is the opt-in `*Fill`. Existing text call sites stay legible
   without being touched, and a call site that wants the bright chip has to say
   so. Same two values SI has, same rule about which is for words — reached from
   the safe end.
--------------------------------------------------------------------------- */

export const editorial = {
  black: "#000000",
  /** SI ink. Was #101010. */
  ink: "#101828",
  /** SI's `ink.soft`. #5A6880 rather than #64748B: the latter measures 4.47:1
      on the canvas, under 4.5 by a hair, and this is the colour of nearly every
      secondary line in the app. */
  muted: "#5A6880",
  softMuted: "#6E7B92",
  white: "#FFFFFF",

  /* ----- navy: the brand, actions, links, focus, active navigation ----- */
  navy: "#0F3D91",
  navyDeep: "#0B2F70",
  /** The active-navigation fill in the sidebar. */
  navyMid: "#1E4FA0",
  /** Hairlines on navy surfaces. */
  navyLine: "#2C5AA8",
  /** Inactive text and icons on navy. Not for use on white — it fails there. */
  navyDim: "#9FB6E0",

  /* ----- washes. The `sky`/`blue`/`purple` names are historical ----- */
  /** Strong navy wash. Was PMW sky #BFDDF4. */
  sky: "#D7E1F3",
  /** Was #EAF5FC. */
  skySoft: "#EEF2F9",
  blueWash: "#E8EDF7",
  blueSoft: "#F2F5FB",
  /** Now an AMBER wash — `purple` has no value in this system. See `pmwPurple`. */
  purpleWash: "#FBF3E6",

  /* ----- surfaces ----- */
  /** SI's canvas. Was the cream #F7F5EF. */
  paper: "#F6F8FB",
  /** The fill behind inputs and table headers. Same canvas, by design. */
  appSurface: "#F6F8FB",
  paperSoft: "#FAFBFD",
  panel: "#FFFFFF",
  border: "#E5E9F0",
  /** Deliberate ink-on-ink border, for the few places that draw a hard edge. */
  borderStrong: "#101828",

  /* ----- the brand names, retargeted ----- */
  /** Navy. The name is kept for its ~61 call sites. */
  pmwBlue: "#0F3D91",
  pmwBlueDark: "#0B2F70",
  pmwBlueSoft: "#D7E1F3",
  /**
   * NAVY MID, not a purple. SI has no purple, and purple was this app's
   * "admin/secondary" accent across 71 sites — most of them decorative, where
   * navy is the correct resolution. The sites where the colour genuinely
   * carried a second signal move to `accent` explicitly, one at a time; this
   * default makes the decorative majority right without inventing a signal.
   */
  pmwPurple: "#1E4FA0",
  pmwPurpleDark: "#0B2F70",
  pmwPurpleSoft: "#D7E1F3",

  /* ----- accent: SI's amber. The secondary signal, and the one that shouts ----- */
  /** The fill. Bright by design — this is what a primary action sits on. */
  accent: "#F59E0B",
  /** Amber darkened until it clears 4.5:1 as text on white. For words. */
  accentText: "#9D6507",
  accentSoft: "#FDE7C4",
  /**
   * Was the PMW attention yellow #FFF546. Resolves to amber so the two do not
   * both exist; `yellow` is kept only for its existing call sites.
   */
  yellow: "#F59E0B",
  yellowSoft: "#FDE7C4",

  /* ----- semantics. Bare name = readable. `*Fill` = the bright chip. ----- */
  success: "#178640",
  successFill: "#22C55E",
  successSoft: "#DCFCE7",
  warning: "#9D6507",
  warningFill: "#F59E0B",
  warningSoft: "#FDE7C4",
  error: "#C1291F",
  errorFill: "#EF4444",
  errorSoft: "#FEE2E2",
} as const;

export const editorialFonts = {
  sans: '"Inter", "Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
  serif: '"Inter", "Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
  mono: '"Inter", "Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
} as const;

/**
 * SI keeps ONE card elevation and gets hierarchy from size and position. These
 * two names are kept for their call sites but now both resolve to that single
 * shadow — `editorialShadowHover` is no longer heavier, because a card that
 * deepens on hover is the exact hierarchy-by-shadow the system refuses.
 */
export const editorialShadow = "0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.05)";
export const editorialShadowHover = editorialShadow;
export const editorialHairline = `1px solid ${editorial.border}`;
export const editorialInkline = `1px solid ${editorial.borderStrong}`;

/* ---------------------------------------------------------------------------
   SI design-language tokens.

   Shape, elevation and rhythm. Three rules the SI system keeps, and the reason
   each token is a single value rather than a scale:
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
  /** The navigation chrome. Read by the shell; nothing else should need them. */
  sidebarWidth: 224,
  bottomBarHeight: 60,
  topBarHeight: 52,
  /** Where the sidebar hands over to the bottom bar. Matches SI's own switch. */
  shellBreakpoint: 1024,
} as const;

/**
 * The navy brand surface: the sidebar, the bottom bar, the builder's mode rail.
 * A 160deg gradient with two slow-drifting highlights over it, in the amber and
 * the pale blue the rest of the system uses.
 *
 * Exported as a value rather than left to a CSS class so the MUI `sx` call
 * sites and the builder's plain CSS can both reach the same one. The drifting
 * overlay is `.si-navy` in index.css; this is the fill underneath it.
 */
export const siNavySurface = `linear-gradient(160deg, ${editorial.navy} 0%, ${editorial.navyDeep} 100%)`;

/**
 * Keyboard focus ring. SI uses its amber accent here; this app uses navy,
 * because the role is "the thing you are about to act on" and navy is what that
 * means throughout — amber is reserved for the secondary signal.
 */
export const siFocusRing = {
  outline: `2px solid ${editorial.navy}`,
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

   Roles exist so a call site names what the text *is* rather than picking a
   number — the reason the original inline sizes drifted into two dozen variants
   of "slightly bold".
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

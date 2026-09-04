/**
 * builderTheme.ts — tokens for the redesigned /admin/builder workspace.
 *
 * THESIS: the builder is a controlled document, not a dashboard. It refuses the
 *   five-column workspace and shows two panes at most, with the form itself —
 *   not a stack of summary cards — in the middle.
 * OWN-WORLD: the grammar of official form systems. One family — Inter, the face
 *   SI and the rest of this app share — at four weights; SI's geometry (8px
 *   inner, 12px containers) and its single card elevation; legible field
 *   borders that state where a control begins; a cool slate desk; SI navy
 *   reserved for state and action. A navy rail carries the four modes.
 *
 * The overhaul changed the colours and nothing else. The layout thesis above is
 * a considered answer to a crowded authoring screen, it does not conflict with
 * the SI system, and discarding it would have cost a working tool to gain
 * nothing visual. What DID change: the accent ramp went from PMW blue to SI
 * navy, the paper-grey desk became the canvas family, and the mode rail now
 * carries the same `si-navy` gradient as the app sidebar so the two do not meet
 * at a corner as two different navies.
 *
 * Values here mirror `BuilderShell.css` `--bx-*` for the inline-style call
 * sites; change both together.
 */
export const B = {
  /** Ground behind panels and inputs. */
  bg: "#F1F4F9",
  /** Sunken desk the form sheet sits on. */
  surface: "#E4E9F1",
  /** Panels, cards, the sheet itself. */
  panel: "#F8FAFC",
  white: "#FFFFFF",
  text: "#101828",

  accent: "#0F3D91",
  accent100: "#EAEFF9",
  accent200: "#D7E1F3",
  accent300: "#AABDE3",
  accent400: "#6E8CC9",
  accent600: "#0D3682",
  accent700: "#0B2F70",
  accent800: "#0A2A63",
  accent900: "#071C45",

  n300: "#DDE3EC",
  n400: "#B6BFCE",
  n500: "#8A94A6",
  /** Lowest neutral that still clears 4.5:1 on `panel`. */
  n600: "#636F88",
  n700: "#4A5568",
  n800: "#2E3646",

  divider: "rgba(16,24,40,0.11)",
  hairline: "rgba(16,24,40,0.06)",
  /** Interactive-control edges. Separators may be faint; these may not. */
  lineField: "#7C8698",

  radiusSm: "8px",
  radiusMd: "12px",
  radiusLg: "12px",
  radiusPill: "999px",

  danger: "#C1291F",
  dangerPale: "#FEE2E2",
  warn: "#855405",
  warnPale: "#FDE7C4",
  ok: "#137536",

  shadowSm: "0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.05)",
  shadowMd: "0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.05)",
  shadowLg: "0 4px 8px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.1)",

  /** One family; hierarchy is size, weight, colour and space — not width. */
  fontBody: "var(--pmw-font-main)",
  /** Retained so existing call sites keep compiling; same stack by design. */
  fontHeading: "var(--pmw-font-main)",
} as const;

export type BuilderMode = "build" | "flow" | "settings" | "publish";

/** Panels the Tools menu can open inside `FormBuilder`. */
export type BuilderToolKey =
  | "templates"
  | "i18n"
  | "comments"
  | "theme"
  | "data"
  | "integrations"
  | "export"
  | "provisioning"
  | "json"
  | "permissions"
  | "submission"
  | "display"
  | "preview-desktop"
  | "preview-tablet"
  | "preview-mobile";

export type BuilderToolCommand = { key: BuilderToolKey; nonce: number };

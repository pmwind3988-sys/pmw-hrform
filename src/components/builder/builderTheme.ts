/**
 * builderTheme.ts — tokens for the redesigned /admin/builder workspace.
 *
 * THESIS: the builder is a controlled document, not a dashboard. It refuses the
 *   five-column workspace and shows two panes at most, with the form itself —
 *   not a stack of summary cards — in the middle.
 * OWN-WORLD: square corners everywhere, hairline dividers, condensed headings on
 *   a paper-grey desk, PMW blue reserved for state and action. A dark navy rail
 *   carries the four modes.
 *
 * Roles map the `industry-tokens.css` handoff ramp onto the PMW logo palette that
 * PRODUCT.md pins (blue for actions/focus/active nav). The layout is the
 * deliverable, the hue stays PMW.
 */
export const B = {
  /** Ground behind panels and inputs. */
  bg: "#F2F4F7",
  /** Sunken desk the form sheet sits on. */
  surface: "#E7EBF0",
  /** Panels, cards, the sheet itself. */
  panel: "#F7F9FB",
  white: "#FFFFFF",
  text: "#1A1F2B",

  accent: "#0078D4",
  accent100: "#EAF4FD",
  accent200: "#CFE7FA",
  accent300: "#A5CFF3",
  accent400: "#6FADE2",
  accent600: "#0067B8",
  accent700: "#135E96",
  accent800: "#0E4770",
  accent900: "#0A3050",

  n300: "#D4D9E1",
  n400: "#B3BAC6",
  n500: "#8A929E",
  /** Lowest neutral that still clears 4.5:1 on `panel`. */
  n600: "#667181",
  n700: "#4E5866",
  n800: "#363E4A",

  divider: "rgba(26,31,43,0.16)",
  hairline: "rgba(26,31,43,0.09)",

  danger: "#C62828",
  dangerPale: "#F8E4E4",
  warn: "#B15C00",
  warnPale: "#FFF4CE",
  ok: "#107C10",

  shadowSm: "0 1px 2px rgba(26,31,43,0.14)",
  shadowMd: "0 3px 10px rgba(26,31,43,0.16)",
  shadowLg: "0 12px 32px rgba(26,31,43,0.22)",

  fontHeading: "'Barlow Condensed','Barlow Semi Condensed','Segoe UI Semibold',var(--pmw-font-main)",
  fontBody: "'Barlow',var(--pmw-font-main)",
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

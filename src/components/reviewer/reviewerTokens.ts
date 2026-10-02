/**
 * reviewerTokens.ts — the reviewer screens' own palette and font, taken
 * verbatim from the approved prototype (Main / Evaluate / Login / States).
 * These deliberately do NOT come from `theme/editorial`: the reviewer pages are
 * a separate, approved look. Define a colour here once; never inline a hex in
 * the other reviewer files.
 *
 * Inter is already loaded app-wide (`@import` in src/index.css), and
 * fonts.googleapis.com / fonts.gstatic.com are allowed in BOTH Content-
 * Security-Policies (vercel.json and index.html), so nothing extra is needed.
 */
export const FONT_STACK = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";

export const R = {
  /** Brand navy: title bars, current step, primary buttons. */
  navy: "#2b2870",
  navyDeep: "#2b2870",
  /** Light navy tint: group bars, completed steps, icon circles. */
  navyTint: "#e4e3f2",
  /** Dimmed text on navy. */
  navyWash: "#c9c7e6",
  /** Eyebrow on a finished (tinted) step card. */
  navyMid: "#3c3890",
  /** Finished step card: navy at 10%. */
  navyDone: "rgba(43,40,112,0.10)",
  /** Scrim behind the submitting overlay and the signing window. */
  scrim: "rgba(15,14,43,.62)",
  amber: "#b87708",
  amberSoft: "#fdf0d8",
  paper: "#f7f9fb",
  card: "#ffffff",
  line: "#e5e9ee",
  inputBorder: "#d8dde4",
  dash: "#b9c0cb",
  disabledBg: "#eff2f5",
  /** Primary text. */
  ink: "#0c0e14",
  /** Form labels. */
  body: "#212633",
  /** Secondary text. */
  muted: "#4c5566",
  /** Body copy on cards (a touch darker than `muted`). */
  copy: "#343b4b",
  /** Eyebrows, captions, reference numbers. */
  label: "#6b7484",
  link: "#00658e",
  focus: "rgba(0,125,176,.35)",
  green: "#1f8a5b",
  greenSoft: "#e2f4ec",
  red: "#c0362c",
  redSoft: "#fbe6e4",
} as const;

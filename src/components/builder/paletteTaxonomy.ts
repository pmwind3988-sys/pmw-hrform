/**
 * paletteTaxonomy.ts — re-buckets the engine's 40 `QUESTION_TYPES` from nine
 * `TYPE_GROUPS` into two palette tabs of four sections each, so neither tab is
 * ever longer than a screen.
 *
 * Nothing here changes what gets created: `createQuestion(td)` still receives
 * the untouched engine definition. `shortLabel` is display-only — it keeps the
 * two-column palette from ellipsising every second button — and the engine
 * label is still what a new field is titled.
 */
import { QUESTION_TYPES } from "../../utils/FormBuilderEngine";

export type PaletteTab = "basic" | "advanced";

export const TAB_SECTIONS: Record<PaletteTab, string[]> = {
  basic: ["Text", "Choice", "Date & time", "Numeric"],
  advanced: ["Rich input", "Tables", "Structure", "Display"],
};

type Entry = { tab: PaletteTab; section: string; shortLabel: string };

const TAXONOMY: Record<string, Entry> = {
  // Basic · Text
  text: { tab: "basic", section: "Text", shortLabel: "Single Line" },
  comment: { tab: "basic", section: "Text", shortLabel: "Multi Line" },
  password: { tab: "basic", section: "Text", shortLabel: "Password" },
  nric: { tab: "basic", section: "Text", shortLabel: "NRIC / IC" },
  // Basic · Choice
  dropdown: { tab: "basic", section: "Choice", shortLabel: "Dropdown" },
  radiogroup: { tab: "basic", section: "Choice", shortLabel: "Radio" },
  checkbox: { tab: "basic", section: "Choice", shortLabel: "Checkbox" },
  boolean: { tab: "basic", section: "Choice", shortLabel: "Yes / No" },
  consent: { tab: "basic", section: "Choice", shortLabel: "Consent" },
  // Basic · Date & time
  date: { tab: "basic", section: "Date & time", shortLabel: "Date" },
  datetime: { tab: "basic", section: "Date & time", shortLabel: "Date-Time" },
  duration: { tab: "basic", section: "Date & time", shortLabel: "Duration" },
  // Basic · Numeric
  number: { tab: "basic", section: "Numeric", shortLabel: "Number" },
  currency: { tab: "basic", section: "Numeric", shortLabel: "Currency" },
  counter: { tab: "basic", section: "Numeric", shortLabel: "Counter" },
  slider: { tab: "basic", section: "Numeric", shortLabel: "Slider" },
  rating: { tab: "basic", section: "Numeric", shortLabel: "Rating" },
  formula: { tab: "basic", section: "Numeric", shortLabel: "Formula" },
  // Advanced · Rich input
  file: { tab: "advanced", section: "Rich input", shortLabel: "File Upload" },
  imageupload: { tab: "advanced", section: "Rich input", shortLabel: "Image Upload" },
  signaturepad: { tab: "advanced", section: "Rich input", shortLabel: "Signature" },
  jsoneditor: { tab: "advanced", section: "Rich input", shortLabel: "JSON Editor" },
  // Advanced · Tables
  dynamicmatrix: { tab: "advanced", section: "Tables", shortLabel: "Dynamic Matrix" },
  tableinput: { tab: "advanced", section: "Tables", shortLabel: "Table Input" },
  datatable: { tab: "advanced", section: "Tables", shortLabel: "Data Table" },
  // Advanced · Structure
  panel: { tab: "advanced", section: "Structure", shortLabel: "Section" },
  columns: { tab: "advanced", section: "Structure", shortLabel: "Columns" },
  repeater: { tab: "advanced", section: "Structure", shortLabel: "Repeater" },
  spacer: { tab: "advanced", section: "Structure", shortLabel: "Spacer" },
  divider: { tab: "advanced", section: "Structure", shortLabel: "Divider" },
  pagebreak: { tab: "advanced", section: "Structure", shortLabel: "Page Break" },
  // Advanced · Display
  html: { tab: "advanced", section: "Display", shortLabel: "HTML Block" },
  image: { tab: "advanced", section: "Display", shortLabel: "Image" },
  alert: { tab: "advanced", section: "Display", shortLabel: "Alert" },
  videoembed: { tab: "advanced", section: "Display", shortLabel: "Video" },
  countdown: { tab: "advanced", section: "Display", shortLabel: "Countdown" },
  scorecard: { tab: "advanced", section: "Display", shortLabel: "Scorecard" },
  chartdisplay: { tab: "advanced", section: "Display", shortLabel: "Chart" },
};

export type QuestionTypeDef = (typeof QUESTION_TYPES)[number];

export type PaletteItem = {
  def: QuestionTypeDef;
  label: string;
  description: string;
  tab: PaletteTab;
  section: string;
};

/** Every engine type, carrying its palette placement, ordered by the taxonomy
 *  above rather than by the engine's nine-group ordering. Types missing from the
 *  taxonomy still appear — under Advanced · Display — so a new engine type is
 *  never silently unreachable. */
const ORDER = Object.keys(TAXONOMY);
export const PALETTE_ITEMS: PaletteItem[] = QUESTION_TYPES.map((def) => {
  const entry = TAXONOMY[def.type];
  return {
    def,
    label: entry?.shortLabel ?? def.label,
    description: def.description,
    tab: entry?.tab ?? "advanced",
    section: entry?.section ?? "Display",
  };
}).sort((a, b) => {
  const ai = ORDER.indexOf(a.def.type);
  const bi = ORDER.indexOf(b.def.type);
  return (ai === -1 ? ORDER.length : ai) - (bi === -1 ? ORDER.length : bi);
});

/** Short, human type name for the properties dock and the sheet rows. */
export function shortTypeLabel(type: string): string {
  return TAXONOMY[type]?.shortLabel ?? QUESTION_TYPES.find((t) => t.type === type)?.label ?? type;
}

/** The four quick-add buttons offered on an empty sheet. */
export const QUICK_ADD_TYPES = ["text", "comment", "dropdown", "date"];

// ── How a type renders inside the WYSIWYG sheet ────────────────────────────

const AREA = new Set(["comment", "jsoneditor", "html"]);
const CHOICE = new Set(["dropdown", "radiogroup", "checkbox", "consent"]);
const ROUND_MARK = new Set(["dropdown", "radiogroup"]);
const BLOCK = new Set([
  "signaturepad",
  "file",
  "imageupload",
  "image",
  "dynamicmatrix",
  "tableinput",
  "datatable",
  "chartdisplay",
  "videoembed",
]);
const CONTAINER = new Set(["panel", "repeater", "columns"]);
const RULE = new Set(["divider", "spacer", "pagebreak"]);

export type WysKind = "input" | "area" | "choice" | "bool" | "block" | "container" | "rule";

export function wysKind(type: string): WysKind {
  if (AREA.has(type)) return "area";
  if (CHOICE.has(type)) return "choice";
  if (type === "boolean") return "bool";
  if (CONTAINER.has(type)) return "container";
  if (BLOCK.has(type)) return "block";
  if (RULE.has(type)) return "rule";
  return "input";
}

export function hasRoundMark(type: string): boolean {
  return ROUND_MARK.has(type);
}

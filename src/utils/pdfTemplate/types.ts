/**
 * types.ts — Block model for the per-form PDF template.
 *
 * A template is an ordered block list. Smart blocks redraw themselves from the
 * submission; content blocks hold what the admin wrote. Unknown `kind` values
 * are tolerated on read so an older build can open a newer template without
 * losing the blocks it does understand.
 */

/** The regions of today's built-in layout, each available as one block. */
export type SmartBlockType =
  | "header"
  | "documentControl"
  | "statusBadge"
  | "submissionMeta"
  | "answers"
  | "approvals"
  | "signatures"
  | "evaluationDetails"
  | "isoStandards";

export interface BlockStyle {
  fontFamily?: "Helvetica" | "Times-Roman" | "Courier";
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align?: "left" | "center" | "right" | "justify";
  marginTop?: number;
  marginBottom?: number;
  paddingX?: number;
  paddingY?: number;
  background?: string;
  borderWidth?: number;
  borderColor?: string;
  /** Start this block on a fresh page. */
  breakBefore?: boolean;
}

/** One run of text, or one variable reference, inside a text block. */
export interface RichSpan {
  text?: string;
  /** Internal field name or built-in token; see variables.ts. */
  variable?: string;
  /** Printed when the variable resolves to nothing. */
  fallback?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: number;
  color?: string;
}

export interface RichParagraph {
  spans: RichSpan[];
  align?: BlockStyle["align"];
  /** Renders as a bulleted or numbered item when set. */
  list?: "bullet" | "number";
}

export type RichText = RichParagraph[];

export interface SmartBlock {
  id: string;
  kind: "smart";
  smart: SmartBlockType;
  style?: BlockStyle;
  /** Per-smart-block settings, e.g. `{ heading: "FORM DATA" }`. */
  settings?: Record<string, unknown>;
}

export interface TextBlock {
  id: string;
  kind: "text";
  content: RichText;
  style?: BlockStyle;
}

export interface TableBlock {
  id: string;
  kind: "table";
  /** Column widths as percentages summing to 100. */
  widths: number[];
  /** First row is the header row when `hasHeader`. */
  rows: RichText[][];
  hasHeader?: boolean;
  style?: BlockStyle;
}

export interface ImageBlock {
  id: string;
  kind: "image";
  src: string;
  width?: number;
  height?: number;
  style?: BlockStyle;
}

export interface DividerBlock {
  id: string;
  kind: "divider";
  style?: BlockStyle;
}

export interface SpacerBlock {
  id: string;
  kind: "spacer";
  height: number;
  style?: BlockStyle;
}

export interface PageBreakBlock {
  id: string;
  kind: "pageBreak";
  style?: BlockStyle;
}

export type PdfBlock =
  | SmartBlock
  | TextBlock
  | TableBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock
  | PageBreakBlock;

export interface PdfTemplate {
  version: 1;
  blocks: PdfBlock[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Structural check only. Individual blocks are validated at render time, where
 * a bad one is skipped rather than costing the whole document.
 */
export function isPdfTemplate(value: unknown): value is PdfTemplate {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.blocks)) return false;
  return value.blocks.every((block) => isRecord(block) && typeof block.id === "string" && typeof block.kind === "string");
}

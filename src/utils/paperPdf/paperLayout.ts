/**
 * paperLayout.ts — Lays a submission out the way the HR department's own Word
 * forms are laid out (Training Evaluation Form and the like), for the
 * experimental "paper form" PDF design.
 *
 * Unlike the standard design, every question is printed whether or not it was
 * answered: a paper form shows its empty boxes. A blank question that carries
 * a `visibleIf` is the exception — it was most likely hidden from the person
 * filling it in, and printing it would ask for something nobody was shown.
 *
 * Pure: the renderer in PaperFormDocument.tsx draws exactly what this returns.
 */
import { createElementAnswerReader, type FormSubmissionField } from "../formSubmissionLayout";
import { getManagedCompanyQuestion, getSelectedCompany, isManagedCompanyQuestion } from "../companySelection";
import { REFERENCE_NO_FIELD } from "../referenceNumber";
import { DEFAULT_COMPANIES } from "../publishDefaults";
import { formatPdfFieldValue } from "../pdfFieldFormatting";
import { signOffLabel, signOffName, signOffPosition, signOffVerdictFromStatus } from "../signOff";
import type { PdfFormData, PdfLayerResult } from "../FormPdfDocument";
import { applyTrainingEvaluationLayout, isTrainingEvaluationForm } from "./trainingEvaluationLayout";

type El = Record<string, unknown>;

export interface PaperOption {
  value: string;
  label: string;
}

/** One label/value pair in the two-pairs-per-row grid. */
export interface PaperCell {
  label: string;
  text: string;
  /** Present for a short choice question: drawn as tick boxes in the cell. */
  options?: PaperOption[];
  selected?: string[];
  /** Takes the whole row (long text that would not fit beside another pair). */
  wide?: boolean;
  /** Printed one per line instead of `text` (a day-by-day schedule). */
  lines?: string[];
}

export type PaperBlock =
  /** `rows`, when set, is the exact arrangement; otherwise the cells pair up two to a row. */
  | { kind: "grid"; cells: PaperCell[]; rows?: PaperCell[][] }
  /**
   * Consecutive questions sharing one scale, as a rating table with a tick per row.
   * `numbered` prints the scale as 1..n columns; `banner` adds an
   * "Evaluation Item | Rating (✓)" row above the column headings.
   */
  | { kind: "ticks"; title: string; options: PaperOption[]; rows: { number: number; label: string; selected: string[] }[]; numbered?: boolean; banner?: boolean }
  /** A choice question whose options are too long for a grid cell. */
  | { kind: "choiceLine"; label: string; options: PaperOption[]; selected: string[] }
  | { kind: "long"; label: string; text: string; lines: number; sublabel?: string }
  | { kind: "signature"; label: string; images: string[]; date: string; large?: boolean }
  | { kind: "images"; label: string; images: string[] }
  | { kind: "table"; field: FormSubmissionField }
  | { kind: "note"; text: string }
  | { kind: "signoff"; statement: string; name: string; position: string; date: string; signature: string; remarks: string; rejected: boolean; large?: boolean };

export interface PaperSection {
  /** 1 = a PART (a page of the form, or a workflow step); 2 = a lettered panel inside it. */
  level: 1 | 2;
  heading: string;
  blocks: PaperBlock[];
  /** Starts on a fresh page. */
  newPage?: boolean;
  /** Which workflow step a PART prints, when it is one. */
  layer?: { type: "approval" | "evaluation" };
}

export interface PaperHeader {
  /** The organisation line in the top cell, beside the logo. */
  organisation: string;
  documentTitle: string;
  formTitle: string;
  companies: { label: string; selected: boolean }[];
  control: { label: string; value: string }[];
  /** Small print under the header: reference, submitter, date, status. */
  trace: string;
}

export interface PaperDocument {
  header: PaperHeader;
  sections: PaperSection[];
  /** A form with a layout of its own; absent for the general paper layout. */
  variant?: "training-evaluation";
}

export const PAPER_ORGANISATION = "PMW INTERNATIONAL BERHAD";

// ── Small readers ───────────────────────────────────────────────────────────

function isRecord(value: unknown): value is El {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isRecord(value)) return Object.keys(value).length === 0;
  return false;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!/^[[{]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];

export function romanNumeral(n: number): string {
  return ROMAN[n - 1] ?? String(n);
}

function letter(n: number): string {
  return n <= 26 ? String.fromCharCode(64 + n) : String(n);
}

/** HTML authored into a form, as the plain sentence a paper form would print. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)))
    // Last, so "&amp;lt;" stays the literal text "&lt;" it was written as.
    .replace(/&amp;/gi, "&")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

// ── Options and selections ──────────────────────────────────────────────────

function choiceOption(choice: unknown): PaperOption | null {
  if (typeof choice === "string" || typeof choice === "number" || typeof choice === "boolean") {
    return { value: String(choice), label: String(choice) };
  }
  if (!isRecord(choice)) return null;
  const value = text(choice.value ?? choice.itemValue ?? choice.id ?? choice.name);
  if (!value) return null;
  return { value, label: text(choice.text) || text(choice.title) || text(choice.label) || value };
}

/** The boxes a question offers, or null when it is not a pick-from-a-list question. */
export function optionsFor(element: El): PaperOption[] | null {
  const type = text(element.type).toLowerCase();
  if (type === "boolean" || type === "consent") {
    return [
      { value: "true", label: text(element.labelTrue) || "Yes" },
      { value: "false", label: text(element.labelFalse) || "No" },
    ];
  }
  if (type === "rating") {
    const declared = Array.isArray(element.rateValues)
      ? element.rateValues.map(choiceOption).filter((o): o is PaperOption => o !== null)
      : [];
    if (declared.length > 0) return declared;
    const min = num(element.rateMin) ?? 1;
    const max = num(element.rateMax) ?? 5;
    const step = num(element.rateStep) && (num(element.rateStep) as number) > 0 ? (num(element.rateStep) as number) : 1;
    const out: PaperOption[] = [];
    for (let v = min; v <= max && out.length < 11; v += step) out.push({ value: String(v), label: String(v) });
    return out;
  }
  if (["radiogroup", "checkbox", "tagbox", "buttongroup", "imagepicker"].includes(type) && Array.isArray(element.choices)) {
    const options = element.choices.map(choiceOption).filter((o): o is PaperOption => o !== null);
    return options.length > 0 ? options : null;
  }
  return null;
}

/** Which of `options` the answer ticks. Matches on value first, then on the printed label. */
export function selectedOptions(value: unknown, options: PaperOption[]): string[] {
  if (isBlank(value)) return [];
  const parsed = parseMaybeJson(value);
  const raw = (Array.isArray(parsed) ? parsed : [parsed]).map((entry) => {
    if (typeof entry === "boolean") return String(entry);
    return text(entry);
  });
  const picked = new Set<string>();
  for (const answer of raw) {
    const lower = answer.toLowerCase();
    const match = options.find((o) => o.value === answer)
      ?? options.find((o) => o.label.toLowerCase() === lower || o.value.toLowerCase() === lower)
      // A boolean stored as a word: "Yes" ticks the true box, "No" the false.
      ?? (lower === "yes" ? options.find((o) => o.value === "true") : undefined)
      ?? (lower === "no" ? options.find((o) => o.value === "false") : undefined);
    if (match) picked.add(match.value);
  }
  return options.filter((o) => picked.has(o.value)).map((o) => o.value);
}

function sameScale(a: PaperOption[], b: PaperOption[]): boolean {
  return a.length === b.length && a.every((o, i) => o.value === b[i].value && o.label === b[i].label);
}

/** Short enough to sit in a grid cell, as "Training Type ☐ In-house ☐ External" does. */
function fitsInCell(options: PaperOption[]): boolean {
  return options.length <= 3 && options.reduce((sum, o) => sum + o.label.length, 0) <= 28;
}

// ── Element classification ──────────────────────────────────────────────────

const SKIP_TYPES = new Set(["image", "spacer", "divider", "pagebreak", "videoembed", "videeembed", "countdown", "datatable", "chartdisplay"]);
const MATRIX_TYPES = new Set(["dynamicmatrix", "matrixdynamic", "tableinput"]);
const TICK_ROW_TYPES = new Set(["rating", "radiogroup", "boolean", "buttongroup"]);
const LONG_TEXT_LIMIT = 60;

function childElements(element: El): El[] {
  const out: El[] = [];
  for (const key of ["elements", "templateElements", "questions"]) {
    const value = element[key];
    if (Array.isArray(value)) out.push(...value.filter(isRecord));
  }
  if (Array.isArray(element.columns) && !MATRIX_TYPES.has(text(element.type).toLowerCase())) {
    for (const column of element.columns) {
      if (isRecord(column) && Array.isArray(column.elements)) out.push(...column.elements.filter(isRecord));
    }
  }
  return out;
}

function isLongText(element: El): boolean {
  const type = text(element.type).toLowerCase();
  return type === "comment" || type === "richedit" || text(element.inputType).toLowerCase() === "comment" || (num(element.rows) ?? 0) > 1;
}

function imageSources(value: unknown): string[] {
  const parsed = parseMaybeJson(value);
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const out: string[] = [];
  for (const entry of list) {
    if (typeof entry === "string") {
      const src = entry.trim();
      if (/^data:image\//i.test(src) || /^(https?:\/\/|\/)\S+\.(png|jpe?g|gif|webp|bmp)(\?|#|$)/i.test(src) || /^(https?:\/\/|\/)\S*(\/sites\/|\/Signature%20Images\/|\/Signature Images\/)/i.test(src)) out.push(src);
    } else if (isRecord(entry)) {
      const src = text(entry.content) || text(entry.url) || text(entry.Url);
      const type = text(entry.type);
      if (src && (/^data:image\//i.test(src) || type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)(\?|#|$)/i.test(src))) out.push(src);
    }
  }
  return out;
}

function formatValue(element: El, value: unknown): string {
  if (isBlank(value)) return "";
  return formatPdfFieldValue(value, {
    type: text(element.type),
    inputType: text(element.inputType) || undefined,
    choices: Array.isArray(element.choices) ? element.choices : undefined,
    prefix: text(element.prefix) || undefined,
    suffix: text(element.suffix) || undefined,
  }).replace(/^—$/, "");
}

// ── The walker ──────────────────────────────────────────────────────────────

interface WalkContext {
  read: ReturnType<typeof createElementAnswerReader>;
  /** Date written beside a form signature: when the form was submitted. */
  signatureDate: string;
  /** Running row number across the tick tables of one PART, as the paper form numbers them. */
  rowCounter: { n: number };
}

type Pending =
  | { kind: "cell"; cell: PaperCell }
  | { kind: "tick"; element: El; label: string; options: PaperOption[]; selected: string[] };

/**
 * Walks one container's elements into `section`, opening a lettered section
 * for each panel. Returns the sections it opened, in order, after `section`.
 */
function walk(elements: El[], section: PaperSection, ctx: WalkContext, panels: { n: number }): PaperSection[] {
  const opened: PaperSection[] = [];
  let target = section;
  let pending: Pending[] = [];

  const flush = () => {
    let i = 0;
    while (i < pending.length) {
      const item = pending[i];
      if (item.kind === "tick") {
        // Gather the run of questions sharing this scale.
        let j = i + 1;
        while (j < pending.length) {
          const next = pending[j];
          if (next.kind !== "tick" || !sameScale(next.options, item.options)) break;
          j += 1;
        }
        const run = pending.slice(i, j) as Extract<Pending, { kind: "tick" }>[];
        if (run.length >= 2) {
          // A lettered panel that opens with its rating table prints its
          // heading inside the table's header row, as the Word form does.
          const titleInTable = target.level === 2 && target.blocks.length === 0 && target.heading !== "";
          target.blocks.push({
            kind: "ticks",
            title: titleInTable ? target.heading : "Evaluation item",
            options: item.options,
            rows: run.map((r) => ({ number: ++ctx.rowCounter.n, label: r.label, selected: r.selected })),
          });
          if (titleInTable) target.heading = "";
          i = j;
          continue;
        }
        // A lone pick-one question: in the grid when its options are short.
        if (fitsInCell(item.options)) {
          pushCell(target, { label: item.label, text: "", options: item.options, selected: item.selected });
        } else {
          target.blocks.push({ kind: "choiceLine", label: item.label, options: item.options, selected: item.selected });
        }
        i += 1;
        continue;
      }
      pushCell(target, item.cell);
      i += 1;
    }
    pending = [];
  };

  for (const element of elements) {
    const type = text(element.type).toLowerCase();
    const name = text(element.name);
    const children = childElements(element);
    const label = text(element.title) || name;

    if (type === "panel" || type === "paneldynamic") {
      flush();
      panels.n += 1;
      const title = text(element.title);
      const panel: PaperSection = { level: 2, heading: title ? `${letter(panels.n)}. ${title}` : "", blocks: [] };
      opened.push(panel, ...walk(children, panel, ctx, panels));
      // Whatever follows the panel was asked after it, under the PART again.
      const resume: PaperSection = { level: 2, heading: "", blocks: [] };
      opened.push(resume);
      target = resume;
      continue;
    }
    if (children.length > 0 && (type === "columns" || !name)) {
      // Layout wrappers carry no heading; their questions stay in the run.
      flush();
      const nested = walk(children, target, ctx, panels);
      if (nested.length > 0) {
        opened.push(...nested);
        target = nested[nested.length - 1];
      }
      continue;
    }
    if (type === "html") {
      const note = htmlToPlainText(text(element.html));
      if (note && note.length <= 800) {
        flush();
        target.blocks.push({ kind: "note", text: note });
      }
      continue;
    }
    if (!name || SKIP_TYPES.has(type) || isManagedCompanyQuestion(element)) continue;

    const answer = ctx.read(element);
    const blank = isBlank(answer.value) && answer.matrixRows.length === 0;
    if (blank && text(element.visibleIf)) continue;

    if (type === "signaturepad") {
      flush();
      target.blocks.push({ kind: "signature", label, images: imageSources(answer.value), date: blank ? "" : ctx.signatureDate });
      continue;
    }
    if (MATRIX_TYPES.has(type)) {
      flush();
      target.blocks.push({
        kind: "table",
        field: { key: name, label, type, value: answer.value, kind: "matrix", matrixColumns: answer.matrixColumns, matrixRows: answer.matrixRows },
      });
      continue;
    }
    if (type === "file" || type === "imageupload") {
      const images = imageSources(answer.value);
      if (images.length > 0) {
        flush();
        target.blocks.push({ kind: "images", label, images });
        continue;
      }
      pending.push({ kind: "cell", cell: { label, text: formatValue(element, answer.value) } });
      continue;
    }
    const options = optionsFor(element);
    if (options) {
      const selected = selectedOptions(answer.value, options);
      if (TICK_ROW_TYPES.has(type)) {
        pending.push({ kind: "tick", element, label, options, selected });
      } else {
        flush();
        // Several boxes may be ticked; a long list prints on its own line.
        if (fitsInCell(options)) pushCell(target, { label, text: "", options, selected });
        else target.blocks.push({ kind: "choiceLine", label, options, selected });
      }
      continue;
    }
    if (isLongText(element)) {
      flush();
      const value = formatValue(element, answer.value);
      target.blocks.push({ kind: "long", label, text: value, lines: Math.max(3, Math.min(8, Math.trunc(num(element.rows) ?? 3))) });
      continue;
    }
    const value = formatValue(element, answer.value);
    pending.push({ kind: "cell", cell: { label, text: value, wide: value.length > LONG_TEXT_LIMIT || value.includes("\n") } });
  }
  flush();
  return opened;
}

function pushCell(section: PaperSection, cell: PaperCell): void {
  const last = section.blocks[section.blocks.length - 1];
  if (last && last.kind === "grid") last.cells.push(cell);
  else section.blocks.push({ kind: "grid", cells: [cell] });
}

/** Lays out one container (a page, or a step's evaluation questions) as a PART. */
function layoutPart(heading: string, elements: El[], values: Record<string, unknown>, signatureDate: string): PaperSection[] {
  const part: PaperSection = { level: 1, heading, blocks: [] };
  const ctx: WalkContext = { read: createElementAnswerReader(values), signatureDate, rowCounter: { n: 0 } };
  const rest = walk(elements, part, ctx, { n: 0 });
  return [part, ...rest].filter((s, i) => i === 0 || s.heading || s.blocks.length > 0);
}

// ── Workflow steps ──────────────────────────────────────────────────────────

function isManualLayer(layer: PdfLayerResult): boolean {
  return layer.status.trim().toLowerCase().startsWith("manual ");
}

function signOffBlock(layer: PdfLayerResult, fmtDay: (iso: string) => string): PaperBlock {
  const verdict = isManualLayer(layer) ? null : signOffVerdictFromStatus(layer.status);
  const decided = verdict !== null;
  const stepName = layer.layerTitle || `Step ${layer.layerNumber}`;
  const statement = verdict ? `${signOffLabel(verdict)} — ${stepName}` : `${stepName}: to be completed`;
  return {
    kind: "signoff",
    statement,
    name: decided ? signOffName(layer.signerName || layer.confirmerName, layer.email || layer.confirmerEmail) : "",
    position: decided ? signOffPosition(layer.signerPosition, layer.layerTitle || "") : "",
    date: decided && layer.signedAt ? fmtDay(layer.signedAt) : "",
    signature: decided ? layer.signature || "" : "",
    remarks: layer.rejection || "",
    rejected: verdict === "rejected",
  };
}

// ── Entry point ─────────────────────────────────────────────────────────────

export interface PaperLayoutOptions {
  /** ISO date → the day as printed ("13/10/2026"). Injected so tests need no locale. */
  fmtDay: (iso: string) => string;
  /** ISO date → day and time, for the trace line. */
  fmtDateTime: (iso: string) => string;
  /** Pre-formatted document control values, in print order. */
  control: { label: string; value: string }[];
  title: string;
}

/**
 * Every company, as the Word form's COMPANIES block lists them, with the one
 * this submission was filed under ticked. The list is the one published with
 * the form, plus the form's own company question, falling back to the house
 * default when a form carries neither. A chosen company missing from all of
 * them is added at the end rather than dropped.
 */
export function paperCompanies(
  publishedList: string | undefined,
  questionChoices: PaperOption[],
  selected: string,
): { label: string; selected: boolean }[] {
  const lines = (value: string | undefined) => (value ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let names = [...lines(publishedList), ...questionChoices.map((o) => o.label)];
  if (names.length === 0) names = lines(DEFAULT_COMPANIES);
  const seen = new Set<string>();
  const unique = names.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // A stored answer may be the choice's value rather than its label.
  const chosen = selected.trim().toLowerCase();
  const chosenLabel = questionChoices.find((o) => o.value.toLowerCase() === chosen)?.label.toLowerCase() ?? chosen;
  if (chosen && !unique.some((n) => n.toLowerCase() === chosenLabel)) unique.push(selected.trim());
  return unique.map((label) => ({ label, selected: chosen !== "" && label.toLowerCase() === chosenLabel }));
}

export function buildPaperDocument(data: PdfFormData, options: PaperLayoutOptions): PaperDocument {
  const { surveyJson, responseData, meta, layerResults } = data;

  const companyQuestion = getManagedCompanyQuestion(surveyJson);
  const selectedCompany = getSelectedCompany(responseData, surveyJson);
  const companyChoices = Array.isArray(companyQuestion?.choices)
    ? companyQuestion.choices.map(choiceOption).filter((o): o is PaperOption => o !== null)
    : [];
  const companies = paperCompanies(data.companies, companyChoices, selectedCompany);

  const referenceNo = (meta.referenceNo || text(responseData?.[REFERENCE_NO_FIELD])).trim();
  const trace = [
    referenceNo ? `Ref. ${referenceNo}` : "",
    meta.submittedBy ? `Submitted by ${meta.submittedBy}` : "",
    meta.submittedAt ? options.fmtDateTime(meta.submittedAt) : "",
    meta.formStatus ? `Status: ${meta.formStatus}` : "",
  ].filter(Boolean).join("   ·   ");

  const header: PaperHeader = {
    organisation: PAPER_ORGANISATION,
    documentTitle: (data.isoStandards ?? "").trim(),
    formTitle: options.title.toUpperCase(),
    companies,
    control: options.control,
    trace,
  };

  const sections: PaperSection[] = [];
  let part = 0;
  const pages = Array.isArray(surveyJson?.pages) ? surveyJson.pages : [];
  const signatureDate = meta.submittedAt ? options.fmtDay(meta.submittedAt) : "";
  pages.forEach((page) => {
    const elements = Array.isArray(page.elements) ? page.elements.filter(isRecord) : [];
    if (elements.length === 0) return;
    part += 1;
    const pageTitle = text(page.title) || (/^page\d*$/i.test(text(page.name)) ? "" : text(page.name));
    const heading = `PART ${romanNumeral(part)} – ${pageTitle || (part === 1 ? "To be filled by the submitter" : `Page ${part}`)}`;
    sections.push(...layoutPart(heading, elements, responseData ?? {}, signatureDate));
  });

  for (const layer of layerResults ?? []) {
    part += 1;
    const heading = `PART ${romanNumeral(part)} – ${layer.layerTitle || `${layer.type === "evaluation" ? "Evaluation" : "Approval"} (step ${layer.layerNumber})`}`;
    const elements = (layer.evaluationSurveyElements ?? []).filter(isRecord);
    const values = layer.evaluationFields ?? {};
    let stepSections: PaperSection[];
    const layerTag = { type: layer.type };
    if (elements.length > 0) {
      stepSections = layoutPart(heading, elements, values, "");
    } else {
      // Answers with no published questions to hang them on: print them as pairs.
      const cells = Object.entries(values)
        .filter(([, v]) => !isBlank(v))
        .map(([key, v]) => ({ label: key.replace(/[_-]+/g, " "), text: formatPdfFieldValue(v, {}) }));
      stepSections = [{ level: 1, heading, blocks: cells.length > 0 ? [{ kind: "grid", cells }] : [] }];
    }
    stepSections[stepSections.length - 1].blocks.push(signOffBlock(layer, options.fmtDay));
    stepSections[0].layer = layerTag;
    sections.push(...stepSections);
  }

  const doc: PaperDocument = { header, sections };
  return isTrainingEvaluationForm(options.title) ? applyTrainingEvaluationLayout(doc) : doc;
}

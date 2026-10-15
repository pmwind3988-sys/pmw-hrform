/**
 * trainingEvaluationLayout.ts — The Training Evaluation Form's own paper
 * layout, matching HR's Word form (Training Evaluation Form.docx) as signed off
 * on the design canvas.
 *
 * It applies to that one form only. Every other form keeps the general paper
 * layout from paperLayout.ts; this file reshapes that layout after the fact:
 *
 * - no "A. / B." panel labels — a panel's title moves into its table instead;
 * - the course ratings, including any asked one by one, become one numbered
 *   1–4 table under a legend line, worded as the Word form words them;
 * - Training Objective sits inside the employee table, on a row of its own
 *   when the answer is long, with Training Type moved up beside End Date;
 * - a course running on two or more days prints one line per day;
 * - Part II (the HOD's evaluation) starts on a new page with the Word form's
 *   heading, comment label and sign-off statement.
 *
 * Pure: the renderer in PaperFormDocument.tsx draws exactly what this returns.
 */
import type { PaperBlock, PaperCell, PaperDocument, PaperOption, PaperSection } from "./paperLayout";

type TickBlock = Extract<PaperBlock, { kind: "ticks" }>;
type ChoiceBlock = Extract<PaperBlock, { kind: "choiceLine" }>;

export function isTrainingEvaluationForm(title: string): boolean {
  return /\btraining\s+evaluation\b/i.test(title);
}

/** The Word form's wording, used when the form asks the same number of questions. */
export const CONTENTS_ITEMS = [
  "The training room and facilities were adequate and comfortable",
  "The time allocated for the training was sufficient",
  "The assessment methods used were fair and relevant",
  "There were opportunities to ask questions and seek clarifications",
  "The training encouraged interaction and engagement",
];
export const EFFECTIVENESS_ITEMS = [
  "The objectives of the training were met and clearly stated",
  "The training was relevant to my job role/ I can apply what I learned in my day-day work",
  "The training was relevant to improve the knowledge/skills I need to accomplish my job",
  "The course information was at an appropriate level to understand the learning objectives",
];
export const PERFORMANCE_ITEMS = [
  "Training objective met",
  "Improve on required skills",
  "The employee’s productivity level increase",
  "I agree that overall quality of employee has improved",
];
export const HOD_PART_TITLE = "To be filled by the Immediate Superior/ HOD 3 months after the training date";
export const HOD_COMMENTS_LABEL = "Immediate Superior/HOD Comments: (Compulsory to be filled)";
export const HOD_COMMENTS_SUBLABEL = "Justifications or remarks for the above performance indication.";
export const HOD_STATEMENT =
  "I (Immediate Superior/HOD) have gone through of this form and evaluate effectiveness of the training program attended by the employee:";

/** An objective longer than this takes a full-width row of the employee table. */
export const LONG_OBJECTIVE_CHARS = 40;

// ── Small helpers ───────────────────────────────────────────────────────────

function stripLetter(heading: string): string {
  return heading.replace(/^[A-Z]\.\s+/, "");
}

/** "Strongly Agree" and "Strong Agree" are the same column; "Excellent" is not "Disagree". */
function sameColumns(a: PaperOption[], b: PaperOption[]): boolean {
  const key = (o: PaperOption) => o.label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6);
  return a.length === b.length && a.every((o, i) => key(o) === key(b[i]));
}

function isNumericScale(options: PaperOption[]): boolean {
  return options.every((o) => /^\d+$/.test(o.label.trim()));
}

/** "Please rate … where: 1 = Disagree, 2 = Neutral, …", as the Word form explains its columns. */
export function ratingLegend(options: PaperOption[]): string {
  const scale = options.map((o, i) => `${i + 1} = ${o.label}`).join(", ");
  return `Please rate the following aspects on a scale of 1 – ${options.length}, where: ${scale}`;
}

// ── Multi-day schedules ─────────────────────────────────────────────────────

interface Stamp { day: number; minutes: number }

/** Reads a printed date and time ("22/06/2026 06:00 PM", or ISO) into a day number and minutes. */
function readStamp(value: string): Stamp | null {
  const printed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(value.trim());
  const iso = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value.trim());
  let y: number, mo: number, d: number, h: number, mi: number;
  if (printed) {
    [d, mo, y, h, mi] = printed.slice(1, 6).map(Number);
    const half = (printed[6] ?? "").toUpperCase();
    if (half) h = (h % 12) + (half === "PM" ? 12 : 0);
  } else if (iso) {
    [y, mo, d, h, mi] = iso.slice(1, 6).map(Number);
  } else {
    return null;
  }
  return { day: Date.UTC(y, mo - 1, d) / 86_400_000, minutes: h * 60 + mi };
}

function two(n: number): string {
  return String(n).padStart(2, "0");
}

function clock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  return `${h % 12 || 12}:${two(minutes % 60)} ${h < 12 ? "AM" : "PM"}`;
}

function calendarDay(day: number): string {
  const date = new Date(day * 86_400_000);
  return `${two(date.getUTCDate())}/${two(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

/**
 * A course from 12/10 9 AM to 13/10 5 PM runs 9–5 on each of those days, not
 * for 32 hours straight. Returns one line per day when the dates span two or
 * more days and the finish is later in the day than the start; null otherwise
 * — a finish earlier in the day than the start is one overnight session.
 */
export function dailySchedule(start: string, end: string): string[] | null {
  const from = readStamp(start);
  const to = readStamp(end);
  if (!from || !to || to.day <= from.day || to.minutes <= from.minutes) return null;
  if (to.day - from.day > 30) return null;
  const hours = `${clock(from.minutes)} – ${clock(to.minutes)}`;
  const out: string[] = [];
  for (let day = from.day, n = 1; day <= to.day; day += 1, n += 1) {
    out.push(`Day ${n}: ${calendarDay(day)}, ${hours}`);
  }
  return out;
}

/**
 * A course's dates and hours as a paper form writes them in its Date and Time
 * boxes: "12/10/2026" or "12/10/2026 – 13/10/2026", and "9:00 AM – 5:00 PM".
 * Null when either end cannot be read as a date and time.
 */
export function courseTimes(start: string, end: string): { date: string; time: string } | null {
  const from = readStamp(start);
  const to = readStamp(end);
  if (!from) return null;
  if (!to) return { date: calendarDay(from.day), time: clock(from.minutes) };
  const date = to.day === from.day ? calendarDay(from.day) : `${calendarDay(from.day)} – ${calendarDay(to.day)}`;
  return { date, time: `${clock(from.minutes)} – ${clock(to.minutes)}` };
}

// ── The employee table ──────────────────────────────────────────────────────

/**
 * Pairs cells two to a row, as the Word form's employee table does, with two
 * exceptions: the cell at `stackUnder` (End Date & Time) goes directly beneath
 * the one before it (Start Date & Time) when that one ended a row, and a wide
 * cell waits until the next row is complete, so the short questions stay
 * together above it. A row of one cell prints across the table.
 */
export function arrangeGrid(cells: PaperCell[], stackUnder = -1): PaperCell[][] {
  const rows: PaperCell[][] = [];
  let current: PaperCell[] = [];
  let deferred: PaperCell[] = [];
  let held: PaperCell | null = null;
  const emit = (row: PaperCell[]) => {
    rows.push(row);
    for (const wide of deferred) rows.push([wide]);
    deferred = [];
  };
  cells.forEach((cell, i) => {
    if (cell.wide) {
      const shortAfter = cells.slice(i + 1).some((c) => !c.wide);
      if (current.length > 0 || held || shortAfter) deferred.push(cell);
      else rows.push([cell]);
      return;
    }
    if (i === stackUnder && current.length === 0 && held === null && rows.length > 0) {
      held = cell;
      return;
    }
    if (held) {
      emit([cell, held]);
      held = null;
      return;
    }
    current.push(cell);
    if (current.length === 2) {
      emit(current);
      current = [];
    }
  });
  if (held) current.push(held);
  if (current.length > 0) emit(current);
  for (const wide of deferred) rows.push([wide]);
  return rows;
}

/** Folds Training Objective and the grid after it into the employee grid, and arranges it. */
function shapeEmployeeGrid(part: PaperSection[]): void {
  const slots: { section: PaperSection; index: number }[] = [];
  part.forEach((section) => section.blocks.forEach((_, index) => slots.push({ section, index })));
  const first = slots.findIndex((s) => s.section.blocks[s.index].kind === "grid");
  if (first < 0) return;
  const grid = slots[first].section.blocks[slots[first].index] as Extract<PaperBlock, { kind: "grid" }>;

  const absorbed: { section: PaperSection; index: number }[] = [];
  for (let i = first + 1; i < slots.length; i += 1) {
    const slot = slots[i];
    // Only into a section that carries no heading of its own — never across a panel title.
    if (slot.section !== slots[first].section && slot.section.heading) break;
    const block = slot.section.blocks[slot.index];
    if (block.kind === "grid") {
      grid.cells.push(...block.cells);
    } else if (block.kind === "long" && /objective/i.test(block.label)) {
      grid.cells.push({ label: block.label, text: block.text, wide: block.text.length > LONG_OBJECTIVE_CHARS || block.text.includes("\n") });
    } else {
      break;
    }
    absorbed.push(slot);
  }
  for (const slot of absorbed.reverse()) slot.section.blocks.splice(slot.index, 1);

  // Start and End date: one line per day for a multi-day course, else End beneath Start.
  let stackUnder = -1;
  const start = grid.cells.findIndex((c) => /\bstart\b/i.test(c.label));
  const end = start >= 0 ? start + 1 : -1;
  if (end > 0 && end < grid.cells.length && /\bend\b/i.test(grid.cells[end].label)) {
    const days = dailySchedule(grid.cells[start].text, grid.cells[end].text);
    if (days && days.length > 1) {
      grid.cells.splice(start, 2, { label: "Training Date & Time", text: "", lines: days });
    } else {
      stackUnder = end;
    }
  }
  grid.rows = arrangeGrid(grid.cells, stackUnder);
}

// ── Rating tables ───────────────────────────────────────────────────────────

/** Ratings asked one question at a time join the table beside them when they share its columns. */
function mergeRatingRuns(section: PaperSection): void {
  const out: PaperBlock[] = [];
  let run: (ChoiceBlock | TickBlock)[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const table = run.find((b): b is TickBlock => b.kind === "ticks");
    const rowCount = run.reduce((sum, b) => sum + (b.kind === "ticks" ? b.rows.length : 1), 0);
    if (rowCount < 2) {
      out.push(...run);
      run = [];
      return;
    }
    const options = (table ?? run[0]).options;
    const rows: TickBlock["rows"] = [];
    for (const b of run) {
      if (b.kind === "ticks") {
        rows.push(...b.rows);
      } else {
        // Map the tick by position: one question's "Strong Agree" is the table's "Strongly Agree".
        const picked = b.selected.map((v) => b.options.findIndex((o) => o.value === v)).filter((i) => i >= 0);
        rows.push({ number: 0, label: b.label, selected: picked.map((i) => options[i].value) });
      }
    }
    const opensSection = out.length === 0 && section.heading !== "";
    out.push({ kind: "ticks", title: opensSection ? section.heading : table?.title ?? "Evaluation item", options, rows });
    if (opensSection) section.heading = "";
    run = [];
  };
  for (const block of section.blocks) {
    const scaleBlock = block.kind === "ticks" || (block.kind === "choiceLine" && block.options.length >= 3);
    if (scaleBlock && (run.length === 0 || sameColumns(run[0].options, block.options))) {
      run.push(block);
      continue;
    }
    flush();
    if (scaleBlock) run.push(block);
    else out.push(block);
  }
  flush();
  section.blocks = out;
}

function tickTables(sections: PaperSection[]): TickBlock[] {
  return sections.flatMap((s) => s.blocks.filter((b): b is TickBlock => b.kind === "ticks"));
}

function shapeRatings(part: PaperSection[]): void {
  part.forEach(mergeRatingRuns);
  let n = 0;
  for (const table of tickTables(part)) for (const row of table.rows) row.number = ++n;

  const rated = tickTables(part).filter((t) => t.options.length >= 3);
  rated.forEach((t) => { t.numbered = true; });
  if (rated.length === 0) return;
  rated[0].banner = true;
  if (rated[0].title === "Evaluation item") rated[0].title = "Contents of the course";

  // The legend goes above the first table, unless the form already prints one.
  const hasLegend = part.some((s) => s.blocks.some((b) => b.kind === "note" && /\b1\s*=/.test(b.text)));
  if (!hasLegend && !isNumericScale(rated[0].options)) {
    const home = part.find((s) => s.blocks.includes(rated[0]));
    if (home) home.blocks.splice(home.blocks.indexOf(rated[0]), 0, { kind: "note", text: ratingLegend(rated[0].options) });
  }

  const wording = [CONTENTS_ITEMS, EFFECTIVENESS_ITEMS];
  rated.slice(0, 2).forEach((table, i) => {
    if (table.rows.length === wording[i].length) table.rows.forEach((row, j) => { row.label = wording[i][j]; });
  });
}

// ── The HOD's part ──────────────────────────────────────────────────────────

function shapeHodPart(part: PaperSection[]): void {
  const head = part[0];
  const roman = head.heading.split(" – ")[0];
  head.heading = `${roman} – ${HOD_PART_TITLE}`;

  for (const table of tickTables(part)) {
    table.title = "Performance Indication:";
    if (table.rows.length === PERFORMANCE_ITEMS.length) table.rows.forEach((row, j) => { row.label = PERFORMANCE_ITEMS[j]; });
  }
  const comments = part.flatMap((s) => s.blocks).find((b): b is Extract<PaperBlock, { kind: "long" }> => b.kind === "long");
  if (comments) {
    comments.label = HOD_COMMENTS_LABEL;
    comments.sublabel = HOD_COMMENTS_SUBLABEL;
  }
  // A signature question in the HOD's step is the signature on the sign-off
  // line, not a second line of its own.
  const signed = part.flatMap((s) => s.blocks).find((b): b is Extract<PaperBlock, { kind: "signature" }> => b.kind === "signature");
  if (signed) {
    for (const section of part) section.blocks = section.blocks.filter((b) => b !== signed);
  }
  for (const block of part.flatMap((s) => s.blocks)) {
    if (block.kind !== "signoff") continue;
    if (signed?.images[0] && !block.signature) block.signature = signed.images[0];
    if (!block.rejected) block.statement = HOD_STATEMENT;
    // The HOD signs at the same size as the employee in Part I.
    block.large = true;
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function applyTrainingEvaluationLayout(doc: PaperDocument): PaperDocument {
  // Group the sections into PARTs: each level-1 section and the panels after it.
  const parts: PaperSection[][] = [];
  for (const section of doc.sections) {
    if (section.level === 1 || parts.length === 0) parts.push([section]);
    else parts[parts.length - 1].push(section);
  }

  for (const part of parts) {
    for (const section of part) {
      section.heading = stripLetter(section.heading);
      for (const block of section.blocks) if (block.kind === "ticks") block.title = stripLetter(block.title);
    }
  }

  parts.forEach((part, i) => {
    if (i > 0) part[0].newPage = true;
    if (part[0].layer) {
      // Any other step's sign-off matches the employee's signature size too.
      for (const block of part.flatMap((s) => s.blocks)) if (block.kind === "signoff") block.large = true;
      return;
    }
    shapeEmployeeGrid(part);
    shapeRatings(part);
    for (const section of part) {
      // The employee table needs no heading above it.
      if (section.level === 2 && section.blocks[0]?.kind === "grid") section.heading = "";
      for (const block of section.blocks) {
        if (block.kind === "signature") block.large = true;
        // A comment prints on as many ruled lines as its text needs, one when it is short.
        if (block.kind === "long") block.lines = 1;
      }
    }
  });

  const hod = parts.find((part) => part[0].layer?.type === "evaluation");
  if (hod) shapeHodPart(hod);

  return { ...doc, variant: "training-evaluation" };
}

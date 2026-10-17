/**
 * paperFormKit.ts — Small helpers shared by the forms that have a paper layout
 * of their own (Training Attendance, Needs Analysis, Requisition): finding a
 * question by what it asks, printing its answer, and turning a workflow step
 * into a signatory column.
 *
 * Questions are found by name or title rather than by a fixed name, so a form
 * republished with a renamed question still prints in the right box. Pure.
 */
import type { PdfLayerResult } from "../FormPdfDocument";
import type { PaperCell, PaperKit, SignoffColumn } from "./paperLayout";
import { courseTimes, dailySchedule } from "./trainingEvaluationLayout";

type El = Record<string, unknown>;

function str(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/** Hands out questions by what they ask, each one once, remembering which were placed. */
export class QuestionPicker {
  readonly placed = new Set<string>();
  private readonly kit: PaperKit;
  constructor(kit: PaperKit) {
    this.kit = kit;
  }

  /** The first unplaced question whose name or title matches; `types` narrows by question type. */
  take(pattern: RegExp, types?: string[]): El | undefined {
    const found = this.kit.questions.find((q) => {
      const name = str(q.name);
      if (!name || this.placed.has(name)) return false;
      if (types && !types.includes(str(q.type).toLowerCase())) return false;
      return pattern.test(`${name} ${str(q.title)}`);
    });
    if (found) this.placed.add(str(found.name));
    return found;
  }
}

/** The answer as stored, before any formatting. */
export function rawAnswer(kit: PaperKit, element: El | undefined): unknown {
  return element ? kit.read(element).value : undefined;
}

/** The answer as the paper form prints it; "" when there is none. */
export function answerText(kit: PaperKit, element: El | undefined): string {
  return element ? kit.formatValue(element, rawAnswer(kit, element)) : "";
}

/** A label and its answer, as tick boxes when the question offers a short list. */
export function cellFor(kit: PaperKit, element: El | undefined, label: string): PaperCell {
  if (!element) return { label, text: "" };
  const options = kit.optionsFor(element);
  if (options) return { label, text: "", options, selected: kit.selectedOptions(rawAnswer(kit, element), options) };
  const text = answerText(kit, element);
  return { label, text, wide: text.length > 60 || text.includes("\n") };
}

/** The first drawn signature a signature question holds. */
export function signatureOf(kit: PaperKit, element: El | undefined): string {
  return element ? kit.imageSources(rawAnswer(kit, element))[0] ?? "" : "";
}

/**
 * A course's start and end as the paper form's date boxes print them: the
 * date(s), the hours, and — for a course on two or more days — one line per day.
 */
export function courseSchedule(kit: PaperKit, start: El | undefined, end: El | undefined): { date: string; time: string; days: string[] | null } {
  const startRaw = str(rawAnswer(kit, start));
  const endRaw = str(rawAnswer(kit, end));
  const startText = answerText(kit, start);
  const endText = answerText(kit, end);
  const times = courseTimes(startRaw, endRaw) ?? courseTimes(startText, endText);
  const days = dailySchedule(startRaw, endRaw) ?? dailySchedule(startText, endText);
  if (times) return { ...times, days: days && days.length > 1 ? days : null };
  // Neither end reads as a date and time: print what was written.
  const both = [startText, endText].filter(Boolean).join(" – ");
  return { date: both, time: "", days: null };
}

/** "HOD" as the Word forms spell it out under a signature line. */
export function roleName(title: string): string {
  const trimmed = title.trim();
  if (/^hod$/i.test(trimmed)) return "Head of Department";
  return trimmed;
}

/** A workflow step as one signatory column: who signed, as what, and when. */
export function stepColumn(kit: PaperKit, layer: PdfLayerResult, caption: string, role: string, positionLabel?: string): SignoffColumn {
  const signed = kit.signOff(layer);
  return {
    caption,
    role,
    name: signed.name,
    position: signed.position,
    positionLabel,
    date: signed.date,
    signature: signed.signature,
    rejected: signed.rejected,
    remarks: signed.remarks,
    onBehalfOf: signed.onBehalfOf,
  };
}

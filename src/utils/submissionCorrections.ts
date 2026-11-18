/**
 * submissionCorrections.ts — the record of a submitter correcting their own
 * submission before anyone acted on it, and the wording that shows it.
 *
 * The record itself lives in `WorkflowAssignmentData.corrections`
 * (`workflowAssignmentData.ts`); this module builds an entry from a save and
 * reads it back for the reviewer page, the PDF, All Submissions and the
 * export. Pure.
 */
import {
  readSubmissionCorrections,
  type SubmissionCorrectionChange,
  type SubmissionCorrectionEntry,
} from "./workflowAssignmentData";

/**
 * The field the reviewer page receives the record under. `api/evaluate.ts`
 * sends only this, never the whole `WorkflowAssignmentData` (which also holds
 * routing logs with other people's addresses).
 */
export const SUBMISSION_CORRECTIONS_FIELD = "SubmissionCorrections";

type El = Record<string, unknown>;
const isRecord = (v: unknown): v is El => typeof v === "object" && v !== null && !Array.isArray(v);

function titleText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (isRecord(value)) {
    const text = value.default ?? value.en ?? Object.values(value).find((v) => typeof v === "string");
    return typeof text === "string" ? text.trim() : "";
  }
  return "";
}

/** Each question's wording by name, panels opened up. */
export function questionLabels(surveyJson: unknown): Map<string, string> {
  const labels = new Map<string, string>();
  const visit = (el: unknown) => {
    if (!isRecord(el)) return;
    const name = typeof el.name === "string" ? el.name.trim() : "";
    const title = titleText(el.title);
    if (name && title && !labels.has(name)) labels.set(name, title);
    for (const key of ["pages", "elements"]) if (Array.isArray(el[key])) (el[key] as unknown[]).forEach(visit);
  };
  visit(isRecord(surveyJson) && isRecord(surveyJson.surveyJson) ? surveyJson.surveyJson : surveyJson);
  return labels;
}

/** An answer as text for the record: a table or choice list as JSON, a file as a note. */
export function answerAsText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim().startsWith("data:") ? "(a new file or signature)" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) && value.every((v) => typeof v === "string" || typeof v === "number")) return value.join(", ");
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * One correction, from the answers as saved and as now sent. `uploaded` gives
 * the address a newly uploaded file or signature was stored at, which is what
 * the record should show instead of the file's raw content.
 */
export function buildCorrectionEntry(opts: {
  surveyJson: unknown;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  changed: Iterable<string>;
  by: string;
  at: string;
  uploaded?: Map<string, string>;
}): SubmissionCorrectionEntry | null {
  const labels = questionLabels(opts.surveyJson);
  const changes: SubmissionCorrectionChange[] = [];
  for (const question of opts.changed) {
    const label = labels.get(question);
    changes.push({
      question,
      ...(label ? { label } : {}),
      before: answerAsText(opts.before[question]),
      after: opts.uploaded?.get(question) ?? answerAsText(opts.after[question]),
    });
  }
  if (changes.length === 0 || !opts.by.trim()) return null;
  return { at: opts.at, by: opts.by.trim().toLowerCase(), changes };
}

/**
 * The corrections on a set of fields: the reviewer page's
 * `SubmissionCorrections`, or the row's own `WorkflowAssignmentData`.
 */
export function correctionsFromFields(fields: Record<string, unknown> | null | undefined): SubmissionCorrectionEntry[] {
  if (!fields) return [];
  const sent = fields[SUBMISSION_CORRECTIONS_FIELD];
  if (sent !== undefined && sent !== null && sent !== "") {
    return readSubmissionCorrections({ version: 1, layers: {}, corrections: typeof sent === "string" ? safeParse(sent) : sent });
  }
  return readSubmissionCorrections(fields.WorkflowAssignmentData);
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return [];
  }
}

/**
 * The one line printed wherever the submission is shown, or "" when it was
 * never corrected. `formatAt` turns the stored time into the page's own style.
 */
export function correctionNotice(entries: readonly SubmissionCorrectionEntry[], formatAt: (iso: string) => string): string {
  if (entries.length === 0) return "";
  const last = entries[entries.length - 1];
  if (entries.length === 1) {
    const n = last.changes.length;
    return `Corrected by the submitter on ${formatAt(last.at)}, before any step was decided (${n} answer${n === 1 ? "" : "s"} changed).`;
  }
  return `Corrected by the submitter ${entries.length} times before any step was decided, last on ${formatAt(last.at)}.`;
}

/** The questions any correction changed, by wording, in the order first changed. */
export function correctedQuestionLabels(entries: readonly SubmissionCorrectionEntry[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of entries) {
    for (const change of entry.changes) {
      const text = change.label || change.question;
      if (!seen.has(text)) {
        seen.add(text);
        out.push(text);
      }
    }
  }
  return out;
}

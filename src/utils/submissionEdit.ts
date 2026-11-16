/**
 * submissionEdit.ts — Reopening a submission so its submitter can correct it
 * before anyone has acted on it (`/form/:formId?edit=<item id>`).
 *
 * The form opens with every saved answer filled in. Saving writes only the
 * answers that changed back onto the same response item: the reference number,
 * the approval step and its email stay exactly as they were, so nobody is asked
 * twice. Pure: the page does the reading and writing.
 */
import { responseKeyForQuestion } from "./formSubmissionLayout";
import { savedMatrixRows } from "./matrixData";
import { malaysiaParts } from "./paperPdf/needsSchedule";

export const EDIT_PARAM = "edit";

/** The item id an edit link names, or null when it names none. */
export function parseEditTarget(raw: string | null | undefined): number | null {
  const text = (raw ?? "").trim();
  if (!/^\d{1,9}$/.test(text)) return null;
  const id = Number(text);
  return id > 0 ? id : null;
}

export type EditRefusal = "" | "sign-in" | "not-yours" | "decided" | "closed";

const CLOSED_FORM = /^(completed|rejected|cancelled|approved)/i;
const DECIDED_STEP = /^(approved|rejected|confirmed|evaluated|completed|cancelled|skipped)/i;

/**
 * Why this viewer may not change this submission, or "" when they may: it must
 * be their own, and no step may have been decided yet — an approver must never
 * find that what they signed has changed under them.
 */
export function editRefusal(item: Record<string, unknown>, viewerEmail: string): EditRefusal {
  const viewer = viewerEmail.trim().toLowerCase();
  if (!viewer) return "sign-in";
  if (String(item.SubmittedBy ?? "").trim().toLowerCase() !== viewer) return "not-yours";
  if (CLOSED_FORM.test(String(item.FormStatus ?? "").trim())) return "closed";
  for (const [key, value] of Object.entries(item)) {
    const step = /^L\d+_(Status|SignedAt)$/.exec(key);
    if (!step || value === null || value === undefined || String(value).trim() === "") continue;
    if (step[1] === "SignedAt" || DECIDED_STEP.test(String(value).trim())) return "decided";
  }
  return "";
}

/** What the page says for each refusal. */
export const EDIT_REFUSAL_MESSAGE: Record<Exclude<EditRefusal, "">, string> = {
  "sign-in": "Sign in with the account that sent this submission to update it.",
  "not-yours": "This link updates a submission sent by someone else. Only the person who sent it can change it.",
  decided: "This submission can no longer be changed here: an approver has already acted on it. Ask HR if it still needs correcting.",
  closed: "This submission is closed and can no longer be changed.",
};

type El = Record<string, unknown>;
const isRecord = (v: unknown): v is El => typeof v === "object" && v !== null && !Array.isArray(v);
const MATRIX_TYPES = new Set(["dynamicmatrix", "matrixdynamic", "tableinput"]);
const LAYOUT_TYPES = new Set(["panel", "paneldynamic", "html", "image", "expression"]);

/** Every answerable question of a published form, panels opened up. */
export function formQuestions(surveyJson: unknown): { name: string; type: string; inputType: string }[] {
  const out: { name: string; type: string; inputType: string }[] = [];
  const visit = (el: unknown) => {
    if (!isRecord(el)) return;
    const type = String(el.type ?? "").toLowerCase();
    const name = typeof el.name === "string" ? el.name.trim() : "";
    if (name && type && !LAYOUT_TYPES.has(type)) out.push({ name, type, inputType: String(el.inputType ?? "").toLowerCase() });
    for (const key of ["pages", "elements"]) if (Array.isArray(el[key])) (el[key] as unknown[]).forEach(visit);
  };
  visit(isRecord(surveyJson) && isRecord(surveyJson.surveyJson) ? surveyJson.surveyJson : surveyJson);
  return out;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0);
}

/**
 * A saved response item as the form's own answers, ready to fill the form
 * with. A table comes from its full copy (`<question>_Json`), which holds the
 * rows exactly as the form gave them; `childRows` is used only when there is
 * no copy. Links (a signature, an upload) come back as their address.
 */
export function answersFromItem(
  surveyJson: unknown,
  item: Record<string, unknown>,
  childRows: Record<string, Record<string, unknown>[]> = {},
): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const q of formQuestions(surveyJson)) {
    if (MATRIX_TYPES.has(q.type)) {
      const savedKey = responseKeyForQuestion(item, `${q.name}_Json`);
      const saved = savedKey ? savedMatrixRows(item[savedKey]) : null;
      const rows = (saved ?? childRows[q.name] ?? []).filter((row) => Object.keys(row).length > 0);
      if (rows.length > 0) answers[q.name] = rows;
      continue;
    }
    const key = responseKeyForQuestion(item, q.name);
    let value = key ? item[key] : undefined;
    if (isRecord(value) && typeof value.Url === "string") value = value.Url;
    if (isBlank(value)) continue;
    if (q.inputType === "date" || q.type === "date") {
      value = malaysiaParts(value)?.date || value;
    } else if (q.inputType === "datetime-local" || q.type === "datetime") {
      const parts = malaysiaParts(value);
      value = parts ? `${parts.date}T${parts.time || "00:00"}` : value;
    }
    answers[q.name] = value;
  }
  return answers;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The questions whose answer is now different from what was saved. Only an
 * answer the form now holds counts: one the form dropped (a hidden question)
 * is left as saved rather than wiped.
 */
export function changedAnswerNames(before: Record<string, unknown>, after: Record<string, unknown>): Set<string> {
  const changed = new Set<string>();
  for (const [name, value] of Object.entries(after)) {
    if (name.endsWith("-Comment")) continue;
    if (!same(value, before[name])) changed.add(name);
  }
  return changed;
}

/** The address of the edit link for one submission. */
export function editLinkPath(formSlug: string, itemId: number, version?: string): string {
  const query = new URLSearchParams({ [EDIT_PARAM]: String(itemId) });
  if (version) query.set("version", version);
  return `/form/${encodeURIComponent(formSlug)}?${query.toString()}`;
}

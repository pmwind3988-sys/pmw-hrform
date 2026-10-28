/**
 * trainingNeedsAnalysisLayout.ts — The Training Needs Analysis's own paper
 * layout, matching HR's Word form (Training Needs Analysis.docx):
 *
 *   DEPARTMENT | ______ | YEAR | ____
 *   No | Emp. ID | Name | Training Needs | Current Skill Level | Required Skill
 *      Level | Priority | Please state relevancy to job function | Tentative Date
 *   (each skill and priority cell: ☐ Low ☐ Medium ☐ High)
 *
 *   Prepared by HOD: ______        Approved by GHRH: ______
 *   Name / Designation / Date      Name / Designation / Date
 *
 * The table is the form's dynamic matrix, its columns matched to the Word
 * form's by what they ask. It always prints at least the Word form's five
 * rows, so blank boxes stay on the page as they do on paper. Pure.
 */
import type { PaperKit, PaperOption, PaperSection, RosterCell, SignoffColumn } from "./paperLayout";
import type { FormSubmissionField } from "../formSubmissionLayout";
import { formatPdfFieldValue } from "../pdfFieldFormatting";
import { QuestionPicker, answerText, roleName, signatureOf, stepColumn } from "./paperFormKit";

type MatrixColumn = NonNullable<FormSubmissionField["matrixColumns"]>[number];

/** The Word form's columns, each with what a matrix column asking it is called. */
const NEEDS_COLUMNS: { label: string; width: number; match: RegExp }[] = [
  { label: "Emp. ID", width: 9, match: /emp|staff|\bid\b/i },
  { label: "Name", width: 13, match: /name/i },
  { label: "Training Needs", width: 14, match: /need/i },
  { label: "Current Skill Level", width: 10, match: /current/i },
  { label: "Required Skill Level", width: 10, match: /required/i },
  { label: "Priority", width: 10, match: /priority/i },
  { label: "Please state relevancy to job function", width: 16, match: /relevan/i },
  { label: "Tentative Date", width: 12, match: /tentative|date/i },
];

export const NEEDS_MIN_ROWS = 5;
export const NEEDS_APPROVER_CAPTION = "Approved by GHRH:";

function choiceOptions(column: MatrixColumn): PaperOption[] | null {
  if (!Array.isArray(column.choices) || column.choices.length === 0) return null;
  return column.choices.map((c) => {
    if (c && typeof c === "object") {
      const record = c as Record<string, unknown>;
      const value = String(record.value ?? record.text ?? "");
      return { value, label: String(record.text ?? value) };
    }
    return { value: String(c), label: String(c) };
  });
}

function rosterCell(kit: PaperKit, column: MatrixColumn | undefined, row: Record<string, unknown> | null): RosterCell {
  if (!column) return { text: "" };
  const value = row ? row[column.name] : undefined;
  const options = choiceOptions(column);
  if (options) return { options, selected: row ? kit.selectedOptions(value, options) : [] };
  const text = row ? formatPdfFieldValue(value, { type: column.cellType, inputType: column.cellType, choices: column.choices }).replace(/^—$/, "") : "";
  return { text };
}

/**
 * The Word form's columns in its order, each with the form's own column that
 * asks it (or none), then any column the Word form does not have. Shared by
 * the printout and the on-screen form the HOD fills in, so both agree.
 */
export function matchNeedsColumns<C extends { name: string; title?: string }>(columns: C[]): { label: string; width: number; column: C | undefined }[] {
  const used = new Set<C>();
  const placed = NEEDS_COLUMNS.map((spec) => {
    const found = columns.find((c) => !used.has(c) && spec.match.test(`${c.name} ${c.title ?? ""}`));
    if (found) used.add(found);
    return { label: spec.label, width: spec.width, column: found };
  });
  const extra = columns.filter((c) => !used.has(c)).map((c) => ({ label: c.title || c.name, width: 10, column: c as C | undefined }));
  return [...placed, ...extra];
}

/** The preparer's Name and Designation questions, matched as the printout matches them. */
export const PREPARED_NAME_MATCH = /prepared.*name|hod.*name/i;
export const PREPARED_DESIGNATION_MATCH = /designation|position/i;

export function buildTrainingNeedsAnalysisSections(kit: PaperKit): PaperSection[] {
  const pick = new QuestionPicker(kit);
  const department = pick.take(/department/i);
  const year = pick.take(/\byear\b/i);
  const matrix = pick.take(/./, ["matrixdynamic", "dynamicmatrix", "tableinput"]);
  const preparedSignature = pick.take(/prepared|hod|signature/i, ["signaturepad"]);
  const preparedName = pick.take(PREPARED_NAME_MATCH);
  const preparedDesignation = pick.take(PREPARED_DESIGNATION_MATCH);

  // The table's columns, matched to the Word form's; a column it does not have is added at the end.
  const answer = matrix ? kit.read(matrix) : null;
  const all = matchNeedsColumns(answer?.matrixColumns ?? []);
  // Widths are shares of the row once the No column has its 6%.
  const total = all.reduce((sum, c) => sum + c.width, 0);
  const widths = [6, ...all.map((c) => (c.width / total) * 94)];

  const answered = answer?.matrixRows ?? [];
  const rows: (Record<string, unknown> | null)[] = [...answered];
  while (rows.length < NEEDS_MIN_ROWS) rows.push(null);

  const submittedYear = (kit.data.meta.submittedAt || "").slice(0, 4);
  const header: PaperSection = {
    level: 1,
    heading: "",
    blocks: [
      {
        kind: "grid",
        cells: [],
        rows: [[
          { label: "DEPARTMENT", text: answerText(kit, department) },
          { label: "YEAR", text: answerText(kit, year) || (/^\d{4}$/.test(submittedYear) ? submittedYear : "") },
        ]],
      },
      {
        kind: "roster",
        columns: ["No", ...all.map((c) => c.label)],
        widths,
        rows: rows.map((row, i) => [{ text: String(i + 1) }, ...all.map((c) => rosterCell(kit, c.column, row))]),
      },
    ],
  };

  const prepared: SignoffColumn = {
    caption: "Prepared by HOD:",
    role: "",
    name: answerText(kit, preparedName) || kit.data.meta.submittedBy || "",
    position: answerText(kit, preparedDesignation),
    positionLabel: "Designation",
    date: signatureOf(kit, preparedSignature) ? kit.signatureDate : "",
    signature: signatureOf(kit, preparedSignature),
    rejected: false,
    remarks: "",
  };
  const steps = (kit.data.layerResults ?? []).map((layer, i) =>
    stepColumn(kit, layer, i === 0 ? NEEDS_APPROVER_CAPTION : `Approved by ${roleName(layer.layerTitle || `Step ${layer.layerNumber}`)}:`, "", "Designation"));
  // With no step recorded yet, the approver's column still prints, empty, as on paper.
  const approvers = steps.length > 0 ? steps : [{ ...prepared, caption: NEEDS_APPROVER_CAPTION, name: "", position: "", date: "", signature: "" }];

  const signing: PaperSection = { level: 2, heading: "", blocks: [{ kind: "signoffRow", columns: [prepared, ...approvers] }] };
  const stepAnswers = (kit.data.layerResults ?? []).flatMap((layer) => kit.stepAnswers(layer));
  return [header, ...kit.leftovers(pick.placed), ...stepAnswers, signing];
}

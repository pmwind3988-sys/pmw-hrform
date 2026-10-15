/**
 * trainingRequisitionLayout.ts — The Training Requisition Form's own paper
 * layout, matching HR's Word form (Training Requisition Form.docx):
 *
 *   Employee Details   Employee Name : ___ / Position : ___  Department : ___ / Reporting Manager : ___
 *   Training Details   Course Name / Training Objective / Training Provider / Venue / Date : ___ Time : ___
 *   Cost               Training Fee : RM ___ … Total Cost : RM ___ / HRDC Claimable : ☐ YES ☐ NO
 *
 *   Request by:  | Recommend by:      | Recommend/Approve by:        | Approve by:
 *   ___________  | ________________   | ____________________________ | _____________________________
 *   Applicant    | Head of Department | Group Human Resource Head    | Chief Human Resource Officer
 *   Name / Date under each
 *
 *   For reference: Subject | Recommender | Approver
 *
 * The signatories are the applicant and the steps the submission's branch
 * actually takes — a non-managerial request stops at the GHRH. Pure.
 */
import type { PaperCell, PaperKit, PaperSection, SignoffColumn } from "./paperLayout";
import { QuestionPicker, answerText, cellFor, courseSchedule, roleName, signatureOf, stepColumn } from "./paperFormKit";

export const REQUISITION_REFERENCE = {
  columns: ["Subject", "Recommender", "Approver"],
  rows: [
    ["Managerial staff and above", "GHRH", "CHRO"],
    ["Non-Managerial staff", "HOD", "GHRH"],
  ],
};
export const REQUISITION_RETAIN_NOTE = "*Please retain a copy for your records & return to the human resources department";

/** The Word form's cost lines, in order, with what the form's question for each is called. */
const COST_LINES: { label: string; match: RegExp }[] = [
  { label: "Training Fee", match: /training\s*fee|trainingFee/i },
  { label: "Mileage/Transportation Fees", match: /mileage|transport/i },
  { label: "Meals Allowance X days of training", match: /meal/i },
  { label: "Accommodation", match: /accom/i },
  { label: "Other cost (Toll/Parking)", match: /other|toll|parking/i },
];

/** "1,250.00" from a stored amount; the paper form prints the RM before it. */
function amount(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.replace(/[^0-9.-]/g, "")) : NaN;
  return Number.isFinite(n) ? n : null;
}

function money(n: number | null, fallback = ""): string {
  return n === null ? fallback : n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** What each step signs as, by where it falls: the last approves, any before it recommend. */
export function requisitionCaption(index: number, count: number): string {
  if (index === count - 1) return "Approve by:";
  return index === 0 ? "Recommend by:" : "Recommend/Approve by:";
}

export function buildTrainingRequisitionSections(kit: PaperKit): PaperSection[] {
  const pick = new QuestionPicker(kit);
  const employeeName = pick.take(/employee\s*_?name|employeeName|applicant\s*name/i);
  const position = pick.take(/position|designation/i);
  const department = pick.take(/department/i);
  const manager = pick.take(/reporting|manager/i);
  const course = pick.take(/course|program/i);
  const objective = pick.take(/objective/i);
  const provider = pick.take(/provider/i);
  const venue = pick.take(/venue|location/i);
  const start = pick.take(/start/i);
  const end = pick.take(/\bend\b|endDate/i);

  const costs = COST_LINES.map((line) => ({ label: line.label, element: pick.take(line.match) }));
  const totalQuestion = pick.take(/total/i);
  const hrdc = pick.take(/hrdc|claimable/i);
  const applicantSignature = pick.take(/applicant|request|signature/i, ["signaturepad"]);

  const schedule = courseSchedule(kit, start, end);
  const long = (cell: PaperCell): PaperCell => ({ ...cell, wide: true });

  const employee: PaperSection = {
    level: 1,
    heading: "Employee Details",
    blocks: [{
      kind: "colonTable",
      rows: [
        [long({ label: "Employee Name", text: answerText(kit, employeeName) })],
        [{ label: "Position", text: answerText(kit, position) }, { label: "Department", text: answerText(kit, department) }],
        [long({ label: "Reporting Manager", text: answerText(kit, manager) })],
      ],
    }],
  };

  const training: PaperSection = {
    level: 2,
    heading: "Training Details",
    blocks: [{
      kind: "colonTable",
      rows: [
        [long({ label: "Course Name", text: answerText(kit, course) })],
        [long({ label: "Training Objective", text: answerText(kit, objective) })],
        [long({ label: "Training Provider", text: answerText(kit, provider) })],
        [long({ label: "Venue", text: answerText(kit, venue) })],
        schedule.days
          ? [long({ label: "Date & Time", text: "", lines: schedule.days })]
          : [{ label: "Date", text: schedule.date }, { label: "Time", text: schedule.time }],
      ],
    }],
  };

  // The total is the form's own sum when it stored one, else the lines added up.
  const lineAmounts = costs.map((c) => amount(c.element ? kit.read(c.element).value : undefined));
  const anyAmount = lineAmounts.some((n) => n !== null);
  const storedTotal = amount(totalQuestion ? kit.read(totalQuestion).value : undefined);
  const total = storedTotal !== null && (storedTotal !== 0 || !anyAmount)
    ? storedTotal
    : anyAmount ? lineAmounts.reduce<number>((sum, n) => sum + (n ?? 0), 0) : null;
  const hrdcCell = cellFor(kit, hrdc, "HRDC Claimable");
  const cost: PaperSection = {
    level: 2,
    heading: "Cost",
    blocks: [{
      kind: "colonTable",
      shaded: true,
      rows: [
        ...costs.map((c, i) => [{ label: c.label, text: money(lineAmounts[i], answerText(kit, c.element)), prefix: "RM" }]),
        [{ label: "Total Cost", text: money(total), prefix: "RM" }],
        // The Word form writes YES / NO in capitals.
        [{ ...hrdcCell, options: hrdcCell.options?.map((o) => ({ ...o, label: o.label.toUpperCase() })) }],
      ],
    }],
  };

  const applicant: SignoffColumn = {
    caption: "Request by:",
    role: "Applicant",
    name: answerText(kit, employeeName) || kit.data.meta.submittedBy || "",
    position: "",
    date: signatureOf(kit, applicantSignature) ? kit.signatureDate : "",
    signature: signatureOf(kit, applicantSignature),
    rejected: false,
    remarks: "",
  };
  const layers = kit.data.layerResults ?? [];
  const steps = layers.map((layer, i) =>
    stepColumn(kit, layer, requisitionCaption(i, layers.length), roleName(layer.layerTitle || `Step ${layer.layerNumber}`)));

  const signing: PaperSection = { level: 2, heading: "", blocks: [{ kind: "signoffRow", columns: [applicant, ...steps], boxed: true }] };
  // A heading of its own, so "For reference:" never ends a page without its table.
  const reference: PaperSection = {
    level: 2,
    heading: "For reference:",
    blocks: [
      { kind: "roster", columns: REQUISITION_REFERENCE.columns, widths: [50, 25, 25], rows: REQUISITION_REFERENCE.rows.map((row) => row.map((text) => ({ text }))) },
      { kind: "note", text: REQUISITION_RETAIN_NOTE },
    ],
  };
  const stepAnswers = layers.flatMap((layer) => kit.stepAnswers(layer));
  return [employee, training, cost, ...kit.leftovers(pick.placed), ...stepAnswers, signing, reference];
}

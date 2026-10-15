/**
 * trainingAttendanceLayout.ts — The Training Attendance Form's own paper
 * layout, matching HR's Word form (Training Attendance Form.docx):
 *
 *   Program Title    : ______
 *   Trainer's Name   : ______
 *   Date & Time      : ______
 *   Training Type (✓): ☐ In-house ☐ Internal ☐ External
 *   No | Emp ID | Name | Department | Position | Company | Signature
 *   Verified by Trainer : ______    Date : ______
 *
 * One submission is one attendee, so the register prints that person's row.
 * Pure: the renderers draw exactly what this returns.
 */
import type { PaperCell, PaperKit, PaperSection } from "./paperLayout";
import { QuestionPicker, answerText, cellFor, courseSchedule, signatureOf } from "./paperFormKit";

export const ATTENDANCE_COLUMNS = ["No", "Emp ID", "Name", "Department", "Position", "Company", "Signature"];
const ATTENDANCE_WIDTHS = [6, 12, 20, 16, 16, 15, 15];

export function buildTrainingAttendanceSections(kit: PaperKit): PaperSection[] {
  const pick = new QuestionPicker(kit);
  const program = pick.take(/program|course|training\s*title/i);
  const trainer = pick.take(/trainer/i);
  const start = pick.take(/start/i);
  const end = pick.take(/\bend\b|dateTimeEnd|end\s*date/i);
  const type = pick.take(/training\s*type|trainingType/i);
  const empId = pick.take(/emp(loyee)?\s*_?id|staff\s*(no|id)/i);
  const name = pick.take(/name/i);
  const department = pick.take(/department/i);
  const position = pick.take(/position|designation/i);
  const signature = pick.take(/signature/i, ["signaturepad"]);

  const schedule = courseSchedule(kit, start, end);
  const when: PaperCell = schedule.days
    ? { label: "Date & Time", text: "", lines: schedule.days }
    : { label: "Date & Time", text: [schedule.date, schedule.time].filter(Boolean).join(", ") };
  const trainingType = { ...cellFor(kit, type, "Training Type (✓)") };

  const verifier = kit.data.layerResults?.[0];
  const verified = verifier ? kit.signOff(verifier) : null;

  const part: PaperSection = {
    level: 1,
    heading: "",
    blocks: [
      {
        kind: "lines",
        items: [
          { label: "Program Title", text: answerText(kit, program) },
          { label: "Trainer’s Name", text: answerText(kit, trainer) },
          when,
          trainingType,
        ],
      },
      {
        kind: "roster",
        columns: ATTENDANCE_COLUMNS,
        widths: ATTENDANCE_WIDTHS,
        rows: [[
          { text: "1" },
          { text: answerText(kit, empId) },
          { text: answerText(kit, name) },
          { text: answerText(kit, department) },
          { text: answerText(kit, position) },
          { text: kit.selectedCompany },
          { image: signatureOf(kit, signature) },
        ]],
      },
      {
        kind: "lines",
        items: [
          { label: "Verified by Trainer", text: verified?.name ?? "", image: verified?.signature || undefined },
          { label: "Date", text: verified?.date ?? "" },
        ],
      },
    ],
  };
  return [part, ...kit.leftovers(pick.placed)];
}

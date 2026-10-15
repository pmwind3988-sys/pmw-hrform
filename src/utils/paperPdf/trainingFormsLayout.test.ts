import { describe, expect, it } from "vitest";
import { buildPaperDocument, type PaperBlock, type PaperDocument } from "./paperLayout";
import { hasPaperApproval, hasPaperForm, paperFormVariant } from "./paperForms";
import { requisitionCaption, REQUISITION_RETAIN_NOTE } from "./trainingRequisitionLayout";
import { NEEDS_MIN_ROWS } from "./trainingNeedsAnalysisLayout";
import { ATTENDANCE_COLUMNS } from "./trainingAttendanceLayout";
import { courseTimes } from "./trainingEvaluationLayout";
import { paperApprovalLabels } from "../../components/paper/PaperApprovalSignOff";
import {
  TRAINING_ATTENDANCE_SAMPLE,
  TRAINING_NEEDS_ANALYSIS_SAMPLE,
  TRAINING_REQUISITION_SAMPLE,
} from "./trainingFormSamples";
import type { PdfFormData } from "../FormPdfDocument";

const options = (title: string) => ({
  fmtDay: (iso: string) => iso.slice(0, 10),
  fmtDateTime: (iso: string) => iso,
  control: [],
  title,
});

function build(data: PdfFormData): PaperDocument {
  return buildPaperDocument(data, options(data.meta.formTitle));
}

function blocks<K extends PaperBlock["kind"]>(doc: PaperDocument, kind: K): Extract<PaperBlock, { kind: K }>[] {
  return doc.sections.flatMap((s) => s.blocks).filter((b): b is Extract<PaperBlock, { kind: K }> => b.kind === kind);
}

describe("which forms print as their paper form", () => {
  it("is the four training forms, by title", () => {
    expect(paperFormVariant("Training Evaluation Form")).toBe("training-evaluation");
    expect(paperFormVariant("Training Attendance Form")).toBe("training-attendance");
    expect(paperFormVariant("Training Needs Analysis")).toBe("training-needs-analysis");
    expect(paperFormVariant("Training Requisition Form")).toBe("training-requisition");
    expect(hasPaperForm("Leave Application")).toBe(false);
  });

  it("signs approvals on the paper form only where the form has approval steps", () => {
    expect(hasPaperApproval("Training Needs Analysis")).toBe(true);
    expect(hasPaperApproval("Training Requisition Form")).toBe(true);
    expect(hasPaperApproval("Training Evaluation Form")).toBe(false);
    expect(hasPaperApproval("Leave Application")).toBe(false);
  });
});

describe("every paper form's header", () => {
  it("lists every published company with the chosen one ticked", () => {
    const doc = build(TRAINING_ATTENDANCE_SAMPLE);
    expect(doc.header.companies).toHaveLength(8);
    expect(doc.header.companies.filter((c) => c.selected).map((c) => c.label)).toEqual(["PMW INDUSTRIES SDN BHD"]);
    expect(doc.header.formTitle).toBe("TRAINING ATTENDANCE FORM");
  });
});

describe("Training Attendance Form", () => {
  const doc = build(TRAINING_ATTENDANCE_SAMPLE);

  it("prints the programme lines in the Word form's order and wording", () => {
    const [top] = blocks(doc, "lines");
    expect(top.items.map((i) => i.label)).toEqual(["Program Title", "Trainer’s Name", "Date & Time", "Training Type (✓)"]);
    expect(top.items[0].text).toBe("Working Safely at Height");
    expect(top.items[2].text).toBe("12/10/2026, 9:00 AM – 5:00 PM");
    expect(top.items[3].options?.map((o) => o.label)).toEqual(["In House", "Internal", "External"]);
    expect(top.items[3].selected).toEqual(["Internal"]);
  });

  it("writes the attendee into row 1 of the register, company and signature included", () => {
    const [register] = blocks(doc, "roster");
    expect(register.columns).toEqual(ATTENDANCE_COLUMNS);
    expect(register.rows).toHaveLength(1);
    const row = register.rows[0];
    expect(row.slice(0, 6).map((c) => c.text)).toEqual(["1", "PMW0417", "Nur Aisyah binti Rahman", "Production", "Line Supervisor", "PMW INDUSTRIES SDN BHD"]);
    expect(row[6].image).toMatch(/^data:image\//);
  });

  it("leaves Verified by Trainer blank while no step verifies it", () => {
    const verify = blocks(doc, "lines")[1];
    expect(verify.items.map((i) => [i.label, i.text])).toEqual([["Verified by Trainer", ""], ["Date", ""]]);
  });

  it("prints a course on several days one line per day", () => {
    const multi = build({ ...TRAINING_ATTENDANCE_SAMPLE, responseData: { ...TRAINING_ATTENDANCE_SAMPLE.responseData, dateTimeEnd: "2026-10-13T17:00" } });
    expect(blocks(multi, "lines")[0].items[2].lines).toEqual(["Day 1: 12/10/2026, 9:00 AM – 5:00 PM", "Day 2: 13/10/2026, 9:00 AM – 5:00 PM"]);
  });

  it("does not drop a question the Word form has no box for", () => {
    const data: PdfFormData = {
      ...TRAINING_ATTENDANCE_SAMPLE,
      surveyJson: { pages: [{ name: "page1", elements: [...((TRAINING_ATTENDANCE_SAMPLE.surveyJson.pages ?? [])[0].elements as Record<string, unknown>[]), { type: "text", name: "vehicle", title: "Vehicle Plate" }] }] },
      responseData: { ...TRAINING_ATTENDANCE_SAMPLE.responseData, vehicle: "WXY 1234" },
    };
    const cells = blocks(build(data), "grid").flatMap((g) => g.cells);
    expect(cells).toContainEqual(expect.objectContaining({ label: "Vehicle Plate", text: "WXY 1234" }));
  });
});

describe("Training Needs Analysis", () => {
  const doc = build(TRAINING_NEEDS_ANALYSIS_SAMPLE);

  it("heads the table with DEPARTMENT and YEAR", () => {
    const [grid] = blocks(doc, "grid");
    expect(grid.rows?.[0].map((c) => [c.label, c.text])).toEqual([["DEPARTMENT", "Quality Assurance"], ["YEAR", "2026"]]);
  });

  it("prints the matrix under the Word form's columns, with Low/Medium/High boxes ticked", () => {
    const [table] = blocks(doc, "roster");
    expect(table.columns).toEqual(["No", "Emp. ID", "Name", "Training Needs", "Current Skill Level", "Required Skill Level", "Priority", "Please state relevancy to job function", "Tentative Date"]);
    expect(table.rows).toHaveLength(NEEDS_MIN_ROWS);
    const first = table.rows[0];
    expect(first.slice(0, 4).map((c) => c.text)).toEqual(["1", "PMW0211", "Tan Mei Ling", "ISO 9001 internal auditing"]);
    expect(first[4]).toMatchObject({ selected: ["Low"] });
    expect(first[5]).toMatchObject({ selected: ["High"] });
    expect(first[4].options?.map((o) => o.label)).toEqual(["Low", "Medium", "High"]);
    // The Word form's five rows stay, blank boxes and all.
    expect(table.rows[4][4]).toMatchObject({ selected: [] });
    expect(table.widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100);
  });

  it("signs Prepared by HOD and Approved by GHRH side by side", () => {
    const [row] = blocks(doc, "signoffRow");
    expect(row.columns.map((c) => c.caption)).toEqual(["Prepared by HOD:", "Approved by GHRH:"]);
    expect(row.columns[0]).toMatchObject({ name: "Hassan bin Idris", positionLabel: "Designation", date: "2026-11-03" });
    expect(row.columns[0].signature).toMatch(/^data:image\//);
    expect(row.columns[1]).toMatchObject({ name: "Wong Chiew Yee", position: "Group Human Resources Head", date: "2026-11-05" });
  });

  it("still prints the approver's column, empty, before anyone approves", () => {
    const [row] = blocks(build({ ...TRAINING_NEEDS_ANALYSIS_SAMPLE, layerResults: [] }), "signoffRow");
    expect(row.columns[1]).toMatchObject({ caption: "Approved by GHRH:", name: "", signature: "", date: "" });
  });

  it("reads matrix rows kept in the child list", () => {
    const { dynamicMatrix, ...rest } = TRAINING_NEEDS_ANALYSIS_SAMPLE.responseData as Record<string, unknown>;
    const [table] = blocks(build({ ...TRAINING_NEEDS_ANALYSIS_SAMPLE, responseData: { ...rest, dynamicMatrix_childRows: { rows: dynamicMatrix } } }), "roster");
    expect(table.rows[1][2].text).toBe("Ravi Kumar");
  });
});

describe("Training Requisition Form", () => {
  const doc = build(TRAINING_REQUISITION_SAMPLE);

  it("keeps the Word form's three panels and their lines", () => {
    expect(doc.sections.map((s) => s.heading).filter(Boolean)).toEqual(["Employee Details", "Training Details", "Cost", "For reference:"]);
    const [employee, training] = blocks(doc, "colonTable");
    expect(employee.rows.map((r) => r.map((c) => c.label))).toEqual([["Employee Name"], ["Position", "Department"], ["Reporting Manager"]]);
    expect(training.rows.map((r) => r.map((c) => c.label))).toEqual([["Course Name"], ["Training Objective"], ["Training Provider"], ["Venue"], ["Date & Time"]]);
    expect(training.rows[4][0].lines).toHaveLength(3);
  });

  it("prints Date and Time apart for a one-day course", () => {
    const oneDay = build({ ...TRAINING_REQUISITION_SAMPLE, responseData: { ...TRAINING_REQUISITION_SAMPLE.responseData, endDateTime: "2026-11-16T17:00" } });
    const training = blocks(oneDay, "colonTable")[1];
    expect(training.rows[4].map((c) => [c.label, c.text])).toEqual([["Date", "16/11/2026"], ["Time", "9:00 AM – 5:00 PM"]]);
  });

  it("prints every cost in RM, the total, and HRDC as YES / NO", () => {
    const cost = blocks(doc, "colonTable")[2];
    expect(cost.shaded).toBe(true);
    expect(cost.rows.map((r) => [r[0].label, r[0].prefix ?? "", r[0].text])).toEqual([
      ["Training Fee", "RM", "4,800.00"],
      ["Mileage/Transportation Fees", "RM", "320.00"],
      ["Meals Allowance X days of training", "RM", "150.00"],
      ["Accommodation", "RM", "0.00"],
      ["Other cost (Toll/Parking)", "RM", "45.50"],
      ["Total Cost", "RM", "5,315.50"],
      ["HRDC Claimable", "", ""],
    ]);
    expect(cost.rows[6][0].options?.map((o) => o.label)).toEqual(["YES", "NO"]);
    expect(cost.rows[6][0].selected).toEqual(["true"]);
  });

  it("adds the costs up when the form stored no total", () => {
    const noTotal = build({ ...TRAINING_REQUISITION_SAMPLE, responseData: { ...TRAINING_REQUISITION_SAMPLE.responseData, totalCost: 0 } });
    expect(blocks(noTotal, "colonTable")[2].rows[5][0].text).toBe("5,315.50");
  });

  it("signs the applicant and each step of the branch, captioned by where it falls", () => {
    const [row] = blocks(doc, "signoffRow");
    expect(row.boxed).toBe(true);
    expect(row.columns.map((c) => [c.caption, c.role])).toEqual([
      ["Request by:", "Applicant"],
      ["Recommend by:", "Head of Department"],
      ["Approve by:", "Group Human Resource Head"],
    ]);
    expect(row.columns[1]).toMatchObject({ name: "Goh Kok Leong", date: "2026-10-21" });
    expect(row.columns[2]).toMatchObject({ name: "", signature: "" });
  });

  it("keeps the reference table and the retain note", () => {
    const tables = blocks(doc, "roster");
    expect(tables[tables.length - 1].columns).toEqual(["Subject", "Recommender", "Approver"]);
    expect(blocks(doc, "note").map((n) => n.text)).toContain(REQUISITION_RETAIN_NOTE);
    expect(doc.sections.map((s) => s.heading)).toContain("For reference:");
  });

  it("captions a managerial request's middle step as Recommend/Approve", () => {
    expect([0, 1, 2].map((i) => requisitionCaption(i, 3))).toEqual(["Recommend by:", "Recommend/Approve by:", "Approve by:"]);
    expect([0, 1].map((i) => requisitionCaption(i, 2))).toEqual(["Recommend by:", "Approve by:"]);
  });
});

describe("the approver's paper sign-off", () => {
  it("is captioned and labelled as the form prints that step", () => {
    expect(paperApprovalLabels("Training Requisition Form", 2, 3, "Group Human Resource Head"))
      .toEqual({ caption: "Recommend/Approve by:", role: "Group Human Resource Head" });
    expect(paperApprovalLabels("Training Requisition Form", 1, 2, "HOD"))
      .toEqual({ caption: "Recommend by:", role: "Head of Department" });
    expect(paperApprovalLabels("Training Needs Analysis", 1, 1, "Group Human Resources Head"))
      .toEqual({ caption: "Approved by GHRH:", role: "", positionLabel: "Designation" });
  });
});

describe("course times", () => {
  it("reads stored and printed dates alike", () => {
    expect(courseTimes("2026-11-16T09:00", "2026-11-18T17:30")).toEqual({ date: "16/11/2026 – 18/11/2026", time: "9:00 AM – 5:30 PM" });
    expect(courseTimes("16/11/2026 09:00 AM", "")).toEqual({ date: "16/11/2026", time: "9:00 AM" });
    expect(courseTimes("soon", "later")).toBeNull();
  });
});

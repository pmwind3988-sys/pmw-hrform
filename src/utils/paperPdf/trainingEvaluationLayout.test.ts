import { describe, expect, it } from "vitest";
import { buildPaperDocument, type PaperBlock, type PaperCell } from "./paperLayout";
import {
  CONTENTS_ITEMS,
  HOD_COMMENTS_LABEL,
  HOD_STATEMENT,
  arrangeGrid,
  dailySchedule,
  isTrainingEvaluationForm,
  ratingLegend,
} from "./trainingEvaluationLayout";
import type { PdfFormData } from "../FormPdfDocument";
import { TRAINING_EVALUATION_SAMPLE } from "./trainingEvaluationSample";

const OPTIONS = {
  fmtDay: (iso: string) => iso.slice(0, 10),
  fmtDateTime: (iso: string) => iso,
  control: [{ label: "Document Number:", value: "PMW-HR-TEF-01" }],
  title: "Training Evaluation Form",
};

const AGREE = ["Disagree", "Neutral", "Agree", "Strongly Agree"];

/** The form as it is published: start and end dates, word-labelled ratings, two asked one at a time. */
function liveShapedForm(answers: Record<string, unknown>): PdfFormData {
  const radio = (name: string, title: string, choices = AGREE) => ({ type: "radiogroup", name, title, choices });
  return {
    ...TRAINING_EVALUATION_SAMPLE,
    layerResults: [],
    surveyJson: {
      pages: [{
        name: "page1",
        elements: [
          {
            type: "panel", name: "employee", title: "Employee Details", elements: [
              { type: "text", name: "employeeName", title: "Employee Name" },
              { type: "text", name: "employeeId", title: "Employee ID" },
              { type: "text", name: "position", title: "Position" },
              { type: "text", name: "department", title: "Department" },
              { type: "text", name: "trainingTitle", title: "Training Title" },
              { type: "text", inputType: "datetime-local", name: "start", title: "Start Date & Time" },
              { type: "text", inputType: "datetime-local", name: "end", title: "End Date & Time" },
              { type: "comment", name: "objective", title: "Training Objective" },
              { type: "radiogroup", name: "trainingType", title: "Training Type", choices: ["In-House", "External"] },
            ],
          },
          {
            type: "panel", name: "contents", title: "Contents of the course", elements: [
              radio("room", "Training room and facilities:"),
              radio("time", "Time allocated:", ["Disagree", "Neutral", "Agree", "Strong Agree"]),
              radio("assess", "Assessment methods"),
              radio("questions", "Opportunities to ask questions and seek clarifications"),
              radio("interaction", "Training encouraged interaction and engagement"),
              radio("overall", "Overall Rating", ["Excellent", "Good", "Fair", "Poor"]),
            ],
          },
        ],
      }],
    },
    responseData: {
      employeeName: "Test", employeeId: "T1", position: "Clerk", department: "HR", trainingTitle: "Workshop",
      start: "2026-10-12T09:00", end: "2026-10-12T17:00", objective: "Short aim", trainingType: "In-House",
      room: "Neutral", time: "Strong Agree", assess: "Neutral", interaction: "Strongly Agree", overall: "Excellent",
      ...answers,
    },
  };
}

function blocksOf(data: PdfFormData): PaperBlock[] {
  return buildPaperDocument(data, OPTIONS).sections.flatMap((s) => s.blocks);
}

function employeeRows(data: PdfFormData): string[][] {
  const grid = blocksOf(data).find((b): b is Extract<PaperBlock, { kind: "grid" }> => b.kind === "grid");
  return (grid?.rows ?? []).map((row) => row.map((c) => c.label));
}

describe("which forms get the Training Evaluation layout", () => {
  it("is the Training Evaluation Form only", () => {
    expect(isTrainingEvaluationForm("Training Evaluation Form")).toBe(true);
    expect(isTrainingEvaluationForm("TRAINING EVALUATION FORM")).toBe(true);
    expect(isTrainingEvaluationForm("Training Needs Analysis")).toBe(false);
    expect(buildPaperDocument(TRAINING_EVALUATION_SAMPLE, { ...OPTIONS, title: "Leave Application" }).variant).toBeUndefined();
    expect(buildPaperDocument(TRAINING_EVALUATION_SAMPLE, OPTIONS).variant).toBe("training-evaluation");
  });
});

describe("Training Evaluation employee table", () => {
  it("keeps a short objective beside End Date, with Training Type across the bottom", () => {
    expect(employeeRows(liveShapedForm({}))).toEqual([
      ["Employee Name", "Employee ID"],
      ["Position", "Department"],
      ["Training Title", "Start Date & Time"],
      ["Training Objective", "End Date & Time"],
      ["Training Type"],
    ]);
  });

  it("moves Training Type beside End Date when the objective is long, and gives the objective its own row", () => {
    const long = "Understand the audit cycle end to end and apply it at the plant";
    expect(employeeRows(liveShapedForm({ objective: long }))).toEqual([
      ["Employee Name", "Employee ID"],
      ["Position", "Department"],
      ["Training Title", "Start Date & Time"],
      ["Training Type", "End Date & Time"],
      ["Training Objective"],
    ]);
  });

  it("prints a multi-day course one day per line in place of Start and End", () => {
    const data = liveShapedForm({ start: "2026-10-12T09:00", end: "2026-10-13T17:00" });
    expect(employeeRows(data)).toEqual([
      ["Employee Name", "Employee ID"],
      ["Position", "Department"],
      ["Training Title", "Training Date & Time"],
      ["Training Objective", "Training Type"],
    ]);
    const grid = blocksOf(data).find((b): b is Extract<PaperBlock, { kind: "grid" }> => b.kind === "grid");
    expect(grid?.rows?.[2][1].lines).toEqual([
      "Day 1: 12/10/2026, 9:00 AM – 5:00 PM",
      "Day 2: 13/10/2026, 9:00 AM – 5:00 PM",
    ]);
  });

  it("drops the panel's lettered heading above the table", () => {
    const doc = buildPaperDocument(liveShapedForm({}), OPTIONS);
    expect(doc.sections.map((s) => s.heading).filter(Boolean)).toEqual(["PART I – To be filled by the submitter"]);
  });
});

describe("daily schedules", () => {
  it("reads a span of days with a later finish as the same hours each day", () => {
    expect(dailySchedule("11/10/2026 10:00 AM", "13/10/2026 05:00 PM")).toEqual([
      "Day 1: 11/10/2026, 10:00 AM – 5:00 PM",
      "Day 2: 12/10/2026, 10:00 AM – 5:00 PM",
      "Day 3: 13/10/2026, 10:00 AM – 5:00 PM",
    ]);
  });

  it("treats a finish earlier in the day as one overnight session, and a single day as no schedule", () => {
    expect(dailySchedule("22/06/2026 06:00 PM", "23/06/2026 02:00 AM")).toBeNull();
    expect(dailySchedule("2026-10-12T09:00", "2026-10-12T17:00")).toBeNull();
    expect(dailySchedule("", "2026-10-12T17:00")).toBeNull();
  });
});

describe("Training Evaluation rating tables", () => {
  it("joins ratings asked one at a time into a numbered table, worded as the Word form", () => {
    const tables = blocksOf(liveShapedForm({})).filter((b): b is Extract<PaperBlock, { kind: "ticks" }> => b.kind === "ticks");
    expect(tables).toHaveLength(1);
    const [table] = tables;
    expect(table).toMatchObject({ title: "Contents of the course", numbered: true, banner: true });
    expect(table.rows.map((r) => r.label)).toEqual(CONTENTS_ITEMS);
    expect(table.rows.map((r) => r.number)).toEqual([1, 2, 3, 4, 5]);
    // "Strong Agree" on its own question is the table's fourth column.
    expect(table.rows.map((r) => r.selected)).toEqual([["Neutral"], ["Strongly Agree"], ["Neutral"], [], ["Strongly Agree"]]);
  });

  it("explains the columns above the first table, and leaves Overall Rating on its own line", () => {
    const all = blocksOf(liveShapedForm({}));
    const legend = all.find((b) => b.kind === "note");
    expect(legend).toEqual({ kind: "note", text: ratingLegend(AGREE.map((l) => ({ value: l, label: l }))) });
    expect(all.find((b) => b.kind === "choiceLine")).toMatchObject({ label: "Overall Rating" });
  });

  it("does not repeat a legend the form already prints", () => {
    const notes = blocksOf(TRAINING_EVALUATION_SAMPLE).filter((b) => b.kind === "note");
    expect(notes).toHaveLength(1);
  });
});

describe("Training Evaluation Part II", () => {
  const doc = buildPaperDocument(TRAINING_EVALUATION_SAMPLE, OPTIONS);
  const part2 = doc.sections.findIndex((s) => s.layer);

  it("starts the HOD's part on a new page under the Word form's heading", () => {
    expect(doc.sections[part2]).toMatchObject({
      newPage: true,
      heading: "PART II – To be filled by the Immediate Superior/ HOD 3 months after the training date",
    });
  });

  it("uses the Word form's comment label and sign-off statement", () => {
    const blocks = doc.sections.slice(part2).flatMap((s) => s.blocks);
    expect(blocks.find((b) => b.kind === "ticks")).toMatchObject({ title: "Performance Indication:" });
    expect(blocks.find((b) => b.kind === "long")).toMatchObject({ label: HOD_COMMENTS_LABEL });
    expect(blocks.find((b) => b.kind === "signoff")).toMatchObject({ statement: HOD_STATEMENT, name: "Siti Aminah", large: true });
  });

  it("rules the submitter's comment only as far as its text runs", () => {
    const comment = doc.sections.filter((s) => !s.layer).flatMap((s) => s.blocks).find((b) => b.kind === "long");
    expect(comment).toMatchObject({ lines: 1 });
  });

  it("prints the date the HOD wrote on the sign-off rather than the day it was recorded", () => {
    const written = buildPaperDocument({
      ...TRAINING_EVALUATION_SAMPLE,
      layerResults: [{ ...TRAINING_EVALUATION_SAMPLE.layerResults![0], signOffDate: "04/01/2027" }],
    }, OPTIONS);
    expect(written.sections.flatMap((s) => s.blocks).find((b) => b.kind === "signoff")).toMatchObject({ date: "04/01/2027" });
  });

  it("prints the employee's signature large", () => {
    expect(doc.sections.flatMap((s) => s.blocks).find((b) => b.kind === "signature")).toMatchObject({ large: true });
  });
});

describe("arrangeGrid", () => {
  const cell = (label: string, wide = false): PaperCell => ({ label, text: "", wide });

  it("pairs cells two to a row and spans a lone last cell", () => {
    expect(arrangeGrid([cell("a"), cell("b"), cell("c")]).map((r) => r.map((c) => c.label))).toEqual([["a", "b"], ["c"]]);
  });

  it("holds a wide cell until the row after it is complete", () => {
    expect(arrangeGrid([cell("a"), cell("w", true), cell("b"), cell("c")]).map((r) => r.map((c) => c.label)))
      .toEqual([["a", "b"], ["w"], ["c"]]);
  });
});

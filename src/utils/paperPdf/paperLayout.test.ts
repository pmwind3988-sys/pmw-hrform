import { describe, expect, it } from "vitest";
import { buildPaperDocument, htmlToPlainText, optionsFor, paperCompanies, selectedOptions, type PaperBlock } from "./paperLayout";
import type { PdfFormData } from "../FormPdfDocument";
import { TRAINING_EVALUATION_SAMPLE } from "./trainingEvaluationSample";

const OPTIONS = {
  fmtDay: (iso: string) => iso.slice(0, 10),
  fmtDateTime: (iso: string) => iso,
  control: [{ label: "Document Number:", value: "HR-F-012" }],
  // Any form but the Training Evaluation Form, which has a layout of its own
  // (trainingEvaluationLayout.test.ts); this suite covers the general one.
  title: "Course Feedback Form",
};

function blocks(data: PdfFormData): PaperBlock[] {
  return buildPaperDocument(data, OPTIONS).sections.flatMap((s) => s.blocks);
}

describe("paper form layout", () => {
  const doc = buildPaperDocument(TRAINING_EVALUATION_SAMPLE, OPTIONS);

  it("prints the ISO header with the form title and the chosen company ticked", () => {
    expect(doc.header.formTitle).toBe("COURSE FEEDBACK FORM");
    expect(doc.header.documentTitle).toBe("ISO 9001, ISO 14001 & ISO 45001");
    expect(doc.header.companies.filter((c) => c.selected).map((c) => c.label)).toEqual(["PMW CONCRETE INDUSTRIES SDN BHD"]);
  });

  it("numbers the form's pages and each workflow step as PARTs", () => {
    const parts = doc.sections.filter((s) => s.level === 1).map((s) => s.heading);
    expect(parts).toEqual([
      "PART I – To be filled by the participant",
      "PART II – Immediate Superior/HOD evaluation (3 months after training)",
    ]);
  });

  it("puts the participant details in the label/value grid, short pickers as tick boxes", () => {
    const grid = doc.sections[0].blocks[0];
    expect(grid.kind).toBe("grid");
    if (grid.kind !== "grid") return;
    expect(grid.cells.map((c) => c.label)).toEqual([
      "Employee Name", "Employee ID", "Position", "Department", "Training Title", "Date & Duration", "Training Objective", "Training Type",
    ]);
    const type = grid.cells[7];
    expect(type.options?.map((o) => o.label)).toEqual(["In-house", "External"]);
    expect(type.selected).toEqual(["external"]);
  });

  it("groups same-scale ratings into a tick table titled by its panel, numbered across tables", () => {
    const tables = blocks(TRAINING_EVALUATION_SAMPLE).filter((b): b is Extract<PaperBlock, { kind: "ticks" }> => b.kind === "ticks");
    expect(tables.map((t) => t.title)).toEqual(["A. Contents of the course", "B. Effectiveness of the training", "A. Performance Indication"]);
    expect(tables[0].options.map((o) => o.label)).toEqual(["1", "2", "3", "4"]);
    expect(tables[0].rows.map((r) => r.number)).toEqual([1, 2, 3, 4, 5]);
    expect(tables[1].rows.map((r) => r.number)).toEqual([6, 7, 8, 9]);
    expect(tables[0].rows[0].selected).toEqual(["4"]);
    // A new PART starts numbering again.
    expect(tables[2].rows[0].number).toBe(1);
    expect(tables[2].options.map((o) => o.label)).toEqual(["Yes", "No"]);
  });

  it("prints a lone long-option question on its own line", () => {
    const line = blocks(TRAINING_EVALUATION_SAMPLE).find((b) => b.kind === "choiceLine");
    expect(line).toMatchObject({ label: "Overall rating of the Training Program", selected: ["Good"] });
  });

  it("writes the submitter's signature with the submission date, and a sign-off per step", () => {
    const all = blocks(TRAINING_EVALUATION_SAMPLE);
    expect(all.find((b) => b.kind === "signature")).toMatchObject({ label: "Employee Signature", date: "2026-10-01" });
    const signoff = all.find((b) => b.kind === "signoff");
    expect(signoff).toMatchObject({ name: "Siti Aminah", position: "Head of Department", date: "2027-01-05", rejected: false });
  });

  it("keeps unanswered questions as empty boxes, but drops blank conditional ones", () => {
    const data: PdfFormData = {
      ...TRAINING_EVALUATION_SAMPLE,
      responseData: {},
      layerResults: [],
      surveyJson: { pages: [{ name: "page1", elements: [
        { type: "text", name: "a", title: "Always asked" },
        { type: "text", name: "b", title: "Only sometimes", visibleIf: "{a} = 'x'" },
      ] }] },
    };
    const grid = blocks(data)[0];
    expect(grid.kind === "grid" && grid.cells.map((c) => [c.label, c.text])).toEqual([["Always asked", ""]]);
  });

  it("leaves an undecided step's sign-off lines blank", () => {
    const data: PdfFormData = {
      ...TRAINING_EVALUATION_SAMPLE,
      layerResults: [{ layerNumber: 1, type: "approval", status: "Pending", email: "boss@example.com", layerTitle: "Checking By" }],
    };
    const signoff = blocks(data).find((b) => b.kind === "signoff");
    expect(signoff).toMatchObject({ statement: "Checking By: to be completed", name: "", date: "" });
  });
});

describe("paper form company list", () => {
  const PUBLISHED = "PMW INDUSTRIES SDN BHD\nPMW CONCRETE INDUSTRIES SDN BHD\nPMW LIGHTING INDUSTRIES SDN BHD\nWINABUMI SDN BHD";

  it("lists every published company and ticks the chosen one, even without a company question", () => {
    expect(paperCompanies(PUBLISHED, [], "WINABUMI SDN BHD")).toEqual([
      { label: "PMW INDUSTRIES SDN BHD", selected: false },
      { label: "PMW CONCRETE INDUSTRIES SDN BHD", selected: false },
      { label: "PMW LIGHTING INDUSTRIES SDN BHD", selected: false },
      { label: "WINABUMI SDN BHD", selected: true },
    ]);
  });

  it("lists them all with nothing ticked when no company was chosen", () => {
    expect(paperCompanies(PUBLISHED, [], "").filter((c) => c.selected)).toEqual([]);
    expect(paperCompanies(PUBLISHED, [], "")).toHaveLength(4);
  });

  it("merges the question's choices without repeats, matching a stored value to its label", () => {
    const companies = paperCompanies(PUBLISHED, [{ value: "pci", label: "PMW Concrete Industries Sdn Bhd" }], "pci");
    expect(companies).toHaveLength(4);
    expect(companies.find((c) => c.selected)?.label).toBe("PMW CONCRETE INDUSTRIES SDN BHD");
  });

  it("falls back to the house list, and keeps a chosen company that is on no list", () => {
    const companies = paperCompanies(undefined, [], "NEW SUBSIDIARY SDN BHD");
    expect(companies.map((c) => c.label)).toContain("PMW INDUSTRIES SDN BHD");
    expect(companies[companies.length - 1]).toEqual({ label: "NEW SUBSIDIARY SDN BHD", selected: true });
  });
});

describe("paper form helpers", () => {
  it("reads a rating scale from its range when no values are listed", () => {
    expect(optionsFor({ type: "rating", rateMin: 1, rateMax: 4 })?.map((o) => o.value)).toEqual(["1", "2", "3", "4"]);
  });

  it("matches answers by value, by label, and Yes/No against a boolean", () => {
    const yesNo = optionsFor({ type: "boolean" }) ?? [];
    expect(selectedOptions("Yes", yesNo)).toEqual(["true"]);
    expect(selectedOptions(false, yesNo)).toEqual(["false"]);
    const opts = [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }];
    expect(selectedOptions('["b","Alpha"]', opts)).toEqual(["a", "b"]);
    expect(selectedOptions(3, [{ value: "3", label: "3" }])).toEqual(["3"]);
  });

  it("turns authored HTML into plain lines", () => {
    expect(htmlToPlainText("<p>Rate 1 &ndash; 4</p><p>1 = <b>Disagree</b>&nbsp;</p>")).toBe("Rate 1 – 4\n1 = Disagree");
  });
});

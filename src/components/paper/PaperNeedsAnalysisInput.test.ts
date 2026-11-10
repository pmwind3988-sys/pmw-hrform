import { describe, expect, it } from "vitest";
import { parseForm } from "../../native/schema";
import { compactNeedsAnswers, needsAnalysisQuestions, requirePreparedDesignation, unfinishedNeedsRows } from "./PaperNeedsAnalysisInput";

const form = () =>
  parseForm({
    title: "Training Needs Analysis",
    pages: [{
      name: "page1",
      elements: [
        { type: "radiogroup", name: "company", title: "Company", choices: ["A", "B"] },
        { type: "dropdown", name: "department", title: "Department", choices: ["QA"] },
        { type: "matrixdynamic", name: "dynamicMatrix", title: "Dynamic Matrix", columns: [{ name: "Name" }, { name: "Priority", cellType: "dropdown", choices: ["Low", "High"] }] },
        { type: "signaturepad", name: "Signature", title: "Prepared By HOD" },
        { type: "text", name: "PreparedByName", title: "Name" },
        { type: "text", name: "PreparedByDesignation", title: "Designation" },
        { type: "comment", name: "notes", title: "Notes" },
      ],
    }],
  });

describe("paper Training Needs Analysis", () => {
  it("places each question where the Word form asks it", () => {
    const q = needsAnalysisQuestions(form());
    expect(q.company?.name).toBe("company");
    expect(q.department?.name).toBe("department");
    expect(q.table?.name).toBe("dynamicMatrix");
    expect(q.signature?.name).toBe("Signature");
    expect(q.name?.name).toBe("PreparedByName");
    expect(q.designation?.name).toBe("PreparedByDesignation");
    expect(q.others.map((el) => el.name)).toEqual(["notes"]);
  });

  it("makes the preparer's designation a must", () => {
    const parsed = requirePreparedDesignation(form());
    expect(needsAnalysisQuestions(parsed).designation?.required).toBe(true);
  });

  it("submits only the rows somebody wrote in", () => {
    const values = { dynamicMatrix: [{}, { Name: "Ravi", Priority: "High" }, { Name: " " }], department: "QA" };
    expect(compactNeedsAnswers(form(), values)).toEqual({ dynamicMatrix: [{ Name: "Ravi", Priority: "High" }], department: "QA" });
  });

  const people = () =>
    parseForm({
      title: "Training Needs Analysis",
      pages: [{
        name: "page1",
        elements: [{
          type: "matrixdynamic",
          name: "rows",
          columns: [{ name: "Employee_ID" }, { name: "Name" }, { name: "Traning_Needs", cellType: "text" }, { name: "Tentative_Date", cellType: "date" }, { name: "Tentative_Days", cellType: "number" }],
        }],
      }],
    });

  it("submits a row's people line for line, without the blank lines, and its training on one line", () => {
    const values = { rows: [{ Employee_ID: "A1\n\nA2\n", Name: "Tan \n\nRavi\n", Traning_Needs: "ISO 9001\nauditing " }] };
    expect(compactNeedsAnswers(people(), values)).toEqual({ rows: [{ Employee_ID: "A1\nA2", Name: "Tan\nRavi", Traning_Needs: "ISO 9001 auditing" }] });
  });

  it("saves a row with more people than SharePoint's text column holds as two rows of the same training", () => {
    const names = Array.from({ length: 12 }, (_, i) => `Muhammad Hafizuddin bin Abdul ${i}`);
    const ids = names.map((_, i) => `PMW${i}`);
    const out = compactNeedsAnswers(people(), { rows: [{ Employee_ID: ids.join("\n"), Name: names.join("\n"), Traning_Needs: "First aid" }] }).rows as Record<string, string>[];
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((row) => row.Traning_Needs === "First aid" && row.Name.length <= 255)).toBe(true);
    expect(out.map((row) => row.Name).join("\n")).toBe(names.join("\n"));
    expect(out.map((row) => row.Employee_ID).join("\n")).toBe(ids.join("\n"));
  });

  it("stops Submit on a date without days, or an ID with no name among several people", () => {
    expect(unfinishedNeedsRows(people(), { rows: [{ Name: "Tan", Tentative_Date: "2027-02-15", Tentative_Days: 2 }] })).toEqual([]);
    expect(unfinishedNeedsRows(people(), { rows: [{ Name: "Tan", Tentative_Date: "2027-02-15" }] })).toEqual([1]);
    expect(unfinishedNeedsRows(people(), { rows: [{ Name: "Tan" }, { Employee_ID: "A1\nA2", Name: "Tan" }] })).toEqual([2]);
    // One person with no ID was always allowed.
    expect(unfinishedNeedsRows(people(), { rows: [{ Name: "Tan" }] })).toEqual([]);
  });
});

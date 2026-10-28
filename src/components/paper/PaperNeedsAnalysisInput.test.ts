import { describe, expect, it } from "vitest";
import { parseForm } from "../../native/schema";
import { compactNeedsAnswers, needsAnalysisQuestions, requirePreparedDesignation } from "./PaperNeedsAnalysisInput";

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
});

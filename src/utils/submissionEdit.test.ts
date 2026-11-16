import { describe, expect, it } from "vitest";
import { answersFromItem, changedAnswerNames, editLinkPath, editRefusal, formQuestions, parseEditTarget } from "./submissionEdit";

const survey = {
  pages: [{
    elements: [
      { type: "radiogroup", name: "company", visible: false },
      { type: "dropdown", name: "department" },
      { type: "matrixdynamic", name: "dynamicMatrix", columns: [{ name: "Full_Name" }, { name: "Tentative_Date", cellType: "date" }] },
      { type: "signaturepad", name: "Signature" },
      { type: "panel", name: "p1", elements: [{ type: "text", name: "Start", inputType: "date" }] },
      { type: "html", name: "note" },
    ],
  }],
};

const item = {
  id: "5",
  SubmittedBy: "Ramesh@pmw-group.com",
  FormStatus: "Submitted",
  L1_Status: "Pending",
  L1_SignedAt: null,
  L2_Status: "",
  company: "PMW CONCRETE INDUSTRIES SDN BHD",
  department: "OSHE",
  dynamicMatrix_Json: JSON.stringify([{ Full_Name: "Zaim", Priority: "Low" }, { Full_Name: "Ali" }]),
  dynamicMatrix_RowIds: "[18,19]",
  Signature: { Url: "https://example.sharepoint.com/sig.png", Description: "Signature" },
  Start: "2027-02-14T16:00:00Z",
};

describe("parseEditTarget", () => {
  it("accepts a positive item id only", () => {
    expect(parseEditTarget("5")).toBe(5);
    expect(parseEditTarget(" 12 ")).toBe(12);
    for (const bad of [null, "", "0", "-3", "5a", "1.5", "9999999999"]) expect(parseEditTarget(bad)).toBeNull();
  });
});

describe("editRefusal", () => {
  it("lets the submitter change a submission nobody has acted on", () => {
    expect(editRefusal(item, "ramesh@PMW-group.com")).toBe("");
  });

  it("refuses someone else, a signed-out viewer, a decided step and a closed submission", () => {
    expect(editRefusal(item, "")).toBe("sign-in");
    expect(editRefusal(item, "grace@pmw-group.com")).toBe("not-yours");
    expect(editRefusal({ ...item, L1_Status: "Approved" }, "ramesh@pmw-group.com")).toBe("decided");
    expect(editRefusal({ ...item, L1_Status: "Rejected" }, "ramesh@pmw-group.com")).toBe("decided");
    expect(editRefusal({ ...item, L1_SignedAt: "2026-11-17T01:00:00Z" }, "ramesh@pmw-group.com")).toBe("decided");
    expect(editRefusal({ ...item, FormStatus: "Completed" }, "ramesh@pmw-group.com")).toBe("closed");
  });

  it("does not count a parked or waiting step as decided", () => {
    expect(editRefusal({ ...item, L1_Status: "Needs Routing", L2_Status: "Waiting" }, "ramesh@pmw-group.com")).toBe("");
  });
});

describe("formQuestions", () => {
  it("lists answerable questions, panels opened, layout left out", () => {
    expect(formQuestions(survey).map((q) => q.name)).toEqual(["company", "department", "dynamicMatrix", "Signature", "Start"]);
  });
});

describe("answersFromItem", () => {
  it("fills every saved answer back in the form's own shape", () => {
    expect(answersFromItem(survey, item)).toEqual({
      company: "PMW CONCRETE INDUSTRIES SDN BHD",
      department: "OSHE",
      dynamicMatrix: [{ Full_Name: "Zaim", Priority: "Low" }, { Full_Name: "Ali" }],
      Signature: "https://example.sharepoint.com/sig.png",
      Start: "2027-02-15",
    });
  });

  it("reads the table from its child rows when there is no full copy", () => {
    const rows = [{ Full_Name: "Zaim", Tentative_Date: "2027-03-01" }];
    expect(answersFromItem(survey, { ...item, dynamicMatrix_Json: null }, { dynamicMatrix: rows }).dynamicMatrix).toEqual(rows);
  });
});

describe("changedAnswerNames", () => {
  it("names only answers that differ, and never one the form dropped", () => {
    const before = answersFromItem(survey, item);
    const after = { ...before, dynamicMatrix: [{ Full_Name: "Zaim", Priority: "Low", Tentative_Date: "2027-02-15", Tentative_Days: 2 }, { Full_Name: "Ali" }] };
    delete (after as Record<string, unknown>).company;
    expect([...changedAnswerNames(before, after)]).toEqual(["dynamicMatrix"]);
  });
});

describe("editLinkPath", () => {
  it("builds the form address with the item and version", () => {
    expect(editLinkPath("training-needs-analysis", 5, "1.1")).toBe("/form/training-needs-analysis?edit=5&version=1.1");
  });
});

import { describe, expect, it } from "vitest";
import { createElementAnswerReader, responseKeyForQuestion } from "../formSubmissionLayout";

describe("reading an answer stored under a column name SharePoint cut short", () => {
  // SharePoint caps a column's internal name at 32 characters.
  const LONG = "opportunitiesToAskQuestionsAndSeekClarifications";
  const STORED = LONG.slice(0, 32);

  it("finds the answer under the cut-off key", () => {
    const row = { [STORED]: "Agree", q1: "Neutral" };
    const read = createElementAnswerReader(row);
    expect(read({ type: "radiogroup", name: LONG }).value).toBe("Agree");
    expect(responseKeyForQuestion(row, LONG)).toBe(STORED);
  });

  it("still prefers an exact match, and never treats a short key as a cut-off one", () => {
    const row = { q1: "Neutral", q10: "Agree" };
    const read = createElementAnswerReader(row);
    expect(read({ type: "radiogroup", name: "q10" }).value).toBe("Agree");
    expect(read({ type: "radiogroup", name: "q100" }).value).toBeUndefined();
  });

  it("matches a cut-off key that SharePoint encoded", () => {
    const row = { "OData_trainingRoomAndFacilitiesWereAde": "Neutral" };
    const read = createElementAnswerReader(row);
    expect(read({ type: "radiogroup", name: "trainingRoomAndFacilitiesWereAdequateAndComfortable" }).value).toBe("Neutral");
  });
});

describe("reading a table whose rows never reached the child list", () => {
  const table = { type: "matrixdynamic", name: "dynamicMatrix", columns: [{ name: "Name" }, { name: "Tentative_Date", cellType: "date" }] };

  it("reads every row from the copy kept on the response item", () => {
    const read = createElementAnswerReader({ dynamicMatrix_Json: JSON.stringify([{ Name: "Tan", Tentative_Date: "2027-02-15" }, { Name: "Lim" }]) });
    expect(read(table).matrixRows).toEqual([{ Name: "Tan", Tentative_Date: "2027-02-15" }, { Name: "Lim" }]);
  });

  it("fills a child row's missing date from that copy", () => {
    const read = createElementAnswerReader({
      dynamicMatrix_childRows: { rows: [{ RowIndex: 0, Name: "Tan" }] },
      dynamicMatrix_Json: JSON.stringify([{ Name: "Tan", Tentative_Date: "2027-02-15" }]),
    });
    expect(read(table).matrixRows).toEqual([{ RowIndex: 0, Name: "Tan", Tentative_Date: "2027-02-15" }]);
  });
});

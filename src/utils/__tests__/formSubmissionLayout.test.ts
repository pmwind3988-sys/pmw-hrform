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

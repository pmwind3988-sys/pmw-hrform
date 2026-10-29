import { describe, it, expect } from "vitest";

import { evaluationQuestionNames, questionsMatchingAnswers } from "./evaluationQuestionMatch";

// The two copies of the Training Evaluation's evaluator step: the separate
// training link's, and the main link's, which name the same questions differently.
const linkCopy = [
  { type: "boolean", name: "Objective_Met" },
  { type: "boolean", name: "Required_Skills_Improved" },
  { type: "comment", name: "Immediate_Superior_HOD_Comments" },
];
const mainCopy = [
  { type: "boolean", name: "objectiveMet" },
  { type: "boolean", name: "requiredSkillsImproved" },
  { type: "comment", name: "superiorHodComments" },
];

describe("questionsMatchingAnswers", () => {
  it("prints the main link's questions for answers saved against them", () => {
    const answers = { objectiveMet: true, requiredSkillsImproved: true, superiorHodComments: "Improved." };
    expect(questionsMatchingAnswers([linkCopy, mainCopy], answers)).toEqual(mainCopy);
  });

  it("keeps the submission's own copy when the answers match it", () => {
    const answers = { Objective_Met: true, Immediate_Superior_HOD_Comments: "Improved." };
    expect(questionsMatchingAnswers([linkCopy, mainCopy], answers)).toEqual(linkCopy);
  });

  it("keeps the submission's own copy when nothing has been answered yet", () => {
    expect(questionsMatchingAnswers([linkCopy, mainCopy], {})).toEqual(linkCopy);
    expect(questionsMatchingAnswers([linkCopy, mainCopy], undefined)).toEqual(linkCopy);
  });

  it("skips a copy that has no questions for the step", () => {
    expect(questionsMatchingAnswers([undefined, [], mainCopy], { Objective_Met: true })).toEqual(mainCopy);
    expect(questionsMatchingAnswers([undefined, []], { Objective_Met: true })).toBeUndefined();
  });
});

describe("evaluationQuestionNames", () => {
  it("finds questions inside panels", () => {
    const names = evaluationQuestionNames([
      { type: "panel", name: "performance", elements: [{ type: "boolean", name: "p1" }] },
      { type: "comment", name: "hodComments" },
    ]);
    expect([...names].sort()).toEqual(["hodComments", "p1", "performance"]);
  });
});

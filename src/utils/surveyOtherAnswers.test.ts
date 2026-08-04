import { describe, it, expect } from "vitest";
import { Model } from "survey-core";
import { foldOtherAnswers } from "./surveyOtherAnswers";
import { buildSurveyJson } from "./FormBuilderEngine";

describe("foldOtherAnswers", () => {
  it("replaces a single-select 'other' with what the respondent typed", () => {
    const data = { Hazard: "other", "Hazard-Comment": "Loose floor tile" };
    expect(foldOtherAnswers(data)).toEqual({ Hazard: "Loose floor tile" });
  });

  it("replaces 'other' inside a checkbox array and keeps the listed choices", () => {
    const data = {
      Ppe: ["Helmet", "other", "Gloves"],
      "Ppe-Comment": "Face shield",
    };
    expect(foldOtherAnswers(data)).toEqual({
      Ppe: ["Helmet", "Face shield", "Gloves"],
    });
  });

  it("leaves a showCommentArea note alone when the answer is a real choice", () => {
    const data = { Hazard: "Slip", "Hazard-Comment": "Near the loading bay" };
    expect(foldOtherAnswers(data)).toEqual({
      Hazard: "Slip",
      "Hazard-Comment": "Near the loading bay",
    });
  });

  it("drops an empty other comment rather than writing whitespace", () => {
    const data = { Hazard: "other", "Hazard-Comment": "   " };
    expect(foldOtherAnswers(data)).toEqual({ Hazard: "other" });
  });

  it("ignores a comment key with no matching question", () => {
    const data = { "Orphan-Comment": "stray" };
    expect(foldOtherAnswers(data)).toEqual({ "Orphan-Comment": "stray" });
  });

  it("leaves ordinary submissions untouched", () => {
    const data = { Hazard: "Slip", Ppe: ["Helmet"], Count: 3, Signed: true };
    expect(foldOtherAnswers(data)).toEqual({
      Hazard: "Slip",
      Ppe: ["Helmet"],
      Count: 3,
      Signed: true,
    });
  });

  it("survives the whole chain: builder toggle to submitted answer", () => {
    const json = buildSurveyJson([
      {
        _id: "1",
        type: "dropdown",
        name: "Hazard",
        title: "Hazard",
        choices: ["Slip", "Fire"],
        hasOther: true,
        otherText: "Something else — I'll type it",
      },
      {
        _id: "2",
        type: "checkbox",
        name: "Ppe",
        title: "PPE",
        choices: ["Helmet", "Gloves"],
        hasOther: true,
      },
      { _id: "3", type: "dropdown", name: "Plain", title: "Plain", choices: ["A", "B"] },
    ] as never);

    const elements = (json.pages as never as { elements: Record<string, unknown>[] }[])[0].elements;
    expect(elements[0].hasOther).toBe(true);
    expect(elements[0].otherText).toBe("Something else — I'll type it");
    // A field nobody opted in stays exactly as it was.
    expect(elements[2].hasOther).toBeUndefined();

    const survey = new Model(json as object);
    const hazard = survey.getQuestionByName("Hazard");
    expect(hazard.showOtherItem).toBe(true);
    expect(hazard.otherText).toBe("Something else — I'll type it");
    hazard.value = hazard.otherItem.value;
    hazard.comment = "Loose floor tile";

    const ppe = survey.getQuestionByName("Ppe");
    expect(ppe.otherText).toBe("Other (describe)");
    ppe.value = ["Helmet", ppe.otherItem.value];
    ppe.comment = "Face shield";

    survey.setValue("Plain", "A");

    expect(foldOtherAnswers(survey.data)).toEqual({
      Hazard: "Loose floor tile",
      Ppe: ["Helmet", "Face shield"],
      Plain: "A",
    });
  });

  it("folds several questions in one pass", () => {
    const data = {
      Hazard: "other",
      "Hazard-Comment": "Loose tile",
      Ppe: ["other"],
      "Ppe-Comment": "Face shield",
      Area: "Warehouse",
    };
    expect(foldOtherAnswers(data)).toEqual({
      Hazard: "Loose tile",
      Ppe: ["Face shield"],
      Area: "Warehouse",
    });
  });
});

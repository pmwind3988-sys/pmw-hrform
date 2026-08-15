import { describe, it, expect } from "vitest";
import { foldOtherAnswers } from "./surveyOtherAnswers";
import { buildSurveyJson } from "./FormBuilderEngine";
import { parseForm } from "../native/schema";

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
    // The renderer half of this chain used to be driven through a real SurveyJS
    // model. The native engine draws these forms now, and its `collect()` lives
    // inside a hook that this suite cannot render — there is no jsdom and no
    // React test renderer here. So the chain is checked in two pieces: the
    // published JSON reaches the engine carrying the "other" option (below),
    // and the value bag `collect()` emits for that state folds correctly.
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

    const form = parseForm(json);
    const hazard = form.byName.get("Hazard");
    expect(hazard?.hasOther).toBe(true);
    expect(hazard?.otherText).toBe("Something else — I'll type it");

    const ppe = form.byName.get("Ppe");
    expect(ppe?.hasOther).toBe(true);
    expect(ppe?.otherText).toBe("Other (describe)");

    // A field nobody opted in offers no "other" row to pick.
    expect(form.byName.get("Plain")?.hasOther).toBe(false);

    // What `collect()` produces once both "other" rows are chosen and typed
    // into: the question holds the literal "other", the typed text travels
    // beside it under `{name}-Comment`.
    const submitted = {
      Hazard: "other",
      "Hazard-Comment": "Loose floor tile",
      Ppe: ["Helmet", "other"],
      "Ppe-Comment": "Face shield",
      Plain: "A",
    };

    expect(foldOtherAnswers(submitted)).toEqual({
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

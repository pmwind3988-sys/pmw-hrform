import { describe, expect, it } from "vitest";

import type { SurveyJson } from "../types";
import { createSharePointColumnKeyResolver, surveyQuestionColumnSpecs } from "./formBuilderSP";

describe("formBuilderSP column key resolver", () => {
  it("maps long display names to SharePoint REST entity property names", () => {
    const resolveColumnKey = createSharePointColumnKeyResolver([
      {
        Title: "questionsOpportunitiesSeekClarifications",
        InternalName: "questionsOpportunitiesSeekClari",
        StaticName: "questionsOpportunitiesSeekClari",
        EntityPropertyName: "questionsOpportunitiesSeekClari",
      },
    ]);

    expect(resolveColumnKey("questionsOpportunitiesSeekClarifications")).toBe(
      "questionsOpportunitiesSeekClari",
    );
    expect(resolveColumnKey("questionsOpportunitiesSeekClari")).toBe(
      "questionsOpportunitiesSeekClari",
    );
  });
});

describe("surveyQuestionColumnSpecs", () => {
  // The shape of a regenerated F1 stage form: a fixed-row table, a repeating
  // table and a hidden question the filing page fills in.
  const STAGE_FORM = {
    title: "F1 Drilling",
    pages: [{
      name: "p1",
      elements: [
        { type: "text", name: "submittedByName", visible: false },
        {
          type: "matrixdropdown",
          name: "holes",
          rows: [{ value: "a", text: "A" }, { value: "b", text: "B" }],
          columns: [{ name: "actual", title: "ACTUAL", cellType: "text" }],
        },
        {
          type: "matrixdynamic",
          name: "cutting",
          columns: [{ name: "length", title: "LENGTH", cellType: "text" }],
        },
      ],
    }],
  } as unknown as SurveyJson;

  it("files a fixed-row table as <name>_Json and <name>_Response, like a repeating one", async () => {
    const { columns, matrixFields } = await surveyQuestionColumnSpecs("t", STAGE_FORM, () => {});
    const names = columns.map((c) => c.n);
    expect(names).toEqual(expect.arrayContaining(["holes_Json", "holes_Response", "cutting_Json", "cutting_Response"]));
    expect(columns.find((c) => c.n === "holes_Json")).toMatchObject({ k: 3, ml: true });
    expect(columns.find((c) => c.n === "holes_Response")).toMatchObject({ k: 3, ml: true, rt: true });
    // Its answer is one object, never a list of rows, so it has no child list.
    expect(matrixFields.map((m) => m.name)).toEqual(["cutting"]);
    // Nor a plain column under its own name, which nothing ever writes.
    expect(names).not.toContain("holes");
  });

  it("still gives a hidden question its column", async () => {
    const { columns } = await surveyQuestionColumnSpecs("t", STAGE_FORM, () => {});
    expect(columns.find((c) => c.n === "submittedByName")).toMatchObject({ k: 2 });
  });
});

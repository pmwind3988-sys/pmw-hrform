import { describe, expect, it } from "vitest";
import { getMultiChoiceFieldNames } from "./multiChoiceFields";

function survey(...elements: Record<string, unknown>[]) {
  return { pages: [{ elements }] };
}

describe("getMultiChoiceFieldNames", () => {
  /**
   * The case this exists for. A checkbox group is provisioned as
   * `SP.FieldMultiChoice` (FieldTypeKind 15), and SharePoint rejects a
   * JSON-stringified array for that column with "A 'StartArray' node was
   * expected" — which failed the whole submission.
   */
  it("finds a checkbox group", () => {
    const names = getMultiChoiceFieldNames(
      survey({ type: "checkbox", name: "checkboxGroup", choices: ["Option 1", "Option 2"] }),
    );
    expect([...names]).toEqual(["checkboxGroup"]);
  });

  /**
   * Single-select controls are Choice (kind 6), not MultiChoice. Their answer
   * is a bare string and must not be touched.
   */
  it("ignores single-select controls", () => {
    const names = getMultiChoiceFieldNames(
      survey(
        { type: "radiogroup", name: "radioGroup", choices: ["a", "b"] },
        { type: "dropdown", name: "dropdown", choices: ["a", "b"] },
      ),
    );
    expect(names.size).toBe(0);
  });

  /**
   * Matrices are provisioned as `_Json` / `_Response` columns rather than a
   * bare column, so `getSpColumnKind` returns null for them. They are handled
   * earlier in the submit path and must not be pulled in here.
   */
  it("ignores matrix and table fields", () => {
    const names = getMultiChoiceFieldNames(
      survey(
        { type: "dynamicmatrix", name: "matrix", columns: [] },
        { type: "tableinput", name: "table", columns: [] },
      ),
    );
    expect(names.size).toBe(0);
  });

  it("finds fields nested inside panels", () => {
    const names = getMultiChoiceFieldNames(
      survey({
        type: "panel",
        name: "panel1",
        elements: [{ type: "checkbox", name: "nestedBoxes", choices: ["x"] }],
      }),
    );
    expect([...names]).toEqual(["nestedBoxes"]);
  });

  it("reads every page, not just the first", () => {
    const names = getMultiChoiceFieldNames({
      pages: [
        { elements: [{ type: "text", name: "a" }] },
        { elements: [{ type: "checkbox", name: "b", choices: ["x"] }] },
      ],
    });
    expect([...names]).toEqual(["b"]);
  });

  /** The builder hands the survey down wrapped, the same as `getTabularFields`. */
  it("accepts a wrapped { surveyJson } shape", () => {
    const names = getMultiChoiceFieldNames({
      surveyJson: survey({ type: "checkbox", name: "wrapped", choices: ["x"] }),
    });
    expect([...names]).toEqual(["wrapped"]);
  });

  /**
   * Fails closed: an unreadable definition yields no names, so every array
   * keeps the old JSON-string behaviour rather than being sent raw to a column
   * that cannot take it.
   */
  it("returns nothing for junk input", () => {
    expect(getMultiChoiceFieldNames(null).size).toBe(0);
    expect(getMultiChoiceFieldNames(undefined).size).toBe(0);
    expect(getMultiChoiceFieldNames("nonsense").size).toBe(0);
    expect(getMultiChoiceFieldNames({ pages: "not-an-array" }).size).toBe(0);
  });

  it("skips elements with no name", () => {
    expect(getMultiChoiceFieldNames(survey({ type: "checkbox", choices: ["x"] })).size).toBe(0);
  });
});

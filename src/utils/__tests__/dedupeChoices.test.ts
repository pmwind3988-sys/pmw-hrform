import { describe, expect, it } from "vitest";
import { mergeChoices } from "../dedupeChoices";

describe("mergeChoices", () => {
  it("offers the configured names first, then any used name it does not cover", () => {
    expect(mergeChoices(["Sales"], ["Finance"])).toEqual(["Finance", "Sales"]);
  });

  it("keeps a used name the configured list has dropped", () => {
    // A person filed under a department admin/org no longer lists must not
    // vanish from the picker just by having their row opened.
    expect(mergeChoices(["Legacy Dept"], [])).toEqual(["Legacy Dept"]);
  });

  it("treats names that differ only by spacing as one department", () => {
    // The reported bug: "Production(F1)" typed onto a person's row sat in the
    // dropdown beside the org list's "Production (F1)" as if two departments.
    expect(mergeChoices(["Production(F1)"], ["Production (F1)"]))
      .toEqual(["Production (F1)"]);
  });

  it("keeps the configured spelling when a used name only differs by spacing", () => {
    // Whichever source names it first wins, and the org list is offered first,
    // so the properly spaced name that matches its F2/F3/F4 siblings survives.
    expect(mergeChoices(["Production(F1)", "QA/QC"], ["Production (F1)", "Sales"]))
      .toEqual(["Production (F1)", "QA/QC", "Sales"]);
  });

  it("still tells genuinely different departments apart", () => {
    expect(mergeChoices([], ["Production (F1)", "Production (F2)"]))
      .toEqual(["Production (F1)", "Production (F2)"]);
  });

  it("is case-insensitive and drops blanks", () => {
    expect(mergeChoices(["  ", "finance"], ["Finance"])).toEqual(["Finance"]);
  });
});

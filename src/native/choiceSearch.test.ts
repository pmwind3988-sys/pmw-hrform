import { describe, expect, it } from "vitest";
import { filterChoices, nextActiveIndex, shouldSearchChoices, SEARCHABLE_FROM } from "./choiceSearch";

const option = (text: string, value = text) => ({ text, value });

const DEPARTMENTS = [
  option("Admin (WB) (Perak)"),
  option("CEO Office"),
  option("Production(F1)"),
  option("Production (F2)"),
  option("QA/QC"),
  option("Sales (Shah Alam)"),
  option("Stockyard"),
];

const COMPANIES = [
  option("BORNEO POLE SDN BHD"),
  option("PMW LIGHTING SDN BHD"),
  option("PMW LIGHTING INDUSTRIES SDN BHD"),
  option("PMW CONCRETE INDUSTRIES SDN BHD"),
];

describe("shouldSearchChoices", () => {
  it("leaves a short list as a native select", () => {
    // Below the line, scanning beats typing, and the OS picker on a phone
    // beats anything hand-built.
    expect(shouldSearchChoices(2)).toBe(false);
    expect(shouldSearchChoices(SEARCHABLE_FROM)).toBe(false);
  });

  it("searches a long one", () => {
    expect(shouldSearchChoices(SEARCHABLE_FROM + 1)).toBe(true);
    expect(shouldSearchChoices(24)).toBe(true);
  });

  it("searches both org lists, which are what people actually hunt through", () => {
    // Ten companies and twenty-four departments. A threshold of ten would have
    // left the companies as the one list you could not type into.
    expect(shouldSearchChoices(10)).toBe(true);
    expect(shouldSearchChoices(24)).toBe(true);
  });

  it("leaves an ordinary short question alone", () => {
    for (const count of [2, 3, 4, 5]) expect(shouldSearchChoices(count)).toBe(false);
  });
});

describe("filterChoices", () => {
  it("shows everything for an empty query", () => {
    expect(filterChoices(DEPARTMENTS, "")).toHaveLength(DEPARTMENTS.length);
    expect(filterChoices(DEPARTMENTS, "   ")).toHaveLength(DEPARTMENTS.length);
  });

  it("ignores case", () => {
    expect(filterChoices(DEPARTMENTS, "stockyard").map((o) => o.text)).toEqual(["Stockyard"]);
    expect(filterChoices(DEPARTMENTS, "STOCKYARD").map((o) => o.text)).toEqual(["Stockyard"]);
  });

  it("matches part of a word", () => {
    expect(filterChoices(DEPARTMENTS, "stock").map((o) => o.text)).toEqual(["Stockyard"]);
  });

  it("ignores the punctuation a list built over years is inconsistent about", () => {
    expect(filterChoices(DEPARTMENTS, "qaqc").map((o) => o.text)).toEqual(["QA/QC"]);
    expect(filterChoices(DEPARTMENTS, "qa qc").map((o) => o.text)).toEqual(["QA/QC"]);
    // Production(F1) and Production (F2) differ only by a space in the source.
    expect(filterChoices(DEPARTMENTS, "production f1").map((o) => o.text)).toEqual(["Production(F1)"]);
  });

  it("matches words in any order, which is how half-remembered names get typed", () => {
    expect(filterChoices(COMPANIES, "pmw lighting")).toHaveLength(2);
    expect(filterChoices(COMPANIES, "lighting pmw")).toHaveLength(2);
  });

  it("narrows as more words are given", () => {
    expect(filterChoices(COMPANIES, "lighting industries").map((o) => o.text))
      .toEqual(["PMW LIGHTING INDUSTRIES SDN BHD"]);
  });

  it("keeps the order it was given, which is already A to Z", () => {
    expect(filterChoices(DEPARTMENTS, "production").map((o) => o.text))
      .toEqual(["Production(F1)", "Production (F2)"]);
  });

  it("searches the stored code as well as the label", () => {
    // A code renamed apart from its label is still what somebody wrote down.
    const options = [{ text: "Head Office", value: "PMWHQ" }];
    expect(filterChoices(options, "pmwhq")).toHaveLength(1);
  });

  it("finds nothing rather than everything when nothing matches", () => {
    expect(filterChoices(DEPARTMENTS, "zzz")).toEqual([]);
  });
});

describe("nextActiveIndex", () => {
  it("starts at the top going down and the bottom going up", () => {
    expect(nextActiveIndex(-1, 1, 5)).toBe(0);
    expect(nextActiveIndex(-1, -1, 5)).toBe(4);
  });

  it("moves one at a time", () => {
    expect(nextActiveIndex(2, 1, 5)).toBe(3);
    expect(nextActiveIndex(2, -1, 5)).toBe(1);
  });

  it("stops at the ends rather than wrapping", () => {
    // Reappearing at the other end is indistinguishable from losing your place.
    expect(nextActiveIndex(4, 1, 5)).toBe(4);
    expect(nextActiveIndex(0, -1, 5)).toBe(0);
  });

  it("has nowhere to go in an empty list", () => {
    expect(nextActiveIndex(0, 1, 0)).toBe(-1);
  });
});

import { describe, expect, it } from "vitest";
import { isEmptyNeedsRow, removeNeedsRow, shownNeedsRowCount, trimNeedsRows, writeNeedsCell } from "./needsAnalysisRows";

describe("Training Needs Analysis rows", () => {
  it("treats blank text and empty lists as an empty row", () => {
    expect(isEmptyNeedsRow({})).toBe(true);
    expect(isEmptyNeedsRow({ Name: "  ", Priority: [] })).toBe(true);
    expect(isEmptyNeedsRow({ Name: "Ravi" })).toBe(false);
  });

  it("keeps a row's number when a later row is written first", () => {
    expect(writeNeedsCell([], 2, "Name", "Ravi")).toEqual([{}, {}, { Name: "Ravi" }]);
  });

  it("drops trailing rows that are cleared, so untouched paper rows never submit", () => {
    const rows = writeNeedsCell([{ Name: "Tan" }, { Name: "Ravi" }], 1, "Name", "");
    expect(rows).toEqual([{ Name: "Tan" }]);
    expect(trimNeedsRows([{}, {}])).toEqual([]);
  });

  it("moves the rows below up when one is removed", () => {
    expect(removeNeedsRow([{ Name: "A" }, { Name: "B" }, { Name: "C" }], 0)).toEqual([{ Name: "B" }, { Name: "C" }]);
  });

  it("draws at least the paper's rows and no more than the form allows", () => {
    expect(shownNeedsRowCount(2, 0, 5, 10)).toBe(5);
    expect(shownNeedsRowCount(2, 7, 5, 10)).toBe(7);
    expect(shownNeedsRowCount(2, 12, 5, 10)).toBe(10);
    expect(shownNeedsRowCount(0, 0, 5, 3)).toBe(3);
    expect(shownNeedsRowCount(6, 0, 5, 0)).toBe(6);
  });
});

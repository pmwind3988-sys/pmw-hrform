import { describe, it, expect } from "vitest";
import { applyPresetRows, hasPresetRows, presetRowCount } from "./presetRows";
import type { NativeColumn } from "./schema";

function column(name: string, presetValues: string[] = []): NativeColumn {
  return { name, title: name, cellType: "text", choices: [], presetValues };
}

const POLES = ["7.5m-10-1.1kN", "7.5m-14-2.0kN", "9.0m-14-2.0kN"];

describe("preset rows", () => {
  it("leaves a table without presets alone", () => {
    const columns = [column("poleType"), column("serialNo")];
    expect(hasPresetRows(columns)).toBe(false);
    expect(presetRowCount(columns)).toBe(0);
    expect(applyPresetRows(columns, [{ serialNo: "A1" }])).toEqual([{ serialNo: "A1" }]);
  });

  it("opens the table with one row per preset value", () => {
    const columns = [column("poleType", POLES), column("serialNo")];
    expect(hasPresetRows(columns)).toBe(true);
    expect(presetRowCount(columns)).toBe(3);
    expect(applyPresetRows(columns, undefined)).toEqual([
      { poleType: "7.5m-10-1.1kN" },
      { poleType: "7.5m-14-2.0kN" },
      { poleType: "9.0m-14-2.0kN" },
    ]);
  });

  it("keeps what was already typed beside the preset", () => {
    const columns = [column("poleType", POLES), column("serialNo")];
    expect(applyPresetRows(columns, [{ poleType: "7.5m-10-1.1kN", serialNo: "A1" }])).toEqual([
      { poleType: "7.5m-10-1.1kN", serialNo: "A1" },
      { poleType: "7.5m-14-2.0kN" },
      { poleType: "9.0m-14-2.0kN" },
    ]);
  });

  it("rewrites a preset cell the author has since corrected", () => {
    const columns = [column("poleType", ["9.0m-14-2.0kN"])];
    expect(applyPresetRows(columns, [{ poleType: "typo", serialNo: "A1" }])).toEqual([
      { poleType: "9.0m-14-2.0kN", serialNo: "A1" },
    ]);
  });

  it("sizes the table to the longest preset list and blanks the shorter one", () => {
    const columns = [column("poleType", POLES), column("batch", ["B1"])];
    expect(presetRowCount(columns)).toBe(3);
    expect(applyPresetRows(columns, undefined)).toEqual([
      { poleType: "7.5m-10-1.1kN", batch: "B1" },
      { poleType: "7.5m-14-2.0kN" },
      { poleType: "9.0m-14-2.0kN" },
    ]);
  });

  it("drops rows past the end of a shortened preset list", () => {
    const columns = [column("poleType", ["7.5m-10-1.1kN"]), column("serialNo")];
    expect(applyPresetRows(columns, [{ poleType: "a", serialNo: "A1" }, { poleType: "b", serialNo: "A2" }])).toEqual([
      { poleType: "7.5m-10-1.1kN", serialNo: "A1" },
    ]);
  });
});

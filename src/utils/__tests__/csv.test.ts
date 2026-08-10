import { describe, it, expect } from "vitest";
import { csvCell, csvRow } from "../csv";

describe("csvCell", () => {
  it("quotes plain values", () => {
    expect(csvCell("Ali")).toBe('"Ali"');
    expect(csvCell(42)).toBe('"42"');
  });

  it("doubles embedded quotes so the row does not break", () => {
    // The bug this replaces emitted `"He said "yes""`, which any parser reads
    // as three malformed fields.
    expect(csvCell('He said "yes"')).toBe('"He said ""yes"""');
  });

  it("keeps commas and newlines inside one field", () => {
    expect(csvCell("Engineering, Safety")).toBe('"Engineering, Safety"');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("emits nothing for blanks rather than the string 'undefined'", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("serialises objects instead of yielding [object Object]", () => {
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });

  it("preserves a leading zero that Excel would otherwise eat", () => {
    expect(csvCell("007")).toBe('"007"');
  });
});

describe("csvRow", () => {
  it("joins cells with commas", () => {
    expect(csvRow(["a", "b"])).toBe('"a","b"');
  });

  it("keeps column count stable when a value contains a comma", () => {
    const row = csvRow(["Ali", "Engineering, Safety", null]);
    expect(row).toBe('"Ali","Engineering, Safety",');
    // Three fields, two separators outside quotes.
    expect(row.split('","').length).toBe(2);
  });
});

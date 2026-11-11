import { describe, expect, it } from "vitest";
import { defaultNeedsYear, isNeedsYear, needsYearChoices } from "./needsYear";

describe("Training Needs Analysis year", () => {
  it("plans next year from October on, this year before", () => {
    expect(defaultNeedsYear(new Date(2026, 10, 11))).toBe(2027);
    expect(defaultNeedsYear(new Date(2026, 9, 1))).toBe(2027);
    expect(defaultNeedsYear(new Date(2026, 8, 30))).toBe(2026);
    expect(defaultNeedsYear(new Date(2027, 0, 5))).toBe(2027);
  });

  it("tells a year from a test run's sample text", () => {
    expect(isNeedsYear("2027")).toBe(true);
    expect(isNeedsYear(2027)).toBe(true);
    expect(isNeedsYear("Test answer — Year")).toBe(false);
    expect(isNeedsYear("")).toBe(false);
    expect(isNeedsYear(undefined)).toBe(false);
  });

  it("offers this year and the two after, keeping a year already chosen", () => {
    expect(needsYearChoices(new Date(2026, 10, 11))).toEqual([2026, 2027, 2028]);
    expect(needsYearChoices(new Date(2026, 10, 11), "2025")).toEqual([2025, 2026, 2027, 2028]);
    expect(needsYearChoices(new Date(2026, 10, 11), "next year")).toEqual([2026, 2027, 2028]);
  });
});

import { describe, expect, it } from "vitest";
import { NEEDS_YEAR, needsYearAnswer } from "./needsYear";

describe("Training Needs Analysis year", () => {
  it("is one fixed year, stored as the Year question's type wants it", () => {
    expect(needsYearAnswer("text")).toBe(String(NEEDS_YEAR));
    expect(needsYearAnswer()).toBe(String(NEEDS_YEAR));
    expect(needsYearAnswer("number")).toBe(NEEDS_YEAR);
  });
});

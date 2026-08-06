import { describe, expect, it } from "vitest";
import { careerPortalAccessValue, parseCareerPortalAccessValue } from "./careerPortalAccess";

describe("parseCareerPortalAccessValue", () => {
  it("treats the stored closed values as internal-only", () => {
    expect(parseCareerPortalAccessValue("internal")).toBe(false);
    expect(parseCareerPortalAccessValue("private")).toBe(false);
    expect(parseCareerPortalAccessValue("false")).toBe(false);
    expect(parseCareerPortalAccessValue(" INTERNAL ")).toBe(false);
  });

  it("treats the stored open value as public", () => {
    expect(parseCareerPortalAccessValue("public")).toBe(true);
    expect(parseCareerPortalAccessValue("Public")).toBe(true);
  });

  it("keeps the portal public for a blank or unrecognised value", () => {
    // Pre-dates the setting, or was written by something that did not know it.
    expect(parseCareerPortalAccessValue("")).toBe(true);
    expect(parseCareerPortalAccessValue(null)).toBe(true);
    expect(parseCareerPortalAccessValue(undefined)).toBe(true);
    expect(parseCareerPortalAccessValue("whatever")).toBe(true);
  });

  it("round-trips what it writes", () => {
    expect(parseCareerPortalAccessValue(careerPortalAccessValue(true))).toBe(true);
    expect(parseCareerPortalAccessValue(careerPortalAccessValue(false))).toBe(false);
  });
});

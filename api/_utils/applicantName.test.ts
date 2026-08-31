import { describe, expect, it } from "vitest";
import { resolveApplicantName } from "./applicantName.js";

describe("resolveApplicantName", () => {
  it("reads the name the form collected", () => {
    expect(resolveApplicantName({ FullName: "Nur Aisyah", SubmittedBy: "hr.admin@example.com" }))
      .toBe("Nur Aisyah");
  });

  it("reads a SharePoint-encoded column name", () => {
    expect(resolveApplicantName({ Employee_x0020_Name: "Daniel Tan" })).toBe("Daniel Tan");
  });

  it("unwraps a person or lookup field", () => {
    expect(resolveApplicantName({ ApplicantName: { Title: "Mei Ling" } })).toBe("Mei Ling");
  });

  it("ignores an address sitting in a name field", () => {
    expect(resolveApplicantName({ Name: "mei@example.com" })).toBe("");
  });

  it("ignores the placeholders a public submission leaves behind", () => {
    expect(resolveApplicantName({ Name: "Public respondent" })).toBe("");
    expect(resolveApplicantName({ RequesterName: "N/A" })).toBe("");
  });

  it("says nothing rather than guessing when the form has no name field", () => {
    expect(resolveApplicantName({ Department: "People", SubmittedBy: "ahmad@example.com" })).toBe("");
    expect(resolveApplicantName(undefined)).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import {
  isPublicSubmitter,
  linkFieldsFor,
  matchPublicSubmissionToPerson,
  namesAlike,
  type LinkableRow,
} from "./publicSubmissionLink.js";

const mapping = { nameField: "FullName", employeeIdField: "StaffNo", emailField: "Email" };

const ali: LinkableRow = { personEmail: "ali@pmw-group.com", personName: "Ali bin Abu", employeeId: "PC 069" };
const siti: LinkableRow = { personEmail: "", personName: "Siti Aminah binti Abdul Rahman", employeeId: "PC 070" };
const rows = [ali, siti];

describe("namesAlike", () => {
  it("accepts a shortened or reordered spelling of the same name", () => {
    expect(namesAlike("Siti Aminah", "Siti Aminah binti Abdul Rahman")).toBe(true);
    expect(namesAlike("Dr. Ali", "Ali bin Abu")).toBe(true);
    expect(namesAlike("Abdul Rahman Siti Aminah", "Siti Aminah binti Abdul Rahman")).toBe(true);
  });
  it("rejects a different person", () => {
    expect(namesAlike("Siti Nurhaliza", "Siti Aminah")).toBe(false);
    expect(namesAlike("", "Ali")).toBe(false);
  });
});

describe("matchPublicSubmissionToPerson", () => {
  it("links by staff number, ignoring case and spaces", () => {
    const link = matchPublicSubmissionToPerson(rows, { FullName: "Ali", StaffNo: "pc069" }, mapping);
    expect(link?.row).toBe(ali);
    expect(link?.method).toBe("staff-number");
  });

  it("trusts the staff number for a row with an email when no name was given", () => {
    expect(matchPublicSubmissionToPerson(rows, { StaffNo: "PC069" }, mapping)?.row).toBe(ali);
  });

  it("trusts a listed staff number even when the name given differs", () => {
    expect(matchPublicSubmissionToPerson(rows, { FullName: "Kumar a/l Raju", StaffNo: "PC069" }, mapping)?.row).toBe(ali);
  });

  it("links a person without an email only when staff number AND name agree", () => {
    const partial = matchPublicSubmissionToPerson(rows, { FullName: "Siti Aminah", StaffNo: "PC070" }, mapping);
    expect(partial?.row).toBe(siti);
    expect(matchPublicSubmissionToPerson(rows, { StaffNo: "PC070" }, mapping)).toBeUndefined();
    expect(matchPublicSubmissionToPerson(rows, { FullName: "Ali bin Abu", StaffNo: "PC070" }, mapping)).toBeUndefined();
  });

  it("does not fall back to name when the staff number is listed but unconfirmed", () => {
    expect(matchPublicSubmissionToPerson(rows, { FullName: "Ali bin Abu", StaffNo: "PC070" }, mapping)).toBeUndefined();
  });

  it("links by a listed email", () => {
    const link = matchPublicSubmissionToPerson(rows, { Email: "Ali@PMW-group.com" }, mapping);
    expect(link?.row).toBe(ali);
    expect(link?.method).toBe("email");
  });

  it("links by a name only one row with an email has", () => {
    const link = matchPublicSubmissionToPerson(rows, { FullName: "Ali bin Abu Bakar" }, mapping);
    expect(link?.row).toBe(ali);
    expect(link?.method).toBe("name");
  });

  it("never links a name to a row that has no email", () => {
    expect(matchPublicSubmissionToPerson(rows, { FullName: "Siti Aminah binti Abdul Rahman" }, mapping)).toBeUndefined();
  });

  it("does not guess between two people with the same name", () => {
    const twin = { ...ali, personEmail: "ali2@pmw-group.com", employeeId: "PC 099" };
    expect(matchPublicSubmissionToPerson([ali, twin], { FullName: "Ali bin Abu" }, mapping)).toBeUndefined();
  });

  it("does not link a name when a different staff number was given", () => {
    expect(matchPublicSubmissionToPerson(rows, { FullName: "Ali bin Abu", StaffNo: "ZZ999" }, mapping)).toBeUndefined();
  });

  it("ignores people who have left", () => {
    expect(matchPublicSubmissionToPerson([{ ...ali, isActive: false }], { StaffNo: "PC069" }, mapping)).toBeUndefined();
  });
});

describe("link fields and public submitter", () => {
  it("stores the lowercased email, the staff number and how it matched", () => {
    expect(linkFieldsFor({ row: { ...ali, personEmail: "Ali@PMW-group.com" }, method: "email" })).toEqual({
      LinkedUserEmail: "ali@pmw-group.com",
      LinkedEmployeeId: "PC 069",
      LinkedMatch: "email",
    });
  });
  it("only public submissions are linkable", () => {
    expect(isPublicSubmitter("GUEST")).toBe(true);
    expect(isPublicSubmitter(" guest ")).toBe(true);
    expect(isPublicSubmitter("ali@pmw-group.com")).toBe(false);
  });
});

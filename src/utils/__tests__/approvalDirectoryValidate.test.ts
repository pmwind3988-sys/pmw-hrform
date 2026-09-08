/**
 * validateApprovalDirectoryInput is what the Add/Edit person dialog gates on.
 *
 * A person filled a form as a public user and has no company mailbox: their row
 * still needs to exist so their submissions route to an approver, so the email
 * is optional. A row with no email is identified by name instead, which is why
 * the name is required precisely when the email is missing.
 */
import { describe, it, expect } from "vitest";
import {
  EMPTY_APPROVAL_DIRECTORY_INPUT,
  validateApprovalDirectoryInput,
  type ApprovalDirectoryInput,
} from "../approvalDirectory";
import type { ApprovalDirectoryRow } from "../approvalDirectorySchema";

function inputOf(overrides: Partial<ApprovalDirectoryInput> = {}): ApprovalDirectoryInput {
  return { ...EMPTY_APPROVAL_DIRECTORY_INPUT, ...overrides };
}

function rowOf(overrides: Partial<ApprovalDirectoryRow>): ApprovalDirectoryRow {
  return {
    personEmail: "",
    personName: "",
    department: "",
    company: "",
    position: "",
    employeeId: "",
    approverEmail: "",
    isActive: true,
    source: "manual",
    confirmed: true,
    ...overrides,
  };
}

describe("validateApprovalDirectoryInput", () => {
  it("accepts a person with no email as long as they have a name", () => {
    const problems = validateApprovalDirectoryInput(
      inputOf({ personName: "Ali Bakar", approverEmail: "hod@example.com" }),
      [],
    );
    expect(problems).toEqual([]);
  });

  it("rejects a row with neither an email nor a name to identify it by", () => {
    const problems = validateApprovalDirectoryInput(inputOf({}), []);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(" ")).toMatch(/name/i);
  });

  it("still checks the format of an email when one is given", () => {
    const problems = validateApprovalDirectoryInput(
      inputOf({ personEmail: "not-an-email" }),
      [],
    );
    expect(problems.join(" ")).toMatch(/not a valid email/i);
  });

  it("still rejects a second row with an email already in the list", () => {
    const problems = validateApprovalDirectoryInput(
      inputOf({ personEmail: "ali@example.com" }),
      [rowOf({ id: 1, personEmail: "ali@example.com" })],
    );
    expect(problems.join(" ")).toMatch(/already listed/i);
  });

  it("does not treat two emailless rows as duplicates of each other", () => {
    const problems = validateApprovalDirectoryInput(
      inputOf({ personName: "Second Public User" }),
      [rowOf({ id: 1, personName: "First Public User" })],
    );
    expect(problems).toEqual([]);
  });
});

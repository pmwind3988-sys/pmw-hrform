/**
 * Correcting a field and declaring the row checked used to be one action, so
 * fixing an invented address also let routing act on an unreviewed reporting
 * line. These cover the rule that separates them, and the repointing that
 * stops a changed address orphaning everyone below it.
 */
import { describe, it, expect } from "vitest";
import { dependentsOf, editOrigin } from "../approvalDirectory";
import { DIRECTORY_SOURCE } from "../directoryHarvest";
import type { ApprovalDirectoryRow } from "../approvalDirectorySchema";

const GUESSED = { source: DIRECTORY_SOURCE.autoEmailGuessed, confirmed: false };
const HARVESTED = { source: DIRECTORY_SOURCE.auto, confirmed: false };

describe("editOrigin", () => {
  it("leaves a harvested row unconfirmed when the admin has not ticked review", () => {
    expect(editOrigin(HARVESTED, false, false)).toEqual({
      source: DIRECTORY_SOURCE.auto,
      confirmed: false,
    });
  });

  it("keeps the row in the review list by not turning its source manual", () => {
    // isUnconfirmedRow reads the source as well as the flag, so a manual
    // source would hide the row however Confirmed was left.
    expect(editOrigin(GUESSED, false, false).source).not.toBe(DIRECTORY_SOURCE.manual);
  });

  it("stops calling a corrected address a guess", () => {
    expect(editOrigin(GUESSED, true, false)).toEqual({
      source: DIRECTORY_SOURCE.auto,
      confirmed: false,
    });
  });

  it("still says guessed when the address was left alone", () => {
    expect(editOrigin(GUESSED, false, false).source).toBe(DIRECTORY_SOURCE.autoEmailGuessed);
  });

  it("confirms when the admin asks for it", () => {
    expect(editOrigin(GUESSED, true, true)).toEqual({
      source: DIRECTORY_SOURCE.auto,
      confirmed: true,
    });
  });

  it("never un-confirms a row that was already checked", () => {
    const checked = { source: DIRECTORY_SOURCE.auto, confirmed: true };
    expect(editOrigin(checked, true, false).confirmed).toBe(true);
  });

  it("treats a new row, and an admin's own row, as manual and checked", () => {
    const admin = { source: DIRECTORY_SOURCE.manual, confirmed: true };
    expect(editOrigin(undefined, false, false)).toEqual(admin);
    expect(editOrigin({ source: DIRECTORY_SOURCE.manual, confirmed: false }, true, false)).toEqual(admin);
  });
});

function row(id: number, personEmail: string, approverEmail: string): ApprovalDirectoryRow {
  return {
    id,
    personEmail,
    personName: personEmail,
    department: "",
    company: "",
    position: "",
    employeeId: "",
    approverEmail,
    isActive: true,
    source: DIRECTORY_SOURCE.manual,
    confirmed: true,
  };
}

describe("dependentsOf", () => {
  const rows = [
    row(1, "hod@x.com", ""),
    row(2, "ali@x.com", "HOD@X.com"),
    row(3, "siti@x.com", "hod@x.com"),
    row(4, "zaid@x.com", "someone.else@x.com"),
  ];

  it("finds everyone pointing at the address, whatever its casing", () => {
    expect(dependentsOf(rows, "HOD@x.com").map((r) => r.id)).toEqual([2, 3]);
  });

  it("skips the row being changed, so a self-reference is not repointed", () => {
    expect(dependentsOf(rows, "hod@x.com", 2).map((r) => r.id)).toEqual([3]);
  });

  it("finds nobody for a blank address", () => {
    expect(dependentsOf(rows, "  ")).toEqual([]);
  });
});

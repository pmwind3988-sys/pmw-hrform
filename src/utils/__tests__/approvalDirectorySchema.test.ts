import { describe, expect, it } from "vitest";
import {
  directoryIsUsable,
  directoryTracksConfirmation,
  mapDirectoryColumns,
  missingDirectoryColumns,
  toApprovalDirectoryRow,
} from "../approvalDirectorySchema";

/** Shorthand for a SharePoint column whose internal name equals its title. */
function plain(name: string) {
  return { key: name, aliases: [name] };
}

const FULL_LIST = [
  plain("PersonEmail"),
  plain("PersonName"),
  plain("Department"),
  plain("Company"),
  plain("Position"),
  plain("EmployeeId"),
  plain("ApproverEmail"),
  plain("IsActive"),
  plain("Source"),
  plain("Confirmed"),
];

describe("mapDirectoryColumns", () => {
  it("maps a list whose names match exactly", () => {
    const map = mapDirectoryColumns(FULL_LIST);
    expect(map.personEmail).toBe("PersonEmail");
    expect(map.approverEmail).toBe("ApproverEmail");
    expect(directoryIsUsable(map)).toBe(true);
    expect(missingDirectoryColumns(map)).toEqual([]);
  });

  it("ignores casing, so EmployeeID still matches EmployeeId", () => {
    const map = mapDirectoryColumns([...FULL_LIST.slice(0, 5), plain("EMPLOYEEID"), ...FULL_LIST.slice(6)]);
    expect(map.employeeId).toBe("EMPLOYEEID");
  });

  it("matches a column created with a space in its name", () => {
    // What SharePoint does to a column created as "Approver Email".
    const map = mapDirectoryColumns([
      ...FULL_LIST.slice(0, 6),
      { key: "Approver_x0020_Email", aliases: ["Approver Email", "Approver_x0020_Email"] },
      ...FULL_LIST.slice(7),
    ]);
    expect(map.approverEmail).toBe("Approver_x0020_Email");
    expect(directoryIsUsable(map)).toBe(true);
  });

  it("matches snake_case and other spellings of the same name", () => {
    const map = mapDirectoryColumns([plain("person_email"), plain("approver-email")]);
    expect(map.personEmail).toBe("person_email");
    expect(map.approverEmail).toBe("approver-email");
  });

  it("finds a column by internal name after it was renamed in the UI", () => {
    const renamed = mapDirectoryColumns([
      ...FULL_LIST.slice(0, 5),
      { key: "ApproverEmail", aliases: ["Who signs for them", "ApproverEmail"] },
      plain("IsActive"),
    ]);
    expect(renamed.approverEmail).toBe("ApproverEmail");
  });

  it("reports exactly which columns are missing, by the name to add", () => {
    const map = mapDirectoryColumns([plain("PersonEmail"), plain("ApproverEmail")]);
    expect(directoryIsUsable(map)).toBe(true);
    expect(missingDirectoryColumns(map)).toEqual([
      "PersonName",
      "Department",
      "Company",
      "Position",
      "EmployeeId",
      "IsActive",
      "Source",
      "Confirmed",
    ]);
  });

  it("is unusable without the two columns that carry the reporting line", () => {
    expect(directoryIsUsable(mapDirectoryColumns([plain("PersonEmail")]))).toBe(false);
    expect(directoryIsUsable(mapDirectoryColumns([plain("ApproverEmail")]))).toBe(false);
    expect(directoryIsUsable(mapDirectoryColumns([]))).toBe(false);
  });

  it("ignores columns the directory does not care about", () => {
    const map = mapDirectoryColumns([...FULL_LIST, plain("Modified"), plain("Author")]);
    expect(directoryIsUsable(map)).toBe(true);
  });
});

describe("toApprovalDirectoryRow", () => {
  it("reads through a resolved column map", () => {
    const map = mapDirectoryColumns([
      { key: "PersonEmail", aliases: ["PersonEmail"] },
      { key: "Approver_x0020_Email2", aliases: ["ApproverEmail", "Approver_x0020_Email2"] },
    ]);
    const row = toApprovalDirectoryRow(
      { PersonEmail: " ali@pmw.com ", Approver_x0020_Email2: "siti@pmw.com" },
      map,
    );
    expect(row.personEmail).toBe("ali@pmw.com");
    expect(row.approverEmail).toBe("siti@pmw.com");
  });

  it("treats an absent IsActive column as everybody being active", () => {
    const map = mapDirectoryColumns([plain("PersonEmail"), plain("ApproverEmail")]);
    expect(toApprovalDirectoryRow({ PersonEmail: "ali@pmw.com" }, map).isActive).toBe(true);
  });

  it("treats a blank IsActive cell as active, not as a leaver", () => {
    const map = mapDirectoryColumns(FULL_LIST);
    expect(toApprovalDirectoryRow({ PersonEmail: "ali@pmw.com", IsActive: "" }, map).isActive).toBe(true);
    expect(toApprovalDirectoryRow({ PersonEmail: "ali@pmw.com", IsActive: false }, map).isActive).toBe(false);
  });

  it("still works without a map, for callers that know the names", () => {
    expect(toApprovalDirectoryRow({ PersonEmail: "ali@pmw.com" }).personEmail).toBe("ali@pmw.com");
  });
});

describe("directoryTracksConfirmation", () => {
  it("is true for a list that can mark a row as an unchecked guess", () => {
    expect(directoryTracksConfirmation(mapDirectoryColumns(FULL_LIST))).toBe(true);
  });

  it("is false for a directory that predates the two columns", () => {
    const map = mapDirectoryColumns(FULL_LIST.slice(0, 8));
    // Still perfectly able to route; just unable to hold a guess, which is why
    // harvesting is refused rather than the whole page.
    expect(directoryIsUsable(map)).toBe(true);
    expect(directoryTracksConfirmation(map)).toBe(false);
  });
});

describe("toApprovalDirectoryRow, on origin", () => {
  it("reads a hand-kept row as manual and checked", () => {
    const row = toApprovalDirectoryRow({ PersonEmail: "ali@pmw.com", ApproverEmail: "siti@pmw.com" });
    expect(row.source).toBe("manual");
    expect(row.confirmed).toBe(true);
  });

  it("reads a harvested row as the guess it is", () => {
    const row = toApprovalDirectoryRow({
      PersonEmail: "ali@pmw.com",
      ApproverEmail: "siti@pmw.com",
      Source: "auto-email-guessed",
      Confirmed: false,
    });
    expect(row.source).toBe("auto-email-guessed");
    expect(row.confirmed).toBe(false);
  });

  it("reads a blank Confirmed cell as checked, so an old list grows no badges", () => {
    const row = toApprovalDirectoryRow({
      PersonEmail: "ali@pmw.com",
      ApproverEmail: "siti@pmw.com",
      Confirmed: "",
    });
    expect(row.confirmed).toBe(true);
  });
});

describe("what routing may act on", () => {
  /**
   * `isRoutableRow` is private to each transport copy of approvalDirectory, so
   * this pins the rule it is built from: the two flags a row carries, and what
   * they mean together.
   */
  const routable = (row: { isActive: boolean; confirmed: boolean }) => row.isActive && row.confirmed;

  it("acts on an ordinary confirmed row", () => {
    expect(routable(toApprovalDirectoryRow({
      PersonEmail: "ali@pmw.com", ApproverEmail: "siti@pmw.com", IsActive: true, Confirmed: true,
    }))).toBe(true);
  });

  it("refuses a harvested row nobody has checked", () => {
    // The guess is a question for an admin, not an answer. Acting on it would
    // route an appraisal to an address invented from somebody's name.
    expect(routable(toApprovalDirectoryRow({
      PersonEmail: "ali@pmw.com", ApproverEmail: "siti@pmw.com", IsActive: true,
      Source: "auto-email-guessed", Confirmed: false,
    }))).toBe(false);
  });

  it("refuses a leaver, confirmed or not", () => {
    expect(routable(toApprovalDirectoryRow({
      PersonEmail: "ali@pmw.com", ApproverEmail: "siti@pmw.com", IsActive: false, Confirmed: true,
    }))).toBe(false);
  });

  it("acts on every row of a directory that predates the Confirmed column", () => {
    expect(routable(toApprovalDirectoryRow({
      PersonEmail: "ali@pmw.com", ApproverEmail: "siti@pmw.com",
    }))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { isLinkedToPerson } from "../linkedSubmission";

describe("isLinkedToPerson", () => {
  it("recognises the linked email regardless of case", () => {
    expect(isLinkedToPerson({ linkedUserEmail: "Ali@PMW-group.com" }, "ali@pmw-group.com", new Set())).toBe(true);
  });

  it("recognises a staff number the signed-in person holds, ignoring spaces", () => {
    expect(isLinkedToPerson({ linkedEmployeeId: "PC 070" }, "siti@pmw-group.com", new Set(["PC070"]))).toBe(true);
  });

  it("does not claim someone else's submission", () => {
    expect(isLinkedToPerson(
      { linkedUserEmail: "ali@pmw-group.com", linkedEmployeeId: "PC 069" },
      "siti@pmw-group.com",
      new Set(["PC070"]),
    )).toBe(false);
  });

  it("ignores an unlinked submission", () => {
    expect(isLinkedToPerson({}, "ali@pmw-group.com", new Set(["PC069"]))).toBe(false);
  });
});

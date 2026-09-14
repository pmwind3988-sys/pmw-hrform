import { describe, expect, it } from "vitest";
import { groupVariables, filterVariables } from "./VariablePicker";

const catalogue = [
  { token: "field:employeeName", label: "Employee Name", group: "Form fields" },
  { token: "field:reason", label: "Reason", group: "Form fields" },
  { token: "meta:submittedBy", label: "Submitted by", group: "Submission" },
];

describe("groupVariables", () => {
  it("groups variables under their group name, preserving order", () => {
    expect(groupVariables(catalogue).map((g) => g.group)).toEqual(["Form fields", "Submission"]);
    expect(groupVariables(catalogue)[0].items).toHaveLength(2);
  });

  it("handles an empty catalogue", () => {
    expect(groupVariables([])).toEqual([]);
  });
});

describe("filterVariables", () => {
  it("matches on label, case-insensitively", () => {
    expect(filterVariables(catalogue, "employee").map((v) => v.token)).toEqual(["field:employeeName"]);
  });

  it("matches on token too, so an admin can search by field name", () => {
    expect(filterVariables(catalogue, "reason").map((v) => v.token)).toEqual(["field:reason"]);
  });

  it("returns everything for an empty query", () => {
    expect(filterVariables(catalogue, "   ")).toHaveLength(3);
  });
});

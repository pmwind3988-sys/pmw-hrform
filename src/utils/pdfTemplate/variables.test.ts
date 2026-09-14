import { describe, expect, it } from "vitest";
import { buildVariableCatalogue, BUILTIN_VARIABLES } from "./variables";

const survey = {
  title: "Leave",
  pages: [{ name: "p1", elements: [
    { type: "text", name: "employeeName", title: "Employee Name" },
    { type: "dropdown", name: "leaveType", title: "Leave Type", choices: ["Annual", "Medical"] },
  ] }],
};

describe("buildVariableCatalogue", () => {
  it("offers every form field under its label", () => {
    const tokens = buildVariableCatalogue(survey, 0);
    expect(tokens).toContainEqual({ token: "field:employeeName", label: "Employee Name", group: "Form fields" });
    expect(tokens).toContainEqual({ token: "field:leaveType", label: "Leave Type", group: "Form fields" });
  });

  it("includes the built-in submission values", () => {
    const tokens = buildVariableCatalogue(survey, 0).map((v) => v.token);
    for (const builtin of BUILTIN_VARIABLES) expect(tokens).toContain(builtin.token);
  });

  it("adds one group of variables per approval layer", () => {
    const tokens = buildVariableCatalogue(survey, 2).map((v) => v.token);
    expect(tokens).toContain("layer:1:email");
    expect(tokens).toContain("layer:1:status");
    expect(tokens).toContain("layer:2:signedAt");
    expect(tokens).not.toContain("layer:3:email");
  });

  it("falls back to the field name when a question has no title", () => {
    const untitled = { pages: [{ name: "p1", elements: [{ type: "text", name: "remarks" }] }] };
    expect(buildVariableCatalogue(untitled, 0)).toContainEqual(
      expect.objectContaining({ token: "field:remarks", label: "remarks" }),
    );
  });

  it("survives a malformed survey", () => {
    expect(() => buildVariableCatalogue(null, 0)).not.toThrow();
    expect(buildVariableCatalogue(null, 0).length).toBe(BUILTIN_VARIABLES.length);
  });
});

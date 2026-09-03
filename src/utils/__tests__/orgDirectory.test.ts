import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  companyChoices,
  departmentChoices,
  departmentScopeLabel,
  nearDuplicateGroups,
  orgKey,
  validateCompany,
  validateDepartment,
  type CompanyRow,
  type DepartmentRow,
} from "../orgDirectory";

function company(code: string, name = code, isActive = true): CompanyRow {
  return { code, name, isActive };
}

function department(code: string, companyCode = "", name = code, isActive = true): DepartmentRow {
  return { code, name, company: companyCode, isActive };
}

const CONCRETE = "PMW CONCRETE INDUSTRIES SDN BHD";
const LIGHTING = "PMW LIGHTING SDN BHD";

describe("orgKey", () => {
  it("ignores case and repeated spacing, so one company is not seeded twice", () => {
    expect(orgKey("PMW  Industries ")).toBe(orgKey("pmw industries"));
  });
});

describe("companyChoices", () => {
  it("offers active companies by name, storing the code", () => {
    expect(companyChoices([company("PMWL", "PMW Lighting"), company("PMWC", "PMW Concrete")]))
      .toEqual([
        { value: "PMWC", text: "PMW Concrete" },
        { value: "PMWL", text: "PMW Lighting" },
      ]);
  });

  it("leaves out a company that has been switched off", () => {
    expect(companyChoices([company("PMWC", "PMW Concrete", false)])).toEqual([]);
  });

  it("falls back to the code when a row has no name", () => {
    expect(companyChoices([{ code: "PMWC", name: "", isActive: true }]))
      .toEqual([{ value: "PMWC", text: "PMWC" }]);
  });
});

describe("departmentChoices", () => {
  it("offers a shared department to every company", () => {
    const departments = [department("Finance"), department("HR")];
    expect(departmentChoices(departments, CONCRETE).map((choice) => choice.value))
      .toEqual(["Finance", "HR"]);
    expect(departmentChoices(departments, LIGHTING).map((choice) => choice.value))
      .toEqual(["Finance", "HR"]);
  });

  it("offers a company's own department only to that company", () => {
    const departments = [department("Stockyard", CONCRETE)];
    expect(departmentChoices(departments, CONCRETE).map((choice) => choice.value)).toEqual(["Stockyard"]);
    expect(departmentChoices(departments, LIGHTING)).toEqual([]);
  });

  it("mixes shared and specific for the chosen company", () => {
    const departments = [department("Finance"), department("Stockyard", CONCRETE)];
    expect(departmentChoices(departments, CONCRETE).map((choice) => choice.value))
      .toEqual(["Finance", "Stockyard"]);
    expect(departmentChoices(departments, LIGHTING).map((choice) => choice.value))
      .toEqual(["Finance"]);
  });

  it("lets a company's own row override the shared one of the same code", () => {
    // The point of the override: Concrete's Finance is pulled out of the pool
    // without disturbing anybody else's.
    const departments = [
      department("Finance", "", "Finance (shared)"),
      department("Finance", CONCRETE, "Finance (Concrete)"),
    ];
    expect(departmentChoices(departments, CONCRETE)).toEqual([
      { value: "Finance", text: "Finance (Concrete)" },
    ]);
    expect(departmentChoices(departments, LIGHTING)).toEqual([
      { value: "Finance", text: "Finance (shared)" },
    ]);
  });

  it("never offers the same code twice", () => {
    const departments = [
      department("Finance"),
      department("Finance", CONCRETE, "Finance (Concrete)"),
    ];
    const values = departmentChoices(departments, CONCRETE).map((choice) => choice.value);
    expect(values).toEqual([...new Set(values)]);
  });

  it("matches a company's code regardless of case and spacing", () => {
    expect(departmentChoices([department("Stockyard", "pmw  concrete")], "PMW CONCRETE"))
      .toHaveLength(1);
  });

  it("offers everything when no company has been picked, rather than nothing", () => {
    // A form may ask for a department without asking which company. Answering
    // "nothing to choose" would make it unfillable.
    const departments = [department("Finance"), department("Stockyard", CONCRETE)];
    expect(departmentChoices(departments, "").map((choice) => choice.value))
      .toEqual(["Finance", "Stockyard"]);
  });

  it("leaves out departments that have been switched off", () => {
    expect(departmentChoices([department("Finance", "", "Finance", false)], CONCRETE)).toEqual([]);
  });
});

describe("departmentScopeLabel", () => {
  const companies = [company("PMWC", "PMW Concrete")];

  it("says so when a department is shared", () => {
    expect(departmentScopeLabel(department("Finance"), companies)).toBe("All companies");
  });

  it("names the company when it is specific", () => {
    expect(departmentScopeLabel(department("Stockyard", "PMWC"), companies)).toBe("PMW Concrete");
  });

  it("flags a company code that is not in the company list", () => {
    expect(departmentScopeLabel(department("Stockyard", "GONE"), companies)).toBe("GONE (not listed)");
  });
});

describe("nearDuplicateGroups", () => {
  it("groups a company typed two ways", () => {
    const groups = nearDuplicateGroups(["PMW LIGHTING SDN BHD", "PMW LIGHTING INDUSTRIES SDN BHD"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].names).toEqual(["PMW LIGHTING INDUSTRIES SDN BHD", "PMW LIGHTING SDN BHD"]);
  });

  it("ignores the legal suffix, which is form and not identity", () => {
    expect(nearDuplicateGroups(["PMW Winabumi Sdn Bhd", "PMW WINABUMI BERHAD"])).toHaveLength(1);
  });

  it("groups a department spelled with and without a space", () => {
    expect(nearDuplicateGroups(["Production(F1)", "Production (F1)"])).toHaveLength(1);
  });

  it("leaves genuinely different names alone", () => {
    expect(nearDuplicateGroups(["Finance", "Procurement", "QA/QC"])).toEqual([]);
  });

  it("does not group two factories that differ only by their number", () => {
    // Production (F2) and Production (F3) are different places, and reducing
    // to letters alone would have merged them.
    expect(nearDuplicateGroups(["Production (F2)", "Production (F3)"])).toEqual([]);
  });

  it("counts one value once, however it is spaced", () => {
    expect(nearDuplicateGroups(["Finance", "finance ", " FINANCE"])).toEqual([]);
  });
});

describe("validateCompany", () => {
  it("accepts an ordinary company", () => {
    expect(validateCompany(company("PMWC", "PMW Concrete"), [])).toEqual([]);
  });

  it("insists on a name and a code", () => {
    expect(validateCompany({ code: "", name: "", isActive: true }, [])).toHaveLength(2);
  });

  it("refuses a code another company already uses", () => {
    const existing = [{ ...company("PMWC", "PMW Concrete"), id: 1 }];
    expect(validateCompany({ ...company("pmwc", "Typo"), id: 2 }, existing)[0])
      .toContain("already used");
  });

  it("lets a company keep its own code while being edited", () => {
    const existing = [{ ...company("PMWC", "PMW Concrete"), id: 1 }];
    expect(validateCompany({ ...company("PMWC", "PMW Concrete Renamed"), id: 1 }, existing)).toEqual([]);
  });
});

describe("validateDepartment", () => {
  it("allows one code across two companies", () => {
    const existing = [{ ...department("Finance", "PMWC"), id: 1 }];
    expect(validateDepartment({ ...department("Finance", "PMWL"), id: 2 }, existing)).toEqual([]);
  });

  it("allows a company's own row to reuse a shared code, which is the override", () => {
    const existing = [{ ...department("Finance", ""), id: 1 }];
    expect(validateDepartment({ ...department("Finance", "PMWC"), id: 2 }, existing)).toEqual([]);
  });

  it("refuses the same code twice in the same company", () => {
    const existing = [{ ...department("Finance", "PMWC"), id: 1 }];
    expect(validateDepartment({ ...department("finance", "pmwc"), id: 2 }, existing)[0])
      .toContain("already listed for that company");
  });

  it("refuses the same shared code twice", () => {
    const existing = [{ ...department("Finance", ""), id: 1 }];
    expect(validateDepartment({ ...department("Finance", ""), id: 2 }, existing)[0])
      .toContain("shared by all companies");
  });
});

describe("the src/ and api/ copies", () => {
  it("stay identical apart from the header pointing at the other one", () => {
    const root = resolve(__dirname, "../../..");
    const read = (path: string) =>
      readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n").split("\n");

    const client = read("src/utils/orgDirectory.ts");
    const server = read("api/_utils/orgDirectory.ts");

    expect(server.length).toBe(client.length);
    const differing = client
      .map((line, index) => (line === server[index] ? null : index))
      .filter((index): index is number => index !== null);

    // A signed-in submitter's browser resolves these choices; a public
    // submitter's are resolved for them in api/form-config.ts. The two must
    // agree on which departments belong to which company, or the same form
    // offers different options depending on how somebody signed in.
    expect(differing.length).toBe(1);
    expect(client[differing[0]]).toContain("api/_utils/orgDirectory.ts");
  });
});

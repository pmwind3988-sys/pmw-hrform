import { describe, expect, it } from "vitest";
import {
  companiesFromMeta,
  describeOrgConversionPlan,
  orgQuestionsFromSurveyJson,
  planOrgConversion,
  type FormOrgUsage,
} from "../orgConversion";

function usage(overrides: Partial<FormOrgUsage> = {}): FormOrgUsage {
  return {
    formTitle: "Training Evaluation Form",
    version: "1.14",
    publishKey: "production",
    companies: [],
    questions: [],
    ...overrides,
  };
}

describe("companiesFromMeta", () => {
  it("reads the one-per-line list a form keeps", () => {
    expect(companiesFromMeta({ companies: "PMW INDUSTRIES SDN BHD\nPMW LIGHTING SDN BHD" }))
      .toEqual(["PMW INDUSTRIES SDN BHD", "PMW LIGHTING SDN BHD"]);
  });

  it("drops blank lines and stray spacing", () => {
    expect(companiesFromMeta({ companies: "  A \n\n B \n" })).toEqual(["A", "B"]);
  });

  it("reads nothing from a form that has no list", () => {
    expect(companiesFromMeta({})).toEqual([]);
    expect(companiesFromMeta(null)).toEqual([]);
    expect(companiesFromMeta({ companies: 42 })).toEqual([]);
  });
});

describe("orgQuestionsFromSurveyJson", () => {
  const survey = (elements: unknown[]) => ({ pages: [{ elements }] });

  it("finds a department question and the choices typed into it", () => {
    expect(orgQuestionsFromSurveyJson(survey([
      { name: "Department", title: "Department", type: "dropdown", choices: ["Finance", "HR"] },
    ]))).toEqual([{
      name: "Department",
      title: "Department",
      kind: "department",
      source: "static",
      staticChoices: ["Finance", "HR"],
    }]);
  });

  it("recognises the managed company banner", () => {
    const found = orgQuestionsFromSurveyJson(survey([
      { name: "company", title: "Company", type: "radiogroup", isManagedCompanyChoice: true },
    ]));
    expect(found[0]).toMatchObject({ kind: "company", source: "managed", staticChoices: [] });
  });

  it("recognises a question already pointed at a list, and takes no choices from it", () => {
    const found = orgQuestionsFromSurveyJson(survey([
      { name: "Dept", title: "Department", type: "dropdown", spChoicesSource: { list: "Depts" }, choices: ["stale"] },
    ]));
    expect(found[0]).toMatchObject({ kind: "department", source: "list", staticChoices: [] });
  });

  it("ignores somebody else's department", () => {
    expect(orgQuestionsFromSurveyJson(survey([
      { name: "HodDept", title: "HOD Department", type: "text" },
      { name: "SupDept", title: "Supervisor Division", type: "text" },
    ]))).toEqual([]);
  });

  it("reads value/text choice pairs", () => {
    const found = orgQuestionsFromSurveyJson(survey([
      { name: "Department", title: "Department", choices: [{ value: "FIN", text: "Finance" }] },
    ]));
    expect(found[0].staticChoices).toEqual(["FIN"]);
  });

  it("finds questions nested in panels and columns", () => {
    const found = orgQuestionsFromSurveyJson(survey([
      { type: "panel", name: "p1", elements: [{ name: "Department", title: "Department", choices: ["HR"] }] },
      { type: "columns", name: "c1", columns: [{ elements: [{ name: "Company", title: "Company", choices: ["A"] }] }] },
    ]));
    expect(found.map((question) => question.name).sort()).toEqual(["Company", "Department"]);
  });

  it("reads the stored envelope as readily as a bare schema", () => {
    const found = orgQuestionsFromSurveyJson({
      surveyJson: survey([{ name: "Department", title: "Department", choices: ["HR"] }]),
    });
    expect(found).toHaveLength(1);
  });

  it("finds nothing on a form that asks for neither", () => {
    expect(orgQuestionsFromSurveyJson(survey([{ name: "Q1", title: "How did it go?" }]))).toEqual([]);
  });
});

describe("planOrgConversion", () => {
  it("seeds each code equal to the string stored today", () => {
    const plan = planOrgConversion({
      usage: [usage({ companies: ["PMW LIGHTING SDN BHD"] })],
    });
    expect(plan.companies).toEqual([{
      code: "PMW LIGHTING SDN BHD",
      name: "PMW LIGHTING SDN BHD",
      seenOn: ["Training Evaluation Form"],
    }]);
  });

  it("counts one value once, and records every form it was seen on", () => {
    const plan = planOrgConversion({
      usage: [
        usage({ companies: ["PMW INDUSTRIES SDN BHD"] }),
        usage({ formTitle: "Training Requisition Form", companies: ["pmw industries sdn bhd"] }),
      ],
    });
    expect(plan.companies).toHaveLength(1);
    expect(plan.companies[0].seenOn)
      .toEqual(["Training Evaluation Form", "Training Requisition Form"]);
  });

  it("takes departments from choices typed into forms", () => {
    const plan = planOrgConversion({
      usage: [usage({
        questions: [{
          name: "Department", title: "Department", kind: "department",
          source: "static", staticChoices: ["Finance", "QA/QC"],
        }],
      })],
    });
    expect(plan.departments.map((row) => row.code)).toEqual(["Finance", "QA/QC"]);
  });

  it("takes departments and companies off the directory rows too", () => {
    // Those rows were harvested from submissions and can name a department no
    // current form still offers — and routing already uses it.
    const plan = planOrgConversion({
      usage: [usage()],
      directoryPairs: [{ company: "BORNEO POLE SDN BHD", department: "Stockyard" }],
    });
    expect(plan.companies[0]).toMatchObject({ code: "BORNEO POLE SDN BHD", seenOn: ["Approval Directory"] });
    expect(plan.departments[0]).toMatchObject({ code: "Stockyard" });
  });

  it("reports two spellings of one company rather than merging them", () => {
    const plan = planOrgConversion({
      usage: [usage({ companies: ["PMW LIGHTING SDN BHD", "PMW LIGHTING INDUSTRIES SDN BHD"] })],
    });
    expect(plan.companies).toHaveLength(2);
    expect(plan.companyDuplicates).toHaveLength(1);
  });

  it("lists every question it would repoint, per profile", () => {
    const question = {
      name: "Department", title: "Department", kind: "department" as const,
      source: "static" as const, staticChoices: ["Finance"],
    };
    const plan = planOrgConversion({
      usage: [
        usage({ publishKey: "production", questions: [question] }),
        usage({ publishKey: "150726training", questions: [question] }),
      ],
    });
    expect(plan.repoint).toHaveLength(2);
    expect(plan.repoint.map((target) => target.publishKey)).toEqual(["production", "150726training"]);
    expect(plan.repoint[0]).toMatchObject({ questionName: "Department", from: "static" });
  });

  it("counts the profiles it read, so a thin plan can be told from a thin read", () => {
    expect(planOrgConversion({ usage: [usage(), usage()] }).profilesRead).toBe(2);
    expect(planOrgConversion({ usage: [] }).profilesRead).toBe(0);
  });
});

describe("describeOrgConversionPlan", () => {
  it("says so when nothing could be read", () => {
    expect(describeOrgConversionPlan(planOrgConversion({ usage: [] })))
      .toContain("No published form could be read");
  });

  it("counts what it found", () => {
    const plan = planOrgConversion({
      usage: [usage({
        companies: ["A", "B"],
        questions: [{
          name: "Department", title: "Department", kind: "department",
          source: "static", staticChoices: ["Finance"],
        }],
      })],
    });
    expect(describeOrgConversionPlan(plan))
      .toBe("Read 1 published profile and found 2 companies and 1 department in use.");
  });
});

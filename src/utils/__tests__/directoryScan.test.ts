import { describe, expect, it } from "vitest";
import {
  describeScanPlan,
  planDirectoryScan,
  scannableForms,
  type ScannedForm,
} from "../directoryScan";
import type { ApprovalDirectoryRow } from "../approvalDirectorySchema";
import type { DirectoryHarvestConfig } from "../directoryHarvest";

const DOMAIN = "pmw-group.com";

const CONFIG: DirectoryHarvestConfig = {
  enabled: true,
  nameField: "FullName",
  employeeIdField: "EmployeeId",
  departmentField: "Department",
};

function listed(personEmail: string): ApprovalDirectoryRow {
  return {
    personEmail,
    personName: personEmail.split("@")[0],
    department: "Safety",
    company: "PMW Industries",
    position: "",
    employeeId: "",
    approverEmail: "",
    isActive: true,
    source: "manual",
    confirmed: true,
  };
}

function form(responses: Array<Record<string, unknown>>, formTitle = "Appraisal"): ScannedForm {
  return { formTitle, config: CONFIG, responses };
}

const NO_HODS = () => "";

describe("scannableForms", () => {
  it("picks a form that was switched on and has an evaluation step", () => {
    expect(scannableForms([{
      Title: "Appraisal",
      LayerConfig: JSON.stringify({
        layers: [{ type: "evaluation" }],
        directoryHarvest: { enabled: true, nameField: "FullName" },
      }),
    }])).toEqual([{ formTitle: "Appraisal", config: {
      enabled: true,
      nameField: "FullName",
      employeeIdField: undefined,
      departmentField: undefined,
      emailField: undefined,
    } }]);
  });

  it("skips a form that was never switched on", () => {
    expect(scannableForms([{
      Title: "Appraisal",
      LayerConfig: JSON.stringify({ layers: [{ type: "evaluation" }] }),
    }])).toEqual([]);
  });

  it("skips a switched-on form with no evaluation step to read", () => {
    expect(scannableForms([{
      Title: "Leave",
      LayerConfig: JSON.stringify({
        layers: [{ type: "approval" }],
        directoryHarvest: { enabled: true, nameField: "FullName" },
      }),
    }])).toEqual([]);
  });

  it("skips a form whose stored workflow will not parse, rather than failing the scan", () => {
    expect(scannableForms([
      { Title: "Broken", LayerConfig: "{not json" },
      {
        Title: "Appraisal",
        LayerConfig: JSON.stringify({
          layers: [{ type: "evaluation" }],
          directoryHarvest: { enabled: true, nameField: "FullName" },
        }),
      },
    ]).map((entry) => entry.formTitle)).toEqual(["Appraisal"]);
  });

  it("skips forms with no workflow and no title", () => {
    expect(scannableForms([{ Title: "No config" }, { LayerConfig: "{}" }])).toEqual([]);
  });
});

describe("planDirectoryScan", () => {
  it("proposes the people the directory has never heard of", () => {
    const plan = planDirectoryScan({
      forms: [form([
        { FullName: "Ahmad Faiz", EmployeeId: "E-1", Department: "Safety", SubmittedBy: "ahmad.faiz@pmw-group.com" },
        { FullName: "Siti Aminah", EmployeeId: "E-2", Department: "Safety", SubmittedBy: "siti@pmw-group.com" },
      ])],
      existing: [],
      domain: DOMAIN,
      hodFor: NO_HODS,
    });

    expect(plan.proposals.map((p) => p.candidate.personEmail))
      .toEqual(["ahmad.faiz@pmw-group.com", "siti@pmw-group.com"]);
    expect(plan.submissionsRead).toBe(2);
    expect(plan.alreadyListed).toBe(0);
  });

  it("leaves out somebody already in the directory", () => {
    const plan = planDirectoryScan({
      forms: [form([
        { FullName: "Ahmad Faiz", Department: "Safety", SubmittedBy: "ahmad.faiz@pmw-group.com" },
      ])],
      existing: [listed("Ahmad.Faiz@PMW-Group.com")],
      domain: DOMAIN,
      hodFor: NO_HODS,
    });
    expect(plan.proposals).toEqual([]);
    expect(plan.alreadyListed).toBe(1);
  });

  it("proposes one row for somebody who submitted many times, and counts the sightings", () => {
    const plan = planDirectoryScan({
      forms: [form([
        { FullName: "Ahmad Faiz", Department: "Safety", SubmittedBy: "ahmad.faiz@pmw-group.com" },
        { FullName: "Ahmad Faiz", Department: "Operations", SubmittedBy: "ahmad.faiz@pmw-group.com" },
      ])],
      existing: [],
      domain: DOMAIN,
      hodFor: NO_HODS,
    });
    expect(plan.proposals).toHaveLength(1);
    expect(plan.proposals[0].seenCount).toBe(2);
    // The later submission's department wins: it is the current one, and the
    // approver guess hangs on it.
    expect(plan.proposals[0].candidate.department).toBe("Operations");
  });

  it("guesses each person's approver from their own department", () => {
    const plan = planDirectoryScan({
      forms: [form([
        { FullName: "Ahmad Faiz", Department: "Safety", SubmittedBy: "ahmad.faiz@pmw-group.com" },
        { FullName: "Siti Aminah", Department: "Finance", SubmittedBy: "siti@pmw-group.com" },
      ])],
      existing: [],
      domain: DOMAIN,
      hodFor: (department) => (department === "Safety" ? "hod.safety@pmw-group.com" : ""),
    });
    const byEmail = new Map(plan.proposals.map((p) => [p.candidate.personEmail, p.approverEmail]));
    expect(byEmail.get("ahmad.faiz@pmw-group.com")).toBe("hod.safety@pmw-group.com");
    expect(byEmail.get("siti@pmw-group.com")).toBe("");
  });

  it("counts submissions it could not key on anybody rather than dropping them silently", () => {
    const plan = planDirectoryScan({
      forms: [form([
        { Department: "Safety", SubmittedBy: "GUEST" },
        { FullName: "Ahmad Faiz", Department: "Safety", SubmittedBy: "GUEST" },
      ])],
      existing: [],
      domain: DOMAIN,
      hodFor: NO_HODS,
    });
    expect(plan.unkeyable).toBe(1);
    expect(plan.proposals).toHaveLength(1);
    // No submitter address, so the address was built from the name.
    expect(plan.proposals[0].candidate.emailWasGuessed).toBe(true);
  });

  it("reads several forms and reports the ones it could not read", () => {
    const plan = planDirectoryScan({
      forms: [
        form([{ FullName: "Ahmad Faiz", Department: "Safety", SubmittedBy: "ahmad.faiz@pmw-group.com" }], "Appraisal"),
        form([{ FullName: "Siti Aminah", Department: "Safety", SubmittedBy: "siti@pmw-group.com" }], "Probation"),
      ],
      existing: [],
      failures: [{ formTitle: "Renamed", reason: "list not found" }],
      domain: DOMAIN,
      hodFor: NO_HODS,
    });
    expect(plan.formsScanned).toEqual(["Appraisal", "Probation"]);
    expect(plan.formsFailed).toEqual([{ formTitle: "Renamed", reason: "list not found" }]);
    expect(plan.proposals).toHaveLength(2);
  });
});

describe("planDirectoryScan, on company", () => {
  it("carries each person's company through from their submission", () => {
    const plan = planDirectoryScan({
      forms: [form([
        { FullName: "Ahmad Faiz", Department: "Safety", company: "PMW Industries", SubmittedBy: "ahmad.faiz@pmw-group.com" },
        { FullName: "Siti Aminah", Department: "Finance", company: "PMW Group", SubmittedBy: "siti@pmw-group.com" },
      ])],
      existing: [],
      domain: DOMAIN,
      hodFor: NO_HODS,
    });
    const byEmail = new Map(plan.proposals.map((p) => [p.candidate.personEmail, p.candidate.company]));
    expect(byEmail.get("ahmad.faiz@pmw-group.com")).toBe("PMW Industries");
    expect(byEmail.get("siti@pmw-group.com")).toBe("PMW Group");
  });
});

describe("describeScanPlan", () => {
  it("says so when no form is set to harvest at all", () => {
    expect(describeScanPlan({
      formsScanned: [], formsFailed: [], submissionsRead: 0, proposals: [], unkeyable: 0, alreadyListed: 0,
    })).toContain("No form is set to add its submitters");
  });

  it("does not claim everybody is listed when it read nothing at all", () => {
    const line = describeScanPlan({
      formsScanned: ["Training Evaluation Form"], formsFailed: [], submissionsRead: 0,
      proposals: [], unkeyable: 0, alreadyListed: 0,
    });
    expect(line).toBe("No submissions found on the form set to add submitters.");
    expect(line).not.toContain("already in the directory");
  });

  it("points at the reasons when no form could be read at all", () => {
    expect(describeScanPlan({
      formsScanned: [], formsFailed: [{ formTitle: "Appraisal", reason: "no such list" }],
      submissionsRead: 0, proposals: [], unkeyable: 0, alreadyListed: 0,
    })).toBe("No form's submissions could be read. See the reasons below.");
  });

  it("says so when everybody is already listed", () => {
    expect(describeScanPlan({
      formsScanned: ["Appraisal"], formsFailed: [], submissionsRead: 12, proposals: [], unkeyable: 0, alreadyListed: 12,
    })).toContain("already in the directory");
  });

  it("counts what it found", () => {
    const plan = planDirectoryScan({
      forms: [form([{ FullName: "Ahmad Faiz", Department: "Safety", SubmittedBy: "ahmad.faiz@pmw-group.com" }])],
      existing: [],
      domain: DOMAIN,
      hodFor: NO_HODS,
    });
    expect(describeScanPlan(plan)).toBe("Read 1 submission and found 1 person not in the directory.");
  });
});

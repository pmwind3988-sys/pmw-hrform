import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DIRECTORY_SOURCE,
  buildHarvestCandidate,
  guessEmailFromName,
  harvestApproverEmail,
  harvestFieldGuesses,
  harvestFieldValue,
  harvestNote,
  harvestSource,
  hasEvaluationLayer,
  isPersonEmail,
  readHarvestConfig,
  type DirectoryHarvestCandidate,
} from "../directoryHarvest";

const DOMAIN = "pmw-group.com";

function candidate(overrides: Partial<DirectoryHarvestCandidate> = {}): DirectoryHarvestCandidate {
  return {
    personEmail: "ahmad.faiz@pmw-group.com",
    personName: "Ahmad Faiz",
    employeeId: "E-1042",
    department: "Safety",
    emailWasGuessed: false,
    ...overrides,
  };
}

describe("harvestFieldValue", () => {
  it("reads an answer stored under the exact field name", () => {
    expect(harvestFieldValue({ EmployeeId: "E-1" }, "EmployeeId")).toBe("E-1");
  });

  it("finds the answer through SharePoint's rewritten column name", () => {
    expect(harvestFieldValue({ Employee_x0020_ID: "E-2" }, "Employee ID")).toBe("E-2");
  });

  it("ignores punctuation and case differences between the two spellings", () => {
    expect(harvestFieldValue({ staff_no: "E-3" }, "Staff No.")).toBe("E-3");
  });

  it("reads a choice answer stored as an object", () => {
    expect(harvestFieldValue({ Dept: { text: "Safety" } }, "Dept")).toBe("Safety");
  });

  it("answers blank for a field the form does not have", () => {
    expect(harvestFieldValue({ Name: "Ali" }, "Department")).toBe("");
  });

  it("answers blank when no field was mapped at all", () => {
    expect(harvestFieldValue({ Name: "Ali" }, undefined)).toBe("");
  });
});

describe("harvestFieldGuesses", () => {
  it("picks the obvious three out of an ordinary evaluation form", () => {
    const guess = harvestFieldGuesses([
      { name: "FullName", title: "Full Name" },
      { name: "EmployeeId", title: "Employee ID" },
      { name: "Department", title: "Department" },
      { name: "Score", title: "Overall score" },
    ]);
    expect(guess).toMatchObject({
      nameField: "FullName",
      employeeIdField: "EmployeeId",
      departmentField: "Department",
    });
  });

  it("prefers the subject's own name over the evaluator's", () => {
    const guess = harvestFieldGuesses([
      { name: "EvaluatorName", title: "Evaluator Name" },
      { name: "SupervisorName", title: "Supervisor Name" },
      { name: "EmployeeName", title: "Employee Name" },
    ]);
    expect(guess.nameField).toBe("EmployeeName");
  });

  it("refuses somebody else's name outright rather than ranking it lower", () => {
    const guess = harvestFieldGuesses([
      { name: "HodName", title: "HOD Name" },
      { name: "WitnessName", title: "Witness Name" },
    ]);
    expect(guess.nameField).toBe("");
  });

  it("never mistakes the national ID for a staff number", () => {
    const guess = harvestFieldGuesses([
      { name: "IcNo", title: "IC No." },
      { name: "PassportNo", title: "Passport Number" },
    ]);
    expect(guess.employeeIdField).toBe("");
  });

  it("does not fire on a word that merely contains a keyword", () => {
    const guess = harvestFieldGuesses([
      { name: "VehicleNo", title: "Vehicle No" },
    ]);
    expect(guess.employeeIdField).toBe("");
  });

  it("prefers an exact label over a vaguer one defined earlier", () => {
    const guess = harvestFieldGuesses([
      { name: "ApplicantName", title: "Name of applicant" },
      { name: "FullName", title: "Full Name" },
    ]);
    expect(guess.nameField).toBe("FullName");
  });

  it("reads Malay labels", () => {
    const guess = harvestFieldGuesses([
      { name: "Nama", title: "Nama Penuh" },
      { name: "Jabatan", title: "Jabatan" },
    ]);
    expect(guess).toMatchObject({ nameField: "Nama", departmentField: "Jabatan" });
  });

  it("guesses nothing from a form that asks for none of it", () => {
    const guess = harvestFieldGuesses([
      { name: "Q1", title: "How did it go?" },
      { name: "Q2", title: "Anything else?" },
    ]);
    expect(guess).toEqual({ nameField: "", employeeIdField: "", departmentField: "", emailField: "" });
  });

  it("falls back to the stored field name when a question has no label", () => {
    const guess = harvestFieldGuesses([{ name: "Department" }]);
    expect(guess.departmentField).toBe("Department");
  });

  it("skips a question with no stored field name to offer", () => {
    const guess = harvestFieldGuesses([{ name: "", title: "Full Name" }]);
    expect(guess.nameField).toBe("");
  });
});

describe("guessEmailFromName", () => {
  it("joins the parts of a name with dots", () => {
    expect(guessEmailFromName("Ahmad Faiz Rahman", DOMAIN)).toBe("ahmad.faiz.rahman@pmw-group.com");
  });

  it("drops Malay patronymic connectors", () => {
    expect(guessEmailFromName("Ahmad Faiz bin Rahman", DOMAIN)).toBe("ahmad.faiz.rahman@pmw-group.com");
    expect(guessEmailFromName("Nurul Aisyah binti Osman", DOMAIN)).toBe("nurul.aisyah.osman@pmw-group.com");
    expect(guessEmailFromName("Suresh a/l Muniandy", DOMAIN)).toBe("suresh.muniandy@pmw-group.com");
  });

  it("drops honorifics", () => {
    expect(guessEmailFromName("Dr. Ahmad Faiz", DOMAIN)).toBe("ahmad.faiz@pmw-group.com");
    expect(guessEmailFromName("Puan Siti Aminah", DOMAIN)).toBe("siti.aminah@pmw-group.com");
  });

  it("keeps name parts that only look like connectors in other cultures", () => {
    expect(guessEmailFromName("Jan van Dijk", DOMAIN)).toBe("jan.van.dijk@pmw-group.com");
  });

  it("strips accents, which no mail system keeps", () => {
    expect(guessEmailFromName("José Ramírez", DOMAIN)).toBe("jose.ramirez@pmw-group.com");
  });

  it("collapses stray punctuation and repeated spaces", () => {
    expect(guessEmailFromName("  Ahmad   Faiz-Rahman  ", DOMAIN)).toBe("ahmad.faiz.rahman@pmw-group.com");
  });

  it("drops a lone initial rather than guessing around it", () => {
    expect(guessEmailFromName("M Ahmad Faiz", DOMAIN)).toBe("ahmad.faiz@pmw-group.com");
  });

  it("handles a single-word name", () => {
    expect(guessEmailFromName("Rahman", DOMAIN)).toBe("rahman@pmw-group.com");
  });

  it("tolerates the domain being written with a leading @", () => {
    expect(guessEmailFromName("Ahmad Faiz", "@pmw-group.com")).toBe("ahmad.faiz@pmw-group.com");
  });

  it("answers blank rather than something shaped like nobody's address", () => {
    expect(guessEmailFromName("", DOMAIN)).toBe("");
    expect(guessEmailFromName("Dr.", DOMAIN)).toBe("");
    expect(guessEmailFromName("Ahmad Faiz", "")).toBe("");
  });
});

describe("isPersonEmail", () => {
  it("accepts an ordinary address", () => {
    expect(isPersonEmail("ahmad.faiz@pmw-group.com")).toBe(true);
  });

  it("rejects the placeholder a public submission records", () => {
    expect(isPersonEmail("GUEST")).toBe(false);
    expect(isPersonEmail("guest@pmw-group.com")).toBe(false);
  });

  it("rejects anything that is not an address", () => {
    expect(isPersonEmail("")).toBe(false);
    expect(isPersonEmail("Ahmad Faiz")).toBe(false);
  });
});

describe("readHarvestConfig", () => {
  it("reads the settings off a form that was switched on", () => {
    expect(readHarvestConfig({
      layers: [],
      directoryHarvest: { enabled: true, nameField: "FullName", departmentField: "Department" },
    })).toEqual({
      enabled: true,
      nameField: "FullName",
      employeeIdField: undefined,
      departmentField: "Department",
      emailField: undefined,
    });
  });

  it("reads as off for a form that predates the feature", () => {
    expect(readHarvestConfig({ layers: [] })).toBeNull();
  });

  it("reads as off when the switch is off", () => {
    expect(readHarvestConfig({ directoryHarvest: { enabled: false, nameField: "FullName" } })).toBeNull();
  });

  it("reads as off rather than throwing on a malformed value", () => {
    expect(readHarvestConfig(null)).toBeNull();
    expect(readHarvestConfig("not json")).toBeNull();
    expect(readHarvestConfig({ directoryHarvest: "yes" })).toBeNull();
  });
});

describe("hasEvaluationLayer", () => {
  it("sees an evaluation step in the main workflow", () => {
    expect(hasEvaluationLayer({ layers: [{ type: "approval" }, { type: "evaluation" }] })).toBe(true);
  });

  it("sees an evaluation step inside a manual branch", () => {
    expect(hasEvaluationLayer({
      layers: [],
      manualBranches: [{ layers: [{ type: "evaluation" }] }],
    })).toBe(true);
  });

  it("says no for an approval-only workflow", () => {
    expect(hasEvaluationLayer({ layers: [{ type: "approval" }] })).toBe(false);
  });

  it("says no rather than throwing on a malformed config", () => {
    expect(hasEvaluationLayer(null)).toBe(false);
    expect(hasEvaluationLayer({ layers: "none" })).toBe(false);
  });
});

describe("buildHarvestCandidate", () => {
  const config = {
    enabled: true,
    nameField: "FullName",
    employeeIdField: "EmployeeId",
    departmentField: "Department",
  };

  it("reads the person off the form and keys them on the submitter's address", () => {
    expect(buildHarvestCandidate({
      config,
      data: { FullName: "Ahmad Faiz", EmployeeId: "E-1042", Department: "Safety" },
      submittedBy: "Ahmad.Faiz@PMW-Group.com",
      domain: DOMAIN,
    })).toEqual({
      personEmail: "ahmad.faiz@pmw-group.com",
      personName: "Ahmad Faiz",
      employeeId: "E-1042",
      department: "Safety",
      emailWasGuessed: false,
    });
  });

  it("prefers an address the form itself asked for", () => {
    const result = buildHarvestCandidate({
      config: { ...config, emailField: "Email" },
      data: { FullName: "Ahmad Faiz", Email: "a.faiz@pmw-group.com", Department: "Safety" },
      submittedBy: "clerk@pmw-group.com",
      domain: DOMAIN,
    });
    expect(result).toMatchObject({ personEmail: "a.faiz@pmw-group.com", emailWasGuessed: false });
  });

  it("builds the address from the name when a public link recorded no submitter", () => {
    const result = buildHarvestCandidate({
      config,
      data: { FullName: "Ahmad Faiz", Department: "Safety" },
      submittedBy: "GUEST",
      domain: DOMAIN,
    });
    expect(result).toMatchObject({ personEmail: "ahmad.faiz@pmw-group.com", emailWasGuessed: true });
  });

  it("harvests nobody when there is no address and no name to build one from", () => {
    expect(buildHarvestCandidate({
      config,
      data: { Department: "Safety" },
      submittedBy: "GUEST",
      domain: DOMAIN,
    })).toBeNull();
  });

  it("harvests nobody when the field mapping matched none of the answers", () => {
    expect(buildHarvestCandidate({
      config,
      data: { Q1: "yes" },
      submittedBy: "ahmad.faiz@pmw-group.com",
      domain: DOMAIN,
    })).toBeNull();
  });

  it("harvests nobody from a form that was never switched on", () => {
    expect(buildHarvestCandidate({
      config: { ...config, enabled: false },
      data: { FullName: "Ahmad Faiz" },
      submittedBy: "ahmad.faiz@pmw-group.com",
      domain: DOMAIN,
    })).toBeNull();
  });
});

describe("harvestSource", () => {
  it("marks a real submitter address as merely auto", () => {
    expect(harvestSource(candidate())).toBe(DIRECTORY_SOURCE.auto);
  });

  it("marks a constructed address so the admin knows to check it", () => {
    expect(harvestSource(candidate({ emailWasGuessed: true }))).toBe(DIRECTORY_SOURCE.autoEmailGuessed);
  });
});

describe("harvestApproverEmail", () => {
  it("points the person at their department's HOD", () => {
    expect(harvestApproverEmail(candidate(), "Hod.Safety@PMW-Group.com")).toBe("hod.safety@pmw-group.com");
  });

  it("leaves the HOD themselves at the top of the line", () => {
    expect(harvestApproverEmail(
      candidate({ personEmail: "hod.safety@pmw-group.com" }),
      "hod.safety@pmw-group.com",
    )).toBe("");
  });

  it("leaves the approver blank when the department has no HOD listed", () => {
    expect(harvestApproverEmail(candidate(), "")).toBe("");
  });

  it("leaves the approver blank rather than storing an invalid address", () => {
    expect(harvestApproverEmail(candidate(), "not an email")).toBe("");
  });
});

describe("harvestNote", () => {
  it("says who was added and which parts were guessed", () => {
    const note = harvestNote(candidate({ emailWasGuessed: true }), "hod.safety@pmw-group.com");
    expect(note).toContain("Ahmad Faiz was not in the Approval Directory");
    expect(note).toContain("hod.safety@pmw-group.com");
    expect(note).toContain("built from their name");
    expect(note).toContain("Approval routing page");
  });

  it("says plainly when no approver could be guessed", () => {
    const note = harvestNote(candidate(), "");
    expect(note).toContain("no approver could be guessed");
  });

  it("falls back to the address when the form gave no name", () => {
    expect(harvestNote(candidate({ personName: "" }), "")).toContain("ahmad.faiz@pmw-group.com");
  });

  it("stays on one line, so it cannot break the routing notes it joins", () => {
    expect(harvestNote(candidate({ emailWasGuessed: true }), "hod@pmw-group.com")).not.toContain("\n");
  });
});

describe("the src/ and api/ copies", () => {
  it("stay identical apart from the header pointing at the other one", () => {
    const root = resolve(__dirname, "../../..");
    const read = (path: string) =>
      readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n").split("\n");

    const client = read("src/utils/directoryHarvest.ts");
    const server = read("api/_utils/directoryHarvest.ts");

    expect(server.length).toBe(client.length);
    const differing = client
      .map((line, index) => (line === server[index] ? null : index))
      .filter((index): index is number => index !== null);

    // Both submission paths must harvest identically; a guest submission and a
    // signed-in one describe the same person. Anything differing beyond the
    // header means the two have drifted.
    expect(differing.length).toBe(1);
    expect(client[differing[0]]).toContain("api/_utils/directoryHarvest.ts");
  });
});

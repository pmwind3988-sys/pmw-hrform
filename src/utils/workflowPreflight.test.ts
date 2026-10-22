import { describe, it, expect } from "vitest";
import type { LayerConfigItem } from "../types";
import type { ApprovalDirectoryRow } from "./approvalDirectorySchema";
import {
  checkForm,
  departmentDirectoryKey,
  tallyChecks,
  type PreflightEnvironment,
  type PreflightFormInput,
} from "./workflowPreflight";

const survey = (...questions: Record<string, unknown>[]) => ({ pages: [{ name: "p1", elements: questions }] });

const departmentQuestion = { type: "dropdown", name: "department", choices: ["Finance", "HR", "Logistics"] };

const person = (email: string, approverEmail: string, extra: Partial<ApprovalDirectoryRow> = {}): ApprovalDirectoryRow => ({
  personEmail: email,
  personName: email.split("@")[0],
  department: "Finance",
  company: "",
  position: "",
  employeeId: "",
  approverEmail,
  isActive: true,
  source: "",
  confirmed: true,
  ...extra,
});

const columnsFor = (layers: number) => [
  "FormStatus",
  "CurrentLayer",
  ...Array.from({ length: layers }, (_, i) => i + 1).flatMap((n) => [
    `L${n}_Status`, `L${n}_Email`, `L${n}_Emails`, `L${n}_NotifyEmails`, `L${n}_ActedBy`,
    `L${n}_ActedByName`, `L${n}_ActedByPosition`, `L${n}_SignedAt`, `L${n}_Signature`, `L${n}_OnBehalfOf`,
  ]),
];

const deptLayer: LayerConfigItem = {
  layerNumber: 1,
  type: "approval",
  authMode: "365",
  title: "HOD",
  confirmationType: "button",
  allowRejectionReason: true,
  assignee: { type: "department-approver", value: "department", roleValue: "HOD" },
} as unknown as LayerConfigItem;

const userLayer = (layerNumber: number, email: string, extra: Record<string, unknown> = {}): LayerConfigItem => ({
  layerNumber,
  type: "approval",
  authMode: "365",
  title: `Step ${layerNumber}`,
  confirmationType: "button",
  allowRejectionReason: true,
  assignee: { type: "user", value: email },
  ...extra,
}) as unknown as LayerConfigItem;

function env(overrides: Partial<PreflightEnvironment> = {}): PreflightEnvironment {
  return {
    directoryRows: [person("ali@x.com", "boss@x.com"), person("boss@x.com", "", { position: "HOD" })],
    directoryUsable: true,
    departmentDirectories: new Map([
      [departmentDirectoryKey({ roleValue: "HOD" }), [
        { id: 1, department: "Finance", approverName: "Siti", approverEmail: "siti@x.com", role: "HOD" },
        { id: 2, department: "HR", approverName: "Siti", approverEmail: "siti@x.com", role: "HOD" },
      ]],
    ]),
    expandDistributionList: async () => [],
    manualPaperAddress: "paper@x.com",
    now: new Date("2026-10-22T00:00:00Z"),
    ...overrides,
  };
}

function form(layers: LayerConfigItem[], questions: Record<string, unknown>[] = [departmentQuestion], extra: Partial<PreflightFormInput> = {}): PreflightFormInput {
  return {
    title: "Leave",
    slug: "leave",
    version: "1.0",
    isPublic: true,
    responseColumns: columnsFor(layers.length),
    profiles: [{
      key: "production",
      label: "Production",
      status: "active",
      expiresAt: "",
      surveyJson: survey(...questions),
      layerConfig: { version: "1.0", layers },
    }],
    ...extra,
  };
}

const onlyStep = async (input: PreflightFormInput, environment = env()) =>
  (await checkForm(input, environment)).profiles[0].workflows[0].steps[0];

describe("checkForm — department lookup", () => {
  it("tries every department and groups those that reach the same person", async () => {
    const step = await onlyStep(form([deptLayer]));
    const routed = step.groups.find((g) => g.outcome === "routed");
    expect(routed?.cases).toEqual(["Department: Finance", "Department: HR"]);
    expect(routed?.to).toEqual(["siti@x.com"]);
  });

  it("warns when a department has nobody listed, and names it", async () => {
    const step = await onlyStep(form([deptLayer]));
    const parked = step.groups.find((g) => g.outcome === "parked");
    expect(parked?.cases).toEqual(["Department: Logistics"]);
    expect(step.verdict).toBe("warn");
  });

  it("fails when no department reaches anybody", async () => {
    const step = await onlyStep(form([deptLayer]), env({ departmentDirectories: new Map([[departmentDirectoryKey({ roleValue: "HOD" }), []]]) }));
    expect(step.verdict).toBe("fail");
  });

  it("fails when the department question is missing from the form", async () => {
    const step = await onlyStep(form([deptLayer], [{ type: "text", name: "name" }]));
    expect(step.verdict).toBe("fail");
    expect(step.findings.some((f) => f.message.includes('"department"'))).toBe(true);
  });

  it("treats two approvers for one department as unroutable", async () => {
    const key = departmentDirectoryKey({ roleValue: "HOD" });
    const step = await onlyStep(form([deptLayer], [{ type: "dropdown", name: "department", choices: ["Finance"] }]), env({
      departmentDirectories: new Map([[key, [
        { id: 1, department: "Finance", approverName: "A", approverEmail: "a@x.com", role: "HOD" },
        { id: 2, department: "finance", approverName: "B", approverEmail: "b@x.com", role: "HOD" },
      ]]]),
    }));
    expect(step.groups[0].outcome).toBe("parked");
    expect(step.groups[0].detail).toContain("More than one");
  });
});

describe("checkForm — fixed people and recipients", () => {
  it("passes a step that goes to one valid person", async () => {
    const step = await onlyStep(form([userLayer(1, "boss@x.com")]));
    expect(step.verdict).toBe("pass");
    expect(step.groups[0].to).toEqual(["boss@x.com"]);
  });

  it("refuses an invalid fixed address", async () => {
    const step = await onlyStep(form([userLayer(1, "not-an-email")]));
    expect(step.verdict).toBe("fail");
    expect(step.groups[0].outcome).toBe("error");
  });

  it("addresses a notify-only step to the shared mailbox", async () => {
    const step = await onlyStep(form([userLayer(1, "boss@x.com", { notifyEmails: ["team@x.com"], notifyRecipientMode: "notify-only" })]));
    expect(step.groups[0].actors).toEqual(["boss@x.com"]);
    expect(step.groups[0].to).toEqual(["team@x.com"]);
  });

  it("fails a notify-only step with no mailbox named", async () => {
    const step = await onlyStep(form([userLayer(1, "boss@x.com", { notifyRecipientMode: "notify-only" })]));
    expect(step.verdict).toBe("fail");
  });

  it("recognises the paper-handling mailbox", async () => {
    const step = await onlyStep(form([userLayer(1, "paper@x.com")]));
    expect(step.groups[0].outcome).toBe("paper");
  });

  it("adds a PA from the directory and wants the column that records it", async () => {
    const withPa = env({ directoryRows: [person("boss@x.com", "", { delegateEmails: "pa@x.com" })] });
    const input = form([userLayer(1, "boss@x.com")]);
    input.responseColumns = (input.responseColumns ?? []).filter((c) => c !== "L1_OnBehalfOf");
    const step = await onlyStep(input, withPa);
    expect(step.groups[0].actors).toEqual(["boss@x.com", "pa@x.com"]);
    expect(step.findings.some((f) => f.message.includes("L1_OnBehalfOf"))).toBe(true);
  });
});

describe("checkForm — response list", () => {
  it("fails a step whose status column is missing", async () => {
    const input = form([userLayer(1, "boss@x.com")]);
    input.responseColumns = ["FormStatus", "CurrentLayer", "L1_Email"];
    const step = await onlyStep(input);
    expect(step.verdict).toBe("fail");
  });

  it("only warns about the newer optional columns", async () => {
    const input = form([userLayer(1, "boss@x.com")]);
    input.responseColumns = ["FormStatus", "CurrentLayer", "L1_Status", "L1_Email"];
    const step = await onlyStep(input);
    expect(step.verdict).toBe("warn");
  });

  it("fails the form when its response list cannot be read", async () => {
    const result = await checkForm(form([userLayer(1, "boss@x.com")], [departmentQuestion], { responseColumns: null }), env());
    expect(result.verdict).toBe("fail");
  });
});

describe("checkForm — reporting line", () => {
  const chain = (startFrom: string, hops = 1) => ({
    layerNumber: 1,
    type: "approval",
    authMode: "365",
    title: "Manager",
    assignee: { type: "chain", startFrom, value: "", hops },
  }) as unknown as LayerConfigItem;

  it("tries every person in the directory as the submitter", async () => {
    const step = await onlyStep(form([chain("submitter")]));
    expect(step.groups.find((g) => g.outcome === "routed")?.cases).toEqual(["Submitted by ali"]);
    // boss has nobody above them.
    expect(step.groups.find((g) => g.outcome === "parked")?.cases).toEqual(["Submitted by boss"]);
  });

  it("starts a previous-approver step from whoever the step before reached", async () => {
    const second = { ...chain("previous-actor"), layerNumber: 2 } as LayerConfigItem;
    const rows = [person("ali@x.com", "boss@x.com"), person("boss@x.com", "ceo@x.com")];
    const result = await checkForm(form([userLayer(1, "ali@x.com"), second]), env({ directoryRows: rows }));
    const step = result.profiles[0].workflows[0].steps[1];
    expect(step.groups[0].cases).toEqual(["Previous step decided by ali@x.com"]);
    expect(step.groups[0].to).toEqual(["boss@x.com"]);
  });
});

describe("checkForm — exceptions, branches, profiles", () => {
  it("lists an exception as its own case and checks its question exists", async () => {
    const layer = { ...deptLayer, submitterRoutingRules: [
      { id: "r1", label: "Exception 1", action: "assign-evaluator", evaluatorEmail: "joe@x.com", employeeIdField: "employeeID", employeeIdValue: "SL009" },
    ] } as LayerConfigItem;
    const step = await onlyStep(form([layer], [departmentQuestion, { type: "text", name: "employeeID" }]));
    const rule = step.groups.find((g) => g.cases[0].startsWith("Exception"));
    expect(rule?.to).toEqual(["joe@x.com"]);
    const missing = await onlyStep(form([layer]));
    expect(missing.findings.some((f) => f.message.includes('"employeeID"'))).toBe(true);
  });

  it("checks every branch of a branched form", async () => {
    const input = form([], [departmentQuestion], { responseColumns: columnsFor(1) });
    input.profiles[0].layerConfig = { version: "1.0", layers: [], manualBranches: [
      { name: "a", label: "A", layers: [userLayer(1, "boss@x.com")] },
      { name: "b", label: "B", layers: [userLayer(1, "bad")] },
    ] };
    const result = await checkForm(input, env());
    expect(result.profiles[0].workflows.map((w) => w.steps[0].verdict)).toEqual(["pass", "fail"]);
  });

  it("does not let a switched-off profile fail the form", async () => {
    const input = form([userLayer(1, "boss@x.com")]);
    input.profiles.push({ ...input.profiles[0], key: "old", status: "off", layerConfig: { version: "1.0", layers: [userLayer(1, "bad")] } });
    const result = await checkForm(input, env());
    expect(result.profiles[1].verdict).toBe("fail");
    expect(result.verdict).toBe("pass");
    expect(tallyChecks([result])).toEqual({ forms: 1, steps: 1, pass: 1, warn: 0, fail: 0 });
  });

  it("fails an expired public reviewer link", async () => {
    const step = await onlyStep(form([userLayer(1, "boss@x.com", { authMode: "public", tokenExpiresAt: "2026-01-01T00:00:00Z" })]));
    expect(step.verdict).toBe("fail");
  });
});

describe("checkForm — email delivery and opening the step (nothing sent)", () => {
  const kinds: Record<string, "user" | "shared" | "group" | "missing"> = {
    "boss@x.com": "user",
    "gone@x.com": "missing",
    "team@x.com": "shared",
    "vendor@outside.com": "missing",
  };
  const withDirectory = (overrides: Partial<PreflightEnvironment> = {}) => env({
    lookupMailbox: async (email) => kinds[email] ?? "user",
    companyDomains: ["x.com"],
    ...overrides,
  });

  it("confirms delivery and sign-in for a real company account", async () => {
    const step = await onlyStep(form([userLayer(1, "boss@x.com")]), withDirectory());
    expect(step.verdict).toBe("pass");
    expect(step.passes.some((p) => p.startsWith("The email would be delivered"))).toBe(true);
    expect(step.passes.some((p) => p.includes("sign in and open this step"))).toBe(true);
    expect(step.passes).toContain("The email builds correctly (built here, not sent)");
  });

  it("fails a company address with no mailbox", async () => {
    const step = await onlyStep(form([userLayer(1, "gone@x.com")]), withDirectory());
    expect(step.verdict).toBe("fail");
    expect(step.findings.some((f) => f.message.includes("would bounce"))).toBe(true);
  });

  it("only warns about delivery outside the company, but nobody outside can sign in", async () => {
    const step = await onlyStep(form([userLayer(1, "vendor@outside.com")]), withDirectory());
    expect(step.findings.find((f) => f.message.includes("outside the company"))?.level).toBe("warn");
    expect(step.findings.find((f) => f.message.includes("cannot sign in"))?.level).toBe("fail");
  });

  it("lets an outside reviewer on a public step open it from the link", async () => {
    const step = await onlyStep(form([userLayer(1, "vendor@outside.com", { authMode: "public" })]), withDirectory());
    expect(step.verdict).toBe("warn");
    expect(step.passes.some((p) => p.includes("emailed link"))).toBe(true);
  });

  it("fails a shared mailbox as the reviewer", async () => {
    const step = await onlyStep(form([userLayer(1, "team@x.com")]), withDirectory());
    expect(step.findings.some((f) => f.level === "fail" && f.message.includes("shared or disabled"))).toBe(true);
  });

  it("says so, without failing, when the directory cannot be reached", async () => {
    const step = await onlyStep(form([userLayer(1, "boss@x.com")]), withDirectory({ lookupMailbox: async () => "unknown" }));
    expect(step.verdict).toBe("pass");
    expect(step.findings.some((f) => f.level === "info" && f.message.includes("could not be reached"))).toBe(true);
  });

  it("reads the form's email log as proof that sending works", async () => {
    const sent = await checkForm(form([userLayer(1, "boss@x.com")], [departmentQuestion], {
      emailHistory: { lastSentAt: "2026-10-20T01:00:00Z", lastFailedAt: "2026-10-01T01:00:00Z", lastError: "old" },
    }), env());
    expect(sent.passes[0]).toContain("2026-10-20");
    const failing = await checkForm(form([userLayer(1, "boss@x.com")], [departmentQuestion], {
      emailHistory: { lastSentAt: "2026-10-01T01:00:00Z", lastFailedAt: "2026-10-20T01:00:00Z", lastError: "Mailbox not found" },
    }), env());
    expect(failing.verdict).toBe("warn");
    expect(failing.findings[0].message).toContain("Mailbox not found");
  });
});

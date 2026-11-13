import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  inspectLayerRouting,
  type InspectableLayer,
  type RoutingInspectPorts,
  type SubjectDirectory,
  type SubjectDirectoryRow,
} from "../routingInspect";
import type { DirectoryPerson, ResolvableLayer } from "../resolveAssignee";

function person(email: string, extra: Partial<DirectoryPerson> = {}): DirectoryPerson {
  return { email, name: email.split("@")[0], department: "", position: "", approverEmail: "", ...extra };
}

const ali: SubjectDirectoryRow = { personEmail: "ali@pmw.com", personName: "Ali bin Abu", employeeId: "SG 010", approverEmail: "HOD@pmw.com" };

function subjectDirectory(extra: Partial<SubjectDirectory> = {}) {
  return vi.fn(async (): Promise<SubjectDirectory> => ({ usable: true, rows: [ali], questions: [], layerConfig: null, ...extra }));
}

/** A public-link submission whose answers name the employee by staff number. */
const guestItem = { SubmittedBy: "GUEST", staffNumber: "sg010", L2_Email: "hod@pmw.com", L2_Emails: "hod@pmw.com" };
const deptLayer = (): InspectableLayer => layer({ assignee: { type: "department-approver", value: "department" } });

function ports(overrides: Partial<RoutingInspectPorts> = {}): RoutingInspectPorts {
  return {
    resolveLayer: vi.fn(async () => ({ email: "hod@pmw.com", emails: ["hod@pmw.com"], explanation: "Chain: hod." })),
    loadSubjectDirectory: subjectDirectory({ rows: [] }),
    lookupPerson: vi.fn(async () => null),
    paperMailbox: "",
    ...overrides,
  };
}

function layer(extra: Partial<InspectableLayer> = {}): InspectableLayer {
  return {
    layerNumber: 2,
    title: "HOD evaluation",
    type: "evaluation",
    authMode: "365",
    assignee: { type: "user", value: "hod@pmw.com" },
    ...extra,
  };
}

const staffItem = { SubmittedBy: "staff@pmw.com", L2_Email: "hod@pmw.com", L2_Emails: "hod@pmw.com" };

describe("inspectLayerRouting", () => {
  it("leaves a hand reassignment alone", async () => {
    const item = {
      ...staffItem,
      WorkflowAssignmentData: JSON.stringify({
        version: 1,
        layers: { "2": { layer: 2, email: "x@pmw.com", source: "manual-override", updatedBy: "a", updatedAt: "t", history: [] } },
      }),
    };
    const p = ports();
    const { verdict } = await inspectLayerRouting(layer(), item, 1, p);
    expect(verdict.kind).toBe("manual");
    expect(p.resolveLayer).not.toHaveBeenCalled();
  });

  it("calls a parked step unresolved", async () => {
    const { verdict } = await inspectLayerRouting(layer(), { ...staffItem, L2_Status: "Needs Routing" }, 1, ports());
    expect(verdict.kind).toBe("unresolved");
    expect(verdict.note).toBe("Waiting for someone to name the person (needs routing). Use Reconfigure this submission to set it.");
  });

  it("calls a step on paper unresolved", async () => {
    const { verdict } = await inspectLayerRouting(layer(), { ...staffItem, L2_Status: "Manual Evaluation Required" }, 1, ports());
    expect(verdict.kind).toBe("unresolved");
    expect(verdict.note).toBe("On paper handling. Use Reconfigure this submission to change it.");
  });

  it("waits on a step that follows an earlier actor who has not acted", async () => {
    const deferred = layer({ assignee: { type: "chain", value: "", startFrom: "previous-actor", hops: 1 } });
    const { verdict } = await inspectLayerRouting(deferred, staffItem, 1, ports());
    expect(verdict.kind).toBe("waiting");
  });

  it("compares against the evaluator a submitter rule names", async () => {
    const rules = [{ id: "r", label: "r", emailValue: "staff@pmw.com", action: "assign-evaluator" as const, evaluatorEmail: "rule@pmw.com" }];
    const p = ports();
    const matched = await inspectLayerRouting(layer({ submitterRoutingRules: rules }), { ...staffItem, L2_Emails: "rule@pmw.com" }, 1, p);
    expect(matched.verdict.kind).toBe("match");
    expect(matched.verdict.how).toBe("A submitter routing rule set on the workflow page names this evaluator.");
    expect(matched.routedPrimary).toBe("rule@pmw.com");
    expect(p.resolveLayer).not.toHaveBeenCalled();

    const mismatched = await inspectLayerRouting(layer({ submitterRoutingRules: rules }), staffItem, 1, ports());
    expect(mismatched.verdict.kind).toBe("mismatch");
    expect(mismatched.verdict.routed).toEqual(["rule@pmw.com"]);
  });

  it("has no answer when a submitter rule sends the step to paper", async () => {
    const rules = [{ id: "r", label: "r", emailValue: "staff@pmw.com", action: "manual-paper" as const }];
    const { verdict } = await inspectLayerRouting(layer({ submitterRoutingRules: rules }), staffItem, 1, ports());
    expect(verdict.kind).toBe("unresolved");
    expect(verdict.note).toBe("A submitter routing rule sends this step to paper handling. Use Reconfigure this submission to change it.");
  });

  it("follows the routing page one hop up from a staff submitter on a department-approver step", async () => {
    const p = ports();
    const dept = layer({ assignee: { type: "department-approver", value: "department" } });
    const { verdict } = await inspectLayerRouting(dept, staffItem, 1, p);
    expect(verdict.kind).toBe("match");
    expect(verdict.how).toBe("Routing page (Approval Directory): Chain: hod.");
    const handed = vi.mocked(p.resolveLayer).mock.calls[0][0] as ResolvableLayer;
    expect(handed.assignee.type).toBe("chain");
    expect(handed.assignee.startFrom).toBe("submitter");
    expect(handed.assignee.hops).toBe(1);
    expect(handed.assignee.fallback?.mode).toBe("park");
    expect(handed.layerNumber).toBe(2);
  });

  it("looks a public-link submission's employee up from the form's answers", async () => {
    const p = ports({ loadSubjectDirectory: subjectDirectory() });
    const { verdict, routedPrimary, checkFailed } = await inspectLayerRouting(deptLayer(), guestItem, 1, p);
    expect(p.loadSubjectDirectory).toHaveBeenCalled();
    expect(p.resolveLayer).not.toHaveBeenCalled();
    expect(verdict.kind).toBe("match");
    expect(routedPrimary).toBe("hod@pmw.com");
    expect(verdict.how).toBe("Routing page (Approval Directory): Ali bin Abu (SG 010), taken from the form's answers, is approved by hod@pmw.com.");
    expect(checkFailed).toBeUndefined();
  });

  it("finds the employee through a question's title when its stored name says nothing", async () => {
    const item = { SubmittedBy: "GUEST", question7: "SG010", L2_Emails: "hod@pmw.com" };
    const withoutTitles = await inspectLayerRouting(deptLayer(), item, 1, ports({ loadSubjectDirectory: subjectDirectory() }));
    expect(withoutTitles.verdict.kind).toBe("unresolved");

    const withTitles = await inspectLayerRouting(deptLayer(), item, 1, ports({
      loadSubjectDirectory: subjectDirectory({ questions: [{ name: "question7", title: "Staff Number" }] }),
    }));
    expect(withTitles.verdict.kind).toBe("match");
    expect(withTitles.routedPrimary).toBe("hod@pmw.com");
  });

  it("says which fields it tried when nothing usable is in the answers", async () => {
    const item = { SubmittedBy: "GUEST", L2_Emails: "hod@pmw.com" };
    const { verdict, checkFailed } = await inspectLayerRouting(deptLayer(), item, 1, ports({ loadSubjectDirectory: subjectDirectory() }));
    expect(verdict.kind).toBe("unresolved");
    expect(verdict.note).toBe("The form has no usable submitter address, and no employee email, staff number or name could be found to look up on the routing page."
      + " Fields tried (guessed from labels): name = none, staff number = none, email = none.");
    expect(checkFailed).toBeUndefined();
  });

  it("names the form settings' fields when the form has a harvest mapping", async () => {
    const layerConfig = { directoryHarvest: { enabled: true, nameField: "fullName", employeeIdField: "staffNo" } };
    const item = { SubmittedBy: "GUEST", L2_Emails: "hod@pmw.com" };
    const { verdict } = await inspectLayerRouting(deptLayer(), item, 1, ports({ loadSubjectDirectory: subjectDirectory({ layerConfig }) }));
    expect(verdict.note).toBe("The form has no usable submitter address, and no employee email, staff number or name could be found to look up on the routing page."
      + " Fields tried (form settings): name = fullName, staff number = staffNo, email = none.");
  });

  it("reports an unreadable directory as a failed check, not as no answer", async () => {
    const { verdict, checkFailed } = await inspectLayerRouting(deptLayer(), guestItem, 1, ports({
      loadSubjectDirectory: subjectDirectory({ usable: false, rows: [] }),
    }));
    expect(verdict.kind).toBe("unresolved");
    expect(verdict.note).toBe("The Approval Directory could not be read.");
    expect(checkFailed).toBe("The Approval Directory could not be read.");
  });

  it("reports a directory read that throws as a failed check", async () => {
    const { verdict, checkFailed } = await inspectLayerRouting(deptLayer(), guestItem, 1, ports({
      loadSubjectDirectory: vi.fn(async () => { throw new Error("Graph timed out"); }),
    }));
    expect(verdict.kind).toBe("unresolved");
    expect(verdict.note).toBe("Graph timed out");
    expect(checkFailed).toBe("Graph timed out");
  });

  it("has no answer, and no failed check, when the form's employee is not in the directory", async () => {
    const { verdict, checkFailed } = await inspectLayerRouting(deptLayer(), guestItem, 1, ports());
    expect(verdict.kind).toBe("unresolved");
    expect(verdict.note).toBe("The employee on the form is not in the Approval Directory (checked staff number, email and name), so the routing page has no approver for them.");
    expect(checkFailed).toBeUndefined();
  });

  it("has no answer when the form's employee has no approver", async () => {
    const p = ports({ loadSubjectDirectory: subjectDirectory({ rows: [{ ...ali, approverEmail: "" }] }) });
    const { verdict, checkFailed } = await inspectLayerRouting(deptLayer(), guestItem, 1, p);
    expect(verdict.kind).toBe("unresolved");
    expect(verdict.note).toBe("Ali bin Abu has no approver on the routing page.");
    expect(checkFailed).toBeUndefined();
  });

  it("leaves a parked resolver answer as a genuine gap", async () => {
    const { checkFailed } = await inspectLayerRouting(layer(), staffItem, 1, ports({
      resolveLayer: vi.fn(async () => ({ email: "", emails: [], parked: { reason: "Nobody listed." } })),
    }));
    expect(checkFailed).toBeUndefined();
  });

  it("reports a stand-in lookup that throws as a failed check", async () => {
    const { verdict, checkFailed } = await inspectLayerRouting(layer(), staffItem, 1, ports({
      lookupPerson: vi.fn(async () => { throw new Error("Directory offline"); }),
    }));
    expect(verdict.kind).toBe("match");
    expect(checkFailed).toContain("Directory offline");
  });

  it("does not count a fallback as routing's answer", async () => {
    const p = ports({
      resolveLayer: vi.fn(async () => ({ email: "hod@pmw.com", emails: ["hod@pmw.com"], explanation: "Fell back to the fixed approver." })),
    });
    const { verdict } = await inspectLayerRouting(layer(), staffItem, 1, p);
    expect(verdict.kind).toBe("unresolved");
    expect(verdict.note).toBe("Fell back to the fixed approver. Fix the Approval Directory on the Routing page, then check again.");
    expect(verdict.routed).toEqual([]);
  });

  it("does not count the paper mailbox as routing's answer", async () => {
    const p = ports({
      paperMailbox: "paper@pmw.com",
      resolveLayer: vi.fn(async () => ({ email: "Paper@pmw.com", emails: ["Paper@pmw.com"] })),
    });
    const { verdict } = await inspectLayerRouting(layer(), staffItem, 1, p);
    expect(verdict.kind).toBe("unresolved");
    expect(verdict.note).toBe("Routing points to the paper mailbox, which needs paper handling. Use Reconfigure this submission.");
  });

  it("matches the same people in another order and case", async () => {
    const p = ports({ resolveLayer: vi.fn(async () => ({ email: "a@pmw.com", emails: ["a@pmw.com", "b@pmw.com"] })) });
    const { verdict } = await inspectLayerRouting(layer(), { ...staffItem, L2_Emails: "B@pmw.com; a@pmw.com" }, 1, p);
    expect(verdict.kind).toBe("match");
  });

  it("includes the routed person's stand-in on every branch", async () => {
    const lookupPerson = vi.fn(async (email: string) =>
      email.toLowerCase() === "hod@pmw.com" ? person("hod@pmw.com", { name: "Hod", delegateEmails: ["pa@pmw.com"] }) : null);
    const saved = { ...staffItem, L2_Emails: "hod@pmw.com; pa@pmw.com" };

    const viaResolver = await inspectLayerRouting(layer(), saved, 1, ports({ lookupPerson }));
    expect(viaResolver.verdict.kind).toBe("match");
    expect(viaResolver.routedPrimary).toBe("hod@pmw.com");

    const rules = [{ id: "r", label: "r", emailValue: "staff@pmw.com", action: "assign-evaluator" as const, evaluatorEmail: "hod@pmw.com" }];
    const viaRule = await inspectLayerRouting(layer({ submitterRoutingRules: rules }), saved, 1, ports({ lookupPerson }));
    expect(viaRule.verdict.kind).toBe("match");
    expect(viaRule.verdict.routed).toEqual(["hod@pmw.com", "pa@pmw.com"]);

    const viaSubject = await inspectLayerRouting(
      layer({ assignee: { type: "department-approver", value: "department" } }),
      { ...saved, SubmittedBy: "GUEST", staffNumber: "SG010" },
      1,
      ports({ lookupPerson, loadSubjectDirectory: subjectDirectory() }),
    );
    expect(viaSubject.verdict.kind).toBe("match");
    expect(viaSubject.verdict.routed).toEqual(["hod@pmw.com", "pa@pmw.com"]);
  });

  it("has no answer, with the error text, when the resolver throws", async () => {
    const p = ports({ resolveLayer: vi.fn(async () => { throw new Error("SharePoint is down"); }) });
    const { verdict, checkFailed } = await inspectLayerRouting(layer(), staffItem, 1, p);
    expect(verdict.kind).toBe("unresolved");
    expect(verdict.note).toBe("SharePoint is down");
    expect(checkFailed).toBe("SharePoint is down");
  });

  it("passes a resolver's error and parked reason through", async () => {
    const errored = await inspectLayerRouting(layer(), staffItem, 1, ports({
      resolveLayer: vi.fn(async () => ({ email: "", emails: [], error: "Bad address." })),
    }));
    expect(errored.verdict.note).toBe("Bad address.");
    const parked = await inspectLayerRouting(layer(), staffItem, 1, ports({
      resolveLayer: vi.fn(async () => ({ email: "", emails: [], parked: { reason: "Nobody listed." } })),
    }));
    expect(parked.verdict.note).toBe("Nobody listed.");
  });

  it("says where a fixed person comes from when the resolver does not", async () => {
    const p = ports({ resolveLayer: vi.fn(async () => ({ email: "hod@pmw.com", emails: ["hod@pmw.com"] })) });
    const { verdict } = await inspectLayerRouting(layer(), staffItem, 1, p);
    expect(verdict.how).toBe("A fixed person set on the workflow page (hod@pmw.com). The routing page is not used for this layer.");
    expect(verdict.title).toBe("HOD evaluation");
    expect(verdict.type).toBe("evaluation");
  });
});

describe("the src/ and api/ copies", () => {
  const root = resolve(__dirname, "../../..");
  const read = (path: string) =>
    readFileSync(resolve(root, path), "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/^\/\*\*[\s\S]*?\*\/\n/, "");

  for (const file of ["routingInspect", "routingCheck", "evaluationSubmitterRouting", "resolutionContext", "layerParkStatus"]) {
    it(`${file}.ts stays identical below its header`, () => {
      expect(read(`api/_utils/${file}.ts`)).toBe(read(`src/utils/${file}.ts`));
    });
  }
});

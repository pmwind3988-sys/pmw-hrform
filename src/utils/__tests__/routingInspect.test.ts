import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { inspectLayerRouting, type InspectableLayer, type RoutingInspectPorts } from "../routingInspect";
import type { DirectoryPerson, ResolvableLayer } from "../resolveAssignee";

function person(email: string, extra: Partial<DirectoryPerson> = {}): DirectoryPerson {
  return { email, name: email.split("@")[0], department: "", position: "", approverEmail: "", ...extra };
}

function ports(overrides: Partial<RoutingInspectPorts> = {}): RoutingInspectPorts {
  return {
    resolveLayer: vi.fn(async () => ({ email: "hod@pmw.com", emails: ["hod@pmw.com"], explanation: "Chain: hod." })),
    lookupSubject: vi.fn(async () => null),
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
    const p = ports({ lookupSubject: vi.fn(async () => person("ali@pmw.com", { name: "Ali", approverEmail: "HOD@pmw.com" })) });
    const dept = layer({ assignee: { type: "department-approver", value: "department" } });
    const item = { ...staffItem, SubmittedBy: "GUEST" };
    const { verdict, routedPrimary } = await inspectLayerRouting(dept, item, 1, p);
    expect(p.lookupSubject).toHaveBeenCalledWith(item);
    expect(p.resolveLayer).not.toHaveBeenCalled();
    expect(verdict.kind).toBe("match");
    expect(routedPrimary).toBe("hod@pmw.com");
    expect(verdict.how).toBe("Routing page (Approval Directory): Ali, taken from the form's answers, is approved by hod@pmw.com.");
  });

  it("has no answer when the form's employee is not in the directory", async () => {
    const dept = layer({ assignee: { type: "department-approver", value: "department" } });
    const { verdict } = await inspectLayerRouting(dept, { ...staffItem, SubmittedBy: "GUEST" }, 1, ports());
    expect(verdict.kind).toBe("unresolved");
    expect(verdict.note).toBe("The employee on the form is not in the Approval Directory (checked staff number, email and name), so the routing page has no approver for them.");
  });

  it("has no answer when the form's employee has no approver", async () => {
    const p = ports({ lookupSubject: vi.fn(async () => person("ali@pmw.com", { name: "Ali" })) });
    const dept = layer({ assignee: { type: "department-approver", value: "department" } });
    const { verdict } = await inspectLayerRouting(dept, { ...staffItem, SubmittedBy: "GUEST" }, 1, p);
    expect(verdict.kind).toBe("unresolved");
    expect(verdict.note).toBe("Ali has no approver on the routing page.");
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
      { ...saved, SubmittedBy: "GUEST" },
      1,
      ports({ lookupPerson, lookupSubject: vi.fn(async () => person("ali@pmw.com", { approverEmail: "hod@pmw.com" })) }),
    );
    expect(viaSubject.verdict.kind).toBe("match");
    expect(viaSubject.verdict.routed).toEqual(["hod@pmw.com", "pa@pmw.com"]);
  });

  it("has no answer, with the error text, when the resolver throws", async () => {
    const p = ports({ resolveLayer: vi.fn(async () => { throw new Error("SharePoint is down"); }) });
    const { verdict } = await inspectLayerRouting(layer(), staffItem, 1, p);
    expect(verdict.kind).toBe("unresolved");
    expect(verdict.note).toBe("SharePoint is down");
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

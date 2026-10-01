import { describe, it, expect } from "vitest";
import { classifyLayerRouting } from "./routingCheck";

const base = { saved: ["ali@x.com"], routed: ["ali@x.com"], manualOverride: false };

describe("classifyLayerRouting", () => {
  it("matches the same people regardless of order or case", () => {
    expect(classifyLayerRouting({ ...base, saved: ["B@x.com", "a@x.com"], routed: ["a@x.com", "b@x.com"] }).kind).toBe("match");
  });

  it("flags a different person", () => {
    expect(classifyLayerRouting({ ...base, routed: ["siti@x.com"] }).kind).toBe("mismatch");
  });

  it("flags a saved set that is missing a routed person", () => {
    expect(classifyLayerRouting({ ...base, routed: ["ali@x.com", "siti@x.com"] }).kind).toBe("mismatch");
  });

  it("flags an empty saved layer when routing has an answer", () => {
    expect(classifyLayerRouting({ ...base, saved: [] }).kind).toBe("mismatch");
  });

  it("never overrides a hand reassignment", () => {
    expect(classifyLayerRouting({ ...base, routed: ["siti@x.com"], manualOverride: true }).kind).toBe("manual");
  });

  it("offers no fix when routing has no answer", () => {
    const verdict = classifyLayerRouting({ ...base, routed: [], routingProblem: "no HOD for Finance" });
    expect(verdict).toEqual({ kind: "unresolved", note: "no HOD for Finance" });
  });

  it("offers no fix for paper or parked layers", () => {
    expect(classifyLayerRouting({ ...base, routed: ["siti@x.com"], holdReason: "On paper" }).kind).toBe("unresolved");
  });

  it("waits on layers that depend on an earlier actor", () => {
    expect(classifyLayerRouting({ ...base, routed: [], waitingReason: "later" }).kind).toBe("waiting");
  });
});

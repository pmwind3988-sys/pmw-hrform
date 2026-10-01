import { describe, it, expect } from "vitest";
import { classifyLayerRouting, findDirectoryPerson } from "./routingCheck";

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

describe("findDirectoryPerson", () => {
  const rows = [
    { personEmail: "a@x.com", personName: "Ali", employeeId: "SG010" },
    { personEmail: "b@x.com", personName: "Siti", employeeId: "PC 069" },
  ];
  const who = (employeeId: string) => ({ email: "", employeeId, name: "" });

  it("treats a spaced staff number and an unspaced one as the same", () => {
    expect(findDirectoryPerson(rows, who("SG 010"))?.personEmail).toBe("a@x.com");
    expect(findDirectoryPerson(rows, who("PC069"))?.personEmail).toBe("b@x.com");
  });

  it("ignores letter case and surrounding spaces", () => {
    expect(findDirectoryPerson(rows, who(" sg010 "))?.personEmail).toBe("a@x.com");
  });

  it("lets the staff number decide over a name that points elsewhere", () => {
    expect(findDirectoryPerson(rows, { email: "", employeeId: "SG 010", name: "Siti" })?.personEmail).toBe("a@x.com");
  });

  it("falls back to the address, then to a name only one row carries", () => {
    expect(findDirectoryPerson(rows, { email: "B@x.com", employeeId: "", name: "" })?.personEmail).toBe("b@x.com");
    expect(findDirectoryPerson(rows, { email: "", employeeId: "", name: "Ali" })?.personEmail).toBe("a@x.com");
  });

  it("refuses an ambiguous name and an unknown number", () => {
    const twins = [...rows, { personEmail: "c@x.com", personName: "Ali", employeeId: "XY1" }];
    expect(findDirectoryPerson(twins, { email: "", employeeId: "", name: "Ali" })).toBeUndefined();
    expect(findDirectoryPerson(rows, who("ZZ 999"))).toBeUndefined();
  });
});

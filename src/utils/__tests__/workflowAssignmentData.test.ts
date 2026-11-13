import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MAX_ROUTING_CHECKS,
  parseWorkflowAssignmentData,
  readRoutingChecks,
  recordRoutingCheck,
  setWorkflowAssignmentOverride,
} from "../workflowAssignmentData";
import type { RoutingCheckEntry } from "../workflowAssignmentData";

function entry(overrides: Partial<RoutingCheckEntry> = {}): RoutingCheckEntry {
  return {
    at: "2026-11-13T00:00:00.000Z",
    layer: 1,
    trigger: "daily-run",
    outcome: "held-no-routing",
    saved: ["a@pmw.com"],
    routed: [],
    ...overrides,
  };
}

describe("readRoutingChecks", () => {
  it("is empty for blank, malformed or check-less input", () => {
    expect(readRoutingChecks("")).toEqual([]);
    expect(readRoutingChecks("{not json")).toEqual([]);
    expect(readRoutingChecks(null)).toEqual([]);
    expect(readRoutingChecks(JSON.stringify({ version: 1, layers: {} }))).toEqual([]);
    expect(readRoutingChecks(JSON.stringify({ version: 1, layers: {}, checks: "x" }))).toEqual([]);
  });

  it("reads stored checks and skips junk entries", () => {
    const raw = JSON.stringify({ version: 1, layers: {}, checks: [entry(), 5, { layer: 2 }] });
    expect(readRoutingChecks(raw)).toEqual([entry()]);
  });
});

describe("recordRoutingCheck", () => {
  it("appends the first check as new", () => {
    const result = recordRoutingCheck("", entry());
    expect(result.isNew).toBe(true);
    expect(result.count).toBe(1);
    expect(result.data.checks).toEqual([entry()]);
  });

  it("bumps the count when the same hold repeats", () => {
    const first = recordRoutingCheck("", entry({ at: "2026-11-13T00:00:00.000Z" }));
    const second = recordRoutingCheck(JSON.stringify(first.data), entry({ at: "2026-11-14T00:00:00.000Z" }));
    expect(second.isNew).toBe(false);
    expect(second.count).toBe(2);
    expect(second.data.checks).toHaveLength(1);
    expect(second.data.checks?.[0]).toMatchObject({
      at: "2026-11-14T00:00:00.000Z",
      firstAt: "2026-11-13T00:00:00.000Z",
      count: 2,
    });
  });

  it("compares address lists regardless of order and case", () => {
    const first = recordRoutingCheck("", entry({ saved: ["A@pmw.com", "b@pmw.com"] }));
    const second = recordRoutingCheck(first.data, entry({ saved: ["b@pmw.com", "a@pmw.com"] }));
    expect(second.isNew).toBe(false);
  });

  it("appends when the outcome differs on the same layer", () => {
    const first = recordRoutingCheck("", entry());
    const second = recordRoutingCheck(first.data, entry({ outcome: "corrected", routed: ["c@pmw.com"] }));
    expect(second.isNew).toBe(true);
    expect(second.count).toBe(1);
    expect(second.data.checks).toHaveLength(2);
  });

  it("still de-duplicates when another layer's entry sits in between", () => {
    let data = recordRoutingCheck("", entry({ layer: 1 })).data;
    data = recordRoutingCheck(data, entry({ layer: 2 })).data;
    const again = recordRoutingCheck(data, entry({ layer: 1 }));
    expect(again.isNew).toBe(false);
    expect(again.count).toBe(2);
    expect(again.data.checks).toHaveLength(2);
  });

  it("keeps only the newest checks", () => {
    let data = parseWorkflowAssignmentData("");
    for (let i = 0; i < MAX_ROUTING_CHECKS + 1; i += 1) {
      data = recordRoutingCheck(data, entry({ layer: i + 1 })).data;
    }
    expect(data.checks).toHaveLength(MAX_ROUTING_CHECKS);
    expect(data.checks?.[0].layer).toBe(2);
    expect(data.checks?.[MAX_ROUTING_CHECKS - 1].layer).toBe(MAX_ROUTING_CHECKS + 1);
  });
});

describe("checks survive the other writers", () => {
  it("parseWorkflowAssignmentData keeps checks and never writes an empty array", () => {
    const withChecks = recordRoutingCheck("", entry()).data;
    expect(parseWorkflowAssignmentData(JSON.stringify(withChecks)).checks).toEqual([entry()]);
    expect("checks" in parseWorkflowAssignmentData(JSON.stringify({ version: 1, layers: {}, checks: [] }))).toBe(false);
    expect("checks" in parseWorkflowAssignmentData("")).toBe(false);
  });

  it("setWorkflowAssignmentOverride keeps existing checks", () => {
    const raw = JSON.stringify(recordRoutingCheck("", entry()).data);
    const data = setWorkflowAssignmentOverride(raw, {
      layer: 1,
      email: "x@pmw.com",
      updatedBy: "hr@pmw.com",
      updatedAt: "2026-11-13T01:00:00.000Z",
    });
    expect(data.checks).toEqual([entry()]);
    expect(data.layers["1"].email).toBe("x@pmw.com");
  });
});

describe("the src/ and api/ copies", () => {
  it("stay identical apart from the header pointing at the other one", () => {
    const root = resolve(__dirname, "../../..");
    const read = (path: string) =>
      readFileSync(resolve(root, path), "utf8")
        .replace(/\r\n/g, "\n")
        .replace(/^\/\*\*[\s\S]*?\*\/\n/, "");

    expect(read("api/_utils/workflowAssignmentData.ts")).toBe(read("src/utils/workflowAssignmentData.ts"));
  });
});

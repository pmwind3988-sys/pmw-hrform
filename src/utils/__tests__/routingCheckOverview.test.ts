import { describe, expect, it } from "vitest";
import {
  compileRoutingChecks,
  matchesRoutingCheckSearch,
  matchesRoutingCheckView,
  withinRoutingCheckPeriod,
} from "../routingCheckOverview";
import type { RoutingCheckEntry } from "../workflowAssignmentData";

const check = (overrides: Partial<RoutingCheckEntry>): RoutingCheckEntry => ({
  at: "2026-11-10T00:00:00.000Z",
  layer: 2,
  trigger: "daily-run",
  outcome: "match",
  saved: ["hod@pmw.com"],
  routed: ["hod@pmw.com"],
  ...overrides,
});

const raw = (checks: RoutingCheckEntry[]) => JSON.stringify({ version: 1, layers: {}, checks });

describe("compileRoutingChecks", () => {
  it("lists every submission's checks together, newest first", () => {
    const lines = compileRoutingChecks([
      { formTitle: "Training Evaluation Form", itemId: 7, assignmentRaw: raw([
        check({ at: "2026-11-01T00:00:00.000Z" }),
        check({ at: "2026-11-12T00:00:00.000Z", outcome: "corrected", saved: ["old@pmw.com"], routed: ["new@pmw.com"] }),
      ]) },
      { formTitle: "Training Evaluation Form", itemId: 9, assignmentRaw: raw([
        check({ at: "2026-11-05T00:00:00.000Z", outcome: "held-no-routing", routed: [] }),
      ]) },
    ]);
    expect(lines.map((line) => [line.itemId, line.outcome])).toEqual([
      [7, "corrected"],
      [9, "held-no-routing"],
      [7, "match"],
    ]);
    expect(new Set(lines.map((line) => line.key)).size).toBe(3);
  });

  it("gives nothing for rows with no log, a blank column or broken text", () => {
    expect(compileRoutingChecks([
      { formTitle: "A", itemId: 1, assignmentRaw: "" },
      { formTitle: "A", itemId: 2, assignmentRaw: undefined },
      { formTitle: "A", itemId: 3, assignmentRaw: "{not json" },
      { formTitle: "A", itemId: 4, assignmentRaw: JSON.stringify({ version: 1, layers: {} }) },
    ])).toEqual([]);
  });
});

describe("views, period and search", () => {
  const [line] = compileRoutingChecks([
    { formTitle: "Training Evaluation Form", itemId: 12, assignmentRaw: raw([
      check({ outcome: "held-check-failed", note: "The Approval Directory could not be read." }),
    ]) },
  ]);

  it("puts both kinds of hold under On hold", () => {
    expect(matchesRoutingCheckView(line, "held")).toBe(true);
    expect(matchesRoutingCheckView(line, "corrected")).toBe(false);
    expect(matchesRoutingCheckView(line, "all")).toBe(true);
  });

  it("counts the period back from now", () => {
    const now = new Date("2026-11-20T00:00:00.000Z");
    expect(withinRoutingCheckPeriod(line, "30", now)).toBe(true);
    expect(withinRoutingCheckPeriod(line, "30", new Date("2027-01-20T00:00:00.000Z"))).toBe(false);
    expect(withinRoutingCheckPeriod(line, "90", new Date("2027-01-20T00:00:00.000Z"))).toBe(true);
    expect(withinRoutingCheckPeriod(line, "all", new Date("2030-01-01T00:00:00.000Z"))).toBe(true);
    expect(withinRoutingCheckPeriod({ ...line, at: "not a date" }, "30", now)).toBe(false);
  });

  it("searches the form, the submission number, the people and the reason", () => {
    expect(matchesRoutingCheckSearch(line, "")).toBe(true);
    expect(matchesRoutingCheckSearch(line, "  #12 ")).toBe(true);
    expect(matchesRoutingCheckSearch(line, "HOD@pmw")).toBe(true);
    expect(matchesRoutingCheckSearch(line, "could not be read")).toBe(true);
    expect(matchesRoutingCheckSearch(line, "training evaluation")).toBe(true);
    expect(matchesRoutingCheckSearch(line, "nobody@elsewhere")).toBe(false);
  });
});

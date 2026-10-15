import { describe, expect, it } from "vitest";

import { isSummaryCompanion, nextDigestRunAt } from "./workflowSummaryHold.js";
import type { WorkflowEmailScheduleEntry } from "./workflowEmail.js";

const RUN = new Date("2026-10-16T00:00:00.000Z");
const KEY = "hod@pmw-group.com";

function entry(extra: Partial<WorkflowEmailScheduleEntry> = {}): WorkflowEmailScheduleEntry {
  return {
    layer: 2, recipient: "HOD@pmw-group.com", dueAt: "2026-10-15T00:00:00.000Z", status: "scheduled",
    updatedAt: "2026-10-01T00:00:00.000Z", layerType: "evaluation", totalLayers: 2,
    reviewLink: "https://pmw-hrform.vercel.app/eval/training-evaluation/7/2", submittedBy: "s@pmw-group.com",
    ...extra,
  };
}

const fields = { CurrentLayer: 2 };
const other = { sameRow: false };

describe("nextDigestRunAt", () => {
  it("is the coming 00:00 UTC, even when called just after one", () => {
    expect(nextDigestRunAt(new Date("2026-10-15T06:30:00.000Z")).toISOString()).toBe("2026-10-16T00:00:00.000Z");
    expect(nextDigestRunAt(new Date("2026-10-15T00:00:01.000Z")).toISOString()).toBe("2026-10-16T00:00:00.000Z");
    expect(nextDigestRunAt(new Date("2026-12-31T23:59:00.000Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("isSummaryCompanion", () => {
  it("counts another signed-in email due to the same person by the next run", () => {
    expect(isSummaryCompanion(entry(), fields, KEY, RUN, other)).toBe(true);
    expect(isSummaryCompanion(entry({ dueAt: "2026-10-16T00:00:00.000Z" }), fields, KEY, RUN, other)).toBe(true);
    expect(isSummaryCompanion(entry({ status: "failed", attempts: 1 }), fields, KEY, RUN, other)).toBe(true);
  });

  it("ignores anything that will not go out in that run's summary", () => {
    expect(isSummaryCompanion(entry({ dueAt: "2026-10-17T00:00:00.000Z" }), fields, KEY, RUN, other)).toBe(false);
    expect(isSummaryCompanion(entry({ status: "sent" }), fields, KEY, RUN, other)).toBe(false);
    expect(isSummaryCompanion(entry({ attempts: 5 }), fields, KEY, RUN, other)).toBe(false);
    expect(isSummaryCompanion(entry({ recipient: "other@pmw-group.com" }), fields, KEY, RUN, other)).toBe(false);
    expect(isSummaryCompanion(entry({ reviewLink: "https://x/eval/tok?item=7&k=y" }), fields, KEY, RUN, other)).toBe(false);
    expect(isSummaryCompanion(entry(), { CurrentLayer: 3 }, KEY, RUN, other)).toBe(false);
    expect(isSummaryCompanion(entry(), { ...fields, IsTest: "true" }, KEY, RUN, other)).toBe(false);
    expect(isSummaryCompanion(entry(), fields, KEY, RUN, { sameRow: true })).toBe(false);
  });
});

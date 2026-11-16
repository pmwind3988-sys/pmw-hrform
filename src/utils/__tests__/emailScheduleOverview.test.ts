import { describe, expect, it } from "vitest";

import { compileEmailSchedule, emailScheduleLabel, isUpcoming, type EmailScheduleRow } from "../emailScheduleOverview";

const NOW = new Date("2026-10-15T06:00:00.000Z"); // next run: 2026-10-16T00:00Z

function row(itemId: number, entry: Record<string, unknown>, extra: Partial<EmailScheduleRow> = {}): EmailScheduleRow {
  const layer = Number(entry.layer ?? 2);
  return {
    formTitle: "Training Evaluation",
    itemId,
    submittedBy: `t${itemId}@pmw-group.com`,
    currentLayer: layer,
    isTest: false,
    scheduleRaw: JSON.stringify({
      [layer]: {
        layer, recipient: "hod@pmw-group.com", dueAt: "2026-10-15T00:00:00.000Z", status: "scheduled",
        updatedAt: "2026-10-01T00:00:00.000Z", layerType: "evaluation",
        reviewLink: `https://pmw-hrform.vercel.app/eval/training-evaluation/${itemId}/${layer}`,
        ...entry,
      },
    }),
    logRaw: "",
    ...extra,
  };
}

describe("compileEmailSchedule", () => {
  it("puts two due to one person into one summary, and a lone one on its own", () => {
    const entries = compileEmailSchedule([
      row(1, {}),
      row(2, { recipient: "HOD@pmw-group.com", heldForSummary: true }),
      row(3, { recipient: "other@pmw-group.com" }),
    ], NOW);
    const byId = Object.fromEntries(entries.map((e) => [e.itemId, e]));
    expect(byId[1].state).toBe("next-summary");
    expect(byId[1].summarySize).toBe(2);
    expect(emailScheduleLabel(byId[2])).toBe("Held for next summary · 2 requests");
    expect(byId[3].state).toBe("next-alone");
  });

  it("never bundles public links or test runs", () => {
    const entries = compileEmailSchedule([
      row(1, { reviewLink: "https://pmw-hrform.vercel.app/eval/tok?item=1&k=x" }),
      row(2, {}, { isTest: true }),
      row(3, {}),
    ], NOW);
    expect(entries.every((e) => e.state === "next-alone")).toBe(true);
  });

  it("separates later, failed, stopped and sent", () => {
    const entries = compileEmailSchedule([
      row(1, { dueAt: "2027-01-10T00:00:00.000Z" }),
      row(2, { status: "failed", attempts: 2 }),
      row(3, { status: "failed", attempts: 5 }),
      row(4, { status: "sent" }, {
        logRaw: JSON.stringify({ 2: { status: "sent", recipient: "hod@pmw-group.com", attempts: 1, lastAttemptAt: "2026-10-14T00:00:01.000Z", sentAt: "2026-10-14T00:00:01.000Z", via: "summary", summarySize: 6 } }),
      }),
      row(5, { status: "sent" }),
    ], NOW);
    const byId = Object.fromEntries(entries.map((e) => [e.itemId, e]));
    expect(byId[1].state).toBe("later");
    expect(byId[2].state).toBe("failed");
    expect(byId[3].state).toBe("stopped");
    expect(emailScheduleLabel(byId[4])).toBe("Sent in a summary of 6");
    expect(byId[4].selectable).toBe(false);
    expect(byId[5].state).toBe("sent-alone");
    expect(entries[0].state).toBe("failed");
  });

  it("puts an entry whose latest routing check is a hold under needs attention", () => {
    const checks = (outcomes: string[]) => JSON.stringify({
      checks: outcomes.map((outcome, index) => ({
        at: `2026-10-1${index}T00:00:00.000Z`, layer: 2, trigger: "daily-run", outcome, saved: [], routed: [],
      })),
    });
    const entries = compileEmailSchedule([
      row(1, {}, { assignmentRaw: checks(["match", "held-no-routing"]) }),
      row(2, {}, { assignmentRaw: checks(["held-check-failed", "corrected"]) }),
      row(3, {}, { assignmentRaw: checks(["held-no-routing"]).replace('"layer":2', '"layer":1') }),
      row(4, { status: "sent" }, { assignmentRaw: checks(["held-no-routing"]) }),
    ], NOW);
    const byId = Object.fromEntries(entries.map((e) => [e.itemId, e]));
    expect(byId[1].state).toBe("held");
    expect(emailScheduleLabel(byId[1])).toBe("On hold: routing has no answer");
    expect(byId[1].selectable).toBe(false);
    expect(entries[0].itemId).toBe(1);
    expect(byId[2].state).not.toBe("held");
    expect(byId[3].state).not.toBe("held");
    expect(byId[4].state).toBe("sent-alone");
  });

  it("drops an unsent schedule for a step the submission has moved past", () => {
    expect(compileEmailSchedule([row(1, {}, { currentLayer: 3 })], NOW)).toHaveLength(0);
  });
});

describe("isUpcoming", () => {
  it("covers the next run and anything due within three months, not beyond or already sent", () => {
    const entries = compileEmailSchedule([
      row(1, {}),
      row(2, { dueAt: "2026-12-01T00:00:00.000Z" }),
      row(3, { dueAt: "2027-01-15T09:00:00.000Z" }),
      row(4, { dueAt: "2027-01-17T00:00:00.000Z" }),
      row(5, { status: "sent" }),
    ], NOW);
    const upcoming = Object.fromEntries(entries.map((e) => [e.itemId, isUpcoming(e, NOW)]));
    expect(upcoming).toEqual({ 1: true, 2: true, 3: true, 4: false, 5: false });
  });
});

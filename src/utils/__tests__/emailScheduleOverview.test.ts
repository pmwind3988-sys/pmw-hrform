import { describe, expect, it } from "vitest";

import { compileEmailSchedule, emailScheduleLabel, type EmailScheduleRow } from "../emailScheduleOverview";

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

  it("drops an unsent schedule for a step the submission has moved past", () => {
    expect(compileEmailSchedule([row(1, {}, { currentLayer: 3 })], NOW)).toHaveLength(0);
  });
});

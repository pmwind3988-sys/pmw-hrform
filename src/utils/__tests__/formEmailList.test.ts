import { describe, expect, it } from "vitest";

import { formEmailCounts, formEmailEntries } from "../formEmailList";
import type { Submission } from "../../types";

const NOW = new Date("2026-10-15T06:00:00.000Z");

const SENT = (sentAt: string, extra: Record<string, unknown> = {}) =>
  ({ status: "sent", recipient: "hod@pmw-group.com", attempts: 1, lastAttemptAt: sentAt, sentAt, ...extra });

function submission(
  id: number,
  log: Record<number, unknown> | null,
  extra: { layer?: number; status?: string; formStatus?: string | null; isTest?: boolean } = {},
): Submission {
  const layer = extra.layer ?? 2;
  return {
    id: String(id),
    listTitle: "Training Evaluation Form",
    submittedByEmail: `t${id}@pmw-group.com`,
    formStatus: extra.formStatus === undefined ? "In Review" : extra.formStatus,
    isTest: extra.isTest ?? false,
    layerConfig: { version: "1.0", layers: [{ layerNumber: 1, type: "approval" }, { layerNumber: 2, type: "evaluation" }] },
    emailColumns: {
      currentLayer: layer,
      scheduleRaw: "",
      logRaw: log ? JSON.stringify(log) : "",
      assignmentRaw: "",
      layerStatuses: extra.status ? { [layer]: extra.status } : {},
    },
  } as unknown as Submission;
}

describe("formEmailEntries", () => {
  it("lists only steps whose email went out and that nobody has acted on, longest waiting first", () => {
    const entries = formEmailEntries([
      submission(1, { 2: SENT("2026-10-10T01:00:00.000Z") }),
      submission(2, null), // scheduled for later: nobody asked yet
      submission(3, { 2: SENT("2026-10-01T01:00:00.000Z", { reminders: 2 }) }),
      submission(4, { 2: SENT("2026-10-01T01:00:00.000Z") }, { status: "Approved" }),
      submission(5, { 2: SENT("2026-10-01T01:00:00.000Z") }, { formStatus: "Completed" }),
      submission(6, { 1: SENT("2026-10-01T01:00:00.000Z") }), // step 1's email; now at step 2, not yet emailed
    ], NOW);
    expect(entries.map((entry) => entry.submission.id)).toEqual(["3", "1"]);
    expect(entries[0]).toMatchObject({ layer: 2, layerType: "evaluation", daysWaiting: 14, overdue: true, reminders: 2 });
    expect(entries[1]).toMatchObject({ daysWaiting: 5, overdue: false, reminders: 0 });
    expect(formEmailCounts(entries)).toEqual({ waiting: 2, overdue: 1 });
  });

  it("leaves out rejected, parked, paper and test-run steps", () => {
    const sent = { 2: SENT("2026-10-10T01:00:00.000Z") };
    const entries = formEmailEntries([
      submission(1, sent, { status: "Rejected at Layer 2" }),
      submission(2, sent, { status: "Needs Routing" }),
      submission(3, sent, { status: "Manual Evaluation Required" }),
      submission(4, sent, { isTest: true }),
      submission(5, sent, { layer: 1 }), // log is for step 2, the row is at step 1
    ], NOW);
    expect(entries).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { formEmailCounts, formEmailEntries } from "../formEmailList";
import type { Submission } from "../../types";

const NOW = new Date("2026-10-15T06:00:00.000Z");

function submission(id: number, entry: Record<string, unknown>, log: Record<string, unknown> | null = null, extra: Partial<Submission> = {}): Submission {
  return {
    id: String(id),
    listTitle: "Training Evaluation Form",
    submittedByEmail: `t${id}@pmw-group.com`,
    isTest: false,
    emailColumns: {
      currentLayer: 2,
      scheduleRaw: JSON.stringify({
        2: {
          layer: 2, recipient: "hod@pmw-group.com", status: "scheduled", updatedAt: "2026-10-01T00:00:00.000Z",
          layerType: "evaluation", reviewLink: `https://pmw-hrform.vercel.app/eval/training-evaluation-form/${id}/2`,
          dueAt: "2026-10-15T00:00:00.000Z",
          ...entry,
        },
      }),
      logRaw: log ? JSON.stringify({ 2: log }) : "",
      assignmentRaw: "",
      layerStatuses: {},
    },
    ...extra,
  } as Submission;
}

const SENT_LOG = (sentAt: string) => ({ status: "sent", recipient: "hod@pmw-group.com", attempts: 1, lastAttemptAt: sentAt, sentAt });

describe("formEmailEntries", () => {
  it("lists emails still to go soonest first, then sent ones newest first", () => {
    const entries = formEmailEntries([
      submission(1, { status: "sent" }, SENT_LOG("2026-10-01T00:00:00.000Z")),
      submission(2, { dueAt: "2027-01-10T00:00:00.000Z" }),
      submission(3, {}),
      submission(4, { status: "sent" }, SENT_LOG("2026-10-10T00:00:00.000Z")),
    ], NOW);
    expect(entries.map((entry) => entry.itemId)).toEqual([3, 2, 4, 1]);
    expect(formEmailCounts(entries)).toEqual({ sent: 2, pending: 2 });
  });

  it("adds emails that went out at once, which only the sent-email log records", () => {
    const sentAtOnce: Submission = {
      ...submission(5, {}),
      layerConfig: { version: "1.0", layers: [{ layerNumber: 1, type: "approval" }, { layerNumber: 2, type: "evaluation" }] },
      emailColumns: {
        currentLayer: 2,
        scheduleRaw: "",
        logRaw: JSON.stringify({
          1: { ...SENT_LOG("2026-10-02T00:00:00.000Z"), recipient: "boss@pmw-group.com" },
          2: SENT_LOG("2026-10-05T00:00:00.000Z"),
        }),
        assignmentRaw: "",
        layerStatuses: {},
      },
    } as Submission;
    const entries = formEmailEntries([sentAtOnce, submission(6, {})], NOW);
    expect(entries.map((entry) => [entry.itemId, entry.layer, entry.layerType, entry.state])).toEqual([
      [6, 2, "evaluation", "next-alone"],
      [5, 2, "evaluation", "sent-alone"],
      [5, 1, "approval", "sent-alone"],
    ]);
    expect(entries[2].recipient).toBe("boss@pmw-group.com");
  });

  it("does not list a scheduled email twice when the log also has it", () => {
    const entries = formEmailEntries([submission(7, { status: "sent" }, SENT_LOG("2026-10-01T00:00:00.000Z"))], NOW);
    expect(entries).toHaveLength(1);
  });

  it("leaves out test runs and rows without email columns", () => {
    const entries = formEmailEntries([
      submission(1, {}, null, { isTest: true }),
      submission(2, {}, null, { emailColumns: undefined }),
      submission(3, {}),
    ], NOW);
    expect(entries.map((entry) => entry.itemId)).toEqual([3]);
  });
});

import { describe, expect, it } from "vitest";

import { queueEntryForViewer, sortReviewQueue, type QueueForm } from "./reviewQueue.js";

const NOW = new Date("2026-10-15T00:00:00.000Z");
const HOD = "hod@pmw-group.com";

const form: QueueForm = {
  title: "Training Evaluation",
  slug: "training-evaluation",
  layerConfig: {
    layers: [
      { layerNumber: 1, type: "approval", authMode: "365", title: "Supervisor" },
      { layerNumber: 2, type: "evaluation", authMode: "365", title: "HOD evaluation" },
    ],
  },
};

function row(fields: Record<string, unknown> = {}) {
  return {
    id: "42",
    fields: {
      CurrentLayer: 2,
      L1_Status: "Approved",
      L1_SignedAt: "2026-07-01T00:00:00.000Z",
      L2_Status: "Pending",
      L2_Email: HOD,
      SubmittedBy: "trainee@pmw-group.com",
      ...fields,
    },
  };
}

describe("queueEntryForViewer", () => {
  it("lists a signed-in step assigned to the viewer, with its signed-in link", () => {
    const entry = queueEntryForViewer(form, row(), HOD, NOW);
    expect(entry?.link).toBe("/eval/training-evaluation/42/2");
    expect(entry?.layerType).toBe("evaluation");
    expect(entry?.waitingSince).toBe("2026-07-01T00:00:00.000Z");
  });

  it("matches the address case-insensitively and through the co-assignee list", () => {
    expect(queueEntryForViewer(form, row({ L2_Emails: `other@pmw-group.com; ${HOD}` }), "HOD@PMW-GROUP.COM", NOW)).not.toBeNull();
  });

  it("never lists somebody else's step", () => {
    expect(queueEntryForViewer(form, row(), "someone@pmw-group.com", NOW)).toBeNull();
    // Named on the primary column but dropped from the actor list by a reassignment.
    expect(queueEntryForViewer(form, row({ L2_Emails: "new@pmw-group.com" }), HOD, NOW)).toBeNull();
  });

  it("leaves out finished, parked and closed steps", () => {
    expect(queueEntryForViewer(form, row({ L2_Status: "Confirmed" }), HOD, NOW)).toBeNull();
    expect(queueEntryForViewer(form, row({ L2_Status: "Needs Routing" }), HOD, NOW)).toBeNull();
    expect(queueEntryForViewer(form, row({ L2_Status: "Manual Evaluation Required" }), HOD, NOW)).toBeNull();
    expect(queueEntryForViewer(form, row({ FormStatus: "Completed" }), HOD, NOW)).toBeNull();
  });

  it("leaves out a step that is not the current one, or behind an unfinished earlier step", () => {
    expect(queueEntryForViewer(form, row({ CurrentLayer: 1, L1_Email: "x@pmw-group.com" }), HOD, NOW)).toBeNull();
    expect(queueEntryForViewer(form, row({ L1_Status: "Pending" }), HOD, NOW)).toBeNull();
  });

  it("leaves out public steps, which only their emailed link may open", () => {
    const publicForm: QueueForm = {
      ...form,
      layerConfig: { layers: [form.layerConfig!.layers![0], { layerNumber: 2, type: "evaluation", authMode: "public" }] },
    };
    expect(queueEntryForViewer(publicForm, row(), HOD, NOW)).toBeNull();
  });

  it("leaves out test runs", () => {
    expect(queueEntryForViewer(form, row({ IsTest: "true", TestEmail: "tester@pmw-group.com" }), HOD, NOW)).toBeNull();
  });

  it("waits for a scheduled evaluation's date, then lists it", () => {
    const schedule = (dueAt: string, status = "scheduled") => JSON.stringify({
      "2": { layer: 2, recipient: HOD, dueAt, status, updatedAt: dueAt, layerType: "evaluation", totalLayers: 2, reviewLink: "", submittedBy: "" },
    });
    expect(queueEntryForViewer(form, row({ WorkflowEmailSchedule: schedule("2026-12-01T00:00:00.000Z") }), HOD, NOW)).toBeNull();
    const due = queueEntryForViewer(form, row({ WorkflowEmailSchedule: schedule("2026-10-01T00:00:00.000Z", "sent") }), HOD, NOW);
    expect(due?.waitingSince).toBe("2026-10-01T00:00:00.000Z");
  });

  it("uses the step on the branch the submission took", () => {
    const branched: QueueForm = {
      ...form,
      layerConfig: {
        layers: [{ layerNumber: 2, type: "approval", authMode: "public" }],
        manualBranches: [{ name: "long", layers: [{ layerNumber: 2, type: "evaluation", authMode: "365" }] }],
      },
    };
    expect(queueEntryForViewer(branched, row({ SelectedBranch: "long" }), HOD, NOW)?.layerType).toBe("evaluation");
    expect(queueEntryForViewer(branched, row(), HOD, NOW)).toBeNull();
  });
});

describe("sortReviewQueue", () => {
  it("puts the longest-waiting first", () => {
    const base = queueEntryForViewer(form, row(), HOD, NOW)!;
    const sorted = sortReviewQueue([
      { ...base, responseItemId: "2", waitingSince: "2026-10-10T00:00:00.000Z" },
      { ...base, responseItemId: "1", waitingSince: "2026-09-01T00:00:00.000Z" },
      { ...base, responseItemId: "3", waitingSince: "" },
    ]);
    expect(sorted.map((e) => e.responseItemId)).toEqual(["1", "2", "3"]);
  });
});

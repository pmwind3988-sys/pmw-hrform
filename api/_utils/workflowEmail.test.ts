import { describe, expect, it } from "vitest";
import {
  buildManualPaperWorkflowEmail,
  buildWorkflowActionEmail,
  recordWorkflowEmailAttempt,
  resolveWorkflowEmailDueAt,
  getDueWorkflowEmailSchedules,
  setWorkflowEmailSchedule,
} from "./workflowEmail.js";

const ACTION_EMAIL_BASE = {
  formTitle: "Incident Report",
  submittedBy: "ahmad@example.com",
  responseItemId: 42,
  layer: 1,
  totalLayers: 2,
  recipient: "approver@example.com",
  layerType: "approval" as const,
  reviewLink: "https://example.com/approval/1",
};

describe("reference numbers in workflow emails", () => {
  it("puts the reference in the subject and body of an action email", () => {
    const message = buildWorkflowActionEmail({ ...ACTION_EMAIL_BASE, referenceNo: "OSH-040826-0007" });
    expect(message.subject).toContain("[OSH-040826-0007]");
    expect(message.body).toContain("Reference no.");
    expect(message.body).toContain("OSH-040826-0007");
  });

  it("leaves the subject and body unchanged when the form issues no reference", () => {
    const message = buildWorkflowActionEmail(ACTION_EMAIL_BASE);
    expect(message.subject).toBe("Action required: Incident Report needs your approval");
    expect(message.body).not.toContain("Reference no.");
  });

  it("treats a blank reference as absent rather than printing empty brackets", () => {
    const message = buildWorkflowActionEmail({ ...ACTION_EMAIL_BASE, referenceNo: "   " });
    expect(message.subject).not.toContain("[");
    expect(message.body).not.toContain("Reference no.");
  });

  it("carries the reference into manual paper emails too", () => {
    const message = buildManualPaperWorkflowEmail({
      formTitle: "Incident Report",
      submittedBy: "ahmad@example.com",
      responseItemId: 42,
      layer: 1,
      totalLayers: 2,
      recipient: "hr@example.com",
      layerType: "evaluation",
      referenceNo: "040826-0001",
    });
    expect(message.subject).toContain("[040826-0001]");
    expect(message.body).toContain("040826-0001");
  });

  it("escapes a reference before putting it in the body", () => {
    const message = buildWorkflowActionEmail({ ...ACTION_EMAIL_BASE, referenceNo: "<b>x</b>" });
    expect(message.body).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(message.body).not.toContain("<b>x</b>");
  });
});

describe("recordWorkflowEmailAttempt", () => {
  it("replaces a failed delivery with a successful forced resend while preserving the attempt count", () => {
    const failed = recordWorkflowEmailAttempt("", {
      layer: 2,
      recipient: "evaluator@example.com",
      status: "failed",
      attemptedAt: "2026-06-24T01:00:00.000Z",
      error: "Email delivery failed",
    });

    const resent = recordWorkflowEmailAttempt(JSON.stringify(failed), {
      layer: 2,
      recipient: "evaluator@example.com",
      status: "sent",
      attemptedAt: "2026-06-24T01:05:00.000Z",
    });

    expect(resent["2"]).toEqual({
      layer: 2,
      recipient: "evaluator@example.com",
      status: "sent",
      attempts: 2,
      lastAttemptAt: "2026-06-24T01:05:00.000Z",
      sentAt: "2026-06-24T01:05:00.000Z",
    });
  });
});

describe("workflow email schedules", () => {
  it("supports a three-month deferred evaluator email", () => {
    expect(resolveWorkflowEmailDueAt(
      { mode: "three_months" },
      new Date("2026-01-31T08:00:00.000Z"),
    )).toBe("2026-04-30T08:00:00.000Z");
  });

  it("replaces the schedule for one item layer without changing other layers", () => {
    const initial = setWorkflowEmailSchedule("", {
      layer: 1,
      recipient: "first@example.com",
      dueAt: "2026-07-01T00:00:00.000Z",
      status: "scheduled",
      updatedAt: "2026-06-24T00:00:00.000Z",
      layerType: "evaluation",
      totalLayers: 2,
      reviewLink: "https://example.com/eval/1",
      submittedBy: "submitter@example.com",
    });
    const updated = setWorkflowEmailSchedule(JSON.stringify(initial), {
      layer: 2,
      recipient: "hod@example.com",
      dueAt: "2026-09-24T00:00:00.000Z",
      status: "scheduled",
      updatedAt: "2026-06-24T00:00:00.000Z",
      layerType: "evaluation",
      totalLayers: 2,
      reviewLink: "https://example.com/eval/2",
      submittedBy: "submitter@example.com",
    });

    expect(Object.keys(updated)).toEqual(["1", "2"]);
  });

  it("returns only due scheduled entries", () => {
    const raw = JSON.stringify({
      "1": {
        layer: 1,
        recipient: "due@example.com",
        dueAt: "2026-06-24T07:59:00.000Z",
        status: "scheduled",
        updatedAt: "2026-06-24T00:00:00.000Z",
        layerType: "evaluation",
        totalLayers: 2,
        reviewLink: "https://example.com/1",
        submittedBy: "submitter@example.com",
      },
      "2": {
        layer: 2,
        recipient: "later@example.com",
        dueAt: "2026-06-25T08:00:00.000Z",
        status: "scheduled",
        updatedAt: "2026-06-24T00:00:00.000Z",
        layerType: "evaluation",
        totalLayers: 2,
        reviewLink: "https://example.com/2",
        submittedBy: "submitter@example.com",
      },
    });

    expect(getDueWorkflowEmailSchedules(raw, new Date("2026-06-24T08:00:00.000Z")))
      .toHaveLength(1);
  });
});

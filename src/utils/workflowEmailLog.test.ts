import { describe, expect, it } from "vitest";
import { getWorkflowEmailStatus, overdueDays } from "./workflowEmailLog";

describe("getWorkflowEmailStatus", () => {
  it("returns the current layer delivery state for dashboard verification", () => {
    const raw = JSON.stringify({
      "1": {
        layer: 1,
        recipient: "first@example.com",
        status: "sent",
        attempts: 1,
        lastAttemptAt: "2026-06-24T01:00:00.000Z",
        sentAt: "2026-06-24T01:00:00.000Z",
      },
      "2": {
        layer: 2,
        recipient: "evaluator@example.com",
        status: "failed",
        attempts: 2,
        lastAttemptAt: "2026-06-24T02:00:00.000Z",
        error: "Email delivery failed",
      },
    });

    expect(getWorkflowEmailStatus(raw, 2)).toMatchObject({
      status: "failed",
      recipient: "evaluator@example.com",
      attempts: 2,
    });
  });

  it("returns not_sent when no delivery attempt is recorded", () => {
    expect(getWorkflowEmailStatus("", 3)).toEqual({ status: "not_sent" });
  });
});

describe("overdueDays", () => {
  const sent = (sentAt: string) => ({ status: "sent" as const, recipient: "hod@pmw-group.com", attempts: 1, lastAttemptAt: sentAt, sentAt });

  it("is overdue from the seventh morning after the email, when reminders stop", () => {
    expect(overdueDays(sent("2026-11-02T01:30:00.000Z"), new Date("2026-11-08T00:00:00.000Z"))).toBeNull();
    expect(overdueDays(sent("2026-11-02T01:30:00.000Z"), new Date("2026-11-09T00:00:00.000Z"))).toBe(7);
  });

  it("is never overdue for an email that was not delivered", () => {
    expect(overdueDays({ status: "not_sent" }, new Date("2026-12-01T00:00:00.000Z"))).toBeNull();
  });

  it("reads the reminder count back off the log", () => {
    const raw = JSON.stringify({ 2: { ...sent("2026-11-02T01:30:00.000Z"), reminders: 2, lastReminderAt: "2026-11-09T00:00:00.000Z" } });
    expect(getWorkflowEmailStatus(raw, 2)).toMatchObject({ reminders: 2, lastReminderAt: "2026-11-09T00:00:00.000Z" });
  });
});

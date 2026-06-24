import { describe, expect, it } from "vitest";
import {
  getScheduledWorkflowEmail,
  isValidFutureScheduleDate,
  resolveEvaluationEmailDueAt,
  setScheduledWorkflowEmail,
} from "./workflowEmailSchedule";

describe("evaluation email scheduling", () => {
  it("schedules three calendar months after the layer becomes active", () => {
    expect(resolveEvaluationEmailDueAt(
      { mode: "three_months" },
      new Date("2026-01-31T08:00:00.000Z"),
    )).toBe("2026-04-30T08:00:00.000Z");
  });

  it("schedules a configured number of days after the layer becomes active", () => {
    expect(resolveEvaluationEmailDueAt(
      { mode: "custom_days", customDays: 45 },
      new Date("2026-06-24T08:00:00.000Z"),
    )).toBe("2026-08-08T08:00:00.000Z");
  });

  it("stores and retrieves a per-item layer schedule", () => {
    const raw = setScheduledWorkflowEmail("", {
      layer: 2,
      recipient: "hod@example.com",
      dueAt: "2026-09-24T08:00:00.000Z",
      status: "scheduled",
      updatedAt: "2026-06-24T08:00:00.000Z",
    });

    expect(getScheduledWorkflowEmail(JSON.stringify(raw), 2)).toMatchObject({
      status: "scheduled",
      recipient: "hod@example.com",
      dueAt: "2026-09-24T08:00:00.000Z",
    });
  });

  it("rejects a custom per-item date in the past", () => {
    const now = new Date("2026-06-24T08:00:00.000Z");
    expect(isValidFutureScheduleDate("2026-06-24T07:59:00.000Z", now)).toBe(false);
    expect(isValidFutureScheduleDate("2026-06-24T08:00:00.000Z", now)).toBe(true);
  });
});

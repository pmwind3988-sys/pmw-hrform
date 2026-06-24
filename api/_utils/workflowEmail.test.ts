import { describe, expect, it } from "vitest";
import { recordWorkflowEmailAttempt } from "./workflowEmail.js";

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

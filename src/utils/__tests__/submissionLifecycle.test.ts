import { describe, expect, it } from "vitest";
import {
  LIFECYCLE_STAGES,
  isManualPaperStatus,
  lifecycleLabel,
  resolveLifecycleStage,
} from "../submissionLifecycle";

describe("isManualPaperStatus", () => {
  it("matches both manual paper sentinels case-insensitively", () => {
    expect(isManualPaperStatus("Manual Approval Required")).toBe(true);
    expect(isManualPaperStatus("manual evaluation required")).toBe(true);
    expect(isManualPaperStatus("  Manual Approval Required  ")).toBe(true);
  });

  it("rejects other statuses", () => {
    expect(isManualPaperStatus("Pending")).toBe(false);
    expect(isManualPaperStatus("Approved")).toBe(false);
    expect(isManualPaperStatus(null)).toBe(false);
    expect(isManualPaperStatus(undefined)).toBe(false);
  });
});

describe("resolveLifecycleStage", () => {
  it("treats rejection as terminal, ahead of everything else", () => {
    expect(resolveLifecycleStage({ formStatus: "Rejected" })).toBe("rejected");
    expect(resolveLifecycleStage({ formStatus: "Rejected at Layer 2" })).toBe("rejected");
    // Rejection wins even when the current layer is a manual paper layer.
    expect(
      resolveLifecycleStage({
        formStatus: "Rejected",
        currentLayerStatus: "Manual Approval Required",
      }),
    ).toBe("rejected");
  });

  it("treats completion as terminal", () => {
    expect(resolveLifecycleStage({ formStatus: "Completed" })).toBe("completed");
    expect(resolveLifecycleStage({ formStatus: "Approved" })).toBe("completed");
    expect(resolveLifecycleStage({ formStatus: "Fully Approved" })).toBe("completed");
  });

  it("reports manual paper when the live layer needs offline handling", () => {
    expect(
      resolveLifecycleStage({
        formStatus: "In Review",
        currentLayerStatus: "Manual Evaluation Required",
      }),
    ).toBe("manual_paper");
  });

  it("distinguishes in-review from untouched submissions", () => {
    expect(resolveLifecycleStage({ formStatus: "In Review" })).toBe("in_review");
    expect(resolveLifecycleStage({ formStatus: "Submitted" })).toBe("pending");
  });

  it("falls back to the legacy Status column and defaults to pending", () => {
    expect(resolveLifecycleStage({ status: "Approved Layer 1" })).toBe("in_review");
    expect(resolveLifecycleStage({})).toBe("pending");
    expect(resolveLifecycleStage({ formStatus: null, status: null })).toBe("pending");
  });
});

describe("lifecycleLabel", () => {
  it("labels every stage", () => {
    for (const stage of LIFECYCLE_STAGES) {
      expect(lifecycleLabel(stage).length).toBeGreaterThan(0);
    }
    expect(lifecycleLabel("manual_paper")).toBe("Manual / paper");
  });
});

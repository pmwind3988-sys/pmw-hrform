import { describe, expect, it } from "vitest";
import { approvalRouteText, approvalTrail, daysOpen, submissionState, summariseByForm, waitingAt } from "../formSubmissionSummary";
import type { ApprovalLayer } from "../../types";

function layer(title: string): ApprovalLayer {
  return { status: "pending", outcome: undefined, email: null, signedAt: null, rejectionReason: null, signature: null, layerTitle: title };
}

describe("submissionState", () => {
  it("reads finished states from the stored status, however it was spelt", () => {
    expect(submissionState({ formStatus: "Completed", currentLayer: 3 })).toBe("approved");
    expect(submissionState({ formStatus: "fully_approved", currentLayer: 3 })).toBe("approved");
    expect(submissionState({ formStatus: "Rejected at Layer 2", currentLayer: 2 })).toBe("rejected");
  });

  it("calls a request pending until someone has acted on it", () => {
    expect(submissionState({ formStatus: "Submitted", currentLayer: 1 })).toBe("pending");
    expect(submissionState({ formStatus: null, currentLayer: 0 })).toBe("pending");
  });

  it("calls it in review only once a step has cleared", () => {
    expect(submissionState({ formStatus: "In Review", currentLayer: 2 })).toBe("review");
    // Routing writes "In Review" on assignment; step 1 untouched is still pending.
    expect(submissionState({ formStatus: "In Review", currentLayer: 1 })).toBe("pending");
  });
});

describe("summariseByForm", () => {
  it("counts each form's rows by state and keeps the newest submission time", () => {
    const rows = [
      { listTitle: "Leave", formStatus: "Submitted", currentLayer: 1, submittedAt: "2026-10-01T08:00:00Z", isTest: false },
      { listTitle: "Leave", formStatus: "Completed", currentLayer: 3, submittedAt: "2026-10-05T08:00:00Z", isTest: false },
      { listTitle: "Leave", formStatus: "Submitted", currentLayer: 2, submittedAt: "2026-10-03T08:00:00Z", isTest: false },
      { listTitle: "Claim", formStatus: "Rejected", currentLayer: 1, submittedAt: "2026-09-01T08:00:00Z", isTest: false },
    ];
    const summary = summariseByForm(rows);
    expect(summary.get("Leave")).toEqual({
      pending: 1, review: 1, approved: 1, rejected: 0, total: 3, lastSubmittedAt: "2026-10-05T08:00:00Z",
    });
    expect(summary.get("Claim")?.rejected).toBe(1);
  });

  it("leaves test runs out of the counts", () => {
    const summary = summariseByForm([
      { listTitle: "Leave", formStatus: "Submitted", currentLayer: 1, submittedAt: null, isTest: true },
    ]);
    expect(summary.has("Leave")).toBe(false);
  });
});

describe("waitingAt", () => {
  const layers = [layer("Supervisor"), layer("HOD Approval"), layer("HR")];

  it("names the step and its title", () => {
    expect(waitingAt({ formStatus: "Submitted", currentLayer: 2, totalLayers: 3, layers })).toBe("Step 2 of 3 · HOD Approval");
  });

  it("is empty for a decided request", () => {
    expect(waitingAt({ formStatus: "Completed", currentLayer: 3, totalLayers: 3, layers })).toBe("");
  });

  it("says a routed form has not started when no step is active yet", () => {
    expect(waitingAt({ formStatus: "Submitted", currentLayer: 0, totalLayers: 3, layers })).toBe("Not started");
  });
});

describe("approvalTrail", () => {
  it("marks decided steps, the one waiting, and those not reached", () => {
    const layers: ApprovalLayer[] = [
      { ...layer("Supervisor"), status: "approved", actedByName: "Ismail Bakar", signedAt: "2026-10-02T08:00:00Z" },
      layer("HOD"),
      layer("HR"),
    ];
    const trail = approvalTrail({ formStatus: "Submitted", currentLayer: 2, layers });
    expect(trail.map((s) => [s.role, s.decision, s.tone])).toEqual([
      ["Supervisor", "Approved", "done"],
      ["HOD", "Waiting", "current"],
      ["HR", "Not reached", "waiting"],
    ]);
    expect(trail[0].decidedBy).toBe("Ismail Bakar");
    expect(trail[1].decidedBy).toBe("");
  });

  it("carries a rejection's reason and calls later steps not needed", () => {
    const layers: ApprovalLayer[] = [
      { ...layer("HOD"), status: "rejected", rejectionReason: "Spare laptop available" },
      layer("IT"),
    ];
    const trail = approvalTrail({ formStatus: "Rejected", currentLayer: 1, layers });
    expect(trail[0]).toMatchObject({ decision: "Rejected", tone: "rejected", remarks: "Spare laptop available" });
    expect(trail[1].decision).toBe("Not needed");
  });
});

describe("approvalRouteText", () => {
  it("lists the steps in order", () => {
    expect(approvalRouteText(JSON.stringify({ layers: [{ title: "Supervisor" }, { title: "HOD" }, {}] }))).toBe("Supervisor → HOD → Step 3");
  });

  it("does not pretend a branching form has one route", () => {
    expect(approvalRouteText(JSON.stringify({ layers: [{ title: "A" }], manualBranches: [{}] }))).toBe("Depends on branch");
  });

  it("copes with no config and broken JSON", () => {
    expect(approvalRouteText("")).toBe("No approval");
    expect(approvalRouteText("{")).toBe("—");
  });
});

describe("daysOpen", () => {
  const now = new Date("2026-10-13T12:00:00Z");

  it("counts whole days for an open request", () => {
    expect(daysOpen({ formStatus: "Submitted", currentLayer: 1, submittedAt: "2026-10-10T09:00:00Z" }, now)).toBe(3);
  });

  it("is null for a decided request", () => {
    expect(daysOpen({ formStatus: "Completed", currentLayer: 3, submittedAt: "2026-10-10T09:00:00Z" }, now)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  buildWorkflowDigestEmail,
  digestRecipientKey,
  groupDigestCandidates,
  isSignedInReviewLink,
  type DigestCandidate,
} from "./workflowDigest.js";

function candidate(itemId: string, recipient: string, extra: Partial<DigestCandidate> = {}): DigestCandidate {
  return {
    formTitle: "Training Evaluation",
    itemId,
    referenceNo: `TE-${itemId}`,
    applicantName: `Trainee ${itemId}`,
    entry: {
      layer: 2, recipient, dueAt: "2026-10-01T00:00:00.000Z", status: "scheduled",
      updatedAt: "2026-10-01T00:00:00.000Z", layerType: "evaluation", totalLayers: 2,
      reviewLink: `https://pmw-hrform.vercel.app/eval/training-evaluation/${itemId}/2`, submittedBy: "s@pmw-group.com",
    },
    ...extra,
  };
}

describe("isSignedInReviewLink", () => {
  it("accepts the signed-in shape and nothing else", () => {
    expect(isSignedInReviewLink("https://pmw-hrform.vercel.app/eval/training-evaluation/42/2")).toBe(true);
    expect(isSignedInReviewLink("/approval/leave/7/1")).toBe(true);
    expect(isSignedInReviewLink("https://pmw-hrform.vercel.app/eval/abc-token?item=42&k=xyz")).toBe(false);
    expect(isSignedInReviewLink("https://example.com/1")).toBe(false);
    expect(isSignedInReviewLink("")).toBe(false);
  });
});

describe("grouping", () => {
  it("treats the same addresses in any order or case as one reader", () => {
    expect(digestRecipientKey("B@pmw-group.com; a@pmw-group.com")).toBe(digestRecipientKey("a@pmw-group.com,b@PMW-group.com"));
  });

  it("groups by reader and keeps unreadable addresses apart", () => {
    const groups = groupDigestCandidates([
      candidate("1", "hod@pmw-group.com"),
      candidate("2", "other@pmw-group.com"),
      candidate("3", "HOD@pmw-group.com"),
      candidate("4", "not-an-email"),
      candidate("5", "not-an-email"),
    ]);
    expect(groups.map((g) => g.map((c) => c.itemId))).toEqual([["1", "3"], ["2"], ["4"], ["5"]]);
  });
});

describe("buildWorkflowDigestEmail", () => {
  it("lists every request and links to the Waiting for me page", () => {
    const message = buildWorkflowDigestEmail({
      recipient: "hod@pmw-group.com",
      candidates: [candidate("1", "hod@pmw-group.com"), candidate("2", "hod@pmw-group.com")],
      baseUrl: "https://pmw-hrform.vercel.app/",
    });
    expect(message.subject).toBe("Action Required: 2 evaluations waiting for you");
    expect(message.body).toContain("https://pmw-hrform.vercel.app/reviews");
    expect(message.body).toContain("Trainee 1");
    expect(message.body).toContain("Ref TE-2");
    // A digest never carries the per-submission links themselves.
    expect(message.body).not.toContain("/eval/training-evaluation/1/2");
  });

  it("caps the printed list and points at the page for the rest", () => {
    const many = Array.from({ length: 30 }, (_, i) => candidate(String(i + 1), "hod@pmw-group.com"));
    const message = buildWorkflowDigestEmail({ recipient: "hod@pmw-group.com", candidates: many, baseUrl: "https://x.test" });
    expect(message.body).toContain("5 more on the Waiting for me page");
    expect(message.body).not.toContain("Trainee 26");
  });
});

import { describe, expect, it } from "vitest";
import type { Submission } from "../types";
import { bucketSubmissions, isApprovedStatus, isRejectedFormStatus } from "./submissionStatusBuckets";

function row(formStatus: string | null, isTest = false): Submission {
  return { formStatus, isTest } as Submission;
}

describe("isApprovedStatus", () => {
  it("accepts the canonical completed status", () => {
    expect(isApprovedStatus("Completed")).toBe(true);
  });

  /** Rows written before SP_FORM_STATUS existed hold these spellings. */
  it("accepts the legacy approved spellings", () => {
    expect(isApprovedStatus("Fully Approved")).toBe(true);
    expect(isApprovedStatus("fully_approved")).toBe(true);
    expect(isApprovedStatus("FULLY-APPROVED")).toBe(true);
    expect(isApprovedStatus("Approved")).toBe(true);
  });

  it("rejects the in-flight statuses", () => {
    expect(isApprovedStatus("Submitted")).toBe(false);
    expect(isApprovedStatus("In Review")).toBe(false);
  });
});

describe("isRejectedFormStatus", () => {
  it("matches rejection on a substring", () => {
    expect(isRejectedFormStatus("Rejected")).toBe(true);
    expect(isRejectedFormStatus("rejected by manager")).toBe(true);
  });

  it("does not match an approval", () => {
    expect(isRejectedFormStatus("Completed")).toBe(false);
  });
});

describe("bucketSubmissions", () => {
  it("splits a mixed set three ways", () => {
    const buckets = bucketSubmissions([
      row("Completed"),
      row("Fully Approved"),
      row("Rejected"),
      row("Submitted"),
      row("In Review"),
    ]);
    expect(buckets).toEqual({ total: 5, approved: 2, pending: 2, rejected: 1 });
  });

  /**
   * The fallback, stated as a test because it is a decision and not an
   * accident: an unrecognised or missing status counts as pending, so it stays
   * visible to someone. Counting it as approved would hide it.
   */
  it("counts an unknown or empty status as pending", () => {
    expect(bucketSubmissions([row("Escalated"), row(""), row(null)])).toEqual({
      total: 3,
      approved: 0,
      pending: 3,
      rejected: 0,
    });
  });

  it("counts cancelled as pending rather than approved", () => {
    expect(bucketSubmissions([row("Cancelled")]).approved).toBe(0);
  });

  /**
   * A rehearsal is a real row in the real list. The list hides it; the tiles
   * must too, or one test run silently inflates the headline count above a
   * list that does not contain it.
   */
  it("excludes test-run rows from every bucket", () => {
    expect(
      bucketSubmissions([
        row("Completed"),
        row("Completed", true),
        row("Submitted", true),
        row("Rejected", true),
      ]),
    ).toEqual({ total: 1, approved: 1, pending: 0, rejected: 0 });
  });

  it("returns zeroes when every row is a rehearsal", () => {
    expect(bucketSubmissions([row("Submitted", true)])).toEqual({
      total: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
    });
  });

  it("returns zeroes for an empty set", () => {
    expect(bucketSubmissions([])).toEqual({ total: 0, approved: 0, pending: 0, rejected: 0 });
  });

  it("always accounts for every row", () => {
    // `.map(row)` would hand the array index in as `isTest`, quietly marking
    // every row after the first as a rehearsal.
    const rows = ["Completed", "Rejected", "Submitted", "weird", null].map((s) => row(s));
    const { total, approved, pending, rejected } = bucketSubmissions(rows);
    expect(approved + pending + rejected).toBe(total);
  });
});

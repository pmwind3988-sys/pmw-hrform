import { describe, it, expect } from "vitest";
import { resolveLayerActivatedAt } from "../layerActivation";
import { resolveEvaluationEmailDueAt } from "../workflowEmailSchedule";

const FALLBACK = new Date("2026-08-26T09:00:00.000Z");

describe("resolveLayerActivatedAt", () => {
  it("counts the first layer from when the form was submitted", () => {
    const activated = resolveLayerActivatedAt(
      { SubmittedAt: "2026-05-01T02:30:00.000Z" },
      undefined,
      FALLBACK,
    );
    expect(activated.toISOString()).toBe("2026-05-01T02:30:00.000Z");
  });

  it("counts a later layer from when the layer before it was signed", () => {
    const activated = resolveLayerActivatedAt(
      { SubmittedAt: "2026-05-01T02:30:00.000Z", L1_SignedAt: "2026-05-04T08:15:00.000Z" },
      1,
      FALLBACK,
    );
    expect(activated.toISOString()).toBe("2026-05-04T08:15:00.000Z");
  });

  it("falls back to the submission when the earlier layer left no timestamp", () => {
    // Paper and public layers historically closed without recording one.
    const activated = resolveLayerActivatedAt(
      { SubmittedAt: "2026-05-01T02:30:00.000Z", L1_SignedAt: "" },
      1,
      FALLBACK,
    );
    expect(activated.toISOString()).toBe("2026-05-01T02:30:00.000Z");
  });

  it("falls back to now when the record carries no usable timestamp at all", () => {
    expect(resolveLayerActivatedAt({}, undefined, FALLBACK)).toEqual(FALLBACK);
    expect(resolveLayerActivatedAt({ SubmittedAt: "not a date" }, undefined, FALLBACK)).toEqual(FALLBACK);
  });

  it("reads a SharePoint date object as readily as a string", () => {
    const activated = resolveLayerActivatedAt(
      { SubmittedAt: new Date("2026-05-01T02:30:00.000Z") },
      undefined,
      FALLBACK,
    );
    expect(activated.toISOString()).toBe("2026-05-01T02:30:00.000Z");
  });
});

describe("a delayed evaluation an admin routed late", () => {
  it("lands on the date it would have if the layer had routed itself at submission", () => {
    const activated = resolveLayerActivatedAt({ SubmittedAt: "2026-05-01T02:30:00.000Z" }, undefined, FALLBACK);
    // Three months from the submission, not three months from the admin's fix.
    expect(resolveEvaluationEmailDueAt({ mode: "three_months" }, activated))
      .toBe("2026-08-01T02:30:00.000Z");
  });

  it("is already due when the wait had passed before the admin got to it", () => {
    const activated = resolveLayerActivatedAt({ SubmittedAt: "2026-01-05T02:30:00.000Z" }, undefined, FALLBACK);
    const dueAt = resolveEvaluationEmailDueAt({ mode: "three_months" }, activated);
    // Goes out on the next run rather than starting a fresh three-month wait.
    expect(Date.parse(dueAt)).toBeLessThan(FALLBACK.getTime());
  });
});

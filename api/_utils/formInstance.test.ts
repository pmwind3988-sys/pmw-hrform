import { describe, expect, it } from "vitest";
import {
  applyLockedValues,
  canAcceptSubmission,
  instanceState,
  publicInstanceView,
  type ServerFormInstance,
} from "./formInstance.js";

const NOW = new Date("2026-03-10T09:00:00.000Z");

function instance(over: Partial<ServerFormInstance> = {}): ServerFormInstance {
  return {
    id: "1",
    title: "Fire Safety Briefing, March 2026",
    formTitle: "Training Evaluation Form",
    formSlug: "training-evaluation-form",
    token: "tok-1",
    prefill: { trainingTitle: "Fire Safety Briefing, March 2026", department: "Operations" },
    lockedFields: ["trainingTitle"],
    groupValue: "Fire Safety Briefing, March 2026",
    expiresAt: "2026-03-12T00:00:00.000Z",
    status: "open",
    requireSignIn: true,
    ...over,
  };
}

describe("instanceState", () => {
  it("is open before the expiry date", () => {
    expect(instanceState(instance(), NOW)).toBe("open");
  });

  it("is expired once the date has passed", () => {
    expect(instanceState(instance({ expiresAt: "2026-03-09T00:00:00.000Z" }), NOW)).toBe("expired");
  });

  it("reports a hand-closed instance as closed even before its date", () => {
    expect(instanceState(instance({ status: "closed" }), NOW)).toBe("closed");
  });

  /** A column holding junk must not shut a live event. */
  it("ignores an unparseable expiry rather than closing the instance", () => {
    expect(instanceState(instance({ expiresAt: "not-a-date" }), NOW)).toBe("open");
  });

  it("is expired exactly at the expiry instant", () => {
    expect(instanceState(instance({ expiresAt: NOW.toISOString() }), NOW)).toBe("expired");
  });

  it("accepts submissions only while open", () => {
    expect(canAcceptSubmission(instance(), NOW)).toBe(true);
    expect(canAcceptSubmission(instance({ status: "closed" }), NOW)).toBe(false);
    expect(canAcceptSubmission(instance({ expiresAt: "2026-01-01T00:00:00.000Z" }), NOW)).toBe(false);
  });
});

describe("applyLockedValues", () => {
  /**
   * The reason this layer exists. Read-only is a rendering choice; without the
   * server overwriting, a locked field is only a suggestion.
   */
  it("overwrites a locked answer the submitter changed, and says so", () => {
    const { data, overridden } = applyLockedValues(
      { trainingTitle: "Something Else", rating: "5" },
      instance(),
    );
    expect(data.trainingTitle).toBe("Fire Safety Briefing, March 2026");
    expect(data.rating).toBe("5");
    expect(overridden).toEqual(["trainingTitle"]);
  });

  /** A field the submitter never sent is still written from the record. */
  it("writes a locked answer that was absent from the body", () => {
    const { data, overridden } = applyLockedValues({ rating: "5" }, instance());
    expect(data.trainingTitle).toBe("Fire Safety Briefing, March 2026");
    expect(overridden).toEqual(["trainingTitle"]);
  });

  it("reports nothing overridden when the submitter agreed", () => {
    const { overridden } = applyLockedValues(
      { trainingTitle: "Fire Safety Briefing, March 2026" },
      instance(),
    );
    expect(overridden).toEqual([]);
  });

  /** An unlocked prefill is a starting value; the respondent may change it. */
  it("leaves an unlocked prefilled field as the submitter sent it", () => {
    const { data } = applyLockedValues({ department: "Finance" }, instance());
    expect(data.department).toBe("Finance");
  });

  /**
   * `LockedFields` and `PrefillJson` are separate columns and can drift. A name
   * locked but never given a value must not blank the submitter's answer.
   */
  it("skips a locked name that has no value in the prefill", () => {
    const { data, overridden } = applyLockedValues(
      { rating: "5" },
      instance({ lockedFields: ["trainingTitle", "rating"] }),
    );
    expect(data.rating).toBe("5");
    expect(overridden).toEqual(["trainingTitle"]);
  });

  /** Array answers compare by value, not identity. */
  it("does not report an unchanged multi-choice answer as overridden", () => {
    const withArray = instance({ prefill: { topics: ["A", "B"] }, lockedFields: ["topics"] });
    expect(applyLockedValues({ topics: ["A", "B"] }, withArray).overridden).toEqual([]);
    expect(applyLockedValues({ topics: ["A"] }, withArray).overridden).toEqual(["topics"]);
  });
});

describe("publicInstanceView", () => {
  /**
   * This endpoint answers to the API key shipped in the browser bundle, so its
   * response is public. Who created the instance is a member of staff's name.
   */
  it("does not expose who created the instance", () => {
    const view = publicInstanceView(instance(), NOW) as Record<string, unknown>;
    expect(view.createdBy).toBeUndefined();
    expect(view.createdByEmail).toBeUndefined();
    expect(Object.keys(view).sort()).toEqual(
      ["expiresAt", "lockedFields", "prefill", "requireSignIn", "state", "title"],
    );
  });
});

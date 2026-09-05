import { describe, expect, it } from "vitest";
import type { Submission } from "../types";
import {
  buildSubmissionGroups,
  canAcceptSubmission,
  effectiveGroupValue,
  instanceState,
  lockedRoutingFields,
  type FormInstance,
} from "./formInstances";

const NOW = new Date("2026-03-10T09:00:00.000Z");

function instance(over: Partial<FormInstance> = {}): FormInstance {
  return {
    id: "1",
    title: "Fire Safety Briefing, March 2026",
    formTitle: "Training Evaluation Form",
    formSlug: "training-evaluation-form",
    token: "tok-1",
    prefill: { trainingTitle: "Fire Safety Briefing, March 2026" },
    lockedFields: ["trainingTitle"],
    groupValue: "Fire Safety Briefing, March 2026",
    expiresAt: "2026-03-12T00:00:00.000Z",
    status: "open",
    requireSignIn: true,
    createdBy: "hr@pmw-group.com",
    created: "2026-03-01T00:00:00.000Z",
    ...over,
  };
}

function row(value: unknown, over: Partial<Submission> = {}): Submission {
  return { submissionData: { trainingTitle: value }, ...over } as Submission;
}

describe("instanceState", () => {
  it("is open before the expiry date", () => {
    expect(instanceState(instance(), NOW)).toBe("open");
  });

  it("is expired once the date has passed", () => {
    expect(instanceState(instance({ expiresAt: "2026-03-09T00:00:00.000Z" }), NOW)).toBe("expired");
  });

  /**
   * Closing by hand beats the date. An instance shut early is closed, not
   * "open until Friday" — the admin's decision is the more recent fact.
   */
  it("reports a hand-closed instance as closed even before its date", () => {
    expect(instanceState(instance({ status: "closed" }), NOW)).toBe("closed");
  });

  /** Reopening past the date has to mean something, or the button is a lie. */
  it("treats a reopened instance with a future date as open", () => {
    expect(
      instanceState(instance({ status: "open", expiresAt: "2026-04-01T00:00:00.000Z" }), NOW),
    ).toBe("open");
  });

  /** No date set means it runs until someone closes it. */
  it("is open with no expiry date", () => {
    expect(instanceState(instance({ expiresAt: "" }), NOW)).toBe("open");
  });

  /**
   * An unparseable date must not read as "expired" — that would silently shut a
   * live event because a column held junk.
   */
  it("ignores an unparseable expiry rather than closing the instance", () => {
    expect(instanceState(instance({ expiresAt: "not-a-date" }), NOW)).toBe("open");
  });

  /** The boundary itself: at the instant of expiry it is over. */
  it("is expired exactly at the expiry instant", () => {
    expect(instanceState(instance({ expiresAt: NOW.toISOString() }), NOW)).toBe("expired");
  });
});

describe("canAcceptSubmission", () => {
  it("accepts only while open", () => {
    expect(canAcceptSubmission(instance(), NOW)).toBe(true);
    expect(canAcceptSubmission(instance({ status: "closed" }), NOW)).toBe(false);
    expect(canAcceptSubmission(instance({ expiresAt: "2026-01-01T00:00:00.000Z" }), NOW)).toBe(false);
  });
});

describe("buildSubmissionGroups", () => {
  const submissions = [
    row("Fire Safety Briefing, March 2026"),
    row("Fire Safety Briefing, March 2026"),
    row("Induction, January 2026"),
  ];

  it("groups submissions by the nominated field's value", () => {
    const groups = buildSubmissionGroups(submissions, "trainingTitle", []);
    expect(groups.map((g) => [g.value, g.count])).toEqual([
      ["Fire Safety Briefing, March 2026", 2],
      ["Induction, January 2026", 1],
    ]);
  });

  /**
   * The historical case, and the reason the group key is a field value rather
   * than the instance: those old ad-hoc links were never recorded, so their
   * submissions can only ever be found by what they carry.
   */
  it("keeps a group that has no instance behind it", () => {
    const groups = buildSubmissionGroups(submissions, "trainingTitle", [instance()]);
    const historical = groups.find((g) => g.value === "Induction, January 2026");
    expect(historical?.instance).toBeUndefined();
    expect(historical?.count).toBe(1);
  });

  it("attaches the instance to the group sharing its value", () => {
    const groups = buildSubmissionGroups(submissions, "trainingTitle", [instance()]);
    const matched = groups.find((g) => g.value === "Fire Safety Briefing, March 2026");
    expect(matched?.instance?.token).toBe("tok-1");
  });

  /**
   * An instance can exist before anyone has answered it. It must still be
   * listed, or a freshly created event looks like it failed.
   */
  it("lists an instance with no submissions yet", () => {
    const groups = buildSubmissionGroups([], "trainingTitle", [instance()]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(0);
    expect(groups[0].instance?.token).toBe("tok-1");
  });

  /** Submissions with nothing in that field collect under one honest heading. */
  it("gathers blank and missing values into an ungrouped bucket", () => {
    const groups = buildSubmissionGroups(
      [row(""), row(undefined), row("   "), row("Real")],
      "trainingTitle",
      [],
    );
    const ungrouped = groups.find((g) => g.value === "");
    expect(ungrouped?.count).toBe(3);
    expect(groups.find((g) => g.value === "Real")?.count).toBe(1);
  });

  it("returns nothing when the form has no grouping field", () => {
    expect(buildSubmissionGroups(submissions, "", [])).toEqual([]);
  });

  /** Two instances may deliberately share a value; they are one group. */
  it("merges instances that share a group value", () => {
    const groups = buildSubmissionGroups(submissions, "trainingTitle", [
      instance({ id: "1", token: "tok-1" }),
      instance({ id: "2", token: "tok-2" }),
    ]);
    expect(groups.filter((g) => g.value === "Fire Safety Briefing, March 2026")).toHaveLength(1);
  });
});

describe("lockedRoutingFields", () => {
  /**
   * Routing reads the submitted data, so locking a field the routing depends on
   * decides the approver for every response in the instance — at creation time,
   * not by the person filling it in. The dialog has to say so.
   */
  it("names a locked field the routing depends on", () => {
    const layerConfig = { layers: [{ assignee: { kind: "department", field: "department" } }] };
    expect(lockedRoutingFields(["department", "trainingTitle"], layerConfig)).toEqual(["department"]);
  });

  it("says nothing when no locked field feeds the routing", () => {
    const layerConfig = { layers: [{ assignee: { kind: "department", field: "department" } }] };
    expect(lockedRoutingFields(["trainingTitle"], layerConfig)).toEqual([]);
  });

  it("survives a form with no layer config at all", () => {
    expect(lockedRoutingFields(["department"], null)).toEqual([]);
    expect(lockedRoutingFields(["department"], undefined)).toEqual([]);
    expect(lockedRoutingFields(["department"], "nonsense")).toEqual([]);
  });

  it("finds a field named deeper inside a layer's assignee", () => {
    const layerConfig = {
      layers: [{ assignee: { kind: "reportingLine", startFrom: { field: "requesterEmail" } } }],
    };
    expect(lockedRoutingFields(["requesterEmail"], layerConfig)).toEqual(["requesterEmail"]);
  });
});

describe("effectiveGroupValue", () => {
  /**
   * The ordinary drift case: an instance created before the form had a
   * grouping field has an empty stored value, and would otherwise stay
   * permanently ungrouped even though its prefill says where it belongs.
   */
  it("falls back to the prefill when the stored value is empty", () => {
    const stale = instance({ groupValue: "" });
    expect(effectiveGroupValue(stale, "trainingTitle")).toBe("Fire Safety Briefing, March 2026");
  });

  it("prefers the stored value when there is one", () => {
    expect(effectiveGroupValue(instance({ groupValue: "Stored" }), "trainingTitle")).toBe("Stored");
  });

  it("is empty when neither the stored value nor the prefill has one", () => {
    expect(effectiveGroupValue(instance({ groupValue: "", prefill: {} }), "trainingTitle")).toBe("");
    expect(effectiveGroupValue(instance({ groupValue: "" }), "")).toBe("");
  });

  /** And the fallback must actually reach the grouping. */
  it("groups an instance whose stored value was never written", () => {
    const groups = buildSubmissionGroups(
      [row("Fire Safety Briefing, March 2026")],
      "trainingTitle",
      [instance({ groupValue: "" })],
    );
    const matched = groups.find((g) => g.value === "Fire Safety Briefing, March 2026");
    expect(matched?.instance?.token).toBe("tok-1");
  });
});

import { describe, expect, it } from "vitest";
import type { Submission } from "../../types";
import {
  EMPTY_SUBMISSION_FILTERS,
  NO_TRAINING_TITLE,
  collectPublishProfiles,
  collectTrainingTitles,
  countActiveFilters,
  sortSubmissions,
  submissionMatchesFilters,
} from "../submissionFilters";

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "1",
    submissionId: "1",
    listTitle: "Training Feedback",
    formId: "FRM-001",
    formVersion: "1.0",
    title: "Item 1",
    submittedByEmail: "ahmad@example.com",
    submittedAt: "2026-07-10T09:00:00.000Z",
    formStatus: "Submitted",
    totalLayers: 2,
    layers: [],
    meta: { icon: "", color: "", pale: "", category: "HR" },
    submissionData: {},
    ...overrides,
  };
}

describe("submissionMatchesFilters", () => {
  it("matches everything when no filters are set", () => {
    expect(submissionMatchesFilters(makeSubmission(), EMPTY_SUBMISSION_FILTERS)).toBe(true);
  });

  it("searches title, form id and submission id", () => {
    const item = makeSubmission({ title: "Safety Briefing" });
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, search: "safety" })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, search: "FRM-001" })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, search: "nope" })).toBe(false);
  });

  it("filters by list title exactly", () => {
    const item = makeSubmission();
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, listTitle: "Training Feedback" })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, listTitle: "Other Form" })).toBe(false);
  });

  it("filters by lifecycle stage", () => {
    const pending = makeSubmission({ formStatus: "Submitted" });
    const done = makeSubmission({ formStatus: "Completed" });
    expect(submissionMatchesFilters(pending, { ...EMPTY_SUBMISSION_FILTERS, stage: "pending" })).toBe(true);
    expect(submissionMatchesFilters(pending, { ...EMPTY_SUBMISSION_FILTERS, stage: "completed" })).toBe(false);
    expect(submissionMatchesFilters(done, { ...EMPTY_SUBMISSION_FILTERS, stage: "completed" })).toBe(true);
  });

  it("matches submitter across email and display names", () => {
    const item = makeSubmission({ submitterName: "Ahmad Zahari" });
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, submitter: "zahari" })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, submitter: "ahmad@" })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, submitter: "siti" })).toBe(false);
  });

  it("treats the date range as inclusive of both whole days", () => {
    // Built from local time so the assertion holds in any timezone the suite runs in.
    const item = makeSubmission({ submittedAt: new Date(2026, 6, 10, 12, 0, 0).toISOString() });
    expect(
      submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, dateFrom: "2026-07-10", dateTo: "2026-07-10" }),
    ).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, dateFrom: "2026-07-11" })).toBe(false);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, dateTo: "2026-07-09" })).toBe(false);
  });

  it("includes submissions at both edges of a local calendar day", () => {
    const justAfterMidnight = makeSubmission({ submittedAt: new Date(2026, 6, 10, 0, 0, 0).toISOString() });
    const justBeforeMidnight = makeSubmission({ submittedAt: new Date(2026, 6, 10, 23, 59, 59).toISOString() });
    const sameDay = { ...EMPTY_SUBMISSION_FILTERS, dateFrom: "2026-07-10", dateTo: "2026-07-10" };
    expect(submissionMatchesFilters(justAfterMidnight, sameDay)).toBe(true);
    expect(submissionMatchesFilters(justBeforeMidnight, sameDay)).toBe(true);
  });

  it("excludes submissions with no submitted date once a range is set", () => {
    const undated = makeSubmission({ submittedAt: null });
    expect(submissionMatchesFilters(undated, EMPTY_SUBMISSION_FILTERS)).toBe(true);
    expect(submissionMatchesFilters(undated, { ...EMPTY_SUBMISSION_FILTERS, dateFrom: "2026-07-10" })).toBe(false);
  });

  it("filters by training title including an explicit empty bucket", () => {
    const withTitle = makeSubmission({ submissionData: { trainingTitle: "Fire Safety" } });
    const withoutTitle = makeSubmission({ submissionData: {} });
    expect(submissionMatchesFilters(withTitle, { ...EMPTY_SUBMISSION_FILTERS, trainingTitle: "Fire Safety" })).toBe(true);
    expect(submissionMatchesFilters(withTitle, { ...EMPTY_SUBMISSION_FILTERS, trainingTitle: NO_TRAINING_TITLE })).toBe(false);
    expect(submissionMatchesFilters(withoutTitle, { ...EMPTY_SUBMISSION_FILTERS, trainingTitle: NO_TRAINING_TITLE })).toBe(true);
  });

  it("filters by publish profile, treating missing as the default profile", () => {
    const cSuite = makeSubmission({ publishKey: "c-suite" });
    const legacy = makeSubmission({ publishKey: undefined });
    expect(submissionMatchesFilters(cSuite, { ...EMPTY_SUBMISSION_FILTERS, publishProfile: "c-suite" })).toBe(true);
    expect(submissionMatchesFilters(legacy, { ...EMPTY_SUBMISSION_FILTERS, publishProfile: "c-suite" })).toBe(false);
    expect(submissionMatchesFilters(legacy, { ...EMPTY_SUBMISSION_FILTERS, publishProfile: "production" })).toBe(true);
  });
});

describe("collectTrainingTitles", () => {
  it("returns sorted distinct titles and ignores blanks", () => {
    const items = [
      makeSubmission({ submissionData: { trainingTitle: "Safety" } }),
      makeSubmission({ submissionData: { trainingTitle: "First Aid" } }),
      makeSubmission({ submissionData: { trainingTitle: "Safety" } }),
      makeSubmission({ submissionData: {} }),
    ];
    expect(collectTrainingTitles(items)).toEqual(["First Aid", "Safety"]);
  });
});

describe("collectPublishProfiles", () => {
  it("returns sorted distinct profiles and normalises missing to production", () => {
    const items = [
      makeSubmission({ publishKey: "c-suite" }),
      makeSubmission({ publishKey: undefined }),
      makeSubmission({ publishKey: "c-suite" }),
    ];
    expect(collectPublishProfiles(items)).toEqual(["c-suite", "production"]);
  });
});

describe("sortSubmissions", () => {
  it("sorts newest first by default and oldest first on request", () => {
    const older = makeSubmission({ id: "a", submittedAt: "2026-07-01T00:00:00.000Z" });
    const newer = makeSubmission({ id: "b", submittedAt: "2026-07-20T00:00:00.000Z" });
    expect(sortSubmissions([older, newer], "newest").map((i) => i.id)).toEqual(["b", "a"]);
    expect(sortSubmissions([older, newer], "oldest").map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const items = [
      makeSubmission({ id: "a", submittedAt: "2026-07-01T00:00:00.000Z" }),
      makeSubmission({ id: "b", submittedAt: "2026-07-20T00:00:00.000Z" }),
    ];
    sortSubmissions(items, "newest");
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("countActiveFilters", () => {
  it("counts only fields that differ from the empty state", () => {
    expect(countActiveFilters(EMPTY_SUBMISSION_FILTERS)).toBe(0);
    expect(countActiveFilters({ ...EMPTY_SUBMISSION_FILTERS, search: "x", stage: "pending" })).toBe(2);
  });
});

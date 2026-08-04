import type { Submission } from "../types";
import { resolveLifecycleStage, type LifecycleStage } from "./submissionLifecycle";

/** Sentinel for "submissions that have no training title at all". */
export const NO_TRAINING_TITLE = "__NO_TRAINING_TITLE__";

/** Form field carrying the training title. Mirrors ApprovalDashboard. */
export const TRAINING_TITLE_FIELD = "trainingTitle";

/** Profile key used for submissions predating the PublishKey column. */
export const DEFAULT_PROFILE_KEY = "production";

export interface SubmissionFilterState {
  search: string;
  listTitle: string;
  /** "all" or a LifecycleStage value. */
  stage: string;
  submitter: string;
  /** yyyy-mm-dd, inclusive from start of day. */
  dateFrom: string;
  /** yyyy-mm-dd, inclusive to end of day. */
  dateTo: string;
  /** "" = all, NO_TRAINING_TITLE, or an exact title. */
  trainingTitle: string;
  /** "" = all, or a profile key. */
  publishProfile: string;
}

export const EMPTY_SUBMISSION_FILTERS: SubmissionFilterState = {
  search: "",
  listTitle: "",
  stage: "all",
  submitter: "",
  dateFrom: "",
  dateTo: "",
  trainingTitle: "",
  publishProfile: "",
};

/** Reference with separators removed, for punctuation-insensitive matching. */
function compactReference(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getSubmissionTrainingTitle(item: Submission): string {
  const value = item.submissionData[TRAINING_TITLE_FIELD];
  return typeof value === "string" ? value.trim() : "";
}

export function getSubmissionProfileKey(item: Submission): string {
  return (item.publishKey ?? "").trim() || DEFAULT_PROFILE_KEY;
}

export function getSubmissionStage(item: Submission): LifecycleStage {
  return resolveLifecycleStage({
    formStatus: item.formStatus,
    currentLayerStatus: item.currentLayerStatus,
  });
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Parse a yyyy-mm-dd filter value as a LOCAL calendar date.
 * `new Date("2026-07-10")` parses as UTC midnight, which shifts the range by the
 * timezone offset. Admins pick dates in their own timezone, so the boundaries
 * must be local.
 */
function parseFilterDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value: string): Date | null {
  const date = parseFilterDate(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: string): Date | null {
  const date = parseFilterDate(value);
  if (!date) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

export function submissionMatchesFilters(item: Submission, filters: SubmissionFilterState): boolean {
  if (filters.search) {
    // Reference numbers are the ID people actually quote, so they are matched
    // with separators stripped too — someone searching "0408260001" or pasting
    // "osh-040826-0001" should land on the same record as "040826-0001".
    const needle = filters.search.toLowerCase();
    const compactNeedle = compactReference(needle);
    const haystack = [item.title, item.formId, item.submissionId, item.referenceNo ?? ""];
    const matched =
      haystack.some((value) => value.toLowerCase().includes(needle)) ||
      (!!compactNeedle && compactReference(item.referenceNo ?? "").includes(compactNeedle));
    if (!matched) return false;
  }

  if (filters.listTitle && item.listTitle !== filters.listTitle) return false;

  if (filters.stage !== "all" && getSubmissionStage(item) !== filters.stage) return false;

  if (filters.submitter) {
    const needle = filters.submitter.toLowerCase();
    const candidates = [
      item.submittedByEmail,
      item.submitterName ?? "",
      item.createdByName ?? "",
      item.createdByEmail ?? "",
    ];
    if (!candidates.some((candidate) => candidate.toLowerCase().includes(needle))) return false;
  }

  if (filters.dateFrom || filters.dateTo) {
    const submitted = parseDate(item.submittedAt);
    if (!submitted) return false;
    const from = filters.dateFrom ? startOfDay(filters.dateFrom) : null;
    const to = filters.dateTo ? endOfDay(filters.dateTo) : null;
    if (from && submitted < from) return false;
    if (to && submitted > to) return false;
  }

  if (filters.trainingTitle) {
    const title = getSubmissionTrainingTitle(item);
    if (filters.trainingTitle === NO_TRAINING_TITLE) {
      if (title) return false;
    } else if (title !== filters.trainingTitle) {
      return false;
    }
  }

  if (filters.publishProfile && getSubmissionProfileKey(item) !== filters.publishProfile) return false;

  return true;
}

export function collectTrainingTitles(items: Submission[]): string[] {
  const titles = new Set<string>();
  for (const item of items) {
    const title = getSubmissionTrainingTitle(item);
    if (title) titles.add(title);
  }
  return Array.from(titles).sort((a, b) => a.localeCompare(b));
}

export function collectPublishProfiles(items: Submission[]): string[] {
  const profiles = new Set<string>();
  for (const item of items) profiles.add(getSubmissionProfileKey(item));
  return Array.from(profiles).sort((a, b) => a.localeCompare(b));
}

export function sortSubmissions(items: Submission[], sortBy: string): Submission[] {
  return [...items].sort((a, b) => {
    switch (sortBy) {
      case "oldest":
        return (a.submittedAt || "").localeCompare(b.submittedAt || "");
      case "status":
        return getSubmissionStage(a).localeCompare(getSubmissionStage(b));
      case "list":
        return a.listTitle.localeCompare(b.listTitle);
      default:
        return (b.submittedAt || "").localeCompare(a.submittedAt || "");
    }
  });
}

export function countActiveFilters(filters: SubmissionFilterState): number {
  return (Object.keys(EMPTY_SUBMISSION_FILTERS) as (keyof SubmissionFilterState)[]).filter(
    (key) => filters[key] !== EMPTY_SUBMISSION_FILTERS[key],
  ).length;
}

export function hasActiveFilters(filters: SubmissionFilterState): boolean {
  return countActiveFilters(filters) > 0;
}

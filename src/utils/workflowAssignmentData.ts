/**
 * workflowAssignmentData.ts — who a submission's workflow layers are assigned
 * to, plus the log of routing checks made before request emails.
 *
 * Mirrored at `api/_utils/workflowAssignmentData.ts`; a test keeps the two
 * identical below this header. Imports end in `.js` so one text compiles on
 * both sides.
 */
import { emailListsMatch } from "./layerRecipients.js";

export interface WorkflowAssignmentSnapshot {
  email: string;
  displayName?: string;
  position?: string;
  workflowRole?: string;
  notes?: string;
  reason?: string;
  source: "resolved" | "manual-override";
  updatedBy: string;
  updatedAt: string;
}

export interface WorkflowAssignmentEntry extends WorkflowAssignmentSnapshot {
  layer: number;
  history: WorkflowAssignmentSnapshot[];
}

export type RoutingCheckOutcome =
  | "match" | "corrected" | "left-alone" | "not-checkable"
  | "held-no-routing" | "held-check-failed";

export type RoutingCheckTrigger =
  | "submission" | "step-advanced" | "daily-run" | "reminder"
  | "send-selected" | "send-now" | "link-reissue";

export interface RoutingCheckEntry {
  at: string;
  firstAt?: string;
  layer: number;
  trigger: RoutingCheckTrigger;
  outcome: RoutingCheckOutcome;
  saved: string[];
  routed: string[];
  note?: string;
  how?: string;
  count?: number;
}

/**
 * One correction a submitter made to their own submission before any step was
 * decided (`/form/:formId?edit=`): who, when, and each answer before and after.
 * Written in the same save as the new answers, so a correction never lands
 * without its record. Never trimmed or rewritten: it is the audit trail.
 */
export interface SubmissionCorrectionChange {
  /** The question's name in the form. */
  question: string;
  /** The question's wording at the time, when the form gave one. */
  label?: string;
  before: string;
  after: string;
}

export interface SubmissionCorrectionEntry {
  at: string;
  by: string;
  changes: SubmissionCorrectionChange[];
}

/** Longest answer text kept per side of a change; longer text ends in "…". */
export const MAX_CORRECTION_VALUE_LENGTH = 2000;

/** Newest checks kept per submission; older ones are dropped. */
export const MAX_ROUTING_CHECKS = 60;

const ROUTING_OUTCOMES: readonly string[] = [
  "match", "corrected", "left-alone", "not-checkable", "held-no-routing", "held-check-failed",
];
const ROUTING_TRIGGERS: readonly string[] = [
  "submission", "step-advanced", "daily-run", "reminder", "send-selected", "send-now", "link-reissue",
];

export interface WorkflowAssignmentData {
  version: 1;
  layers: Record<string, WorkflowAssignmentEntry>;
  checks?: RoutingCheckEntry[];
  corrections?: SubmissionCorrectionEntry[];
}

export interface WorkflowAssignmentOverrideInput {
  layer: number;
  email: string;
  displayName?: string;
  position?: string;
  workflowRole?: string;
  notes?: string;
  reason?: string;
  updatedBy: string;
  updatedAt: string;
  previous?: WorkflowAssignmentSnapshot;
  /** "resolved" records a correction to what routing picks; omitted means a hand reassignment. */
  source?: WorkflowAssignmentSnapshot["source"];
}

const EMPTY_ASSIGNMENT_DATA: WorkflowAssignmentData = {
  version: 1,
  layers: {},
};

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseSnapshot(value: unknown): WorkflowAssignmentSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const email = optionalText(record.email);
  const updatedBy = optionalText(record.updatedBy);
  const updatedAt = optionalText(record.updatedAt);
  if (!email || !updatedBy || !updatedAt) return null;
  return {
    email,
    ...(optionalText(record.displayName) ? { displayName: optionalText(record.displayName) } : {}),
    ...(optionalText(record.position) ? { position: optionalText(record.position) } : {}),
    ...(optionalText(record.workflowRole) ? { workflowRole: optionalText(record.workflowRole) } : {}),
    ...(optionalText(record.notes) ? { notes: optionalText(record.notes) } : {}),
    ...(optionalText(record.reason) ? { reason: optionalText(record.reason) } : {}),
    source: record.source === "resolved" ? "resolved" : "manual-override",
    updatedBy,
    updatedAt,
  };
}

function parseEmails(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string");
}

function parseRoutingCheck(value: unknown): RoutingCheckEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const at = optionalText(record.at);
  const layer = Number(record.layer);
  const saved = parseEmails(record.saved);
  const routed = parseEmails(record.routed);
  if (!at || !Number.isInteger(layer) || layer < 1 || !saved || !routed) return null;
  if (typeof record.outcome !== "string" || !ROUTING_OUTCOMES.includes(record.outcome)) return null;
  if (typeof record.trigger !== "string" || !ROUTING_TRIGGERS.includes(record.trigger)) return null;
  const count = Number(record.count);
  return {
    at,
    ...(optionalText(record.firstAt) ? { firstAt: optionalText(record.firstAt) } : {}),
    layer,
    trigger: record.trigger as RoutingCheckTrigger,
    outcome: record.outcome as RoutingCheckOutcome,
    saved,
    routed,
    ...(optionalText(record.note) ? { note: optionalText(record.note) } : {}),
    ...(optionalText(record.how) ? { how: optionalText(record.how) } : {}),
    ...(Number.isInteger(count) && count >= 1 ? { count } : {}),
  };
}

function correctionText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.length > MAX_CORRECTION_VALUE_LENGTH ? `${value.slice(0, MAX_CORRECTION_VALUE_LENGTH - 1)}…` : value;
}

function parseCorrectionChange(value: unknown): SubmissionCorrectionChange | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const question = optionalText(record.question);
  if (!question) return null;
  return {
    question,
    ...(optionalText(record.label) ? { label: optionalText(record.label) } : {}),
    before: correctionText(record.before),
    after: correctionText(record.after),
  };
}

function parseCorrection(value: unknown): SubmissionCorrectionEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const at = optionalText(record.at);
  const by = optionalText(record.by);
  if (!at || !by || !Array.isArray(record.changes)) return null;
  const changes = record.changes
    .map(parseCorrectionChange)
    .filter((change): change is SubmissionCorrectionChange => change !== null);
  return changes.length > 0 ? { at, by, changes } : null;
}

function parseCorrections(value: unknown): SubmissionCorrectionEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(parseCorrection)
    .filter((entry): entry is SubmissionCorrectionEntry => entry !== null);
}

function parseRoutingChecks(value: unknown): RoutingCheckEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(parseRoutingCheck)
    .filter((entry): entry is RoutingCheckEntry => entry !== null)
    .slice(-MAX_ROUTING_CHECKS);
}

export function parseWorkflowAssignmentData(raw: unknown): WorkflowAssignmentData {
  let value = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return { ...EMPTY_ASSIGNMENT_DATA, layers: {} };
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return { ...EMPTY_ASSIGNMENT_DATA, layers: {} };
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_ASSIGNMENT_DATA, layers: {} };
  }

  const checks = parseRoutingChecks((value as Record<string, unknown>).checks);
  const corrections = parseCorrections((value as Record<string, unknown>).corrections);
  // Both logs ride along on every rewrite of this column, so a routing check or
  // a reassignment can never drop a submission's correction record.
  const checksPart = {
    ...(checks.length > 0 ? { checks } : {}),
    ...(corrections.length > 0 ? { corrections } : {}),
  };
  const rawLayers = (value as Record<string, unknown>).layers;
  if (!rawLayers || typeof rawLayers !== "object" || Array.isArray(rawLayers)) {
    return { ...EMPTY_ASSIGNMENT_DATA, layers: {}, ...checksPart };
  }

  const layers: Record<string, WorkflowAssignmentEntry> = {};
  for (const [key, rawEntry] of Object.entries(rawLayers)) {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;
    const entryRecord = rawEntry as Record<string, unknown>;
    const snapshot = parseSnapshot(entryRecord);
    const layer = Number(entryRecord.layer ?? key);
    if (!snapshot || !Number.isInteger(layer) || layer < 1) continue;
    const history = Array.isArray(entryRecord.history)
      ? entryRecord.history
        .map(parseSnapshot)
        .filter((entry): entry is WorkflowAssignmentSnapshot => entry !== null)
      : [];
    layers[String(layer)] = { layer, ...snapshot, history };
  }
  return { version: 1, layers, ...checksPart };
}

/** The routing checks stored with a submission, oldest first. */
export function readRoutingChecks(raw: unknown): RoutingCheckEntry[] {
  return parseWorkflowAssignmentData(raw).checks ?? [];
}

/**
 * Adds a routing check to the log. A repeat of the layer's latest check (same
 * outcome, saved people and routed people) only bumps its count, so a daily
 * hold does not fill the log.
 */
export function recordRoutingCheck(
  raw: unknown,
  entry: RoutingCheckEntry,
): { data: WorkflowAssignmentData; isNew: boolean; count: number } {
  const data = parseWorkflowAssignmentData(raw);
  const checks = [...(data.checks ?? [])];
  let latestIndex = -1;
  for (let i = checks.length - 1; i >= 0; i -= 1) {
    if (checks[i].layer === entry.layer) {
      latestIndex = i;
      break;
    }
  }
  const latest = latestIndex >= 0 ? checks[latestIndex] : null;
  if (
    latest
    && latest.outcome === entry.outcome
    && emailListsMatch(latest.saved.join(";"), entry.saved.join(";"))
    && emailListsMatch(latest.routed.join(";"), entry.routed.join(";"))
  ) {
    const count = (latest.count ?? 1) + 1;
    checks[latestIndex] = {
      ...latest,
      ...entry,
      firstAt: latest.firstAt ?? latest.at,
      count,
    };
    return { data: { ...data, checks }, isNew: false, count };
  }
  checks.push(entry);
  return { data: { ...data, checks: checks.slice(-MAX_ROUTING_CHECKS) }, isNew: true, count: 1 };
}

/** The corrections a submitter made to this submission, oldest first. */
export function readSubmissionCorrections(raw: unknown): SubmissionCorrectionEntry[] {
  return parseWorkflowAssignmentData(raw).corrections ?? [];
}

/** Adds one correction to the record. Nothing is ever dropped from it. */
export function recordSubmissionCorrection(
  raw: unknown,
  entry: SubmissionCorrectionEntry,
): WorkflowAssignmentData {
  const data = parseWorkflowAssignmentData(raw);
  const parsed = parseCorrection(entry);
  if (!parsed) return data;
  return { ...data, corrections: [...(data.corrections ?? []), parsed] };
}

export function getWorkflowAssignment(
  raw: unknown,
  layer: number,
): WorkflowAssignmentEntry | null {
  return parseWorkflowAssignmentData(raw).layers[String(layer)] ?? null;
}

export function setWorkflowAssignmentOverride(
  raw: unknown,
  input: WorkflowAssignmentOverrideInput,
): WorkflowAssignmentData {
  const data = parseWorkflowAssignmentData(raw);
  const key = String(input.layer);
  const previous = data.layers[key];
  const previousSnapshot = previous
    ? {
      email: previous.email,
      ...(previous.displayName ? { displayName: previous.displayName } : {}),
      ...(previous.position ? { position: previous.position } : {}),
      ...(previous.workflowRole ? { workflowRole: previous.workflowRole } : {}),
      ...(previous.notes ? { notes: previous.notes } : {}),
      ...(previous.reason ? { reason: previous.reason } : {}),
      source: previous.source,
      updatedBy: previous.updatedBy,
      updatedAt: previous.updatedAt,
    } satisfies WorkflowAssignmentSnapshot
    : null;
  const history = previousSnapshot
    ? [...previous.history, previousSnapshot].slice(-20)
    : input.previous
      ? [input.previous]
      : [];

  data.layers[key] = {
    layer: input.layer,
    email: input.email.trim(),
    ...(optionalText(input.displayName) ? { displayName: optionalText(input.displayName) } : {}),
    ...(optionalText(input.position) ? { position: optionalText(input.position) } : {}),
    ...(optionalText(input.workflowRole) ? { workflowRole: optionalText(input.workflowRole) } : {}),
    ...(optionalText(input.notes) ? { notes: optionalText(input.notes) } : {}),
    ...(optionalText(input.reason) ? { reason: optionalText(input.reason) } : {}),
    source: input.source ?? "manual-override",
    updatedBy: input.updatedBy.trim(),
    updatedAt: input.updatedAt,
    history,
  };
  return data;
}

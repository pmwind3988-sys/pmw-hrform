import type { Submission } from "../types";

/**
 * formInstances.ts — a named run of a form, and the grouping it gives back.
 *
 * An instance is a set of fixed answers over the LIVE form: values, which of
 * them are locked, a window, and who may open the link. It never carries
 * questions, a version, approval layers or routing — those come from the main
 * form, so an edit there reaches every instance at once. See
 * `docs/superpowers/specs/2026-09-05-form-instances-design.md`.
 *
 * Everything here is pure. Reading and writing instances lives in the
 * SharePoint layer; enforcing them lives on the server. This file only decides
 * what the facts mean.
 */

export type InstanceStatus = "open" | "closed";

/** What an instance is doing right now, once its date is taken into account. */
export type InstanceState = "open" | "closed" | "expired";

export interface FormInstance {
  id: string;
  title: string;
  formTitle: string;
  formSlug: string;
  /** The opaque key the link carries. Holds no payload of its own. */
  token: string;
  prefill: Record<string, unknown>;
  lockedFields: string[];
  /** Denormalised `prefill[groupByField]`, so a group can be found without parsing every instance. */
  groupValue: string;
  /** ISO date, or "" for an instance that runs until someone closes it. */
  expiresAt: string;
  status: InstanceStatus;
  requireSignIn: boolean;
  createdBy: string;
  created: string;
}

/**
 * Closed by hand beats the date: an instance shut early is closed, not "open
 * until Friday". An unparseable or absent date never closes anything — a column
 * holding junk must not silently shut a live event.
 */
export function instanceState(instance: FormInstance, now: Date = new Date()): InstanceState {
  if (instance.status === "closed") return "closed";

  const expiry = Date.parse(instance.expiresAt || "");
  if (!Number.isFinite(expiry)) return "open";

  return now.getTime() >= expiry ? "expired" : "open";
}

export function canAcceptSubmission(instance: FormInstance, now: Date = new Date()): boolean {
  return instanceState(instance, now) === "open";
}

/**
 * The value this instance actually groups under.
 *
 * `groupValue` is a denormalised copy of `prefill[groupByField]`, written when
 * the instance is saved. The two drift in one ordinary case: an instance
 * created before the form had a grouping field, or before it was changed to a
 * different one. The prefill is the source of truth, so read through to it
 * rather than leaving those instances permanently ungrouped.
 */
export function effectiveGroupValue(instance: FormInstance, groupByField: string): string {
  const stored = instance.groupValue.trim();
  if (stored) return stored;
  if (!groupByField) return "";
  const raw = instance.prefill?.[groupByField];
  return raw === null || raw === undefined ? "" : String(raw).trim();
}

export interface SubmissionGroup {
  /** The grouping field's value. "" is the bucket for blank and missing values. */
  value: string;
  count: number;
  /** The instance that set this value, when one did. Historical groups have none. */
  instance?: FormInstance;
}

function groupKeyOf(submission: Submission, field: string): string {
  const raw = submission.submissionData?.[field];
  if (raw === null || raw === undefined) return "";
  return String(raw).trim();
}

/**
 * The groups All Submissions shows for a form, newest concern first: every
 * distinct value of the nominated field, joined to the instance that set it.
 *
 * TWO THINGS THIS DELIBERATELY ALLOWS.
 *
 * A group with no instance — the historical case. Ad-hoc prefilled links were
 * never recorded and cannot be recovered, but their submissions still carry the
 * event in their answers, which is the whole reason the group key is a field
 * value rather than an instance id.
 *
 * An instance with no submissions — a freshly created event. Dropping it would
 * make a new instance look like it had failed.
 */
export function buildSubmissionGroups(
  submissions: Submission[],
  groupByField: string,
  instances: FormInstance[],
): SubmissionGroup[] {
  if (!groupByField) return [];

  const counts = new Map<string, number>();
  for (const submission of submissions) {
    const key = groupKeyOf(submission, groupByField);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // First instance wins where two share a value: they are one group by
  // definition, and the group's identity is the value, not either instance.
  const instanceByValue = new Map<string, FormInstance>();
  for (const instance of instances) {
    const key = effectiveGroupValue(instance, groupByField);
    if (!key) continue;
    if (!instanceByValue.has(key)) instanceByValue.set(key, instance);
    if (!counts.has(key)) counts.set(key, 0);
  }

  return [...counts.entries()].map(([value, count]) => ({
    value,
    count,
    instance: instanceByValue.get(value),
  }));
}

/**
 * Which of the locked fields this form's routing reads.
 *
 * Locking one of these decides the approver for every response in the instance,
 * at creation time rather than by the person filling the form in — which for an
 * event is often right, and is also a way to misroute forty submissions
 * silently. The creation dialog says which, so it is a choice rather than an
 * accident.
 *
 * The layer config is walked rather than pattern-matched against known assignee
 * shapes: `resolveAssignee` supports several, and a new one added later should
 * be covered here without anyone remembering to come back.
 */
export function lockedRoutingFields(lockedFields: string[], layerConfig: unknown): string[] {
  if (lockedFields.length === 0) return [];

  const referenced = new Set<string>();
  const walk = (node: unknown, depth: number) => {
    if (depth > 12 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      // Any string sitting under a `field`-ish key names a form field.
      if (typeof value === "string" && /field$/i.test(key)) referenced.add(value);
      else walk(value, depth + 1);
    }
  };

  try {
    walk(typeof layerConfig === "string" ? JSON.parse(layerConfig) : layerConfig, 0);
  } catch {
    // Unreadable config names no fields — the dialog simply warns about none.
    return [];
  }

  return lockedFields.filter((field) => referenced.has(field));
}

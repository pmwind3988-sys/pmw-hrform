import { queryListItemByFields } from "./graphClient.js";

/**
 * Form instances, server side.
 *
 * An instance is a named run of a form — a training event, an induction —
 * carrying fixed answers, a window and a link. See
 * `docs/superpowers/specs/2026-09-05-form-instances-design.md`.
 *
 * Server-side mirror of the decisions in `src/utils/formInstances.ts` — keep
 * the two in sync (same duplication pattern as `layerRecipients.ts`). The
 * browser's copy exists so the form behaves sensibly. THIS one is the copy that
 * decides anything: expiry, status, sign-in and the locked values are settled
 * here, against the record, because a request body cannot be trusted to
 * describe the instance it claims to belong to.
 */

export const INSTANCE_LIST = "Form Instances";
export const INSTANCE_ID_FIELD = "InstanceId";

export type InstanceState = "open" | "closed" | "expired";

export interface ServerFormInstance {
  id: string;
  title: string;
  formTitle: string;
  formSlug: string;
  token: string;
  prefill: Record<string, unknown>;
  lockedFields: string[];
  groupValue: string;
  expiresAt: string;
  status: "open" | "closed";
  requireSignIn: boolean;
}

function parseObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseStringArray(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function toInstance(id: string, fields: Record<string, unknown>): ServerFormInstance {
  return {
    id,
    title: typeof fields.Title === "string" ? fields.Title : "",
    formTitle: typeof fields.FormTitle === "string" ? fields.FormTitle : "",
    formSlug: typeof fields.FormSlug === "string" ? fields.FormSlug : "",
    token: typeof fields.InstanceToken === "string" ? fields.InstanceToken : "",
    prefill: parseObject(fields.PrefillJson),
    lockedFields: parseStringArray(fields.LockedFields),
    groupValue: typeof fields.GroupValue === "string" ? fields.GroupValue : "",
    expiresAt: typeof fields.ExpiresAt === "string" ? fields.ExpiresAt : "",
    // Anything that is not the string "closed" is open. The safe direction: a
    // junk value leaves an event running rather than shutting it silently.
    status: fields.InstanceStatus === "closed" ? "closed" : "open",
    // Absent means required. A missing column must not silently open a form to
    // the internet — the permissive reading has to be written down explicitly.
    requireSignIn: fields.RequireSignIn !== false,
  };
}

/**
 * The instance a link points at, or null.
 *
 * Null covers every "there is no such instance" case, including the list not
 * existing on this site yet: a tenant that has never created one must serve
 * ordinary forms exactly as before rather than failing.
 */
export async function loadInstanceByToken(
  graphToken: string,
  instanceToken: string,
): Promise<ServerFormInstance | null> {
  const trimmed = (instanceToken || "").trim();
  if (!trimmed) return null;

  try {
    const item = await queryListItemByFields(graphToken, INSTANCE_LIST, {
      InstanceToken: trimmed,
    });
    return item ? toInstance(item.id, item.fields) : null;
  } catch {
    return null;
  }
}

/**
 * Closed by hand beats the date: an instance shut early is closed, not "open
 * until Friday". An unparseable or absent date never closes anything — a column
 * holding junk must not shut a live event.
 */
export function instanceState(
  instance: ServerFormInstance,
  now: Date = new Date(),
): InstanceState {
  if (instance.status === "closed") return "closed";
  const expiry = Date.parse(instance.expiresAt || "");
  if (!Number.isFinite(expiry)) return "open";
  return now.getTime() >= expiry ? "expired" : "open";
}

export function canAcceptSubmission(instance: ServerFormInstance, now: Date = new Date()): boolean {
  return instanceState(instance, now) === "open";
}

/**
 * Overwrites the locked answers with the instance's own, and returns which
 * fields the submitter had disagreed about.
 *
 * This is the whole point of enforcing server-side. The browser renders locked
 * fields read-only, but read-only is a rendering choice; without this, a locked
 * field is a suggestion and the event name on a submission is whatever the
 * respondent typed into dev tools.
 *
 * A name locked but never given a value is skipped rather than blanking the
 * answer: `LockedFields` and `PrefillJson` are separate columns and can drift.
 */
export function applyLockedValues(
  data: Record<string, unknown>,
  instance: ServerFormInstance,
): { data: Record<string, unknown>; overridden: string[] } {
  const result = { ...data };
  const overridden: string[] = [];

  for (const name of instance.lockedFields) {
    if (!Object.prototype.hasOwnProperty.call(instance.prefill, name)) continue;
    const authoritative = instance.prefill[name];
    if (JSON.stringify(result[name]) !== JSON.stringify(authoritative)) overridden.push(name);
    result[name] = authoritative;
  }

  return { data: result, overridden };
}

/**
 * What the browser is allowed to know about an instance.
 *
 * Deliberately not the whole row: `CreatedByEmail` names a member of staff and
 * this endpoint answers to the API key that ships in the client bundle, so its
 * response is public. Same reasoning as `redactLayerConfigForPublic`.
 */
export function publicInstanceView(instance: ServerFormInstance, now: Date = new Date()) {
  return {
    title: instance.title,
    state: instanceState(instance, now),
    expiresAt: instance.expiresAt,
    requireSignIn: instance.requireSignIn,
    prefill: instance.prefill,
    lockedFields: instance.lockedFields,
  };
}

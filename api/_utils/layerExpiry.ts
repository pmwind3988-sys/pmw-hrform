/**
 * layerExpiry.ts — when a public review link stops working.
 *
 * A public layer's link used to die on one date the form's author picked, held
 * in `tokenExpiresAt` and shared by every submission that ever reached that
 * step. A permit signed off a year apart from another permit had the same
 * deadline, which is rarely what the author meant.
 *
 * A layer may now instead name one of the workflow's own questions — "expire
 * three days after Permit End Date" — so each submission's link has its own
 * lifespan, read from that submission's answers at the moment somebody opens it.
 *
 * The question need not belong to the submitted form. `sourceLayer` says which
 * form carries it: 0 is the submitted form, whose answers are the record's own
 * columns, and any higher number is an earlier review layer, whose answers the
 * record keeps in its `EvaluationData` column. Layer 2's link can therefore
 * expire off a date that layer 1's evaluator filled in. A later layer is never
 * a sensible source — it has answered nothing while this link is live — and the
 * builder does not offer one; pointing at one here simply never expires.
 *
 * Days are Malaysian, not the server's. The reference number code already
 * learned this the hard way (`referenceNumber.ts`): a browser in an unknown
 * timezone and a Vercel function running in UTC disagree about which day it is
 * for eight hours out of every twenty-four, and "expires on the 1st" must not
 * mean two different instants depending on who asks.
 *
 * An unreadable answer means **no expiry**, not an expired link. That is only
 * safe because a link now opens one submission and no other — see
 * `layerItemAccess.ts`. Were the link still able to wander, failing open here
 * would be a hole; as it is, it means one reviewer keeps access to the one
 * record they were already sent.
 */

const MALAYSIA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const EXPLICIT_TIMEZONE_RE = /(?:z|[+-]\d{2}:?\d{2})$/i;

export type LayerExpiryMode = "fixed" | "field";

export interface LayerExpiryConfig {
  mode?: LayerExpiryMode;
  /**
   * Which form carries the question: 0 (or absent) the submitted form, higher
   * an earlier review layer. Field mode only.
   */
  sourceLayer?: number;
  /** Question name whose answer carries the date. Field mode only. */
  field?: string;
  /** Days of grace after that date. Field mode only; 0 means the day itself. */
  offsetDays?: number;
}

/** The parts of a layer that decide when its link dies. */
export interface ExpirableLayer {
  tokenExpiresAt?: unknown;
  tokenExpiry?: LayerExpiryConfig | unknown;
}

interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

function readExpiryConfig(value: unknown): LayerExpiryConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const mode = record.mode === "field" ? "field" : record.mode === "fixed" ? "fixed" : undefined;
  if (!mode) return null;
  const sourceLayer = Number(record.sourceLayer);
  return {
    mode,
    sourceLayer: Number.isFinite(sourceLayer) && sourceLayer > 0 ? Math.trunc(sourceLayer) : 0,
    field: typeof record.field === "string" ? record.field.trim() : "",
    offsetDays: Number.isFinite(Number(record.offsetDays)) ? Number(record.offsetDays) : 0,
  };
}

/**
 * The answer a field-mode layer points at, from whichever form carries it.
 *
 * An earlier layer's answers are not columns on the record; they are one entry
 * per layer inside the `EvaluationData` JSON. A layer's questions are that
 * layer's own, so a missing entry is never resolved against a same-named column
 * on the submitted form: until that layer is completed the answer is simply
 * absent, which the caller reads as "no expiry yet".
 *
 * `EvaluationData` is a JSON blob in a text column, so unparseable content
 * means no layer answers rather than a thrown request.
 */
export function readExpirySourceAnswer(
  fields: Record<string, unknown> | undefined,
  sourceLayer: number | undefined,
  field: string,
): unknown {
  if (!field) return undefined;
  if (!sourceLayer) return fields?.[field];

  const raw = fields?.EvaluationData;
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;

  const entry = (parsed as Record<string, unknown>)[String(sourceLayer)];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
  const layerFields = (entry as { fields?: unknown }).fields;
  if (!layerFields || typeof layerFields !== "object" || Array.isArray(layerFields)) return undefined;
  return (layerFields as Record<string, unknown>)[field];
}

/**
 * A SharePoint answer flattened to text. Choice and lookup columns arrive as
 * objects, and a date question that was authored as plain text arrives as a
 * string — both have to reach the parser.
 */
function answerToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  for (const key of ["value", "Value", "text", "Text", "displayValue", "DisplayValue"]) {
    const next = record[key];
    if (typeof next === "string" && next.trim()) return next.trim();
  }
  return "";
}

/**
 * Which Malaysian calendar day an answer refers to.
 *
 * A bare `2026-09-01` is already a calendar day and is taken at face value — it
 * carries no instant to convert. Anything with a real timezone (SharePoint
 * stores date columns as UTC, so 1 September picked in Kuala Lumpur is written
 * `2026-08-31T16:00:00Z`) is shifted into UTC+8 before its date is read, or the
 * last eight hours of every Malaysian day would count as the day before.
 */
export function malaysiaCalendarDay(value: unknown): CalendarDay | null {
  const text = answerToText(value);
  if (!text) return null;

  const dateOnly = text.match(DATE_ONLY_RE);
  if (dateOnly) {
    const day = { year: Number(dateOnly[1]), month: Number(dateOnly[2]), day: Number(dateOnly[3]) };
    return isRealDay(day) ? day : null;
  }

  const time = Date.parse(text);
  if (Number.isNaN(time)) return null;
  // A local-looking datetime ("2026-09-01T09:30") is parsed by the runtime as
  // its own local time. Only shift values that actually named a zone.
  const instant = EXPLICIT_TIMEZONE_RE.test(text) ? time : time - MALAYSIA_UTC_OFFSET_MS;
  const shifted = new Date(instant + MALAYSIA_UTC_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function isRealDay(day: CalendarDay): boolean {
  const probe = new Date(Date.UTC(day.year, day.month - 1, day.day));
  return probe.getUTCFullYear() === day.year
    && probe.getUTCMonth() === day.month - 1
    && probe.getUTCDate() === day.day;
}

/**
 * The instant a link dies: the close of its Malaysian day, plus any grace the
 * author allowed. End of day rather than start, because "expires on the 1st"
 * means the reviewer has the 1st — expiring at midnight as it begins would take
 * the whole day away.
 */
export function malaysiaEndOfDay(day: CalendarDay, offsetDays = 0): Date {
  const offset = Number.isFinite(offsetDays) ? Math.trunc(offsetDays) : 0;
  return new Date(
    Date.UTC(day.year, day.month - 1, day.day + offset, 23, 59, 59, 999) - MALAYSIA_UTC_OFFSET_MS,
  );
}

/**
 * When this layer's link dies for this submission, or `null` for "never".
 *
 * `null` covers a layer with no expiry configured at all, a field-mode layer
 * whose source form has not been answered yet, and a field-mode layer whose
 * answer cannot be read as a date — see the note at the top of this file for
 * why the last two are deliberate.
 */
export function resolveLayerExpiry(
  layer: ExpirableLayer | undefined,
  fields: Record<string, unknown> | undefined,
): Date | null {
  if (!layer) return null;
  const config = readExpiryConfig(layer.tokenExpiry);

  if (config?.mode === "field") {
    if (!config.field) return null;
    const day = malaysiaCalendarDay(readExpirySourceAnswer(fields, config.sourceLayer, config.field));
    if (!day) return null;
    return malaysiaEndOfDay(day, config.offsetDays);
  }

  const fixed = answerToText(layer.tokenExpiresAt);
  if (!fixed) return null;
  const time = Date.parse(fixed);
  return Number.isNaN(time) ? null : new Date(time);
}

export function isLayerExpired(
  layer: ExpirableLayer | undefined,
  fields: Record<string, unknown> | undefined,
  now: Date = new Date(),
): boolean {
  const expiresAt = resolveLayerExpiry(layer, fields);
  return expiresAt !== null && expiresAt.getTime() < now.getTime();
}

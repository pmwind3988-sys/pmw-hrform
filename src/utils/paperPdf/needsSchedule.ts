/**
 * needsSchedule.ts — The Training Needs Analysis's tentative schedule: a first
 * day, a number of back-to-back days, and one time range that holds every day.
 *
 * Stored on each row of the training-needs table as
 *   Tentative_Date  (Date)        — the first day, as the form always stored it
 *   Tentative_Start (Date & time) — first day + start time
 *   Tentative_End   (Date & time) — last day + end time
 *   Tentative_Days  (Number)
 * so older readers keep their date while SharePoint gains a real start and end.
 * Times are Malaysia time, written without an offset (`toSharePointMalaysiaDateTime`
 * converts them on the way in). Pure.
 */

export interface ScheduleColumns<C> {
  firstDay?: C;
  start?: C;
  end?: C;
  days?: C;
}

const START = /tentative.*start|start.*(date|time)/i;
const END = /tentative.*end|end.*(date|time)/i;
const DAYS = /tentative.*days|no.*of.*days|\bdays\b/i;
const FIRST_DAY = /tentative|date/i;

const describe = (c: { name: string; title?: string }) => `${c.name} ${c.title ?? ""}`;

/** The table's schedule columns, found by what they are called. */
export function scheduleColumns<C extends { name: string; title?: string }>(columns: C[]): ScheduleColumns<C> {
  const start = columns.find((c) => START.test(describe(c)));
  const end = columns.find((c) => c !== start && END.test(describe(c)));
  const days = columns.find((c) => c !== start && c !== end && DAYS.test(describe(c)));
  const firstDay = columns.find((c) => c !== start && c !== end && c !== days && FIRST_DAY.test(describe(c)));
  return { firstDay, start, end, days };
}

/** Whether a column is one of the schedule's own (start, end, days), drawn inside the Tentative Date cell. */
export function isScheduleColumn<C extends { name: string; title?: string }>(column: C, all: C[]): boolean {
  const { start, end, days } = scheduleColumns(all);
  return column === start || column === end || column === days;
}

/** A schedule as the HOD writes it. Dates `YYYY-MM-DD`, times `HH:mm`. */
export interface ScheduleInput {
  firstDay: string;
  days: number | null;
  from: string;
  to: string;
}

export const DEFAULT_FROM = "09:00";
export const DEFAULT_TO = "17:00";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, "0");

function addDays(date: string, count: number): string {
  const m = DATE_RE.exec(date);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + count));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** What is missing or wrong, in the HOD's words; "" when the schedule is complete. */
export function scheduleProblem(input: ScheduleInput): string {
  if (!input.firstDay && !input.days) return "";
  if (!DATE_RE.test(input.firstDay)) return "Pick the first day.";
  if (!input.days || input.days < 1) return "Enter how many days.";
  if (!TIME_RE.test(input.from) || !TIME_RE.test(input.to)) return "Enter the start and end time.";
  if (input.to <= input.from) return "The end time must be after the start time.";
  return "";
}

/** The stored values for a schedule; start and end are blank until it is complete. */
export function scheduleValues(input: ScheduleInput): { firstDay: string; start: string; end: string; days: number | null } {
  const days = input.days && input.days >= 1 ? Math.floor(input.days) : null;
  if (scheduleProblem(input) || !input.firstDay) return { firstDay: input.firstDay, start: "", end: "", days };
  return {
    firstDay: input.firstDay,
    start: `${input.firstDay}T${input.from}`,
    end: `${addDays(input.firstDay, (days ?? 1) - 1)}T${input.to}`,
    days,
  };
}

const EXPLICIT_ZONE = /(?:z|[+-]\d{2}:?\d{2})$/i;

/** A stored date or date-time as Malaysia-local `YYYY-MM-DD` and `HH:mm`. SharePoint hands back UTC. */
export function malaysiaParts(value: unknown): { date: string; time: string } | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  if (EXPLICIT_ZONE.test(text)) {
    const ms = Date.parse(text);
    if (Number.isNaN(ms)) return null;
    const d = new Date(ms + 8 * 60 * 60 * 1000);
    return { date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
  }
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}):(\d{2}))?/.exec(text);
  if (!m) return null;
  return { date: m[1], time: m[2] ? `${m[2]}:${m[3]}` : "" };
}

/** A row's schedule as the HOD wrote it, read back from what was stored. */
export function readSchedule(row: Record<string, unknown> | null | undefined, cols: ScheduleColumns<{ name: string }>): ScheduleInput {
  const value = (c?: { name: string }) => (row && c ? row[c.name] : undefined);
  const start = malaysiaParts(value(cols.start));
  const end = malaysiaParts(value(cols.end));
  const first = malaysiaParts(value(cols.firstDay));
  const rawDays = value(cols.days);
  const days = rawDays === undefined || rawDays === null || rawDays === "" ? null : Number(rawDays);
  return {
    firstDay: start?.date || first?.date || "",
    days: Number.isFinite(days) ? days : null,
    from: start?.time || DEFAULT_FROM,
    to: end?.time || DEFAULT_TO,
  };
}

function dmy(date: string): string {
  const m = DATE_RE.exec(date);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : date;
}

function ampm(time: string): string {
  const m = TIME_RE.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * The schedule as the paper form prints it:
 *   15/02/2027 – 17/02/2027
 *   3 days · 9:00 AM – 5:00 PM
 * A row with only a first day (an older submission) prints that date alone.
 */
export function formatSchedule(input: ScheduleInput): string {
  if (!input.firstDay) return "";
  if (scheduleProblem(input)) return dmy(input.firstDay);
  const days = input.days ?? 1;
  const last = addDays(input.firstDay, days - 1);
  const dates = days === 1 ? dmy(input.firstDay) : `${dmy(input.firstDay)} – ${dmy(last)}`;
  return `${dates}\n${days} ${days === 1 ? "day" : "days"} · ${ampm(input.from)} – ${ampm(input.to)}`;
}

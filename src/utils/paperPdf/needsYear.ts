/**
 * needsYear.ts — Which year a Training Needs Analysis is for.
 *
 * The form plans training ahead, so one prepared late in the year is almost
 * always for the next: from October on, next year is offered first. The HOD
 * can still pick this year or the one after. Pure.
 */

/** The month (1–12) from which a new form is taken to be planning next year. */
export const NEXT_YEAR_FROM_MONTH = 10;

/** The year a form opened today is most likely for. */
export function defaultNeedsYear(now: Date): number {
  return now.getFullYear() + (now.getMonth() + 1 >= NEXT_YEAR_FROM_MONTH ? 1 : 0);
}

/** The years to offer: this year and the two after, plus the one already chosen if it is none of those. */
export function needsYearChoices(now: Date, chosen?: unknown): number[] {
  const first = now.getFullYear();
  const years = [first, first + 1, first + 2];
  const kept = Number(chosen);
  if (Number.isInteger(kept) && kept > 1900 && !years.includes(kept)) years.push(kept);
  return years.sort((a, b) => a - b);
}

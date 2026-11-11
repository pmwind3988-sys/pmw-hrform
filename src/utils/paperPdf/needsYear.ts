/**
 * needsYear.ts — Which year the Training Needs Analysis is for.
 *
 * Fixed, at HR's request: the form plans one year's training, so the sheet
 * shows that year locked and saves it as the Year question's answer, whatever
 * a test run or an old draft put there. Change `NEEDS_YEAR` when the next
 * year's planning opens. Pure.
 */

/** The year every Training Needs Analysis filled in now is for. */
export const NEEDS_YEAR = 2027;

/** The fixed year as the Year question stores it: a number for a number question, text otherwise. */
export function needsYearAnswer(inputType?: string): number | string {
  return inputType === "number" ? NEEDS_YEAR : String(NEEDS_YEAR);
}

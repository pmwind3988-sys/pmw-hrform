/**
 * needsAnalysisRows.ts — The Training Needs Analysis table as the HOD fills it
 * on paper: always at least the Word form's five numbered rows on screen, but
 * only the rows somebody wrote in are kept as the answer.
 *
 * Kept apart from the component so the rules are testable. Pure.
 */

export type NeedsRow = Record<string, unknown>;

/** Whether a row has nothing written in it. */
export function isEmptyNeedsRow(row: NeedsRow | undefined): boolean {
  if (!row) return true;
  return Object.values(row).every((v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0));
}

/** The answer with blank rows at its end dropped, so untouched paper rows never submit. */
export function trimNeedsRows(rows: NeedsRow[]): NeedsRow[] {
  let end = rows.length;
  while (end > 0 && isEmptyNeedsRow(rows[end - 1])) end -= 1;
  return rows.slice(0, end);
}

/** The answer after writing one cell; rows before it are padded so row numbers stay put. */
export function writeNeedsCell(rows: NeedsRow[], index: number, column: string, value: unknown): NeedsRow[] {
  return writeNeedsCells(rows, index, { [column]: value });
}

/** The answer after writing several cells of one row at once (a schedule's four columns). */
export function writeNeedsCells(rows: NeedsRow[], index: number, cells: NeedsRow): NeedsRow[] {
  const next = rows.map((row) => ({ ...row }));
  while (next.length <= index) next.push({});
  const row = { ...next[index], ...cells };
  // A cleared cell leaves the row, so a blank never reaches a Number or Date column.
  for (const [key, value] of Object.entries(cells)) if (value === undefined) delete row[key];
  next[index] = row;
  return trimNeedsRows(next);
}

/** The answer with one row taken out; the rows below it move up. */
export function removeNeedsRow(rows: NeedsRow[], index: number): NeedsRow[] {
  return trimNeedsRows(rows.filter((_, i) => i !== index));
}

/**
 * How many rows to draw: the answer, the rows the HOD opened, and never fewer
 * than the paper's minimum — nor more than the form allows.
 */
export function shownNeedsRowCount(answered: number, opened: number, minimum: number, maximum: number): number {
  const wanted = Math.max(answered, opened, minimum);
  return maximum > 0 ? Math.min(wanted, Math.max(maximum, answered)) : wanted;
}

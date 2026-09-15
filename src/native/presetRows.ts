/**
 * presetRows.ts — tables whose rows the author wrote, not the respondent.
 *
 * An inspection sheet usually knows its own rows: three pole types, one serial
 * number to record against each. The author types that list into a column and
 * the table opens with those rows already there, locked, so the respondent
 * fills the blanks beside them instead of retyping the labels.
 *
 * The preset values are seeded into the *answer*, not painted over it, so a
 * submission carries them as ordinary row data and every downstream reader —
 * the PDF, the data view, the SharePoint child rows — keeps working untouched.
 *
 * Pure: no React, no network.
 */

import type { NativeColumn } from "./schema";

type Row = Record<string, unknown>;

/** Columns the author gave a fixed list of values. */
export function presetColumns(columns: NativeColumn[]): NativeColumn[] {
  return columns.filter((column) => column.presetValues.length > 0);
}

export function hasPresetRows(columns: NativeColumn[]): boolean {
  return presetColumns(columns).length > 0;
}

/**
 * How many rows the preset lists demand.
 *
 * The longest list wins: two preset columns of unequal length is an authoring
 * slip, and dropping the tail of the longer one would silently lose rows the
 * author typed. The shorter column simply leaves its extra cells blank.
 */
export function presetRowCount(columns: NativeColumn[]): number {
  return presetColumns(columns).reduce((most, column) => Math.max(most, column.presetValues.length), 0);
}

/**
 * The table's rows with the preset cells written in.
 *
 * Existing answers are preserved cell by cell — reopening a saved submission
 * must not discard what was typed — but a preset cell is always the author's
 * current value, so a corrected label reaches a draft that was saved before the
 * correction.
 */
export function applyPresetRows(columns: NativeColumn[], existing: unknown): Row[] {
  const presets = presetColumns(columns);
  const rows: Row[] = Array.isArray(existing) ? (existing as Row[]).map((row) => ({ ...row })) : [];
  if (presets.length === 0) return rows;

  const count = presetRowCount(columns);
  const next: Row[] = Array.from({ length: count }, (_, i) => ({ ...(rows[i] ?? {}) }));
  for (const column of presets) {
    column.presetValues.forEach((preset, i) => {
      next[i][column.name] = preset;
    });
  }
  // Rows beyond the preset list can only come from a form whose preset list was
  // shortened after someone answered it. Keeping them would leave rows nobody
  // can identify, since their label column is now blank.
  return next;
}

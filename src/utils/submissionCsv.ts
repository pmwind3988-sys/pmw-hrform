import type { Submission } from "../types";
import { csvCell } from "./csv";

/**
 * The dashboard's CSV export.
 *
 * Lifted out of `AdminHomePage` when the submissions list became its own
 * section, so the page holds the dialog and this holds the format.
 */
const EXPORT_BASE_COLUMNS = [
  "Reference",
  "Form",
  "Category",
  "Title",
  "Submitted By",
  "Submitter Email",
  "Submitted At",
  "Modified At",
  "Status",
  "Current Layer",
  "Total Layers",
  "Selected Branch",
] as const;

export function buildSubmissionCsv(
  rows: Submission[],
  listMetaMap: Record<string, { category: string }>,
): string {
  /**
   * Every field key present on ANY row becomes a column, sorted, so the sheet
   * is rectangular: forms differ in their fields, and a row missing one simply
   * leaves that cell empty rather than shifting the columns after it.
   */
  const fieldKeys = Array.from(
    rows.reduce((keys, row) => {
      Object.keys(row.submissionData).forEach((key) => keys.add(key));
      return keys;
    }, new Set<string>()),
  ).sort((a, b) => a.localeCompare(b));
  const columns = [...EXPORT_BASE_COLUMNS, ...fieldKeys];
  const lines = [columns.map(csvCell).join(",")];

  for (const row of rows) {
    const baseValues: Record<(typeof EXPORT_BASE_COLUMNS)[number], unknown> = {
      Reference: row.submissionId,
      Form: row.listTitle,
      Category: listMetaMap[row.listTitle]?.category ?? "",
      Title: row.title,
      "Submitted By": row.submitterName || row.createdByName || row.submittedByEmail,
      "Submitter Email": row.submittedByEmail || row.createdByEmail,
      "Submitted At": row.submittedAt,
      "Modified At": row.modifiedAt,
      Status: row.formStatus,
      "Current Layer": row.currentLayer ?? "",
      "Total Layers": row.totalLayers,
      "Selected Branch": row.selectedBranch ?? "",
    };
    lines.push(
      [
        ...EXPORT_BASE_COLUMNS.map((column) => csvCell(baseValues[column])),
        ...fieldKeys.map((key) => csvCell(row.submissionData[key])),
      ].join(","),
    );
  }

  // CRLF: Excel is the destination, and it is the line ending it expects.
  return lines.join("\r\n");
}

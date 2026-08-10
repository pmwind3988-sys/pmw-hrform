/**
 * csv.ts — shared CSV emitting for admin exports.
 *
 * Quoting follows RFC 4180: every cell is quoted and embedded quotes are
 * doubled. Writing `"${value}"` without that doubling silently corrupts any row
 * containing a quote character, which is what ResponseViewer used to do.
 */

/** Byte-order mark. Built from its code point so the source stays plain ASCII. */
const UTF8_BOM = String.fromCharCode(0xfeff);

/** Quotes one cell, doubling embedded quotes. Objects are JSON, blanks empty. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/** Joins one row of raw values into a CSV line. */
export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

/**
 * Downloads `csv` as a file. The BOM is what makes Excel read it as UTF-8
 * rather than the local ANSI code page, so accented names survive the trip.
 */
export function downloadCsv(csv: string, fileName: string): void {
  const blob = new Blob([`${UTF8_BOM}${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * matrixData.ts — the shape of a dynamic-matrix answer, and what to do with it.
 *
 * These lived in `DynamicMatrix.tsx`, alongside a SurveyJS question type that
 * pulled a 1.4 MB renderer into every page that wanted to read a matrix answer.
 * The question type is gone and SurveyJS is uninstalled; this is the part that
 * was actually being used.
 *
 * `columns` still describes a matrix the way published SurveyJSON does, because
 * that is the stored format — but nothing here executes any of it.
 *
 * Pure: no React, no network.
 */

export interface MatrixColumn {
  name: string;
  title: string;
  cellType?: string;
  choices?: string[];
  multiSelect?: boolean;
  choicesSource?: { list?: string; column?: string };
  filteredListSource?: { list?: string; valueColumn?: string; filterColumn?: string; filterValue?: string; choicesLoaded?: boolean };
}

export interface MatrixRow {
  [key: string]: unknown;
}

export interface DynamicMatrixFieldMeta {
  name: string;
  columns: MatrixColumn[];
  title?: string;
}

export function getDynamicMatrixFields(surveyJson: unknown): DynamicMatrixFieldMeta[] {
  const result: DynamicMatrixFieldMeta[] = [];
  try {
    const def = surveyJson as Record<string, unknown>;
    // Handle { surveyJson: {...}, layerConfig: ... } wrapper
    const inner = (def.pages ? def : def.surveyJson) as Record<string, unknown> | undefined;
    const pages = (inner as { pages?: unknown[] } | undefined)?.pages as { elements?: unknown[] }[] | undefined;
    if (!pages) return result;

    const walk = (elements: unknown[]) => {
      for (const el of elements) {
        const elem = el as Record<string, unknown>;
        if ((elem.type === "dynamicmatrix" || elem.type === "matrixdynamic") && elem.name) {
          const cols = (elem.columns as MatrixColumn[]) || [];
          if (cols.length > 0) {
            result.push({ name: String(elem.name), columns: cols, title: elem.title as string | undefined });
          }
        }
        if (elem.elements) {
          walk(elem.elements as unknown[]);
        }
      }
    };

    for (const page of pages) {
      if (page.elements) walk(page.elements);
    }
  } catch {
    // Return empty on parse issues
  }
  return result;
}


/**
 * Every field whose answer is a table of rows — dynamic matrices and table
 * inputs alike.
 *
 * Separate from `getDynamicMatrixFields` because that one feeds the child-list
 * and PDF paths, which only ever handled dynamic matrices. This one exists for
 * the submit path, where the question is narrower: does this answer need to be
 * written as `<name>_Response` + `<name>_Json` rather than a bare column?
 * Provisioning never creates a bare column for either type (see
 * `getSpColumnKind`), so sending one is always rejected.
 *
 * Columns may legitimately be empty here; an author can publish a table before
 * defining its columns, and that answer still has to reach SharePoint.
 */
export function getTabularFields(surveyJson: unknown): DynamicMatrixFieldMeta[] {
  const result: DynamicMatrixFieldMeta[] = [];
  try {
    const def = surveyJson as Record<string, unknown>;
    const inner = (def.pages ? def : def.surveyJson) as Record<string, unknown> | undefined;
    const pages = (inner as { pages?: unknown[] } | undefined)?.pages as { elements?: unknown[] }[] | undefined;
    if (!pages) return result;

    const walk = (elements: unknown[]) => {
      for (const el of elements) {
        const elem = el as Record<string, unknown>;
        const type = elem.type;
        if ((type === "dynamicmatrix" || type === "matrixdynamic" || type === "tableinput") && elem.name) {
          result.push({
            name: String(elem.name),
            columns: (elem.columns as MatrixColumn[]) || [],
            title: elem.title as string | undefined,
          });
        }
        if (elem.elements) {
          walk(elem.elements as unknown[]);
        }
      }
    };

    for (const page of pages) {
      if (page.elements) walk(page.elements);
    }
  } catch {
    // Return empty on parse issues
  }
  return result;
}


/**
 * Looks up the property name SharePoint actually stores a column under.
 *
 * Returns null when the column is unknown to the list.
 */
export type ColumnKeyResolver = (columnName: string) => string | null;

/**
 * Rewrites a row's cells to the property names SharePoint will accept.
 *
 * A column asked for as `col1` is filed by SharePoint under a name of its own
 * choosing — `OData__x0063_ol1`, say, escaping the leading letter. Writing the
 * name we asked for is rejected outright ("The property 'col1' does not exist
 * on type ..."), which is why matrix rows were saved with nothing in them. The
 * response list has always mapped its fields this way before writing; this is
 * the same step for the child lists a matrix writes to.
 *
 * A column the list does not know keeps its own name, so the caller still sends
 * it and SharePoint still reports it — better a loud rejection than a cell
 * quietly dropped.
 */
export function encodeMatrixRow(
  row: MatrixRow,
  columns: MatrixColumn[],
  resolveKey: ColumnKeyResolver,
): Record<string, unknown> {
  const encoded: Record<string, unknown> = {};
  for (const column of columns) {
    if (!column.name) continue;
    encoded[resolveKey(column.name) ?? column.name] = row[column.name] ?? null;
  }
  return encoded;
}

/**
 * The reverse: a row as SharePoint returns it, keyed the way the form asked.
 *
 * Everything that renders a saved matrix — the response viewer, the PDF —
 * reads `row[column.name]`, so a row still keyed by SharePoint's own property
 * names displays as blank. The original keys are kept alongside, since callers
 * also read `Id` and `RowIndex` off the same object.
 */
export function decodeMatrixRow(
  row: Record<string, unknown>,
  columns: MatrixColumn[],
  resolveKey: ColumnKeyResolver,
): MatrixRow {
  const decoded: MatrixRow = { ...row };
  for (const column of columns) {
    if (!column.name) continue;
    const storedKey = resolveKey(column.name);
    if (storedKey && storedKey !== column.name && storedKey in row) {
      decoded[column.name] = row[storedKey];
    }
  }
  return decoded;
}

// ── Convert row data → HTML table string (for SP rich-text column) ──
export function rowsToHtml(columns: MatrixColumn[], rows: MatrixRow[]): string {
  const headers = columns
    .map((c) => `<th style="border:1px solid #c4b5fd;padding:6px 10px;background:#ede9fe;font-size:11px;font-weight:600;color:#5b21b6;text-align:left">${c.title}</th>`)
    .join("");
  const bodyRows = rows
    .map((row) => {
      const cells = columns
        .map((c) => {
          const val = row[c.name];
          const display = Array.isArray(val) ? val.join(", ") : (val ?? "");
          return `<td style="border:1px solid #e5e3f0;padding:6px 10px;font-size:12px;color:#1e1b4b">${display}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table style="border-collapse:collapse;width:100%;font-family:Inter,'Segoe UI','Aptos','Helvetica Neue',Arial,sans-serif"><thead><tr>${headers}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

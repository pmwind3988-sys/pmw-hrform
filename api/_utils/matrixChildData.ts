/**
 * matrixChildData.ts — the repeating-table answers on a submission.
 *
 * A form can ask a question that is really a small table: one row per trip,
 * per item claimed, per person trained. Those rows do not fit in a column, so
 * they live in a list of their own per question, each row pointing back at the
 * submission it belongs to.
 *
 * They are submission data like any other answer, and were being read straight
 * from SharePoint by the reviewer's browser long after the rest of the record
 * had moved to the server. This reads them here instead, so the same question
 * — may this person see this submission — is answered once, in one place,
 * before any of it is sent.
 *
 * Only the columns and rows are returned. Turning them into a table is the
 * page's job, and there is no reason for two copies of that markup to exist.
 */

export interface MatrixColumnDef {
  name: string;
  title?: string;
  [key: string]: unknown;
}

export interface MatrixFieldMeta {
  name: string;
  title?: string;
  columns: MatrixColumnDef[];
}

export interface MatrixTable {
  columns: MatrixColumnDef[];
  rows: Record<string, unknown>[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The repeating-table questions in a form definition.
 *
 * Accepts either the survey itself or the `{ surveyJson, layerConfig }` wrapper
 * it is stored in, because both shapes reach this from different callers.
 */
export function getDynamicMatrixFields(surveyJson: unknown): MatrixFieldMeta[] {
  const result: MatrixFieldMeta[] = [];
  if (!isRecord(surveyJson)) return result;
  const inner = surveyJson.pages ? surveyJson : surveyJson.surveyJson;
  if (!isRecord(inner) || !Array.isArray(inner.pages)) return result;

  const walk = (elements: unknown): void => {
    if (!Array.isArray(elements)) return;
    for (const element of elements) {
      if (!isRecord(element)) continue;
      const type = typeof element.type === "string" ? element.type : "";
      if ((type === "dynamicmatrix" || type === "matrixdynamic") && element.name) {
        const columns = Array.isArray(element.columns) ? element.columns as MatrixColumnDef[] : [];
        if (columns.length > 0) {
          result.push({
            name: String(element.name),
            columns,
            title: typeof element.title === "string" ? element.title : undefined,
          });
        }
      }
      walk(element.elements);
    }
  };

  for (const page of inner.pages) {
    if (isRecord(page)) walk(page.elements);
  }
  return result;
}

/** The list one repeating-table question's rows are kept in. */
export function matrixChildListName(formTitle: string, fieldName: string): string {
  const safeName = fieldName.replace(/[^a-zA-Z0-9_ -]/g, "").trim();
  return `${formTitle} Matrix ${safeName}`;
}

/**
 * Every repeating table's rows for one submission, keyed by question name.
 *
 * A question whose list does not exist, or holds no rows for this submission,
 * is simply left out — these tables are an enrichment, and a form that never
 * had one must not fail to open over it.
 */
export async function readMatrixTables(
  formTitle: string,
  responseItemId: number,
  surveyJson: unknown,
  readChildItems: (listTitle: string, parentResponseId: number) => Promise<Record<string, unknown>[]>,
): Promise<Record<string, MatrixTable>> {
  const fields = getDynamicMatrixFields(surveyJson);
  const tables: Record<string, MatrixTable> = {};
  for (const field of fields) {
    try {
      const rows = await readChildItems(matrixChildListName(formTitle, field.name), responseItemId);
      if (rows.length > 0) tables[field.name] = { columns: field.columns, rows };
    } catch {
      // No such list for this question; nothing to add.
    }
  }
  return tables;
}

/**
 * Rows in the order the person entered them.
 *
 * `RowIndex` is written when the submission is saved. Sorting here rather than
 * asking SharePoint to do it avoids a query that fails on any list where the
 * column was never indexed — which is most of them.
 */
export function sortMatrixRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...rows].sort((a, b) => (Number(a.RowIndex) || 0) - (Number(b.RowIndex) || 0));
}

/**
 * matrixChildRows.ts — a submission's repeating-table rows, for the views that
 * read one back.
 *
 * A matrix does not keep its rows on the response item. They live in a child
 * list of their own, one row per item, and the parent column holds only a
 * flattened rendering of them. A view that reads the parent column alone gets
 * that flattening — every heading and every cell of the table run together on
 * one line — which is what the dashboard's detail card was showing.
 *
 * The PDF and the admin response viewer each already load the child list. This
 * is that step, once, in a shape `buildFormSubmissionSections` already
 * understands: `<question>_childRows`.
 *
 * The read itself is injected, so the caller brings its own authenticated
 * SharePoint client and this stays testable without one.
 */
import { getDynamicMatrixFields, type MatrixColumn } from "./matrixData";

/** Reads one child list's rows for a submission. */
export type MatrixChildReader = (listName: string, columns: MatrixColumn[]) => Promise<Record<string, unknown>[]>;

/**
 * The list one matrix question's rows are kept in.
 *
 * Characters that would break the list URL are dropped, matching how the list
 * was named when the form was published.
 */
export function matrixChildListName(formTitle: string, fieldName: string): string {
  const safeName = fieldName.replace(/[^a-zA-Z0-9_ -]/g, "").trim();
  return `${formTitle} Matrix ${safeName}`;
}

/**
 * Every matrix's rows for one submission, keyed as `<question>_childRows` and
 * ready to merge into the response data.
 *
 * A matrix whose list is missing or empty is left out rather than written as an
 * empty table: the parent column's flattened text is a poor answer, but it is
 * better than blanking one that the reader can at least puzzle out. A form that
 * never had a matrix costs nothing here.
 */
export async function loadMatrixChildRows(
  surveyJson: unknown,
  formTitle: string,
  read: MatrixChildReader,
): Promise<Record<string, unknown>> {
  const fields = getDynamicMatrixFields(surveyJson);
  if (fields.length === 0 || !formTitle) return {};

  const loaded: Record<string, unknown> = {};
  for (const field of fields) {
    try {
      const rows = await read(matrixChildListName(formTitle, field.name), field.columns);
      if (rows.length > 0) {
        loaded[`${field.name}_childRows`] = { columns: field.columns, rows };
      }
    } catch {
      // No list, or no access to it — the view keeps whatever the parent column
      // holds rather than failing to open over one table.
    }
  }
  return loaded;
}

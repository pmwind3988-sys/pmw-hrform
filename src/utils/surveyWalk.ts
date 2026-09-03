/**
 * surveyWalk.ts — visiting every question in a published survey schema.
 *
 * There were three copies of this traversal and all three disagreed. The
 * public config endpoint recursed into panels only; the signed-in form page
 * did the same; the submission viewer went into panels and repeater templates.
 * None of them went into a column layout. So a question's choices loaded or
 * did not load depending on which container an author had dropped it in, and
 * on whether the person filling the form had signed in — a Company dropdown
 * inside two columns came back empty for a public submitter and populated for
 * a colleague.
 *
 * One traversal, used by all three, is the fix. Anything that resolves choices
 * against a schema should reach the same questions.
 *
 * Containers a question can sit inside:
 *
 * - `pages[].elements` — the top level
 * - `elements` — a panel, or a page's own nesting
 * - `templateElements` — a repeater's template, one row of which is authored
 *   once and repeated
 * - `columns[].elements` — a column layout
 *
 * A dynamic matrix also has `columns`, but those are *cells* rather than
 * containers: they carry their own `choices` and have no `elements` of their
 * own. They are left to the caller, which knows whether it handles matrices at
 * all, and are skipped here precisely because they have nothing to recurse
 * into.
 *
 * Pure. `api/_utils/surveyWalk.ts` is the server-side copy of this file; api/
 * cannot import from src/. Keep the two in step.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Calls `visit` for every element in the schema, containers included.
 *
 * Containers are visited too rather than skipped: a panel carries no choice
 * source of its own, so seeing one costs a caller nothing, and deciding which
 * types are "real questions" is exactly the judgement that made these three
 * traversals diverge.
 *
 * Accepts either a bare schema or the `{ surveyJson: … }` envelope the version
 * list stores, matching how a published snapshot is read everywhere else.
 *
 * Cycles cannot occur in schemas parsed from stored JSON, so the recursion is
 * unguarded; depth is bounded by how deeply an author nested panels.
 */
export function forEachSurveyElement(
  surveyJson: unknown,
  visit: (element: Record<string, unknown>) => void,
): void {
  const root = isRecord(surveyJson) && isRecord(surveyJson.surveyJson)
    ? surveyJson.surveyJson
    : surveyJson;
  if (!isRecord(root)) return;

  const walk = (elements: unknown): void => {
    if (!Array.isArray(elements)) return;
    for (const element of elements) {
      if (!isRecord(element)) continue;
      visit(element);
      walk(element.elements);
      walk(element.templateElements);
      if (Array.isArray(element.columns)) {
        for (const column of element.columns) {
          // A column layout's columns hold elements; a matrix's columns do not.
          if (isRecord(column)) walk(column.elements);
        }
      }
    }
  };

  const pages = Array.isArray(root.pages) ? root.pages : [];
  for (const page of pages) {
    if (isRecord(page)) walk(page.elements);
  }
  // A schema with no pages at all still has questions worth reaching.
  if (pages.length === 0) walk(root.elements);
}

import { getSpColumnKind } from "./FormBuilderEngine";

/**
 * The SharePoint `FieldTypeKind` for a multi-value choice column.
 *
 * See `getSpColumnKind` for the full map (2 Text, 3 Note, 4 DateTime, 6 Choice,
 * 8 Boolean, 9 Number, 11 Image, 15 MultiChoice).
 */
const MULTI_CHOICE_KIND = 15;

/**
 * The field names a form stores in a SharePoint MultiChoice column.
 *
 * WHY THIS EXISTS. The submit path serialised every array answer with
 * `JSON.stringify`, which is right for a Text or Note column but wrong for
 * MultiChoice: that column wants a real array, and SharePoint rejects the
 * string with
 *
 *   An unexpected 'PrimitiveValue' node was found when reading from the JSON
 *   reader. A 'StartArray' node was expected.
 *
 * The POST is the whole item, so one bad column failed the entire submission —
 * meaning no form containing a checkbox group could be submitted at all. Found
 * by running the built-in test-run facility against a form that has one.
 *
 * The decision has to be per column KIND rather than "is the value an array",
 * because other array-valued answers legitimately live in text columns as JSON.
 * Asking `getSpColumnKind` — the same function the builder provisions columns
 * with — is what keeps the writer and the provisioner from disagreeing again.
 *
 * Fails closed: anything unreadable yields an empty set, so those answers keep
 * the previous JSON-string behaviour rather than being sent raw to a column
 * that may not accept it.
 */
export function getMultiChoiceFieldNames(surveyJson: unknown): Set<string> {
  const names = new Set<string>();
  try {
    const def = surveyJson as Record<string, unknown> | null | undefined;
    if (!def || typeof def !== "object") return names;
    // The builder passes the survey wrapped; the renderer passes it bare.
    const inner = (def.pages ? def : def.surveyJson) as Record<string, unknown> | undefined;
    const pages = (inner as { pages?: unknown } | undefined)?.pages;
    if (!Array.isArray(pages)) return names;

    const walk = (elements: unknown[]) => {
      for (const el of elements) {
        if (!el || typeof el !== "object") continue;
        const elem = el as Record<string, unknown>;

        if (typeof elem.name === "string" && elem.name) {
          const kind = getSpColumnKind({
            type: elem.type as string,
            inputType: elem.inputType as string | undefined,
            choices: elem.choices as string[] | undefined,
          } as Parameters<typeof getSpColumnKind>[0]);
          if (kind?.FieldTypeKind === MULTI_CHOICE_KIND) names.add(elem.name);
        }

        if (Array.isArray(elem.elements)) walk(elem.elements);
      }
    };

    for (const page of pages) {
      const elements = (page as { elements?: unknown } | null)?.elements;
      if (Array.isArray(elements)) walk(elements);
    }
  } catch {
    // Unreadable definition — see "fails closed" above.
  }
  return names;
}

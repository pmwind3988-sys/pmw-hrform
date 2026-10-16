/**
 * dedupeChoices.ts — one dropdown list from two sources, without near-duplicates.
 *
 * A picker such as the person dialog's Department field is offered two lists:
 * the names admin/org configures, and the names already typed onto people's
 * rows. Combining them naively shows the same department twice whenever the two
 * sources spell it slightly differently — most often a stray space, so
 * "Production(F1)" sits in the list beside "Production (F1)" as if they were
 * two places. This collapses those to one entry.
 */

/**
 * Case- and spacing-insensitive key for deciding two names are the same choice.
 *
 * Whitespace is removed entirely rather than merely collapsed, so a name that
 * differs only by a space — "Production (F1)" against "Production(F1)" — keys
 * the same and appears once. Punctuation is kept, so "QA/QC" stays its own
 * department rather than merging into a "QAQC".
 */
function choiceKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * The configured names first, then any used name they do not already cover.
 *
 * Offering the configured list first means its spelling is the one kept when a
 * used name differs only by spacing: the properly spaced "Production (F1)" that
 * matches its F2/F3/F4 siblings survives, and the stray "Production(F1)" someone
 * typed onto a row drops out. A used name the configured list has since dropped
 * is still kept — a person must not silently lose their department just by
 * having their row opened.
 */
export function mergeChoices(used: string[], configured: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const value of [...configured, ...used]) {
    const label = (value || "").trim();
    if (label && !byKey.has(choiceKey(label))) byKey.set(choiceKey(label), label);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

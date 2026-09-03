/**
 * choiceSearch.ts — deciding when a dropdown needs searching, and what a
 * search finds.
 *
 * Kept apart from the control that renders it so the two decisions worth
 * arguing about — how long is too long, and what counts as a match — can be
 * read and tested without a browser.
 */

/**
 * The number of options above which a dropdown becomes searchable.
 *
 * Seven is about where a list stops being one glance and starts being a scan.
 * Below it a native `<select>` is better than anything custom: it costs no
 * code, and on a phone the operating system's own picker is more usable and
 * more accessible than a hand-built listbox.
 *
 * Set here rather than higher because of what sits either side of it. Ten
 * companies and twenty-four departments are the lists people actually hunt
 * through, and a threshold of ten would have left the companies — exactly ten
 * of them — as the one org list you could not type into.
 */
export const SEARCHABLE_FROM = 7;

export function shouldSearchChoices(optionCount: number): boolean {
  return optionCount > SEARCHABLE_FROM;
}

/**
 * Reduces a string to what a search should compare.
 *
 * Case and the punctuation around words both go, so "qa/qc" finds "QA/QC" and
 * "production f1" finds "Production(F1)" — a list built from what people typed
 * into forms over several years is not punctuated consistently, and nobody
 * searching it should have to guess which way a bracket went.
 */
function searchKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * The options a query matches, in the order they were given.
 *
 * Every word of the query has to appear, in any order and anywhere in the
 * option — so "pmw lighting" finds "PMW LIGHTING SDN BHD" and "lighting pmw"
 * finds it too. Matching the whole query as one string would fail the second,
 * which is exactly what somebody does when they half-remember a name.
 *
 * An empty query matches everything: opening the list should show the list.
 */
export function filterChoices<T extends { text: string; value: string }>(
  options: T[],
  query: string,
): T[] {
  const words = searchKey(query).split(" ").filter(Boolean);
  if (words.length === 0) return options;

  const compact = (value: string): string => value.replace(/ /g, "");

  return options.filter((option) => {
    // The stored code is searched as well as the label. They are the same
    // string on a converted list, but a code that has since been renamed apart
    // from its label is still what somebody may have written down.
    const spaced = `${searchKey(option.text)} ${searchKey(option.value)}`;
    /*
      Also compared with the spacing taken out, because the punctuation a name
      carries is not the punctuation somebody types. "QA/QC" reduces to "qa qc"
      here, and a person searching it types "qaqc" — matching only the spaced
      form would find nothing at all for the most obvious query there is.
    */
    const squashed = compact(spaced);
    return words.every((word) => spaced.includes(word) || squashed.includes(compact(word)));
  });
}

/**
 * Where the highlight lands after a key press, kept inside the list.
 *
 * Clamped rather than wrapped: arrowing off the end of a long list and
 * reappearing at the top reads as a glitch, and there is no way to tell it
 * from having lost your place.
 */
export function nextActiveIndex(current: number, delta: number, count: number): number {
  if (count === 0) return -1;
  if (current < 0) return delta > 0 ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, current + delta));
}

/**
 * routingCheckedForms.ts — forms whose request emails get an automatic
 * routing check before they are sent.
 *
 * Matched by title, ignoring case and extra spaces, the same way
 * `superuserOnlyForms.ts` matches. Mirrored at `api/_utils/routingCheckedForms.ts`,
 * which is what the server paths read; a test keeps the two identical.
 */

export const ROUTING_CHECKED_FORM_TITLES: readonly string[] = ["Training Evaluation Form"];

function normalizeTitle(title: unknown): string {
  return String(title ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

const CHECKED = new Set(ROUTING_CHECKED_FORM_TITLES.map(normalizeTitle));

export function isRoutingCheckedForm(title: unknown): boolean {
  const normalized = normalizeTitle(title);
  return normalized.length > 0 && CHECKED.has(normalized);
}

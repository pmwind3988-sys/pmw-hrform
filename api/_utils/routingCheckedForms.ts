/**
 * routingCheckedForms.ts — server copy of `src/utils/routingCheckedForms.ts`.
 *
 * Keep the list identical to the browser copy; a test asserts it.
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

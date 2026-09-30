/**
 * superuserOnlyForms.ts — server copy of `src/utils/superuserOnlyForms.ts`.
 *
 * The browser hides these forms; this copy is what refuses them. `form-config`
 * will not serve one and `submit-form` will not accept one unless the caller
 * proves they are a Form Builder Superuser, or holds a test ticket a superuser
 * signed for that form. Keep the list identical to the browser's — a test
 * asserts it.
 */

export const SUPERUSER_ONLY_FORM_TITLES: readonly string[] = ["ZZ TEST RUN"];

function normalizeTitle(title: unknown): string {
  return String(title ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

const RESTRICTED = new Set(SUPERUSER_ONLY_FORM_TITLES.map(normalizeTitle));

export function isSuperuserOnlyForm(title: unknown): boolean {
  const normalized = normalizeTitle(title);
  return normalized.length > 0 && RESTRICTED.has(normalized);
}

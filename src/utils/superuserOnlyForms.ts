/**
 * superuserOnlyForms.ts — forms that exist for testing and must stay out of
 * everybody else's way.
 *
 * A form named here is visible only to Form Builder Superusers (HR Forms Owner
 * AND the `superuser` SharePoint group — the same pair `canUseFormBuilder`
 * means everywhere else). Anyone else never sees it on the dashboard, in Forms,
 * or among submissions, and cannot open its link.
 *
 * Matched by title because the title is the one name every surface carries:
 * the response list, the Master Form row and every submission all use it.
 *
 * Mirrored at `api/_utils/superuserOnlyForms.ts`, which is what actually
 * refuses a load or a submission. `superuserOnlyForms.test.ts` asserts the two
 * lists stay identical.
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

/** Drops the superuser-only forms unless the viewer is one. */
export function withoutSuperuserOnlyForms<T extends { title: string }>(lists: T[], isSuperuser: boolean): T[] {
  return isSuperuser ? lists : lists.filter((list) => !isSuperuserOnlyForm(list.title));
}

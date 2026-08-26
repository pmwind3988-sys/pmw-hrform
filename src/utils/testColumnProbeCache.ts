/**
 * testColumnProbeCache.ts — remembers which lists are known not to have the
 * lazily-provisioned `IsTest` column.
 *
 * `IsTest` only exists on a response list once someone has minted a test
 * ticket for that form, so probing for it on a list that has never been
 * rehearsed — every form on day one — 400s every time. Both the approval
 * dashboard and the response viewer run this probe on every load; without a
 * shared cache that guaranteed-failing request fires forever for any form
 * nobody has touched this feature on. A list where the column *is* present is
 * never cached here: its `IsTest` values change row to row, so those requests
 * keep happening as normal — only the failing case is worth memoising.
 */

const knownMissing = new Map<string, boolean>();

export function isTestColumnKnownMissing(listName: string): boolean {
  return knownMissing.get(listName) === true;
}

export function setTestColumnKnownMissing(listName: string, missing: boolean): void {
  knownMissing.set(listName, missing);
}

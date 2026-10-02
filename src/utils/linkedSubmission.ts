/**
 * linkedSubmission.ts — whether a public-link submission was tied to this person.
 *
 * A submission made through a public link is stored as "GUEST". After it is
 * saved the server may name the Approval Directory person it came from, in
 * `LinkedUserEmail` / `LinkedEmployeeId` (see api/_utils/publicSubmissionLink.ts).
 * This is the other half: the signed-in person recognising their own.
 *
 * The staff number matters because a person listed without an email address has
 * nothing else to be linked by, and because an address that was later corrected
 * in the directory would otherwise orphan everything linked under the old one.
 */
import { employeeIdKey } from "./directoryHarvest";

export interface LinkableSubmission {
  linkedUserEmail?: string;
  linkedEmployeeId?: string;
}

export function isLinkedToPerson(
  item: LinkableSubmission,
  email: string,
  employeeIds: ReadonlySet<string>,
): boolean {
  const mine = email.trim().toLowerCase();
  if (mine && (item.linkedUserEmail ?? "").trim().toLowerCase() === mine) return true;
  const staffNumber = employeeIdKey(item.linkedEmployeeId ?? "");
  return !!staffNumber && employeeIds.has(staffNumber);
}

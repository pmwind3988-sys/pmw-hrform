/**
 * publicSubmissionLink.ts — which person in the Approval Directory a public-link
 * submission came from.
 *
 * A public link records `SubmittedBy = "GUEST"`, so the person who filled it in
 * is lost to everyone, themselves included. This reads the form's own answers
 * (staff number, name, email) back against the directory and names the person,
 * so the submission can appear under their account once they sign in.
 *
 * Pure, and strictly after the fact: it never influences routing, mail or who
 * may act. It only answers "who is this", and answers nothing rather than guess.
 *
 * What counts as the same person:
 *  - a **staff number** that is in the directory, with a name that does not
 *    contradict it. A row with no email can only be linked this way, and then the
 *    name must be present and alike — the staff number alone is typed by hand and
 *    would put someone's submission on the wrong person's account if mistyped;
 *  - otherwise an **email** that is in the directory;
 *  - otherwise a **name** that belongs to exactly one row that has an email.
 */
import {
  employeeIdKey,
  harvestFieldValue,
  isPersonEmail,
  personNameKey,
  type SubjectFieldMapping,
} from "./directoryHarvest.js";

export interface LinkableRow {
  personEmail: string;
  personName: string;
  employeeId: string;
  isActive?: boolean;
}

export type LinkMethod = "staff-number" | "email" | "name";

export interface PublicSubmissionLink<T extends LinkableRow> {
  row: T;
  method: LinkMethod;
}

const TITLES = new Set([
  "mr", "mrs", "ms", "miss", "dr", "prof", "ir", "hj", "hjh", "haji", "hajjah",
  "encik", "en", "cik", "puan", "pn", "tuan", "datuk", "dato", "datin", "dtk", "tansri",
]);

/** A name as its words, without titles, accents, punctuation or a bracketed nickname. */
function nameWords(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b[asd]\s*\/\s*[lpo]\b/g, " bin ")
    .replace(/[^a-z]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 0 && !TITLES.has(word));
}

/**
 * Whether two spellings of a name can be one person: the same own name, or one
 * written out in full and the other shortened ("Siti Aminah" and "Siti Aminah
 * binti Abdul Rahman"). Every word of the shorter must appear in the longer;
 * order and extra words do not matter, a missing or different word does.
 */
export function namesAlike(a: string, b: string): boolean {
  const keyA = personNameKey(a);
  if (keyA && keyA === personNameKey(b)) return true;

  const wordsA = nameWords(a);
  const wordsB = nameWords(b);
  if (wordsA.length === 0 || wordsB.length === 0) return false;
  const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
  return shorter.every((word) => longer.includes(word));
}

/** Names that are both present and plainly not the same person. */
function namesContradict(submitted: string, listed: string): boolean {
  return !!submitted.trim() && !!listed.trim() && !namesAlike(submitted, listed);
}

export function matchPublicSubmissionToPerson<T extends LinkableRow>(
  rows: T[],
  data: Record<string, unknown>,
  mapping: SubjectFieldMapping,
): PublicSubmissionLink<T> | undefined {
  const submittedName = harvestFieldValue(data, mapping.nameField);
  const staffNumber = employeeIdKey(harvestFieldValue(data, mapping.employeeIdField));
  const submittedEmail = harvestFieldValue(data, mapping.emailField);
  const email = isPersonEmail(submittedEmail) ? submittedEmail.trim().toLowerCase() : "";

  const active = rows.filter((row) => row.isActive !== false);

  if (staffNumber) {
    const sameNumber = active.filter((row) => employeeIdKey(row.employeeId) === staffNumber);
    const confirmed = sameNumber.filter((row) =>
      row.personEmail.trim()
        // A listed staff number is trusted outright, whatever name came with it.
        ? true
        // No email to fall back on: both names must be there, and alike.
        : !!submittedName.trim() && !!row.personName.trim() && namesAlike(submittedName, row.personName));
    if (confirmed.length === 1) return { row: confirmed[0], method: "staff-number" };
    // The number is in the directory but we cannot say whose it is. Falling
    // through to a name or email would second-guess a number that did match.
    if (sameNumber.length > 0) return undefined;
  }

  if (email) {
    const byEmail = active.filter((row) => row.personEmail.trim().toLowerCase() === email);
    if (byEmail.length === 1 && !namesContradict(submittedName, byEmail[0].personName)) {
      return { row: byEmail[0], method: "email" };
    }
  }

  const nameKey = personNameKey(submittedName);
  if (nameKey) {
    const byName = active.filter((row) =>
      !!row.personEmail.trim()
      && personNameKey(row.personName) === nameKey
      // A staff number that matched nobody, beside a row carrying a different
      // one, means two people sharing a name.
      && !(staffNumber && row.employeeId.trim() && employeeIdKey(row.employeeId) !== staffNumber));
    if (byName.length === 1) return { row: byName[0], method: "name" };
  }

  return undefined;
}

/** The columns a link is stored in, on the response row. */
export const LINK_COLUMNS = {
  email: "LinkedUserEmail",
  employeeId: "LinkedEmployeeId",
  method: "LinkedMatch",
} as const;

export function linkFieldsFor(link: PublicSubmissionLink<LinkableRow>): Record<string, string> {
  return {
    [LINK_COLUMNS.email]: link.row.personEmail.trim().toLowerCase(),
    [LINK_COLUMNS.employeeId]: link.row.employeeId.trim(),
    [LINK_COLUMNS.method]: link.method,
  };
}

/** Submissions recorded for nobody in particular — the only ones worth linking. */
export function isPublicSubmitter(submittedBy: unknown): boolean {
  return typeof submittedBy === "string" && submittedBy.trim().toLowerCase() === "guest";
}

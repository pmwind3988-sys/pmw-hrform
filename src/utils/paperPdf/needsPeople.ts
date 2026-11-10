/**
 * needsPeople.ts — Several people on one row of the Training Needs Analysis.
 *
 * A row is one training. Everyone it is for is written on a line of their own,
 * the Emp. ID beside the Name, and stored in the table's existing Emp. ID and
 * Name columns as the lines joined by a line break — line 2 of one is line 2 of
 * the other. No new column, so a form published before this needs nothing.
 *
 * Those columns are SharePoint single-line text (255 characters), so a row with
 * more people than fit is saved as two rows of the same training (`chunkPeople`).
 * Pure.
 */

export interface NeedsPerson {
  id: string;
  name: string;
}

/** What SharePoint's single-line text column holds. */
export const PEOPLE_TEXT_LIMIT = 255;

const linesOf = (value: unknown): string[] => (value === undefined || value === null ? [] : String(value).split(/\r?\n/));

/** Text with its line breaks flattened to spaces: the Training Needs box takes one training. */
export function singleLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, " ");
}

/** A row's people as typed, blank lines included; always at least one line to write on. */
export function readPeople(idValue: unknown, nameValue: unknown): NeedsPerson[] {
  const ids = linesOf(idValue);
  const names = linesOf(nameValue);
  const count = Math.max(ids.length, names.length, 1);
  return Array.from({ length: count }, (_, i) => ({ id: ids[i] ?? "", name: names[i] ?? "" }));
}

/** The two stored values for a row's people, line for line. */
export function joinPeople(people: NeedsPerson[]): NeedsPerson {
  if (people.every((p) => p.id.trim() === "" && p.name.trim() === "")) return { id: "", name: "" };
  return { id: people.map((p) => p.id).join("\n"), name: people.map((p) => p.name).join("\n") };
}

/** The people worth keeping: trimmed, lines nobody wrote on dropped. */
export function tidyPeople(people: NeedsPerson[]): NeedsPerson[] {
  return people.map((p) => ({ id: p.id.trim(), name: p.name.trim() })).filter((p) => p.id !== "" || p.name !== "");
}

/**
 * What is wrong with a row's people, in the HOD's words; "" when nothing is.
 * Only a row of several people is checked: with one person per line, an ID
 * with no name beside it can no longer be matched to anybody.
 */
export function peopleProblem(people: NeedsPerson[]): string {
  const kept = tidyPeople(people);
  if (kept.length < 2) return "";
  const line = people.findIndex((p) => (p.id.trim() === "") !== (p.name.trim() === ""));
  if (line < 0) return "";
  return people[line].name.trim() === "" ? `Line ${line + 1} has an Emp. ID but no name.` : `Line ${line + 1} has a name but no Emp. ID.`;
}

/** The people split so each group's IDs and names fit their SharePoint columns. */
export function chunkPeople(people: NeedsPerson[], limit: number = PEOPLE_TEXT_LIMIT): NeedsPerson[][] {
  const chunks: NeedsPerson[][] = [];
  let current: NeedsPerson[] = [];
  let ids = 0;
  let names = 0;
  for (const person of people) {
    // Each line after the first costs one more character: the line break.
    const nextIds = ids + person.id.length + (current.length > 0 ? 1 : 0);
    const nextNames = names + person.name.length + (current.length > 0 ? 1 : 0);
    if (current.length > 0 && (nextIds > limit || nextNames > limit)) {
      chunks.push(current);
      current = [person];
      ids = person.id.length;
      names = person.name.length;
    } else {
      current.push(person);
      ids = nextIds;
      names = nextNames;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

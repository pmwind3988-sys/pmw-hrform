import {
  createListItem,
  queryAllListItems,
  type GraphListItem,
} from "./graphClient.js";
import { ensureListViaSPRest, ensureTextFieldViaSPRest } from "./sharepointRest.js";
import { logWarn } from "./logger.js";
import { withCause } from "./errorCause.js";

/**
 * The named record of which guest member opened which learning material, and
 * when.
 *
 * Deliberately a second, separate list from the anonymous view counter in
 * `learningLibrary.ts`, and deliberately narrower. Staff signing in with
 * Microsoft 365 are never written here: their views stay behind the one-way hash
 * that only ever answers "how many distinct people", which is all the product
 * asks of them. A guest member is a different bargain — an HR Forms Owner
 * approves them for the hub specifically so that material given to somebody
 * outside the company can be seen to have been received. Logging one population
 * by name and not the other is the whole point; folding the two lists into one
 * would quietly extend named tracking to every employee.
 *
 * Because a guest member signs themselves up rather than being handed an account
 * across a desk, the notice that this log exists has to be given by the product
 * — at the point learning access is granted, and on their profile — rather
 * than spoken at hand-over. See `PDPA_COMPLIANCE.md`.
 *
 * Append-only. Nothing in this module updates or deletes a row: an audit trail
 * that can be edited from the screen that displays it is not evidence of
 * anything.
 */
export const LEARNING_ACCESS_LOG_LIST = "Learning Access Log";

/** Title holds the member's Google address, the column HR filters on. */
const COLUMN_VIEWER_NAME = "ViewerName";
const COLUMN_VIEWER_POSITION = "ViewerPosition";
const COLUMN_VIEWER_DEPARTMENT = "ViewerDepartment";
const COLUMN_MATERIAL_ID = "MaterialId";
const COLUMN_MATERIAL_NAME = "MaterialName";
const COLUMN_VIEWED_AT = "ViewedAt";

const LOG_COLUMNS = [
  COLUMN_VIEWER_NAME,
  COLUMN_VIEWER_POSITION,
  COLUMN_VIEWER_DEPARTMENT,
  COLUMN_MATERIAL_ID,
  COLUMN_MATERIAL_NAME,
  COLUMN_VIEWED_AT,
] as const;

/**
 * How many rows the admin screen reads.
 *
 * A hard ceiling on a single request, and now a real one rather than a
 * theoretical one: the population this log covers used to be a few dozen
 * hand-issued accounts, and is now every guest member HR approves. The trail is
 * append-only and never shrinks, so how long rows should be kept is a
 * records-keeping decision still to be made.
 */
const MAX_LOG_ROWS = 5000;

/** SharePoint text columns hold 255 characters; a long file name is trimmed. */
const MAX_TEXT = 255;

export interface AccessLogEntry {
  /** The member's Google address. */
  email: string;
  viewerName: string;
  viewerPosition: string;
  viewerDepartment: string;
  materialId: string;
  materialName: string;
  viewedAt: string;
}

function clip(value: string): string {
  return value.length > MAX_TEXT ? value.slice(0, MAX_TEXT) : value;
}

/** Delegated throughout — the app-only principal may create neither the list nor its columns. */
export async function ensureLearningAccessLogSchema(delegatedToken: string): Promise<void> {
  await ensureListViaSPRest(delegatedToken, LEARNING_ACCESS_LOG_LIST);
  for (const column of LOG_COLUMNS) {
    await ensureTextFieldViaSPRest(delegatedToken, LEARNING_ACCESS_LOG_LIST, column, column);
  }
}

/**
 * Writes one line of the trail.
 *
 * Best effort, and silent on failure by design: this is called on the path that
 * records a view, and a log that cannot be written must never be the reason
 * somebody's video stops working. A missing row is a gap in a report; a thrown
 * error here would be a learner staring at an error dialog over a file that
 * played perfectly.
 *
 * `materialName` is stored alongside the id rather than looked up on read,
 * because the point of the log outlives the file: HR needs "Ali opened Fire
 * Safety Briefing on 3 March" to still say that after the material has been
 * renamed or deleted.
 *
 * The viewer's name, position and department are stored for the same reason,
 * and for a sharper one. A guest member may edit their own profile. If the log
 * showed their *current* details it would be rewritable from the profile page —
 * change your job title and the record of what you opened last year changes with
 * it. Stamping the values into each row is what stops the trail being edited by
 * the person it is about.
 */
export async function recordAccessLogEntry(
  graphToken: string,
  entry: {
    email: string;
    viewerName: string;
    viewerPosition: string;
    viewerDepartment: string;
    materialId: string;
    materialName: string;
  },
): Promise<void> {
  const fields = {
    Title: clip(entry.email),
    [COLUMN_VIEWER_NAME]: clip(entry.viewerName),
    [COLUMN_VIEWER_POSITION]: clip(entry.viewerPosition),
    [COLUMN_VIEWER_DEPARTMENT]: clip(entry.viewerDepartment),
    [COLUMN_MATERIAL_ID]: clip(entry.materialId),
    [COLUMN_MATERIAL_NAME]: clip(entry.materialName),
    [COLUMN_VIEWED_AT]: new Date().toISOString(),
  };

  try {
    await createListItem(graphToken, LEARNING_ACCESS_LOG_LIST, fields);
  } catch (error) {
    // No self-healing here, unlike the view counter: creating the list needs an
    // admin's delegated token and this runs on the learner's request, which never
    // carries one. A failure means either a transient Graph hiccup or a list that
    // was never provisioned, and the second one is fixed by an admin pressing
    // "Set up" on the Guest Members screen — not by anything this path can do.
    logWarn("api:learning", "Could not record a guest access log entry", {
      list: LEARNING_ACCESS_LOG_LIST,
      email: entry.email,
      materialId: entry.materialId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

function toEntry(item: GraphListItem): AccessLogEntry {
  const fields = item.fields || {};
  return {
    email: String(fields.Title || ""),
    viewerName: String(fields[COLUMN_VIEWER_NAME] || ""),
    viewerPosition: String(fields[COLUMN_VIEWER_POSITION] || ""),
    viewerDepartment: String(fields[COLUMN_VIEWER_DEPARTMENT] || ""),
    materialId: String(fields[COLUMN_MATERIAL_ID] || ""),
    materialName: String(fields[COLUMN_MATERIAL_NAME] || ""),
    viewedAt: String(fields[COLUMN_VIEWED_AT] || ""),
  };
}

/**
 * Newest first.
 *
 * Sorted here rather than in the Graph query because the column is text — the
 * one column type this tenant lets the app create — and an ISO-8601 timestamp
 * sorts identically as text and as a date, which is exactly why it is stored in
 * that shape. Rows with no timestamp sink to the bottom instead of claiming the
 * top of a report through an empty string comparing lowest.
 */
export function sortAccessLogEntries(entries: AccessLogEntry[]): AccessLogEntry[] {
  return [...entries].sort((a, b) => {
    if (!a.viewedAt) return 1;
    if (!b.viewedAt) return -1;
    return b.viewedAt.localeCompare(a.viewedAt);
  });
}

/**
 * The whole trail, newest first.
 *
 * A list that was never provisioned reads as an empty trail, because that is
 * what it is. Any *other* failure is raised, and deliberately so: this used to
 * answer `[]` for both, so a log that could not be read was indistinguishable
 * from a log with nothing in it — and the screen would calmly report that nobody
 * had opened anything, which is the single most misleading thing an audit trail
 * can say.
 */
export async function readAccessLog(graphToken: string): Promise<AccessLogEntry[]> {
  let items: GraphListItem[];
  try {
    items = await queryAllListItems(graphToken, LEARNING_ACCESS_LOG_LIST, { maxItems: MAX_LOG_ROWS });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logWarn("api:learning", "Could not read the guest access log", { errorMessage: message });
    if (message.includes(`List "${LEARNING_ACCESS_LOG_LIST}" not found`)) return [];
    throw withCause(
      new Error("The access log could not be read from SharePoint. Try again, or run Set up."),
      error,
    );
  }

  return sortAccessLogEntries(items.map(toEntry).filter((entry) => entry.email && entry.materialId));
}

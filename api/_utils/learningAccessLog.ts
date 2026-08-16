import {
  createListItem,
  queryAllListItems,
  type GraphListItem,
} from "./graphClient.js";
import { ensureListViaSPRest, ensureTextFieldViaSPRest } from "./sharepointRest.js";
import { logWarn } from "./logger.js";

/**
 * The named record of which HR-issued portal account opened which learning
 * material, and when.
 *
 * Deliberately a second, separate list from the anonymous view counter in
 * `learningLibrary.ts`, and deliberately narrower. Staff signing in with
 * Microsoft 365 are never written here: their views stay behind the one-way hash
 * that only ever answers "how many distinct people", which is all the product
 * asks of them. A portal account is a different bargain — HR issues it to
 * somebody outside the company specifically so they can be given material and
 * be seen to have received it, and the person is told so when it is handed over.
 * Logging one population by name and not the other is the whole point; folding
 * the two lists into one would quietly extend named tracking to every employee.
 *
 * Append-only. Nothing in this module updates or deletes a row: an audit trail
 * that can be edited from the screen that displays it is not evidence of
 * anything.
 */
export const LEARNING_ACCESS_LOG_LIST = "Learning Access Log";

/** Title holds the login ID, so SharePoint indexes the column HR filters on. */
const COLUMN_VIEWER_NAME = "ViewerName";
const COLUMN_MATERIAL_ID = "MaterialId";
const COLUMN_MATERIAL_NAME = "MaterialName";
const COLUMN_VIEWED_AT = "ViewedAt";

const LOG_COLUMNS = [
  COLUMN_VIEWER_NAME,
  COLUMN_MATERIAL_ID,
  COLUMN_MATERIAL_NAME,
  COLUMN_VIEWED_AT,
] as const;

/**
 * How many rows the admin screen reads. Well past what this population can
 * generate — a few dozen accounts opening a few dozen materials — and a hard
 * ceiling on how much a single request can ever pull back.
 */
const MAX_LOG_ROWS = 5000;

/** SharePoint text columns hold 255 characters; a long file name is trimmed. */
const MAX_TEXT = 255;

export interface AccessLogEntry {
  loginId: string;
  viewerName: string;
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
 */
export async function recordAccessLogEntry(
  graphToken: string,
  entry: { loginId: string; viewerName: string; materialId: string; materialName: string },
): Promise<void> {
  const fields = {
    Title: clip(entry.loginId),
    [COLUMN_VIEWER_NAME]: clip(entry.viewerName),
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
    // "Set up" on the Portal Accounts screen — not by anything this path can do.
    logWarn("api:learning", "Could not record a portal access log entry", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

function toEntry(item: GraphListItem): AccessLogEntry {
  const fields = item.fields || {};
  return {
    loginId: String(fields.Title || ""),
    viewerName: String(fields[COLUMN_VIEWER_NAME] || ""),
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

/** The whole trail, newest first. */
export async function readAccessLog(graphToken: string): Promise<AccessLogEntry[]> {
  let items: GraphListItem[];
  try {
    items = await queryAllListItems(graphToken, LEARNING_ACCESS_LOG_LIST, { maxItems: MAX_LOG_ROWS });
  } catch (error) {
    // An empty trail and an unprovisioned list look the same to the screen, and
    // both are honest: nothing has been logged yet.
    logWarn("api:learning", "Could not read the portal access log", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  return sortAccessLogEntries(items.map(toEntry).filter((entry) => entry.loginId && entry.materialId));
}

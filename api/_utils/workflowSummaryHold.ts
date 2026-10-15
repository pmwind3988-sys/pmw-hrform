/**
 * workflowSummaryHold.ts — should this email wait for tomorrow's summary?
 *
 * A notice normally leaves the moment a step is reached. But if the same person
 * already has a scheduled email due at the next morning run — which is about to
 * become a summary — sending this one alone today just adds to the pile the
 * summary exists to replace. So it is held until that run instead, and goes out
 * inside the summary with the others.
 *
 * Held only when there genuinely is a companion: a person with nothing else due
 * still gets their email straight away, exactly as before.
 *
 * Every form keeps its own response list, so finding a companion means reading
 * each list's schedule column. The read is narrowed to the four columns it needs
 * and capped at `HOLD_CHECK_BUDGET_MS`: past that the email is sent at once,
 * because a slow check must never be the reason a reviewer is not told.
 */
import { queryAllListItems } from "./graphClient.js";
import { isSuperuserOnlyForm } from "./superuserOnlyForms.js";
import { isTestRow } from "./testRun.js";
import {
  WORKFLOW_EMAIL_MAX_ATTEMPTS,
  parseWorkflowEmailSchedule,
  type WorkflowEmailScheduleEntry,
} from "./workflowEmail.js";
import { digestRecipientKey, isSignedInReviewLink } from "./workflowDigest.js";

/** Longest the submit or approve request waits on the check before sending anyway. */
export const HOLD_CHECK_BUDGET_MS = 4_000;
const READ_CONCURRENCY = 6;
const MAX_FORMS = 80;
const MAX_ROWS_PER_LIST = 5000;

/**
 * When the daily run next fires. It is scheduled at 00:00 UTC (08:00 in
 * Malaysia) in `vercel.json`; keep the two in step.
 */
export function nextDigestRunAt(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

export interface HoldExclusion {
  listTitle: string;
  responseItemId: string;
  layer: number;
}

/**
 * Whether one schedule entry will go out at the next run to the same person,
 * which is what makes a summary of it and the email being decided on.
 */
export function isSummaryCompanion(
  entry: WorkflowEmailScheduleEntry,
  fields: Record<string, unknown>,
  recipientKey: string,
  runAt: Date,
  self: { sameRow: boolean },
): boolean {
  if (!recipientKey) return false;
  if (self.sameRow) return false;
  if (entry.status === "sent") return false;
  if ((entry.attempts ?? 0) >= WORKFLOW_EMAIL_MAX_ATTEMPTS) return false;
  if (!isSignedInReviewLink(entry.reviewLink)) return false;
  if (isTestRow(fields)) return false;
  const currentLayer = Number(fields.CurrentLayer || fields.CurrentApprovalLayer || 0);
  if (currentLayer && currentLayer !== entry.layer) return false;
  const due = Date.parse(entry.dueAt);
  if (!Number.isFinite(due) || due > runAt.getTime()) return false;
  return digestRecipientKey(entry.recipient) === recipientKey;
}

async function findCompanion(
  token: string,
  recipientKey: string,
  exclude: HoldExclusion,
  runAt: Date,
  cancelled: () => boolean,
): Promise<boolean> {
  const registry = await queryAllListItems(token, "Master Form", { maxItems: MAX_FORMS, fields: ["Title"] });
  const titles = Array.from(new Set(registry
    .map((form) => String(form.fields?.Title ?? "").trim())
    .filter((title) => title && !isSuperuserOnlyForm(title))));
  // The submission's own form first: a class of trainees is usually one form.
  titles.sort((a, b) => Number(b === exclude.listTitle) - Number(a === exclude.listTitle));

  let found = false;
  let next = 0;
  const workers = Array.from({ length: Math.min(READ_CONCURRENCY, titles.length) }, async () => {
    while (!found && !cancelled() && next < titles.length) {
      const title = titles[next++];
      let rows;
      try {
        rows = await queryAllListItems(token, title, {
          maxItems: MAX_ROWS_PER_LIST,
          fields: ["WorkflowEmailSchedule", "CurrentLayer", "CurrentApprovalLayer", "IsTest"],
        });
      } catch {
        continue;
      }
      for (const row of rows) {
        const fields = row.fields || {};
        if (!fields.WorkflowEmailSchedule) continue;
        for (const entry of Object.values(parseWorkflowEmailSchedule(fields.WorkflowEmailSchedule))) {
          const sameRow = title === exclude.listTitle && String(row.id) === exclude.responseItemId;
          if (isSummaryCompanion(entry, fields, recipientKey, runAt, { sameRow })) {
            found = true;
            return;
          }
        }
      }
    }
  });
  await Promise.all(workers);
  return found;
}

/**
 * The time to hold this email until, or null to send it now.
 */
export async function summaryHoldUntil(
  token: string,
  recipient: string,
  exclude: HoldExclusion,
  now = new Date(),
): Promise<string | null> {
  const recipientKey = digestRecipientKey(recipient);
  if (!recipientKey) return null;
  const runAt = nextDigestRunAt(now);

  let timedOut = false;
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<boolean>((resolve) => {
    handle = setTimeout(() => { timedOut = true; resolve(false); }, HOLD_CHECK_BUDGET_MS);
  });
  try {
    const found = await Promise.race([
      findCompanion(token, recipientKey, exclude, runAt, () => timedOut),
      timer,
    ]);
    return found ? runAt.toISOString() : null;
  } finally {
    clearTimeout(handle);
  }
}

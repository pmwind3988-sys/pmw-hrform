import { setCorsHeaders, validateApiKey } from "./_utils/auth.js";
import { resolveApplicantName } from "./_utils/applicantName.js";
import {
  getGraphToken,
  queryAllListItems,
  queryListItemById,
  updateListItemFields,
} from "./_utils/graphClient.js";
import { isFormBuilderSuperuser } from "./_utils/hrFormsOwner.js";
import { sharePointTokenFrom } from "./_utils/testRunReviewer.js";
import { logError, logWarn } from "./_utils/logger.js";
import {
  buildWorkflowActionEmail,
  deliverWorkflowEmail,
  getApplicationBaseUrl,
  getDueWorkflowEmailSchedules,
  parseWorkflowEmailSchedule,
  persistWorkflowEmailAttempt,
  sendGraphEmail,
  setWorkflowEmailSchedule,
  type WorkflowEmailScheduleEntry,
} from "./_utils/workflowEmail.js";
import {
  buildWorkflowDigestEmail,
  groupDigestCandidates,
  isSignedInReviewLink,
  type DigestCandidate,
} from "./_utils/workflowDigest.js";
import { REFERENCE_NO_FIELD } from "./_utils/referenceNumber.js";
import { parseValidEmailList } from "./_utils/layerRecipients.js";
import { createApprovalDirectoryReader } from "./_utils/approvalDirectory.js";
import { standInEmailNote } from "./_utils/resolveAssignee.js";
import { isTestRow, readTestRunRedirect, withTestRunStandInFor } from "./_utils/testRun.js";
import { withWorkflowRoutePrefix } from "./_utils/workflowLink.js";

/**
 * How long one run may spend scanning before it stops and says so.
 *
 * A run killed by the platform timeout mid-scan leaves no record of how far it
 * got, so the same forms are scanned first every day and the ones behind them
 * are never reached at all. Stopping deliberately, with a count of what is
 * left, at least makes that visible. Kept under the function's maxDuration.
 */
const SCAN_BUDGET_MS = 40_000;

/**
 * When the run stops sending bundled summaries. The scan above defers them to
 * after it finishes, so they get what is left of the function's 60 seconds.
 * Anything not reached is still "scheduled" — nothing was claimed — and goes
 * out on tomorrow's run.
 */
const DELIVERY_BUDGET_MS = 55_000;

function scheduledRecipients(recipient: string): string | string[] {
  const parsed = parseValidEmailList(recipient);
  if (parsed.length === 0) return recipient;
  return parsed.length === 1 ? parsed[0] : parsed;
}

interface ApiRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

function isAuthorized(req: ApiRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization;
  const authValue = Array.isArray(authorization) ? authorization[0] : authorization;
  if (cronSecret && authValue === `Bearer ${cronSecret}`) return true;
  return validateApiKey(req.headers).valid;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
  if (req.method === "POST" && isRecord(req.body) && req.body.action === "send-selected") {
    return handleSendSelected(req, res);
  }

  const startedAt = Date.now();
  try {
    const token = await getGraphToken();
    // Paged, not `queryListItems(..., { top: 500 })`: that reads one page, so a
    // response list past its first 500 rows had its scheduled notifications
    // silently skipped forever.
    const forms = await queryAllListItems(token, "Master Form");
    let sent = 0;
    let failed = 0;
    let examined = 0;
    let remainingForms = 0;
    const digestCandidates: (DigestCandidate & { fields: Record<string, unknown> })[] = [];

    for (const [index, form] of forms.entries()) {
      if (Date.now() - startedAt > SCAN_BUDGET_MS) {
        remainingForms = forms.length - index;
        break;
      }
      const formTitle = typeof form.fields.Title === "string" ? form.fields.Title.trim() : "";
      if (!formTitle) continue;
      let items;
      try {
        items = await queryAllListItems(token, formTitle);
      } catch {
        continue;
      }

      for (const item of items) {
        if (Date.now() - startedAt > SCAN_BUDGET_MS) {
          remainingForms = forms.length - index;
          break;
        }
        const dueEntries = getDueWorkflowEmailSchedules(item.fields.WorkflowEmailSchedule);
        for (const entry of dueEntries) {
          examined++;
          const currentLayer = Number(item.fields.CurrentLayer || item.fields.CurrentApprovalLayer || 0);
          if (currentLayer && currentLayer !== entry.layer) continue;

          const testRun = readTestRunRedirect(item.fields);
          if (isTestRow(item.fields) && !testRun) {
            // The row was flagged for a rehearsal, but by delivery time —
            // possibly months after the ticket that started it expired — its
            // redirect address is gone or corrupt. The alternative, falling
            // back to `entry.recipient`, would silently mail a real approver
            // from a run the builder believes is a rehearsal. Marked "failed"
            // (not left "scheduled") so the existing attempts cap eventually
            // stops retrying it, the same as any other delivery that cannot
            // succeed.
            failed++;
            logWarn("api:workflow-email-cron", "Test run has no usable redirect address; refusing to deliver rather than mailing a real approver", {
              formTitle,
              itemId: item.id,
              layer: entry.layer,
            });
            const skippedSchedule = setWorkflowEmailSchedule(
              parseWorkflowEmailSchedule(item.fields.WorkflowEmailSchedule),
              {
                ...entry,
                status: "failed",
                updatedAt: new Date().toISOString(),
                attempts: (entry.attempts ?? 0) + 1,
              },
            );
            await updateListItemFields(token, formTitle, item.id, {
              WorkflowEmailSchedule: JSON.stringify(skippedSchedule),
            });
            continue;
          }

          // A signed-in step for a real reviewer waits until the scan is done,
          // so several due for one person can go out as one summary.
          if (!testRun && isSignedInReviewLink(entry.reviewLink)) {
            digestCandidates.push({
              formTitle,
              itemId: String(item.id),
              entry,
              referenceNo: String(item.fields[REFERENCE_NO_FIELD] || ""),
              applicantName: resolveApplicantName(item.fields),
              fields: item.fields,
            });
            continue;
          }

          if (await claimAndDeliver(token, formTitle, item, entry, testRun)) sent++;
          else failed++;
        }
      }
    }

    let digests = 0;
    let deferred = 0;
    for (const group of groupDigestCandidates(digestCandidates)) {
      if (Date.now() - startedAt > DELIVERY_BUDGET_MS) {
        deferred += group.length;
        continue;
      }
      if (group.length === 1) {
        const [only] = group;
        if (await claimAndDeliver(token, only.formTitle, { id: only.itemId, fields: only.fields }, only.entry, undefined)) sent++;
        else failed++;
        continue;
      }
      if (await claimAndDeliverDigest(token, group)) {
        digests++;
        sent += group.length;
      } else {
        failed += group.length;
      }
    }

    return res.status(200).json({ ok: true, examined, sent, failed, digests, deferred, remainingForms });
  } catch (error) {
    logError("api:workflow-email-cron", "Scheduled workflow email run failed", error);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

type ScheduledItem = { id: string; fields: Record<string, unknown> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Most items one "send selected now" may cover — a page of the schedule, not the whole list. */
const MAX_SELECTED = 50;

/**
 * "Send selected now" from the email schedule on All Submissions.
 *
 * The admin picks individual scheduled or held emails and sends them without
 * waiting for the morning run. They are grouped exactly as the run would group
 * them: several signed-in steps for one person become one summary, anything
 * else goes as its own email. Restricted to Form Builder superusers, proved by
 * their SharePoint token, the same gate as All Submissions itself.
 */
async function handleSendSelected(req: ApiRequest, res: ApiResponse) {
  const spToken = sharePointTokenFrom(req.headers);
  if (!spToken || !(await isFormBuilderSuperuser(spToken).catch(() => false))) {
    return res.status(403).json({ error: "Only Form Builder superusers can send scheduled emails." });
  }
  const body = req.body as Record<string, unknown>;
  const requested = Array.isArray(body.items) ? body.items.filter(isRecord) : [];
  const items = requested
    .map((item) => ({
      formTitle: typeof item.formTitle === "string" ? item.formTitle.trim() : "",
      itemId: /^\d+$/.test(String(item.itemId ?? "")) ? String(item.itemId) : "",
      layer: Number(item.layer),
    }))
    .filter((item) => item.formTitle && item.itemId && Number.isInteger(item.layer) && item.layer > 0);
  if (items.length === 0) return res.status(400).json({ error: "Choose at least one scheduled email." });
  if (items.length > MAX_SELECTED) return res.status(400).json({ error: `Send at most ${MAX_SELECTED} at a time.` });

  try {
    const token = await getGraphToken();
    const candidates: (DigestCandidate & { fields: Record<string, unknown> })[] = [];
    const singles: { formTitle: string; item: ScheduledItem; entry: WorkflowEmailScheduleEntry; testRun: ReturnType<typeof readTestRunRedirect> }[] = [];
    const skipped: string[] = [];

    for (const wanted of items) {
      const row = await queryListItemById(token, wanted.formTitle, wanted.itemId).catch(() => null);
      const fields = row?.fields || {};
      const entry = parseWorkflowEmailSchedule(fields.WorkflowEmailSchedule)[String(wanted.layer)];
      const currentLayer = Number(fields.CurrentLayer || fields.CurrentApprovalLayer || 0);
      const label = `${wanted.formTitle} #${wanted.itemId}`;
      if (!row || !entry) { skipped.push(`${label}: no scheduled email`); continue; }
      if (entry.status === "sent") { skipped.push(`${label}: already sent`); continue; }
      if (currentLayer && currentLayer !== entry.layer) { skipped.push(`${label}: no longer at that step`); continue; }
      const testRun = readTestRunRedirect(fields);
      if (isTestRow(fields) && !testRun) { skipped.push(`${label}: test run with no tester address`); continue; }
      if (!testRun && isSignedInReviewLink(entry.reviewLink)) {
        candidates.push({
          formTitle: wanted.formTitle,
          itemId: wanted.itemId,
          entry,
          referenceNo: String(fields[REFERENCE_NO_FIELD] || ""),
          applicantName: resolveApplicantName(fields),
          fields,
        });
      } else {
        singles.push({ formTitle: wanted.formTitle, item: { id: wanted.itemId, fields }, entry, testRun });
      }
    }

    let sent = 0;
    let failed = 0;
    let summaries = 0;
    for (const single of singles) {
      if (await claimAndDeliver(token, single.formTitle, single.item, single.entry, single.testRun)) sent++;
      else failed++;
    }
    for (const group of groupDigestCandidates(candidates)) {
      if (group.length === 1) {
        const [only] = group;
        if (await claimAndDeliver(token, only.formTitle, { id: only.itemId, fields: only.fields }, only.entry, undefined)) sent++;
        else failed++;
      } else if (await claimAndDeliverDigest(token, group)) {
        summaries++;
        sent += group.length;
      } else {
        failed += group.length;
      }
    }
    return res.status(200).json({ ok: true, sent, failed, summaries, skipped });
  } catch (error) {
    logError("api:workflow-email-cron", "Send selected scheduled emails failed", error);
    return res.status(500).json({ error: "Could not send the selected emails. Please try again." });
  }
}

/** Marks the entry "sending" before anything leaves, counting the attempt. */
async function claimEntry(token: string, formTitle: string, item: ScheduledItem, entry: WorkflowEmailScheduleEntry) {
  const schedule = setWorkflowEmailSchedule(
    parseWorkflowEmailSchedule(item.fields.WorkflowEmailSchedule),
    {
      ...entry,
      status: "sending",
      updatedAt: new Date().toISOString(),
      // Counted at claim time so a row that keeps failing eventually
      // stops being retried, even if the run never gets to record why.
      attempts: (entry.attempts ?? 0) + 1,
    },
  );
  await updateListItemFields(token, formTitle, item.id, {
    WorkflowEmailSchedule: JSON.stringify(schedule),
  });
}

/** One submission's own email, as every scheduled email used to be sent. */
async function claimAndDeliver(
  token: string,
  formTitle: string,
  item: ScheduledItem,
  entry: WorkflowEmailScheduleEntry,
  testRun: ReturnType<typeof readTestRunRedirect>,
): Promise<boolean> {
  await claimEntry(token, formTitle, item, entry);
  try {
    // Says who on the email is standing in for the step's own person.
    const standInNote = await standInEmailNote(
      withTestRunStandInFor(createApprovalDirectoryReader(token), item.fields),
      item.fields[`L${entry.layer}_Email`],
      parseValidEmailList(entry.recipient),
      entry.layerType,
    ).catch(() => undefined);
    await deliverWorkflowEmail(
      token,
      buildWorkflowActionEmail({
        formTitle,
        submittedBy: entry.submittedBy,
        responseItemId: item.id,
        layer: entry.layer,
        totalLayers: entry.totalLayers,
        // A fan-out layer stores its whole delivery list in one string;
        // split it back out so Graph gets separate recipients.
        recipient: scheduledRecipients(entry.recipient),
        layerType: entry.layerType,
        // The stored string is posted as it stands, so a link written
        // before approval and evaluation prefixes were split still says
        // `/eval/...` whatever its layer is. Correct it on the way out:
        // the reviewer page refuses a link whose prefix disagrees with
        // the step it opens.
        reviewLink: entry.reviewLink ? withWorkflowRoutePrefix(entry.reviewLink, entry.layerType) : entry.reviewLink,
        referenceNo: String(item.fields[REFERENCE_NO_FIELD] || ""),
        applicantName: resolveApplicantName(item.fields),
        standInNote,
      }),
      {
        listTitle: formTitle,
        responseItemId: item.id,
        layer: entry.layer,
        testRun,
      },
    );
    return true;
  } catch (error) {
    logWarn("api:workflow-email-cron", "Scheduled workflow email failed", {
      formTitle,
      itemId: item.id,
      layer: entry.layer,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * One summary for several steps due to the same person.
 *
 * Every entry is claimed first, so a run killed mid-way leaves them "sending"
 * and the staleness window retries them, exactly as for a single email. After
 * the one send, each submission's own log and schedule record the delivery, so
 * the row looks the same afterwards as if it had been mailed by itself.
 */
async function claimAndDeliverDigest(
  token: string,
  group: (DigestCandidate & { fields: Record<string, unknown> })[],
): Promise<boolean> {
  for (const candidate of group) {
    await claimEntry(token, candidate.formTitle, { id: candidate.itemId, fields: candidate.fields }, candidate.entry);
  }

  const recipient = scheduledRecipients(group[0].entry.recipient);
  const recipientText = Array.isArray(recipient) ? recipient.join(", ") : recipient;
  let delivered = false;
  try {
    await sendGraphEmail(token, buildWorkflowDigestEmail({ recipient, candidates: group, baseUrl: getApplicationBaseUrl() }));
    delivered = true;
  } catch (error) {
    logWarn("api:workflow-email-cron", "Daily summary email failed", {
      count: group.length,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  const attemptedAt = new Date().toISOString();
  for (const candidate of group) {
    try {
      await persistWorkflowEmailAttempt(
        token,
        { listTitle: candidate.formTitle, responseItemId: candidate.itemId, layer: candidate.entry.layer },
        delivered
          ? { layer: candidate.entry.layer, recipient: recipientText, status: "sent", attemptedAt, via: "summary", summarySize: group.length }
          : { layer: candidate.entry.layer, recipient: recipientText, status: "failed", attemptedAt, error: "Email delivery failed", via: "summary", summarySize: group.length },
      );
    } catch (error) {
      // The summary has gone; only this row's bookkeeping did not. It stays
      // "sending" and may be included again once that goes stale - a repeat
      // line in tomorrow's summary, never a lost request.
      logWarn("api:workflow-email-cron", "Could not record a daily summary delivery", {
        formTitle: candidate.formTitle,
        itemId: candidate.itemId,
        layer: candidate.entry.layer,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return delivered;
}

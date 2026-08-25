import { setCorsHeaders, validateApiKey } from "./_utils/auth.js";
import {
  getGraphToken,
  queryAllListItems,
  updateListItemFields,
} from "./_utils/graphClient.js";
import { logError, logWarn } from "./_utils/logger.js";
import {
  buildWorkflowActionEmail,
  deliverWorkflowEmail,
  getDueWorkflowEmailSchedules,
  parseWorkflowEmailSchedule,
  setWorkflowEmailSchedule,
} from "./_utils/workflowEmail.js";
import { REFERENCE_NO_FIELD } from "./_utils/referenceNumber.js";
import { parseValidEmailList } from "./_utils/layerRecipients.js";
import { readTestRunRedirect } from "./_utils/testRun.js";

/**
 * How long one run may spend scanning before it stops and says so.
 *
 * A run killed by the platform timeout mid-scan leaves no record of how far it
 * got, so the same forms are scanned first every day and the ones behind them
 * are never reached at all. Stopping deliberately, with a count of what is
 * left, at least makes that visible. Kept under the function's maxDuration.
 */
const SCAN_BUDGET_MS = 50_000;

function scheduledRecipients(recipient: string): string | string[] {
  const parsed = parseValidEmailList(recipient);
  if (parsed.length === 0) return recipient;
  return parsed.length === 1 ? parsed[0] : parsed;
}

interface ApiRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
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

          try {
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
                reviewLink: entry.reviewLink,
                referenceNo: String(item.fields[REFERENCE_NO_FIELD] || ""),
              }),
              {
                listTitle: formTitle,
                responseItemId: item.id,
                layer: entry.layer,
                testRun: readTestRunRedirect(item.fields),
              },
            );
            sent++;
          } catch (error) {
            failed++;
            logWarn("api:workflow-email-cron", "Scheduled workflow email failed", {
              formTitle,
              itemId: item.id,
              layer: entry.layer,
              errorMessage: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }

    return res.status(200).json({ ok: true, examined, sent, failed, remainingForms });
  } catch (error) {
    logError("api:workflow-email-cron", "Scheduled workflow email run failed", error);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

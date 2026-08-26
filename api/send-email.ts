import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken, queryListItemById } from "./_utils/graphClient.js";
import { logError, logWarn } from "./_utils/logger.js";
import {
  deliverWorkflowEmail,
  sendGraphEmail,
  type WorkflowEmailAttachment,
  type WorkflowEmailContext,
} from "./_utils/workflowEmail.js";
import { applySendEmailTestRun } from "./_utils/sendEmailTestRun.js";
import { isTestRow, readTestRunRedirect } from "./_utils/testRun.js";

interface ApiRequest {
  body: Record<string, unknown>;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

function normalizeAttachment(entry: unknown): WorkflowEmailAttachment | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const record = entry as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const contentType = typeof record.contentType === "string" && record.contentType.trim()
    ? record.contentType.trim()
    : "application/octet-stream";
  let contentBytes = typeof record.contentBytes === "string"
    ? record.contentBytes
    : typeof record.content === "string"
      ? record.content
      : "";
  if (contentBytes.startsWith("data:")) {
    const commaIndex = contentBytes.indexOf(",");
    contentBytes = commaIndex >= 0 ? contentBytes.slice(commaIndex + 1) : "";
  }
  contentBytes = contentBytes.trim();
  if (!name || !contentBytes) return null;
  return { name, contentType, contentBytes };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers as Record<string, string | string[] | undefined>);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { to, subject, body, workflow, sendToConfiguredSender, attachments, testTicket, slug } = req.body as Record<string, unknown>;
  const configuredSender = process.env.HR_FORM_EMAIL_FROM_ADDRESS || process.env.EMAIL_FROM_ADDRESS || "";

  const recipients = sendToConfiguredSender === true && configuredSender
    ? [configuredSender]
    : typeof to === "string"
    ? [to]
    : Array.isArray(to)
      ? to.filter((recipient): recipient is string => typeof recipient === "string")
      : [];
  const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  if (recipients.length === 0 || recipients.some((recipient) => !isEmail(recipient))) {
    return res.status(400).json({ error: "Invalid recipient email address" });
  }

  if (typeof subject !== "string" || !subject.trim() || typeof body !== "string" || !body.trim()) {
    return res.status(400).json({ error: "Missing required fields: to, subject, body" });
  }

  try {
    const token = await getGraphToken();
    const normalizedAttachments = Array.isArray(attachments)
      ? attachments.map(normalizeAttachment).filter((attachment): attachment is WorkflowEmailAttachment => attachment !== null)
      : [];
    const rawMessage = {
      to: recipients,
      subject,
      body,
      ...(normalizedAttachments.length ? { attachments: normalizedAttachments } : {}),
    };
    if (
      workflow &&
      typeof workflow === "object" &&
      typeof (workflow as Record<string, unknown>).listTitle === "string" &&
      (typeof (workflow as Record<string, unknown>).responseItemId === "string" ||
        typeof (workflow as Record<string, unknown>).responseItemId === "number") &&
      typeof (workflow as Record<string, unknown>).layer === "number"
    ) {
      const workflowFields = workflow as Record<string, unknown>;
      const listTitle = workflowFields.listTitle as string;
      const responseItemId = workflowFields.responseItemId as string | number;
      const layer = workflowFields.layer as number;

      // The redirect is derived server-side from the row itself — never from
      // anything the request supplies (in particular, never from a client
      // `testTicket`/`slug` — see below) — so a caller cannot drive it by
      // simply sending a `workflow.testRun` object. This is also what makes
      // this route safe for the browser-driven decision links (approve/reject
      // from an emailed review link), which carry no ticket at all: the row
      // is the only source of truth for whether this is a rehearsal.
      //
      // The lookup is wrapped rather than left to throw: `queryListItemById`
      // itself degrades a missing ITEM to `null` (handled below, same as
      // before), but `getListId` underneath it THROWS for a list name that
      // does not resolve. Most callers omit `responseListTitle` and fall back
      // to `formTitle` (see `triggerApprovalNotification` in
      // `src/utils/formBuilderSP.ts`), so any form whose response list name
      // does not exactly match its title would otherwise 500 this handler and
      // lose the notification outright — a production regression for people
      // who never touch test runs. Before this redirect existed, the same
      // mismatch only broke the post-send log write; the mail still went out.
      // So ANY failure to resolve the list or read the row is treated as
      // "cannot tell — send it exactly as an ordinary production message
      // would have sent before this change", logged so it stays visible. The
      // one case that still refuses to send is the one already handled below:
      // the row loaded fine, it is a test row, and it has no usable redirect.
      let responseItem: Awaited<ReturnType<typeof queryListItemById>> = null;
      try {
        responseItem = await queryListItemById(token, listTitle, String(responseItemId));
      } catch (lookupError) {
        logWarn("api:send-email", "Could not resolve the workflow row to check for a test-run redirect; sending as an ordinary message", {
          listTitle,
          responseItemId,
          layer,
          errorMessage: lookupError instanceof Error ? lookupError.message : String(lookupError),
        });
        await sendGraphEmail(token, rawMessage);
        return res.status(200).json({ ok: true });
      }
      const testRun = readTestRunRedirect(responseItem?.fields);
      if (isTestRow(responseItem?.fields) && !testRun) {
        // Flagged for a rehearsal but with no usable redirect address. The
        // alternative — falling back to the real assignee baked into the
        // message — would mail a real approver from a run the builder believes
        // is a rehearsal, so the mail simply does not go out.
        logWarn("api:send-email", "Test run has no usable redirect address; refusing to send rather than mailing a real approver", {
          listTitle,
          responseItemId,
          layer,
        });
        return res.status(200).json({ ok: true, skipped: "test-run-redirect-unusable" });
      }

      // The ticket-based redirect (`applySendEmailTestRun`) is deliberately
      // NOT applied here even if the caller also sent a `testTicket`: it would
      // redirect a message that is about to be redirected again below, which
      // stamps a second "would have gone to…" banner on top of the first,
      // naming the test address instead of the real approver.
      const context: WorkflowEmailContext = { listTitle, responseItemId, layer, testRun };
      await deliverWorkflowEmail(token, rawMessage, context);
    } else {
      // No workflow row to derive a redirect from (a plain confirmation email,
      // for instance) — fall back to the ticket the caller forwarded, if any.
      const message = applySendEmailTestRun(rawMessage, testTicket, slug);
      await sendGraphEmail(token, message);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    logError("api:send-email", "Failed to send email", e);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

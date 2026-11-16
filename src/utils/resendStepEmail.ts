/**
 * resendStepEmail.ts — the Resend button on Available forms → Emails sent & pending.
 *
 * Sends a step's request email again to the people it already went to, for a
 * reviewer who has lost or missed it. It is the plain case of All Submissions'
 * "Send now or resend" (`handleForceResend` in ApprovalDashboard.tsx): same
 * people, same link, same notification path (`triggerApprovalNotification`, so
 * the routing check in /api/send-email still applies and a fresh send restarts
 * the reminder clock). Anything that needs more — a different address, a step
 * with no one named, a paper step — is refused with a pointer to All
 * Submissions, which handles those.
 */
import type { LayerConfig } from "../types";
import { getActiveLayers } from "../components/builder/approvalDashboardLayerProgress";
import { ensureWorkflowColumns, getFormConfigByTitle, spGet, spPatch, triggerApprovalNotification } from "./formBuilderSP";
import { isManualPaperStatus, isNeedsRoutingStatus } from "./layerParkStatus";
import { parseValidEmailList, writeLayerRecipientFields } from "./layerRecipients";
import { ensureLinkToken } from "./linkToken";
import { workflowEmailHoldMessage } from "./workflowEmailHoldMessage";
import { getScheduledWorkflowEmail, updateScheduledWorkflowEmailRecipient } from "./workflowEmailSchedule";
import { buildWorkflowReviewLink } from "./workflowLink";
import { isCompletedFormStatus, isRejectedStatus, isTerminalLayerStatus } from "./workflowStatus";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
const MANUAL_PAPER_EMAIL = (import.meta.env.VITE_HR_FORM_MANUAL_PAPER_ADDRESS || "").trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ELSEWHERE = "Use All submissions → Send now or resend for this one.";

export interface ResendStepParams {
  listTitle: string;
  itemId: number;
  /** The step the tab showed; refused if the submission has moved on since. */
  layer: number;
  submittedBy: string;
  layerConfig: LayerConfig | null | undefined;
  selectedBranch?: string;
}

export interface ResendStepResult {
  /** Who it went to. */
  recipients: string[];
  /** The row's sent-email log as it now reads, for the list to show the new send. */
  workflowEmailLog: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

/** Throws with a message fit to show the admin; returns only once the email went out. */
export async function resendStepEmail(token: string, params: ResendStepParams): Promise<ResendStepResult> {
  const itemUrl = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(params.listTitle)}')/items(${params.itemId})`;
  const raw = await spGet(token, itemUrl) as Record<string, unknown>;

  // Re-read, not trusted from the list: the reviewer may have acted since the page loaded.
  const layerNumber = Math.max(Number(raw.CurrentLayer) || 0, Number(raw.CurrentApprovalLayer) || 0);
  const status = text(raw[`L${params.layer}_Status`]);
  const formStatus = text(raw.FormStatus) || text(raw.Status);
  if (layerNumber !== params.layer || isTerminalLayerStatus(status) || isCompletedFormStatus(formStatus) || isRejectedStatus(formStatus)) {
    throw new Error("This step has already been acted on or the submission has moved on, so nothing was sent. Refresh the page to update the list.");
  }
  if (isNeedsRoutingStatus(status) || isManualPaperStatus(status)) {
    throw new Error(`This step is on hold or handled on paper. ${ELSEWHERE}`);
  }

  const layers = getActiveLayers(params.layerConfig, text(raw.SelectedBranch) || params.selectedBranch || "");
  const layer = layers.find((candidate) => Number(candidate.layerNumber) === layerNumber);
  if (!layer) throw new Error(`Step ${layerNumber} is not in this form's workflow setup. ${ELSEWHERE}`);

  const primary = text(raw[`L${layerNumber}_Email`]);
  if (!EMAIL_RE.test(primary)) throw new Error(`Step ${layerNumber} has nobody named on it. ${ELSEWHERE}`);
  if (MANUAL_PAPER_EMAIL && primary.toLowerCase() === MANUAL_PAPER_EMAIL) {
    throw new Error(`This step goes to the paper mailbox. ${ELSEWHERE}`);
  }

  // The same people as before, and the link the reviewer already holds.
  const patchBody: Record<string, unknown> = {};
  const actors = parseValidEmailList(raw[`L${layerNumber}_Emails`] || primary);
  const recipients = writeLayerRecipientFields(patchBody, layer, actors.length ? actors : [primary], primary);
  const updatedAt = new Date().toISOString();
  if (getScheduledWorkflowEmail(raw.WorkflowEmailSchedule, layerNumber)) {
    patchBody.WorkflowEmailSchedule = JSON.stringify(updateScheduledWorkflowEmailRecipient(
      raw.WorkflowEmailSchedule,
      layerNumber,
      (recipients.length ? recipients : [primary]).join(", "),
      updatedAt,
    ));
  }
  const linkToken = ensureLinkToken(layer, raw, layerNumber, patchBody);
  await ensureWorkflowColumns(token, params.listTitle, Math.max(layerNumber, layers.length));
  await spPatch(token, itemUrl, patchBody);

  const config = await getFormConfigByTitle(token, params.listTitle) as { Slug?: unknown } | null;
  const reviewLink = buildWorkflowReviewLink({
    baseUrl: window.location.origin,
    layerType: layer.type,
    authMode: layer.authMode,
    publicToken: layer.publicToken || "",
    formSlug: text(config?.Slug),
    responseItemId: params.itemId,
    layerNumber,
    linkToken,
  });

  const notification = await triggerApprovalNotification(token, {
    formTitle: params.listTitle,
    submittedBy: params.submittedBy,
    responseItemId: params.itemId,
    layer: layerNumber,
    totalLayers: layers.length || layerNumber,
    action: "submit",
    nextApproverEmail: primary,
    ...(recipients.length ? { nextRecipients: recipients } : {}),
    nextLayerType: layer.type,
    reviewLink,
    responseListTitle: params.listTitle,
    throwOnEmailError: true,
  });
  if (notification.held) throw new Error(workflowEmailHoldMessage(notification.held));

  const refreshed = await spGet(token, `${itemUrl}?$select=WorkflowEmailLog`) as Record<string, unknown>;
  return { recipients: recipients.length ? recipients : [primary], workflowEmailLog: text(refreshed.WorkflowEmailLog) };
}

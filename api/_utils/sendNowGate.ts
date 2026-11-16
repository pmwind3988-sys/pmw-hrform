/**
 * sendNowGate.ts — the routing check for a "please act" email the browser asks
 * `api/send-email.ts` to send: a signed-in submission, an approval made in the
 * browser, or an admin's "Send now or resend".
 *
 * The browser wrote the message, so the check can only confirm it, hold it, or
 * — when it corrected the step to other people — have the server write the
 * request again for them (`rebuildCorrectedActionEmail`). Only forms switched
 * on for the check (`isRoutingCheckedForm`) come here; every other form sends
 * exactly as it did before.
 */
import { lookupSubmitterName, resolveApplicantName, resolveTrainingTitle } from "./applicantName.js";
import { createApprovalDirectoryReader } from "./approvalDirectory.js";
import { queryMasterFormByTitle } from "./graphClient.js";
import { branchLayers, pickLayerByNumber } from "./layerPick.js";
import { isManualPaperStatus, isNeedsRoutingStatus } from "./layerParkStatus.js";
import { readLinkToken } from "./linkToken.js";
import { logWarn } from "./logger.js";
import { decideBeforeSend } from "./preSendGate.js";
import { createPreSendCheckCache } from "./preSendRoutingCheck.js";
import { REFERENCE_NO_FIELD } from "./referenceNumber.js";
import { isRoutingCheckedForm } from "./routingCheckedForms.js";
import { standInEmailNote } from "./resolveAssignee.js";
import { loadSubmissionLayerConfig } from "./submissionLayerConfig.js";
import { withTestRunStandInFor } from "./testRun.js";
import {
  buildWorkflowActionEmail,
  getApplicationBaseUrl,
  parseWorkflowEmailSchedule,
  type WorkflowEmailMessage,
} from "./workflowEmail.js";
import { buildWorkflowReviewLink, withWorkflowRoutePrefix } from "./workflowLink.js";

const LOG_SCOPE = "api:send-email";
const RESPONSES_SUFFIX = " Responses";

/**
 * The checked form an answers list belongs to, or "" when it is not one.
 *
 * The browser names only the list. A form's answers live in a list named after
 * the form, or after the form plus " Responses" (see `api/evaluate.ts`), so
 * both spellings count.
 */
export function routingCheckedFormForList(listTitle: string): string {
  if (isRoutingCheckedForm(listTitle)) return listTitle;
  if (listTitle.endsWith(RESPONSES_SUFFIX)) {
    const formTitle = listTitle.slice(0, -RESPONSES_SUFFIX.length);
    if (isRoutingCheckedForm(formTitle)) return formTitle;
  }
  return "";
}

interface StepDetails {
  layerType: "approval" | "evaluation";
  totalLayers: number;
  reviewLink: string;
  submittedBy: string;
}

/**
 * What the request email needs to know about the step: from the row's own
 * schedule entry, which the browser writes just before it asks for the send,
 * or else from the workflow the submission was made under, the way
 * `api/evaluate.ts` builds the link for the next step.
 */
async function stepDetails(
  token: string,
  formTitle: string,
  itemId: string,
  layer: number,
  fields: Record<string, unknown>,
): Promise<StepDetails | null> {
  const submittedBy = String(fields.SubmittedBy || "Public respondent");
  const entry = parseWorkflowEmailSchedule(fields.WorkflowEmailSchedule)[String(layer)];
  if (entry?.reviewLink && entry.layerType && entry.totalLayers) {
    return {
      layerType: entry.layerType,
      totalLayers: entry.totalLayers,
      reviewLink: withWorkflowRoutePrefix(entry.reviewLink, entry.layerType),
      submittedBy: entry.submittedBy || submittedBy,
    };
  }

  const master = await queryMasterFormByTitle(token, formTitle);
  if (!master) return null;
  const { layerConfig } = await loadSubmissionLayerConfig(token, formTitle, master.fields, fields);
  if (!layerConfig?.layers) return null;
  const selectedBranch = typeof fields.SelectedBranch === "string" ? fields.SelectedBranch.trim().toLowerCase() : "";
  const step = pickLayerByNumber(layerConfig, selectedBranch, layer);
  if (!step) return null;
  const onBranch = branchLayers(layerConfig, selectedBranch);
  const layerType = step.type === "evaluation" ? "evaluation" : "approval";
  return {
    layerType,
    totalLayers: (onBranch?.length ? onBranch : layerConfig.layers).length,
    reviewLink: buildWorkflowReviewLink({
      baseUrl: getApplicationBaseUrl(),
      layerType,
      authMode: String(step.authMode || ""),
      publicToken: String(step.publicToken || "").trim(),
      formSlug: String(master.fields.Slug || "").trim(),
      responseItemId: itemId,
      layerNumber: layer,
      linkToken: readLinkToken(fields, layer),
    }),
    submittedBy,
  };
}

/**
 * What `send-email` answers instead of sending. `held` is the check's outcome
 * (`held-no-routing`, `held-check-failed`) or `check-failed` when the row
 * itself could not be read; the browser tells the two kinds apart by whether it
 * ends in `check-failed`.
 */
export type BrowserRequestHold = { held: "held-no-routing" | "held-check-failed"; reason: string };

/**
 * Whether a checked form's request may go, and as what. `message` is set only
 * when the server rewrote it for corrected people; otherwise the browser's own
 * message goes as it is. Never throws: anything unexpected holds.
 */
export async function gateBrowserRequest(
  token: string,
  formTitle: string,
  listTitle: string,
  itemId: string,
  layer: number,
  fields: Record<string, unknown>,
): Promise<{ message?: WorkflowEmailMessage } | BrowserRequestHold> {
  try {
    const decision = await decideBeforeSend(
      token,
      createPreSendCheckCache(token),
      { formTitle, itemId, layer, trigger: "send-now", listTitle },
      fields,
      LOG_SCOPE,
    );
    if (decision.action === "hold") {
      return { held: decision.checkFailed ? "held-check-failed" : "held-no-routing", reason: decision.reason };
    }
    if (decision.action === "as-before") {
      // A step the check could not judge still never gets a request to act
      // while it waits for routing or is handled on paper.
      const status = String(decision.notCheckable?.fields[`L${layer}_Status`] ?? "");
      if (isNeedsRoutingStatus(status) || isManualPaperStatus(status)) {
        return { held: "held-no-routing", reason: "The step is waiting for routing or is handled on paper" };
      }
      return {};
    }
    if (!decision.corrected) return {};
    const message = await rebuildCorrectedActionEmail(token, {
      formTitle,
      itemId,
      layer,
      fields: decision.fields,
      recipients: decision.recipients,
      primary: decision.primary,
    });
    if (!message) {
      logWarn(LOG_SCOPE, "Routing corrected the step but its request could not be rewritten; holding it", { formTitle, itemId, layer });
      return { held: "held-check-failed", reason: "The corrected request email could not be built" };
    }
    return { message };
  } catch (error) {
    logWarn(LOG_SCOPE, "Routing check before a browser send failed; holding the request", {
      formTitle,
      itemId,
      layer,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { held: "held-check-failed", reason: "The routing check could not be completed" };
  }
}

/**
 * The request email again, for the people routing corrected the step to.
 *
 * The browser's text was written for the person it had, so it is not
 * re-addressed: it may name them, or carry their stand-in's sentence. Built
 * the way the daily run builds one (`claimAndDeliver` in
 * `api/workflow-email-cron.ts`). Anything the browser attached is dropped; a
 * request to act carries no attachment today, only a paper notice does, and
 * that never comes here. Returns null when the step cannot be described, so the
 * caller holds rather than guesses.
 */
export async function rebuildCorrectedActionEmail(
  token: string,
  params: {
    formTitle: string;
    itemId: string;
    layer: number;
    fields: Record<string, unknown>;
    recipients: string[];
    primary: string;
  },
): Promise<WorkflowEmailMessage | null> {
  const details = await stepDetails(token, params.formTitle, params.itemId, params.layer, params.fields);
  if (!details) return null;
  const standInNote = await standInEmailNote(
    withTestRunStandInFor(createApprovalDirectoryReader(token), params.fields),
    params.primary,
    params.recipients,
    details.layerType,
  ).catch(() => undefined);
  return buildWorkflowActionEmail({
    formTitle: params.formTitle,
    submittedBy: details.submittedBy,
    responseItemId: params.itemId,
    layer: params.layer,
    totalLayers: details.totalLayers,
    recipient: params.recipients.length === 1 ? params.recipients[0] : params.recipients,
    layerType: details.layerType,
    reviewLink: details.reviewLink,
    referenceNo: String(params.fields[REFERENCE_NO_FIELD] || ""),
    applicantName: resolveApplicantName(params.fields),
    standInNote,
    trainingTitle: resolveTrainingTitle(params.fields),
    submitterName: await lookupSubmitterName(createApprovalDirectoryReader(token), details.submittedBy).catch(() => ""),
  });
}

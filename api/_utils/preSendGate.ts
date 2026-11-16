/**
 * preSendGate.ts — what a sender does with the routing check's answer.
 *
 * `checkBeforeSend` (preSendRoutingCheck.ts) says whether a step's saved people
 * still match routing. Every path that sends a "please act" email turns that
 * answer into the same three choices, so the mapping lives here once:
 *
 * - `as-before`: the form is not switched on, it is a test run, or the check
 *   could not judge the step; the sender does exactly what it did before the
 *   check existed, with its own recipients.
 * - `send`: the check confirmed or corrected the step; send to these people.
 * - `hold`: send no action email. `checkFailed` says whether something could
 *   not be read (worth trying again) or routing simply has no answer (the step
 *   is parked and HR has been told).
 *
 * `gateFirstRequestEmail` applies it to the email a step gets the moment it
 * opens (a new submission, or the move on after a decision). The submitter or
 * approver is never told about any of it: their decision is already recorded.
 */
import { logWarn } from "./logger.js";
import { checkBeforeSend, type PreSendCheckCache, type PreSendCheckParams } from "./preSendRoutingCheck.js";
import { isRoutingCheckedForm } from "./routingCheckedForms.js";
import { isManualPaperStatus, isNeedsRoutingStatus } from "./layerParkStatus.js";
import { isTestRow } from "./testRun.js";
import {
  persistWorkflowEmailSchedule,
  type WorkflowEmailContext,
  type WorkflowEmailScheduleEntry,
} from "./workflowEmail.js";
import { nextDigestRunAt } from "./workflowSummaryHold.js";

export type PreSendDecision =
  | {
    action: "as-before";
    /** Set when the check ran but could not judge the step: the row as it reads now. */
    notCheckable?: { fields: Record<string, unknown> };
  }
  | { action: "send"; recipients: string[]; primary: string; fields: Record<string, unknown>; corrected: boolean }
  | { action: "hold"; reason: string; checkFailed: boolean; fields?: Record<string, unknown> };

export type PreSendDecisionParams = Omit<PreSendCheckParams, "cache">;

function hasFields(fields: Record<string, unknown> | undefined): fields is Record<string, unknown> {
  return !!fields && Object.keys(fields).length > 0;
}

export async function decideBeforeSend(
  token: string,
  cache: PreSendCheckCache,
  params: PreSendDecisionParams,
  rowFields: Record<string, unknown>,
  logScope: string,
): Promise<PreSendDecision> {
  // Unchecked forms and test runs never reach the check and run exactly as before.
  if (!isRoutingCheckedForm(params.formTitle) || isTestRow(rowFields)) return { action: "as-before" };
  let result;
  try {
    result = await checkBeforeSend(token, { ...params, cache });
  } catch (error) {
    // The check reports its own failures; this is only for one that escapes.
    logWarn(logScope, "Routing check failed before send; holding the email", {
      formTitle: params.formTitle,
      itemId: params.itemId,
      layer: params.layer,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { action: "hold", reason: "The routing check could not be completed.", checkFailed: true };
  }
  if (result.hold) {
    return {
      action: "hold",
      reason: result.reason || "The routing check held this email.",
      checkFailed: result.outcome === "held-check-failed",
      ...(hasFields(result.fields) ? { fields: result.fields } : {}),
    };
  }
  if (result.outcome === "skipped") return { action: "as-before" };
  if (result.outcome === "not-checkable") return { action: "as-before", notCheckable: { fields: result.fields } };
  if (result.recipients.length === 0) {
    return { action: "hold", reason: "Routing gave nobody to send to.", checkFailed: false, fields: result.fields };
  }
  return {
    action: "send",
    recipients: result.recipients,
    primary: result.primary,
    fields: result.fields,
    corrected: result.outcome === "corrected",
  };
}

function isParkedOrPaper(fields: Record<string, unknown>, layer: number): boolean {
  const status = String(fields[`L${layer}_Status`] ?? "");
  return isNeedsRoutingStatus(status) || isManualPaperStatus(status);
}

export interface FirstRequestEmailInput {
  params: PreSendDecisionParams;
  cache: PreSendCheckCache;
  /** The row as the sender has it. */
  rowFields: Record<string, unknown>;
  /** Who the sender would mail without the check. */
  recipients: string[];
  /** The step's own person as the sender has it, for the stand-in note. */
  primary: unknown;
  /** The email is only scheduled for a later date (an evaluation's own schedule), never sent now. */
  deferred: boolean;
  /** What the email would have carried, so a failed check leaves the daily run something to retry. */
  retry: {
    context: WorkflowEmailContext;
    details: Pick<WorkflowEmailScheduleEntry, "layerType" | "totalLayers" | "reviewLink" | "submittedBy">;
  };
  logScope: string;
}

/**
 * `send: true` means go on as the code always has, with these recipients,
 * primary and row (the row decides between an action email and a parked or
 * paper notice). `send: false` means send nothing now.
 */
export type FirstRequestEmailGate =
  | { send: true; recipients: string[]; primary: unknown; fields: Record<string, unknown> }
  | { send: false };

/**
 * The routing check for the email a step gets when it opens. Never throws.
 *
 * On a hold, the only things that still go ahead are those that are not an
 * action email sent now: a parked or paper notice the row already called for,
 * and an evaluation's email that is only being scheduled for later (the daily
 * run checks it again when it falls due). A failed check otherwise leaves a
 * `scheduled` entry for the next daily run, which checks again before sending.
 */
export async function gateFirstRequestEmail(token: string, input: FirstRequestEmailInput): Promise<FirstRequestEmailGate> {
  const asBefore = (fields: Record<string, unknown>): FirstRequestEmailGate => ({
    send: true, recipients: input.recipients, primary: input.primary, fields,
  });
  let decision: PreSendDecision;
  try {
    decision = await decideBeforeSend(token, input.cache, input.params, input.rowFields, input.logScope);
  } catch {
    decision = { action: "hold", reason: "The routing check could not be completed.", checkFailed: true };
  }

  if (decision.action === "as-before") return asBefore(decision.notCheckable?.fields ?? input.rowFields);
  if (decision.action === "send") {
    return { send: true, recipients: decision.recipients, primary: decision.primary, fields: decision.fields };
  }

  const layer = input.params.layer;
  if (isParkedOrPaper(input.rowFields, layer) || input.deferred) return asBefore(input.rowFields);
  if (!decision.checkFailed || input.recipients.length === 0) return { send: false };

  const now = new Date();
  try {
    await persistWorkflowEmailSchedule(token, input.retry.context, {
      ...input.retry.details,
      layer,
      recipient: input.recipients.join(", "),
      dueAt: nextDigestRunAt(now).toISOString(),
      status: "scheduled",
      updatedAt: now.toISOString(),
    });
  } catch (error) {
    logWarn(input.logScope, "Could not leave the held email for the daily run", {
      formTitle: input.params.formTitle,
      itemId: input.params.itemId,
      layer,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
  return { send: false };
}

/**
 * preSendRoutingCheck.ts — before a "please act" workflow email goes out, make
 * sure the step's saved people are still who routing picks.
 *
 * For a form switched on in `routingCheckedForms.ts`, `checkBeforeSend` re-reads
 * the submission and compares the step's saved people with what the Routing
 * page answers now (`routingInspect.ts`, the same rules as the manual "Check
 * routing" in All Submissions):
 *
 * - same people: send as planned (`match`);
 * - different people: the step is corrected to the routed people, and the email
 *   goes to them (`corrected`);
 * - set by hand on this submission: never touched (`left-alone`);
 * - waiting on an earlier step, already parked or on paper: as today
 *   (`not-checkable`);
 * - routing has no answer: the step is parked as "Needs Routing", the email is
 *   held and the HR mailbox is told once (`held-no-routing`);
 * - something could not be read: nothing changes, the email is held and the
 *   next daily run tries again (`held-check-failed`).
 *
 * The check never fails a submission or a recorded decision: every error comes
 * back as `held-check-failed`, and a held email is never sent unchecked. Every
 * check is logged on the row (`WorkflowAssignmentData.checks`) and as one
 * server log line without addresses in it.
 */
import { queryListItemById, queryMasterFormByTitle, updateListItemFields } from "./graphClient.js";
import { logInfo, logWarn } from "./logger.js";
import { createApprovalDirectoryReader } from "./approvalDirectory.js";
import { resolveDepartmentApproverFromList } from "./departmentApproverLookup.js";
import { expandDistributionList } from "./groupMembers.js";
import {
  resolveLayerAssignee,
  valueToText,
  type ResolvableAssignee,
  type ResolvableLayer,
} from "./resolveAssignee.js";
import { resolutionContextFromItem } from "./resolutionContext.js";
import {
  inspectLayerRouting,
  type InspectableLayer,
  type RoutingInspectPorts,
  type SubjectDirectory,
} from "./routingInspect.js";
import type { SubmitterRoutingRule } from "./evaluationSubmitterRouting.js";
import { isRoutingCheckedForm } from "./routingCheckedForms.js";
import {
  getWorkflowAssignment,
  readRoutingChecks,
  recordRoutingCheck,
  setWorkflowAssignmentOverride,
  type RoutingCheckEntry,
  type RoutingCheckOutcome,
  type RoutingCheckTrigger,
  type WorkflowAssignmentData,
} from "./workflowAssignmentData.js";
import { isManualPaperStatus, isNeedsRoutingStatus, NEEDS_ROUTING_LAYER_STATUS } from "./layerParkStatus.js";
import {
  parseValidEmailList,
  readLayerDeliveryRecipients,
  writeLayerRecipientFields,
  type LayerNotifyConfig,
} from "./layerRecipients.js";
import { isTestRow } from "./testRun.js";
import { branchLayers, pickLayerByNumber } from "./layerPick.js";
import { isTerminalFormStatus, isTerminalLayerStatus } from "./layerItemAccess.js";
import { loadSubmissionLayerConfig, type SubmissionLayerConfig } from "./submissionLayerConfig.js";
import { forEachSurveyElement } from "./surveyWalk.js";
import {
  buildRoutingHoldNoticeEmail,
  parseWorkflowEmailSchedule,
  resolveManualPaperAddress,
  sendGraphEmail,
  setWorkflowEmailSchedule,
} from "./workflowEmail.js";
import { resolveApplicantName } from "./applicantName.js";
import { REFERENCE_NO_FIELD } from "./referenceNumber.js";

const LOG_SCOPE = "api:pre-send-routing-check";

/** Failed checks in a row before the HR mailbox is told a step's email is stuck. */
export const FAILED_CHECKS_BEFORE_ATTENTION = 5;

/** Why a step named by hand is still held: its parked status was never cleared. */
const PARKED_BY_HAND_NOTE =
  "This step is still waiting for routing. Use Reconfigure this submission to name the person; the email goes out then.";

const CORRECTION_REASON = "Corrected automatically to match routing";

interface SubmissionWorkflow {
  layerConfig: SubmissionLayerConfig;
  surveyJson: unknown;
}

/**
 * Reads shared by every check in one request or daily run: one strict
 * Approval Directory reader, and each form's Master Form row and each form
 * version's workflow, read once. A failed read is forgotten, never kept as an
 * answer, so the next check reads again.
 */
export interface PreSendCheckCache {
  directory: ReturnType<typeof createApprovalDirectoryReader>;
  masterForms: Map<string, Promise<Record<string, unknown>>>;
  workflows: Map<string, Promise<SubmissionWorkflow>>;
}

export function createPreSendCheckCache(token: string): PreSendCheckCache {
  return {
    directory: createApprovalDirectoryReader(token, { strict: true }),
    masterForms: new Map(),
    workflows: new Map(),
  };
}

/**
 * On `skipped` (form not switched on, or a test run) the caller proceeds
 * exactly as it would have without the check, using its own recipients:
 * `recipients` and `primary` are empty then, and `recipients`, `primary` and
 * `fields` are only meaningful for the other outcomes.
 */
export interface PreSendCheckResult {
  outcome: RoutingCheckOutcome | "skipped";
  /** true when the caller must not send the action email. */
  hold: boolean;
  /** Delivery list to use (L{n}_NotifyEmails after any correction); empty on hold. */
  recipients: string[];
  /** L{n}_Email after any correction. */
  primary: string;
  /** The row's fields after any write, for callers that go on to build a message. */
  fields: Record<string, unknown>;
  reason?: string;
}

export interface PreSendCheckParams {
  formTitle: string;
  itemId: string;
  layer: number;
  trigger: RoutingCheckTrigger;
  cache?: PreSendCheckCache;
  /** The response list's name, when it is not the form title (e.g. "{title} Responses"). */
  listTitle?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Shares one load per key; a load that fails is dropped so it is tried again. */
function remember<T>(map: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  const known = map.get(key);
  if (known) return known;
  const loading = load();
  map.set(key, loading);
  loading.catch(() => {
    if (map.get(key) === loading) map.delete(key);
  });
  return loading;
}

function loadMasterForm(token: string, cache: PreSendCheckCache, formTitle: string): Promise<Record<string, unknown>> {
  return remember(cache.masterForms, formTitle.trim().toLowerCase(), async () => {
    const form = await queryMasterFormByTitle(token, formTitle);
    if (!form) throw new Error(`The form "${formTitle}" could not be found.`);
    return form.fields;
  });
}

function loadWorkflow(
  token: string,
  cache: PreSendCheckCache,
  formTitle: string,
  formConfig: Record<string, unknown>,
  fields: Record<string, unknown>,
): Promise<SubmissionWorkflow> {
  const key = [
    formTitle.trim().toLowerCase(),
    String(fields.FormVersion || "").trim(),
    String(fields.PublishKey || "").trim(),
  ].join("|");
  return remember(cache.workflows, key, async () => {
    const loaded = await loadSubmissionLayerConfig(token, formTitle, formConfig, fields, { strict: true });
    if (!loaded.layerConfig || !Array.isArray(loaded.layerConfig.layers)) {
      throw new Error("The workflow this submission was made under could not be read.");
    }
    return { layerConfig: loaded.layerConfig, surveyJson: loaded.surveyJson };
  });
}

/** The steps this submission runs through, honouring the branch it took. */
function activeLayers(config: SubmissionLayerConfig, selectedBranch: string): Record<string, unknown>[] {
  const onBranch = branchLayers(config, selectedBranch);
  return onBranch?.length ? onBranch : config.layers ?? [];
}

/** A stored layer narrowed to what the check reads; null when it cannot be routed at all. */
function toInspectableLayer(raw: Record<string, unknown>): InspectableLayer | null {
  const layerNumber = Number(raw.layerNumber);
  const assignee = raw.assignee;
  if (!Number.isInteger(layerNumber) || layerNumber < 1 || !isRecord(assignee) || typeof assignee.type !== "string") {
    return null;
  }
  const narrowedAssignee: ResolvableAssignee = {
    ...(assignee as Partial<ResolvableAssignee>),
    type: assignee.type,
    value: typeof assignee.value === "string" ? assignee.value : "",
  };
  return {
    layerNumber,
    ...(typeof raw.title === "string" ? { title: raw.title } : {}),
    authMode: raw.authMode === "public" ? "public" : "365",
    assignee: narrowedAssignee,
    ...(typeof raw.type === "string" ? { type: raw.type } : {}),
    ...(typeof raw.manualPaperWhenSenderEmail === "boolean" ? { manualPaperWhenSenderEmail: raw.manualPaperWhenSenderEmail } : {}),
    ...(Array.isArray(raw.submitterRoutingRules)
      ? {
        submitterRoutingRules: raw.submitterRoutingRules.filter((rule): rule is SubmitterRoutingRule =>
          isRecord(rule) && typeof rule.action === "string"),
      }
      : {}),
  };
}

/** Where a layer's mail goes besides its actors, as configured on the workflow page. */
function notifyConfigOf(raw: Record<string, unknown>, layerNumber: number): { layerNumber: number } & LayerNotifyConfig {
  return {
    layerNumber,
    ...(Array.isArray(raw.notifyEmails)
      ? { notifyEmails: raw.notifyEmails.filter((email): email is string => typeof email === "string") }
      : {}),
    ...(raw.notifyRecipientMode === "notify-only" || raw.notifyRecipientMode === "both"
      ? { notifyRecipientMode: raw.notifyRecipientMode }
      : {}),
  };
}

/**
 * The ports the shared check runs on, over Graph with the strict directory
 * reader. The shared resolver turns a directory read that throws into a parked
 * step, and drops a stand-in it could not read; both would look like routing
 * having an answer. So every read the resolver makes is watched, and a failed
 * one is thrown again once it returns, for the check to report as a failure.
 */
function serverPorts(
  token: string,
  cache: PreSendCheckCache,
  workflow: SubmissionWorkflow,
): RoutingInspectPorts {
  const directory = cache.directory;
  return {
    resolveLayer: async (target: ResolvableLayer, item: Record<string, unknown>) => {
      let failure: unknown;
      const watch = <A extends unknown[], R>(read: (...args: A) => Promise<R>) =>
        async (...args: A): Promise<R> => {
          try {
            return await read(...args);
          } catch (error) {
            failure ??= error;
            throw error;
          }
        };
      const resolved = await resolveLayerAssignee(
        target,
        item,
        {
          lookupDepartmentApprover: async (layer, submittedData) => {
            try {
              const assignee: Parameters<typeof resolveDepartmentApproverFromList>[1] = {
                ...layer.assignee,
                type: "department-approver",
              };
              return await resolveDepartmentApproverFromList(
                token,
                assignee,
                submittedData,
                String(layer.title || `Layer ${layer.layerNumber}`),
              );
            } catch (error) {
              // Not reached in practice: the check routes a "Department approver"
              // step through the Routing page, never this list. Should it be, any
              // error here ("nobody listed" included) is a failed check, because
              // this list is not what the check compares against.
              failure ??= error;
              throw error;
            }
          },
          expandDistributionList: watch((_layer: ResolvableLayer, address: string) => expandDistributionList(token, address)),
          lookupPerson: watch(directory.lookupPerson),
          // As at submission: a public link's chain starts from the employee on the form.
          lookupSubject: watch((data: Record<string, unknown>) => directory.lookupSubject(data, workflow.layerConfig)),
          lookupRoleHolder: watch(directory.lookupRoleHolder),
        },
        { context: resolutionContextFromItem(item, target.layerNumber) },
      );
      if (failure !== undefined) {
        throw failure instanceof Error ? failure : new Error(String(failure));
      }
      return resolved;
    },
    loadSubjectDirectory: async (): Promise<SubjectDirectory> => {
      if (workflow.surveyJson === null || workflow.surveyJson === undefined) {
        // An empty question list would quietly find fewer people than the
        // manual check does.
        throw new Error("The form's questions could not be read.");
      }
      const questions: { name: string; title: string }[] = [];
      forEachSurveyElement(workflow.surveyJson, (element) => {
        const name = typeof element.name === "string" ? element.name : "";
        if (name) questions.push({ name, title: typeof element.title === "string" ? element.title : name });
      });
      const rows = await directory.routableRows();
      return {
        usable: true,
        rows: rows.map((row) => ({
          personEmail: row.personEmail,
          personName: row.personName,
          employeeId: row.employeeId,
          approverEmail: row.approverEmail,
        })),
        questions,
        layerConfig: workflow.layerConfig,
      };
    },
    lookupPerson: directory.lookupPerson,
    paperMailbox: resolveManualPaperAddress().trim().toLowerCase(),
  };
}

/** What a step stores today: its primary, and where its mail goes. */
function storedPeople(fields: Record<string, unknown>, layer: number): { primary: string; recipients: string[]; saved: string[] } {
  const primary = valueToText(fields[`L${layer}_Email`]);
  const delivery = readLayerDeliveryRecipients(fields, layer);
  return {
    primary,
    recipients: delivery.length ? delivery : parseValidEmailList(primary),
    saved: parseValidEmailList(fields[`L${layer}_Emails`] || primary),
  };
}

/** Facts for the HR notice that the row alone can give, when the workflow could not be read. */
interface StepFacts {
  layerType: "approval" | "evaluation";
  totalLayers: number;
}

function stepFactsFromRow(fields: Record<string, unknown>, layer: number): StepFacts {
  const scheduled = parseWorkflowEmailSchedule(fields.WorkflowEmailSchedule)[String(layer)];
  return {
    layerType: scheduled?.layerType === "evaluation" ? "evaluation" : "approval",
    totalLayers: Number(scheduled?.totalLayers) || layer,
  };
}

async function sendHoldNotice(
  token: string,
  params: PreSendCheckParams,
  fields: Record<string, unknown>,
  facts: StepFacts,
  reason: string,
  kind: "no-routing" | "check-failing",
): Promise<void> {
  const message = buildRoutingHoldNoticeEmail({
    formTitle: params.formTitle,
    responseItemId: params.itemId,
    layer: params.layer,
    totalLayers: facts.totalLayers,
    layerType: facts.layerType,
    reason,
    referenceNo: valueToText(fields[REFERENCE_NO_FIELD]) || undefined,
    applicantName: resolveApplicantName(fields) || undefined,
    submittedBy: valueToText(fields.SubmittedBy),
    kind,
  });
  if (parseValidEmailList(message.to).length === 0) {
    logWarn(LOG_SCOPE, "No HR mailbox configured for the routing hold notice", {
      formTitle: params.formTitle, itemId: params.itemId, layer: params.layer,
    });
    return;
  }
  try {
    await sendGraphEmail(token, message);
  } catch (error) {
    logWarn(LOG_SCOPE, "Could not send the routing hold notice", {
      formTitle: params.formTitle, itemId: params.itemId, layer: params.layer,
      errorMessage: errorText(error, "unknown error"),
    });
  }
}

/** Writes the log line on its own; a failure is noted in the server log and changes nothing. */
async function writeCheckLog(
  token: string,
  params: PreSendCheckParams,
  listTitle: string,
  fields: Record<string, unknown>,
  entry: RoutingCheckEntry,
): Promise<{ isNew: boolean; count: number; data: WorkflowAssignmentData }> {
  const recorded = recordRoutingCheck(fields.WorkflowAssignmentData, entry);
  try {
    await updateListItemFields(token, listTitle, params.itemId, {
      WorkflowAssignmentData: JSON.stringify(recorded.data),
    });
  } catch (error) {
    logWarn(LOG_SCOPE, "Could not log the routing check on the submission", {
      formTitle: params.formTitle, itemId: params.itemId, layer: params.layer,
      trigger: params.trigger, outcome: entry.outcome,
      errorMessage: errorText(error, "unknown error"),
    });
  }
  return recorded;
}

function finish(params: PreSendCheckParams, result: PreSendCheckResult): PreSendCheckResult {
  const meta = {
    formTitle: params.formTitle,
    itemId: params.itemId,
    layer: params.layer,
    trigger: params.trigger,
    outcome: result.outcome,
  };
  if (result.outcome === "skipped") logInfo(LOG_SCOPE, "Routing check skipped", meta);
  else logWarn(LOG_SCOPE, "Routing checked before send", meta);
  return result;
}

export async function checkBeforeSend(token: string, params: PreSendCheckParams): Promise<PreSendCheckResult> {
  const { formTitle, itemId, layer } = params;
  const listTitle = params.listTitle || formTitle;

  if (!isRoutingCheckedForm(formTitle)) {
    // Not checked: nothing is read, and the caller sends with what it has.
    return finish(params, { outcome: "skipped", hold: false, recipients: [], primary: "", fields: {} });
  }

  let fields: Record<string, unknown> | undefined;
  let facts: StepFacts | undefined;
  try {
    // Always the row as stored now, never a caller's copy: the test-run skip
    // and the decided-step guards must not depend on what a caller selected.
    fields = (await queryListItemById(token, listTitle, itemId))?.fields;
    if (!fields) throw new Error("The submission could not be read.");
    const row = fields;
    const stored = storedPeople(row, layer);
    if (isTestRow(row)) {
      return finish(params, { outcome: "skipped", hold: false, recipients: [], primary: "", fields: row });
    }

    const unchanged = (outcome: RoutingCheckOutcome, reason?: string): PreSendCheckResult => ({
      outcome, hold: false, recipients: stored.recipients, primary: stored.primary, fields: row,
      ...(reason ? { reason } : {}),
    });

    // Settled from the row alone, before any other read: a step that is
    // finished with is never written to, even when a later read would fail.
    const currentLayer = Number(row.CurrentLayer || row.CurrentApprovalLayer || 0) || 1;
    if (layer < currentLayer) {
      return finish(params, unchanged("not-checkable", "This step has already been passed."));
    }
    if (
      isTerminalFormStatus(row.FormStatus) || isTerminalFormStatus(row.Status)
      || isTerminalLayerStatus(row[`L${layer}_Status`])
    ) {
      return finish(params, unchanged("not-checkable", "This step or submission has already been decided."));
    }
    // A step reassigned by hand is never changed, so nothing else needs
    // reading: a workflow that cannot be read must not hold it either.
    if (getWorkflowAssignment(row.WorkflowAssignmentData, layer)?.source === "manual-override") {
      // Named by hand but still parked: the reviewer page refuses a parked
      // step, so mailing its link would hand someone a page that turns them
      // away. Callers hold a parked step; "Reconfigure this submission" is
      // what starts it.
      if (isNeedsRoutingStatus(valueToText(row[`L${layer}_Status`]))) {
        const at = new Date().toISOString();
        const latest = readRoutingChecks(row.WorkflowAssignmentData).filter((check) => check.layer === layer).pop();
        await writeCheckLog(token, params, listTitle, row, latest?.outcome === "held-no-routing"
          ? { ...latest, at }
          : { at, layer, trigger: params.trigger, outcome: "not-checkable", saved: stored.saved, routed: [], note: PARKED_BY_HAND_NOTE });
        return finish(params, unchanged("not-checkable", PARKED_BY_HAND_NOTE));
      }
      await writeCheckLog(token, params, listTitle, row, {
        at: new Date().toISOString(),
        layer,
        trigger: params.trigger,
        outcome: "left-alone",
        saved: stored.saved,
        routed: [],
      });
      return finish(params, unchanged("left-alone"));
    }

    const cache = params.cache ?? createPreSendCheckCache(token);
    const formConfig = await loadMasterForm(token, cache, formTitle);
    const workflow = await loadWorkflow(token, cache, formTitle, formConfig, row);
    const selectedBranch = valueToText(row.SelectedBranch);
    const rawLayer = pickLayerByNumber(workflow.layerConfig, selectedBranch, layer);
    const target = rawLayer ? toInspectableLayer(rawLayer) : null;
    if (!rawLayer || !target) throw new Error(`Step ${layer} is not in the workflow this submission was made under.`);
    facts = {
      layerType: target.type === "evaluation" ? "evaluation" : "approval",
      totalLayers: activeLayers(workflow.layerConfig, selectedBranch).length || layer,
    };

    const { verdict, routedPrimary, checkFailed } = await inspectLayerRouting(
      target, row, currentLayer, serverPorts(token, cache, workflow),
    );
    if (checkFailed) throw new Error(checkFailed);

    const now = new Date().toISOString();
    const entry = (outcome: RoutingCheckOutcome): RoutingCheckEntry => ({
      at: now,
      layer,
      trigger: params.trigger,
      outcome,
      saved: verdict.saved,
      routed: verdict.routed,
      ...(verdict.note ? { note: verdict.note } : {}),
      ...(verdict.how ? { how: verdict.how } : {}),
    });

    const status = valueToText(row[`L${layer}_Status`]);
    if (
      verdict.kind === "waiting"
      || (verdict.kind === "unresolved" && (isNeedsRoutingStatus(status) || isManualPaperStatus(status)))
    ) {
      // A step this check parked stays one hold line: a later look only moves
      // that line's count and time, so the log still reads "on hold".
      const latest = readRoutingChecks(row.WorkflowAssignmentData).filter((check) => check.layer === layer).pop();
      const line = isNeedsRoutingStatus(status) && latest?.outcome === "held-no-routing"
        ? { ...latest, at: now }
        : entry("not-checkable");
      await writeCheckLog(token, params, listTitle, row, line);
      return finish(params, unchanged("not-checkable", verdict.note));
    }
    if (verdict.kind === "match" || verdict.kind === "manual") {
      const outcome = verdict.kind === "match" ? "match" : "left-alone";
      await writeCheckLog(token, params, listTitle, row, entry(outcome));
      return finish(params, unchanged(outcome));
    }

    if (verdict.kind === "mismatch") {
      // The people and the log go in one patch: a correction that cannot be
      // recorded is not made, and the email waits for the next run.
      const patch: Record<string, unknown> = {};
      const recipients = writeLayerRecipientFields(patch, notifyConfigOf(rawLayer, layer), verdict.routed, routedPrimary);
      const primary = valueToText(patch[`L${layer}_Email`]);
      const assignments = setWorkflowAssignmentOverride(row.WorkflowAssignmentData, {
        layer,
        email: primary,
        reason: CORRECTION_REASON,
        updatedAt: now,
        updatedBy: "SYSTEM",
        source: "resolved",
        previous: {
          email: stored.primary || primary,
          source: "resolved",
          updatedBy: "SYSTEM",
          updatedAt: valueToText(row.SubmittedAt) || now,
        },
      });
      patch.WorkflowAssignmentData = JSON.stringify(recordRoutingCheck(assignments, entry("corrected")).data);
      const scheduled = parseWorkflowEmailSchedule(row.WorkflowEmailSchedule)[String(layer)];
      if (scheduled?.status === "scheduled") {
        patch.WorkflowEmailSchedule = JSON.stringify(setWorkflowEmailSchedule(row.WorkflowEmailSchedule, {
          ...scheduled,
          recipient: recipients.join(", "),
          updatedAt: now,
        }));
      }
      try {
        await updateListItemFields(token, listTitle, itemId, patch);
      } catch (error) {
        throw new Error(`The correction could not be saved on the submission: ${errorText(error, "unknown error")}`, { cause: error });
      }
      return finish(params, {
        outcome: "corrected", hold: false, recipients, primary, fields: { ...row, ...patch },
      });
    }

    // Routing has no answer: park the step so nobody is asked by mistake.
    const reason = verdict.note || "Routing has no answer for this step.";
    const parkPatch: Record<string, unknown> = { [`L${layer}_Status`]: NEEDS_ROUTING_LAYER_STATUS };
    writeLayerRecipientFields(parkPatch, { layerNumber: layer }, []);
    try {
      await updateListItemFields(token, listTitle, itemId, parkPatch);
    } catch (error) {
      throw new Error(`The step could not be put on hold: ${errorText(error, "unknown error")}`, { cause: error });
    }
    let parked: Record<string, unknown> = { ...row, ...parkPatch };
    const noteLine = `Layer ${layer}: ${reason}`;
    const notes = valueToText(row.RoutingNotes);
    if (!notes.split(/\r?\n/).includes(noteLine)) {
      const RoutingNotes = notes ? `${notes}\n${noteLine}` : noteLine;
      try {
        await updateListItemFields(token, listTitle, itemId, { RoutingNotes });
        parked = { ...parked, RoutingNotes };
      } catch {
        // RoutingNotes is absent on lists provisioned before it existed; the
        // status alone still shows the step to an admin.
        logWarn(LOG_SCOPE, "Could not record routing note", { formTitle, itemId, layer });
      }
    }
    const logged = await writeCheckLog(token, params, listTitle, parked, entry("held-no-routing"));
    parked = { ...parked, WorkflowAssignmentData: JSON.stringify(logged.data) };
    if (logged.isNew) await sendHoldNotice(token, params, parked, facts, reason, "no-routing");
    return finish(params, {
      outcome: "held-no-routing", hold: true, recipients: [], primary: "", fields: parked, reason,
    });
  } catch (error) {
    const reason = errorText(error, "The routing check could not be completed.");
    if (!fields) {
      return finish(params, { outcome: "held-check-failed", hold: true, recipients: [], primary: "", fields: {}, reason });
    }
    const row = fields;
    const stored = storedPeople(row, layer);
    const logged = await writeCheckLog(token, params, listTitle, row, {
      at: new Date().toISOString(),
      layer,
      trigger: params.trigger,
      outcome: "held-check-failed",
      saved: stored.saved,
      routed: [],
      note: reason,
    });
    if (logged.count === FAILED_CHECKS_BEFORE_ATTENTION) {
      await sendHoldNotice(token, params, row, facts ?? stepFactsFromRow(row, layer), reason, "check-failing");
    }
    return finish(params, {
      outcome: "held-check-failed",
      hold: true,
      recipients: [],
      primary: stored.primary,
      fields: { ...row, WorkflowAssignmentData: JSON.stringify(logged.data) },
      reason,
    });
  }
}

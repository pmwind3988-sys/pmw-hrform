/**
 * routingInspect.ts — server copy of `src/utils/routingInspect.ts`.
 *
 * Keep identical below this header; a test asserts it.
 */
import { classifyLayerRouting, type LayerRoutingVerdict } from "./routingCheck.js";
import {
  addStandIns,
  isDeferredAssignee,
  stripFieldReference,
  valueToText,
  type DirectoryPerson,
  type ResolvableLayer,
} from "./resolveAssignee.js";
import { resolveEvaluationSubmitterRouting, type SubmitterRoutingRule } from "./evaluationSubmitterRouting.js";
import { getWorkflowAssignment } from "./workflowAssignmentData.js";
import { isManualPaperStatus, isNeedsRoutingStatus } from "./layerParkStatus.js";
import { isPersonEmail } from "./directoryHarvest.js";
import { parseValidEmailList } from "./layerRecipients.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RoutingInspectPorts {
  /** The shared resolver with this side's ports; `layer` may be the substituted one-hop chain layer. */
  resolveLayer(layer: ResolvableLayer, item: Record<string, unknown>):
    Promise<{ email: string; emails: string[]; error?: string; parked?: { reason: string }; explanation?: string }>;
  /** The employee the form is about, from its answers (approvalDirectory reader's lookupSubject). */
  lookupSubject(item: Record<string, unknown>): Promise<DirectoryPerson | null>;
  lookupPerson(email: string): Promise<DirectoryPerson | null>;
  /** Dedicated manual-paper address, lower-cased, or "". */
  paperMailbox: string;
}

/** A workflow step, as much of it as the check reads. */
export interface InspectableLayer extends ResolvableLayer {
  type?: string;
  manualPaperWhenSenderEmail?: boolean;
  submitterRoutingRules?: readonly SubmitterRoutingRule[];
}

/** Where a layer's people come from, for assignee types that explain nothing themselves. */
export function describeAssigneeSource(layer: ResolvableLayer): string {
  const assignee = layer.assignee;
  const value = (assignee.value ?? "").trim();
  switch (assignee.type) {
    case "user": return `A fixed person set on the workflow page (${value || "none"}). The routing page is not used for this layer.`;
    case "users": return "A fixed list of people set on the workflow page. The routing page is not used for this layer.";
    case "distribution-list": return `The members of ${value || "a distribution list"}. The routing page is not used for this layer.`;
    case "field-reference": return `Whatever was answered in the form's "${stripFieldReference(value)}" question. The routing page is not used for this layer.`;
    case "department-approver": return "The Department Approver Directory entry for the submitted department.";
    default: return `Layer assignee type "${assignee.type}".`;
  }
}

interface RoutedAnswer {
  routed: string[];
  routedPrimary: string;
  routingProblem?: string;
  how?: string;
  /** Assignee type handed to `addStandIns`; a distribution list gets none. */
  standInType: string;
}

/**
 * Who approves the employee a submission is about, by the routing page.
 *
 * For a submission with no usable submitter address — a public link — the
 * employee on the form is the only person there is to route from.
 */
async function routeFromFormSubject(item: Record<string, unknown>, ports: RoutingInspectPorts): Promise<RoutedAnswer> {
  const subject = await ports.lookupSubject(item);
  if (!subject) {
    return {
      routed: [],
      routedPrimary: "",
      routingProblem: "The employee on the form is not in the Approval Directory (checked staff number, email and name), so the routing page has no approver for them.",
      standInType: "user",
    };
  }
  const who = subject.name || subject.email;
  const approver = subject.approverEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(approver)) {
    return { routed: [], routedPrimary: "", routingProblem: `${who} has no approver on the routing page.`, standInType: "user" };
  }
  return {
    routed: [approver],
    routedPrimary: approver,
    how: `Routing page (Approval Directory): ${who}, taken from the form's answers, is approved by ${approver}.`,
    standInType: "user",
  };
}

/** The shared resolver's answer, or the routing page's for a "Department approver" step. */
async function routeThroughResolver(
  layer: InspectableLayer,
  item: Record<string, unknown>,
  ports: RoutingInspectPorts,
): Promise<RoutedAnswer> {
  // A "Department Approver" layer reads the old Department Approver Directory
  // list. The routing page (Approval Directory) is the source of truth, so the
  // check follows "who approves this person" from the submitter instead,
  // exactly as a routing-page layer would.
  const followsRoutingPage = layer.assignee.type === "department-approver";
  if (followsRoutingPage && !isPersonEmail(valueToText(item.SubmittedBy))) {
    return routeFromFormSubject(item, ports);
  }

  const layerToResolve: ResolvableLayer = followsRoutingPage
    ? { ...layer, assignee: { type: "chain", startFrom: "submitter", value: "", hops: 1, fallback: { mode: "park" } } }
    : layer;
  const standInType = layerToResolve.assignee.type;
  const result = await ports.resolveLayer(layerToResolve, item);
  const explanation = followsRoutingPage && result.explanation
    ? `Routing page (Approval Directory): ${result.explanation}`
    : result.explanation;
  if (result.error) return { routed: [], routedPrimary: "", routingProblem: result.error, standInType };
  if (result.parked) return { routed: [], routedPrimary: "", routingProblem: result.parked.reason, standInType };
  // A fallback is not the routing page's answer: the approval line could not
  // be followed, so whoever is saved may have come from the same fallback. Say
  // why instead of calling that a match.
  if (result.emails.length && explanation?.startsWith("Fell back")) {
    return {
      routed: [],
      routedPrimary: "",
      routingProblem: `${explanation} Fix the Approval Directory on the Routing page, then check again.`,
      standInType,
    };
  }
  return {
    routed: result.emails,
    routedPrimary: result.email,
    how: explanation || describeAssigneeSource(layer),
    standInType,
  };
}

async function routeLayer(
  layer: InspectableLayer,
  item: Record<string, unknown>,
  ports: RoutingInspectPorts,
): Promise<RoutedAnswer> {
  // Submission applies a layer's submitter routing rules over its normal
  // assignee, so the check has to as well: a matching rule names the evaluator
  // outright, or sends the step to paper handling.
  const submitterRule = resolveEvaluationSubmitterRouting(layer, item);
  if (submitterRule?.manualPaper) {
    return {
      routed: [],
      routedPrimary: "",
      routingProblem: "A submitter routing rule sends this step to paper handling. Use Reconfigure this submission to change it.",
      standInType: "user",
    };
  }
  if (submitterRule?.email) {
    const routed = parseValidEmailList(submitterRule.email);
    return {
      routed,
      routedPrimary: routed[0] ?? "",
      how: "A submitter routing rule set on the workflow page names this evaluator.",
      ...(routed.length ? {} : { routingProblem: `The submitter routing rule names "${submitterRule.email}", which is not a valid email address.` }),
      standInType: "user",
    };
  }
  try {
    return await routeThroughResolver(layer, item, ports);
  } catch (error) {
    return {
      routed: [],
      routedPrimary: "",
      routingProblem: error instanceof Error ? error.message : "Routing could not be worked out.",
      standInType: "user",
    };
  }
}

/** Compares one layer's saved actors with what routing picks now. Reads only; writes nothing. */
export async function inspectLayerRouting(
  layer: InspectableLayer,
  item: Record<string, unknown>,
  currentLayerNumber: number,
  ports: RoutingInspectPorts,
): Promise<{ verdict: LayerRoutingVerdict; routedPrimary: string }> {
  const layerNumber = layer.layerNumber;
  const status = valueToText(item[`L${layerNumber}_Status`]);
  const saved = parseValidEmailList(item[`L${layerNumber}_Emails`] || valueToText(item[`L${layerNumber}_Email`]));
  const manualOverride = getWorkflowAssignment(item.WorkflowAssignmentData, layerNumber)?.source === "manual-override";
  let holdReason: string | undefined;
  if (isNeedsRoutingStatus(status)) {
    holdReason = "Waiting for someone to name the person (needs routing). Use Reconfigure this submission to set it.";
  } else if (isManualPaperStatus(status)) {
    holdReason = "On paper handling. Use Reconfigure this submission to change it.";
  }
  const waitingReason = isDeferredAssignee(layer.assignee) && layerNumber > currentLayerNumber
    ? "Depends on who acts on the earlier step, so it cannot be checked yet."
    : undefined;

  let routed: string[] = [];
  let routedPrimary = "";
  let routingProblem: string | undefined;
  let how: string | undefined;
  if (!manualOverride && !holdReason && !waitingReason) {
    const answer = await routeLayer(layer, item, ports);
    ({ routed, routedPrimary, routingProblem, how } = answer);
    const paperMailbox = ports.paperMailbox.trim().toLowerCase();
    if (
      routed.length
      && layer.manualPaperWhenSenderEmail !== false
      && !!paperMailbox
      && routedPrimary.trim().toLowerCase() === paperMailbox
    ) {
      routed = [];
      routingProblem = "Routing points to the paper mailbox, which needs paper handling. Use Reconfigure this submission.";
    }
    // Submission saves the routed person's stand-ins (a PA) on the step too, so
    // the comparison has to include them or every such step reads as wrong.
    if (routed.length) {
      const withStandIns = await addStandIns(
        { email: routedPrimary, name: "", emails: routed, ...(how ? { explanation: how } : {}) },
        answer.standInType,
        { lookupPerson: ports.lookupPerson },
      );
      routed = withStandIns.emails;
      how = withStandIns.explanation;
    }
  }

  const { kind, note } = classifyLayerRouting({ saved, routed, routingProblem, manualOverride, holdReason, waitingReason });
  return {
    verdict: {
      layer: layerNumber,
      title: layer.title || `Layer ${layerNumber}`,
      type: layer.type === "evaluation" ? "evaluation" : "approval",
      kind,
      saved,
      routed,
      ...(note ? { note } : {}),
      ...(how ? { how } : {}),
    },
    routedPrimary,
  };
}

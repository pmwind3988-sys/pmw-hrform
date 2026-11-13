/**
 * routingInspect.ts — server copy of `src/utils/routingInspect.ts`.
 *
 * Keep identical below this header; a test asserts it.
 */
import { classifyLayerRouting, findDirectoryPerson, type LayerRoutingVerdict } from "./routingCheck.js";
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
import {
  harvestFieldValue,
  isPersonEmail,
  optionsFromSubmittedData,
  readHarvestConfig,
  subjectFieldMapping,
} from "./directoryHarvest.js";
import { parseValidEmailList } from "./layerRecipients.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RoutingInspectPorts {
  /** The shared resolver with this side's ports; `layer` may be the substituted one-hop chain layer. */
  resolveLayer(layer: ResolvableLayer, item: Record<string, unknown>):
    Promise<{ email: string; emails: string[]; error?: string; parked?: { reason: string }; explanation?: string }>;
  /** What is needed to find the employee a public-link submission is about. */
  loadSubjectDirectory(): Promise<SubjectDirectory>;
  lookupPerson(email: string): Promise<DirectoryPerson | null>;
  /** Dedicated manual-paper address, lower-cased, or "". */
  paperMailbox: string;
}

/** One Approval Directory row, as much of it as finding a form's employee reads. */
export interface SubjectDirectoryRow {
  personEmail: string;
  personName: string;
  employeeId: string;
  approverEmail: string;
}

export interface SubjectDirectory {
  /** false when the Approval Directory could not be read. */
  usable: boolean;
  /** Active, confirmed rows. */
  rows: SubjectDirectoryRow[];
  /** Question name + title pairs from the form's survey JSON; [] when unknown. */
  questions: { name: string; title: string }[];
  /** The form's LayerConfig (for its directory-harvest mapping). */
  layerConfig: unknown;
}

/** What the check found, plus why it could not check when a read failed. */
export interface RoutingInspection {
  verdict: LayerRoutingVerdict;
  routedPrimary: string;
  /**
   * Set when routing could not be worked out because something could not be
   * read (a port threw, or the directory was unreadable), as opposed to routing
   * genuinely having no answer. The verdict is still `unresolved` with its
   * usual note; a caller that acts on "no answer" must not act on this.
   */
  checkFailed?: string;
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
  /** Something could not be read, so there is no answer to trust either way. */
  checkFailed?: string;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Who a submission is about, found from its own answers, and who approves them
 * according to the routing page.
 *
 * For a submission with no usable submitter address — a public link — the
 * employee on the form is the only person there is to route from. The form's
 * directory-harvest mapping says which questions hold them; without one the
 * questions are guessed from their labels. The staff number decides first, then
 * the address, then the name, the same order the harvester matches in.
 */
async function routeFromFormSubject(item: Record<string, unknown>, ports: RoutingInspectPorts): Promise<RoutedAnswer> {
  const none = (routingProblem: string, checkFailed?: string): RoutedAnswer => ({
    routed: [],
    routedPrimary: "",
    routingProblem,
    standInType: "user",
    ...(checkFailed ? { checkFailed } : {}),
  });
  let directory: SubjectDirectory;
  try {
    directory = await ports.loadSubjectDirectory();
  } catch (error) {
    const reason = errorText(error, "The Approval Directory could not be read.");
    return none(reason, reason);
  }

  // The form's own question titles say what each answer is far better than the
  // stored column names do, which often run words together ("employeeName").
  const options: { name: string; title: string }[] = [...directory.questions];
  for (const option of optionsFromSubmittedData(item)) {
    if (!options.some((existing) => existing.name === option.name)) options.push({ name: option.name, title: option.title ?? option.name });
  }
  const harvest = readHarvestConfig(directory.layerConfig);
  const mapping = subjectFieldMapping(directory.layerConfig, options);
  const submittedEmail = harvestFieldValue(item, mapping.emailField);
  const email = isPersonEmail(submittedEmail) ? submittedEmail.trim().toLowerCase() : "";
  const employeeId = harvestFieldValue(item, mapping.employeeIdField).trim();
  const name = harvestFieldValue(item, mapping.nameField).trim();
  if (!email && !employeeId && !name) {
    return none(
      "The form has no usable submitter address, and no employee email, staff number or name could be found to look up on the routing page."
        + ` Fields tried (${harvest ? "form settings" : "guessed from labels"}): name = ${mapping.nameField || "none"}, staff number = ${mapping.employeeIdField || "none"}, email = ${mapping.emailField || "none"}.`,
    );
  }

  if (!directory.usable) {
    const reason = "The Approval Directory could not be read.";
    return none(reason, reason);
  }
  const person = findDirectoryPerson(directory.rows, { email, employeeId, name });
  if (!person) {
    return none("The employee on the form is not in the Approval Directory (checked staff number, email and name), so the routing page has no approver for them.");
  }
  const approver = person.approverEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(approver)) {
    return none(`${person.personName || person.personEmail} has no approver on the routing page.`);
  }
  return {
    routed: [approver],
    routedPrimary: approver,
    how: `Routing page (Approval Directory): ${person.personName || person.personEmail}${person.employeeId ? ` (${person.employeeId})` : ""}, taken from the form's answers, is approved by ${approver}.`,
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
    const reason = errorText(error, "Routing could not be worked out.");
    return { routed: [], routedPrimary: "", routingProblem: reason, standInType: "user", checkFailed: reason };
  }
}

/** Compares one layer's saved actors with what routing picks now. Reads only; writes nothing. */
export async function inspectLayerRouting(
  layer: InspectableLayer,
  item: Record<string, unknown>,
  currentLayerNumber: number,
  ports: RoutingInspectPorts,
): Promise<RoutingInspection> {
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
  let checkFailed: string | undefined;
  if (!manualOverride && !holdReason && !waitingReason) {
    const answer = await routeLayer(layer, item, ports);
    ({ routed, routedPrimary, routingProblem, how, checkFailed } = answer);
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
      // addStandIns swallows a failed lookup (best effort at submission), so
      // note it here: a stand-in the check could not read is not a known answer.
      const lookupPerson = async (email: string) => {
        try {
          return await ports.lookupPerson(email);
        } catch (error) {
          checkFailed ??= `The Approval Directory could not be read for ${email}'s stand-ins: ${errorText(error, "unknown error")}`;
          throw error;
        }
      };
      const withStandIns = await addStandIns(
        { email: routedPrimary, name: "", emails: routed, ...(how ? { explanation: how } : {}) },
        answer.standInType,
        { lookupPerson },
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
    ...(checkFailed ? { checkFailed } : {}),
  };
}

/**
 * workflowPreflight.ts — "if somebody submitted this form now, would every step
 * reach a real person?", answered without submitting anything.
 *
 * Each step is resolved through the same shared resolver the submit paths use
 * (`resolveAssignee.ts`), once per situation that could change its answer:
 * every department a department-approver step can be given, every person a
 * reporting-line step can start from, every exception rule. The directory and
 * department lookups are served from lists the caller has already read, so the
 * whole check is reads only — nothing is written and no email is sent.
 *
 * Pure apart from `expandDistributionList`, which the caller supplies; the page
 * that shows the result is `src/pages/AdminWorkflowCheckPage.tsx`.
 */
import type { LayerConfigItem, LayerConfig, ManualBranch } from "../types";
import type { ApprovalDirectoryRow } from "./approvalDirectorySchema";
import { directoryEmailKey } from "./approvalDirectorySchema";
import type { DepartmentApproverEntry } from "./departmentApproverDirectory";
import { getDepartmentApproverLookupConfig } from "./departmentApproverLookup";
import { parseValidEmailList, resolveLayerRecipients } from "./layerRecipients";
import { listChoiceValues, type ListChoiceOption } from "./listChoiceOptions";
import {
  DirectoryGapError,
  resolveLayerAssignee,
  stripFieldReference,
  type AssigneeResolverPorts,
  type DirectoryPerson,
  type ResolvableLayer,
  type ResolvedLayerActors,
} from "./resolveAssignee";
import { forEachSurveyElement } from "./surveyWalk";
import { isSuperuserOnlyForm } from "./superuserOnlyForms";
import { renderActionRequestEmail } from "./workflowEmailTemplate";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CheckLevel = "fail" | "warn" | "info";
export type Verdict = "pass" | "warn" | "fail";

export interface CheckFinding {
  level: CheckLevel;
  message: string;
}

/** What one situation would do: who is asked, who gets the email, or why nobody. */
export type ScenarioOutcome = "routed" | "parked" | "paper" | "error" | "later";

export interface ScenarioGroup {
  outcome: ScenarioOutcome;
  /** The situations that end the same way — "Department: Finance", "Submitted by Ali". */
  cases: string[];
  /** Who may act. */
  actors: string[];
  /** Who the email is addressed to. */
  to: string[];
  /** Added because a directory row lets them act for someone (a PA). */
  standIns: string[];
  /** Why nobody, or how it was reached, in plain words. */
  detail: string;
}

export interface StepCheck {
  layerNumber: number;
  title: string;
  type: "approval" | "evaluation";
  authMode: "365" | "public";
  /** "Fixed person", "Department lookup on department", … */
  routingLabel: string;
  /** When the email goes out, when it is not straight away. */
  timing: string;
  groups: ScenarioGroup[];
  /** What was checked and is fine, in plain words. */
  passes: string[];
  findings: CheckFinding[];
  verdict: Verdict;
}

export interface WorkflowCheck {
  /** "" for the main workflow, else the branch name. */
  branch: string;
  branchLabel: string;
  steps: StepCheck[];
}

export interface ProfileCheck {
  key: string;
  label: string;
  /** False when the profile is switched off or expired, so nobody can submit through it. */
  live: boolean;
  workflows: WorkflowCheck[];
  findings: CheckFinding[];
  verdict: Verdict;
}

export interface FormCheck {
  title: string;
  slug: string;
  version: string;
  isPublic: boolean;
  testOnly: boolean;
  profiles: ProfileCheck[];
  /** What is fine about the form as a whole. */
  passes: string[];
  findings: CheckFinding[];
  verdict: Verdict;
}

/** What the company directory says an address is. `unknown`: it could not be asked. */
export type MailboxKind = "user" | "shared" | "group" | "missing" | "unknown";

/** The form's own record of emails it has sent, read from recent submissions. */
export interface EmailHistory {
  lastSentAt: string;
  lastFailedAt: string;
  lastError: string;
}

export interface PreflightProfileInput {
  key: string;
  label: string;
  status: string;
  expiresAt: string;
  /** The published survey with list-backed choices already filled in. */
  surveyJson: unknown;
  layerConfig: LayerConfig | null;
}

export interface PreflightFormInput {
  title: string;
  slug: string;
  version: string;
  isPublic: boolean;
  /** Internal names of the response list's columns; null when the list could not be read. */
  responseColumns: string[] | null;
  profiles: PreflightProfileInput[];
  /** null when the response list's email log could not be read. */
  emailHistory?: EmailHistory | null;
}

export interface PreflightEnvironment {
  directoryRows: ApprovalDirectoryRow[];
  /** False when the Approval Directory is missing or lacks its key columns. */
  directoryUsable: boolean;
  /**
   * Department Approver Directory rows per `departmentDirectoryKey(assignee)`;
   * null when that list could not be read.
   */
  departmentDirectories: Map<string, DepartmentApproverEntry[] | null>;
  expandDistributionList(formSlug: string, layerNumber: number, branch?: string): Promise<string[]>;
  /** The paper-handling mailbox; a step resolving to it is done on paper. */
  manualPaperAddress: string;
  now: Date;
  /**
   * Looks an address up in the company directory. Absent where there is no
   * directory to ask; the mailbox and sign-in checks are then skipped.
   */
  lookupMailbox?(email: string): Promise<MailboxKind>;
  /** The company's own mail domains, to tell a missing mailbox from an outside one. */
  companyDomains?: string[];
}

/** Most reporting-line starting points tried per step; a directory is a few hundred people. */
const MAX_SUBMITTER_CASES = 400;

/** Which department directory a department-approver step reads, list and role together. */
export function departmentDirectoryKey(assignee: Partial<{ listName: string; roleValue: string }>): string {
  const config = getDepartmentApproverLookupConfig(assignee);
  return `${config.listName}|${config.roleValue}`;
}

function verdictOf(findings: CheckFinding[], children: Verdict[] = []): Verdict {
  if (findings.some((f) => f.level === "fail") || children.includes("fail")) return "fail";
  if (findings.some((f) => f.level === "warn") || children.includes("warn")) return "warn";
  return "pass";
}

function isRoutable(row: ApprovalDirectoryRow): boolean {
  return row.isActive && row.confirmed;
}

function toPerson(row: ApprovalDirectoryRow): DirectoryPerson {
  return {
    email: row.personEmail,
    name: row.personName,
    department: row.department,
    position: row.position,
    approverEmail: row.approverEmail,
    delegateEmails: parseValidEmailList(row.delegateEmails ?? ""),
  };
}

/** Every question on the form, by name, with its choices when it has any. */
function surveyFields(surveyJson: unknown): Map<string, string[]> {
  const fields = new Map<string, string[]>();
  forEachSurveyElement(surveyJson, (element) => {
    const name = typeof element.name === "string" ? element.name : "";
    if (!name) return;
    const choices = Array.isArray(element.choices)
      ? listChoiceValues(element.choices.filter((choice): choice is ListChoiceOption =>
        typeof choice === "string" || (typeof choice === "object" && choice !== null && "value" in choice)))
      : [];
    fields.set(name, choices.filter(Boolean));
  });
  return fields;
}

/**
 * The resolver's directory ports, answered from rows already read. Mirrors
 * `createApprovalDirectoryReader`: only active, confirmed rows route, and a
 * role is matched on department and position.
 */
function directoryPorts(rows: ApprovalDirectoryRow[]): Required<Pick<AssigneeResolverPorts, "lookupPerson" | "lookupSubject" | "lookupRoleHolder">> {
  const byEmail = new Map<string, ApprovalDirectoryRow>();
  for (const row of rows) {
    const key = directoryEmailKey(row.personEmail);
    if (key && isRoutable(row) && !byEmail.has(key)) byEmail.set(key, row);
  }
  // SharePoint compares text without regard to case, so the lookups do too.
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return {
    lookupPerson: async (email) => {
      const row = byEmail.get(directoryEmailKey(email));
      return row ? toPerson(row) : null;
    },
    // A check has no form answers to find an employee from.
    lookupSubject: async () => null,
    lookupRoleHolder: async (department, role) => {
      const holder = rows.find((row) => isRoutable(row) && row.personEmail
        && same(row.department, department.trim()) && same(row.position, role.trim()));
      return holder ? { email: holder.personEmail, name: holder.personName } : null;
    },
  };
}

/**
 * The department-approver port, answered from the directory already read.
 * Mirrors `resolveDepartmentApproverEmail` in `DynamicFormPage.tsx` and
 * `ApprovalDashboard.tsx`: none, several, or a bad address all park the step.
 */
function departmentLookup(env: PreflightEnvironment): AssigneeResolverPorts["lookupDepartmentApprover"] {
  return async (layer, submittedData) => {
    const assignee = layer.assignee as unknown as { value: string; listName?: string; roleValue?: string };
    const config = getDepartmentApproverLookupConfig(assignee);
    const label = layer.title || `Layer ${layer.layerNumber}`;
    const department = String(submittedData[assignee.value.trim()] ?? "");
    if (!department) throw new DirectoryGapError(`${label} has no department to look an approver up with.`);
    const entries = env.departmentDirectories.get(departmentDirectoryKey(assignee));
    if (!entries) throw new DirectoryGapError(`${label} could not read the "${config.listName}" list.`);
    const matches = entries.filter((entry) => entry.department.toLowerCase() === department.toLowerCase());
    if (matches.length === 0) {
      throw new DirectoryGapError(`No ${config.roleValue} is listed for department "${department}".`);
    }
    if (matches.length > 1) {
      throw new DirectoryGapError(`More than one ${config.roleValue} is listed for department "${department}".`);
    }
    if (!EMAIL_RE.test(matches[0].approverEmail)) {
      throw new DirectoryGapError(`The ${config.roleValue} listed for department "${department}" has an invalid email.`);
    }
    return { email: matches[0].approverEmail, name: matches[0].approverName };
  };
}

interface Situation {
  label: string;
  data: Record<string, unknown>;
  submitterEmail?: string;
}

function describeRouting(layer: LayerConfigItem): string {
  const a = layer.assignee;
  switch (a.type) {
    case "user": return "One named person";
    case "users": return "Any one of several people";
    case "distribution-list": return "A distribution list";
    case "field-reference": return `The person entered in "${stripFieldReference(a.value)}"`;
    case "department-approver": return `Department lookup (${getDepartmentApproverLookupConfig(a).roleValue}) on "${a.value}"`;
    case "role-holder":
      return a.department === "fixed"
        ? `The ${a.role} of ${a.value}`
        : a.department === "from-field"
          ? `The ${a.role} of the department in "${a.value}"`
          : `The ${a.role} of the submitter's department`;
    case "chain": {
      const from = a.startFrom === "previous-actor" ? "the previous approver"
        : a.startFrom === "field" ? `the person in "${a.value}"` : "the submitter";
      return `${a.hops} step${a.hops === 1 ? "" : "s"} up the reporting line from ${from}`;
    }
    default: return "Unknown routing";
  }
}

function describeTiming(layer: LayerConfigItem): string {
  if (layer.type !== "evaluation" || !layer.emailSchedule) return "";
  const schedule = layer.emailSchedule as { mode?: string; customDays?: number };
  if (schedule.mode === "three_months") return "Email held until 3 months after the step opens";
  if (schedule.mode === "custom_days") return `Email held until ${schedule.customDays ?? 0} day(s) after the step opens`;
  return "";
}

/** The situations worth trying for one step, and anything wrong with how it reads the form. */
function situationsFor(
  layer: LayerConfigItem,
  fields: Map<string, string[]>,
  env: PreflightEnvironment,
  findings: CheckFinding[],
): Situation[] {
  const a = layer.assignee;
  const routable = env.directoryRows.filter((row) => isRoutable(row) && EMAIL_RE.test(row.personEmail));
  const fromChoices = (field: string, label: string, also?: (value: string) => Record<string, unknown>): Situation[] => {
    if (!fields.has(field)) {
      findings.push({ level: "fail", message: `Reads the question "${field}", which is not on the published form.` });
      return [];
    }
    const choices = fields.get(field) ?? [];
    if (choices.length === 0) {
      findings.push({
        level: "warn",
        message: `"${field}" has no fixed list of answers, so every possible answer could not be tried.`,
      });
      return [];
    }
    return choices.map((value) => ({ label: `${label}: ${value}`, data: { [field]: value, ...(also?.(value) ?? {}) } }));
  };
  const everySubmitter = (): Situation[] => {
    if (!env.directoryUsable) {
      findings.push({ level: "fail", message: "Needs the Approval Directory, which could not be read." });
      return [];
    }
    if (routable.length > MAX_SUBMITTER_CASES) {
      findings.push({ level: "info", message: `Tried the first ${MAX_SUBMITTER_CASES} of ${routable.length} people.` });
    }
    return routable.slice(0, MAX_SUBMITTER_CASES).map((row) => ({
      label: `Submitted by ${row.personName || row.personEmail}`,
      submitterEmail: row.personEmail,
      data: { department: row.department, Department: row.department },
    }));
  };

  switch (a.type) {
    case "department-approver":
      return fromChoices(a.value.trim(), "Department");
    case "field-reference": {
      const field = stripFieldReference(a.value);
      if (!fields.has(field)) {
        findings.push({ level: "fail", message: `Reads the question "${field}", which is not on the published form.` });
        return [];
      }
      const choices = fields.get(field) ?? [];
      if (choices.length > 0) return fromChoices(field, field);
      findings.push({ level: "info", message: `Goes to whatever address the submitter types into "${field}", so it cannot be checked ahead of time.` });
      return [];
    }
    case "role-holder":
      if (a.department === "from-field") return fromChoices(stripFieldReference(a.value), "Department");
      if (a.department === "from-submitter") return everySubmitter();
      return [{ label: "Every submission", data: {} }];
    case "chain":
      if (a.startFrom === "field") {
        const field = stripFieldReference(a.value);
        if (!fields.has(field)) {
          findings.push({ level: "fail", message: `Reads the question "${field}", which is not on the published form.` });
          return [];
        }
        return routable.slice(0, MAX_SUBMITTER_CASES).map((row) => ({
          label: `"${field}" is ${row.personName || row.personEmail}`,
          data: { [field]: row.personEmail },
        }));
      }
      return everySubmitter();
    default:
      return [{ label: "Every submission", data: {} }];
  }
}

function groupKey(group: Omit<ScenarioGroup, "cases">): string {
  return [group.outcome, group.actors.join(","), group.to.join(","), group.detail].join("|");
}

function addToGroups(groups: ScenarioGroup[], label: string, group: Omit<ScenarioGroup, "cases">): void {
  const key = groupKey(group);
  const existing = groups.find((candidate) => groupKey(candidate) === key);
  if (existing) existing.cases.push(label);
  else groups.push({ ...group, cases: [label] });
}

function outcomeOf(
  resolved: ResolvedLayerActors,
  layer: LayerConfigItem,
  env: PreflightEnvironment,
): Omit<ScenarioGroup, "cases"> {
  if (resolved.error) {
    return { outcome: "error", actors: [], to: [], standIns: [], detail: resolved.error };
  }
  if (resolved.parked) {
    return {
      outcome: "parked",
      actors: [],
      to: parseValidEmailList(resolved.deliverTo),
      standIns: [],
      detail: resolved.parked.reason,
    };
  }
  const actors = resolved.emails;
  if (actors.length === 0 && !resolved.email) {
    return { outcome: "error", actors: [], to: [], standIns: [], detail: "Resolves to nobody: no address is set." };
  }
  const paper = !!env.manualPaperAddress
    && layer.manualPaperWhenSenderEmail !== false
    && resolved.email.trim().toLowerCase() === env.manualPaperAddress.trim().toLowerCase();
  return {
    outcome: paper ? "paper" : "routed",
    actors,
    to: paper ? [resolved.email] : resolveLayerRecipients(actors, layer),
    standIns: (resolved.standIns ?? []).map((s) => s.email),
    detail: paper ? "Handled on paper: the paper-handling mailbox is told instead of a reviewer." : resolved.explanation ?? "",
  };
}

/** The exceptions a step makes for named people, each as its own situation. */
function ruleGroups(layer: LayerConfigItem, fields: Map<string, string[]>, findings: CheckFinding[], groups: ScenarioGroup[]): void {
  for (const rule of layer.submitterRoutingRules ?? []) {
    const conditions: string[] = [];
    const checkField = (field: string | undefined, value: string | undefined, what: string) => {
      if (!value?.trim()) return;
      if (field && !fields.has(field)) {
        findings.push({ level: "fail", message: `Exception "${rule.label}" reads "${field}", which is not on the published form.` });
      }
      conditions.push(`${what} is ${value.trim()}`);
    };
    if (rule.emailValue?.trim()) conditions.push(`submitter or "${rule.emailField || "email"}" is ${rule.emailValue.trim()}`);
    if (rule.emailField && rule.emailValue?.trim() && !fields.has(rule.emailField)) {
      findings.push({ level: "fail", message: `Exception "${rule.label}" reads "${rule.emailField}", which is not on the published form.` });
    }
    checkField(rule.employeeIdField, rule.employeeIdValue, `"${rule.employeeIdField || "staff ID"}"`);
    checkField(rule.userIdField, rule.userIdValue, `"${rule.userIdField || "user ID"}"`);
    checkField(rule.fullNameField, rule.fullNameValue, `"${rule.fullNameField || "name"}"`);
    if (conditions.length === 0) {
      findings.push({ level: "warn", message: `Exception "${rule.label}" has no condition, so it never applies.` });
      continue;
    }
    // A rule whose value names no field is skipped by the matcher.
    const unnamed = (rule.employeeIdValue?.trim() && !rule.employeeIdField)
      || (rule.userIdValue?.trim() && !rule.userIdField)
      || (rule.fullNameValue?.trim() && !rule.fullNameField);
    if (unnamed) {
      findings.push({ level: "warn", message: `Exception "${rule.label}" has a value but no question to compare it with, so it never matches.` });
    }
    const label = `Exception "${rule.label}": ${conditions.join(" and ")}`;
    if (rule.action === "assign-evaluator") {
      const email = (rule.evaluatorEmail ?? "").trim();
      if (!EMAIL_RE.test(email)) {
        findings.push({ level: "fail", message: `Exception "${rule.label}" sends to "${email}", which is not a valid email address.` });
        addToGroups(groups, label, { outcome: "error", actors: [], to: [], standIns: [], detail: "Invalid address on the exception." });
      } else {
        addToGroups(groups, label, { outcome: "routed", actors: [email], to: resolveLayerRecipients([email], layer), standIns: [], detail: "Set by this exception." });
      }
    } else {
      addToGroups(groups, label, { outcome: "paper", actors: [], to: [], standIns: [], detail: "Handled on paper by this exception." });
    }
  }
}

async function checkStep(
  form: PreflightFormInput,
  layer: LayerConfigItem,
  branch: string,
  fields: Map<string, string[]>,
  previous: StepCheck | null,
  env: PreflightEnvironment,
): Promise<StepCheck> {
  const findings: CheckFinding[] = [];
  const groups: ScenarioGroup[] = [];
  const n = layer.layerNumber;
  const ports: AssigneeResolverPorts = {
    ...directoryPorts(env.directoryRows),
    lookupDepartmentApprover: departmentLookup(env),
    expandDistributionList: (_target, _address) => env.expandDistributionList(form.slug, n, branch || undefined),
  };

  // Whoever acted on the step before decides where a "previous approver" chain starts.
  if (layer.assignee.type === "chain" && layer.assignee.startFrom === "previous-actor") {
    const starters = new Set<string>();
    for (const group of previous?.groups ?? []) {
      if (group.outcome === "routed") group.actors.forEach((actor) => starters.add(actor));
    }
    if (starters.size === 0) {
      findings.push({ level: "warn", message: "Starts from whoever decided the step before, and that step never reaches anyone in this check." });
    }
    for (const starter of starters) {
      const resolved = await resolveLayerAssignee(layer as ResolvableLayer, {}, ports, {
        rejectNonEmailAlways: true,
        context: { previousActorEmail: starter },
      });
      addToGroups(groups, `Previous step decided by ${starter}`, outcomeOf(resolved, layer, env));
    }
  } else {
    for (const situation of situationsFor(layer, fields, env, findings)) {
      const resolved = await resolveLayerAssignee(layer as ResolvableLayer, situation.data, ports, {
        rejectNonEmailAlways: true,
        context: { submitterEmail: situation.submitterEmail ?? "" },
      });
      addToGroups(groups, situation.label, outcomeOf(resolved, layer, env));
    }
  }
  ruleGroups(layer, fields, findings, groups);

  // Who the email goes to on top of the person deciding.
  const notify = layer.notifyEmails ?? [];
  const badNotify = notify.filter((email) => !EMAIL_RE.test(email.trim()));
  if (badNotify.length > 0) {
    findings.push({ level: "fail", message: `Copy-to address${badNotify.length > 1 ? "es" : ""} not valid: ${badNotify.join(", ")}.` });
  }
  if (layer.notifyRecipientMode === "notify-only" && parseValidEmailList(notify).length === 0) {
    findings.push({ level: "fail", message: "Set to email a shared mailbox instead of the reviewer, but no mailbox is named, so the email goes to the reviewer." });
  }

  const errors = groups.filter((g) => g.outcome === "error");
  const parked = groups.filter((g) => g.outcome === "parked");
  const routed = groups.filter((g) => g.outcome === "routed" || g.outcome === "paper");
  for (const group of errors) {
    findings.push({ level: "fail", message: `Submission would be refused for ${group.cases.length} case(s): ${group.detail}` });
  }
  if (parked.length > 0) {
    const count = parked.reduce((sum, g) => sum + g.cases.length, 0);
    findings.push({
      level: routed.length === 0 ? "fail" : "warn",
      message: `${count} case(s) would wait for an admin to route by hand ("Needs Routing").`,
    });
  }
  if (groups.length === 0 && !findings.some((f) => f.level === "fail" || f.level === "info")) {
    findings.push({ level: "fail", message: "Could not find anyone this step would go to." });
  }

  // The sign-off prints the decider's name and post from the Approval Directory.
  const unlisted = new Set<string>();
  const people = directoryPorts(env.directoryRows);
  // A paper step is signed on paper, so only steps decided online need a row.
  for (const group of routed.filter((g) => g.outcome === "routed")) {
    for (const actor of group.actors) {
      if (!(await people.lookupPerson(actor))) unlisted.add(actor);
    }
  }
  if (unlisted.size > 0 && env.directoryUsable) {
    findings.push({
      level: "info",
      message: `Not in the Approval Directory, so their sign-off shows the step title instead of their post: ${[...unlisted].join(", ")}.`,
    });
  }
  if (form.title && isSuperuserOnlyForm(form.title)) {
    findings.push({ level: "info", message: "Test form: a real test run sends every step to the tester instead." });
  }

  // Public steps work through a link that can stop working.
  if (layer.authMode === "public") {
    const expiry = layer.tokenExpiry;
    if (expiry?.mode === "field" && (expiry.sourceLayer ?? 0) === 0 && expiry.field && !fields.has(expiry.field)) {
      findings.push({ level: "fail", message: `The link expiry reads "${expiry.field}", which is not on the published form.` });
    }
    if ((!expiry || expiry.mode === "fixed") && layer.tokenExpiresAt && Date.parse(layer.tokenExpiresAt) <= env.now.getTime()) {
      findings.push({ level: "fail", message: `The reviewer link expired on ${layer.tokenExpiresAt.slice(0, 10)}, so it would open to an error.` });
    }
  }
  if (layer.type === "evaluation" && (layer.surveyElements ?? []).length === 0) {
    findings.push({ level: "warn", message: "Evaluation step with no evaluation questions: the reviewer only confirms." });
  }

  // Where the decision is written. Missing core columns break the step outright.
  const columns = form.responseColumns;
  if (columns) {
    const has = (name: string) => columns.includes(name);
    const core = [`L${n}_Status`, `L${n}_Email`].filter((name) => !has(name));
    if (core.length > 0) {
      findings.push({ level: "fail", message: `The response list has no ${core.join(" / ")} column, so this step cannot be saved. Republish the form.` });
    }
    const extra = [`L${n}_Emails`, `L${n}_NotifyEmails`, `L${n}_ActedBy`, `L${n}_ActedByName`, `L${n}_ActedByPosition`, `L${n}_SignedAt`, `L${n}_Signature`]
      .filter((name) => !has(name));
    if (extra.length > 0) {
      findings.push({ level: "warn", message: `Older response list: missing ${extra.join(", ")}. It still works; republish to record everything.` });
    }
    if (groups.some((g) => g.standIns.length > 0) && !has(`L${n}_OnBehalfOf`)) {
      findings.push({ level: "warn", message: `A stand-in (PA) can act here, but the list has no L${n}_OnBehalfOf column to record whose behalf they signed on. Republish the form.` });
    }
  }

  // What came out fine, said as plainly as the problems are.
  const passes: string[] = [];
  const caseCount = groups.reduce((sum, g) => sum + g.cases.length, 0);
  const reached = groups.filter((g) => g.outcome === "routed").reduce((sum, g) => sum + g.cases.length, 0);
  const onPaper = groups.filter((g) => g.outcome === "paper").reduce((sum, g) => sum + g.cases.length, 0);
  if (caseCount > 0 && reached === caseCount) {
    passes.push(caseCount === 1 ? "Reaches a real person" : `Reaches a real person in all ${caseCount} cases tried`);
  } else if (reached > 0) {
    passes.push(`Reaches a real person in ${reached} of ${caseCount} cases tried`);
  }
  if (onPaper > 0) passes.push(`${onPaper} case(s) handled on paper, as configured`);
  if (!findings.some((f) => f.message.includes("not on the published form"))) {
    const readsQuestion = ["department-approver", "field-reference", "role-holder", "chain"].includes(layer.assignee.type)
      || (layer.submitterRoutingRules ?? []).length > 0;
    if (readsQuestion) passes.push("Every question it reads is on the published form");
  }
  if (notify.length > 0 && badNotify.length === 0) passes.push("Copy-to addresses are valid");
  if (routed.some((g) => g.outcome === "routed") && unlisted.size === 0 && env.directoryUsable) {
    passes.push("Every reviewer is in the Approval Directory, so the sign-off shows their name and post");
  }
  if (columns && !findings.some((f) => f.message.includes("response list"))) {
    passes.push("The response list has every column this step writes");
  }
  if (layer.authMode === "public" && !findings.some((f) => f.message.includes("link"))) {
    passes.push("The reviewer link is still valid");
  }
  if (layer.type === "evaluation" && (layer.surveyElements ?? []).length > 0) {
    passes.push(`Has ${layer.surveyElements.length} evaluation question(s)`);
  }
  if (describeTiming(layer)) passes.push(describeTiming(layer));

  // Would the email arrive, and could the people asked open the step? Nothing is sent.
  const routedGroups = groups.filter((g) => g.outcome === "routed");
  const recipients = [...new Set(routedGroups.flatMap((g) => g.to.map((e) => e.toLowerCase())))];
  const deciders = [...new Set(routedGroups.flatMap((g) => g.actors.map((e) => e.toLowerCase())))];
  if (recipients.length > 0) {
    try {
      renderActionRequestEmail({
        formTitle: form.title,
        submittedBy: "check",
        responseItemId: "CHECK",
        layer: n,
        totalLayers: n,
        layerType: layer.type,
        reviewLink: "https://example.invalid",
      });
      passes.push("The email builds correctly (built here, not sent)");
    } catch (error) {
      findings.push({ level: "fail", message: `The email could not be built: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  const lookupMailbox = env.lookupMailbox;
  if (lookupMailbox && (recipients.length > 0 || deciders.length > 0)) {
    const kinds = new Map<string, MailboxKind>();
    await Promise.all([...new Set([...recipients, ...deciders])].map(async (email) => {
      kinds.set(email, await lookupMailbox(email).catch((): MailboxKind => "unknown"));
    }));
    const company = new Set((env.companyDomains ?? []).map((d) => d.toLowerCase()));
    const insideCompany = (email: string) => company.has(email.split("@")[1] ?? "");
    const list = (emails: string[]) => emails.join(", ");

    if ([...kinds.values()].includes("unknown")) {
      findings.push({ level: "info", message: "The company directory could not be reached, so mailboxes and sign-ins were not confirmed." });
    } else {
      const bounce = recipients.filter((e) => kinds.get(e) === "missing" && insideCompany(e));
      const outside = recipients.filter((e) => kinds.get(e) === "missing" && !insideCompany(e));
      if (bounce.length > 0) {
        findings.push({ level: "fail", message: `No mailbox exists for ${list(bounce)}, so the email would bounce.` });
      }
      if (outside.length > 0) {
        findings.push({ level: "warn", message: `${list(outside)} is outside the company directory, so delivery cannot be confirmed from here.` });
      }
      if (bounce.length === 0 && outside.length === 0) {
        passes.push(recipients.length === 1
          ? "The email would be delivered: the address belongs to a real account (nothing was sent)"
          : `The email would be delivered: all ${recipients.length} addresses belong to real accounts (nothing was sent)`);
      }

      if (layer.authMode === "public") {
        passes.push("The reviewer opens it from the emailed link, with no sign-in needed");
      } else if (deciders.length > 0) {
        const shared = deciders.filter((e) => kinds.get(e) === "shared");
        const noAccount = deciders.filter((e) => kinds.get(e) === "missing");
        const groupActors = deciders.filter((e) => kinds.get(e) === "group");
        if (shared.length > 0) {
          findings.push({ level: "fail", message: `${list(shared)} is a shared or disabled mailbox. Nobody can sign in as it, so it cannot open this step.` });
        }
        if (noAccount.length > 0) {
          findings.push({ level: "fail", message: `${list(noAccount)} has no Microsoft 365 account here, so they cannot sign in to open this step.` });
        }
        if (groupActors.length > 0) {
          findings.push({ level: "warn", message: `${list(groupActors)} is a group, not a person, so it cannot sign in to open this step.` });
        }
        if (shared.length + noAccount.length + groupActors.length === 0) {
          passes.push(deciders.length === 1
            ? "The reviewer has a Microsoft 365 account, so they can sign in and open this step"
            : `All ${deciders.length} reviewers have a Microsoft 365 account, so they can sign in and open this step`);
        }
      }
    }
  }

  // Problems first, so the case that needs fixing is the one read first.
  const order: ScenarioOutcome[] = ["error", "parked", "routed", "paper", "later"];
  groups.sort((a, b) => order.indexOf(a.outcome) - order.indexOf(b.outcome));

  return {
    layerNumber: n,
    title: layer.title || `Step ${n}`,
    type: layer.type,
    authMode: layer.authMode,
    routingLabel: describeRouting(layer),
    timing: describeTiming(layer),
    groups,
    passes,
    findings,
    verdict: verdictOf(findings),
  };
}

async function checkWorkflow(
  form: PreflightFormInput,
  layers: LayerConfigItem[],
  branch: ManualBranch | null,
  fields: Map<string, string[]>,
  env: PreflightEnvironment,
): Promise<WorkflowCheck> {
  const steps: StepCheck[] = [];
  const ordered = [...layers].sort((a, b) => a.layerNumber - b.layerNumber);
  for (const layer of ordered) {
    steps.push(await checkStep(form, layer, branch?.name ?? "", fields, steps[steps.length - 1] ?? null, env));
  }
  return { branch: branch?.name ?? "", branchLabel: branch ? branch.label || branch.name : "", steps };
}

async function checkProfile(form: PreflightFormInput, profile: PreflightProfileInput, env: PreflightEnvironment): Promise<ProfileCheck> {
  const findings: CheckFinding[] = [];
  const fields = surveyFields(profile.surveyJson);
  const expired = !!profile.expiresAt && Date.parse(profile.expiresAt) <= env.now.getTime();
  const off = profile.status.trim().toLowerCase() === "off";
  if (off) findings.push({ level: "info", message: "This profile is switched off, so nobody can submit through it." });
  if (expired) findings.push({ level: "info", message: `This profile expired on ${profile.expiresAt.slice(0, 10)}.` });
  if (fields.size === 0) findings.push({ level: "fail", message: "The published form has no questions, or could not be read." });

  const config = profile.layerConfig;
  const workflows: WorkflowCheck[] = [];
  const branches = config?.manualBranches ?? [];
  if (branches.length > 0) {
    findings.push({ level: "info", message: "Starts with no reviewer: an admin picks a branch in All Submissions, which then routes as below." });
    for (const branch of branches) workflows.push(await checkWorkflow(form, branch.layers ?? [], branch, fields, env));
  } else if ((config?.layers ?? []).length > 0) {
    workflows.push(await checkWorkflow(form, config?.layers ?? [], null, fields, env));
  } else {
    findings.push({ level: "info", message: "No approval or evaluation steps: a submission is simply recorded." });
  }

  for (const rule of config?.routing ?? []) {
    if (rule.conditionField && !fields.has(rule.conditionField)) {
      findings.push({ level: "fail", message: `Step skipping reads "${rule.conditionField}", which is not on the published form.` });
    }
  }

  const live = !off && !expired;
  const stepVerdicts = workflows.flatMap((w) => w.steps.map((s) => s.verdict));
  return {
    key: profile.key,
    label: profile.label || profile.key,
    live,
    workflows,
    findings,
    verdict: verdictOf(findings, stepVerdicts),
  };
}

export async function checkForm(form: PreflightFormInput, env: PreflightEnvironment): Promise<FormCheck> {
  const findings: CheckFinding[] = [];
  if (!form.responseColumns) {
    findings.push({ level: "fail", message: `The response list "${form.title}" could not be read, so no submission could be saved.` });
  } else {
    const missing = ["FormStatus", "CurrentLayer"].filter((name) => !form.responseColumns?.includes(name));
    const anySteps = form.profiles.some((p) => (p.layerConfig?.layers?.length ?? 0) > 0 || (p.layerConfig?.manualBranches?.length ?? 0) > 0);
    if (anySteps && missing.length > 0) {
      findings.push({ level: "fail", message: `The response list has no ${missing.join(" / ")} column, which the workflow needs. Republish the form.` });
    }
  }
  if (form.profiles.length === 0) {
    findings.push({ level: "fail", message: `Version ${form.version} has no published copy, so the form link would not open.` });
  }

  const profiles: ProfileCheck[] = [];
  for (const profile of form.profiles) profiles.push(await checkProfile(form, profile, env));

  // The form's own record of real deliveries: proof the sending side works.
  const passes: string[] = [];
  const hasSteps = profiles.some((p) => p.workflows.some((w) => w.steps.length > 0));
  const history = form.emailHistory;
  if (hasSteps && history) {
    const day = (iso: string) => iso.slice(0, 10);
    if (history.lastFailedAt && history.lastFailedAt > history.lastSentAt) {
      findings.push({
        level: "warn",
        message: `The most recent email from this form failed (${day(history.lastFailedAt)})${history.lastError ? `: ${history.lastError}` : "."}`,
      });
    } else if (history.lastSentAt) {
      passes.push(`Emails from this form are being delivered: the last one went out ${day(history.lastSentAt)}`);
    } else {
      findings.push({ level: "info", message: "No email has gone out from this form yet, so delivery is not proven by a real send." });
    }
  }

  return {
    title: form.title,
    slug: form.slug,
    version: form.version,
    isPublic: form.isPublic,
    testOnly: isSuperuserOnlyForm(form.title),
    profiles,
    passes,
    findings,
    // A switched-off profile cannot fail anybody, so it does not colour the form.
    verdict: verdictOf(findings, profiles.filter((p) => p.live).map((p) => p.verdict)),
  };
}

export interface PreflightTally {
  forms: number;
  steps: number;
  pass: number;
  warn: number;
  fail: number;
}

/** Step counts across every live profile. */
export function tallyChecks(forms: FormCheck[]): PreflightTally {
  const tally: PreflightTally = { forms: forms.length, steps: 0, pass: 0, warn: 0, fail: 0 };
  for (const form of forms) {
    for (const profile of form.profiles) {
      if (!profile.live) continue;
      for (const workflow of profile.workflows) {
        for (const step of workflow.steps) {
          tally.steps += 1;
          tally[step.verdict] += 1;
        }
      }
    }
  }
  return tally;
}

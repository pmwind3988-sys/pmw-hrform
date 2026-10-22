/**
 * resolveAssignee.ts — turns one layer's `assignee` into the people who may act.
 *
 * This logic previously existed three times over (`api/submit-form.ts`,
 * `src/pages/DynamicFormPage.tsx`, `src/components/builder/ApprovalDashboard.tsx`)
 * and had already drifted between the copies. It lives here once, as a pure
 * function: everything that needs the network — the directory lookup and
 * distribution-list expansion — arrives through `ports`, because the browser
 * reaches SharePoint over REST while the serverless routes use Graph.
 *
 * Failures are **returned, not thrown**. The submit paths turn `error` into a
 * thrown error that aborts the submission; the dashboard shows it beside the
 * layer. Returning lets both keep their behaviour without the resolver knowing
 * which caller it is serving.
 *
 * `api/_utils/resolveAssignee.ts` is the server-side copy of this file; api/
 * cannot import from src/. Keep the two in step.
 */
import { parseValidEmailList, type OnBehalfOfRecord } from "./layerRecipients.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AssigneeAuthMode = "365" | "public";

export interface ResolvableAssignee {
  type: string;
  value: string;
  /** chain: where to start counting, how far to walk, what to do if it runs out. */
  startFrom?: "submitter" | "previous-actor" | "field";
  hops?: number;
  skipSelf?: boolean;
  fallback?: { mode: "department-hod" | "fixed" | "park"; email?: string };
  /** role-holder: where the department comes from, and the role to match. */
  department?: "fixed" | "from-submitter" | "from-field";
  role?: string;
}

/** One row of the `Approval Directory` list: who a person is, and who signs for them. */
export interface DirectoryPerson {
  email: string;
  name: string;
  department: string;
  position: string;
  /** Who approves this person. Empty means top of the line. */
  approverEmail: string;
  /**
   * Who may act on this person's behalf (`DelegateEmails`) — a PA for the CEO.
   * Absent on directories without the column, which means nobody.
   */
  delegateEmails?: string[];
}

/** Someone allowed to act on a layer only because they stand in for one of its actors. */
export interface StandIn {
  email: string;
  /** The actor whose directory row names them. */
  forEmail: string;
  forName: string;
}

/**
 * What the resolver knows about the submission beyond its answers. Chain
 * routing needs identities that are not in the form body: who submitted, and
 * who actually acted on the preceding layer.
 */
export interface ResolutionContext {
  /** The submitter's address. "GUEST" for public submissions, i.e. unusable. */
  submitterEmail?: string;
  /**
   * Whoever acted on the layer before this one — `L{n-1}_ActedBy`, falling back
   * to `L{n-1}_Email` when the actor was never recorded (public and paper
   * layers historically did not record one).
   */
  previousActorEmail?: string;
}

/** Hard ceiling on chain walking, so a mis-typed directory cannot spin. */
export const MAX_CHAIN_HOPS = 10;

export interface ResolvableLayer {
  layerNumber: number;
  title?: string;
  authMode: AssigneeAuthMode;
  assignee: ResolvableAssignee;
}

/**
 * A layer's resolved actors. `email` is the primary written to `L{n}_Email`, so
 * every existing reader keeps working; `emails` is the full any-one-of set
 * written to `L{n}_Emails`, longer than one for a shared layer or expanded list.
 */
export interface ResolvedLayerActors {
  email: string;
  name: string;
  emails: string[];
  /** Operator-facing reason the layer has no usable actor. */
  error?: string;
  /**
   * Where to send this layer's notice when there is no actor to address it to.
   *
   * Kept separate from `emails` on purpose: a distribution list that could not
   * be expanded is still worth mailing so the team sees the submission arrive,
   * but it is not a sign-in identity, so it must never become someone who can
   * approve. Actors and recipients are different questions.
   */
  deliverTo?: string[];
  /**
   * Set when routing could not be decided but the submission must still be
   * kept. Distinct from `error`: a parked layer is a question for an admin, not
   * a broken submission, and the record is saved either way.
   */
  parked?: { reason: string };
  /**
   * How this actor was chosen, in plain words — "Ali → Siti (HOD, Engineering)".
   * Shown on the submission so an admin learns the rules by watching them fire
   * rather than by reading configuration.
   */
  explanation?: string;
  /**
   * People added to `emails` because an actor's directory row says they may
   * act on that actor's behalf. Already included in `emails`; listed apart so
   * the caller can say so in the notice.
   */
  standIns?: StandIn[];
}

export interface AssigneeResolverPorts {
  /** Department directory lookup. Rejects to signal "no usable approver". */
  lookupDepartmentApprover(
    layer: ResolvableLayer,
    submittedData: Record<string, unknown>,
  ): Promise<{ email: string; name: string }>;
  /**
   * Expands a distribution list to its members. The browser cannot do this —
   * a delegated token lacks Group.Read.All — so it proxies to /api/expand-group.
   */
  expandDistributionList(layer: ResolvableLayer, address: string): Promise<string[]>;
  /**
   * One person's `Approval Directory` row, or null when they are not listed.
   * Absent on callers that predate the directory; a chain layer then parks.
   */
  lookupPerson?(email: string): Promise<DirectoryPerson | null>;
  /**
   * The employee a submission is about, found from its own answers (staff
   * number, address, name), or null. Only asked when the submitter has no
   * address the directory knows — a public link, or a person whose row has a
   * name and no email — so the reporting line can still be followed.
   */
  lookupSubject?(submittedData: Record<string, unknown>): Promise<DirectoryPerson | null>;
  /** Whoever holds `role` in `department`, or null when nobody does. */
  lookupRoleHolder?(department: string, role: string): Promise<{ email: string; name: string } | null>;
}

export interface ResolveAssigneeOptions {
  /**
   * Tail of the operator-facing message. The public submit path says
   * "before this form can be submitted."; the workflow paths say
   * "before the workflow can start."
   */
  blockedSuffix?: string;
  /**
   * Also reject a non-empty value that is not an address, even on a public
   * layer. The dashboard does this; the submit paths only check under "365".
   */
  rejectNonEmailAlways?: boolean;
  /**
   * Keep an unusable distribution-list address as the primary rather than
   * clearing it, so the dashboard can still show what was configured.
   */
  keepInvalidDistributionListAddress?: boolean;
  /**
   * Wording when a list expands to nobody; the server names the Graph grant.
   * Becomes the layer's parked reason rather than a hard failure.
   */
  emptyDistributionListError?: (label: string, address: string) => string;
  /** Identities chain routing needs that the form body does not carry. */
  context?: ResolutionContext;
}

/** Field references are stored as `${fieldName}` in some published configs. */
export function stripFieldReference(value: string): string {
  return value.replace(/^\$\{/, "").replace(/\}$/, "");
}

/**
 * Coerces a submitted answer to text. SurveyJS hands back bare strings for most
 * questions but objects for choice-style ones, hence the key sweep.
 */
export function valueToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["email", "Email", "value", "Value", "text", "Title"]) {
      const next = record[key];
      if (typeof next === "string" && next.trim()) return next.trim();
    }
  }
  return "";
}

function toResolvedActors(email: string, name: string): ResolvedLayerActors {
  const trimmed = email.trim();
  return { email: trimmed, name, emails: trimmed ? [trimmed] : [] };
}

function failure(error: string, email = ""): ResolvedLayerActors {
  return { email, name: "", emails: [], error };
}

/**
 * Thrown by a directory lookup that simply has no answer yet: no row for the
 * department, two rows where one was expected, a row whose address is unusable,
 * or no department value to look one up with.
 *
 * Deliberately distinct from an ordinary error. A gap in the directory is an
 * everyday state while the org chart is still being filled in, and the person
 * filling the form cannot fix it — so the submission is kept and the layer
 * parks for an admin to route once. A form that is genuinely misconfigured (no
 * department field chosen, a malformed assignee address) still fails, because
 * that is a builder mistake worth surfacing at the moment it bites.
 */
export class DirectoryGapError extends Error {
  readonly directoryGap = true;
  constructor(message: string) {
    super(message);
    this.name = "DirectoryGapError";
  }
}

/**
 * True for a `DirectoryGapError`. Reads a marker rather than the prototype so
 * the answer does not depend on which of this module's two copies threw.
 */
export function isDirectoryGap(error: unknown): boolean {
  return !!error
    && typeof error === "object"
    && (error as { directoryGap?: unknown }).directoryGap === true;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function layerLabel(layer: ResolvableLayer): string {
  return layer.title || `Layer ${layer.layerNumber}`;
}

function parked(reason: string): ResolvedLayerActors {
  return { email: "", name: "", emails: [], parked: { reason } };
}

/** "GUEST" is what the public submit path writes when there is no tenant identity. */
function usableIdentity(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  return EMAIL_RE.test(trimmed) ? trimmed : "";
}

function describePerson(person: DirectoryPerson): string {
  const detail = [person.position, person.department].filter(Boolean).join(", ");
  const who = person.name || person.email;
  return detail ? `${who} (${detail})` : who;
}

/** Where a chain begins: the submitter, the previous layer's actor, or a field. */
function chainStart(
  assignee: ResolvableAssignee,
  submittedData: Record<string, unknown>,
  context: ResolutionContext,
): { email: string; description: string } {
  if (assignee.startFrom === "previous-actor") {
    return { email: usableIdentity(context.previousActorEmail), description: "the previous approver" };
  }
  if (assignee.startFrom === "field") {
    const field = stripFieldReference(assignee.value);
    return { email: usableIdentity(valueToText(submittedData[field])), description: `the person named in "${field}"` };
  }
  return { email: usableIdentity(context.submitterEmail), description: "the submitter" };
}

/**
 * Walks the reporting line `hops` steps up from `startEmail`.
 *
 * Stops early — and says so — on three conditions the directory will eventually
 * hit in practice: a person who is not listed, a person with no approver (the
 * top of the line), and a loop. None of these existed as guards before, and a
 * loop would otherwise walk forever.
 */
async function walkChain(
  startEmail: string,
  hops: number,
  ports: AssigneeResolverPorts,
  options: { skipSelf?: boolean; submitterEmail?: string; first?: DirectoryPerson },
): Promise<
  /*
    `reason` is declared on both branches, the successful one as absent, so it
    can be read without narrowing the union first.

    Narrowing would be the obvious way to write this, and it is what the
    project's own build does. The deployment platform compiles these routes a
    second time against different globals, and there the narrowing does not
    hold: `walked.reason` after `if (!walked.ok)` was rejected on every build.
    Declaring the property on both members sidesteps the disagreement — the
    successful branch still cannot carry a reason, because `undefined` is the
    only value its type admits.
  */
  | { ok: true; person: DirectoryPerson; trail: string[]; reason?: undefined }
  | { ok: false; person?: undefined; reason: string; trail: string[] }
> {
  const lookupPerson = ports.lookupPerson;
  if (!lookupPerson) return { ok: false, reason: "the approval directory is not available here", trail: [] };

  const submitter = (options.submitterEmail ?? "").trim().toLowerCase();
  const seen = new Set<string>([startEmail.toLowerCase()]);
  const trail: string[] = [startEmail];
  let current = startEmail;
  let resolved: DirectoryPerson | null = null;

  const ceiling = Math.min(Math.max(hops, 1), MAX_CHAIN_HOPS);
  for (let step = 0; step < MAX_CHAIN_HOPS; step++) {
    // The first hop may already be in hand: a person with no email cannot be
    // looked up by address, so the caller found their row another way.
    const person = step === 0 && options.first ? options.first : await lookupPerson(current);
    if (!person) {
      return { ok: false, reason: `${current} is not in the approval directory`, trail };
    }
    const next = person.approverEmail.trim();
    if (!next) {
      return { ok: false, reason: `${person.name || current} has nobody above them in the directory`, trail };
    }
    if (seen.has(next.toLowerCase())) {
      return { ok: false, reason: `the approval line loops back to ${next}`, trail: [...trail, next] };
    }
    seen.add(next.toLowerCase());
    trail.push(next);

    const reachedRequestedHop = step + 1 >= ceiling;
    const listed = await lookupPerson(next);
    // The row says who approves this person, and that is the answer. The
    // approver need not be listed themselves — the top of a line often is not —
    // so on the requested hop an unlisted address still routes. An intermediate
    // hop has to be listed, because the walk needs its approver to continue.
    const nextPerson = listed
      ?? (reachedRequestedHop
        ? { email: next, name: "", department: "", position: "", approverEmail: "" }
        : null);
    if (!nextPerson) {
      return { ok: false, reason: `${next} is not in the approval directory`, trail };
    }
    current = next;
    resolved = nextPerson;

    // Only keep walking past the requested hop to step over the submitter
    // themselves — the "approved by their own submission" case.
    const landedOnSubmitter = options.skipSelf && submitter && next.toLowerCase() === submitter;
    if (reachedRequestedHop && !landedOnSubmitter) {
      return { ok: true, person: nextPerson, trail };
    }
  }

  return resolved
    ? { ok: false, reason: `the approval line is longer than ${MAX_CHAIN_HOPS} steps`, trail }
    : { ok: false, reason: "the approval line could not be followed", trail };
}

async function applyChainFallback(
  assignee: ResolvableAssignee,
  submittedData: Record<string, unknown>,
  ports: AssigneeResolverPorts,
  label: string,
  reason: string,
): Promise<ResolvedLayerActors> {
  const fallback = assignee.fallback;

  if (fallback?.mode === "fixed") {
    const email = (fallback.email ?? "").trim();
    if (!EMAIL_RE.test(email)) {
      return parked(`${label} could not be routed (${reason}), and its fallback address is not valid.`);
    }
    return {
      ...toResolvedActors(email, ""),
      explanation: `Fell back to ${email} because ${reason}.`,
    };
  }

  if (fallback?.mode === "department-hod" && ports.lookupRoleHolder) {
    const department = valueToText(submittedData.Department) || valueToText(submittedData.department);
    if (department) {
      const holder = await ports.lookupRoleHolder(department, "HOD");
      if (holder?.email) {
        return {
          ...toResolvedActors(holder.email, holder.name),
          explanation: `Fell back to the head of ${department} because ${reason}.`,
        };
      }
    }
  }

  return parked(`${label} could not be routed: ${reason}.`);
}

async function resolveChain(
  layer: ResolvableLayer,
  submittedData: Record<string, unknown>,
  ports: AssigneeResolverPorts,
  context: ResolutionContext,
): Promise<ResolvedLayerActors> {
  const label = layerLabel(layer);
  const assignee = layer.assignee;
  let start = chainStart(assignee, submittedData, context);

  // The submitter may have no address routing can use, and yet be on the form:
  // a public link records "GUEST", and a person with no company mailbox has a
  // directory row with a name and no email. Their approver is still set on that
  // row, so find the row from the form's answers and follow it. Nobody is mailed
  // on their behalf — there is no address — but the approver is a real person
  // with one, which is all the workflow needs.
  let first: DirectoryPerson | undefined;
  const fromSubmitter = assignee.startFrom !== "previous-actor" && assignee.startFrom !== "field";
  if (fromSubmitter && ports.lookupSubject) {
    const listed = start.email && ports.lookupPerson ? await ports.lookupPerson(start.email) : null;
    if (!listed) {
      const subject = await ports.lookupSubject(submittedData);
      if (subject) {
        first = subject;
        const who = subject.name || subject.email;
        start = {
          email: subject.email || who,
          description: subject.email
            ? `the employee on the form (${who})`
            : `the employee on the form (${who}, no email set)`,
        };
      }
    }
  }

  if (!start.email) {
    return applyChainFallback(assignee, submittedData, ports, label, `${start.description} has no usable email address`);
  }

  const walked = await walkChain(start.email, assignee.hops ?? 1, ports, {
    skipSelf: assignee.skipSelf,
    submitterEmail: context.submitterEmail,
    first,
  });

  if (!walked.ok) {
    // The fallback is unreachable: every unsuccessful walk sets a reason. It
    // is here because `reason` is optional on the union — see `walkChain`.
    return applyChainFallback(
      assignee,
      submittedData,
      ports,
      label,
      walked.reason ?? "the approval line could not be followed",
    );
  }
  if (!EMAIL_RE.test(walked.person.email)) {
    return parked(`${label} resolved to "${walked.person.email}", which is not a valid email address.`);
  }

  return {
    ...toResolvedActors(walked.person.email, walked.person.name),
    explanation: `Followed the approval line from ${start.description}: ${walked.trail.join(" → ")}.`
      + ` Resolved to ${describePerson(walked.person)}.`,
  };
}

/** Which department a role-holder layer should look in, and how it was decided. */
async function resolveRoleHolderDepartment(
  assignee: ResolvableAssignee,
  submittedData: Record<string, unknown>,
  ports: AssigneeResolverPorts,
  context: ResolutionContext,
): Promise<{ department: string; source: string }> {
  if (assignee.department === "fixed") {
    const department = assignee.value.trim();
    return { department, source: `the ${department} department` };
  }

  if (assignee.department === "from-field") {
    const field = stripFieldReference(assignee.value);
    return { department: valueToText(submittedData[field]), source: `the department answered in "${field}"` };
  }

  const submitter = usableIdentity(context.submitterEmail);
  const person = (submitter && ports.lookupPerson ? await ports.lookupPerson(submitter) : null)
    ?? (ports.lookupSubject ? await ports.lookupSubject(submittedData) : null);
  return { department: person?.department ?? "", source: "the submitter's own department" };
}

async function resolveRoleHolder(
  layer: ResolvableLayer,
  submittedData: Record<string, unknown>,
  ports: AssigneeResolverPorts,
  context: ResolutionContext,
): Promise<ResolvedLayerActors> {
  const label = layerLabel(layer);
  const assignee = layer.assignee;
  const role = (assignee.role || "HOD").trim();

  const { department, source } = await resolveRoleHolderDepartment(assignee, submittedData, ports, context);

  if (!department) {
    return parked(`${label} could not tell which department to use for ${source}.`);
  }
  if (!ports.lookupRoleHolder) {
    return parked(`${label} needs the approval directory, which is not available here.`);
  }

  const holder = await ports.lookupRoleHolder(department, role);
  if (!holder?.email || !EMAIL_RE.test(holder.email)) {
    return parked(`${label} could not find the ${role} for ${department}.`);
  }

  return {
    ...toResolvedActors(holder.email, holder.name),
    explanation: `${holder.name || holder.email} is the ${role} of ${department}, taken from ${source}.`,
  };
}

/**
 * True when a layer cannot be resolved until an earlier one completes, so the
 * submit path must defer it rather than writing an empty actor and moving on.
 */
export function isDeferredAssignee(assignee: ResolvableAssignee): boolean {
  return assignee.type === "chain" && assignee.startFrom === "previous-actor";
}

/** Most actors a single layer will look up stand-ins for; a long `users` list stops there. */
export const MAX_STAND_IN_LOOKUPS = 10;

/**
 * Who may act on behalf of `person`, per their directory row, leaving out
 * anyone in `exclude` (already an actor in their own right).
 */
export function standInsOf(person: DirectoryPerson | null | undefined, exclude: readonly string[] = []): string[] {
  const taken = new Set(exclude.map((entry) => entry.trim().toLowerCase()));
  if (person?.email) taken.add(person.email.trim().toLowerCase());
  const result: string[] = [];
  for (const raw of person?.delegateEmails ?? []) {
    const email = raw.trim();
    const key = email.toLowerCase();
    if (!EMAIL_RE.test(email) || taken.has(key)) continue;
    taken.add(key);
    result.push(email);
  }
  return result;
}

/**
 * True when `signer` acted on `principal`'s behalf rather than as themselves:
 * a different person, named as a stand-in on the principal's directory row.
 */
export function isStandInFor(signer: string, principal: DirectoryPerson | null | undefined): boolean {
  const key = signer.trim().toLowerCase();
  if (!key || !principal) return false;
  if (principal.email.trim().toLowerCase() === key) return false;
  return (principal.delegateEmails ?? []).some((entry) => entry.trim().toLowerCase() === key);
}

type PersonLookup = Pick<Required<AssigneeResolverPorts>, "lookupPerson">;

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The person `signer` stands in for on a layer whose primary actor is
 * `primaryEmail`, or null when they act as themselves. Read from the directory
 * as it is at the moment asked — there is no per-submission copy to drift.
 * Never throws: an unreadable directory records the decision as the signer's
 * own, which is what every decision was before stand-ins existed.
 */
export async function standInPrincipal(
  ports: PersonLookup,
  signer: string,
  primaryEmail: unknown,
): Promise<OnBehalfOfRecord | null> {
  const primary = trimmed(primaryEmail);
  const who = signer.trim();
  if (!who || !primary || primary.toLowerCase() === who.toLowerCase()) return null;
  const row = await ports.lookupPerson(primary).catch(() => null);
  if (!row || !isStandInFor(who, row)) return null;
  return { email: row.email || primary, name: row.name || primary, position: row.position || "" };
}

/** "Siti", "Siti and Ali", "Siti, Ali and Mei". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "Siti (siti@pmw.com)", or the name alone when the address is unknown or is the name. */
function withEmail(name: string, email: string | undefined): string {
  const address = (email ?? "").trim();
  return address && address.toLowerCase() !== name.trim().toLowerCase() ? `${name} (${address})` : name;
}

/**
 * The sentence a request email carries when it also went to someone's stand-in.
 * With `emails`, each person is named with their address beside them, so a
 * reader can tell exactly which mailbox was asked.
 */
export function describeStandIns(
  principalName: string,
  standInNames: string[],
  layerType: "approval" | "evaluation",
  emails?: { principal?: string; standIns?: string[] },
): string {
  if (standInNames.length === 0) return "";
  const verb = layerType === "evaluation" ? "evaluate" : "approve";
  const who = standInNames.length === 1 ? "who" : "who each";
  const any = standInNames.length === 1 ? "Either of you" : "Any of you";
  const principal = withEmail(principalName, emails?.principal);
  const standIns = standInNames.map((name, i) => withEmail(name, emails?.standIns?.[i]));
  return `Sent to ${principal} and to ${listNames(standIns)}, ${who} can act on ${principalName}'s behalf. `
    + `${any} can ${verb}. Whoever does it first completes this step.`;
}

/**
 * The stand-in sentence for a layer email addressed to `recipients`, or
 * undefined when nobody on it is standing in for the primary actor.
 */
export async function standInEmailNote(
  ports: PersonLookup,
  primaryEmail: unknown,
  recipients: readonly string[],
  layerType: "approval" | "evaluation",
): Promise<string | undefined> {
  const primary = trimmed(primaryEmail);
  if (!primary || recipients.length < 2) return undefined;
  const row = await ports.lookupPerson(primary).catch(() => null);
  if (!row) return undefined;
  const addressed = new Set(recipients.map((entry) => entry.trim().toLowerCase()));
  const standIns = standInsOf(row).filter((email) => addressed.has(email.toLowerCase()));
  if (standIns.length === 0) return undefined;
  const names = await Promise.all(standIns.map(async (email) => {
    const person = await ports.lookupPerson(email).catch(() => null);
    return person?.name || email;
  }));
  return describeStandIns(row.name || primary, names, layerType, { principal: row.email || primary, standIns });
}

/**
 * Adds every actor's stand-ins to the layer, so a step that lands on the CEO
 * also reaches — and may be decided by — their PA.
 *
 * Best effort by design: a directory that cannot be read leaves the layer with
 * exactly the actors it resolved, which is how it routed before stand-ins
 * existed. Missing a stand-in delays nothing; failing the submission would.
 * A distribution list is left alone — its members are a group already, and
 * looking up every one of them would be a request per member.
 */
export async function addStandIns(
  resolved: ResolvedLayerActors,
  assigneeType: string,
  ports: Pick<AssigneeResolverPorts, "lookupPerson">,
): Promise<ResolvedLayerActors> {
  if (resolved.error || resolved.parked || resolved.emails.length === 0) return resolved;
  if (assigneeType === "distribution-list" || !ports.lookupPerson) return resolved;

  const emails = [...resolved.emails];
  const standIns: StandIn[] = [];
  for (const actor of resolved.emails.slice(0, MAX_STAND_IN_LOOKUPS)) {
    const person = await ports.lookupPerson(actor).catch(() => null);
    for (const email of standInsOf(person, emails)) {
      emails.push(email);
      standIns.push({ email, forEmail: actor, forName: person?.name || actor });
    }
  }
  if (standIns.length === 0) return resolved;

  const note = standIns
    .map((entry) => `${entry.email} may act on behalf of ${entry.forName}.`)
    .join(" ");
  return {
    ...resolved,
    emails,
    standIns,
    explanation: resolved.explanation ? `${resolved.explanation} ${note}` : note,
  };
}

/**
 * Resolves who may act on `layer`, given the submitted answers, including
 * anyone the directory says may act on an actor's behalf (`addStandIns`).
 */
export async function resolveLayerAssignee(
  layer: ResolvableLayer,
  submittedData: Record<string, unknown>,
  ports: AssigneeResolverPorts,
  options: ResolveAssigneeOptions = {},
): Promise<ResolvedLayerActors> {
  const resolved = await resolveLayerActors(layer, submittedData, ports, options);
  return addStandIns(resolved, layer.assignee.type, ports);
}

/**
 * Resolves who may act on `layer`, given the submitted answers.
 *
 * Note this reads the submitted data only — it cannot express "whoever acted on
 * the previous layer", because every layer is resolved before layer 1 has an
 * actor. Lifting that restriction is what the reporting-line work adds next.
 */
async function resolveLayerActors(
  layer: ResolvableLayer,
  submittedData: Record<string, unknown>,
  ports: AssigneeResolverPorts,
  options: ResolveAssigneeOptions,
): Promise<ResolvedLayerActors> {
  const label = layerLabel(layer);
  const suffix = options.blockedSuffix ?? "before the workflow can start.";
  const context = options.context ?? {};

  // Chain and role-holder routing both read the directory mid-walk, and a read
  // that throws — the list missing, a transient Graph or SharePoint failure —
  // would otherwise escape as an exception and take the whole submission with
  // it. Parking keeps the work and asks an admin, which is what an unanswerable
  // directory deserves either way.
  if (layer.assignee.type === "chain") {
    try {
      return await resolveChain(layer, submittedData, ports, context);
    } catch (error) {
      return parked(`${label} could not be routed: ${errorText(error, "the approval directory could not be read")}.`);
    }
  }

  if (layer.assignee.type === "role-holder") {
    try {
      return await resolveRoleHolder(layer, submittedData, ports, context);
    } catch (error) {
      return parked(`${label} could not be routed: ${errorText(error, "the approval directory could not be read")}.`);
    }
  }

  if (layer.assignee.type === "department-approver") {
    try {
      const resolved = await ports.lookupDepartmentApprover(layer, submittedData);
      return toResolvedActors(resolved.email, resolved.name);
    } catch (error) {
      const message = errorText(error, `${label} could not resolve the department approver.`);
      // A directory with no answer parks and waits for an admin; a layer the
      // form itself never configured properly still refuses the submission.
      return isDirectoryGap(error) ? parked(message) : failure(message);
    }
  }

  if (layer.assignee.type === "users") {
    const emails = parseValidEmailList(layer.assignee.value);
    if (layer.authMode === "365" && emails.length === 0) {
      return { ...failure(`${label} needs at least one valid assignee email ${suffix}`), emails };
    }
    return { email: emails[0] ?? "", name: "", emails };
  }

  if (layer.assignee.type === "distribution-list") {
    const address = layer.assignee.value.trim();
    if (!EMAIL_RE.test(address)) {
      return failure(
        `${label} needs a valid distribution list address ${suffix}`,
        options.keepInvalidDistributionListAddress ? address : "",
      );
    }
    try {
      const members = await ports.expandDistributionList(layer, address);
      if (members.length === 0) {
        if (layer.authMode === "365") {
          // Parked, not failed: a list that reads empty is a directory problem,
          // and refusing the submission would throw away work someone has
          // already done. The address still gets the notice, so the team learns
          // the submission exists while an admin routes the layer once.
          return {
            ...parked(
              options.emptyDistributionListError?.(label, address)
                ?? `${label}: the distribution list ${address} returned no members.`,
            ),
            deliverTo: [address],
          };
        }
        // Public layers act through a token rather than an identity check, so
        // mailing the list address itself is still a workable delivery target.
        return toResolvedActors(address, "");
      }
      return { email: members[0], name: "", emails: members };
    } catch (error) {
      return failure(errorText(error, `${label} could not read the distribution list members.`));
    }
  }

  const email = layer.assignee.type === "user"
    ? layer.assignee.value.trim()
    : valueToText(submittedData[stripFieldReference(layer.assignee.value)]);

  if (layer.authMode === "365" && !EMAIL_RE.test(email)) {
    return failure(`${label} needs a valid assignee email ${suffix}`, email);
  }
  if (options.rejectNonEmailAlways && email && !EMAIL_RE.test(email)) {
    return failure(`${label} resolved to "${email}", which is not a valid email address.`, email);
  }

  return toResolvedActors(email, "");
}

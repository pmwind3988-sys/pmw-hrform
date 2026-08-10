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
 * `src/utils/resolveAssignee.ts` is the client-side copy of this file; api/
 * cannot import from src/. Keep the two in step.
 */
import { parseValidEmailList } from "./layerRecipients.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AssigneeAuthMode = "365" | "public";

export interface ResolvableAssignee {
  type: string;
  value: string;
}

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
  /** Wording when a list expands to nobody; the server names the Graph grant. */
  emptyDistributionListError?: (label: string, address: string) => string;
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

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function layerLabel(layer: ResolvableLayer): string {
  return layer.title || `Layer ${layer.layerNumber}`;
}

/**
 * Resolves who may act on `layer`, given the submitted answers.
 *
 * Note this reads the submitted data only — it cannot express "whoever acted on
 * the previous layer", because every layer is resolved before layer 1 has an
 * actor. Lifting that restriction is what the reporting-line work adds next.
 */
export async function resolveLayerAssignee(
  layer: ResolvableLayer,
  submittedData: Record<string, unknown>,
  ports: AssigneeResolverPorts,
  options: ResolveAssigneeOptions = {},
): Promise<ResolvedLayerActors> {
  const label = layerLabel(layer);
  const suffix = options.blockedSuffix ?? "before the workflow can start.";

  if (layer.assignee.type === "department-approver") {
    try {
      const resolved = await ports.lookupDepartmentApprover(layer, submittedData);
      return toResolvedActors(resolved.email, resolved.name);
    } catch (error) {
      return failure(errorText(error, `${label} could not resolve the department approver.`));
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
          return failure(
            options.emptyDistributionListError?.(label, address)
              ?? `${label}: the distribution list ${address} returned no members.`,
          );
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

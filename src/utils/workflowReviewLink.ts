/**
 * workflowReviewLink.ts — finds the layer a workflow notice is about, so the
 * link in that notice can be built for the right one.
 *
 * `workflowLink.ts` builds the URL but has to be told what the layer is:
 * approval or evaluation, sign-in or public, and which public token. That comes
 * out of the form's saved layer configuration, and picking the right entry is
 * not simply "the layer with this number" — a form with manual branches defines
 * a layer 2 per branch, and only the branch this submission was routed down
 * describes the person actually being emailed.
 *
 * When the submission has not recorded a branch yet, the number alone can match
 * several entries. If those entries disagree about what the link should be, no
 * link is returned rather than a guessed one: a notice with no button is a
 * nuisance, a notice pointing at the wrong layer is a hole.
 */
import { getActiveLayers } from "../components/builder/approvalDashboardLayerProgress";
import { isLayerActor } from "./layerRecipients";
import type { WorkflowRoutePrefix } from "./workflowLink";
import type { LayerConfigItem, ManualBranch } from "../types";

export interface ParsedLayerConfig {
  layers: LayerConfigItem[];
  manualBranches?: ManualBranch[];
}

/** `LayerConfig` as stored on Master Form — a JSON string, or already parsed. */
export function parseLayerConfig(raw: unknown): ParsedLayerConfig | null {
  let value: unknown = raw;
  if (typeof value === "string") {
    if (!value.trim()) return null;
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as { layers?: unknown; manualBranches?: unknown };
  const layers = Array.isArray(record.layers) ? record.layers as LayerConfigItem[] : [];
  const manualBranches = Array.isArray(record.manualBranches)
    ? record.manualBranches as ManualBranch[]
    : undefined;
  if (!layers.length && !manualBranches?.length) return null;
  return manualBranches ? { layers, manualBranches } : { layers };
}

/** What two candidate layers must agree on before either may build the link. */
function linkShape(layer: LayerConfigItem): string {
  return [
    String(layer.type || ""),
    String(layer.authMode || ""),
    String(layer.publicToken || ""),
  ].join("|");
}

/**
 * The layer a notice for `layerNumber` is about, or `undefined` when the
 * configuration cannot say for certain.
 */
export function selectWorkflowLayer(
  rawLayerConfig: unknown,
  selectedBranch: string | undefined,
  layerNumber: number,
): LayerConfigItem | undefined {
  const parsed = parseLayerConfig(rawLayerConfig);
  if (!parsed || !Number.isFinite(layerNumber) || layerNumber <= 0) return undefined;

  // The branch this submission was routed down, when it has one, describes the
  // layer that was actually assigned.
  const active = getActiveLayers(parsed, selectedBranch);
  const onBranch = active.find((layer) => Number(layer.layerNumber) === layerNumber);
  if (onBranch) return onBranch;

  // No branch recorded: every branch that defines this layer is a candidate.
  const candidates = [
    ...parsed.layers,
    ...(parsed.manualBranches ?? []).flatMap((branch) => branch.layers ?? []),
  ].filter((layer) => Number(layer.layerNumber) === layerNumber);
  if (!candidates.length) return undefined;

  const shape = linkShape(candidates[0]);
  return candidates.every((layer) => linkShape(layer) === shape) ? candidates[0] : undefined;
}

/**
 * When this app started telling the two link shapes apart.
 *
 * Before the prefixes were split, every workflow link said `/eval/...` whatever
 * kind of step it opened, so an approval link in that shape is a real one a
 * real approver may still be holding. After it, no approval link was ever
 * issued that way again.
 *
 * The date is compared against *the submission*, not against today. A request
 * raised after this could never have been sent an old-shape approval link, so
 * refusing one for it is safe from the moment this ships and stays safe. A
 * request raised before it keeps the old shape working for as long as it lives,
 * which costs nothing: those rows drain as they complete.
 *
 * The alternative — a cutoff on today's date — meant every old link stopped
 * working on one particular morning, and the only way to know whether that
 * would strand anyone was to audit which pending approvals were still sitting
 * on a pre-split email. The submissions workspace cannot answer that: it loads
 * email history for the hundred most recent rows per form and offers no way to
 * filter by when a notice went out. A deadline nobody can prepare for is worse
 * than no deadline, so this replaced it.
 *
 * A couple of days later than the split commit itself, because a deploy does
 * not land the instant a commit does, and being slightly too generous here only
 * costs a second barrier on a handful of old rows.
 */
export const PREFIX_SPLIT_SAFE_FROM = new Date("2026-08-05T00:00:00Z");

/**
 * Whether a link with this prefix may open a layer of this type.
 *
 * The prefix is part of the address, so a reviewer can edit it — which is
 * exactly why it is worth checking. An approval link whose layer number has
 * been nudged onto the form's evaluation step no longer agrees with itself, and
 * disagreement is enough to refuse: it is a second barrier that has to be
 * defeated alongside the assignee check, not a replacement for it.
 *
 * `/approval/...` never opens an evaluation layer, full stop — no version of
 * this app has ever issued that combination, so any example of it was typed.
 * `/eval/...` opening an approval layer is refused too, unless the submission
 * predates the split and could therefore have been sent one honestly.
 *
 * `submissionCreatedAt` is the row's own `Created`. Unreadable or absent is
 * treated as old, which allows: this is a second barrier, and it should never
 * be the thing that turns a real approver away on its own.
 */
export function routePrefixAllowsLayerType(
  prefix: WorkflowRoutePrefix,
  layerType: string | undefined,
  submissionCreatedAt?: unknown,
): boolean {
  // An unresolved layer type is not evidence of anything; the assignee and
  // ordering checks still stand behind this one.
  if (!layerType) return true;
  if (prefix === "approval") return layerType !== "evaluation";
  if (layerType === "evaluation") return true;

  const created = Date.parse(String(submissionCreatedAt ?? ""));
  if (!Number.isFinite(created)) return true;
  return created < PREFIX_SPLIT_SAFE_FROM.getTime();
}

/** Why a sign-in review link may not open the record it names. */
export type SignedInLinkDenial = "public-shape" | "wrong-shape" | "not-assigned";

export interface SignedInLinkGateParams {
  /** Which of the two link shapes was opened. */
  routePrefix: WorkflowRoutePrefix;
  /** The layer as the form configures it, not as the address claims it. */
  layerType: string | undefined;
  layerAuthMode: string | undefined;
  signedInEmail: string;
  /** `L{n}_Emails` — every address allowed to act on the layer. */
  layerEmails: unknown;
  /** `L{n}_Email` — the primary actor, and all an older row carries. */
  layerEmail: unknown;
  /** The row's `Created`, which decides whether the old link shape is allowed. */
  submissionCreatedAt?: unknown;
}

/**
 * Everything a sign-in review link has to satisfy before the submission behind
 * it is fetched, let alone shown.
 *
 * Kept apart from the page so it can be answered from a handful of fields. The
 * page reads only those fields first and calls this; the record itself is
 * fetched afterwards, and only if this returns null. That ordering is the
 * point: a refusal that arrives after the whole submission has been downloaded
 * into the browser has already handed over what it was refusing.
 *
 * `null` means the link may proceed.
 */
export function denySignedInLayerLink(params: SignedInLinkGateParams): SignedInLinkDenial | null {
  // A public layer is reached by its own emailed link, whose binding the server
  // checks before returning a field. The sign-in shape has no such binding, so
  // accepting it here would be a way round that check.
  if (String(params.layerAuthMode || "") === "public") return "public-shape";

  // The prefix and the layer number sit side by side in the address. A link
  // whose two halves disagree about what kind of step this is was edited.
  if (!routePrefixAllowsLayerType(params.routePrefix, params.layerType, params.submissionCreatedAt)) return "wrong-shape";

  // A layer can be assigned to several people, or to an expanded distribution
  // list; any one of them may act, and nobody else may.
  if (!isLayerActor(params.signedInEmail, params.layerEmails, params.layerEmail)) return "not-assigned";

  return null;
}

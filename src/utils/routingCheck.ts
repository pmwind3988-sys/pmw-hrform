/**
 * routingCheck.ts — "is the person saved on this layer the person routing picks?"
 *
 * Pure, so the approvals page can feed it whatever the routing resolver
 * returned and the rules stay testable without a network.
 */
import { emailListsMatch } from "./layerRecipients.js";

export type RoutingVerdictKind =
  /** Saved people are exactly who routing picks today. */
  | "match"
  /** They differ — the only state that offers a fix. */
  | "mismatch"
  /** An admin reassigned this layer on purpose; routing is not allowed to undo it. */
  | "manual"
  /** Routing has no answer (or the layer is on paper / parked), so there is nothing to fix to. */
  | "unresolved"
  /** Depends on who acts on an earlier layer, which has not happened yet. */
  | "waiting";

export interface LayerRoutingVerdict {
  layer: number;
  title: string;
  type: "approval" | "evaluation";
  kind: RoutingVerdictKind;
  saved: string[];
  routed: string[];
  /** Plain-language reason for every kind except `match` and `mismatch`. */
  note?: string;
}

export interface RoutingFacts {
  /** Everyone currently allowed to act, from `L{n}_Emails` / `L{n}_Email`. */
  saved: string[];
  /** Who routing picks today. Empty when it has no answer. */
  routed: string[];
  /** Why routing has no answer, when it said so. */
  routingProblem?: string;
  /** An admin reassigned this layer by hand. */
  manualOverride: boolean;
  /** The layer is on paper handling or parked; Fix would have to start it, which this is not for. */
  holdReason?: string;
  /** Routing depends on someone who has not acted yet. */
  waitingReason?: string;
}

export function classifyLayerRouting(facts: RoutingFacts): { kind: RoutingVerdictKind; note?: string } {
  if (facts.manualOverride) {
    return { kind: "manual", note: "Reassigned by hand on this submission, so routing is not applied." };
  }
  if (facts.holdReason) return { kind: "unresolved", note: facts.holdReason };
  if (facts.waitingReason) return { kind: "waiting", note: facts.waitingReason };
  if (facts.routed.length === 0) {
    return { kind: "unresolved", note: facts.routingProblem || "Routing has no answer for this layer." };
  }
  return { kind: emailListsMatch(facts.saved, facts.routed) ? "match" : "mismatch" };
}

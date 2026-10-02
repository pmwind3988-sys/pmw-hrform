/**
 * routingCheck.ts — "is the person saved on this layer the person routing picks?"
 *
 * Pure, so the approvals page can feed it whatever the routing resolver
 * returned and the rules stay testable without a network.
 */
import { emailListsMatch } from "./layerRecipients.js";
import { employeeIdKey, personNameKey } from "./directoryHarvest.js";

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
  /** How routing reached `routed`, in plain words, when it can say. */
  how?: string;
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

export interface DirectoryPersonRow {
  personEmail: string;
  personName: string;
  employeeId: string;
}

/**
 * The directory row a form's employee is, deciding by staff number first, then
 * address, then name (only when exactly one row carries it).
 *
 * Staff numbers are typed by hand, so "SG 010", "sg010" and "SG010" are one
 * number; `employeeIdKey` removes the spaces and the case.
 */
export function findDirectoryPerson<Row extends DirectoryPersonRow>(
  rows: readonly Row[],
  who: { email: string; employeeId: string; name: string },
): Row | undefined {
  const id = employeeIdKey(who.employeeId);
  const email = who.email.trim().toLowerCase();
  const name = personNameKey(who.name);
  const byName = name ? rows.filter((row) => personNameKey(row.personName) === name) : [];
  return (id ? rows.find((row) => employeeIdKey(row.employeeId) === id) : undefined)
    ?? (email ? rows.find((row) => row.personEmail.trim().toLowerCase() === email) : undefined)
    ?? (byName.length === 1 ? byName[0] : undefined);
}

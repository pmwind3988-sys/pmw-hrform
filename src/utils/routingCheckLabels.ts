/**
 * routingCheckLabels.ts - plain-language wording for the automatic routing
 * checks logged on a submission (`WorkflowAssignmentData.checks`). Pure.
 */
import type { RoutingCheckOutcome, RoutingCheckTrigger } from "./workflowAssignmentData";

const OUTCOME_LABELS: Record<RoutingCheckOutcome, string> = {
  match: "Matches routing",
  corrected: "Corrected",
  "left-alone": "Set by hand, left alone",
  "not-checkable": "Nothing to check",
  "held-no-routing": "On hold: routing has no answer",
  "held-check-failed": "On hold: could not check, will retry",
};

const TRIGGER_LABELS: Record<RoutingCheckTrigger, string> = {
  submission: "submission",
  "step-advanced": "after the previous step",
  "daily-run": "daily run",
  reminder: "reminder",
  "send-selected": "send selected now",
  "send-now": "send now",
  "link-reissue": "new link request",
};

export function routingCheckOutcomeLabel(outcome: RoutingCheckOutcome): string {
  return OUTCOME_LABELS[outcome];
}

export function routingCheckTriggerLabel(trigger: RoutingCheckTrigger): string {
  return TRIGGER_LABELS[trigger];
}

/** An email held back by the check: nothing goes out until routing is fixed or the check can run. */
export function isHeldRoutingOutcome(outcome: RoutingCheckOutcome): boolean {
  return outcome === "held-no-routing" || outcome === "held-check-failed";
}

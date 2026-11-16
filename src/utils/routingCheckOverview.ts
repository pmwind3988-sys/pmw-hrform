/**
 * routingCheckOverview.ts - every automatic routing check across the loaded
 * submissions, as one list (All Submissions -> "Routing checks").
 *
 * Each submission keeps its own log in `WorkflowAssignmentData.checks`; this
 * flattens those logs, newest first, and says which of the list's views a
 * line belongs to. Pure. It covers only the rows the page has loaded.
 */
import { readRoutingChecks, type RoutingCheckEntry, type RoutingCheckOutcome } from "./workflowAssignmentData";

export interface RoutingCheckSourceRow {
  formTitle: string;
  itemId: number | string;
  /** The row's `WorkflowAssignmentData` column, as stored. */
  assignmentRaw: unknown;
}

export interface RoutingCheckLine extends RoutingCheckEntry {
  key: string;
  formTitle: string;
  itemId: number | string;
}

export type RoutingCheckView = "all" | "corrected" | "held" | "match" | "left-alone" | "not-checkable";
export type RoutingCheckPeriod = "30" | "90" | "all";

export const ROUTING_CHECK_VIEW_LABELS: Record<RoutingCheckView, string> = {
  all: "Everything",
  corrected: "Corrected",
  held: "On hold",
  match: "Matches routing",
  "left-alone": "Set by hand",
  "not-checkable": "Nothing to check",
};

export const ROUTING_CHECK_PERIOD_LABELS: Record<RoutingCheckPeriod, string> = {
  "30": "Last 30 days",
  "90": "Last 3 months",
  all: "All time",
};

const VIEW_OUTCOMES: Record<Exclude<RoutingCheckView, "all">, readonly RoutingCheckOutcome[]> = {
  corrected: ["corrected"],
  held: ["held-no-routing", "held-check-failed"],
  match: ["match"],
  "left-alone": ["left-alone"],
  "not-checkable": ["not-checkable"],
};

/** Every logged check on the given rows, newest first. */
export function compileRoutingChecks(rows: readonly RoutingCheckSourceRow[]): RoutingCheckLine[] {
  const lines: RoutingCheckLine[] = [];
  for (const row of rows) {
    readRoutingChecks(row.assignmentRaw).forEach((check, index) => {
      lines.push({
        ...check,
        key: `${row.formTitle}#${row.itemId}#${index}`,
        formTitle: row.formTitle,
        itemId: row.itemId,
      });
    });
  }
  return lines.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export function matchesRoutingCheckView(line: RoutingCheckLine, view: RoutingCheckView): boolean {
  return view === "all" || VIEW_OUTCOMES[view].includes(line.outcome);
}

/** Whether the check was last made within the period, counted back from `now`. */
export function withinRoutingCheckPeriod(line: RoutingCheckLine, period: RoutingCheckPeriod, now: Date): boolean {
  if (period === "all") return true;
  const at = Date.parse(line.at);
  if (!Number.isFinite(at)) return false;
  return now.getTime() - at <= Number(period) * 24 * 60 * 60 * 1000;
}

/** Free-text match on the form, submission number and the people named on the line. */
export function matchesRoutingCheckSearch(line: RoutingCheckLine, search: string): boolean {
  const wanted = search.trim().toLowerCase();
  if (!wanted) return true;
  return [line.formTitle, `#${line.itemId}`, ...line.saved, ...line.routed, line.note ?? "", line.how ?? ""]
    .some((text) => text.toLowerCase().includes(wanted));
}

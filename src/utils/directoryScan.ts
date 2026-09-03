/**
 * directoryScan.ts — backfilling the Approval Directory from evaluation
 * submissions that already exist.
 *
 * Harvesting only catches people as they submit, which leaves everybody who
 * submitted before a form was switched on invisible. This reads the responses
 * of every opted-in form and works out who is missing.
 *
 * It plans and never writes. The admin sees the whole list, drops anything
 * wrong, and only then are rows created — because a scan of a year of
 * appraisals can propose a hundred people at once, and a hundred silent
 * guesses is not a feature.
 */
import {
  buildHarvestCandidate,
  harvestApproverEmail,
  hasEvaluationLayer,
  readHarvestConfig,
  type DirectoryHarvestCandidate,
  type DirectoryHarvestConfig,
} from "./directoryHarvest";
import { directoryEmailKey, type ApprovalDirectoryRow } from "./approvalDirectorySchema";

/** One form's opted-in harvest settings, as the scan needs them. */
export interface ScannableForm {
  formTitle: string;
  config: DirectoryHarvestConfig;
}

/** One person the scan proposes adding. */
export interface ScanProposal {
  candidate: DirectoryHarvestCandidate;
  /** The HOD guess, or "" when their department has none listed. */
  approverEmail: string;
  /** Which form, and how many of its submissions named them. */
  formTitle: string;
  seenCount: number;
}

export interface DirectoryScanPlan {
  /** Forms whose responses were read. */
  formsScanned: string[];
  /** Forms that opted in but could not be read, and why. */
  formsFailed: Array<{ formTitle: string; reason: string }>;
  submissionsRead: number;
  /** One entry per new person, most-recently-seen form first. */
  proposals: ScanProposal[];
  /**
   * Submissions that named somebody the scan could not key on — no address
   * submitted and no name to build one from. Counted rather than listed,
   * because there is nothing an admin could do with them here beyond fixing
   * the form's field mapping.
   */
  unkeyable: number;
  /** People already in the directory. Reported so a clean scan says so. */
  alreadyListed: number;
}

export const EMPTY_SCAN_PLAN: DirectoryScanPlan = {
  formsScanned: [],
  formsFailed: [],
  submissionsRead: 0,
  proposals: [],
  unkeyable: 0,
  alreadyListed: 0,
};

/**
 * Which forms a scan should read: switched on, and with an evaluation step to
 * read from.
 *
 * Takes the raw `LayerConfig` JSON string each form stores, because that is
 * what the form list hands back, and an unparseable one must be skipped rather
 * than stop the scan.
 */
export function scannableForms(
  forms: Array<{ Title?: string; LayerConfig?: string }>,
): ScannableForm[] {
  const scannable: ScannableForm[] = [];
  for (const form of forms) {
    const formTitle = (form.Title ?? "").trim();
    if (!formTitle || !form.LayerConfig) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(form.LayerConfig);
    } catch {
      continue;
    }

    const config = readHarvestConfig(parsed);
    if (config && hasEvaluationLayer(parsed)) scannable.push({ formTitle, config });
  }
  return scannable;
}

/** One form's submissions, as the planner needs them. */
export interface ScannedForm {
  formTitle: string;
  config: DirectoryHarvestConfig;
  /** Response items, each a bag of answers plus `SubmittedBy`. */
  responses: Array<Record<string, unknown>>;
}

/**
 * Works out who is missing, from responses already read.
 *
 * Pure, so the interesting decisions — who counts as new, which of several
 * sightings of one person wins — are testable without SharePoint.
 *
 * When two submissions describe the same person, the last one read wins: a
 * later appraisal carries their current department, and the department is what
 * the approver guess hangs on.
 */
export function planDirectoryScan(params: {
  forms: ScannedForm[];
  existing: ApprovalDirectoryRow[];
  failures?: Array<{ formTitle: string; reason: string }>;
  domain: string;
  /** The HOD for a department, or "" when there is none. */
  hodFor: (department: string) => string;
}): DirectoryScanPlan {
  const listed = new Set(
    params.existing.map((row) => directoryEmailKey(row.personEmail)).filter(Boolean),
  );

  const byEmail = new Map<string, ScanProposal>();
  let submissionsRead = 0;
  let unkeyable = 0;
  let alreadyListed = 0;

  for (const form of params.forms) {
    for (const response of form.responses) {
      submissionsRead++;
      const candidate = buildHarvestCandidate({
        config: form.config,
        data: response,
        submittedBy: String(response.SubmittedBy ?? ""),
        domain: params.domain,
      });
      if (!candidate) {
        unkeyable++;
        continue;
      }

      const key = directoryEmailKey(candidate.personEmail);
      if (listed.has(key)) {
        alreadyListed++;
        continue;
      }

      const seenCount = (byEmail.get(key)?.seenCount ?? 0) + 1;
      byEmail.set(key, {
        candidate,
        approverEmail: harvestApproverEmail(candidate, params.hodFor(candidate.department)),
        formTitle: form.formTitle,
        seenCount,
      });
    }
  }

  const proposals = [...byEmail.values()].sort((a, b) =>
    (a.candidate.personName || a.candidate.personEmail)
      .localeCompare(b.candidate.personName || b.candidate.personEmail));

  return {
    formsScanned: params.forms.map((form) => form.formTitle),
    formsFailed: params.failures ?? [],
    submissionsRead,
    proposals,
    unkeyable,
    alreadyListed,
  };
}

/** One line summing a plan up, for the dialog's heading. */
export function describeScanPlan(plan: DirectoryScanPlan): string {
  if (plan.formsScanned.length === 0 && plan.formsFailed.length === 0) {
    return "No form is set to add its submitters yet. Switch it on in the form builder, under Approval routing.";
  }
  if (plan.proposals.length === 0) {
    return `Read ${plan.submissionsRead} submission${plan.submissionsRead === 1 ? "" : "s"}. `
      + "Everybody they name is already in the directory.";
  }
  return `Read ${plan.submissionsRead} submission${plan.submissionsRead === 1 ? "" : "s"} and found `
    + `${plan.proposals.length} ${plan.proposals.length === 1 ? "person" : "people"} not in the directory.`;
}

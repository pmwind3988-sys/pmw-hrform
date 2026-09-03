/**
 * directoryHarvestWrite.ts — putting a harvested person into the directory,
 * over SharePoint REST.
 *
 * The decisions all live in `directoryHarvest.ts`, which is pure and mirrored
 * on the serverless side. This is only the I/O around them: read the HOD map,
 * check whether the person is already listed, write one unconfirmed row.
 *
 * Nothing here is allowed to throw at a submitter. Harvesting is a convenience
 * for the admin who maintains the org chart; a directory that cannot be read
 * or written must cost a note on the submission, never the submission.
 */
import {
  DIRECTORY_SOURCE,
  buildHarvestCandidate,
  harvestApproverEmail,
  harvestNote,
  harvestSource,
  type DirectoryHarvestCandidate,
  type DirectoryHarvestConfig,
} from "./directoryHarvest";
import {
  createApprovalDirectoryRow,
  loadApprovalDirectory,
  type ApprovalDirectoryInput,
  type DirectoryRowOrigin,
} from "./approvalDirectory";
import {
  directoryEmailKey,
  directoryTracksConfirmation,
  type ApprovalDirectoryRow,
  type DirectoryColumnMap,
} from "./approvalDirectorySchema";
import { loadDepartmentApproverDirectory } from "./departmentApproverDirectory";
import { getAllFormConfigs, spGet } from "./formBuilderSP";
import {
  planDirectoryScan,
  scannableForms,
  type DirectoryScanPlan,
  type ScanProposal,
  type ScannedForm,
} from "./directoryScan";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL as string || "").replace(/\/$/, "");

/**
 * The house email domain, used only to build an address for somebody the form
 * named but gave no address for. The first configured domain wins; a company
 * with several still has one everybody's mail is created under.
 */
export function internalEmailDomain(): string {
  const configured = String(import.meta.env.VITE_INTERNAL_EMAIL_DOMAINS || "pmw-group.com")
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  return configured[0] || "";
}

/** Department name reduced to a comparable key; departments are typed by hand. */
function departmentKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Which HOD each department has, from the Department Approver Directory. */
export async function loadDepartmentHodMap(token: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const directory = await loadDepartmentApproverDirectory(token, undefined);
    for (const entry of directory.entries) {
      const key = departmentKey(entry.department);
      // First row wins. A department listed twice is a directory problem the
      // health tab already reports; guessing between them here would only
      // make the guess less predictable.
      if (key && entry.approverEmail && !map.has(key)) {
        map.set(key, entry.approverEmail.trim().toLowerCase());
      }
    }
  } catch {
    // No HOD map means every guessed row gets a blank approver and says so.
  }
  return map;
}

export function hodForDepartment(hods: Map<string, string>, department: string): string {
  return hods.get(departmentKey(department)) ?? "";
}

/** Where a harvested row came from: a guess, and nobody has checked it. */
export function harvestedOrigin(candidate: DirectoryHarvestCandidate): DirectoryRowOrigin {
  return { source: harvestSource(candidate), confirmed: false };
}

/** The unconfirmed row a candidate becomes. */
export function harvestedRow(
  candidate: DirectoryHarvestCandidate,
  approverEmail: string,
): ApprovalDirectoryInput {
  return {
    personEmail: candidate.personEmail,
    personName: candidate.personName,
    department: candidate.department,
    company: candidate.company,
    // Blank unless the form actually asked. Never invented: a made-up Position
    // would put a role-holder layer onto somebody who does not hold the post.
    position: candidate.position,
    employeeId: candidate.employeeId,
    approverEmail,
    isActive: true,
  };
}

export interface HarvestResult {
  /** The person the submission described, when it described one at all. */
  candidate: DirectoryHarvestCandidate;
  /** The HOD guess, or "" when the department has none listed. */
  approverEmail: string;
  /** A row was written. False when the person was already listed, or on failure. */
  created: boolean;
  /**
   * One line for the submission's routing notes, or "" when there is nothing
   * to say — an already-listed person is the ordinary case, not news.
   */
  note: string;
}

/** Everyone already in the directory, keyed for comparison. */
export function directoryEmailSet(rows: ApprovalDirectoryRow[]): Set<string> {
  return new Set(rows.map((row) => directoryEmailKey(row.personEmail)).filter(Boolean));
}

/**
 * Harvests one submission's person, if this form asks for it and the person is
 * new. Returns null when there is nothing to do or nothing can be done.
 *
 * Reads the whole directory rather than querying for the one address, because
 * a submission harvests at most one person and the read is already how the
 * admin page loads: one request either way, and the same code path stays
 * exercised.
 */
export async function harvestSubmitter(
  token: string,
  params: {
    config: DirectoryHarvestConfig;
    data: Record<string, unknown>;
    submittedBy: string;
  },
): Promise<HarvestResult | null> {
  const candidate = buildHarvestCandidate({
    config: params.config,
    data: params.data,
    submittedBy: params.submittedBy,
    domain: internalEmailDomain(),
  });
  if (!candidate) return null;

  let rows: ApprovalDirectoryRow[];
  let columns: DirectoryColumnMap;
  try {
    const load = await loadApprovalDirectory(token);
    if (!load.usable) return null;
    rows = load.rows;
    columns = load.columns;
  } catch {
    return null;
  }

  if (directoryEmailSet(rows).has(directoryEmailKey(candidate.personEmail))) return null;

  if (!directoryTracksConfirmation(columns)) {
    // Refuse rather than write a guess the list cannot mark as one, and tell
    // the admin why on the submission itself.
    return {
      candidate,
      approverEmail: "",
      created: false,
      note: `Directory: ${candidate.personName || candidate.personEmail} is not in the Approval Directory, `
        + "and could not be added because the list has no Source and Confirmed columns. "
        + "Open the Approval routing page to add them.",
    };
  }

  const hods = await loadDepartmentHodMap(token);
  const approverEmail = harvestApproverEmail(candidate, hodForDepartment(hods, candidate.department));

  try {
    await createApprovalDirectoryRow(
      token,
      harvestedRow(candidate, approverEmail),
      columns,
      harvestedOrigin(candidate),
    );
  } catch {
    return {
      candidate,
      approverEmail,
      created: false,
      note: `Directory: ${candidate.personName || candidate.personEmail} is not in the Approval Directory `
        + "and could not be added automatically. Add them on the Approval routing page.",
    };
  }

  return { candidate, approverEmail, created: true, note: harvestNote(candidate, approverEmail) };
}

/** True for a row that was harvested and nobody has checked yet. */
export function isUnconfirmedRow(row: ApprovalDirectoryRow): boolean {
  return !row.confirmed && row.source !== DIRECTORY_SOURCE.manual;
}

/** True when the address on an unconfirmed row was built from the name. */
export function hasGuessedEmail(row: ApprovalDirectoryRow): boolean {
  return row.source === DIRECTORY_SOURCE.autoEmailGuessed;
}

/**
 * How many past submissions one form contributes to a scan.
 *
 * A cap rather than every row ever, because the scan is looking for people and
 * a form's hundredth appraisal of the same twenty staff adds nothing. Newest
 * first, so the cap drops the oldest — and an old row's department is the one
 * most likely to be out of date anyway.
 */
const SCAN_RESPONSES_PER_FORM = 2000;

/**
 * Reads every opted-in form's responses and works out who is missing from the
 * directory. Writes nothing.
 *
 * A form that cannot be read is reported rather than fatal: one form whose
 * response list was renamed should not hide the other five forms' new joiners.
 */
export async function runDirectoryScan(
  token: string,
  onProgress?: (done: number, total: number, formTitle: string) => void,
): Promise<DirectoryScanPlan> {
  const [configs, load, hods] = await Promise.all([
    getAllFormConfigs(token),
    loadApprovalDirectory(token),
    loadDepartmentHodMap(token),
  ]);

  const forms = scannableForms(configs);
  const scanned: ScannedForm[] = [];
  const failures: Array<{ formTitle: string; reason: string }> = [];

  let done = 0;
  for (const form of forms) {
    onProgress?.(done, forms.length, form.formTitle);
    try {
      scanned.push({
        formTitle: form.formTitle,
        config: form.config,
        responses: await readFormResponses(token, form.formTitle),
      });
    } catch (error) {
      failures.push({
        formTitle: form.formTitle,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    done++;
    onProgress?.(done, forms.length, form.formTitle);
  }

  return planDirectoryScan({
    forms: scanned,
    existing: load.rows,
    failures,
    domain: internalEmailDomain(),
    hodFor: (department) => hodForDepartment(hods, department),
  });
}

/** One form's stored responses, newest first. */
async function readFormResponses(
  token: string,
  formTitle: string,
): Promise<Array<Record<string, unknown>>> {
  /*
    Two conventions are in the ground, so both are tried.

    `provisionFormList` — the path a publish takes — creates the response list
    named exactly the form title, described as "Form responses for X". The
    older `provisionResponseList` used `<title> Responses`. Which one a form
    has depends on when it was made, and there is no flag saying which.

    Asked for directly rather than probed with `listExists` first: that helper
    answers false for any failure at all — a 403, a timeout, an expired token —
    so it would report a perfectly healthy list as missing and send an admin
    hunting for submissions that were never lost.

    No $select: the answers live in columns named after the form's own
    questions, and the field mapping decides which of them matter.
  */
  const candidates = [formTitle, `${formTitle} Responses`];
  const failures: string[] = [];

  for (const listName of candidates) {
    try {
      const data = await spGet(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items`
        + `?$orderby=Id desc&$top=${SCAN_RESPONSES_PER_FORM}`,
      ) as { value?: Array<Record<string, unknown>> };
      return data.value ?? [];
    } catch (error) {
      failures.push(`"${listName}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`no readable response list — tried ${failures.join("; ")}`);
}

export interface ScanApplyResult {
  created: number;
  failures: string[];
}

/**
 * Creates the rows an admin accepted, one at a time.
 *
 * Reports rather than aborts on a failure, and for the same reason the CSV
 * import does: half a scan that says which half is far more useful than a
 * rollback the admin cannot see into.
 */
export async function applyDirectoryScan(
  token: string,
  proposals: ScanProposal[],
  columns: DirectoryColumnMap,
  onProgress?: (done: number, total: number) => void,
): Promise<ScanApplyResult> {
  const failures: string[] = [];
  let created = 0;

  for (const proposal of proposals) {
    try {
      await createApprovalDirectoryRow(
        token,
        harvestedRow(proposal.candidate, proposal.approverEmail),
        columns,
        harvestedOrigin(proposal.candidate),
      );
      created++;
    } catch (error) {
      failures.push(
        `${proposal.candidate.personEmail}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    onProgress?.(created + failures.length, proposals.length);
  }

  return { created, failures };
}

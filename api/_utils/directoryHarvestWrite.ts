/**
 * directoryHarvestWrite.ts — putting a harvested person into the directory,
 * over Graph.
 *
 * The decisions all live in `directoryHarvest.ts`, which is pure and mirrored
 * on the client side. This is only the I/O around them: find the department's
 * HOD, check whether the person is already listed, write one unconfirmed row.
 * The client-side twin is `src/utils/directoryHarvestWrite.ts`; the transports
 * differ, the outcome must not.
 *
 * Nothing here is allowed to throw at a submitter. Harvesting is a convenience
 * for the admin who maintains the org chart; a directory that cannot be read
 * or written costs a note on the submission, never the submission.
 *
 * Note on permissions: the app-only principal can read and add list *items*
 * but cannot create *columns* (see api/AGENTS.md). So a directory that has
 * never been visited by an admin cannot be provisioned from here — the row is
 * refused and the submission says so, which is the same shape of answer a
 * directory gap already gives.
 */
import {
  createListItem,
  getListColumns,
  graphFieldEquals,
  queryListItems,
} from "./graphClient.js";
import {
  APPROVAL_DIRECTORY_COLUMNS,
  APPROVAL_DIRECTORY_LIST,
  directoryEmailKey,
  directoryIsUsable,
  directoryTracksConfirmation,
  mapDirectoryColumns,
  type DirectoryColumnMap,
} from "./approvalDirectorySchema.js";
import { DEPARTMENT_APPROVER_DEFAULTS } from "./departmentApproverLookup.js";
import {
  buildHarvestCandidate,
  harvestApproverEmail,
  harvestNote,
  harvestSource,
  type DirectoryHarvestCandidate,
  type DirectoryHarvestConfig,
} from "./directoryHarvest.js";
import { logWarn } from "./logger.js";

/**
 * The house email domain, used only to build an address for somebody the form
 * named but gave no address for. `VITE_`-prefixed because the client reads the
 * same setting, and one company has one answer.
 */
function internalEmailDomain(): string {
  const configured = String(
    process.env.INTERNAL_EMAIL_DOMAINS || process.env.VITE_INTERNAL_EMAIL_DOMAINS || "pmw-group.com",
  )
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  return configured[0] || "";
}

function valueToText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/** The HOD listed for one department, or "" when there is none to be had. */
async function lookupDepartmentHod(token: string, department: string): Promise<string> {
  const wanted = department.trim();
  if (!wanted) return "";

  try {
    const matches = await queryListItems(token, DEPARTMENT_APPROVER_DEFAULTS.listName, {
      filter: [
        graphFieldEquals(DEPARTMENT_APPROVER_DEFAULTS.departmentColumn, wanted),
        graphFieldEquals(DEPARTMENT_APPROVER_DEFAULTS.roleColumn, DEPARTMENT_APPROVER_DEFAULTS.roleValue),
      ].join(" and "),
      top: 2,
      preferNonIndexed: true,
    });
    // More than one HOD for a department is a directory problem, not a choice
    // to make silently: leave the approver blank so the admin is asked.
    if (matches.length !== 1) return "";
    return valueToText(matches[0].fields[DEPARTMENT_APPROVER_DEFAULTS.emailColumn]).toLowerCase();
  } catch (error) {
    logWarn("api:directory-harvest", "Could not read the department HOD", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}

/** The list's real columns, or null when it cannot answer anything. */
async function directoryColumns(token: string): Promise<DirectoryColumnMap | null> {
  try {
    const available = await getListColumns(token, APPROVAL_DIRECTORY_LIST);
    const map = mapDirectoryColumns(available.map((column) => ({
      key: column.name,
      aliases: [column.name, column.displayName].filter(Boolean),
    })));
    return directoryIsUsable(map) ? map : null;
  } catch (error) {
    logWarn("api:directory-harvest", "Could not read directory columns", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Whether this person already has a row, active or not. */
async function alreadyListed(
  token: string,
  map: DirectoryColumnMap,
  email: string,
): Promise<boolean> {
  if (!map.personEmail) return true;
  try {
    const matches = await queryListItems(token, APPROVAL_DIRECTORY_LIST, {
      filter: graphFieldEquals(map.personEmail, directoryEmailKey(email)),
      top: 1,
      preferNonIndexed: true,
    });
    return matches.length > 0;
  } catch (error) {
    // A read that failed is not evidence the person is new. Treat them as
    // listed so a transient Graph error cannot mint duplicate rows.
    logWarn("api:directory-harvest", "Could not check for an existing row", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

/** The item body for one unconfirmed row, addressed to the real columns. */
function harvestedItemFields(
  candidate: DirectoryHarvestCandidate,
  approverEmail: string,
  map: DirectoryColumnMap,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const put = (field: keyof DirectoryColumnMap, value: unknown): void => {
    const column = map[field];
    if (column) fields[column] = value;
  };

  put("personEmail", candidate.personEmail);
  put("personName", candidate.personName);
  put("department", candidate.department);
  put("company", candidate.company);
  // Position is not asked for on an evaluation form, and inventing one would
  // put a role-holder layer onto somebody who may not hold the post.
  put("position", "");
  put("employeeId", candidate.employeeId);
  put("approverEmail", approverEmail);
  put("isActive", true);
  put("source", harvestSource(candidate));
  put("confirmed", false);

  // A generic SharePoint list still requires Title.
  fields.Title = candidate.personName || candidate.personEmail;
  return fields;
}

export interface HarvestResult {
  candidate: DirectoryHarvestCandidate;
  approverEmail: string;
  created: boolean;
  /** One line for the submission's routing notes. */
  note: string;
}

/**
 * Harvests one submission's person, if this form asks for it and the person is
 * new. Returns null when there is nothing to do or nothing to say.
 */
export async function harvestSubmitter(params: {
  token: string;
  config: DirectoryHarvestConfig;
  data: Record<string, unknown>;
  submittedBy: string;
}): Promise<HarvestResult | null> {
  const candidate = buildHarvestCandidate({
    config: params.config,
    data: params.data,
    submittedBy: params.submittedBy,
    domain: internalEmailDomain(),
  });
  if (!candidate) return null;

  const map = await directoryColumns(params.token);
  if (!map) return null;

  if (await alreadyListed(params.token, map, candidate.personEmail)) return null;

  const who = candidate.personName || candidate.personEmail;

  if (!directoryTracksConfirmation(map)) {
    const missing = [
      map.source ? "" : APPROVAL_DIRECTORY_COLUMNS.source,
      map.confirmed ? "" : APPROVAL_DIRECTORY_COLUMNS.confirmed,
    ].filter(Boolean).join(" and ");
    // Refuse rather than write a guess the list cannot mark as one: an
    // unmarked guess reads as an answer, and would route somebody's appraisal
    // to an address nobody checked.
    return {
      candidate,
      approverEmail: "",
      created: false,
      note: `Directory: ${who} is not in the Approval Directory, and could not be added because the list `
        + `has no ${missing} column. Open the Approval routing page to add it.`,
    };
  }

  const approverEmail = harvestApproverEmail(
    candidate,
    await lookupDepartmentHod(params.token, candidate.department),
  );

  try {
    await createListItem(
      params.token,
      APPROVAL_DIRECTORY_LIST,
      harvestedItemFields(candidate, approverEmail, map),
    );
  } catch (error) {
    logWarn("api:directory-harvest", "Could not add the harvested row", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return {
      candidate,
      approverEmail,
      created: false,
      note: `Directory: ${who} is not in the Approval Directory and could not be added automatically. `
        + "Add them on the Approval routing page.",
    };
  }

  return { candidate, approverEmail, created: true, note: harvestNote(candidate, approverEmail) };
}

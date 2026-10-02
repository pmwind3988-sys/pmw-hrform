/**
 * publicSubmissionLinkWrite.ts — the I/O around `publicSubmissionLink.ts`:
 * reading the directory, stamping a link on a response row, and the one-off
 * re-scan of public submissions made before linking existed.
 *
 * Nothing here may fail a submission. A link is a convenience added after the
 * row is safely stored, so every entry point that runs on the submit path
 * swallows its own errors.
 */
import { queryAllListItems, updateListItemFields, type GraphListItem } from "./graphClient.js";
import { APPROVAL_DIRECTORY_LIST, toApprovalDirectoryRow } from "./approvalDirectorySchema.js";
import { directoryColumns } from "./directoryHarvestWrite.js";
import { employeeIdKey, optionsFromSubmittedData, subjectFieldMapping } from "./directoryHarvest.js";
import { logWarn } from "./logger.js";
import { isSuperuserOnlyForm } from "./superuserOnlyForms.js";
import { ensureTextFieldViaSPRest } from "./sharepointRest.js";
import {
  LINK_COLUMNS,
  isPublicSubmitter,
  linkFieldsFor,
  matchPublicSubmissionToPerson,
  type LinkableRow,
} from "./publicSubmissionLink.js";

const MASTER_FORM_LIST = "Master Form";
/** Same ceilings the guest "what have I sent" read uses, for the same reasons. */
const MAX_FORMS = 60;
const MAX_ROWS_PER_LIST = 2000;
/** Stops a re-scan before the serverless function's own limit cuts it off mid-write. */
const RESCAN_BUDGET_MS = 40_000;

/** Written to `LinkedMatch` when an admin cleared a link, so a re-scan leaves it alone. */
export const LINK_CLEARED = "none";
export const LINK_MANUAL = "manual";

export async function loadLinkableDirectory(token: string): Promise<LinkableRow[] | null> {
  try {
    const map = await directoryColumns(token);
    if (!map) return null;
    const items = await queryAllListItems(token, APPROVAL_DIRECTORY_LIST);
    return items.map((item) => toApprovalDirectoryRow(item.fields, map));
  } catch (error) {
    logWarn("api:public-link", "Could not read the directory to link a submission", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Links one freshly stored public submission. Never throws; answers whether a
 * person was found.
 */
export async function linkNewPublicSubmission(params: {
  token: string;
  listTitle: string;
  itemId: string | number;
  data: Record<string, unknown>;
  layerConfig: unknown;
}): Promise<boolean> {
  try {
    const rows = await loadLinkableDirectory(params.token);
    if (!rows) return false;
    const mapping = subjectFieldMapping(params.layerConfig, optionsFromSubmittedData(params.data));
    const link = matchPublicSubmissionToPerson(rows, params.data, mapping);
    if (!link) return false;
    await updateListItemFields(params.token, params.listTitle, String(params.itemId), linkFieldsFor(link));
    return true;
  } catch (error) {
    logWarn("api:public-link", "Could not link a public submission to a person", {
      listTitle: params.listTitle,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function registeredForms(token: string): Promise<Array<{ title: string; layerConfig: unknown }>> {
  const items = await queryAllListItems(token, MASTER_FORM_LIST, { maxItems: MAX_FORMS });
  const seen = new Set<string>();
  const forms: Array<{ title: string; layerConfig: unknown }> = [];
  for (const item of items) {
    const title = String(item.fields?.Title ?? "").trim();
    if (!title || seen.has(title) || isSuperuserOnlyForm(title)) continue;
    seen.add(title);
    forms.push({ title, layerConfig: parseJson(item.fields?.LayerConfig) });
  }
  return forms;
}

/** Whether a title is a registered form — an admin may only touch lists the app owns. */
export async function isRegisteredForm(token: string, listTitle: string): Promise<boolean> {
  return (await registeredForms(token)).some((form) => form.title === listTitle);
}

function alreadyDecided(fields: Record<string, unknown>): boolean {
  return ["LinkedUserEmail", "LinkedEmployeeId", "LinkedMatch"].some((name) => {
    const value = fields[name];
    return typeof value === "string" && value.trim() !== "";
  });
}

export interface RelinkSummary {
  formsScanned: number;
  submissionsChecked: number;
  linked: number;
  unmatched: number;
  /** Forms whose response list could not be read or given the link columns. */
  skippedForms: string[];
  /** True when the time budget ran out before every form was reached. */
  incomplete: boolean;
}

/**
 * Looks at every public submission that has not been decided yet and links the
 * ones it can name. `appToken` reads and writes rows; `spToken` is the admin's
 * own SharePoint token, needed because the app-only principal cannot create the
 * link columns on a form published before they existed.
 */
export async function relinkPublicSubmissions(params: {
  appToken: string;
  spToken: string;
  onlyListTitle?: string;
}): Promise<RelinkSummary> {
  const summary: RelinkSummary = {
    formsScanned: 0, submissionsChecked: 0, linked: 0, unmatched: 0, skippedForms: [], incomplete: false,
  };
  const rows = await loadLinkableDirectory(params.appToken);
  if (!rows) throw new Error("The Approval Directory could not be read.");

  const startedAt = Date.now();
  const forms = (await registeredForms(params.appToken))
    .filter((form) => !params.onlyListTitle || form.title === params.onlyListTitle);

  for (const form of forms) {
    if (Date.now() - startedAt > RESCAN_BUDGET_MS) {
      summary.incomplete = true;
      break;
    }

    let items: GraphListItem[];
    try {
      items = await queryAllListItems(params.appToken, form.title, { maxItems: MAX_ROWS_PER_LIST });
    } catch {
      summary.skippedForms.push(form.title);
      continue;
    }

    const pending = items.filter((item) => {
      const fields = item.fields || {};
      return isPublicSubmitter(fields.SubmittedBy) && !alreadyDecided(fields);
    });
    summary.formsScanned += 1;
    if (pending.length === 0) continue;

    try {
      for (const column of Object.values(LINK_COLUMNS)) {
        await ensureTextFieldViaSPRest(params.spToken, form.title, column, column);
      }
    } catch (error) {
      logWarn("api:public-link", "Could not add the link columns to a response list", {
        listTitle: form.title,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      summary.skippedForms.push(form.title);
      continue;
    }

    for (const item of pending) {
      summary.submissionsChecked += 1;
      const data = item.fields || {};
      const mapping = subjectFieldMapping(form.layerConfig, optionsFromSubmittedData(data));
      const link = matchPublicSubmissionToPerson(rows, data, mapping);
      if (!link) {
        summary.unmatched += 1;
        continue;
      }
      try {
        await updateListItemFields(params.appToken, form.title, String(item.id), linkFieldsFor(link));
        summary.linked += 1;
      } catch {
        summary.unmatched += 1;
      }
    }
  }
  return summary;
}

/**
 * An admin's correction. `person` is a directory email or staff number; blank
 * clears the link and records that it was cleared on purpose.
 */
export async function setSubmissionLink(params: {
  appToken: string;
  spToken: string;
  listTitle: string;
  itemId: string;
  person: string;
}): Promise<{ ok: true; linkedTo: string } | { ok: false; error: string }> {
  const person = params.person.trim();
  const columns = Object.values(LINK_COLUMNS);

  try {
    for (const column of columns) {
      await ensureTextFieldViaSPRest(params.spToken, params.listTitle, column, column);
    }
  } catch {
    return { ok: false, error: "The link columns could not be added to this form's list." };
  }

  if (!person) {
    await updateListItemFields(params.appToken, params.listTitle, params.itemId, {
      [LINK_COLUMNS.email]: "",
      [LINK_COLUMNS.employeeId]: "",
      [LINK_COLUMNS.method]: LINK_CLEARED,
    });
    return { ok: true, linkedTo: "" };
  }

  const rows = await loadLinkableDirectory(params.appToken);
  if (!rows) return { ok: false, error: "The Approval Directory could not be read." };

  const wantedEmail = person.toLowerCase();
  const wantedNumber = employeeIdKey(person);
  const matches = rows.filter((row) =>
    row.personEmail.trim().toLowerCase() === wantedEmail
    || (!!wantedNumber && employeeIdKey(row.employeeId) === wantedNumber));
  if (matches.length === 0) return { ok: false, error: "Nobody in the Approval Directory has that email or staff number." };
  if (matches.length > 1) return { ok: false, error: "More than one person matches. Use their email address." };

  const row = matches[0];
  await updateListItemFields(params.appToken, params.listTitle, params.itemId, {
    ...linkFieldsFor({ row, method: "staff-number" }),
    [LINK_COLUMNS.method]: LINK_MANUAL,
  });
  return { ok: true, linkedTo: row.personName || row.personEmail || row.employeeId };
}

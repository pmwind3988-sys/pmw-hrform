/**
 * approvalDirectory.ts — reads the `Approval Directory` list over SharePoint REST.
 *
 * The serverless equivalent is `api/_utils/approvalDirectory.ts`, which goes
 * over Graph. Only the transport differs; both feed the same `lookupPerson` /
 * `lookupRoleHolder` ports on the shared resolver, and the column names come
 * from the mirrored schema module so the two cannot disagree.
 *
 * Every lookup answers `null` rather than throwing when a person or role is
 * missing — a directory gap parks one submission for an admin to resolve, and
 * must never be the reason a submission is lost.
 */
import {
  SP_FIELD_KIND,
  ensureColumns,
  ensureSpList,
  listExists,
  spDelete,
  spGet,
  spPatch,
  spPost,
} from "./formBuilderSP";
import {
  APPROVAL_DIRECTORY_COLUMNS,
  APPROVAL_DIRECTORY_LIST,
  REQUIRED_DIRECTORY_FIELDS,
  directoryEmailKey,
  directoryIsUsable,
  mapDirectoryColumns,
  missingDirectoryColumns,
  toApprovalDirectoryRow,
  type DirectoryColumnMap,
  type ApprovalDirectoryRow,
} from "./approvalDirectorySchema";
import { DIRECTORY_SOURCE, type DirectorySource } from "./directoryHarvest";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL as string || "").replace(/\/$/, "");

/**
 * Whether a row is an answer routing may act on.
 *
 * An unconfirmed row is a guess a form made and nobody has checked — a
 * question put to an admin, not an answer. Treating it as one would route
 * somebody's appraisal to an address that was invented from their name.
 * Skipping it makes the layer park instead, which is the whole point of
 * marking it unconfirmed in the first place.
 *
 * A directory without the `Confirmed` column reads every row as confirmed, so
 * a hand-kept list routes exactly as it always has.
 */
function isRoutableRow(row: ApprovalDirectoryRow): boolean {
  return row.isActive && row.confirmed;
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

interface ExistingField {
  Title?: string;
  InternalName?: string;
  StaticName?: string;
  EntityPropertyName?: string;
}

/**
 * The list's real columns, matched against the ones we look for.
 *
 * Resolved once per reader rather than assumed, because a column's internal
 * name rarely equals what somebody typed, and selecting a name that does not
 * exist fails the whole request — one mismatched column would otherwise make a
 * correct directory look completely empty.
 */
export async function resolveDirectoryColumns(token: string): Promise<DirectoryColumnMap> {
  const data = await spGet(
    token,
    `${listUrl()}/fields?$select=Title,InternalName,StaticName,EntityPropertyName&$top=5000`,
  ) as { value?: ExistingField[] };

  return mapDirectoryColumns((data.value ?? []).map((field) => ({
    key: field.EntityPropertyName || field.InternalName || field.StaticName || field.Title || "",
    aliases: [field.Title, field.InternalName, field.StaticName, field.EntityPropertyName]
      .filter((alias): alias is string => !!alias),
  })).filter((column) => column.key));
}

function selectFor(map: DirectoryColumnMap): string {
  return ["Id", ...Object.values(map).filter((column): column is string => !!column)].join(",");
}

/**
 * Creates the list and its columns if they are not there yet.
 *
 * Must run on an admin's **delegated** token: the app-only Graph principal gets
 * 403 accessDenied when creating columns (see the app-only note in
 * api/AGENTS.md), which is why provisioning lives on this side and not in the
 * serverless routes.
 */
export async function ensureApprovalDirectory(token: string): Promise<void> {
  await ensureSpList(token, APPROVAL_DIRECTORY_LIST, {
    description: "Who approves whom. One row per person; ApproverEmail carries the reporting line.",
  });
  await ensureColumns(token, APPROVAL_DIRECTORY_LIST, [
    { n: APPROVAL_DIRECTORY_COLUMNS.personEmail, k: SP_FIELD_KIND.text },
    { n: APPROVAL_DIRECTORY_COLUMNS.personName, k: SP_FIELD_KIND.text },
    { n: APPROVAL_DIRECTORY_COLUMNS.department, k: SP_FIELD_KIND.text },
    { n: APPROVAL_DIRECTORY_COLUMNS.company, k: SP_FIELD_KIND.text },
    { n: APPROVAL_DIRECTORY_COLUMNS.position, k: SP_FIELD_KIND.text },
    { n: APPROVAL_DIRECTORY_COLUMNS.employeeId, k: SP_FIELD_KIND.text },
    { n: APPROVAL_DIRECTORY_COLUMNS.approverEmail, k: SP_FIELD_KIND.text },
    { n: APPROVAL_DIRECTORY_COLUMNS.isActive, k: SP_FIELD_KIND.boolean },
    { n: APPROVAL_DIRECTORY_COLUMNS.source, k: SP_FIELD_KIND.text },
    { n: APPROVAL_DIRECTORY_COLUMNS.confirmed, k: SP_FIELD_KIND.boolean },
  ]);
}

/** Whether the list exists at all, for telling "not set up" from "not listed". */
export async function approvalDirectoryExists(token: string): Promise<boolean> {
  return listExists(token, APPROVAL_DIRECTORY_LIST);
}

function listUrl(): string {
  return `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(APPROVAL_DIRECTORY_LIST)}')`;
}

export interface ApprovalDirectoryInput {
  personEmail: string;
  personName: string;
  department: string;
  company: string;
  position: string;
  employeeId: string;
  approverEmail: string;
  isActive: boolean;
}

/**
 * Where a row came from, kept apart from the fields an admin edits.
 *
 * Only the harvester passes this. Everything else — the dialog, the CSV
 * import — is an admin putting a row there deliberately, which is what the
 * default says. It matters that saving a row confirms it: an admin who opened
 * a guessed row and pressed save has reviewed it, and should not then have to
 * confirm it a second time.
 */
export interface DirectoryRowOrigin {
  source: DirectorySource;
  confirmed: boolean;
}

const ADMIN_ORIGIN: DirectoryRowOrigin = {
  source: DIRECTORY_SOURCE.manual,
  confirmed: true,
};

export const EMPTY_APPROVAL_DIRECTORY_INPUT: ApprovalDirectoryInput = {
  personEmail: "",
  personName: "",
  department: "",
  company: "",
  position: "",
  employeeId: "",
  approverEmail: "",
  isActive: true,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Everything wrong with a row, in the order an admin would fix it. Returns an
 * empty array when the row is usable.
 *
 * A person may legitimately have no approver — that is the top of the line, and
 * the resolver treats it as a stopping point rather than an error.
 */
export function validateApprovalDirectoryInput(
  input: ApprovalDirectoryInput,
  existing: ApprovalDirectoryRow[],
  editingId?: number,
): string[] {
  const problems: string[] = [];
  const email = input.personEmail.trim();

  if (!email) {
    problems.push("A person's email is required — it is what the row is keyed on.");
  } else if (!EMAIL_RE.test(email)) {
    problems.push(`"${email}" is not a valid email address.`);
  } else if (
    existing.some((row) => row.id !== editingId && directoryEmailKey(row.personEmail) === directoryEmailKey(email))
  ) {
    problems.push(`${email} is already listed. Edit that row instead of adding a second one.`);
  }

  const approver = input.approverEmail.trim();
  if (approver && !EMAIL_RE.test(approver)) {
    problems.push(`"${approver}" is not a valid approver email address.`);
  }
  if (approver && directoryEmailKey(approver) === directoryEmailKey(email)) {
    problems.push("A person cannot be their own approver.");
  }

  return problems;
}

/**
 * The item body for a write, addressed to the columns the list actually has.
 *
 * Reads have always gone through the resolved column map; writes used the
 * canonical spellings, and the two disagree the moment a column was made by
 * hand. A list whose column is `EmployeeID` rather than `EmployeeId` reads
 * perfectly — the map is case-insensitive — and then fails every single save
 * with SharePoint's "property does not exist on type", because one unknown
 * property rejects the whole request rather than being ignored.
 *
 * A field with no column at all is left out, so a list missing `EmployeeId`
 * saves the six fields it can hold instead of refusing the row.
 */
export function directoryItemBody(
  input: ApprovalDirectoryInput,
  isNew: boolean,
  map: DirectoryColumnMap,
  origin: DirectoryRowOrigin = ADMIN_ORIGIN,
): Record<string, unknown> {
  const missing = REQUIRED_DIRECTORY_FIELDS
    .filter((field) => !map[field])
    .map((field) => APPROVAL_DIRECTORY_COLUMNS[field]);
  if (missing.length > 0) {
    throw new Error(
      `"${APPROVAL_DIRECTORY_LIST}" has no ${missing.join(" or ")} column, so there is nowhere to store who approves whom. Add the missing columns first.`,
    );
  }

  const body: Record<string, unknown> = {};
  const put = (field: keyof DirectoryColumnMap, value: unknown): void => {
    const column = map[field];
    if (column) body[column] = value;
  };

  put("personEmail", input.personEmail.trim().toLowerCase());
  put("personName", input.personName.trim());
  put("department", input.department.trim());
  put("company", input.company.trim());
  put("position", input.position.trim());
  put("employeeId", input.employeeId.trim());
  put("approverEmail", input.approverEmail.trim().toLowerCase());
  put("isActive", input.isActive);
  put("source", origin.source);
  put("confirmed", origin.confirmed);

  // A generic SharePoint list still requires Title; mirror the person into it
  // on create only, so a hand-maintained title survives later edits.
  if (isNew) body.Title = input.personName.trim() || input.personEmail.trim();
  return body;
}

export interface ApprovalDirectoryLoad {
  rows: ApprovalDirectoryRow[];
  /**
   * Which real column backs each field. Writes need this as much as reads do —
   * see `directoryItemBody` — so it is handed back rather than resolved twice.
   */
  columns: DirectoryColumnMap;
  /** Expected names of columns the list does not have, for the admin to add. */
  missingColumns: string[];
  /** False when the list lacks the columns needed to answer anything at all. */
  usable: boolean;
}

/**
 * Every row, sorted by department then name.
 *
 * Reports missing columns rather than quietly returning nothing: a directory
 * that looks empty because one column name is off is the single most confusing
 * failure this feature can have.
 */
export async function loadApprovalDirectory(token: string): Promise<ApprovalDirectoryLoad> {
  const map = await resolveDirectoryColumns(token);
  const missingColumns = missingDirectoryColumns(map);
  if (!directoryIsUsable(map)) {
    return { rows: [], columns: map, missingColumns, usable: false };
  }

  const rows = (await queryDirectory(token, map, "", 5000)).sort((a, b) =>
    a.department.localeCompare(b.department)
    || (a.personName || a.personEmail).localeCompare(b.personName || b.personEmail));

  return { rows, columns: map, missingColumns, usable: true };
}

export async function createApprovalDirectoryRow(
  token: string,
  input: ApprovalDirectoryInput,
  columns: DirectoryColumnMap,
  origin?: DirectoryRowOrigin,
): Promise<void> {
  await spPost(token, `${listUrl()}/items`, directoryItemBody(input, true, columns, origin));
}

export async function updateApprovalDirectoryRow(
  token: string,
  id: number,
  input: ApprovalDirectoryInput,
  columns: DirectoryColumnMap,
  origin?: DirectoryRowOrigin,
): Promise<void> {
  await spPatch(token, `${listUrl()}/items(${id})`, directoryItemBody(input, false, columns, origin));
}

/**
 * Marks a row as checked without touching anything else on it.
 *
 * Separate from an edit so an admin can accept a guess in one click from the
 * table, rather than opening a dialog only to press save.
 */
export async function confirmApprovalDirectoryRow(
  token: string,
  id: number,
  columns: DirectoryColumnMap,
): Promise<void> {
  if (!columns.confirmed) {
    throw new Error(
      `"${APPROVAL_DIRECTORY_LIST}" has no ${APPROVAL_DIRECTORY_COLUMNS.confirmed} column, so there is nowhere to record that the row was checked.`,
    );
  }
  await spPatch(token, `${listUrl()}/items(${id})`, { [columns.confirmed]: true });
}

/**
 * What a row's origin becomes after an admin edits it.
 *
 * An edit used to make every row manual and confirmed, which meant correcting
 * one wrong field — an address the harvester invented, most often — also
 * declared the rest of the row checked and let routing act on it. With a
 * hundred guessed addresses to fix that is the wrong default: the two passes
 * an admin actually makes are "get the addresses right" and then "agree the
 * reporting line", and the first must not silently perform the second.
 *
 * So an edit preserves what the row is, and only the admin's own tick moves it
 * to confirmed. Two details matter:
 *
 * - The source is kept rather than reset to manual, because `isUnconfirmedRow`
 *   reads it: turning it manual would drop the row out of the review list
 *   whatever `Confirmed` said.
 * - A corrected address downgrades `auto-email-guessed` to `auto`, so the
 *   "address guessed" badge stops claiming something that is no longer true.
 *
 * A row an admin created, or has already confirmed, has nothing to preserve.
 */
export function editOrigin(
  previous: { source: string; confirmed: boolean } | undefined,
  emailChanged: boolean,
  confirm: boolean,
): DirectoryRowOrigin {
  if (!previous || previous.source === DIRECTORY_SOURCE.manual) return ADMIN_ORIGIN;
  const source = emailChanged && previous.source === DIRECTORY_SOURCE.autoEmailGuessed
    ? DIRECTORY_SOURCE.auto
    : previous.source as DirectorySource;
  return { source, confirmed: previous.confirmed || confirm };
}

/**
 * Everyone whose approver is this address.
 *
 * An address is the only thing a row is joined on, so changing somebody's
 * email leaves every row that pointed at the old one pointing at nobody — a
 * broken line that shows up as a parked submission weeks later. The callers
 * use this to move those rows across in the same action.
 */
export function dependentsOf(
  rows: ApprovalDirectoryRow[],
  email: string,
  excludeId?: number,
): ApprovalDirectoryRow[] {
  const key = directoryEmailKey(email);
  if (!key) return [];
  return rows.filter((row) => (
    row.id !== undefined
    && row.id !== excludeId
    && directoryEmailKey(row.approverEmail) === key
  ));
}

/**
 * Changes one person's address, leaving the rest of the row alone.
 *
 * A whole-row save would work, but this is what the table's inline edit sends
 * and a narrower write is a narrower blast radius: an admin fixing a hundred
 * addresses cannot accidentally overwrite a field they never looked at.
 */
export async function updateDirectoryPersonEmail(
  token: string,
  id: number,
  email: string,
  columns: DirectoryColumnMap,
  origin?: DirectoryRowOrigin,
): Promise<void> {
  if (!columns.personEmail) {
    throw new Error(
      `"${APPROVAL_DIRECTORY_LIST}" has no ${APPROVAL_DIRECTORY_COLUMNS.personEmail} column.`,
    );
  }
  const body: Record<string, unknown> = { [columns.personEmail]: email.trim().toLowerCase() };
  if (origin) {
    if (columns.source) body[columns.source] = origin.source;
    if (columns.confirmed) body[columns.confirmed] = origin.confirmed;
  }
  await spPatch(token, `${listUrl()}/items(${id})`, body);
}

/** Repoints one row at a different approver, leaving the rest of it alone. */
export async function updateDirectoryApproverEmail(
  token: string,
  id: number,
  email: string,
  columns: DirectoryColumnMap,
): Promise<void> {
  if (!columns.approverEmail) {
    throw new Error(
      `"${APPROVAL_DIRECTORY_LIST}" has no ${APPROVAL_DIRECTORY_COLUMNS.approverEmail} column.`,
    );
  }
  await spPatch(token, `${listUrl()}/items(${id})`, {
    [columns.approverEmail]: email.trim().toLowerCase(),
  });
}

/**
 * Removes a row outright. Prefer switching `isActive` off for a leaver: their
 * old submissions stay readable, and the resolver already skips inactive rows.
 */
export async function deleteApprovalDirectoryRow(token: string, id: number): Promise<void> {
  await spDelete(token, `${listUrl()}/items(${id})`);
}

async function queryDirectory(
  token: string,
  map: DirectoryColumnMap,
  filter: string,
  top: number,
): Promise<ApprovalDirectoryRow[]> {
  const params = new URLSearchParams();
  params.set("$select", selectFor(map));
  if (filter) params.set("$filter", filter);
  params.set("$top", String(top));

  const data = await spGet(
    token,
    `${listUrl()}/items?${params.toString()}`,
  ) as { value?: Record<string, unknown>[] };

  return (data.value ?? []).map((item) => ({
    ...toApprovalDirectoryRow(item, map),
    id: Number(item.Id) || undefined,
  }));
}

/**
 * One request per distinct address, cached for the life of the reader. Walking
 * a chain re-reads the same rows, since each hop's target is the next hop's
 * subject. The column map is resolved once and shared by both lookups.
 */
export function createApprovalDirectoryReader(token: string) {
  const people = new Map<string, ApprovalDirectoryRow | null>();
  let columnsPromise: Promise<DirectoryColumnMap | null> | null = null;

  /** null when the list is absent or too incomplete to answer anything. */
  function columns(): Promise<DirectoryColumnMap | null> {
    // A missing list is the normal state before the directory is set up, so
    // this resolves to null rather than throwing: the layer parks with a
    // useful message instead of the submission failing.
    columnsPromise ??= resolveDirectoryColumns(token)
      .then((map) => (directoryIsUsable(map) ? map : null))
      .catch(() => null);
    return columnsPromise;
  }

  async function lookupPerson(email: string): Promise<ApprovalDirectoryRow | null> {
    const key = directoryEmailKey(email);
    if (!key) return null;

    const cached = people.get(key);
    if (cached !== undefined) return cached;

    const map = await columns();
    const row = map
      ? await queryDirectory(token, map, `${map.personEmail} eq '${escapeODataString(key)}'`, 2)
        .then((matches) => matches.find(isRoutableRow) ?? null)
        .catch(() => null)
      : null;

    people.set(key, row);
    return row;
  }

  async function lookupRoleHolder(
    department: string,
    role: string,
  ): Promise<{ email: string; name: string } | null> {
    const wantedDepartment = department.trim();
    const wantedRole = role.trim();
    if (!wantedDepartment || !wantedRole) return null;

    const map = await columns();
    // Role lookup needs the two columns that describe the post, which are
    // optional for chain routing and so may genuinely be absent.
    if (!map?.department || !map.position) return null;

    try {
      const matches = await queryDirectory(
        token,
        map,
        [
          `${map.department} eq '${escapeODataString(wantedDepartment)}'`,
          `${map.position} eq '${escapeODataString(wantedRole)}'`,
        ].join(" and "),
        2,
      );
      const holder = matches.find((candidate) => isRoutableRow(candidate) && candidate.personEmail);
      return holder ? { email: holder.personEmail, name: holder.personName } : null;
    } catch {
      return null;
    }
  }

  return {
    lookupPerson: async (email: string) => {
      const row = await lookupPerson(email);
      return row
        ? {
          email: row.personEmail,
          name: row.personName,
          department: row.department,
          position: row.position,
          approverEmail: row.approverEmail,
        }
        : null;
    },
    lookupRoleHolder,
  };
}

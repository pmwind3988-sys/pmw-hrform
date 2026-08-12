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
  directoryEmailKey,
  toApprovalDirectoryRow,
  type ApprovalDirectoryRow,
} from "./approvalDirectorySchema";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL as string || "").replace(/\/$/, "");

const SELECT_COLUMNS = [
  "Id",
  APPROVAL_DIRECTORY_COLUMNS.personEmail,
  APPROVAL_DIRECTORY_COLUMNS.personName,
  APPROVAL_DIRECTORY_COLUMNS.department,
  APPROVAL_DIRECTORY_COLUMNS.position,
  APPROVAL_DIRECTORY_COLUMNS.employeeId,
  APPROVAL_DIRECTORY_COLUMNS.approverEmail,
  APPROVAL_DIRECTORY_COLUMNS.isActive,
].join(",");

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
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
    { n: APPROVAL_DIRECTORY_COLUMNS.position, k: SP_FIELD_KIND.text },
    { n: APPROVAL_DIRECTORY_COLUMNS.employeeId, k: SP_FIELD_KIND.text },
    { n: APPROVAL_DIRECTORY_COLUMNS.approverEmail, k: SP_FIELD_KIND.text },
    { n: APPROVAL_DIRECTORY_COLUMNS.isActive, k: SP_FIELD_KIND.boolean },
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
  position: string;
  employeeId: string;
  approverEmail: string;
  isActive: boolean;
}

export const EMPTY_APPROVAL_DIRECTORY_INPUT: ApprovalDirectoryInput = {
  personEmail: "",
  personName: "",
  department: "",
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

function toItemBody(input: ApprovalDirectoryInput, isNew: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    [APPROVAL_DIRECTORY_COLUMNS.personEmail]: input.personEmail.trim().toLowerCase(),
    [APPROVAL_DIRECTORY_COLUMNS.personName]: input.personName.trim(),
    [APPROVAL_DIRECTORY_COLUMNS.department]: input.department.trim(),
    [APPROVAL_DIRECTORY_COLUMNS.position]: input.position.trim(),
    [APPROVAL_DIRECTORY_COLUMNS.employeeId]: input.employeeId.trim(),
    [APPROVAL_DIRECTORY_COLUMNS.approverEmail]: input.approverEmail.trim().toLowerCase(),
    [APPROVAL_DIRECTORY_COLUMNS.isActive]: input.isActive,
  };
  // A generic SharePoint list still requires Title; mirror the person into it
  // on create only, so a hand-maintained title survives later edits.
  if (isNew) body.Title = input.personName.trim() || input.personEmail.trim();
  return body;
}

/** Every row, newest listing problems first is the caller's job — this sorts by name. */
export async function loadApprovalDirectory(token: string): Promise<ApprovalDirectoryRow[]> {
  const params = new URLSearchParams();
  params.set("$select", SELECT_COLUMNS);
  params.set("$top", "5000");

  const data = await spGet(
    token,
    `${listUrl()}/items?${params.toString()}`,
  ) as { value?: Record<string, unknown>[] };

  return (data.value ?? [])
    .map((item) => ({ ...toApprovalDirectoryRow(item), id: Number(item.Id) || undefined }))
    .sort((a, b) =>
      a.department.localeCompare(b.department)
      || (a.personName || a.personEmail).localeCompare(b.personName || b.personEmail));
}

export async function createApprovalDirectoryRow(token: string, input: ApprovalDirectoryInput): Promise<void> {
  await spPost(token, `${listUrl()}/items`, toItemBody(input, true));
}

export async function updateApprovalDirectoryRow(
  token: string,
  id: number,
  input: ApprovalDirectoryInput,
): Promise<void> {
  await spPatch(token, `${listUrl()}/items(${id})`, toItemBody(input, false));
}

/**
 * Removes a row outright. Prefer switching `isActive` off for a leaver: their
 * old submissions stay readable, and the resolver already skips inactive rows.
 */
export async function deleteApprovalDirectoryRow(token: string, id: number): Promise<void> {
  await spDelete(token, `${listUrl()}/items(${id})`);
}

async function queryDirectory(token: string, filter: string, top: number): Promise<ApprovalDirectoryRow[]> {
  const params = new URLSearchParams();
  params.set("$select", SELECT_COLUMNS);
  params.set("$filter", filter);
  params.set("$top", String(top));

  const data = await spGet(
    token,
    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(APPROVAL_DIRECTORY_LIST)}')/items?${params.toString()}`,
  ) as { value?: Record<string, unknown>[] };

  return (data.value ?? []).map(toApprovalDirectoryRow);
}

/**
 * One request per distinct address, cached for the life of the reader. Walking
 * a chain re-reads the same rows, since each hop's target is the next hop's
 * subject.
 */
export function createApprovalDirectoryReader(token: string) {
  const people = new Map<string, ApprovalDirectoryRow | null>();

  async function lookupPerson(email: string): Promise<ApprovalDirectoryRow | null> {
    const key = directoryEmailKey(email);
    if (!key) return null;

    const cached = people.get(key);
    if (cached !== undefined) return cached;

    // A missing list is the normal state before the directory is set up.
    // "Nobody is listed" parks the layer with a useful message; throwing here
    // would fail the whole submission.
    const row = await queryDirectory(
      token,
      `${APPROVAL_DIRECTORY_COLUMNS.personEmail} eq '${escapeODataString(key)}'`,
      2,
    )
      .then((matches) => matches.find((candidate) => candidate.isActive) ?? null)
      .catch(() => null);

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

    try {
      const matches = await queryDirectory(
        token,
        [
          `${APPROVAL_DIRECTORY_COLUMNS.department} eq '${escapeODataString(wantedDepartment)}'`,
          `${APPROVAL_DIRECTORY_COLUMNS.position} eq '${escapeODataString(wantedRole)}'`,
        ].join(" and "),
        2,
      );
      const holder = matches.find((candidate) => candidate.isActive && candidate.personEmail);
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

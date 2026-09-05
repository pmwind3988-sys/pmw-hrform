import {
  SP_FIELD_KIND,
  activeSiteUrl,
  ensureColumns,
  ensureFormInstancesList,
  forgetListColumns,
  listHasColumnLive,
  sanitizeODataValue,
  spGet,
  spPatch,
  spPost,
} from "./formBuilderSP";
import type { FormInstance, InstanceStatus } from "./formInstances";

/**
 * formInstancesSP.ts — reading and writing instances.
 *
 * `formInstances.ts` decides what an instance MEANS; this moves the rows. The
 * split is deliberate: the meaning is pure and unit-tested, and everything here
 * needs a live SharePoint to say anything at all.
 */

const LIST_PATH = "Form%20Instances";

/**
 * The column stamped on a response row, naming the instance it came through.
 *
 * The group in All Submissions is keyed on a FIELD VALUE, not this — historical
 * submissions have no instance and must still group. This exists for the two
 * things a value cannot do: it survives someone editing that value on a
 * submission, and it is the only proof of which link a response arrived
 * through.
 */
export const INSTANCE_ID_FIELD = "InstanceId";

interface InstanceRow {
  Id?: number;
  Title?: string;
  FormTitle?: string;
  FormSlug?: string;
  InstanceToken?: string;
  PrefillJson?: string;
  LockedFields?: string;
  GroupValue?: string;
  ExpiresAt?: string | null;
  InstanceStatus?: string;
  RequireSignIn?: boolean;
  CreatedByEmail?: string;
  Created?: string;
}

const SELECT =
  "$select=Id,Title,FormTitle,FormSlug,InstanceToken,PrefillJson,LockedFields,GroupValue,ExpiresAt,InstanceStatus,RequireSignIn,CreatedByEmail,Created";

function parseObject(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    // A malformed prefill yields no fixed values rather than throwing: the
    // instance still opens, it simply fills nothing in.
    return {};
  }
}

function parseStringArray(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function toInstance(row: InstanceRow): FormInstance {
  return {
    id: String(row.Id ?? ""),
    title: row.Title ?? "",
    formTitle: row.FormTitle ?? "",
    formSlug: row.FormSlug ?? "",
    token: row.InstanceToken ?? "",
    prefill: parseObject(row.PrefillJson),
    lockedFields: parseStringArray(row.LockedFields),
    groupValue: row.GroupValue ?? "",
    expiresAt: row.ExpiresAt ?? "",
    // Anything that is not the string "closed" is open. The safe direction:
    // a junk value leaves an event running rather than shutting it silently.
    status: (row.InstanceStatus === "closed" ? "closed" : "open") as InstanceStatus,
    requireSignIn: row.RequireSignIn !== false,
    createdBy: row.CreatedByEmail ?? "",
    created: row.Created ?? "",
  };
}

export interface FormInstanceInput {
  title: string;
  formTitle: string;
  formSlug: string;
  prefill: Record<string, unknown>;
  lockedFields: string[];
  /** The value of the form's grouping field, or "" when it has none. */
  groupValue: string;
  expiresAt: string;
  requireSignIn: boolean;
  createdBy: string;
}

function toRow(input: FormInstanceInput, token: string): Record<string, unknown> {
  return {
    Title: input.title,
    FormTitle: input.formTitle,
    FormSlug: input.formSlug,
    InstanceToken: token,
    PrefillJson: JSON.stringify(input.prefill),
    LockedFields: JSON.stringify(input.lockedFields),
    GroupValue: input.groupValue,
    ExpiresAt: input.expiresAt || null,
    InstanceStatus: "open",
    RequireSignIn: input.requireSignIn,
    CreatedByEmail: input.createdBy,
  };
}

export async function listFormInstances(token: string, formTitle: string): Promise<FormInstance[]> {
  await ensureFormInstancesList(token);
  const filter = `$filter=FormTitle eq '${encodeURIComponent(sanitizeODataValue(formTitle))}'`;
  const data = (await spGet(
    token,
    `${activeSiteUrl()}/_api/web/lists/getbytitle('${LIST_PATH}')/items?${SELECT}&${filter}&$orderby=Created desc&$top=500`,
  ).catch(() => ({ value: [] }))) as { value?: InstanceRow[] };
  return (data.value ?? []).map(toInstance);
}

/**
 * The instance a link points at.
 *
 * Returns null for an unknown token rather than throwing, because "no such
 * instance" is an ordinary answer here — someone mistyped a URL, or the row was
 * deleted after a QR was printed.
 */
export async function getFormInstanceByToken(
  token: string,
  instanceToken: string,
): Promise<FormInstance | null> {
  const trimmed = instanceToken.trim();
  if (!trimmed) return null;

  const filter = `$filter=InstanceToken eq '${encodeURIComponent(sanitizeODataValue(trimmed))}'`;
  const data = (await spGet(
    token,
    `${activeSiteUrl()}/_api/web/lists/getbytitle('${LIST_PATH}')/items?${SELECT}&${filter}&$top=1`,
  ).catch(() => ({ value: [] }))) as { value?: InstanceRow[] };

  const row = data.value?.[0];
  return row ? toInstance(row) : null;
}

/**
 * Creates an instance, and only after its response list can carry the stamp.
 *
 * The column is ensured FIRST and a failure aborts: an instance whose
 * submissions cannot be stamped is a link that silently loses the one piece of
 * provenance it exists to record. Better no link than an untraceable one.
 */
export async function createFormInstance(
  token: string,
  input: FormInstanceInput,
): Promise<FormInstance> {
  await ensureFormInstancesList(token);
  await ensureInstanceIdColumn(token, input.formTitle);

  const instanceToken = crypto.randomUUID();
  await spPost(
    token,
    `${activeSiteUrl()}/_api/web/lists/getbytitle('${LIST_PATH}')/items`,
    toRow(input, instanceToken),
  );

  const created = await getFormInstanceByToken(token, instanceToken);
  if (!created) throw new Error("The instance was created but could not be read back.");
  return created;
}

export interface FormInstancePatch {
  title?: string;
  prefill?: Record<string, unknown>;
  lockedFields?: string[];
  groupValue?: string;
  expiresAt?: string;
  status?: InstanceStatus;
  requireSignIn?: boolean;
}

export async function updateFormInstance(
  token: string,
  id: string,
  patch: FormInstancePatch,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.Title = patch.title;
  if (patch.prefill !== undefined) body.PrefillJson = JSON.stringify(patch.prefill);
  if (patch.lockedFields !== undefined) body.LockedFields = JSON.stringify(patch.lockedFields);
  if (patch.groupValue !== undefined) body.GroupValue = patch.groupValue;
  // "" clears the date, which is what "runs until closed" means. `undefined`
  // leaves it alone; the two are not the same and must not collapse.
  if (patch.expiresAt !== undefined) body.ExpiresAt = patch.expiresAt || null;
  if (patch.status !== undefined) body.InstanceStatus = patch.status;
  if (patch.requireSignIn !== undefined) body.RequireSignIn = patch.requireSignIn;

  if (Object.keys(body).length === 0) return;

  await spPatch(token, `${activeSiteUrl()}/_api/web/lists/getbytitle('${LIST_PATH}')/items(${id})`, body);
}

/**
 * Ensures a response list can record which instance a submission came through.
 *
 * Additive and safe to re-run: `ensureColumns` skips a column that already
 * exists, and rows written before it simply hold an empty value.
 */
export async function ensureInstanceIdColumn(token: string, formTitle: string): Promise<void> {
  /*
    Ask SharePoint, not the cache.

    `createColumn` remembers a column whenever SharePoint answers "already
    exists", so one such reply for a column that is not really there leaves the
    cache asserting it forever, and every later `ensureColumns` skips the
    creation without a word. That is exactly how this failed the first time:
    instances were created, reported success, and their submissions had nowhere
    to record which link they came through.
  */
  forgetListColumns(formTitle);
  await ensureColumns(token, formTitle, [{ n: INSTANCE_ID_FIELD, k: SP_FIELD_KIND.text }]);

  /*
    And then check it for real. `ensureColumns` returning is not evidence: the
    whole point of this column is provenance, so an instance whose submissions
    cannot be stamped must fail loudly at creation rather than hand out a link
    that quietly loses the one thing it exists to record.
  */
  if (!(await listHasColumnLive(token, formTitle, INSTANCE_ID_FIELD))) {
    throw new Error(
      `Could not add the ${INSTANCE_ID_FIELD} column to "${formTitle}". Its submissions could not be traced back to this instance, so the instance was not created. Check that you can edit that list's columns.`,
    );
  }
}

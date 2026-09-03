/**
 * orgDirectorySP.ts — reading and writing the company and department lists.
 *
 * The rules all live in `orgDirectory.ts` and `orgConversion.ts`, which are
 * pure. This is the SharePoint side: provisioning the two lists, ordinary CRUD
 * for the admin screen, reading what forms currently use, and applying an
 * approved conversion.
 *
 * Provisioning runs on an admin's **delegated** token, like the approval
 * directory's: the app-only principal gets 403 when creating columns, which is
 * why it lives on this side and not in a serverless route.
 */
import {
  SP_FIELD_KIND,
  ensureColumns,
  ensureSpList,
  getAllFormConfigs,
  listExists,
  spDelete,
  spGet,
  spPatch,
  spPost,
} from "./formBuilderSP";
import {
  COMPANY_LIST,
  DEPARTMENT_LIST,
  ORG_COLUMNS,
  type CompanyRow,
  type DepartmentRow,
} from "./orgDirectory";
import {
  companiesFromMeta,
  orgQuestionsFromSurveyJson,
  type FormOrgUsage,
  type RepointTarget,
} from "./orgConversion";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL as string || "").replace(/\/$/, "");

function listUrl(listTitle: string): string {
  return `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')`;
}

function odata(value: string): string {
  return encodeURIComponent(value.replace(/'/g, "''"));
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/**
 * A blank or absent `IsActive` reads as active.
 *
 * Same rule as the approval directory: a column that has not been filled in
 * must never mean "this company has been switched off".
 */
function activeFlag(value: unknown): boolean {
  return value === undefined || value === null || value === "" ? true : Boolean(value);
}

/** Creates both lists and their columns if they are not there yet. */
export async function ensureOrgLists(token: string): Promise<void> {
  await ensureSpList(token, COMPANY_LIST, {
    description: "The companies every form's Company question offers. Code is what submissions store.",
  });
  await ensureColumns(token, COMPANY_LIST, [
    { n: ORG_COLUMNS.code, k: SP_FIELD_KIND.text },
    { n: ORG_COLUMNS.isActive, k: SP_FIELD_KIND.boolean },
  ]);

  await ensureSpList(token, DEPARTMENT_LIST, {
    description: "The departments every form's Department question offers. Company blank means all companies.",
  });
  await ensureColumns(token, DEPARTMENT_LIST, [
    { n: ORG_COLUMNS.code, k: SP_FIELD_KIND.text },
    { n: ORG_COLUMNS.company, k: SP_FIELD_KIND.text },
    { n: ORG_COLUMNS.isActive, k: SP_FIELD_KIND.boolean },
  ]);
}

export async function orgListsExist(token: string): Promise<{ companies: boolean; departments: boolean }> {
  const [companies, departments] = await Promise.all([
    listExists(token, COMPANY_LIST),
    listExists(token, DEPARTMENT_LIST),
  ]);
  return { companies, departments };
}

export async function loadCompanies(token: string): Promise<CompanyRow[]> {
  const data = await spGet(
    token,
    `${listUrl(COMPANY_LIST)}/items?$select=Id,${ORG_COLUMNS.name},${ORG_COLUMNS.code},${ORG_COLUMNS.isActive}&$top=5000`,
  ) as { value?: Record<string, unknown>[] };

  return (data.value ?? []).map((item) => ({
    id: Number(item.Id) || undefined,
    name: text(item[ORG_COLUMNS.name]),
    code: text(item[ORG_COLUMNS.code]),
    isActive: activeFlag(item[ORG_COLUMNS.isActive]),
  }));
}

export async function loadDepartments(token: string): Promise<DepartmentRow[]> {
  const select = [
    "Id",
    ORG_COLUMNS.name,
    ORG_COLUMNS.code,
    ORG_COLUMNS.company,
    ORG_COLUMNS.isActive,
  ].join(",");
  const data = await spGet(
    token,
    `${listUrl(DEPARTMENT_LIST)}/items?$select=${select}&$top=5000`,
  ) as { value?: Record<string, unknown>[] };

  return (data.value ?? []).map((item) => ({
    id: Number(item.Id) || undefined,
    name: text(item[ORG_COLUMNS.name]),
    code: text(item[ORG_COLUMNS.code]),
    company: text(item[ORG_COLUMNS.company]),
    isActive: activeFlag(item[ORG_COLUMNS.isActive]),
  }));
}

function companyBody(row: CompanyRow): Record<string, unknown> {
  return {
    [ORG_COLUMNS.name]: row.name.trim(),
    [ORG_COLUMNS.code]: row.code.trim(),
    [ORG_COLUMNS.isActive]: row.isActive,
  };
}

function departmentBody(row: DepartmentRow): Record<string, unknown> {
  return {
    [ORG_COLUMNS.name]: row.name.trim(),
    [ORG_COLUMNS.code]: row.code.trim(),
    [ORG_COLUMNS.company]: row.company.trim(),
    [ORG_COLUMNS.isActive]: row.isActive,
  };
}

export async function saveCompany(token: string, row: CompanyRow): Promise<void> {
  if (row.id === undefined) await spPost(token, `${listUrl(COMPANY_LIST)}/items`, companyBody(row));
  else await spPatch(token, `${listUrl(COMPANY_LIST)}/items(${row.id})`, companyBody(row));
}

export async function saveDepartment(token: string, row: DepartmentRow): Promise<void> {
  if (row.id === undefined) await spPost(token, `${listUrl(DEPARTMENT_LIST)}/items`, departmentBody(row));
  else await spPatch(token, `${listUrl(DEPARTMENT_LIST)}/items(${row.id})`, departmentBody(row));
}

/**
 * Removes a row outright. Prefer switching it off: a submission that stored
 * this code still has to resolve to a readable name.
 */
export async function deleteCompany(token: string, id: number): Promise<void> {
  await spDelete(token, `${listUrl(COMPANY_LIST)}/items(${id})`);
}

export async function deleteDepartment(token: string, id: number): Promise<void> {
  await spDelete(token, `${listUrl(DEPARTMENT_LIST)}/items(${id})`);
}

interface VersionRow {
  Id: number;
  FormTitle?: string;
  FormVersion?: string;
  PublishKey?: string;
  SurveyJSON?: string;
}

/**
 * What every published profile of every form currently uses.
 *
 * Every profile, not each form's current draft: a profile is what submissions
 * were actually filled against, so a company that only appears in an older one
 * is still a company somebody chose.
 */
export async function collectFormOrgUsage(token: string): Promise<FormOrgUsage[]> {
  const configs = await getAllFormConfigs(token);
  const titles = new Set(configs.map((config) => (config.Title || "").trim()).filter(Boolean));

  const data = await spGet(
    token,
    `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items`
    + "?$select=Id,FormTitle,FormVersion,PublishKey,SurveyJSON&$top=5000",
  ) as { value?: VersionRow[] };

  const usage: FormOrgUsage[] = [];
  for (const row of data.value ?? []) {
    const formTitle = (row.FormTitle || "").trim();
    if (!formTitle || !titles.has(formTitle)) continue;

    let payload: unknown;
    try {
      payload = JSON.parse(row.SurveyJSON || "");
    } catch {
      continue;
    }
    if (!payload || typeof payload !== "object") continue;
    const record = payload as Record<string, unknown>;

    usage.push({
      formTitle,
      version: (row.FormVersion || "").trim(),
      publishKey: (row.PublishKey || "").trim() || "production",
      companies: companiesFromMeta(record.meta),
      questions: orgQuestionsFromSurveyJson(record),
    });
  }
  return usage;
}

export interface OrgSeedResult {
  created: number;
  failures: string[];
}

/**
 * Creates the seeded rows, skipping any code that is already listed.
 *
 * Reports rather than aborts, for the same reason the CSV import does: half a
 * conversion that says which half beats a rollback an admin cannot see into.
 */
export async function seedOrgLists(
  token: string,
  companies: Array<{ code: string; name: string }>,
  departments: Array<{ code: string; name: string }>,
  onProgress?: (done: number, total: number) => void,
): Promise<OrgSeedResult> {
  const [existingCompanies, existingDepartments] = await Promise.all([
    loadCompanies(token),
    loadDepartments(token),
  ]);
  const companyCodes = new Set(existingCompanies.map((row) => row.code.trim().toLowerCase()));
  // Only shared rows are seeded, so only shared rows can collide.
  const departmentCodes = new Set(existingDepartments
    .filter((row) => !row.company.trim())
    .map((row) => row.code.trim().toLowerCase()));

  const work = [
    ...companies
      .filter((row) => !companyCodes.has(row.code.trim().toLowerCase()))
      .map((row) => async () => saveCompany(token, { ...row, isActive: true })),
    ...departments
      .filter((row) => !departmentCodes.has(row.code.trim().toLowerCase()))
      // Shared: today's stored departments carry no company at all.
      .map((row) => async () => saveDepartment(token, { ...row, company: "", isActive: true })),
  ];

  const failures: string[] = [];
  let created = 0;
  for (const task of work) {
    try {
      await task();
      created++;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
    onProgress?.(created + failures.length, work.length);
  }
  return { created, failures };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Points one question at a global list, inside a stored survey schema.
 *
 * Mutates the element in place and reports whether anything changed, so a
 * profile that already reads from the list is not rewritten for nothing.
 */
function repointElement(root: unknown, target: RepointTarget): boolean {
  let changed = false;

  const visit = (elements: unknown): void => {
    if (!Array.isArray(elements)) return;
    for (const element of elements) {
      if (!isRecord(element)) continue;
      if (element.name === target.questionName) {
        if (target.kind === "company") {
          /*
            `spFilteredListSource` with no filter, deliberately, and not
            `spChoicesSource`.

            The two read different things. `spChoicesSource` returns a
            SharePoint *choice column's* allowed values — it inspects the field
            definition, not the rows. `Code` is a plain text column, so that
            path finds nothing at all and the dropdown renders empty. Reading
            the list's items is what is wanted here, and that is the filtered
            source's job; leaving the filter off simply means every row.
          */
          element.spFilteredListSource = {
            list: COMPANY_LIST,
            valueColumn: ORG_COLUMNS.code,
            labelColumn: ORG_COLUMNS.name,
          };
          delete element.spChoicesSource;
        } else {
          element.spFilteredListSource = {
            list: DEPARTMENT_LIST,
            valueColumn: ORG_COLUMNS.code,
            labelColumn: ORG_COLUMNS.name,
            filterColumn: ORG_COLUMNS.company,
            // A department with no company belongs to all of them, so a blank
            // filter cell has to match whichever company was chosen.
            includeBlankFilter: true,
          };
          delete element.spChoicesSource;
        }
        // Stale typed-in choices would otherwise show until the list loads.
        delete element.choices;
        changed = true;
      }
      visit(element.elements);
      visit(element.templateElements);
      if (Array.isArray(element.columns)) {
        for (const column of element.columns) {
          if (isRecord(column)) visit(column.elements);
        }
      }
    }
  };

  const survey = isRecord(root) && isRecord(root.surveyJson) ? root.surveyJson : root;
  if (isRecord(survey) && Array.isArray(survey.pages)) {
    for (const page of survey.pages) {
      if (isRecord(page)) visit(page.elements);
    }
  }
  return changed;
}

export interface RepointResult {
  changed: number;
  failures: string[];
}

/**
 * Repoints questions at the global lists, one published profile at a time.
 *
 * Only the `SurveyJSON` column is patched, and within it only the questions
 * named. Publish status and expiry are separate columns and are not part of
 * the request. Never a republish: `saveFormVersion` would rewrite the whole
 * row from the builder's current draft, and two profiles of one version can
 * hold different questions.
 */
export async function repointFormQuestions(
  token: string,
  targets: RepointTarget[],
  onProgress?: (done: number, total: number) => void,
): Promise<RepointResult> {
  /** One request per profile, however many of its questions are repointed. */
  const byProfile = new Map<string, RepointTarget[]>();
  for (const target of targets) {
    const key = `${target.formTitle}|${target.version}|${target.publishKey}`;
    byProfile.set(key, [...(byProfile.get(key) ?? []), target]);
  }

  const failures: string[] = [];
  let changed = 0;
  let done = 0;

  for (const group of byProfile.values()) {
    const { formTitle, version, publishKey } = group[0];
    const label = `${formTitle} v${version} [${publishKey}]`;
    try {
      const filter = [
        `FormTitle eq '${odata(formTitle)}'`,
        `FormVersion eq '${odata(version)}'`,
        `PublishKey eq '${odata(publishKey)}'`,
      ].join(" and ");
      const data = await spGet(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items`
        + `?$filter=${filter}&$select=Id,SurveyJSON&$top=1`,
      ) as { value?: { Id: number; SurveyJSON?: string }[] };

      const row = data.value?.[0];
      if (!row) throw new Error("no such published profile");

      const payload = JSON.parse(row.SurveyJSON || "") as unknown;
      let touched = false;
      for (const target of group) {
        if (repointElement(payload, target)) touched = true;
      }
      if (touched) {
        await spPatch(
          token,
          `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items(${row.Id})`,
          { SurveyJSON: JSON.stringify(payload, null, 2) },
        );
        changed++;
      }
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
    done++;
    onProgress?.(done, byProfile.size);
  }

  return { changed, failures };
}

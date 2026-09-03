/**
 * orgDirectory.ts — the company and department lists every form chooses from.
 *
 * Until now each form kept its own copy: the company selector held a typed
 * list per form, and a department question pointed at whatever list somebody
 * configured. Eight companies on one form, four in the builder's default, and
 * "PMW LIGHTING SDN BHD" in one place against "PMW LIGHTING INDUSTRIES SDN
 * BHD" in another. One list, maintained by HR, is the point of this module.
 *
 * **A form stores the code and shows the name.** That is what makes renaming
 * safe: change what a company is called and every submission ever made still
 * resolves. The codes start out equal to the strings already stored, so
 * nothing has to be migrated on the day this arrives.
 *
 * **A department's company is optional.** Blank means shared by every company,
 * which is what every converted department starts as, because today's stored
 * departments carry no company at all. Naming a company makes that row
 * specific to it, and a specific row beats a shared one of the same code — so
 * an admin can pull one company's Finance out of the shared pool without
 * touching anybody else's.
 *
 * Pure: no SharePoint, no environment. `orgDirectorySP.ts` does the I/O, and
 * `src/utils/orgDirectory.ts` is the client-side copy of this file. Keep the
 * two in step.
 */

export const COMPANY_LIST = "Companies";
export const DEPARTMENT_LIST = "Departments";

export const ORG_COLUMNS = {
  /** SharePoint's own Title column holds the display name on both lists. */
  name: "Title",
  /** What a form stores. Immutable once anything has been submitted with it. */
  code: "Code",
  /** Departments only. Blank means every company. */
  company: "Company",
  /** Switched off rather than deleted, so old submissions still resolve. */
  isActive: "IsActive",
} as const;

export interface CompanyRow {
  id?: number;
  name: string;
  code: string;
  isActive: boolean;
}

export interface DepartmentRow {
  id?: number;
  name: string;
  code: string;
  /** A company's code, or "" for a department shared by every company. */
  company: string;
  isActive: boolean;
}

/** What a dropdown needs: the stored value and the text a person reads. */
export interface OrgChoice {
  value: string;
  text: string;
}

/**
 * Case- and spacing-insensitive key for comparing codes and names.
 *
 * Codes begin life as strings somebody typed into a form builder, so
 * "PMW  Industries" and "pmw industries" have to compare equal — otherwise a
 * conversion would seed two rows for one company.
 */
export function orgKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function byName(a: { name: string; code: string }, b: { name: string; code: string }): number {
  return (a.name || a.code).localeCompare(b.name || b.code);
}

/** Active companies, as dropdown choices. */
export function companyChoices(companies: CompanyRow[]): OrgChoice[] {
  return companies
    .filter((company) => company.isActive && company.code.trim())
    .sort(byName)
    .map((company) => ({ value: company.code, text: company.name || company.code }));
}

/**
 * The departments a form should offer once a company has been picked.
 *
 * Three rules, in this order:
 *
 * - a row naming this company applies to it;
 * - a row naming no company applies to every company;
 * - where both exist for one code, the specific row wins, so a department an
 *   admin has pulled out for one company does not also appear as the shared
 *   version.
 *
 * With no company chosen yet, every active department is offered rather than
 * none: a form may legitimately ask for a department without asking which
 * company, and answering "nothing to choose" would make it unfillable.
 */
export function departmentChoices(
  departments: DepartmentRow[],
  companyCode: string,
): OrgChoice[] {
  return resolveScopedChoices(
    departments
      .filter((department) => department.isActive)
      .map((department) => ({
        value: department.code,
        label: department.name,
        scope: department.company,
      })),
    companyCode,
  );
}

/** One list row, as scope resolution needs it. */
export interface ScopedRow {
  value: string;
  label?: string;
  /** The company this row belongs to, or "" for every company. */
  scope: string;
}

/**
 * The generic form of the rule above, used by any question whose choice list
 * has an optional scope column — which is how a blank cell comes to mean "all
 * of them" rather than "none of them".
 *
 * Kept separate from `departmentChoices` because the dropdown loader works in
 * raw list rows and knows nothing about departments, and the rule is the part
 * that must not be written twice.
 */
export function resolveScopedChoices(rows: ScopedRow[], wantedScope: string): OrgChoice[] {
  const wanted = orgKey(wantedScope);
  const usable = rows.filter((row) => row.value.trim());

  const specific = new Map<string, ScopedRow>();
  const shared = new Map<string, ScopedRow>();

  for (const row of usable) {
    const value = orgKey(row.value);
    const scope = orgKey(row.scope);
    if (!scope) {
      if (!shared.has(value)) shared.set(value, row);
    } else if (wanted && scope === wanted) {
      if (!specific.has(value)) specific.set(value, row);
    } else if (!wanted) {
      // No company picked, so a row belonging to some other company is still
      // a real department and worth offering. First one for a value wins.
      if (!specific.has(value)) specific.set(value, row);
    }
  }

  const merged = new Map(shared);
  for (const [value, row] of specific) merged.set(value, row);

  return [...merged.values()]
    .map((row) => ({ value: row.value, text: row.label || row.value }))
    .sort((a, b) => a.text.localeCompare(b.text));
}

/** The company a department belongs to, in words, for the admin table. */
export function departmentScopeLabel(
  department: DepartmentRow,
  companies: CompanyRow[],
): string {
  const company = department.company.trim();
  if (!company) return "All companies";
  const match = companies.find((candidate) => orgKey(candidate.code) === orgKey(company));
  return match ? (match.name || match.code) : `${company} (not listed)`;
}

/**
 * Reduces a name to the letters and digits that carry its meaning, for
 * spotting two spellings of one thing.
 *
 * Company suffixes go: SDN BHD, BERHAD and the rest are legal form, not
 * identity, and they are exactly what differs between two typings of the same
 * company.
 */
function duplicateKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(sdn|bhd|berhad|bernad|s\/b|pvt|ltd|limited|inc)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

/** Two or more spellings that probably mean one thing, for an admin to judge. */
export interface DuplicateGroup {
  /** The shared reduced form, only useful for grouping. */
  key: string;
  names: string[];
}

/**
 * Groups values that reduce to the same thing, or to one containing another.
 *
 * Reported rather than merged. "PMW LIGHTING SDN BHD" and "PMW LIGHTING
 * INDUSTRIES SDN BHD" may be one company typed twice or two real companies,
 * and only somebody at PMW knows which. Merging on string distance would
 * quietly delete a company.
 */
export function nearDuplicateGroups(values: string[]): DuplicateGroup[] {
  const distinct = [...new Map(values
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => [orgKey(value), value])).values()];

  const groups = new Map<string, Set<string>>();

  for (let i = 0; i < distinct.length; i++) {
    for (let j = i + 1; j < distinct.length; j++) {
      const left = duplicateKey(distinct[i]);
      const right = duplicateKey(distinct[j]);
      if (!left || !right) continue;
      const related = left === right || left.includes(right) || right.includes(left);
      if (!related) continue;
      const key = left.length <= right.length ? left : right;
      const group = groups.get(key) ?? new Set<string>();
      group.add(distinct[i]);
      group.add(distinct[j]);
      groups.set(key, group);
    }
  }

  return [...groups.entries()]
    .map(([key, names]) => ({ key, names: [...names].sort() }))
    .sort((a, b) => a.names[0].localeCompare(b.names[0]));
}

/** Anything wrong with a company row, in the order an admin would fix it. */
export function validateCompany(
  input: CompanyRow,
  existing: CompanyRow[],
): string[] {
  const problems: string[] = [];
  if (!input.name.trim()) problems.push("A company needs a name.");
  if (!input.code.trim()) {
    problems.push("A company needs a code — it is what submissions store.");
  } else if (existing.some((row) => row.id !== input.id && orgKey(row.code) === orgKey(input.code))) {
    problems.push(`The code "${input.code.trim()}" is already used by another company.`);
  }
  return problems;
}

/**
 * Anything wrong with a department row.
 *
 * A code may repeat across companies, and a specific row may deliberately
 * reuse a shared row's code — that is how an override is expressed. What must
 * not repeat is the same code twice in the same scope.
 */
export function validateDepartment(
  input: DepartmentRow,
  existing: DepartmentRow[],
): string[] {
  const problems: string[] = [];
  if (!input.name.trim()) problems.push("A department needs a name.");
  if (!input.code.trim()) {
    problems.push("A department needs a code — it is what submissions store.");
  } else if (existing.some((row) =>
    row.id !== input.id
    && orgKey(row.code) === orgKey(input.code)
    && orgKey(row.company) === orgKey(input.company))) {
    problems.push(input.company.trim()
      ? `"${input.code.trim()}" is already listed for that company.`
      : `"${input.code.trim()}" is already listed as shared by all companies.`);
  }
  return problems;
}

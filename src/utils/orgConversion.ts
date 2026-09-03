/**
 * orgConversion.ts — building the global lists out of what forms already use.
 *
 * The lists cannot be typed from scratch: eight companies and two dozen
 * departments are already spelled a particular way inside published forms and
 * inside every submission ever made. Seeding them from what is genuinely in
 * use is what lets the codes equal the stored strings, which is what lets this
 * arrive without migrating any submission.
 *
 * Every published profile is read, not just each form's current draft. A
 * profile is what a submission was actually filled against, so a company that
 * only appears in an older profile is still a company somebody chose.
 *
 * Plans, never writes. Two spellings of one company are reported for an admin
 * to judge rather than merged: "PMW LIGHTING SDN BHD" against "PMW LIGHTING
 * INDUSTRIES SDN BHD" is either one company typed twice or two real ones, and
 * merging on string distance would quietly delete a company.
 *
 * Pure. `orgDirectorySP.ts` reads the forms and applies an approved plan.
 */
import {
  nearDuplicateGroups,
  orgKey,
  type DuplicateGroup,
} from "./orgDirectory";

/** Which of the two lists a question draws on. */
export type OrgQuestionKind = "company" | "department";

/** One question a form asks that these lists should answer. */
export interface OrgQuestion {
  /** The stored field name. */
  name: string;
  title: string;
  kind: OrgQuestionKind;
  /**
   * Where its choices come from today: the managed company banner, a
   * SharePoint list somebody pointed it at, or choices typed into the form.
   */
  source: "managed" | "list" | "static";
  /** Choices typed into the form, when that is where they live. */
  staticChoices: string[];
}

/** What one published profile of one form uses. */
export interface FormOrgUsage {
  formTitle: string;
  version: string;
  publishKey: string;
  /** Company names from the form's own company list. */
  companies: string[];
  questions: OrgQuestion[];
}

/** A row the conversion would create, and where its value was found. */
export interface SeededRow {
  /** Equal to the string stored today — that is the whole point. */
  code: string;
  name: string;
  /** Form titles the value was seen on, for the admin to sanity-check. */
  seenOn: string[];
}

/** One question that would be repointed at a global list. */
export interface RepointTarget {
  formTitle: string;
  version: string;
  publishKey: string;
  questionName: string;
  questionTitle: string;
  kind: OrgQuestionKind;
  /** What it draws on now, so an admin can see what is being replaced. */
  from: OrgQuestion["source"];
}

export interface OrgConversionPlan {
  companies: SeededRow[];
  /** All shared: today's stored departments carry no company at all. */
  departments: SeededRow[];
  companyDuplicates: DuplicateGroup[];
  departmentDuplicates: DuplicateGroup[];
  repoint: RepointTarget[];
  /** Profiles read, so a plan that found little can be told from one that read little. */
  profilesRead: number;
}

export const EMPTY_ORG_CONVERSION_PLAN: OrgConversionPlan = {
  companies: [],
  departments: [],
  companyDuplicates: [],
  departmentDuplicates: [],
  repoint: [],
  profilesRead: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/** The company list a form keeps today: one name per line. */
export function companiesFromMeta(meta: unknown): string[] {
  if (!isRecord(meta)) return [];
  const raw = meta.companies;
  if (typeof raw !== "string") return [];
  return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

/**
 * Words that make a question a department question.
 *
 * Matched on the label rather than the field name because the field name is
 * whatever the builder generated, while the label is what HR wrote. The same
 * exclusions as the harvester apply: somebody else's department is not the
 * submitter's.
 */
const DEPARTMENT_WORDS = ["department", "dept", "division", "jabatan"];
const COMPANY_WORDS = ["company", "syarikat", "employer"];
const FOREIGN_WORDS = ["supervisor", "superior", "approver", "manager", "hod", "head", "evaluator"];

function hasWord(haystack: string, needle: string): boolean {
  const words = haystack.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return ` ${words} `.includes(` ${needle} `);
}

function questionKind(name: string, title: string): OrgQuestionKind | null {
  const label = `${title} ${name}`;
  if (FOREIGN_WORDS.some((word) => hasWord(label, word))) return null;
  if (COMPANY_WORDS.some((word) => hasWord(label, word))) return "company";
  if (DEPARTMENT_WORDS.some((word) => hasWord(label, word))) return "department";
  return null;
}

function choiceValues(element: Record<string, unknown>): string[] {
  const choices = element.choices;
  if (!Array.isArray(choices)) return [];
  return choices
    .map((choice) => (isRecord(choice) ? text(choice.value ?? choice.text) : text(choice)))
    .filter(Boolean);
}

function walk(elements: unknown, visit: (element: Record<string, unknown>) => void): void {
  if (!Array.isArray(elements)) return;
  for (const element of elements) {
    if (!isRecord(element)) continue;
    visit(element);
    walk(element.elements, visit);
    walk(element.templateElements, visit);
    if (Array.isArray(element.columns)) {
      for (const column of element.columns) {
        if (isRecord(column)) walk(column.elements, visit);
      }
    }
  }
}

/**
 * The company and department questions on one published survey.
 *
 * Accepts either a bare survey schema or the `{ surveyJson: … }` envelope the
 * version list stores, matching how everything else in this codebase reads a
 * published snapshot.
 */
export function orgQuestionsFromSurveyJson(surveyJson: unknown): OrgQuestion[] {
  const root = isRecord(surveyJson) && isRecord(surveyJson.surveyJson)
    ? surveyJson.surveyJson
    : surveyJson;
  const pages = isRecord(root) && Array.isArray(root.pages) ? root.pages : [];

  const found: OrgQuestion[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    if (!isRecord(page)) continue;
    walk(page.elements, (element) => {
      const name = text(element.name);
      if (!name || seen.has(name)) return;
      const title = text(element.title);
      const kind = questionKind(name, title);
      if (!kind) return;

      const listSourced = isRecord(element.spChoicesSource) || isRecord(element.spFilteredListSource);
      const managed = element.isManagedCompanyChoice === true
        || element.managedPlacement === "banner"
        || (kind === "company" && name === "company");

      seen.add(name);
      found.push({
        name,
        title,
        kind,
        source: managed ? "managed" : listSourced ? "list" : "static",
        staticChoices: listSourced || managed ? [] : choiceValues(element),
      });
    });
  }

  return found;
}

function seedRows(values: Array<{ value: string; formTitle: string }>): SeededRow[] {
  const byKey = new Map<string, SeededRow>();
  for (const { value, formTitle } of values) {
    const code = value.trim();
    if (!code) continue;
    const key = orgKey(code);
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.seenOn.includes(formTitle)) existing.seenOn.push(formTitle);
    } else {
      // The name starts equal to the code, because the code *is* the name
      // people have been reading. Renaming is what the Name column is for.
      byKey.set(key, { code, name: code, seenOn: [formTitle] });
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * What converting would create and change, without doing any of it.
 *
 * `directoryPairs` are the company and department values already sitting on
 * Approval Directory rows. Included because those rows were harvested from
 * submissions and can name a department no current form still offers — and a
 * department the directory routes on had better be in the list.
 */
export function planOrgConversion(params: {
  usage: FormOrgUsage[];
  directoryPairs?: Array<{ company: string; department: string }>;
}): OrgConversionPlan {
  const companyValues: Array<{ value: string; formTitle: string }> = [];
  const departmentValues: Array<{ value: string; formTitle: string }> = [];
  const repoint: RepointTarget[] = [];

  for (const profile of params.usage) {
    for (const value of profile.companies) {
      companyValues.push({ value, formTitle: profile.formTitle });
    }
    for (const question of profile.questions) {
      const target = question.kind === "company" ? companyValues : departmentValues;
      for (const value of question.staticChoices) {
        target.push({ value, formTitle: profile.formTitle });
      }
      repoint.push({
        formTitle: profile.formTitle,
        version: profile.version,
        publishKey: profile.publishKey,
        questionName: question.name,
        questionTitle: question.title,
        kind: question.kind,
        from: question.source,
      });
    }
  }

  for (const pair of params.directoryPairs ?? []) {
    if (pair.company.trim()) {
      companyValues.push({ value: pair.company, formTitle: "Approval Directory" });
    }
    if (pair.department.trim()) {
      departmentValues.push({ value: pair.department, formTitle: "Approval Directory" });
    }
  }

  const companies = seedRows(companyValues);
  const departments = seedRows(departmentValues);

  return {
    companies,
    departments,
    companyDuplicates: nearDuplicateGroups(companies.map((row) => row.name)),
    departmentDuplicates: nearDuplicateGroups(departments.map((row) => row.name)),
    repoint,
    profilesRead: params.usage.length,
  };
}

/** One published profile's repoint targets, grouped for the admin to choose. */
export interface RepointGroup {
  formTitle: string;
  version: string;
  publishKey: string;
  targets: RepointTarget[];
}

/** The plan's targets, one group per published profile, forms in name order. */
export function groupRepointTargets(targets: RepointTarget[]): RepointGroup[] {
  const groups = new Map<string, RepointGroup>();
  for (const target of targets) {
    const key = `${target.formTitle}|${target.version}|${target.publishKey}`;
    const group = groups.get(key) ?? {
      formTitle: target.formTitle,
      version: target.version,
      publishKey: target.publishKey,
      targets: [],
    };
    group.targets.push(target);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    a.formTitle.localeCompare(b.formTitle)
    || a.version.localeCompare(b.version)
    || a.publishKey.localeCompare(b.publishKey));
}

/**
 * Why a question must not be repointed, or "" when it may be.
 *
 * One rule, and it comes from how the two lists relate: a department only
 * means something once a company is known, because a company-specific
 * department is invisible until its company has been chosen. So a department
 * question is wired to the global list only where the same form also asks
 * which company — while a company question stands perfectly well alone.
 *
 * Left as a reason rather than silently dropped: "this form asks for a
 * department but not a company" is a thing the form's owner should see.
 */
export function repointBlockReason(target: RepointTarget, group: RepointGroup): string {
  if (target.kind !== "department") return "";
  const hasCompany = group.targets.some((candidate) => candidate.kind === "company");
  return hasCompany
    ? ""
    : "this form asks for a department but not a company, so there is nothing to narrow it by";
}

/** One line summing a plan up, for the dialog's heading. */
export function describeOrgConversionPlan(plan: OrgConversionPlan): string {
  if (plan.profilesRead === 0) {
    return "No published form could be read, so there is nothing to build the lists from.";
  }
  const companies = `${plan.companies.length} ${plan.companies.length === 1 ? "company" : "companies"}`;
  const departments = `${plan.departments.length} department${plan.departments.length === 1 ? "" : "s"}`;
  return `Read ${plan.profilesRead} published profile${plan.profilesRead === 1 ? "" : "s"} `
    + `and found ${companies} and ${departments} in use.`;
}

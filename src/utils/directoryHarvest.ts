/**
 * directoryHarvest.ts — turning an evaluation submission into a directory row.
 *
 * The Approval Directory answers "who approves this person", and somebody has
 * to be in it before a form can route off them. Filling it in by hand does not
 * survive contact with a company that keeps hiring, so a form can be told to
 * harvest its submitters: whoever submits an evaluation and is not listed yet
 * gets a row created for them, marked unconfirmed, for an admin to check.
 *
 * Everything here is a guess, and says so. The name, employee ID and
 * department are read off the form's own answers, which is as close to a fact
 * as this gets; the email address may be constructed from the name, and the
 * approver comes from the department's HOD. An unconfirmed row is never
 * treated as an answer — it is a question put to an admin in the one place
 * they already look.
 *
 * This module is pure: no Graph, no SharePoint REST, no environment. The two
 * submission paths (api/submit-form.ts over Graph, src/pages/DynamicFormPage
 * over REST) each supply their own I/O around it, which is why the file is
 * mirrored as `api/_utils/directoryHarvest.ts`. Keep the two in step.
 */

/**
 * How a directory row came to exist, kept in the list's `Source` column.
 *
 * Three values rather than a boolean because "which parts of this row are
 * guessed" is the question an admin reviewing it actually has, and the answer
 * differs: a real submitter address is a fact, one built out of a name is not.
 */
export const DIRECTORY_SOURCE = {
  /** Typed in by an admin, or imported from their CSV. Not a guess. */
  manual: "manual",
  /** Harvested; the email address is the submitter's own, so it is real. */
  auto: "auto",
  /** Harvested; the email address was constructed from the person's name. */
  autoEmailGuessed: "auto-email-guessed",
} as const;

export type DirectorySource = (typeof DIRECTORY_SOURCE)[keyof typeof DIRECTORY_SOURCE];

/** Per-form harvest settings, stored inside the form's `LayerConfig` JSON. */
export interface DirectoryHarvestConfig {
  /** Off unless an admin switched it on in the form builder. */
  enabled: boolean;
  /** Which question holds the person's name. */
  nameField?: string;
  /** Which question holds their staff number. */
  employeeIdField?: string;
  /** Which question holds their department. */
  departmentField?: string;
  /**
   * Which question holds their company. Rarely needed: the company selector
   * every form can carry already stores its answer under a known key, and that
   * is used when this is blank.
   */
  companyField?: string;
  /**
   * Which question holds their email address, when the form asks for one.
   * Optional: most forms do not, and the submitter's own address serves.
   */
  emailField?: string;
}

/** A person the form described, ready to become an unconfirmed row. */
export interface DirectoryHarvestCandidate {
  personEmail: string;
  personName: string;
  employeeId: string;
  department: string;
  company: string;
  /** True when `personEmail` was built from the name rather than submitted. */
  emailWasGuessed: boolean;
}

/** One of the form's questions, as much of it as label matching needs. */
export interface HarvestFieldOption {
  /** The stored field name — what ends up as a key in the submitted data. */
  name: string;
  /** What the person filling the form reads. */
  title?: string;
}

/** The four settings label matching can offer; blank where nothing matched. */
export interface HarvestFieldGuess {
  nameField: string;
  employeeIdField: string;
  departmentField: string;
  companyField: string;
  emailField: string;
}

export const EMPTY_HARVEST_FIELD_GUESS: HarvestFieldGuess = {
  nameField: "",
  employeeIdField: "",
  departmentField: "",
  companyField: "",
  emailField: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Addresses that are recorded in place of a person. `GUEST` is what a public
 * submission stores, and treating it as somebody's email would put one row in
 * the directory standing for everybody who ever used a public link.
 */
const NON_PERSON_ADDRESSES = new Set(["guest", "anonymous", "system", "public"]);

/**
 * Where the company selector stores its answer.
 *
 * Deliberately a copy of the candidate keys in src/utils/companySelection.ts
 * rather than an import: this module has to stay pure and has to compile on
 * the serverless side, which cannot reach into src/. The two lists describe
 * the same handful of names that selector has ever written.
 */
const COMPANY_KEYS = ["company", "Company", "Company_x0020_Name", "JobCompany", "Job_x0020_Company"];

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(" ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["email", "value", "text", "label", "displayName", "name"]) {
      const next = record[key];
      if (typeof next === "string" && next.trim()) return next.trim();
    }
  }
  return "";
}

/**
 * Reduces a field name to its letters and digits, so a lookup survives the
 * several spellings the same question has by the time it is stored.
 *
 * SharePoint rewrites a column called "Employee ID" to `Employee_x0020_ID`,
 * the survey engine may keep `employee_id`, and an admin picking the field in
 * the builder sees the title. All of them mean one question.
 */
function fieldKey(value: string): string {
  return value.toLowerCase().replace(/_x[0-9a-f]{4}_/g, "").replace(/[^a-z0-9]+/g, "");
}

/** One answer out of the submitted data, whichever spelling it is stored under. */
export function harvestFieldValue(data: Record<string, unknown>, fieldName: string | undefined): string {
  if (!fieldName) return "";
  if (Object.prototype.hasOwnProperty.call(data, fieldName)) return text(data[fieldName]);
  const wanted = fieldKey(fieldName);
  if (!wanted) return "";
  const found = Object.keys(data).find((key) => fieldKey(key) === wanted);
  return found ? text(data[found]) : "";
}

/**
 * Words that make a "name" question somebody else's name.
 *
 * A form asks for the subject's name once and for several other names beside
 * it — the evaluator, the HOD, the department. Matching "name" alone would
 * harvest whichever came first, so a question carrying any of these is refused
 * outright rather than ranked lower.
 */
const FOREIGN_NAME_WORDS = [
  "department", "dept", "division", "section", "unit", "company", "branch", "site",
  "supervisor", "superior", "manager", "approver", "hod", "head", "evaluator", "assessor",
  "reviewer", "witness", "referee", "reference", "emergency", "spouse", "guardian", "next of kin",
  "bank", "file", "form", "document", "project", "course", "trainer", "position", "job", "title",
];

/**
 * Questions that look like a staff number but are not one.
 *
 * An HR form asks for several numbered identities in the same breath, and the
 * national ID in particular is both more common and more sensitive than the
 * staff number — harvesting it into the directory would be wrong twice over.
 */
const FOREIGN_ID_WORDS = [
  "ic", "nric", "mykad", "identity", "identification", "passport", "phone", "mobile", "tel",
  "epf", "kwsp", "socso", "perkeso", "tax", "lhdn", "bank", "account", "licence", "license",
  "supervisor", "approver", "manager", "hod",
];

/**
 * Whole-word containment, so "ic" does not fire on "Vehicle" and "dept" does
 * not fire on "Deptford".
 *
 * Both sides are reduced to space-separated words first, because the labels
 * arrive with wildly inconsistent punctuation — "Emp. ID / No" and
 * "employee_id" have to be comparable.
 */
function hasWord(haystack: string, needle: string): boolean {
  const words = haystack.replace(/[^a-z0-9]+/g, " ").trim();
  const wanted = needle.replace(/[^a-z0-9]+/g, " ").trim();
  if (!words || !wanted) return false;
  return ` ${words} `.includes(` ${wanted} `);
}

function labelText(option: HarvestFieldOption): string {
  return `${option.title || ""} ${option.name || ""}`.toLowerCase();
}

/**
 * Ranks one question against a want, or 0 when it does not qualify.
 *
 * Scored rather than first-match-wins so an exact "Full Name" beats a vaguer
 * "Name of applicant" that happens to be defined earlier in the form.
 */
function scoreLabel(
  option: HarvestFieldOption,
  exact: string[],
  strong: string[],
  weak: string[],
  disqualifiers: string[],
): number {
  const label = labelText(option);
  if (!label.trim()) return 0;
  if (disqualifiers.some((word) => hasWord(label, word))) return 0;

  const tightened = label.replace(/[^a-z0-9]+/g, " ").trim();
  if (exact.includes(tightened)) return 3;
  if (strong.some((word) => hasWord(label, word))) return 2;
  if (weak.some((word) => hasWord(label, word))) return 1;
  return 0;
}

function bestMatch(
  options: HarvestFieldOption[],
  exact: string[],
  strong: string[],
  weak: string[],
  disqualifiers: string[],
): string {
  let best = "";
  let bestScore = 0;
  for (const option of options) {
    if (!option.name) continue;
    const score = scoreLabel(option, exact, strong, weak, disqualifiers);
    if (score > bestScore) {
      best = option.name;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The builder's opening offer: which question probably holds each value.
 *
 * Deliberately conservative — a blank guess an admin fills in costs them one
 * dropdown, while a confident wrong guess quietly harvests the evaluator's
 * name as the subject's for months.
 */
export function harvestFieldGuesses(options: HarvestFieldOption[]): HarvestFieldGuess {
  return {
    nameField: bestMatch(
      options,
      ["full name", "name", "employee name", "staff name", "nama", "nama penuh"],
      ["full name", "employee name", "staff name", "nama"],
      ["name", "applicant"],
      FOREIGN_NAME_WORDS,
    ),
    employeeIdField: bestMatch(
      options,
      ["employee id", "employee no", "staff id", "staff no", "employee number", "staff number"],
      ["employee id", "employee no", "staff id", "staff no", "payroll", "pekerja"],
      ["employee", "staff", "emp"],
      FOREIGN_ID_WORDS,
    ),
    companyField: bestMatch(
      options,
      ["company", "company name", "employer", "syarikat"],
      ["company", "employer", "syarikat"],
      ["entity", "subsidiary"],
      ["supervisor", "approver", "manager", "hod", "head", "bank", "insurance"],
    ),
    departmentField: bestMatch(
      options,
      ["department", "dept", "division", "jabatan"],
      ["department", "jabatan"],
      ["dept", "division", "unit"],
      ["supervisor", "approver", "manager", "hod", "head"],
    ),
    emailField: bestMatch(
      options,
      ["email", "e mail", "email address", "emel"],
      ["email", "e mail", "emel"],
      [],
      FOREIGN_NAME_WORDS,
    ),
  };
}

/**
 * Honorifics and patronymic connectors, which belong to how a name is said
 * rather than to the address built from it.
 *
 * "Dr. Ahmad Faiz bin Rahman" is `ahmad.faiz.rahman`, not
 * `dr.ahmad.faiz.bin.rahman`. Only Malay connectors are dropped: "van" and
 * "de" are load-bearing parts of the names that carry them.
 */
const NAME_NOISE = new Set([
  "mr", "mrs", "ms", "miss", "dr", "prof", "ir", "sr", "hj", "hjh", "haji", "hajjah",
  "encik", "cik", "puan", "tuan", "datuk", "dato", "datin", "dtk", "tansri", "tunku",
  "bin", "binti", "bt", "bte", "ibn", "al", "ap",
]);

/**
 * The address a person probably has, from their name and the house domain.
 *
 * Pure convention, and wrong for anyone whose address predates the convention
 * or who shares a name with a colleague — which is exactly why the row it goes
 * on is marked unconfirmed and shows the admin that this part was invented.
 *
 * Returns "" when there is not enough name to work with, rather than something
 * shaped like an address that is certain to be nobody.
 */
export function guessEmailFromName(name: string, domain: string): string {
  const cleanDomain = domain.trim().replace(/^@/, "").toLowerCase();
  if (!cleanDomain) return "";

  const parts = name
    .normalize("NFD")
    // Strip accents, which no mail system keeps: "José" addresses as "jose".
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // "a/l" and "a/p" survive as separate tokens only if the slash goes first.
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .filter((part) => !NAME_NOISE.has(part))
    // A lone initial adds nothing an admin can verify, and "m.ahmad.faiz" is
    // less likely right than "ahmad.faiz".
    .filter((part) => part.length > 1);

  if (parts.length === 0) return "";
  return `${parts.join(".")}@${cleanDomain}`;
}

/** Whether an address is a real person's rather than a placeholder. */
export function isPersonEmail(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed)) return false;
  return !NON_PERSON_ADDRESSES.has(trimmed.split("@")[0]);
}

/**
 * Reads the harvest settings off a parsed `LayerConfig`, or null when this
 * form was never switched on.
 *
 * Tolerant of shape because the value is JSON stored in a SharePoint column:
 * an older form has no such key at all, and that must read as "off" rather
 * than throwing on submit.
 */
export function readHarvestConfig(layerConfig: unknown): DirectoryHarvestConfig | null {
  if (!layerConfig || typeof layerConfig !== "object") return null;
  const raw = (layerConfig as Record<string, unknown>).directoryHarvest;
  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;
  if (record.enabled !== true) return null;

  return {
    enabled: true,
    nameField: text(record.nameField) || undefined,
    employeeIdField: text(record.employeeIdField) || undefined,
    departmentField: text(record.departmentField) || undefined,
    companyField: text(record.companyField) || undefined,
    emailField: text(record.emailField) || undefined,
  };
}

/** True when the form's workflow has an evaluation step to harvest from. */
export function hasEvaluationLayer(layerConfig: unknown): boolean {
  if (!layerConfig || typeof layerConfig !== "object") return false;
  const groups: unknown[] = [];
  const record = layerConfig as Record<string, unknown>;
  if (Array.isArray(record.layers)) groups.push(...record.layers);
  if (Array.isArray(record.manualBranches)) {
    for (const branch of record.manualBranches) {
      const layers = (branch as Record<string, unknown> | null)?.layers;
      if (Array.isArray(layers)) groups.push(...layers);
    }
  }
  return groups.some((layer) =>
    !!layer && typeof layer === "object" && (layer as Record<string, unknown>).type === "evaluation");
}

/**
 * The person one submission describes, or null when it describes nobody
 * usable.
 *
 * `domain` is the house email domain, used only when no address was submitted.
 * A candidate with no name and no address is not a person worth a row — that
 * is a form whose field mapping is wrong, and inventing rows from it would
 * bury the admin in noise rather than telling them about a new joiner.
 */
export function buildHarvestCandidate(params: {
  config: DirectoryHarvestConfig;
  data: Record<string, unknown>;
  submittedBy: string;
  domain: string;
}): DirectoryHarvestCandidate | null {
  const { config, data, submittedBy, domain } = params;
  if (!config.enabled) return null;

  const personName = harvestFieldValue(data, config.nameField);
  const employeeId = harvestFieldValue(data, config.employeeIdField);
  const department = harvestFieldValue(data, config.departmentField);
  // The company selector's own answer is the fallback, and in practice the
  // usual source: it is on the form whether or not anybody mapped a question.
  const company = harvestFieldValue(data, config.companyField)
    || COMPANY_KEYS.map((key) => harvestFieldValue(data, key)).find(Boolean)
    || "";

  const submittedEmail = harvestFieldValue(data, config.emailField);
  let personEmail = "";
  let emailWasGuessed = false;

  if (isPersonEmail(submittedEmail)) {
    personEmail = submittedEmail.trim().toLowerCase();
  } else if (isPersonEmail(submittedBy)) {
    personEmail = submittedBy.trim().toLowerCase();
  } else if (personName) {
    personEmail = guessEmailFromName(personName, domain);
    emailWasGuessed = !!personEmail;
  }

  if (!personEmail) return null;
  if (!personName && !employeeId && !department) return null;

  return { personEmail, personName, employeeId, department, company, emailWasGuessed };
}

/** Which `Source` value a harvested row carries. */
export function harvestSource(candidate: DirectoryHarvestCandidate): DirectorySource {
  return candidate.emailWasGuessed ? DIRECTORY_SOURCE.autoEmailGuessed : DIRECTORY_SOURCE.auto;
}

/**
 * The approver a harvested person gets: their department's HOD, and nobody
 * otherwise.
 *
 * A person who *is* the HOD is left with no approver rather than pointed at
 * themselves — that is the top of the reporting line, which the resolver
 * already understands as a stopping point.
 */
export function harvestApproverEmail(
  candidate: DirectoryHarvestCandidate,
  departmentHodEmail: string,
): string {
  const hod = departmentHodEmail.trim().toLowerCase();
  if (!hod || !EMAIL_RE.test(hod)) return "";
  return hod === candidate.personEmail.trim().toLowerCase() ? "" : hod;
}

/** What the submission's routing note says about a person just harvested. */
export function harvestNote(candidate: DirectoryHarvestCandidate, approverEmail: string): string {
  const who = candidate.personName || candidate.personEmail;
  const added = `${who} was not in the Approval Directory and has been added as unconfirmed`;
  const approver = approverEmail
    ? `their approver is a guess (${approverEmail}) from their department's HOD`
    : "no approver could be guessed — their department has no HOD listed";
  const email = candidate.emailWasGuessed
    ? `, and their email address (${candidate.personEmail}) was built from their name`
    : "";
  return `Directory: ${added}; ${approver}${email}. Confirm the row on the Approval routing page.`;
}

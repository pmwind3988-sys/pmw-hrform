import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import {
  getGraphToken,
  queryListItems,
  queryListItemById,
  updateListItemFields,
  deleteListItem,
  getListColumns,
  getListColumnChoices,
  listDocLibraryFiles,
  deleteDocLibraryFile,
  type GraphListItem,
} from "./_utils/graphClient.js";
import {
  createCareerPortalCard,
  deleteCareerPortalCard,
  isSystemDefaultCardId,
  listCareerPortalCards,
  parseCareerPortalCardInput,
  updateCareerPortalCard,
  type CareerPortalCardInput,
} from "./_utils/careerPortalCards.js";
import { logError, logWarn } from "./_utils/logger.js";
import {
  createListItemViaSPRest,
  getListFieldsViaSPRest,
  resolveLookupItemIdViaSPRest,
  updateListItemViaSPRest,
} from "./_utils/sharepointRest.js";

interface ApiRequest {
  body: Record<string, unknown>;
  method: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

const APPLICATION_LIST = "Job Applications";
const JOB_LIST = "Internal Job Listing";
const ADMIN_GROUP = "_HR_ Forms Owners";
const SP_SITE_URL = (process.env.VITE_SP_SITE_URL || process.env.SP_SITE_URL || "").replace(/\/$/, "");
const DEFAULT_APPLICATION_LIMIT = 500;
const MAX_APPLICATION_LIMIT = 999;
const TEXT_COMPATIBLE_FIELD_KINDS = new Set([2, 3, 6]);

interface JobDocumentLink {
  name: string;
  url: string;
}

interface SharePointUser {
  Email?: string;
  LoginName?: string;
  UserPrincipalName?: string;
}

interface DelegatedUser {
  email: string;
  login: string;
}

interface ColumnMap {
  byDisplay: Record<string, string>;
  byInternal: Record<string, string>;
  fieldTypes?: Record<string, number>;
  lookupFields?: Record<string, { lookupList: string; lookupField: string }>;
}

interface ApplicationColumns {
  applicantName: string | null;
  applicantEmail: string | null;
  applicantPhone: string | null;
  company: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  status: string | null;
  submissionRef: string | null;
  jobListingId: string | null;
  resumeUrl: string | null;
  coverLetterUrl: string | null;
  supportingDocuments: string | null;
  customAnswers: string | null;
}

interface JobListingColumns {
  title: string;
  company: string | null;
  jobDescription: string | null;
  department: string | null;
  location: string | null;
  employmentType: string | null;
  closingDate: string | null;
  status: string | null;
  applicationCount: string | null;
  customFields: string | null;
}

async function resolveColumnMap(token: string, listName: string): Promise<ColumnMap> {
  const columns = await getListColumns(token, listName);
  const map: ColumnMap = { byDisplay: {}, byInternal: {}, fieldTypes: {}, lookupFields: {} };
  for (const column of columns) {
    map.byDisplay[column.displayName] = column.name;
    map.byInternal[column.name] = column.name;
  }
  return map;
}

async function resolveSpRestColumnMap(token: string, listName: string): Promise<ColumnMap> {
  const columns = await getListFieldsViaSPRest(token, listName);
  const map: ColumnMap = { byDisplay: {}, byInternal: {}, fieldTypes: {}, lookupFields: {} };
  for (const column of columns) {
    map.byDisplay[column.title] = column.internalName;
    map.byInternal[column.internalName] = column.internalName;
    map.fieldTypes![column.internalName] = column.fieldTypeKind;
    if (column.fieldTypeKind === 7 && column.lookupList && column.lookupField) {
      map.lookupFields![column.internalName] = {
        lookupList: column.lookupList,
        lookupField: column.lookupField,
      };
    }
  }
  return map;
}

function findMappedColumn(source: Record<string, string>, candidate: string): string | null {
  if (source[candidate]) return source[candidate];
  const normalizedCandidate = candidate.toLowerCase();
  const match = Object.entries(source).find(([key]) => key.toLowerCase() === normalizedCandidate);
  return match?.[1] ?? null;
}

function findColumn(map: ColumnMap, ...candidates: string[]): string | null {
  for (const candidate of candidates) {
    const internalMatch = findMappedColumn(map.byInternal, candidate);
    if (internalMatch) return internalMatch;
    const displayMatch = findMappedColumn(map.byDisplay, candidate);
    if (displayMatch) return displayMatch;
  }
  return null;
}

function findCompatibleColumn(map: ColumnMap, candidates: string[], acceptedKinds: Set<number>): string | null {
  for (const candidate of candidates) {
    const columnName = findMappedColumn(map.byInternal, candidate) || findMappedColumn(map.byDisplay, candidate);
    if (!columnName) continue;
    const fieldType = map.fieldTypes?.[columnName];
    if (fieldType === undefined || acceptedKinds.has(fieldType)) return columnName;
  }
  return null;
}

export function resolveJobListingColumns(map: ColumnMap): JobListingColumns {
  return {
    title: "Title",
    company: findColumn(map, "Company", "Company Name", "Company_x0020_Name", "JobCompany", "Job Company", "Job_x0020_Company"),
    jobDescription: findColumn(map, "Job Description", "JobDescription", "Job_x0020_Description"),
    department: findColumn(map, "Department"),
    location: findCompatibleColumn(
      map,
      ["Location", "Job Location", "JobLocation", "Job_x0020_Location"],
      TEXT_COMPATIBLE_FIELD_KINDS,
    ),
    employmentType: findColumn(map, "Employment Type", "EmploymentType", "Employment_x0020_Type"),
    closingDate: findColumn(map, "Closing Date", "ClosingDate", "Closing_x0020_Date"),
    status: findColumn(map, "Status"),
    applicationCount: findColumn(map, "Application Count", "ApplicationCount", "Application_x0020_Count"),
    customFields: findColumn(map, "CustomFields", "Custom Fields", "Custom_x0020_Fields"),
  };
}

async function resolveJobListingWriteColumns(
  delegatedToken: string,
  needsLocation: boolean,
): Promise<{ jobColumnMap: ColumnMap; jobColumns: JobListingColumns; warnings: string[] }> {
  let jobColumnMap = await resolveSpRestColumnMap(delegatedToken, JOB_LIST);
  let jobColumns = resolveJobListingColumns(jobColumnMap);
  const warnings: string[] = [];

  if (needsLocation && !jobColumns.location) {
    warnings.push("Location column not available");
  }

  return { jobColumnMap, jobColumns, warnings };
}

function resolveApplicationColumns(map: ColumnMap): ApplicationColumns {
  return {
    applicantName: findColumn(map, "Applicant Name", "ApplicantName", "Applicant_x0020_Name"),
    applicantEmail: findColumn(map, "Applicant Email", "ApplicantEmail", "Applicant_x0020_Email"),
    applicantPhone: findColumn(map, "Applicant Phone", "ApplicantPhone", "Applicant_x0020_Phone"),
    company: findColumn(map, "Company", "Company Name", "Company_x0020_Name", "JobCompany", "Job Company", "Job_x0020_Company"),
    submittedBy: findColumn(map, "Submitted By", "SubmittedBy", "Submitted_x0020_By"),
    submittedAt: findColumn(map, "Submitted At", "SubmittedAt", "Submitted_x0020_At"),
    status: findColumn(map, "Status"),
    submissionRef: findColumn(map, "Submission Ref", "SubmissionRef", "Submission_x0020_Ref"),
    jobListingId: findColumn(map, "Job Listing ID", "JobListingID", "Job_x0020_Listing_x0020_ID"),
    resumeUrl: findColumn(map, "Resume URL", "ResumeUrl", "Resume_x0020_URL"),
    coverLetterUrl: findColumn(map, "Cover Letter URL", "CoverLetterUrl", "Cover_x0020_Letter_x0020_URL"),
    supportingDocuments: findColumn(map, "Supporting Documents", "SupportingDocuments", "Supporting_x0020_Documents"),
    customAnswers: findColumn(map, "Custom Answers", "CustomAnswers", "Custom_x0020_Answers"),
  };
}

function readField(fields: Record<string, unknown>, columnName: string | null, ...fallbackNames: string[]): unknown {
  if (columnName && fields[columnName] !== undefined) return fields[columnName];
  for (const name of fallbackNames) {
    if (fields[name] !== undefined) return fields[name];
  }
  return undefined;
}

function fieldUrl(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(record.Url || record.url || "");
  }
  return "";
}

function parseSupportingDocuments(raw: unknown, fallbackUrl: string): JobDocumentLink[] {
  const docs: JobDocumentLink[] = [];
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || typeof item !== "object") continue;
          const record = item as Record<string, unknown>;
          const url = fieldUrl(record.url || record.Url);
          if (url) docs.push({ name: String(record.name || "Supporting Document"), url });
        }
      }
    } catch {
      if (raw.startsWith("http")) docs.push({ name: "Supporting Document", url: raw });
    }
  }
  if (docs.length === 0 && fallbackUrl) {
    docs.push({ name: "Supporting Document", url: fallbackUrl });
  }

  const seen = new Set<string>();
  return docs.filter((doc) => {
    if (seen.has(doc.url)) return false;
    seen.add(doc.url);
    return true;
  });
}

function normalizeDocumentUrl(value: string): string {
  const base = value.split("?")[0].split("#")[0];
  try {
    const url = new URL(base);
    return decodeURIComponent(`${url.origin}${url.pathname}`).toLowerCase();
  } catch {
    try {
      return decodeURIComponent(base).toLowerCase();
    } catch {
      return base.toLowerCase();
    }
  }
}

function getApplicationDocumentUrls(fields: Record<string, unknown>): Set<string> {
  const urls = new Set<string>();
  const add = (url: string) => {
    if (url) urls.add(normalizeDocumentUrl(url));
  };
  add(fieldUrl(fields.ResumeUrl));
  add(fieldUrl(fields.CoverLetterUrl));
  for (const doc of parseSupportingDocuments(fields.SupportingDocuments, "")) {
    add(doc.url);
  }
  return urls;
}

function docLibraryFileMatchesApplication(
  file: { name: string; webUrl: string },
  submissionRef: string,
  applicationUrls: Set<string>,
): boolean {
  if (submissionRef && file.name.startsWith(`${submissionRef}_`)) return true;
  const normalizedFileUrl = normalizeDocumentUrl(file.webUrl);
  if (applicationUrls.has(normalizedFileUrl)) return true;
  const normalizedFileName = file.name.toLowerCase();
  for (const url of applicationUrls) {
    if (url.endsWith(`/${normalizedFileName}`)) return true;
  }
  return false;
}

function getApplicationJobId(fields: Record<string, unknown>, columnName: string | null = null): string {
  const value = readField(fields, columnName, "JobListingIDLookupId", "JobListingID", "Job_x0020_Listing_x0020_ID");
  return String(value || "");
}

function isDeletedApplication(fields: Record<string, unknown>, statusColumn: string | null = null): boolean {
  return String(readField(fields, statusColumn, "Status") || "").toLowerCase() === "deleted";
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function parseDateParam(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function getSubmittedTime(fields: Record<string, unknown>, submittedAtColumn: string | null = null): number {
  return new Date(String(readField(fields, submittedAtColumn, "SubmittedAt", "Submitted_x0020_At", "Created") || "")).getTime();
}

function getApplicationLimit(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_APPLICATION_LIMIT;
  return Math.min(parsed, MAX_APPLICATION_LIMIT);
}

function numberField(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textField(fields: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    if (fields[name] !== undefined) return String(fields[name] || "");
  }
  return "";
}

function jobCompany(fields: Record<string, unknown>, columnName: string | null = null): string {
  const candidates = [
    ...(columnName ? [columnName] : []),
    "Company",
    "Company_x0020_Name",
    "JobCompany",
    "Job_x0020_Company",
  ];
  return textField(fields, ...candidates);
}

function toUrlFieldValue(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const url = String(record.Url || record.url || "").trim();
    if (!url) return null;
    return {
      __metadata: { type: "SP.FieldUrlValue" },
      Url: url,
      Description: String(record.Description || record.description || url),
    };
  }

  if (typeof value !== "string" || !value.trim()) return null;
  return {
    __metadata: { type: "SP.FieldUrlValue" },
    Url: value.trim(),
    Description: value.trim(),
  };
}

export async function setSharePointRestField(
  token: string,
  fields: Record<string, unknown>,
  columns: ColumnMap,
  columnName: string | null,
  value: unknown,
): Promise<boolean> {
  if (!columnName) return false;
  const fieldType = columns.fieldTypes?.[columnName];

  if (fieldType === 7) {
    const lookupConfig = columns.lookupFields?.[columnName];
    if (!lookupConfig) return false;
    if (value == null || String(value).trim() === "") {
      fields[`${columnName}Id`] = null;
      return true;
    }
    const lookupId = await resolveLookupItemIdViaSPRest(
      token,
      lookupConfig.lookupList,
      lookupConfig.lookupField,
      String(value || ""),
    );
    if (!lookupId) return false;
    fields[`${columnName}Id`] = lookupId;
    return true;
  }

  if (fieldType === 11) {
    if (value == null || (typeof value === "string" && !value.trim())) {
      fields[columnName] = null;
      return true;
    }
    const urlValue = toUrlFieldValue(value);
    if (!urlValue) return false;
    fields[columnName] = urlValue;
    return true;
  }

  fields[columnName] = value;
  return true;
}

export async function buildJobListingCreateFields(
  delegatedToken: string,
  jobColumnMap: ColumnMap,
  jobColumns: JobListingColumns,
  rawBody: Record<string, unknown>,
): Promise<{ fields: Record<string, unknown>; warnings: string[] }> {
  const fields: Record<string, unknown> = {
    [jobColumns.title]: String(rawBody.title || ""),
  };
  const warnings: string[] = [];

  async function addCreateField(
    label: string,
    columnName: string | null,
    value: unknown,
    unavailableWarning = `${label} column not available`,
  ): Promise<void> {
    const didSet = await setSharePointRestField(delegatedToken, fields, jobColumnMap, columnName, value);
    if (!didSet) warnings.push(unavailableWarning);
  }

  if (hasCreateValue(rawBody.company)) {
    await addCreateField(
      "Company",
      jobColumns.company,
      rawBody.company,
      "Company column not available or lookup value not found",
    );
  }
  if (hasCreateValue(rawBody.jobDescription)) {
    await addCreateField("Job Description", jobColumns.jobDescription, rawBody.jobDescription);
  }
  if (hasCreateValue(rawBody.department)) {
    await addCreateField("Department", jobColumns.department, rawBody.department);
  }
  if (hasCreateValue(rawBody.location)) {
    await addCreateField("Location", jobColumns.location, rawBody.location);
  }
  if (hasCreateValue(rawBody.employmentType)) {
    await addCreateField("Employment Type", jobColumns.employmentType, rawBody.employmentType);
  }
  if (hasCreateValue(rawBody.closingDate)) {
    await addCreateField("Closing Date", jobColumns.closingDate, rawBody.closingDate);
  }
  await addCreateField("Status", jobColumns.status, "New");
  await addCreateField("Application Count", jobColumns.applicationCount, 0);

  const customFields = rawBody.customFields;
  if (Array.isArray(customFields) && customFields.length > 0) {
    await addCreateField(
      "CustomFields",
      jobColumns.customFields,
      JSON.stringify(customFields),
      "CustomFields column not available",
    );
  }

  return { fields, warnings };
}

function hasCreateValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return typeof value !== "string" || value.trim() !== "";
}

function isColumnNotRecognized(message: string, columnName: string): boolean {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes(columnName.toLowerCase()) &&
    (lowerMessage.includes("not recognized") || lowerMessage.includes("does not exist"))
  );
}

function getHeader(headers: Record<string, string | string[] | undefined>, name: string): string {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lowerName) continue;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value[0] || "";
  }
  return "";
}

function getBearerToken(headers: Record<string, string | string[] | undefined>): string {
  const authorization = getHeader(headers, "authorization");
  if (!authorization.toLowerCase().startsWith("bearer ")) return "";
  return authorization.slice(7).trim();
}

async function delegatedSharePointGet<T>(accessToken: string, path: string): Promise<T> {
  if (!SP_SITE_URL) throw new Error("SharePoint site URL is not configured");
  const response = await fetch(`${SP_SITE_URL}${path}`, {
    headers: {
      Accept: "application/json;odata=nometadata",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`SharePoint GET ${response.status}`);
  }

  return await response.json() as T;
}

function normalizeDelegatedUser(user: SharePointUser): DelegatedUser | null {
  const email = String(user.Email || user.UserPrincipalName || "").toLowerCase();
  const login = String(user.LoginName || "").toLowerCase();
  const loginEmail = login.split("|").pop() || "";
  const resolvedEmail = email || loginEmail;
  if (!resolvedEmail && !login) return null;
  return { email: resolvedEmail, login };
}

async function resolveDelegatedUser(accessToken: string): Promise<DelegatedUser | null> {
  try {
    const currentUser = await delegatedSharePointGet<SharePointUser>(
      accessToken,
      "/_api/web/currentuser?$select=Email,UserPrincipalName,LoginName",
    );
    return normalizeDelegatedUser(currentUser);
  } catch (error) {
    logWarn("api:job-admin", "Failed to resolve delegated user", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function isDelegatedAdmin(accessToken: string, user: DelegatedUser): Promise<boolean> {
  try {
    const members = await delegatedSharePointGet<{ value?: SharePointUser[] }>(
      accessToken,
      `/_api/web/sitegroups/getByName('${encodeURIComponent(ADMIN_GROUP)}')/users?$select=LoginName,Email,UserPrincipalName`,
    );

    return (members.value || []).some((member) => {
      const memberUser = normalizeDelegatedUser(member);
      if (!memberUser) return false;
      return (
        (user.email && memberUser.email === user.email) ||
        (user.login && memberUser.login === user.login) ||
        (user.email && memberUser.login.endsWith(user.email))
      );
    });
  } catch (error) {
    logWarn("api:job-admin", "Failed to verify admin group membership", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function getApplicationCountsByJob(token: string): Promise<Record<string, number>> {
  const allApps = await queryListItems(token, APPLICATION_LIST, { top: 999 });
  const applicationColumns = resolveApplicationColumns(await resolveColumnMap(token, APPLICATION_LIST));
  const appCountByJob: Record<string, number> = {};
  for (const app of allApps) {
    if (isDeletedApplication(app.fields, applicationColumns.status)) continue;
    const jobId = getApplicationJobId(app.fields, applicationColumns.jobListingId);
    if (jobId) appCountByJob[jobId] = (appCountByJob[jobId] || 0) + 1;
  }
  return appCountByJob;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers as Record<string, string | string[] | undefined>);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });
  const delegatedToken = getBearerToken(req.headers);
  if (!delegatedToken) return res.status(401).json({ error: "Missing delegated SharePoint token" });

  const delegatedUser = await resolveDelegatedUser(delegatedToken);
  if (!delegatedUser) return res.status(401).json({ error: "Unable to verify signed-in user" });

  const delegatedIsAdmin = await isDelegatedAdmin(delegatedToken, delegatedUser);

  try {
    const token = await getGraphToken();

    // ── GET: list all applications ────────────────────────────────────────
    if (req.method === "GET") {
      const url = new URL(req.url || "", "http://localhost");
      const emailFilter = url.searchParams.get("email") || "";
      const statusFilter = url.searchParams.get("status") || "";
      const submittedFrom = parseDateParam(url.searchParams.get("submittedFrom") || "");
      const submittedTo = parseDateParam(url.searchParams.get("submittedTo") || "");
      const limit = getApplicationLimit(url.searchParams.get("limit") || "");
      const effectiveEmailFilter = delegatedIsAdmin ? emailFilter : delegatedUser.email;

      if (!delegatedIsAdmin && (!emailFilter || emailFilter.toLowerCase() !== delegatedUser.email)) {
        return res.status(403).json({ error: "You can only view your own applications." });
      }

      const applicationColumns = resolveApplicationColumns(await resolveColumnMap(token, APPLICATION_LIST));
      const graphFilters: string[] = [];

      if (effectiveEmailFilter) {
        const safeEmail = escapeODataString(effectiveEmailFilter);
        const emailFilters = [];
        if (applicationColumns.applicantEmail) emailFilters.push(`fields/${applicationColumns.applicantEmail} eq '${safeEmail}'`);
        if (applicationColumns.submittedBy) emailFilters.push(`fields/${applicationColumns.submittedBy} eq '${safeEmail}'`);
        if (emailFilters.length > 0) graphFilters.push(`(${emailFilters.join(" or ")})`);
      }
      if (statusFilter && applicationColumns.status) {
        graphFilters.push(`fields/${applicationColumns.status} eq '${escapeODataString(statusFilter)}'`);
      }
      if (submittedFrom && applicationColumns.submittedAt) {
        graphFilters.push(`fields/${applicationColumns.submittedAt} ge '${submittedFrom}'`);
      }
      if (submittedTo && applicationColumns.submittedAt) {
        graphFilters.push(`fields/${applicationColumns.submittedAt} le '${submittedTo}'`);
      }

      let items: GraphListItem[];
      try {
        items = await queryListItems(token, APPLICATION_LIST, {
          top: limit,
          filter: graphFilters.length > 0 ? graphFilters.join(" and ") : undefined,
          preferNonIndexed: graphFilters.length > 0,
        });
      } catch (e) {
        if (graphFilters.length === 0) throw e;
        logWarn("api:job-admin", "Graph application filter failed; falling back to local filtering", {
          errorMessage: e instanceof Error ? e.message : String(e),
        });
        items = await queryListItems(token, APPLICATION_LIST, { top: limit });
      }

      const lowerEmail = effectiveEmailFilter.toLowerCase();
      const fromTime = submittedFrom ? new Date(submittedFrom).getTime() : null;
      const toTime = submittedTo ? new Date(submittedTo).getTime() : null;
      items = items
        .filter((item) => {
          if (isDeletedApplication(item.fields, applicationColumns.status)) return false;
          if (lowerEmail) {
            const applicantEmail = String(readField(item.fields, applicationColumns.applicantEmail, "ApplicantEmail", "Applicant_x0020_Email") || "").toLowerCase();
            const submittedBy = String(readField(item.fields, applicationColumns.submittedBy, "SubmittedBy", "Submitted_x0020_By") || "").toLowerCase();
            if (applicantEmail !== lowerEmail && submittedBy !== lowerEmail) return false;
          }
          if (statusFilter && String(readField(item.fields, applicationColumns.status, "Status") || "") !== statusFilter) return false;
          const submittedTime = getSubmittedTime(item.fields, applicationColumns.submittedAt);
          if (fromTime !== null && (!Number.isFinite(submittedTime) || submittedTime < fromTime)) return false;
          if (toTime !== null && (!Number.isFinite(submittedTime) || submittedTime > toTime)) return false;
          return true;
        })
        .sort((a, b) => getSubmittedTime(b.fields, applicationColumns.submittedAt) - getSubmittedTime(a.fields, applicationColumns.submittedAt));

      const jobCompanyById: Record<string, string> = {};
      try {
        const jobCompanyColumn = findColumn(await resolveColumnMap(token, JOB_LIST), "Company", "Company Name", "Company_x0020_Name", "JobCompany", "Job Company", "Job_x0020_Company");
        const jobItems = await queryListItems(token, JOB_LIST, { top: 999 });
        for (const job of jobItems) {
          const jobId = String(job.id || "");
          if (jobId) jobCompanyById[jobId] = jobCompany(job.fields, jobCompanyColumn);
        }
      } catch (e) {
        logWarn("api:job-admin", "Failed to enrich application company details", {
          errorMessage: e instanceof Error ? e.message : String(e),
        });
      }

      const applications = items.map((item) => {
        let customAnswers: Record<string, unknown> | undefined;
        const raw = readField(item.fields, applicationColumns.customAnswers, "CustomAnswers", "Custom_x0020_Answers");
        if (raw && typeof raw === "string") {
          try { customAnswers = JSON.parse(raw) as Record<string, unknown>; } catch { /* ignore */ }
        }

        const resumeUrl = fieldUrl(readField(item.fields, applicationColumns.resumeUrl, "ResumeUrl", "Resume_x0020_URL"));
        const coverLetterUrl = fieldUrl(readField(item.fields, applicationColumns.coverLetterUrl, "CoverLetterUrl", "Cover_x0020_Letter_x0020_URL"));
        const supportingDocuments = parseSupportingDocuments(
          readField(item.fields, applicationColumns.supportingDocuments, "SupportingDocuments", "Supporting_x0020_Documents"),
          coverLetterUrl,
        );
        const jobListingId = getApplicationJobId(item.fields, applicationColumns.jobListingId);

        return {
          id: String(item.id || ""),
          jobTitle: String(item.fields.Title || "").split(" - ")[0] || String(item.fields.Title || ""),
          company: String(readField(item.fields, applicationColumns.company, "Company", "Company_x0020_Name", "JobCompany", "Job_x0020_Company") || jobCompanyById[jobListingId] || ""),
          applicantName: String(readField(item.fields, applicationColumns.applicantName, "ApplicantName", "Applicant_x0020_Name") || ""),
          applicantEmail: String(readField(item.fields, applicationColumns.applicantEmail, "ApplicantEmail", "Applicant_x0020_Email") || ""),
          status: String(readField(item.fields, applicationColumns.status, "Status") || ""),
          submittedAt: String(readField(item.fields, null, "Created") || readField(item.fields, applicationColumns.submittedAt, "SubmittedAt", "Submitted_x0020_At") || ""),
          modifiedAt: String(readField(item.fields, null, "Modified") || ""),
          submissionRef: String(readField(item.fields, applicationColumns.submissionRef, "SubmissionRef", "Submission_x0020_Ref") || ""),
          applicantPhone: String(readField(item.fields, applicationColumns.applicantPhone, "ApplicantPhone", "Applicant_x0020_Phone") || ""),
          coverLetterUrl: supportingDocuments[0]?.url || coverLetterUrl,
          resumeUrl,
          supportingDocuments,
          customAnswers,
          jobListingId,
        };
      });

      return res.status(200).json({ applications } as unknown as Record<string, unknown>);
    }

    // ── POST: handle actions ──────────────────────────────────────────────
    if (req.method === "POST") {
      const rawBody = req.body as Record<string, unknown>;
      const action = String(rawBody.action || "");

      if (!action) {
        return res.status(400).json({ error: "Missing required field: action" });
      }
      if (!delegatedIsAdmin) {
        return res.status(403).json({ error: "Only HR Forms Owners can use this admin action." });
      }

      // Update application status (New / Reviewed)
      if (action === "update-status") {
        const applicationId = String(rawBody.applicationId || "");
        const status = String(rawBody.status || "");
        if (!applicationId || !status) {
          return res.status(400).json({ error: "Missing required fields: applicationId, status" });
        }
        if (!/^\d+$/.test(applicationId)) {
          return res.status(400).json({ error: "Invalid applicationId" });
        }
        const validStatuses = ["New", "KIV", "Shortlisted", "Not Suitable"];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
        }
        await updateListItemFields(token, APPLICATION_LIST, applicationId, { Status: status });
        return res.status(200).json({ success: true });
      }

      // Delete applications + update applicant counts + remove associated files
      if (action === "delete-applications") {
        const ids = rawBody.ids;
        if (!Array.isArray(ids) || ids.length === 0) {
          return res.status(400).json({ error: "Missing required field: ids (array)" });
        }

        const DOC_LIB = "Job Applications Files";

        // Pre-fetch all files in the document library (one call instead of N)
        let docLibFiles: Array<{ id: string; name: string; webUrl: string }> = [];
        try {
          docLibFiles = await listDocLibraryFiles(token, DOC_LIB);
        } catch { /* best-effort — file deletion won't happen but application deletion proceeds */ }

        // Fetch applications to get JobListingID + SubmissionRef before deleting
        const affectedJobIds = new Set<string>();
        const deletedFileIds = new Set<string>();
        let deletedFiles = 0;
        const fileWarnings: string[] = [];
        for (const id of ids) {
          if (!/^\d+$/.test(String(id))) continue;
          try {
            const appResult = await queryListItemById(token, APPLICATION_LIST, String(id));
            if (appResult) {
              const jobId = getApplicationJobId(appResult.fields);
              if (jobId) {
                affectedJobIds.add(jobId);
              }
              // Delete associated files from the Job Applications Files doc library
              const submissionRef = String(appResult.fields.SubmissionRef || "");
              const documentUrls = getApplicationDocumentUrls(appResult.fields);
              if ((submissionRef || documentUrls.size > 0) && docLibFiles.length > 0) {
                const matching = docLibFiles.filter((file) =>
                  docLibraryFileMatchesApplication(file, submissionRef, documentUrls),
                );
                for (const file of matching) {
                  if (deletedFileIds.has(file.id)) continue;
                  try {
                    await deleteDocLibraryFile(token, DOC_LIB, file.id);
                    deletedFileIds.add(file.id);
                    deletedFiles++;
                  } catch {
                    fileWarnings.push(`File delete failed: ${file.name}`);
                  }
                }
              }
            }
          } catch { /* proceed even if fetch fails */ }
        }

        // Delete applications
        let deleted = 0;
        const errors: string[] = [];
        for (const id of ids) {
          try {
            await deleteListItem(token, APPLICATION_LIST, String(id));
            deleted++;
          } catch {
            errors.push(`Delete failed for item ${id}`);
          }
        }

        // Sync Application Count from the remaining application list items.
        try {
          const liveCounts = await getApplicationCountsByJob(token);
          const jobColumns = resolveJobListingColumns(await resolveColumnMap(token, JOB_LIST));
          for (const jobId of affectedJobIds) {
            if (!/^\d+$/.test(String(jobId))) continue;
            if (!jobColumns.applicationCount) continue;
            await updateListItemFields(token, JOB_LIST, jobId, { [jobColumns.applicationCount]: liveCounts[jobId] ?? 0 });
          }
        } catch (e) {
          logWarn("api:job-admin", "Failed to sync application counts after delete", {
            errorMessage: e instanceof Error ? e.message : String(e),
          });
        }

        return res.status(200).json({
          success: true,
          deleted,
          deletedFiles,
          errors: errors.length > 0 ? errors : undefined,
          fileWarnings: fileWarnings.length > 0 ? fileWarnings : undefined,
        });
      }

      // Create a new job listing
      if (action === "create-job") {
        const title = String(rawBody.title || "");
        if (!title) {
          return res.status(400).json({ error: "Missing required field: title" });
        }

        const customFields = rawBody.customFields;
        const hasCustomFields = Array.isArray(customFields) && customFields.length > 0;
        const {
          jobColumnMap,
          jobColumns,
          warnings: columnWarnings,
        } = await resolveJobListingWriteColumns(delegatedToken, hasCreateValue(rawBody.location));
        const createFields = await buildJobListingCreateFields(
          delegatedToken,
          jobColumnMap,
          jobColumns,
          rawBody,
        );
        const warningParts: string[] = [...columnWarnings, ...createFields.warnings];
        const fields = createFields.fields;

        try {
          const result = await createListItemViaSPRest(delegatedToken, JOB_LIST, fields);
          return res.status(200).json({
            success: true,
            jobId: result.id,
            ...(warningParts.length > 0 ? { warning: warningParts.join("; ") } : {}),
          });
        } catch (err) {
          const msg = (err as Error).message;
          const retryWarnings: string[] = [];
          // If CustomFields column doesn't exist on the list, retry without it
          if (hasCustomFields && jobColumns.customFields && isColumnNotRecognized(msg, jobColumns.customFields)) {
            delete fields[jobColumns.customFields];
            retryWarnings.push("CustomFields column not available");
          }
          if (jobColumns.company && jobColumns.company in fields && isColumnNotRecognized(msg, jobColumns.company)) {
            delete fields[jobColumns.company];
            retryWarnings.push("Company column not available");
          }
          if (jobColumns.applicationCount && jobColumns.applicationCount in fields && isColumnNotRecognized(msg, jobColumns.applicationCount)) {
            delete fields[jobColumns.applicationCount];
            retryWarnings.push("Application Count column not available");
          }
          if (retryWarnings.length > 0) {
            const result = await createListItemViaSPRest(delegatedToken, JOB_LIST, fields);
            return res.status(200).json({
              success: true,
              jobId: result.id,
              warning: [...warningParts, ...retryWarnings].join("; "),
            });
          }
          throw err; // Re-throw for the outer catch
        }
      }

      // List all job listings (admin view)
      if (action === "list-jobs") {
        const items = await queryListItems(token, JOB_LIST, { top: 999 });
        const jobColumns = resolveJobListingColumns(await resolveColumnMap(token, JOB_LIST));

        const jobs = items.map((item) => {
          const itemId = String(item.id || "");
          let customFields: Record<string, unknown>[] | undefined;
          const raw = readField(item.fields, jobColumns.customFields, "CustomFields", "Custom_x0020_Fields");
          if (raw && typeof raw === "string") {
            try { customFields = JSON.parse(raw) as Record<string, unknown>[]; } catch { /* ignore */ }
          }
          const closingDate = readField(item.fields, jobColumns.closingDate, "Closing_x0020_Date");
          return {
            id: itemId,
            title: String(readField(item.fields, jobColumns.title, "Title") || ""),
            company: jobCompany(item.fields, jobColumns.company),
            jobDescription: String(readField(item.fields, jobColumns.jobDescription, "Job_x0020_Description") || ""),
            department: String(readField(item.fields, jobColumns.department, "Department") || ""),
            location: String(readField(item.fields, jobColumns.location, "Location") || ""),
            employmentType: String(readField(item.fields, jobColumns.employmentType, "Employment_x0020_Type") || ""),
            closingDate: closingDate ? String(closingDate).split("T")[0] : null,
            status: String(readField(item.fields, jobColumns.status, "Status") || "New"),
            applicationCount: numberField(readField(item.fields, jobColumns.applicationCount, "Application_x0020_Count")),
            created: String(item.fields.Created || ""),
            customFields,
          };
        });
        return res.status(200).json({ jobs } as unknown as Record<string, unknown>);
      }

      // Update an existing job listing
      if (action === "update-job") {
        const jobId = String(rawBody.jobId || "");
        if (!jobId) {
          return res.status(400).json({ error: "Missing required field: jobId" });
        }
        if (!/^\d+$/.test(jobId)) {
          return res.status(400).json({ error: "Invalid jobId" });
        }

        const {
          jobColumnMap,
          jobColumns,
          warnings: columnWarnings,
        } = await resolveJobListingWriteColumns(delegatedToken, rawBody.location !== undefined);
        const fieldPatches: Array<{ label: string; fields: Record<string, unknown> }> = [];
        const warningParts: string[] = [...columnWarnings];

        async function addUpdatePatch(
          label: string,
          columnName: string | null,
          value: unknown,
          unavailableWarning = `${label} column not available`,
        ): Promise<void> {
          const patchFields: Record<string, unknown> = {};
          const didSet = await setSharePointRestField(delegatedToken, patchFields, jobColumnMap, columnName, value);
          if (!didSet) {
            warningParts.push(unavailableWarning);
            return;
          }
          fieldPatches.push({ label, fields: patchFields });
        }

        if (rawBody.title !== undefined) {
          await addUpdatePatch("Title", jobColumns.title, rawBody.title);
        }
        if (rawBody.company !== undefined) {
          await addUpdatePatch(
            "Company",
            jobColumns.company,
            rawBody.company,
            "Company column not available or lookup value not found",
          );
        }
        if (rawBody.jobDescription !== undefined) {
          await addUpdatePatch("Job Description", jobColumns.jobDescription, rawBody.jobDescription);
        }
        if (rawBody.department !== undefined) {
          await addUpdatePatch("Department", jobColumns.department, rawBody.department);
        }
        if (rawBody.location !== undefined) {
          await addUpdatePatch("Location", jobColumns.location, rawBody.location);
        }
        if (rawBody.employmentType !== undefined) {
          await addUpdatePatch("Employment Type", jobColumns.employmentType, rawBody.employmentType);
        }
        if (rawBody.closingDate !== undefined) {
          await addUpdatePatch("Closing Date", jobColumns.closingDate, rawBody.closingDate);
        }
        if (rawBody.status !== undefined) {
          await addUpdatePatch("Status", jobColumns.status, rawBody.status);
        }
        if (rawBody.customFields !== undefined) {
          await addUpdatePatch("CustomFields", jobColumns.customFields, JSON.stringify(rawBody.customFields), "CustomFields column not available");
        }

        for (const patch of fieldPatches) {
          try {
            await updateListItemViaSPRest(delegatedToken, JOB_LIST, jobId, patch.fields);
          } catch (err) {
            warningParts.push(`${patch.label} could not be saved`);
            logWarn("api:job-admin", "Failed to patch job listing field", {
              jobId,
              fieldLabel: patch.label,
              errorMessage: err instanceof Error ? err.message : String(err),
            });
          }
        }
        const warning = warningParts.length > 0 ? warningParts.join("; ") : undefined;
        return res.status(200).json({ success: true, ...(warning ? { warning } : {}) });
      }

      // Permanently delete a job listing
      if (action === "delete-job") {
        const jobId = String(rawBody.jobId || "");
        if (!jobId) {
          return res.status(400).json({ error: "Missing required field: jobId" });
        }
        if (!/^\d+$/.test(jobId)) {
          return res.status(400).json({ error: "Invalid jobId" });
        }
        await deleteListItem(token, JOB_LIST, jobId);
        return res.status(200).json({ success: true });
      }

      // Career portal welcome cards
      if (action === "list-portal-cards") {
        const portalCards = await listCareerPortalCards(token);
        return res.status(200).json({ portalCards } as unknown as Record<string, unknown>);
      }

      if (action === "create-portal-card") {
        let input: CareerPortalCardInput;
        try {
          input = parseCareerPortalCardInput(rawBody);
        } catch (err) {
          return res.status(400).json({ error: err instanceof Error ? err.message : "Invalid portal card data" });
        }
        try {
          const result = await createCareerPortalCard(token, input);
          return res.status(200).json({ success: true, cardId: result.id });
        } catch (err) {
          return res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create portal card" });
        }
      }

      if (action === "update-portal-card") {
        const cardId = String(rawBody.cardId || "");
        if (!cardId) {
          return res.status(400).json({ error: "Missing required field: cardId" });
        }
        if (!/^\d+$/.test(cardId) && !isSystemDefaultCardId(cardId)) {
          return res.status(400).json({ error: "Invalid cardId" });
        }
        let input: CareerPortalCardInput;
        try {
          input = parseCareerPortalCardInput(rawBody, { partial: true });
        } catch (err) {
          return res.status(400).json({ error: err instanceof Error ? err.message : "Invalid portal card data" });
        }
        try {
          await updateCareerPortalCard(token, cardId, input);
          return res.status(200).json({ success: true });
        } catch (err) {
          return res.status(400).json({ error: err instanceof Error ? err.message : "Failed to update portal card" });
        }
      }

      if (action === "delete-portal-card") {
        const cardId = String(rawBody.cardId || "");
        if (!cardId) {
          return res.status(400).json({ error: "Missing required field: cardId" });
        }
        if (!/^\d+$/.test(cardId) && !isSystemDefaultCardId(cardId)) {
          return res.status(400).json({ error: "Invalid cardId" });
        }
        try {
          await deleteCareerPortalCard(token, cardId);
          return res.status(200).json({ success: true });
        } catch (err) {
          return res.status(400).json({ error: err instanceof Error ? err.message : "Failed to delete portal card" });
        }
      }

      // Fetch choices from a SharePoint column
      if (action === "get-column-choices") {
        const listName = String(rawBody.listName || "");
        const columnName = String(rawBody.columnName || "");
        if (!listName || !columnName) {
          return res.status(400).json({ error: "Missing listName or columnName" });
        }
        const choices = await getListColumnChoices(token, listName, columnName);
        return res.status(200).json({ choices } as unknown as Record<string, unknown>);
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    logError("api:job-admin", "Unhandled job admin API error", e);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

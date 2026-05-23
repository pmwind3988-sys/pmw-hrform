import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken } from "./_utils/graphClient.js";
import { logError, logInfo, logWarn } from "./_utils/logger.js";

function errorMessage(error: unknown, maxLength?: number): string {
  const message = error instanceof Error ? error.message : String(error);
  return maxLength ? message.slice(0, maxLength) : message;
}

const SP_SITE_URL = (process.env.VITE_SP_SITE_URL || process.env.SP_SITE_URL || "").replace(/\/$/, "");
const APPLICATION_LIST = "Job Applications";
const JOB_LIST = "Internal Job Listing";
const DOC_LIB_NAME = "Job Applications Files";
const HR_OWNER_GROUP = "_HR_ Forms Owners";
const PDPA_NOTICE_VERSION = "PDPA-MY-HR-2026-05-22";
const PDPA_RETENTION_YEARS = Number(process.env.PDPA_RETENTION_YEARS || "7");

/**
 * Write a hyperlink value to a SharePoint "Hyperlink or Picture" column using
 * the SharePoint REST v1 API (_api/web/lists/...) with a FormDigest.
 *
 * Graph's list item endpoints are unreliable for Hyperlink/Picture columns.
 * SharePoint REST uses the FieldUrlValue wire format that SharePoint expects.
 *
 * The hyperlink wire format for SP REST v1 is:
 *   { "__metadata": { "type": "SP.FieldUrlValue" }, "Url": "...", "Description": "..." }
 */
async function patchHyperlinkViaSPRest(
  token: string,
  listName: string,
  numericItemId: string,
  fieldName: string,
  url: string,
  description = "",
): Promise<void> {
  if (!SP_SITE_URL) throw new Error("SP_SITE_URL env var not set — cannot use SP REST API");

  const endpoint = `${SP_SITE_URL}${spListEndpoint(listName)}/items(${numericItemId})`;
  const entityType = await getListEntityType(token, listName);
  const digest = await getSpDigest(token);
  const body = JSON.stringify({
    __metadata: { type: entityType },
    [fieldName]: {
      __metadata: { type: "SP.FieldUrlValue" },
      Url: url,
      Description: description || url,
    },
  });

  // SP REST MERGE requires X-HTTP-Method: MERGE plus a current FormDigest.
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=verbose",
      "Content-Type": "application/json;odata=verbose",
      "X-HTTP-Method": "MERGE",
      "IF-MATCH": "*",
      "X-RequestDigest": digest,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SP REST MERGE ${res.status}: ${text.slice(0, 300)}`);
  }
}

/**
 * Patch a URL/hyperlink value into a SharePoint column.
 * Tries SP REST FieldUrlValue first, then falls back to plain text for lists
 * where the URL column was changed to a text-compatible field.
 */
async function patchUrlColumn(
  userToken: string,
  listName: string,
  itemId: string,
  fieldName: string,
  url: string,
  description: string,
): Promise<void> {
  // Use the signed-in user's delegated SharePoint token so the item history
  // records the applicant as the editor.
  try {
    await patchHyperlinkViaSPRest(userToken, listName, itemId, fieldName, url, description);
    logInfo("api:job-apply", "URL field saved via SP REST delegated token", { fieldName });
    return;
  } catch (e) {
    logWarn("api:job-apply", "SP REST FieldUrlValue update failed", {
      fieldName,
      errorMessage: errorMessage(e, 200),
    });
  }

  try {
    await updateListItemViaSPRest(userToken, listName, itemId, { [fieldName]: url });
    logInfo("api:job-apply", "URL field saved as text via delegated token", { fieldName });
    return;
  } catch (e) {
    logWarn("api:job-apply", "SP REST text URL update failed", {
      fieldName,
      errorMessage: errorMessage(e, 200),
    });
  }

  logError("api:job-apply", "Could not save URL field after all attempts", undefined, {
    fieldName,
    urlPreview: url.slice(0, 100),
  });
  throw new Error(`Could not save ${fieldName} URL to SharePoint.`);
}

type UploadedFileRole = "resume" | "supporting" | "applicationPdf";

interface UploadedFile {
  name: string;
  content: string;
  contentType: string;
  role?: UploadedFileRole;
}

interface JobApplyBody {
  jobListingId: string;
  jobTitle: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  currentPosition?: string;
  currentDepartment?: string;
  coverLetter?: string;
  files?: UploadedFile[];
  customAnswers?: Record<string, unknown>;
  submittedByEmail?: string;
  forceApply?: boolean;
  submissionRef?: string;
  pdpaConsent?: boolean;
  pdpaNoticeVersion?: string;
  pdpaConsentedAt?: string;
  retentionUntil?: string;
  /** User's delegated access token (MSAL, AllSites.Manage scope) — used for SP REST v1 calls */
  accessToken?: string;
}

interface ApiRequest {
  body: Record<string, unknown>;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function generateSubmissionRef(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `JOB-${y}${m}${d}-${rand}`;
}

function decodeBase64(content: string): Uint8Array {
  let b64 = content;
  if (b64.startsWith("data:")) {
    const commaIdx = b64.indexOf(",");
    b64 = commaIdx >= 0 ? b64.substring(commaIdx + 1) : b64;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function getRetentionUntil(from: Date = new Date()): string {
  const retentionUntil = new Date(from);
  retentionUntil.setFullYear(retentionUntil.getFullYear() + PDPA_RETENTION_YEARS);
  return retentionUntil.toISOString();
}

function inferFileRole(file: UploadedFile, index: number): UploadedFileRole {
  if (file.role === "resume" || file.role === "supporting" || file.role === "applicationPdf") {
    return file.role;
  }
  if (index === 0) return "resume";
  return file.name.toLowerCase() === "careeradvancementapplication.pdf" ? "applicationPdf" : "supporting";
}

// ── Column resolver ───────────────────────────────────────────────────────────
// Builds a map of displayName → internal name by querying the list schema.
// This is the only reliable way to handle columns regardless of how they
// were created (UI, REST, Graph, PnP, etc.).

interface ColumnMap {
  byDisplay: Record<string, string>;
  byInternal: Record<string, string>;
  fieldTypes: Record<string, number>;
  raw: Array<{ name: string; displayName: string; fieldTypeKind: number }>;
}

interface SharePointCurrentUser {
  Email?: string;
  UserPrincipalName?: string;
  LoginName?: string;
  Title?: string;
}

interface SpColumnSpec {
  name: string;
  displayName: string;
  acceptKinds: number[];
  kind: number;
  extra?: Record<string, unknown>;
}

const APPLICATION_COLUMN_SPECS: SpColumnSpec[] = [
  { name: "ApplicantName", displayName: "Applicant Name", acceptKinds: [2], kind: 2 },
  { name: "ApplicantEmail", displayName: "Applicant Email", acceptKinds: [2], kind: 2 },
  { name: "ApplicantPhone", displayName: "Applicant Phone", acceptKinds: [2], kind: 2 },
  { name: "JobListingID", displayName: "Job Listing ID", acceptKinds: [9, 7], kind: 9 },
  { name: "Status", displayName: "Status", acceptKinds: [2, 6], kind: 2 },
  { name: "SubmissionRef", displayName: "Submission Ref", acceptKinds: [2], kind: 2 },
  { name: "SubmittedBy", displayName: "Submitted By", acceptKinds: [2], kind: 2 },
  { name: "SubmittedAt", displayName: "Submitted At", acceptKinds: [4, 2], kind: 4 },
  { name: "ResumeUrl", displayName: "Resume URL", acceptKinds: [11, 2], kind: 11, extra: { DisplayFormat: 0 } },
  { name: "CoverLetterUrl", displayName: "Cover Letter URL", acceptKinds: [11, 2], kind: 11, extra: { DisplayFormat: 0 } },
  { name: "SupportingDocuments", displayName: "Supporting Documents", acceptKinds: [3], kind: 3, extra: { NumberOfLines: 6 } },
  { name: "Reasoning", displayName: "Reasoning", acceptKinds: [3], kind: 3, extra: { NumberOfLines: 6 } },
  { name: "CustomAnswers", displayName: "Custom Answers", acceptKinds: [3], kind: 3, extra: { NumberOfLines: 6 } },
  { name: "CurrentPosition", displayName: "Current Position", acceptKinds: [2], kind: 2 },
  { name: "CurrentDepartment", displayName: "Current Department", acceptKinds: [2], kind: 2 },
  { name: "PDPAConsent", displayName: "PDPA Consent", acceptKinds: [2], kind: 2 },
  { name: "PDPANoticeVersion", displayName: "PDPA Notice Version", acceptKinds: [2], kind: 2 },
  { name: "PDPAConsentAt", displayName: "PDPA Consent At", acceptKinds: [4, 2], kind: 4 },
  { name: "RetentionUntil", displayName: "Retention Until", acceptKinds: [4, 2], kind: 4 },
];

const SP_FIELD_TYPES: Record<number, string> = {
  2: "SP.Field",
  3: "SP.FieldMultiLineText",
  4: "SP.FieldDateTime",
  7: "SP.FieldLookup",
  8: "SP.Field",
  9: "SP.FieldNumber",
  11: "SP.FieldUrl",
};

function requireSpSiteUrl(): string {
  if (!SP_SITE_URL) throw new Error("SP_SITE_URL env var not set.");
  return SP_SITE_URL;
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function spListEndpoint(listName: string): string {
  return `/_api/web/lists/getbytitle('${encodeURIComponent(escapeODataString(listName))}')`;
}

async function readJsonOrThrow<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${label} ${res.status}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

async function getSpDigest(token: string): Promise<string> {
  const res = await fetch(`${requireSpSiteUrl()}/_api/contextinfo`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
    },
  });
  const data = await readJsonOrThrow<{ FormDigestValue?: string }>(res, "SP REST contextinfo");
  if (!data.FormDigestValue) throw new Error("SharePoint did not return a FormDigestValue.");
  return data.FormDigestValue;
}

async function spGet<T>(token: string, path: string, label: string): Promise<T> {
  const res = await fetch(`${requireSpSiteUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
    },
  });
  return readJsonOrThrow<T>(res, label);
}

async function getSharePointCurrentUser(token: string): Promise<SharePointCurrentUser> {
  return spGet<SharePointCurrentUser>(
    token,
    "/_api/web/currentuser?$select=Email,UserPrincipalName,LoginName,Title",
    "SP REST currentuser",
  );
}

function resolveSharePointUserEmail(user: SharePointCurrentUser): string {
  const email = user.Email || user.UserPrincipalName || "";
  if (email) return email.toLowerCase();
  const login = user.LoginName || "";
  const match = login.match(/([^|#]+@[^|#]+)$/);
  return match?.[1]?.toLowerCase() || "";
}

async function getListEntityType(token: string, listName: string): Promise<string> {
  const data = await spGet<{ ListItemEntityTypeFullName?: string }>(
    token,
    `${spListEndpoint(listName)}?$select=ListItemEntityTypeFullName`,
    `SP REST list metadata ${listName}`,
  );
  if (!data.ListItemEntityTypeFullName) throw new Error(`Could not resolve SharePoint entity type for "${listName}".`);
  return data.ListItemEntityTypeFullName;
}

async function resolveColumns(token: string, listName: string): Promise<ColumnMap> {
  const data = await spGet<{ value?: Array<{ InternalName: string; Title: string; FieldTypeKind: number }> }>(
    token,
    `${spListEndpoint(listName)}/fields?$select=InternalName,Title,FieldTypeKind`,
    `SP REST fields ${listName}`,
  );
  const byDisplay: Record<string, string> = {};
  const byInternal: Record<string, string> = {};
  const fieldTypes: Record<string, number> = {};
  const cols = (data.value || []).map((col) => ({
    name: col.InternalName,
    displayName: col.Title,
    fieldTypeKind: col.FieldTypeKind,
  }));
  for (const col of cols) {
    byDisplay[col.displayName] = col.name;
    byInternal[col.name] = col.name;
    fieldTypes[col.name] = col.fieldTypeKind;
  }
  return { byDisplay, byInternal, fieldTypes, raw: cols };
}

async function ensureJobApplicationColumnsViaSPRest(token: string): Promise<void> {
  let colMap = await resolveColumns(token, APPLICATION_LIST);
  const digest = await getSpDigest(token);

  for (const spec of APPLICATION_COLUMN_SPECS) {
    const existingInternal = colMap.byInternal[spec.name] || colMap.byDisplay[spec.displayName];
    if (existingInternal) {
      const existingType = colMap.fieldTypes[existingInternal];
      if (!spec.acceptKinds.includes(existingType)) {
        throw new Error(
          `Column "${spec.displayName}" exists with incompatible SharePoint type kind ${existingType}.`,
        );
      }
      continue;
    }

    const body: Record<string, unknown> = {
      __metadata: { type: SP_FIELD_TYPES[spec.kind] ?? "SP.Field" },
      FieldTypeKind: spec.kind,
      Title: spec.displayName,
      StaticName: spec.name,
    };
    if (spec.extra) Object.assign(body, spec.extra);

    const res = await fetch(`${requireSpSiteUrl()}${spListEndpoint(APPLICATION_LIST)}/fields`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json;odata=nometadata",
        "Content-Type": "application/json;odata=verbose",
        "X-RequestDigest": digest,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      const lower = text.toLowerCase();
      if (!lower.includes("duplicate") && !lower.includes("already exists")) {
        throw new Error(`Failed to create column "${spec.displayName}": ${res.status} ${text.slice(0, 200)}`);
      }
    }
    colMap = await resolveColumns(token, APPLICATION_LIST);
  }
}

/**
 * Find the internal name for a column, trying multiple display name variants.
 * Returns null if not found — caller decides whether to skip or throw.
 */
function findColumn(map: ColumnMap, ...candidates: string[]): string | null {
  for (const c of candidates) {
    if (map.byDisplay[c]) return map.byDisplay[c];
    if (map.byInternal[c]) return map.byInternal[c];
  }
  return null;
}

async function ensureDocLibraryViaSPRest(token: string, libraryName: string): Promise<void> {
  const exists = await fetch(`${requireSpSiteUrl()}${spListEndpoint(libraryName)}?$select=Id`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
    },
  });
  if (exists.ok) return;
  if (exists.status !== 404) {
    const text = await exists.text();
    throw new Error(`SP REST library check ${exists.status}: ${text.slice(0, 300)}`);
  }

  const digest = await getSpDigest(token);
  const res = await fetch(`${requireSpSiteUrl()}/_api/web/lists`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
      "Content-Type": "application/json;odata=verbose",
      "X-RequestDigest": digest,
    },
    body: JSON.stringify({
      __metadata: { type: "SP.List" },
      BaseTemplate: 101,
      Title: libraryName,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    const lower = text.toLowerCase();
    if (!lower.includes("duplicate") && !lower.includes("already exists")) {
      throw new Error(`SP REST create library ${res.status}: ${text.slice(0, 300)}`);
    }
  }
}

async function createListItemViaSPRest(
  token: string,
  listName: string,
  fields: Record<string, unknown>,
): Promise<{ id: string }> {
  const digest = await getSpDigest(token);
  const entityType = await getListEntityType(token, listName);
  const res = await fetch(`${requireSpSiteUrl()}${spListEndpoint(listName)}/items`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
      "Content-Type": "application/json;odata=verbose",
      "X-RequestDigest": digest,
    },
    body: JSON.stringify({ __metadata: { type: entityType }, ...fields }),
  });
  const data = await readJsonOrThrow<{ Id?: number; ID?: number; id?: number }>(res, "SP REST create item");
  const id = data.Id ?? data.ID ?? data.id;
  if (!id) throw new Error("SharePoint did not return the created item ID.");
  return { id: String(id) };
}

async function updateListItemViaSPRest(
  token: string,
  listName: string,
  itemId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const digest = await getSpDigest(token);
  const entityType = await getListEntityType(token, listName);
  const res = await fetch(`${requireSpSiteUrl()}${spListEndpoint(listName)}/items(${itemId})`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
      "Content-Type": "application/json;odata=verbose",
      "X-HTTP-Method": "MERGE",
      "IF-MATCH": "*",
      "X-RequestDigest": digest,
    },
    body: JSON.stringify({ __metadata: { type: entityType }, ...fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SP REST update item ${res.status}: ${text.slice(0, 300)}`);
  }
}

async function uploadFileViaSPRest(
  token: string,
  libraryName: string,
  fileName: string,
  content: Uint8Array,
): Promise<string> {
  await ensureDocLibraryViaSPRest(token, libraryName);
  const digest = await getSpDigest(token);
  const safeFileName = escapeODataString(fileName);
  const res = await fetch(
    `${requireSpSiteUrl()}${spListEndpoint(libraryName)}/RootFolder/Files/add(url='${safeFileName}',overwrite=true)`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json;odata=nometadata",
        "Content-Type": "application/octet-stream",
        "X-RequestDigest": digest,
      },
      body: content,
    },
  );
  const data = await readJsonOrThrow<{ ServerRelativeUrl?: string; LinkingUrl?: string }>(res, "SP REST upload file");
  if (data.LinkingUrl) return data.LinkingUrl;
  if (data.ServerRelativeUrl) return `${new URL(requireSpSiteUrl()).origin}${data.ServerRelativeUrl}`;
  return "";
}

function jobListingFilter(colMap: ColumnMap, internalName: string, jobListingId: string): string {
  const fieldType = colMap.fieldTypes[internalName];
  const fieldName = fieldType === 7 ? `${internalName}Id` : internalName;
  return `${fieldName} eq ${Number(jobListingId)}`;
}

async function hasDuplicateApplication(
  token: string,
  colMap: ColumnMap,
  columns: { jobListingId: string | null; applicantEmail: string | null; submittedBy: string | null },
  jobListingId: string,
  applicantEmail: string,
  authenticatedEmail: string,
): Promise<boolean> {
  if (!columns.jobListingId) return false;
  const identityFilters: string[] = [];
  const normalizedApplicant = applicantEmail.toLowerCase();
  if (columns.submittedBy) {
    identityFilters.push(`${columns.submittedBy} eq '${escapeODataString(authenticatedEmail)}'`);
  }
  if (columns.applicantEmail) {
    identityFilters.push(`${columns.applicantEmail} eq '${escapeODataString(authenticatedEmail)}'`);
    if (normalizedApplicant !== authenticatedEmail) {
      identityFilters.push(`${columns.applicantEmail} eq '${escapeODataString(normalizedApplicant)}'`);
    }
  }
  if (identityFilters.length === 0) return false;

  const filter = `${jobListingFilter(colMap, columns.jobListingId, jobListingId)} and (${identityFilters.join(" or ")})`;
  const params = new URLSearchParams({
    "$select": "Id",
    "$top": "1",
    "$filter": filter,
  });
  const data = await spGet<{ value?: Array<{ Id?: number }> }>(
    token,
    `${spListEndpoint(APPLICATION_LIST)}/items?${params.toString()}`,
    "SP REST duplicate check",
  );
  return (data.value || []).length > 0;
}

async function countApplicationsForJobViaSPRest(
  token: string,
  colMap: ColumnMap,
  columns: { jobListingId: string | null; status: string | null },
  jobListingId: string,
): Promise<number | null> {
  if (!columns.jobListingId) return null;
  const selectFields = ["Id", ...(columns.status ? [columns.status] : [])].join(",");
  const params = new URLSearchParams({
    "$select": selectFields,
    "$top": "5000",
    "$filter": jobListingFilter(colMap, columns.jobListingId, jobListingId),
  });
  const data = await spGet<{ value?: Array<Record<string, unknown>> }>(
    token,
    `${spListEndpoint(APPLICATION_LIST)}/items?${params.toString()}`,
    "SP REST application count",
  );
  const items = data.value || [];
  const statusField = columns.status;
  if (!statusField) return items.length;
  return items.filter((item) => String(item[statusField] || "").toLowerCase() !== "deleted").length;
}

async function isHrFormsOwner(token: string, authenticatedEmail: string): Promise<boolean> {
  try {
    const data = await spGet<{ value?: Array<{ Email?: string; UserPrincipalName?: string; LoginName?: string }> }>(
      token,
      `/_api/web/sitegroups/getByName('${encodeURIComponent(escapeODataString(HR_OWNER_GROUP))}')/users?$select=Email,UserPrincipalName,LoginName`,
      "SP REST owner group",
    );
    return (data.value || []).some((user) => {
      const email = (user.Email || user.UserPrincipalName || "").toLowerCase();
      const login = (user.LoginName || "").toLowerCase();
      return email === authenticatedEmail || login.includes(authenticatedEmail);
    });
  } catch (e) {
    logWarn("api:job-apply", "Admin override check failed", { errorMessage: errorMessage(e, 200) });
    return false;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  const auth = validateApiKey(req.headers);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body as unknown as JobApplyBody;
  const {
    jobListingId,
    jobTitle,
    applicantName,
    applicantEmail,
    applicantPhone,
    currentPosition,
    currentDepartment,
    coverLetter,
    files,
    customAnswers,
    accessToken,
  } = body;

  if (!jobListingId || !jobTitle || !applicantName || !applicantEmail || !applicantPhone) {
    return res.status(400).json({
      error: "Missing required fields: jobListingId, jobTitle, applicantName, applicantEmail, applicantPhone",
    });
  }
  if (!/^\d+$/.test(jobListingId)) {
    return res.status(400).json({ error: "Invalid jobListingId" });
  }
  if (body.pdpaConsent !== true) {
    return res.status(400).json({ error: "PDPA consent is required before submitting an application." });
  }
  if (!accessToken) {
    return res.status(401).json({
      error: "Please sign in again before submitting. A delegated SharePoint token is required.",
    });
  }
  const delegatedToken = accessToken;

  try {
    const currentUser = await getSharePointCurrentUser(delegatedToken);
    const authenticatedEmail = resolveSharePointUserEmail(currentUser);
    if (!authenticatedEmail) {
      return res.status(401).json({ error: "Could not identify the signed-in SharePoint user." });
    }

    await ensureJobApplicationColumnsViaSPRest(delegatedToken);
    await ensureDocLibraryViaSPRest(delegatedToken, DOC_LIB_NAME);

    // ── Resolve real column internal names from SharePoint schema ────────
    const colMap = await resolveColumns(delegatedToken, APPLICATION_LIST);

    logInfo("api:job-apply", "Discovered SharePoint columns", {
      columnCount: colMap.raw.length,
      columns: colMap.raw.map((c) => `"${c.displayName}" -> "${c.name}"`).join(", "),
    });

    // Map each logical field to its real internal name
    // findColumn() tries display name first, then internal name, then aliases
    const COL = {
      title:             "Title", // always "Title" in SP
      jobListingId:      findColumn(colMap, "Job Listing ID", "JobListingID", "Job_x0020_Listing_x0020_ID"),
      applicantName:     findColumn(colMap, "Applicant Name", "ApplicantName", "Applicant_x0020_Name"),
      applicantEmail:    findColumn(colMap, "Applicant Email", "ApplicantEmail", "Applicant_x0020_Email"),
      applicantPhone:    findColumn(colMap, "Applicant Phone", "ApplicantPhone", "Applicant_x0020_Phone"),
      status:            findColumn(colMap, "Status"),
      submissionRef:     findColumn(colMap, "Submission Ref", "SubmissionRef", "Submission_x0020_Ref"),
      submittedBy:       findColumn(colMap, "Submitted By", "SubmittedBy", "Submitted_x0020_By"),
      submittedAt:       findColumn(colMap, "Submitted At", "SubmittedAt", "Submitted_x0020_At"),
      resumeUrl:         findColumn(colMap, "Resume URL", "Resume Url", "ResumeUrl", "Resume_x0020_Url"),
      coverLetterUrl:    findColumn(colMap, "Cover Letter URL", "Cover Letter Url", "CoverLetterUrl", "Cover_x0020_Letter_x0020_Url"),
      supportingDocuments: findColumn(colMap, "Supporting Documents", "SupportingDocuments", "Supporting_x0020_Documents"),
      reasoning:         findColumn(colMap, "Reasoning"),
      customAnswers:     findColumn(colMap, "CustomAnswers", "Custom Answers"),
      currentPosition:   findColumn(colMap, "CurrentPosition", "Current Position"),
      currentDepartment: findColumn(colMap, "CurrentDepartment", "Current Department", "Current_x0020_Department"),
      pdpaConsent:       findColumn(colMap, "PDPA Consent", "PDPAConsent"),
      pdpaNoticeVersion: findColumn(colMap, "PDPA Notice Version", "PDPANoticeVersion"),
      pdpaConsentAt:     findColumn(colMap, "PDPA Consent At", "PDPAConsentAt"),
      retentionUntil:    findColumn(colMap, "Retention Until", "RetentionUntil"),
    };

    logInfo("api:job-apply", "Resolved SharePoint column mapping", {
      columnMapping: JSON.stringify(COL),
    });

    // Validate required columns exist
    const missingRequired = (["applicantName", "applicantEmail", "applicantPhone"] as const)
      .filter((k) => !COL[k]);
    if (missingRequired.length > 0) {
      throw new Error(
        `Required columns not found on "Job Applications" list: ${missingRequired.join(", ")}. ` +
        `Check column names in SharePoint.`,
      );
    }

    // ── Duplicate check ──────────────────────────────────────────────────
    // ApplicantEmail is not indexed — must send Prefer header to allow filter.
    if (COL.applicantEmail && COL.jobListingId) {
      const duplicate = await hasDuplicateApplication(
        delegatedToken,
        colMap,
        { jobListingId: COL.jobListingId, applicantEmail: COL.applicantEmail, submittedBy: COL.submittedBy },
        jobListingId,
        applicantEmail,
        authenticatedEmail,
      );
      if (duplicate) {
        const isForceBypass = body.forceApply === true
          ? await isHrFormsOwner(delegatedToken, authenticatedEmail)
          : false;
        if (!isForceBypass) {
          return res.status(409).json({
            error: "You have already applied for this position. Multiple applications are not allowed.",
          });
        }
        logInfo("api:job-apply", "Admin duplicate override accepted", { authenticatedEmail, jobListingId });
      } else if (body.forceApply === true) {
        const isAdmin = await isHrFormsOwner(delegatedToken, authenticatedEmail);
        if (!isAdmin) return res.status(403).json({ error: "Only HR Forms Owners can submit a duplicate test application." });
      }
    }

    const submissionRef = body.submissionRef || generateSubmissionRef();
    const submittedAt = new Date().toISOString();
    const pdpaConsentedAt = typeof body.pdpaConsentedAt === "string" && !Number.isNaN(Date.parse(body.pdpaConsentedAt))
      ? body.pdpaConsentedAt
      : submittedAt;
    const retentionUntil = typeof body.retentionUntil === "string" && !Number.isNaN(Date.parse(body.retentionUntil))
      ? body.retentionUntil
      : getRetentionUntil(new Date(submittedAt));

    // ── File uploads ─────────────────────────────────────────────────────
    let resumeUrl = "";
    const supportingDocuments: Array<{ name: string; url: string }> = [];

    async function uploadDoc(name: string, content: string): Promise<string | null> {
      try {
        const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const uniqueName = `${submissionRef}_${safeName}`;
        const binary = decodeBase64(content);
        if (binary.length > 10 * 1024 * 1024) {
          logWarn("api:job-apply", "Skipping oversized application file", {
            fileName: name,
            rawSize: binary.length,
          });
          return null;
        }
        return await uploadFileViaSPRest(delegatedToken, DOC_LIB_NAME, uniqueName, binary);
      } catch (e) {
        logError("api:job-apply", "Application file upload failed", e, { fileName: name });
        return null;
      }
    }

    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.name || !file.content) continue;
        const role = inferFileRole(file, i);
        const url = await uploadDoc(file.name, file.content);
        if (!url) continue;
        if (role === "resume" && !resumeUrl) {
          resumeUrl = url;
        } else if (role === "supporting") {
          supportingDocuments.push({ name: file.name, url });
        }
      }
    }

    // ── Step 1: Create item with core fields ─────────────────────────────
    // Only include columns we've confirmed exist. Lookup columns use
    // <InternalName>LookupId as the key with a numeric value.

    const coreFields: Record<string, unknown> = {
      Title: `${jobTitle} - ${applicantName}`,
    };

    if (COL.jobListingId) {
      const jobListingField = colMap.fieldTypes[COL.jobListingId] === 7 ? `${COL.jobListingId}Id` : COL.jobListingId;
      coreFields[jobListingField] = Number(jobListingId);
    }
    if (COL.applicantName)  coreFields[COL.applicantName]  = applicantName;
    if (COL.applicantEmail) coreFields[COL.applicantEmail] = applicantEmail;
    if (COL.applicantPhone) coreFields[COL.applicantPhone] = applicantPhone;
    if (COL.status)         coreFields[COL.status]         = "New";
    if (COL.submissionRef)  coreFields[COL.submissionRef]  = submissionRef;
    if (COL.submittedBy)    coreFields[COL.submittedBy]    = authenticatedEmail;
    if (COL.submittedAt)    coreFields[COL.submittedAt]    = submittedAt;
    if (COL.pdpaConsent) coreFields[COL.pdpaConsent] = "Accepted";
    if (COL.pdpaNoticeVersion) coreFields[COL.pdpaNoticeVersion] = body.pdpaNoticeVersion || PDPA_NOTICE_VERSION;
    if (COL.pdpaConsentAt) coreFields[COL.pdpaConsentAt] = pdpaConsentedAt;
    if (COL.retentionUntil) coreFields[COL.retentionUntil] = retentionUntil;

    const created = await createListItemViaSPRest(delegatedToken, APPLICATION_LIST, coreFields);
    const itemId = created.id;
    logInfo("api:job-apply", "Created job application item", { itemId, submissionRef });

    // ── Step 2: Patch optional fields individually ────────────────────────

    async function patchField(
      internalName: string | null,
      value: unknown,
      label: string,
    ): Promise<void> {
      if (!internalName || value === "" || value == null) return;
      try {
        await updateListItemViaSPRest(delegatedToken, APPLICATION_LIST, itemId, {
          [internalName]: value,
        });
      } catch (e) {
        logWarn("api:job-apply", "Could not set optional application field", {
          label,
          internalName,
          errorMessage: errorMessage(e, 200),
        });
      }
    }

    // URL columns (Resume Url, Cover Letter Url). Hyperlink/Picture columns use
    // SP.FieldUrlValue; text-compatible URL fields use the fallback in patchUrlColumn().
    logInfo("api:job-apply", "Resolved resume URL", {
      hasResumeUrl: Boolean(resumeUrl),
      supportingDocumentCount: supportingDocuments.length,
    });
    if (COL.resumeUrl && resumeUrl) {
      await patchUrlColumn(delegatedToken, APPLICATION_LIST, itemId, COL.resumeUrl, resumeUrl, "Resume");
    }
    if (COL.coverLetterUrl && supportingDocuments[0]) {
      await patchUrlColumn(
        delegatedToken,
        APPLICATION_LIST,
        itemId,
        COL.coverLetterUrl,
        supportingDocuments[0].url,
        supportingDocuments[0].name || "Supporting Document",
      );
    }

    // Plain text / note columns
    await patchField(COL.currentPosition,   currentPosition || null,  "CurrentPosition");
    await patchField(COL.currentDepartment, currentDepartment || null, "CurrentDepartment");
    await patchField(COL.reasoning,         coverLetter?.trim() || null, "Reasoning");
    await patchField(
      COL.supportingDocuments,
      supportingDocuments.length > 0 ? JSON.stringify(supportingDocuments) : null,
      "SupportingDocuments",
    );
    await patchField(
      COL.customAnswers,
      customAnswers && Object.keys(customAnswers).length > 0
        ? JSON.stringify(customAnswers)
        : null,
      "CustomAnswers",
    );

    // ── Step 3: Increment application count on job listing ────────────────
    try {
      const jobColMap = await resolveColumns(delegatedToken, JOB_LIST);
      const countCol = findColumn(
        jobColMap,
        "Application Count",
        "ApplicationCount",
        "Application_x0020_Count",
      );
      if (countCol) {
        const liveCount = await countApplicationsForJobViaSPRest(
          delegatedToken,
          colMap,
          { jobListingId: COL.jobListingId, status: COL.status },
          jobListingId,
        );
        if (liveCount !== null) {
          await updateListItemViaSPRest(delegatedToken, JOB_LIST, jobListingId, {
            [countCol]: liveCount,
          });
        }
      }
    } catch (e) {
      logWarn("api:job-apply", "Count update failed", {
        jobListingId,
        errorMessage: errorMessage(e),
      });
    }

    // ── Step 4: Send HR notification email ────────────────────────────────
    const hrEmail =
      process.env.HR_RECRUITMENT_EMAIL || process.env.VITE_HR_RECRUITMENT_EMAIL || "";
    const fromAddress =
      process.env.EMAIL_FROM_ADDRESS || process.env.VITE_EMAIL_FROM_ADDRESS || "";

    if (!hrEmail) throw new Error("HR_RECRUITMENT_EMAIL env var not set.");
    if (!fromAddress) throw new Error("EMAIL_FROM_ADDRESS env var not set.");

    const eh = (s: string) => escapeHtml(s);

    const customHtml =
      customAnswers && Object.keys(customAnswers).length > 0
        ? `<div class="section">
            <p class="section-title">Additional Responses</p>
            <table>${Object.entries(customAnswers)
              .map(([k, v]) => `<tr><td>${eh(k)}</td><td>${eh(String(v ?? ""))}</td></tr>`)
              .join("")}</table>
           </div>`
        : "";

    const reasoningHtml = coverLetter?.trim()
      ? `<div class="section">
          <p class="section-title">Reasoning / Cover Letter</p>
          <blockquote>${eh(coverLetter).replace(/\n/g, "<br>")}</blockquote>
         </div>`
      : "";

    const submittedAtFormatted = new Date(submittedAt).toLocaleString("en-MY", {
      year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    });

    const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;font-size:13px;line-height:1.5;padding:24px}
  h2{color:#0078D4;font-size:20px;font-weight:600;margin:0 0 16px;padding-bottom:8px;border-bottom:2px solid #0078D4}
  table{border-collapse:collapse;width:100%;max-width:600px;margin-bottom:16px}
  td{padding:8px 12px;border:1px solid #d1d5db;font-size:13px;vertical-align:top}
  td:first-child{background:#f3f4f6;font-weight:600;width:30%;white-space:nowrap}
  a{color:#0078D4;text-decoration:none}
  blockquote{background:#f5f5f5;padding:12px;border-left:4px solid #0078D4;margin:0 0 12px;font-size:13px}
  .section{margin-top:16px}
  .section-title{font-weight:600;font-size:14px;color:#0078D4;margin:0 0 8px;padding-bottom:4px;border-bottom:1px solid #e5e7eb}
</style>
</head><body>
  <h2>New Job Application</h2>
  <table>
    <tr><td>Position</td><td>${eh(jobTitle)}</td></tr>
    <tr><td>Applicant</td><td>${eh(applicantName)}</td></tr>
    <tr><td>Email</td><td><a href="mailto:${eh(applicantEmail)}">${eh(applicantEmail)}</a></td></tr>
    <tr><td>Phone</td><td>${eh(applicantPhone)}</td></tr>
    <tr><td>Reference</td><td style="font-family:monospace">${eh(submissionRef)}</td></tr>
    <tr><td>Submitted</td><td>${submittedAtFormatted}</td></tr>
    ${currentPosition ? `<tr><td>Current Position</td><td>${eh(currentPosition)}</td></tr>` : ""}
    ${currentDepartment ? `<tr><td>Department</td><td>${eh(currentDepartment)}</td></tr>` : ""}
  </table>
  ${customHtml}
  ${reasoningHtml}
</body></html>`;

    const attachments: Array<Record<string, unknown>> = [];
    if (files && files.length > 0) {
      for (const file of files) {
        if (!file.name || !file.content) continue;
        let b64 = file.content;
        if (b64.startsWith("data:")) {
          const commaIdx = b64.indexOf(",");
          b64 = commaIdx >= 0 ? b64.substring(commaIdx + 1) : b64;
        }
        attachments.push({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: file.name,
          contentType: file.contentType || "application/octet-stream",
          contentBytes: b64,
        });
      }
    }

    const sendToken = await getGraphToken();
    const graphRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromAddress)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sendToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject: `Job Application: ${jobTitle} — ${applicantName} [${submissionRef}]`,
            body: { contentType: "HTML", content: htmlBody },
            toRecipients: [{ emailAddress: { address: hrEmail } }],
            attachments,
          },
          saveToSentItems: false,
        }),
      },
    );

    if (!graphRes.ok) {
      const errText = await graphRes.text();
      throw new Error(`Failed to send HR email (${graphRes.status}): ${errText}`);
    }

    return res.status(200).json({
      success: true,
      applicationId: itemId,
      submissionRef,
    });
  } catch (e) {
    logError("api:job-apply", "Failed to submit job application", e);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

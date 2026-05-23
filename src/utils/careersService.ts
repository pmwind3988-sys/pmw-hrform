import type { JobListing, JobApplyRequest, JobAdminApplication, CareerPortalCard } from "../types";

// ── Types ──────────────────────────────────────────────────────────────────────

interface JobsListResponse {
  jobs: JobListing[];
  portalCards?: CareerPortalCard[];
}

interface ApplyResponse {
  success: boolean;
  applicationId: string;
  submissionRef: string;
}

interface AdminListResponse {
  applications: JobAdminApplication[];
}

interface PortalCardsResponse {
  portalCards: CareerPortalCard[];
}

interface AdminUpdateResponse {
  success: boolean;
}

export interface ApplicationListQuery {
  email?: string;
  status?: string;
  submittedFrom?: string;
  submittedTo?: string;
  limit?: number;
}

// ── Shared API key header ──────────────────────────────────────────────────────
const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";

function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
    ...extra,
  };
}

// ── API client functions ───────────────────────────────────────────────────────

function applicationQueryString(query: ApplicationListQuery = {}): string {
  const params = new URLSearchParams();
  if (query.email) params.set("email", query.email);
  if (query.status) params.set("status", query.status);
  if (query.submittedFrom) params.set("submittedFrom", query.submittedFrom);
  if (query.submittedTo) params.set("submittedTo", query.submittedTo);
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchJobs(): Promise<JobListing[]> {
  const response = await fetch("/api/jobs-list", { headers: apiHeaders() });

  if (!response.ok) {
    throw new Error(`Failed to fetch jobs: ${response.status} ${response.statusText}`);
  }

  const data: JobsListResponse = (await response.json()) as JobsListResponse;
  return data.jobs;
}

export async function fetchCareersPortalData(): Promise<{ jobs: JobListing[]; portalCards: CareerPortalCard[] }> {
  const response = await fetch("/api/jobs-list", { headers: apiHeaders() });

  if (!response.ok) {
    throw new Error(`Failed to fetch jobs: ${response.status} ${response.statusText}`);
  }

  const data: JobsListResponse = (await response.json()) as JobsListResponse;
  return { jobs: data.jobs, portalCards: data.portalCards ?? [] };
}

export async function submitApplication(
  data: JobApplyRequest,
): Promise<ApplyResponse> {
  const response = await fetch("/api/job-apply", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    let errMsg = `Failed to submit application: ${response.status} ${response.statusText}`;
    try {
      const errBody = (await response.json()) as { error?: string };
      if (errBody.error) errMsg = errBody.error;
    } catch {
      // ignore parse error
    }
    throw new Error(errMsg);
  }

  return (await response.json()) as ApplyResponse;
}

export async function fetchMyApplications(
  email: string,
  query: Omit<ApplicationListQuery, "email"> = {},
): Promise<JobAdminApplication[]> {
  const response = await fetch(
    `/api/job-admin${applicationQueryString({ ...query, email })}`,
    { headers: apiHeaders() },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch applications: ${response.status} ${response.statusText}`);
  }

  const data: AdminListResponse = (await response.json()) as AdminListResponse;
  return data.applications;
}

export async function fetchApplications(query: ApplicationListQuery = {}): Promise<JobAdminApplication[]> {
  const response = await fetch(`/api/job-admin${applicationQueryString(query)}`, { headers: apiHeaders() });

  if (!response.ok) {
    throw new Error(`Failed to fetch applications: ${response.status} ${response.statusText}`);
  }

  const data: AdminListResponse = (await response.json()) as AdminListResponse;
  return data.applications;
}

export async function updateApplicationStatus(
  applicationId: string,
  status: string,
): Promise<boolean> {
  const response = await fetch("/api/job-admin", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      action: "update-status",
      applicationId,
      status,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update application status: ${response.status} ${response.statusText}`);
  }

  const data: AdminUpdateResponse = (await response.json()) as AdminUpdateResponse;
  return data.success;
}

export async function deleteApplications(
  ids: string[],
): Promise<{ deleted: number; deletedFiles?: number; errors?: string[]; fileWarnings?: string[] }> {
  const response = await fetch("/api/job-admin", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ action: "delete-applications", ids }),
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try { const body = await response.json() as { error?: string }; if (body.error) detail += `: ${body.error}`; } catch { /* ignore */ }
    throw new Error(`Failed to delete applications: ${detail}`);
  }
  return (await response.json()) as {
    deleted: number;
    deletedFiles?: number;
    errors?: string[];
    fileWarnings?: string[];
  };
}

export async function fetchColumnChoices(
  listName: string,
  columnName: string,
): Promise<string[]> {
  const response = await fetch("/api/job-admin", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ action: "get-column-choices", listName, columnName }),
  });
  if (!response.ok) return [];
  const res = await response.json() as { choices?: string[] };
  return res.choices ?? [];
}

export async function deleteJobListing(
  jobId: string,
): Promise<{ success: boolean }> {
  const response = await fetch("/api/job-admin", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ action: "delete-job", jobId }),
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try { const body = await response.json() as { error?: string }; if (body.error) detail += `: ${body.error}`; } catch { /* ignore */ }
    throw new Error(`Failed to delete job listing: ${detail}`);
  }

  return (await response.json()) as { success: boolean };
}

// ── Admin: Job listing CRUD ──────────────────────────────────────────────────

export async function fetchAdminJobs(): Promise<JobListing[]> {
  const response = await fetch("/api/job-admin", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ action: "list-jobs" }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch admin jobs: ${response.status} ${response.statusText}`);
  }

  const data: JobsListResponse = (await response.json()) as JobsListResponse;
  return data.jobs;
}

export async function createJobListing(
  data: Record<string, unknown>,
): Promise<{ success: boolean; jobId: string }> {
  const response = await fetch("/api/job-admin", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ action: "create-job", ...data }),
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try { const body = await response.json() as { error?: string }; if (body.error) detail += `: ${body.error}`; } catch { /* ignore */ }
    throw new Error(`Failed to create job listing: ${detail}`);
  }

  return (await response.json()) as { success: boolean; jobId: string };
}

export async function updateJobListing(
  jobId: string,
  data: Record<string, unknown>,
): Promise<{ success: boolean; warning?: string }> {
  const response = await fetch("/api/job-admin", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ action: "update-job", jobId, ...data }),
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try { const body = await response.json() as { error?: string }; if (body.error) detail += `: ${body.error}`; } catch { /* ignore */ }
    throw new Error(`Failed to update job listing: ${detail}`);
  }

  const result = (await response.json()) as { success: boolean; warning?: string };
  return result;
}

export async function fetchCareerPortalCards(): Promise<CareerPortalCard[]> {
  const response = await fetch("/api/job-admin", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ action: "list-portal-cards" }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch portal cards: ${response.status} ${response.statusText}`);
  }

  const data: PortalCardsResponse = (await response.json()) as PortalCardsResponse;
  return data.portalCards;
}

export async function createCareerPortalCard(
  data: Omit<CareerPortalCard, "id" | "created">,
): Promise<{ success: boolean; cardId: string }> {
  const response = await fetch("/api/job-admin", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ action: "create-portal-card", ...data }),
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try { const body = await response.json() as { error?: string }; if (body.error) detail += `: ${body.error}`; } catch { /* ignore */ }
    throw new Error(`Failed to create portal card: ${detail}`);
  }

  return (await response.json()) as { success: boolean; cardId: string };
}

export async function updateCareerPortalCard(
  cardId: string,
  data: Partial<Omit<CareerPortalCard, "id" | "created">>,
): Promise<{ success: boolean }> {
  const response = await fetch("/api/job-admin", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ action: "update-portal-card", cardId, ...data }),
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try { const body = await response.json() as { error?: string }; if (body.error) detail += `: ${body.error}`; } catch { /* ignore */ }
    throw new Error(`Failed to update portal card: ${detail}`);
  }

  return (await response.json()) as { success: boolean };
}

export async function deleteCareerPortalCard(cardId: string): Promise<{ success: boolean }> {
  const response = await fetch("/api/job-admin", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ action: "delete-portal-card", cardId }),
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try { const body = await response.json() as { error?: string }; if (body.error) detail += `: ${body.error}`; } catch { /* ignore */ }
    throw new Error(`Failed to delete portal card: ${detail}`);
  }

  return (await response.json()) as { success: boolean };
}

// ── Client-side column provisioning (blocking — throws on failure) ─────────

interface ColumnDef {
  name: string;
  /** SP FieldTypeKind values this column can accept */
  acceptKinds: number[];
  /** Preferred kind to create (first in acceptKinds) */
  kind: number;
  /** Extra SP Field metadata */
  extra?: Record<string, unknown>;
}

/** SP FieldTypeKind: 2=Text 3=Note 4=DateTime 7=Lookup 8=Boolean 9=Number 11=Hyperlink */
const REQUIRED_COLUMNS: ColumnDef[] = [
  // internalName         displayName         acceptKinds   createKind  extra
  { name: "ApplicantName", acceptKinds: [2], kind: 2 },
  { name: "ApplicantEmail", acceptKinds: [2], kind: 2 },
  { name: "ApplicantPhone", acceptKinds: [2], kind: 2 },
  { name: "JobListingID",  acceptKinds: [9, 7], kind: 9 },
  { name: "Status", acceptKinds: [2, 6], kind: 2 },
  { name: "SubmissionRef", acceptKinds: [2], kind: 2 },
  { name: "SubmittedBy", acceptKinds: [2], kind: 2 },
  { name: "SubmittedAt", acceptKinds: [4, 2], kind: 4 },
  { name: "ResumeUrl",     acceptKinds: [11, 2], kind: 11, extra: { DisplayFormat: 0 } },
  { name: "CoverLetterUrl", acceptKinds: [11, 2], kind: 11, extra: { DisplayFormat: 0 } },
  { name: "SupportingDocuments", acceptKinds: [3], kind: 3, extra: { NumberOfLines: 6 } },
  { name: "Reasoning",     acceptKinds: [3], kind: 3, extra: { NumberOfLines: 6 } },
  { name: "CustomAnswers", acceptKinds: [3], kind: 3, extra: { NumberOfLines: 6 } },
  { name: "CurrentPosition",  acceptKinds: [2], kind: 2 },
  { name: "CurrentDepartment", acceptKinds: [2], kind: 2 },
  { name: "PDPAConsent", acceptKinds: [2], kind: 2 },
  { name: "PDPANoticeVersion", acceptKinds: [2], kind: 2 },
  { name: "PDPAConsentAt", acceptKinds: [4, 2], kind: 4 },
  { name: "RetentionUntil", acceptKinds: [4, 2], kind: 4 },
];

/**
 * Ensures all required columns exist on "Job Applications" with compatible types.
 * Uses SP REST with the user's token. THROWS on any failure.
 * Call this BEFORE submitApplication() — if it throws, don't submit.
 */
export async function ensureJobApplicationColumns(
  spRestToken: string,
  spSiteUrl: string,
): Promise<void> {
  const site = spSiteUrl.replace(/\/$/, "");
  const encList = encodeURIComponent("Job Applications");

  // 1. Get request digest
  const dr = await fetch(`${site}/_api/contextinfo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${spRestToken}`, Accept: "application/json;odata=nometadata" },
  });
  if (!dr.ok) throw new Error(`Failed to get SharePoint digest (${dr.status}) — check AllSites.Manage permission`);
  const dd = (await dr.json()) as { FormDigestValue?: string };
  const digest = dd.FormDigestValue;
  if (!digest) throw new Error("No FormDigestValue from SharePoint");

  // 2. Fetch existing columns with their types (keyed by InternalName)
  const fr = await fetch(`${site}/_api/web/lists/getbytitle('${encList}')/fields?$select=Title,FieldTypeKind,InternalName`, {
    headers: { Authorization: `Bearer ${spRestToken}`, Accept: "application/json;odata=nometadata" },
  });
  if (!fr.ok) throw new Error(`Failed to fetch list columns (${fr.status})`);
  const fd = (await fr.json()) as { value?: Array<{ Title: string; FieldTypeKind: number; InternalName: string }> };
  const existing = new Map((fd.value || []).map((f) => [f.InternalName, { typeKind: f.FieldTypeKind, title: f.Title }]));

  // 3. Display name mapping (InternalName → display name for SP REST creation)
  const displayNames: Record<string, string> = {
    ApplicantName: "Applicant Name",
    ApplicantEmail: "Applicant Email",
    ApplicantPhone: "Applicant Phone",
    JobListingID: "Job Listing ID",
    Status: "Status",
    SubmissionRef: "Submission Ref",
    SubmittedBy: "Submitted By",
    SubmittedAt: "Submitted At",
    ResumeUrl: "Resume URL",
    CoverLetterUrl: "Cover Letter URL",
    SupportingDocuments: "Supporting Documents",
    Reasoning: "Reasoning",
    CustomAnswers: "Custom Answers",
    CurrentPosition: "Current Position",
    CurrentDepartment: "Current Department",
    PDPAConsent: "PDPA Consent",
    PDPANoticeVersion: "PDPA Notice Version",
    PDPAConsentAt: "PDPA Consent At",
    RetentionUntil: "Retention Until",
  };

  // 4. Type mapping for creation
  const typeMap: Record<number, string> = {
    2: "SP.Field", 3: "SP.FieldMultiLineText", 4: "SP.FieldDateTime",
    7: "SP.FieldLookup", 8: "SP.Field", 9: "SP.FieldNumber", 11: "SP.FieldUrl",
  };

  // 5. Check & create
  for (const col of REQUIRED_COLUMNS) {
    const existingCol = existing.get(col.name);

    if (existingCol !== undefined) {
      // Column exists (matched by InternalName) — check type compatibility
      if (!col.acceptKinds.includes(existingCol.typeKind)) {
        throw new Error(
          `Column "${col.name}" (display: "${existingCol.title}") exists with incompatible type ` +
          `(kind ${existingCol.typeKind}). Delete it from SharePoint list settings, then retry.`
        );
      }
      continue; // Already exists with OK type
    }

    // Create missing column
    const body: Record<string, unknown> = {
      __metadata: { type: typeMap[col.kind] ?? "SP.Field" },
      FieldTypeKind: col.kind,
      Title: displayNames[col.name] ?? col.name,
      StaticName: col.name,
    };
    if (col.extra) Object.assign(body, col.extra);

    const r = await fetch(`${site}/_api/web/lists/getbytitle('${encList}')/fields`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${spRestToken}`,
        Accept: "application/json;odata=nometadata",
        "Content-Type": "application/json;odata=verbose",
        "X-RequestDigest": digest,
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const text = await r.text();
      // "Already exists" is OK — race condition with another tab
      if (text.toLowerCase().includes("duplicate") || text.toLowerCase().includes("already exists")) continue;
      throw new Error(`Failed to create column "${col.name}": ${r.status} ${text.slice(0, 200)}`);
    }
  }
}



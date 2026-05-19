import type { JobListing, JobApplyRequest, JobAdminApplication } from "../types";

// ── Types ──────────────────────────────────────────────────────────────────────

interface JobsListResponse {
  jobs: JobListing[];
}

interface ApplyResponse {
  success: boolean;
  applicationId: string;
  submissionRef: string;
}

interface AdminListResponse {
  applications: JobAdminApplication[];
}

interface AdminUpdateResponse {
  success: boolean;
}

// ── API client functions ───────────────────────────────────────────────────────

export async function fetchJobs(): Promise<JobListing[]> {
  const response = await fetch("/api/jobs-list");

  if (!response.ok) {
    throw new Error(`Failed to fetch jobs: ${response.status} ${response.statusText}`);
  }

  const data: JobsListResponse = (await response.json()) as JobsListResponse;
  return data.jobs;
}

export async function submitApplication(
  data: JobApplyRequest,
): Promise<ApplyResponse> {
  const response = await fetch("/api/job-apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

export async function fetchMyApplications(email: string): Promise<JobAdminApplication[]> {
  const response = await fetch(`/api/job-admin?email=${encodeURIComponent(email)}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch applications: ${response.status} ${response.statusText}`);
  }

  const data: AdminListResponse = (await response.json()) as AdminListResponse;
  return data.applications;
}

export async function fetchApplications(): Promise<JobAdminApplication[]> {
  const response = await fetch("/api/job-admin");

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
    headers: { "Content-Type": "application/json" },
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
): Promise<{ deleted: number; errors?: string[] }> {
  const response = await fetch("/api/job-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete-applications", ids }),
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try { const body = await response.json() as { error?: string }; if (body.error) detail += `: ${body.error}`; } catch { /* ignore */ }
    throw new Error(`Failed to delete applications: ${detail}`);
  }
  return (await response.json()) as { deleted: number; errors?: string[] };
}

export async function fetchColumnChoices(
  listName: string,
  columnName: string,
): Promise<string[]> {
  const response = await fetch("/api/job-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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

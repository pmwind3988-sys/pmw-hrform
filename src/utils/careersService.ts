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
    throw new Error(`Failed to submit application: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as ApplyResponse;
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
    throw new Error(`Failed to create job listing: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as { success: boolean; jobId: string };
}

export async function updateJobListing(
  jobId: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const response = await fetch("/api/job-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "update-job", jobId, ...data }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update job listing: ${response.status} ${response.statusText}`);
  }

  const result: AdminUpdateResponse = (await response.json()) as AdminUpdateResponse;
  return result.success;
}

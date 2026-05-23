import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import {
  getGraphToken,
  queryListItems,
  queryListItemById,
  createListItem,
  updateListItemFields,
  deleteListItem,
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
const DEFAULT_APPLICATION_LIMIT = 500;
const MAX_APPLICATION_LIMIT = 999;

interface JobDocumentLink {
  name: string;
  url: string;
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

function getApplicationJobId(fields: Record<string, unknown>): string {
  return String(fields.JobListingIDLookupId || fields.JobListingID || "");
}

function isDeletedApplication(fields: Record<string, unknown>): boolean {
  return String(fields.Status || "").toLowerCase() === "deleted";
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function parseDateParam(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function getSubmittedTime(fields: Record<string, unknown>): number {
  return new Date(String(fields.SubmittedAt || fields.Created || "")).getTime();
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

async function getApplicationCountsByJob(token: string): Promise<Record<string, number>> {
  const allApps = await queryListItems(token, APPLICATION_LIST, { top: 999 });
  const appCountByJob: Record<string, number> = {};
  for (const app of allApps) {
    if (isDeletedApplication(app.fields)) continue;
    const jobId = getApplicationJobId(app.fields);
    if (jobId) appCountByJob[jobId] = (appCountByJob[jobId] || 0) + 1;
  }
  return appCountByJob;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers as Record<string, string | string[] | undefined>);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });

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
      const graphFilters: string[] = [];

      if (emailFilter) {
        const safeEmail = escapeODataString(emailFilter);
        graphFilters.push(`(fields/ApplicantEmail eq '${safeEmail}' or fields/SubmittedBy eq '${safeEmail}')`);
      }
      if (statusFilter) {
        graphFilters.push(`fields/Status eq '${escapeODataString(statusFilter)}'`);
      }
      if (submittedFrom) {
        graphFilters.push(`fields/SubmittedAt ge '${submittedFrom}'`);
      }
      if (submittedTo) {
        graphFilters.push(`fields/SubmittedAt le '${submittedTo}'`);
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

      const lowerEmail = emailFilter.toLowerCase();
      const fromTime = submittedFrom ? new Date(submittedFrom).getTime() : null;
      const toTime = submittedTo ? new Date(submittedTo).getTime() : null;
      items = items
        .filter((item) => {
          if (isDeletedApplication(item.fields)) return false;
          if (lowerEmail) {
            const applicantEmail = String(item.fields.ApplicantEmail || "").toLowerCase();
            const submittedBy = String(item.fields.SubmittedBy || "").toLowerCase();
            if (applicantEmail !== lowerEmail && submittedBy !== lowerEmail) return false;
          }
          if (statusFilter && String(item.fields.Status || "") !== statusFilter) return false;
          const submittedTime = getSubmittedTime(item.fields);
          if (fromTime !== null && (!Number.isFinite(submittedTime) || submittedTime < fromTime)) return false;
          if (toTime !== null && (!Number.isFinite(submittedTime) || submittedTime > toTime)) return false;
          return true;
        })
        .sort((a, b) => getSubmittedTime(b.fields) - getSubmittedTime(a.fields));

      const applications = items.map((item) => {
        let customAnswers: Record<string, unknown> | undefined;
        const raw = item.fields.CustomAnswers;
        if (raw && typeof raw === "string") {
          try { customAnswers = JSON.parse(raw) as Record<string, unknown>; } catch { /* ignore */ }
        }

        const resumeUrl = fieldUrl(item.fields.ResumeUrl);
        const coverLetterUrl = fieldUrl(item.fields.CoverLetterUrl);
        const supportingDocuments = parseSupportingDocuments(item.fields.SupportingDocuments, coverLetterUrl);

        return {
          id: String(item.id || ""),
          jobTitle: String(item.fields.Title || "").split(" - ")[0] || String(item.fields.Title || ""),
          applicantName: String(item.fields.ApplicantName || ""),
          applicantEmail: String(item.fields.ApplicantEmail || ""),
          status: String(item.fields.Status || ""),
          submittedAt: String(item.fields.Created || item.fields.SubmittedAt || ""),
          submissionRef: String(item.fields.SubmissionRef || ""),
          applicantPhone: String(item.fields.ApplicantPhone || ""),
          coverLetterUrl: supportingDocuments[0]?.url || coverLetterUrl,
          resumeUrl,
          supportingDocuments,
          customAnswers,
          jobListingId: getApplicationJobId(item.fields),
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
          for (const jobId of affectedJobIds) {
            if (!/^\d+$/.test(String(jobId))) continue;
            await updateListItemFields(token, JOB_LIST, jobId, {
              Application_x0020_Count: liveCounts[jobId] ?? 0,
            });
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
        const fields: Record<string, unknown> = {
          Title: title,
          Job_x0020_Description: rawBody.jobDescription || "",
          Department: rawBody.department || "",
          Location: rawBody.location || "",
          Employment_x0020_Type: rawBody.employmentType || "",
          Closing_x0020_Date: rawBody.closingDate || null,
          Status: "New",
          Application_x0020_Count: 0,
        };

        // Only include CustomFields if there's data AND the column exists
        if (hasCustomFields) {
          fields.CustomFields = JSON.stringify(customFields);
        }

        try {
          const result = await createListItem(token, JOB_LIST, fields);
          return res.status(200).json({ success: true, jobId: result.id });
        } catch (err) {
          const msg = (err as Error).message;
          // If CustomFields column doesn't exist on the list, retry without it
          if (hasCustomFields && msg.includes("CustomFields") && msg.includes("not recognized")) {
            delete fields.CustomFields;
            const result = await createListItem(token, JOB_LIST, fields);
            return res.status(200).json({ success: true, jobId: result.id, warning: "CustomFields column not available" });
          }
          throw err; // Re-throw for the outer catch
        }
      }

      // List all job listings (admin view)
      if (action === "list-jobs") {
        const items = await queryListItems(token, JOB_LIST, { top: 999 });

        const jobs = items.map((item) => {
          const itemId = String(item.id || "");
          let customFields: Record<string, unknown>[] | undefined;
          const raw = item.fields.CustomFields;
          if (raw && typeof raw === "string") {
            try { customFields = JSON.parse(raw) as Record<string, unknown>[]; } catch { /* ignore */ }
          }
          return {
            id: itemId,
            title: String(item.fields.Title || ""),
            jobDescription: String(item.fields.Job_x0020_Description || ""),
            department: String(item.fields.Department || ""),
            location: String(item.fields.Location || ""),
            employmentType: String(item.fields.Employment_x0020_Type || ""),
            closingDate: item.fields.Closing_x0020_Date ? String(item.fields.Closing_x0020_Date).split("T")[0] : null,
            status: String(item.fields.Status || "New"),
            applicationCount: numberField(item.fields.Application_x0020_Count),
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

        const updateFields: Record<string, unknown> = {};
        if (rawBody.title !== undefined) updateFields.Title = rawBody.title;
        if (rawBody.jobDescription !== undefined) updateFields.Job_x0020_Description = rawBody.jobDescription;
        if (rawBody.department !== undefined) updateFields.Department = rawBody.department;
        if (rawBody.location !== undefined) updateFields.Location = rawBody.location;
        if (rawBody.employmentType !== undefined) updateFields.Employment_x0020_Type = rawBody.employmentType;
        if (rawBody.closingDate !== undefined) updateFields.Closing_x0020_Date = rawBody.closingDate;
        if (rawBody.status !== undefined) updateFields.Status = rawBody.status;
        if (rawBody.customFields !== undefined) {
          updateFields.CustomFields = JSON.stringify(rawBody.customFields);
        }

        const hasCustomFields = "CustomFields" in updateFields;
        let warning: string | undefined;
        try {
          await updateListItemFields(token, JOB_LIST, jobId, updateFields);
        } catch (err) {
          const msg = (err as Error).message;
          if (hasCustomFields && msg.includes("CustomFields") && msg.includes("not recognized")) {
            delete updateFields.CustomFields;
            await updateListItemFields(token, JOB_LIST, jobId, updateFields);
            warning = "CustomFields column not available";
          } else {
            throw err;
          }
        }
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

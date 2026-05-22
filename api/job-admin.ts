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
} from "./_utils/graphClient.js";
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

      let items = await queryListItems(token, APPLICATION_LIST, { top: 999 });

      // Filter by applicant email if provided
      if (emailFilter) {
        const lower = emailFilter.toLowerCase();
        items = items.filter((item) => String(item.fields.ApplicantEmail || "").toLowerCase() === lower);
      }

      const applications = items.map((item) => {
        let customAnswers: Record<string, unknown> | undefined;
        const raw = item.fields.CustomAnswers;
        if (raw && typeof raw === "string") {
          try { customAnswers = JSON.parse(raw) as Record<string, unknown>; } catch { /* ignore */ }
        }

        return {
          id: String(item.id || ""),
          jobTitle: String(item.fields.Title || "").split(" - ")[0] || String(item.fields.Title || ""),
          applicantName: String(item.fields.ApplicantName || ""),
          applicantEmail: String(item.fields.ApplicantEmail || ""),
          status: String(item.fields.Status || ""),
          submittedAt: String(item.fields.SubmittedAt || ""),
          submissionRef: String(item.fields.SubmissionRef || ""),
          applicantPhone: String(item.fields.ApplicantPhone || ""),
          coverLetterUrl: String(item.fields.CoverLetterUrl || ""),
          resumeUrl: String(item.fields.ResumeUrl || ""),
          customAnswers,
          jobListingId: String(item.fields.JobListingID || ""),
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
        let docLibFiles: Array<{ id: string; name: string }> = [];
        try {
          docLibFiles = await listDocLibraryFiles(token, DOC_LIB);
        } catch { /* best-effort — file deletion won't happen but application deletion proceeds */ }

        // Fetch applications to get JobListingID + SubmissionRef before deleting
        const decrementMap: Record<string, number> = {};
        const fileWarnings: string[] = [];
        for (const id of ids) {
          if (!/^\d+$/.test(String(id))) continue;
          try {
            const appResult = await queryListItemById(token, APPLICATION_LIST, String(id));
            if (appResult) {
              const jobId = String(appResult.fields.JobListingID || "");
              if (jobId) {
                decrementMap[jobId] = (decrementMap[jobId] || 0) + 1;
              }
              // Delete associated files from the Job Applications Files doc library
              const submissionRef = String(appResult.fields.SubmissionRef || "");
              if (submissionRef && docLibFiles.length > 0) {
                const matching = docLibFiles.filter((f) => f.name.startsWith(submissionRef));
                for (const file of matching) {
                  try {
                    await deleteListItem(token, DOC_LIB, file.id);
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

        // Decrement Application_x0020_Count on affected job listings
        for (const [jobId, count] of Object.entries(decrementMap)) {
          if (count > 0) {
            if (!/^\d+$/.test(String(jobId))) continue;
            try {
              const jobItem = await queryListItemById(token, JOB_LIST, jobId);
              if (jobItem) {
                const currentCount = Number(jobItem.fields.Application_x0020_Count) || 0;
                await updateListItemFields(token, JOB_LIST, jobId, {
                  Application_x0020_Count: Math.max(0, currentCount - count),
                });
              }
            } catch { /* best-effort */ }
          }
        }

        return res.status(200).json({
          success: true,
          deleted,
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

        // Compute live application counts from actual submissions (excluding deleted ones)
        let appCountByJob: Record<string, number> = {};
        try {
          const allApps = await queryListItems(token, APPLICATION_LIST, { top: 999 });
          appCountByJob = {};
          for (const app of allApps) {
            const jobId = String(app.fields.JobListingID || "");
            if (jobId) appCountByJob[jobId] = (appCountByJob[jobId] || 0) + 1;
          }
        } catch (e) {
          logWarn("api:job-admin", "Failed to fetch live application counts", {
            errorMessage: e instanceof Error ? e.message : String(e),
          });
        }

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
            applicationCount: appCountByJob[itemId] ?? 0,
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

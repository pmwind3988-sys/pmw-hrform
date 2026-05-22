import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import {
  getGraphToken,
  queryListItems,
  queryListItemById,
  createListItem,
  updateListItemFields,
  updateListItem,
  uploadFileToDrive,
  createDocLibrary,
  listExistsGraph,
  getListColumns,
} from "./_utils/graphClient.js";


/**
 * Query list items allowing filters on non-indexed columns.
 * Requires graphClient.queryListItems to support preferNonIndexed option — see graphClient-patch.md.
 */
async function queryListItemsNonIndexed(
  token: string,
  listName: string,
  filter: string,
): Promise<Array<{ id: string; fields: Record<string, unknown> }>> {
  return queryListItems(token, listName, { filter, top: 1, preferNonIndexed: true });
}

const SP_SITE_URL = (process.env.VITE_SP_SITE_URL || process.env.SP_SITE_URL || "").replace(/\/$/, "");

/**
 * Write a hyperlink value to a SharePoint "Hyperlink or Picture" column using
 * the SharePoint REST v1 API (_api/web/lists/...) with a FormDigest.
 *
 * Graph API app-only tokens CANNOT write to hyperlink columns — this is a
 * Microsoft restriction. The SharePoint REST v1 API accepts the same Bearer
 * token but uses a different wire format that SharePoint processes correctly.
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

  const encodedList = encodeURIComponent(`'${listName}'`);
  const endpoint = `${SP_SITE_URL}/_api/web/lists/getbytitle(${encodedList})/items(${numericItemId})`;

  const body = JSON.stringify({
    __metadata: { type: "SP.Data.Job_x0020_ApplicationsListItem" },
    [fieldName]: {
      __metadata: { type: "SP.FieldUrlValue" },
      Url: url,
      Description: description || url,
    },
  });

  // SP REST MERGE requires X-HTTP-Method: MERGE + X-RequestDigest
  // For app-only tokens, X-RequestDigest can be any non-empty string when
  // using Bearer auth — SP validates the Bearer token, not the digest.
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=verbose",
      "Content-Type": "application/json;odata=verbose",
      "X-HTTP-Method": "MERGE",
      "IF-MATCH": "*",
      "X-RequestDigest": "app-only-bypass",
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
 * Tries SP REST v1 first (works for Hyperlink columns with app-only tokens),
 * then falls back to Graph API formats.
 */
async function patchUrlColumn(
  sysToken: string,
  listName: string,
  itemId: string,
  fieldName: string,
  url: string,
  userToken?: string,
): Promise<void> {
  // Attempt 1: SP REST v1 with user (delegated) token — required for "Hyperlink or Picture"
  // columns. App-only (client credentials) tokens CANNOT write to hyperlink columns.
  if (userToken) {
    try {
      await patchHyperlinkViaSPRest(userToken, listName, itemId, fieldName, url, fieldName);
      console.log(`[API job-apply] URL field "${fieldName}" saved via SP REST v1 (user token)`);
      return;
    } catch (e) {
      console.warn(`[API job-apply] SP REST v1 failed for "${fieldName}" with user token:`, (e as Error).message?.slice(0, 200));
    }
  }

  // Attempt 2: SP REST v1 with system token (likely fails for hyperlink columns, but try)
  try {
    await patchHyperlinkViaSPRest(sysToken, listName, itemId, fieldName, url, fieldName);
    console.log(`[API job-apply] URL field "${fieldName}" saved via SP REST v1 (system token)`);
    return;
  } catch (e) {
    console.warn(`[API job-apply] SP REST v1 failed for "${fieldName}" with system token:`, (e as Error).message?.slice(0, 200));
  }

  // Attempts 3-6: Graph API fallbacks (work if column is changed to Single line of text)
  const graphAttempts: Array<{ fn: () => Promise<void>; label: string }> = [
    {
      label: "Graph item PATCH + {Url,Description}",
      fn: () => updateListItem(sysToken, listName, itemId, { [fieldName]: { Url: url, Description: url } }),
    },
    {
      label: "Graph fields PATCH + {Url,Description}",
      fn: () => updateListItemFields(sysToken, listName, itemId, { [fieldName]: { Url: url, Description: url } }),
    },
    {
      label: "Graph item PATCH + plain string",
      fn: () => updateListItem(sysToken, listName, itemId, { [fieldName]: url }),
    },
    {
      label: "Graph fields PATCH + plain string",
      fn: () => updateListItemFields(sysToken, listName, itemId, { [fieldName]: url }),
    },
  ];

  for (const attempt of graphAttempts) {
    try {
      await attempt.fn();
      console.log(`[API job-apply] URL field "${fieldName}" saved — format: ${attempt.label}`);
      return;
    } catch (e) {
      console.warn(
        `[API job-apply] "${fieldName}" attempt "${attempt.label}" failed:`,
        (e as Error).message?.slice(0, 150),
      );
    }
  }

  console.error(
    `[API job-apply] COULD NOT SAVE "${fieldName}" after all attempts. ` +
    `URL was: ${url.slice(0, 100)}. ` +
    `If SP REST also failed, check that SP_SITE_URL is correct and the app has ` +
    `Sites.Selected or Sites.ReadWrite.All permission on the SharePoint site.`,
  );
}

interface UploadedFile {
  name: string;
  content: string;
  contentType: string;
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

// ── Column resolver ───────────────────────────────────────────────────────────
// Builds a map of displayName → internal name by querying the list schema.
// This is the only reliable way to handle columns regardless of how they
// were created (UI, REST, Graph, PnP, etc.).

interface ColumnMap {
  byDisplay: Record<string, string>; // "Applicant Name" → "ApplicantName"
  byInternal: Record<string, string>; // "ApplicantName" → "ApplicantName" (identity)
  raw: Array<{ name: string; displayName: string }>;
}

async function resolveColumns(token: string, listName: string): Promise<ColumnMap> {
  const cols = await getListColumns(token, listName);
  const byDisplay: Record<string, string> = {};
  const byInternal: Record<string, string> = {};
  for (const col of cols) {
    byDisplay[col.displayName] = col.name;
    byInternal[col.name] = col.name;
  }
  return { byDisplay, byInternal, raw: cols };
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

  try {
    const sysToken = await getGraphToken();

    // ── Resolve real column internal names from SharePoint schema ────────
    const colMap = await resolveColumns(sysToken, "Job Applications");

    // Log all discovered columns so you can verify in Vercel logs
    console.log(
      "[API job-apply] Discovered columns:",
      colMap.raw.map((c) => `"${c.displayName}" → "${c.name}"`).join(", "),
    );

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
      resumeUrl:         findColumn(colMap, "Resume Url", "ResumeUrl", "Resume_x0020_Url"),
      coverLetterUrl:    findColumn(colMap, "Cover Letter Url", "CoverLetterUrl", "Cover_x0020_Letter_x0020_Url"),
      reasoning:         findColumn(colMap, "Reasoning"),
      customAnswers:     findColumn(colMap, "CustomAnswers", "Custom Answers"),
      currentPosition:   findColumn(colMap, "CurrentPosition", "Current Position"),
      currentDepartment: findColumn(colMap, "CurrentDepartment", "Current Department", "Current_x0020_Department"),
    };

    console.log("[API job-apply] Column mapping:", JSON.stringify(COL, null, 2));

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
      try {
        const jobIdFilterKey = `${COL.jobListingId}LookupId`;
        const existing = await queryListItemsNonIndexed(
          sysToken,
          "Job Applications",
          `fields/${COL.applicantEmail} eq '${applicantEmail.replace(/'/g, "''")}' and fields/${jobIdFilterKey} eq ${Number(jobListingId)}`,
        );
        if (existing.length > 0) {
          const submitterEmail = body.submittedByEmail || "";
          const isForceBypass =
            body.forceApply === true &&
            auth.valid &&
            submitterEmail.toLowerCase() !== applicantEmail.toLowerCase();
          if (!isForceBypass) {
            return res.status(409).json({
              error: "You have already applied for this position. Multiple applications are not allowed.",
            });
          }
        }
      } catch (e) {
        console.warn("[API job-apply] Duplicate check failed (non-fatal):", (e as Error).message);
      }
    }

    const submissionRef = body.submissionRef || generateSubmissionRef();
    const submittedAt = new Date().toISOString();

    // ── File uploads ─────────────────────────────────────────────────────
    const docLibName = "Job Applications Files";
    let docLibReady = false;
    let resumeUrl = "";

    async function ensureDocLib(): Promise<void> {
      if (!docLibReady) {
        if (!(await listExistsGraph(sysToken, docLibName))) {
          await createDocLibrary(sysToken, docLibName);
        }
        docLibReady = true;
      }
    }

    async function uploadDoc(name: string, content: string): Promise<string | null> {
      try {
        await ensureDocLib();
        const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const uniqueName = `${submissionRef}_${safeName}`;
        const binary = decodeBase64(content);
        if (binary.length > 10 * 1024 * 1024) {
          console.warn(`[API job-apply] Skipping oversized file "${name}" (${binary.length} bytes)`);
          return null;
        }
        return await uploadFileToDrive(sysToken, docLibName, uniqueName, binary);
      } catch (e) {
        console.error("[API job-apply] Upload failed:", (e as Error).message);
        return null;
      }
    }

    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.name || !file.content) continue;
        const url = await uploadDoc(file.name, file.content);
        if (i === 0 && url) resumeUrl = url;
      }
    }

    // ── Step 1: Create item with core fields ─────────────────────────────
    // Only include columns we've confirmed exist. Lookup columns use
    // <InternalName>LookupId as the key with a numeric value.

    const coreFields: Record<string, unknown> = {
      Title: `${jobTitle} - ${applicantName}`,
    };

    if (COL.jobListingId) {
      coreFields[`${COL.jobListingId}LookupId`] = Number(jobListingId);
    }
    if (COL.applicantName)  coreFields[COL.applicantName]  = applicantName;
    if (COL.applicantEmail) coreFields[COL.applicantEmail] = applicantEmail;
    if (COL.applicantPhone) coreFields[COL.applicantPhone] = applicantPhone;
    if (COL.status)         coreFields[COL.status]         = "New";
    if (COL.submissionRef)  coreFields[COL.submissionRef]  = submissionRef;

    const created = await createListItem(sysToken, "Job Applications", coreFields);
    const itemId = created.id;
    console.log(`[API job-apply] Created item ${itemId} with ref ${submissionRef}`);

    // ── Step 2: Patch optional fields individually ────────────────────────

    async function patchField(
      internalName: string | null,
      value: unknown,
      label: string,
    ): Promise<void> {
      if (!internalName || value === "" || value == null) return;
      try {
        await updateListItemFields(sysToken, "Job Applications", itemId, {
          [internalName]: value,
        });
      } catch (e) {
        console.warn(
          `[API job-apply] Could not set "${label}" (${internalName}):`,
          (e as Error).message?.slice(0, 200),
        );
      }
    }

    // URL columns (Resume Url, Cover Letter Url).
    // NOTE: If these are "Hyperlink or Picture" type in SharePoint, app-only tokens
    // cannot write to them. Change them to "Single line of text" in List Settings
    // and the plain-string fallback below will work automatically.
    console.log(`[API job-apply] resumeUrl to store: "${resumeUrl || "(empty)"}"`);
    if (COL.resumeUrl && resumeUrl) {
      await patchUrlColumn(sysToken, "Job Applications", itemId, COL.resumeUrl, resumeUrl, accessToken);
    }
    // coverLetterUrl — currently unused (cover letters stored as text in Reasoning)
    // Uncomment when you add cover letter file upload support:
    // if (COL.coverLetterUrl && coverLetterUrl) {
    //   await patchUrlColumn(sysToken, "Job Applications", itemId, COL.coverLetterUrl, coverLetterUrl);
    // }

    // Plain text / note columns
    await patchField(COL.currentPosition,   currentPosition || null,  "CurrentPosition");
    await patchField(COL.currentDepartment, currentDepartment || null, "CurrentDepartment");
    await patchField(COL.reasoning,         coverLetter?.trim() || null, "Reasoning");
    await patchField(
      COL.customAnswers,
      customAnswers && Object.keys(customAnswers).length > 0
        ? JSON.stringify(customAnswers)
        : null,
      "CustomAnswers",
    );

    // ── Step 3: Increment application count on job listing ────────────────
    try {
      const jobItem = await queryListItemById(sysToken, "Internal Job Listing", jobListingId);
      if (jobItem) {
        // Resolve count column name on job listing list too
        const jobColMap = await resolveColumns(sysToken, "Internal Job Listing");
        const countCol = findColumn(
          jobColMap,
          "Application Count",
          "ApplicationCount",
          "Application_x0020_Count",
        );
        if (countCol) {
          const currentCount = Number(jobItem.fields[countCol]) || 0;
          await updateListItemFields(sysToken, "Internal Job Listing", jobListingId, {
            [countCol]: currentCount + 1,
          });
        }
      } else {
        console.warn("[API job-apply] Job listing not found for count update — id:", jobListingId);
      }
    } catch (e) {
      console.warn("[API job-apply] Count update failed (non-fatal):", (e as Error).message);
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
    const msg = (e as Error).message || "Internal server error";
    console.error("[API job-apply]", msg);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}
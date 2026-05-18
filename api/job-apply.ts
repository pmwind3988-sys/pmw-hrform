import {
  getGraphToken,
  queryListItems,
  createListItem,
  updateListItemFields,
  uploadFileToDrive,
  createDocLibrary,
  listExistsGraph,
} from "./_utils/graphClient.js";

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
  coverLetter?: string;
  files?: UploadedFile[];
  customAnswers?: Record<string, unknown>;
}

interface ApiRequest {
  body: Record<string, unknown>;
  method: string;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body as unknown as JobApplyBody;
  const {
    jobListingId,
    jobTitle,
    applicantName,
    applicantEmail,
    applicantPhone,
    coverLetter,
    files,
    customAnswers,
  } = body;

  if (!jobListingId || !jobTitle || !applicantName || !applicantEmail || !applicantPhone) {
    return res.status(400).json({
      error: "Missing required fields: jobListingId, jobTitle, applicantName, applicantEmail, applicantPhone",
    });
  }

  try {
    const token = await getGraphToken();
    const submissionRef = generateSubmissionRef();
    const submittedAt = new Date().toISOString();

    // Upload all documents to document library
    const docLibName = "Job Applications Files";
    let docLibReady = false;
    const allDocs: { name: string; url: string; isCoverLetter: boolean }[] = [];
    let resumeUrl = "";

    async function ensureDocLib(): Promise<void> {
      if (!docLibReady) {
        if (!(await listExistsGraph(token, docLibName))) {
          await createDocLibrary(token, docLibName);
        }
        docLibReady = true;
      }
    }

    async function uploadDoc(name: string, content: string, isCoverLetter: boolean): Promise<string | null> {
      try {
        await ensureDocLib();
        const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const uniqueName = `${submissionRef}_${safeName}`;
        const binary = decodeBase64(content);
        const fileUrl = await uploadFileToDrive(token, docLibName, uniqueName, binary);
        allDocs.push({ name, url: fileUrl, isCoverLetter });
        return fileUrl;
      } catch (e) {
        console.error("[API job-apply] Upload failed:", (e as Error).message);
        return null;
      }
    }

    // Upload cover letter as .txt file
    let coverLetterUrl = "";
    if (coverLetter && coverLetter.trim()) {
      const textContent = Buffer.from(coverLetter, "utf-8").toString("base64");
      const url = await uploadDoc(`CoverLetter_${applicantName.replace(/\s+/g, "_")}.txt`, textContent, true);
      if (url) coverLetterUrl = url;
    }

    // Upload resume and additional files
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.name || !file.content) continue;
        const url = await uploadDoc(file.name, file.content, false);
        if (i === 0 && url) resumeUrl = url;
      }
    }

    // Build application fields — using exact SP column names
    const applicationFields: Record<string, unknown> = {
      Title: `${jobTitle} - ${applicantName}`,
      JobListingID: Number(jobListingId),
      ApplicantName: applicantName,
      ApplicantEmail: applicantEmail,
      ApplicantPhone: applicantPhone,
      Status: "New",
      SubmittedAt: submittedAt,
      SubmissionRef: submissionRef,
      ResumeUrl: resumeUrl,
      CoverLetterUrl: coverLetterUrl,
      CustomAnswers: customAnswers ? JSON.stringify(customAnswers) : "",
    };

    const created = await createListItem(token, "Job Applications", applicationFields);

    // Increment Application_x0020_Count on Internal Job Listing
    try {
      const jobItems = await queryListItems(token, "Internal Job Listing", { top: 1000 });
      const jobItem = jobItems.find((item) => String(item.id) === String(jobListingId));
      const currentCount = Number(jobItem?.fields?.Application_x0020_Count) || 0;
      await updateListItemFields(token, "Internal Job Listing", String(jobListingId), {
        Application_x0020_Count: currentCount + 1,
      });
    } catch (e) {
      console.error("[API job-apply] Failed to increment count:", (e as Error).message);
    }

    // Send email to HR recruitment
    const hrEmail = process.env.HR_RECRUITMENT_EMAIL || "";
    const fromAddress = process.env.EMAIL_FROM_ADDRESS || "";

    if (hrEmail && fromAddress) {
      try {
        const docListHtml = allDocs.length > 0
          ? `<p><strong>Documents:</strong></p><ul>${allDocs.map((d) =>
              `<li><a href="${d.url}">${d.name}${d.isCoverLetter ? " (Cover Letter)" : ""}</a></li>`
            ).join("")}</ul>`
          : "";

        const customHtml = customAnswers && Object.keys(customAnswers).length > 0
          ? `<p><strong>Additional Responses:</strong></p><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:600px">${
              Object.entries(customAnswers).map(([k, v]) =>
                `<tr><td><strong>${k}</strong></td><td>${String(v ?? "")}</td></tr>`
              ).join("")
            }</table>`
          : "";

        const coverLetterPreview = coverLetter && coverLetter.trim()
          ? `<p><strong>Cover Letter:</strong></p><blockquote style="background:#f5f5f5;padding:12px;border-left:4px solid #0078D4;">${coverLetter.replace(/\n/g, "<br>")}</blockquote>`
          : "";

        const htmlBody = `
          <h2>New Job Application</h2>
          <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:600px">
            <tr><td><strong>Position</strong></td><td>${jobTitle}</td></tr>
            <tr><td><strong>Applicant</strong></td><td>${applicantName}</td></tr>
            <tr><td><strong>Email</strong></td><td><a href="mailto:${applicantEmail}">${applicantEmail}</a></td></tr>
            <tr><td><strong>Phone</strong></td><td>${applicantPhone}</td></tr>
            <tr><td><strong>Ref</strong></td><td>${submissionRef}</td></tr>
            <tr><td><strong>Date</strong></td><td>${submittedAt}</td></tr>
          </table>
          ${customHtml}
          ${docListHtml}
          ${coverLetterPreview}
        `;

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

        const emailPayload: Record<string, unknown> = {
          message: {
            subject: `Job Application: ${jobTitle} - ${applicantName}`,
            body: { contentType: "HTML", content: htmlBody },
            toRecipients: [{ emailAddress: { address: hrEmail } }],
            attachments,
          },
          saveToSentItems: false,
        };

        const graphRes = await fetch(
          `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromAddress)}/sendMail`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(emailPayload),
          }
        );

        if (!graphRes.ok) {
          const errText = await graphRes.text();
          console.error("[API job-apply] sendMail failed:", graphRes.status, errText);
        }
      } catch (e) {
        console.error("[API job-apply] Email failed:", (e as Error).message);
      }
    }

    return res.status(200).json({
      success: true,
      applicationId: created.id,
      submissionRef,
    });
  } catch (e) {
    console.error("[API job-apply]", e);
    return res.status(500).json({ error: (e as Error).message });
  }
}

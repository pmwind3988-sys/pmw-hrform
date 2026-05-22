import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken, queryListItems } from "./_utils/graphClient.js";

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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers as Record<string, string | string[] | undefined>);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const token = await getGraphToken();
    const items = await queryListItems(token, "Internal Job Listing", { top: 500 });

    // Compute live application counts from actual submissions (excluding deleted ones)
    let appCountByJob: Record<string, number> = {};
    try {
      const allApps = await queryListItems(token, "Job Applications", { top: 999 });
      appCountByJob = {};
      for (const app of allApps) {
        const jobId = String(app.fields.JobListingID || "");
        if (jobId) appCountByJob[jobId] = (appCountByJob[jobId] || 0) + 1;
      }
    } catch (e) {
      console.error("[API jobs-list] Failed to fetch application counts:", (e as Error).message);
    }

    const jobs = items
      .filter((item) => {
        const status = String(item.fields.Status || "").toLowerCase();
        return status === "new";
      })
      .map((item) => {
        const itemId = String(item.id || item.fields.Id || "");
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
          closingDate: item.fields.Closing_x0020_Date ? String(item.fields.Closing_x0020_Date) : null,
          status: String(item.fields.Status || "New"),
          applicationCount: appCountByJob[itemId] ?? 0,
          created: String(item.fields.Created || ""),
          customFields,
        };
      });

    return res.status(200).json({ jobs } as unknown as Record<string, unknown>);
  } catch (e) {
    console.error("[API jobs-list]", e);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

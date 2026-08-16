import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken, getListColumns, graphFieldEquals, queryListItemById, queryListItems } from "./_utils/graphClient.js";
import { listCareerPortalCards } from "./_utils/careerPortalCards.js";
import { readCareerPortalAccess } from "./_utils/careerPortalAccess.js";
import { resolveSignedInViewer } from "./_utils/viewerIdentity.js";
import { parseJobCustomFields } from "./_utils/jobListingFields.js";
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

function numberField(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

interface JobListColumns {
  company: string | null;
  customFields: string | null;
}

function textField(fields: Record<string, unknown>, ...names: Array<string | null | undefined>): string {
  for (const name of names) {
    if (!name) continue;
    if (fields[name] !== undefined) return String(fields[name] || "");
  }
  return "";
}

function findColumn(
  columns: Array<{ name: string; displayName: string }>,
  ...candidates: string[]
): string | null {
  for (const candidate of candidates) {
    const normalizedCandidate = candidate.toLowerCase();
    const internalMatch = columns.find((item) => item.name.toLowerCase() === normalizedCandidate);
    if (internalMatch) return internalMatch.name;
    const displayMatch = columns.find((item) => item.displayName.toLowerCase() === normalizedCandidate);
    if (displayMatch) return displayMatch.name;
  }
  return null;
}

async function resolveJobListColumns(token: string): Promise<JobListColumns> {
  try {
    const columns = await getListColumns(token, "Internal Job Listing");
    return {
      company: findColumn(columns, "Company", "Company Name", "Company_x0020_Name", "JobCompany", "Job Company", "Job_x0020_Company"),
      customFields: findColumn(columns, "CustomFields", "Custom Fields", "Custom_x0020_Fields", "Custom Questions", "CustomQuestions", "Custom_x0020_Questions"),
    };
  } catch {
    return { company: null, customFields: null };
  }
}

function mapJobItem(item: { id: string; fields: Record<string, unknown> }, columns: JobListColumns) {
  const itemId = String(item.id || item.fields.Id || "");
  const customFields = parseJobCustomFields(item.fields, columns.customFields);

  return {
    id: itemId,
    title: String(item.fields.Title || ""),
    company: textField(item.fields, columns.company, "Company", "Company_x0020_Name", "JobCompany", "Job_x0020_Company"),
    jobDescription: String(item.fields.Job_x0020_Description || ""),
    department: String(item.fields.Department || ""),
    location: textField(item.fields, "Location", "JobLocation", "Job_x0020_Location"),
    employmentType: String(item.fields.Employment_x0020_Type || ""),
    closingDate: item.fields.Closing_x0020_Date ? String(item.fields.Closing_x0020_Date) : null,
    status: String(item.fields.Status || "New"),
    applicationCount: numberField(item.fields.Application_x0020_Count),
    created: String(item.fields.Created || ""),
    customFields,
  };
}

function getBearerToken(headers: Record<string, string | string[] | undefined>): string {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === "authorization")?.[1];
  const authorization = Array.isArray(entry) ? entry[0] || "" : entry || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return "";
  return authorization.slice(7).trim();
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers as Record<string, string | string[] | undefined>);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const token = await getGraphToken();
    const portalAccess = await readCareerPortalAccess(token);

    // A private portal answers differently per caller, so it must never be
    // served from the shared edge cache.
    res.setHeader(
      "Cache-Control",
      portalAccess.isPublic ? "s-maxage=60, stale-while-revalidate=300" : "private, no-store",
    );

    if (!portalAccess.isPublic) {
      // Either kind of signed-in visitor passes: a PMW Microsoft 365 account, or
      // an HR-issued portal account. A closed portal is closed to the public,
      // not to the people HR deliberately let in.
      const viewer = await resolveSignedInViewer(getBearerToken(req.headers), token);
      if (!viewer) {
        return res.status(403).json({
          error: "The career portal is currently open to signed-in accounts only.",
          code: "career-portal-private",
          portalAccess: { isPublic: false },
        } as unknown as Record<string, unknown>);
      }
    }

    const requestUrl = new URL(req.url || "/api/jobs-list", "http://localhost");
    const jobId = requestUrl.searchParams.get("jobId")?.trim();
    const [portalCards, jobColumns] = await Promise.all([
      listCareerPortalCards(token, { activeOnly: true }).catch((e) => {
        logWarn("api:jobs-list", "Failed to load career portal cards", {
          errorMessage: e instanceof Error ? e.message : String(e),
        });
        return [];
      }),
      resolveJobListColumns(token),
    ]);

    if (jobId) {
      if (!/^\d+$/.test(jobId)) {
        return res.status(400).json({ error: "Invalid jobId" });
      }
      const item = await queryListItemById(token, "Internal Job Listing", jobId);
      const job = item ? mapJobItem(item, jobColumns) : null;
      const jobs = job && job.status === "New" ? [job] : [];
      return res.status(200).json({ jobs, portalCards, portalAccess } as unknown as Record<string, unknown>);
    }

    const rawItems = await queryListItems(token, "Internal Job Listing", {
      filter: graphFieldEquals("Status", "New"),
      preferNonIndexed: true,
      top: 100,
    }).catch(async (e) => {
      logWarn("api:jobs-list", "Filtered job listing query failed; falling back to limited local filter", {
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      const fallbackItems = await queryListItems(token, "Internal Job Listing", { top: 500 });
      return fallbackItems.filter((item) => String(item.fields.Status || "").toLowerCase() === "new");
    });

    const jobs = rawItems.map((item) => mapJobItem(item, jobColumns));

    return res.status(200).json({ jobs, portalCards, portalAccess } as unknown as Record<string, unknown>);
  } catch (e) {
    logError("api:jobs-list", "Failed to list jobs", e);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

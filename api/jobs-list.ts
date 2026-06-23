import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken, getListColumns, graphFieldEquals, queryListItems } from "./_utils/graphClient.js";
import { listCareerPortalCards } from "./_utils/careerPortalCards.js";
import { logError, logWarn } from "./_utils/logger.js";

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

function numberField(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textField(fields: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    if (fields[name] !== undefined) return String(fields[name] || "");
  }
  return "";
}

async function resolveCompanyColumn(token: string): Promise<string | null> {
  try {
    const columns = await getListColumns(token, "Internal Job Listing");
    const column = columns.find((item) =>
      item.displayName === "Company" ||
      item.displayName === "Company Name" ||
      item.name === "Company" ||
      item.name === "Company_x0020_Name" ||
      item.name === "JobCompany" ||
      item.name === "Job_x0020_Company"
    );
    return column?.name || null;
  } catch {
    return null;
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers as Record<string, string | string[] | undefined>);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

  try {
    const token = await getGraphToken();
    const [rawItems, portalCards, companyColumn] = await Promise.all([
      queryListItems(token, "Internal Job Listing", {
        filter: graphFieldEquals("Status", "New"),
        preferNonIndexed: true,
        top: 100,
      }).catch(async (e) => {
        logWarn("api:jobs-list", "Filtered job listing query failed; falling back to limited local filter", {
          errorMessage: e instanceof Error ? e.message : String(e),
        });
        const fallbackItems = await queryListItems(token, "Internal Job Listing", { top: 500 });
        return fallbackItems.filter((item) => String(item.fields.Status || "").toLowerCase() === "new");
      }),
      listCareerPortalCards(token, { activeOnly: true }).catch((e) => {
        logWarn("api:jobs-list", "Failed to load career portal cards", {
          errorMessage: e instanceof Error ? e.message : String(e),
        });
        return [];
      }),
      resolveCompanyColumn(token),
    ]);

    const jobs = rawItems
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
          company: textField(item.fields, ...(companyColumn ? [companyColumn] : []), "Company", "Company_x0020_Name", "JobCompany", "Job_x0020_Company"),
          jobDescription: String(item.fields.Job_x0020_Description || ""),
          department: String(item.fields.Department || ""),
          location: textField(item.fields, "JobLocation", "Job_x0020_Location", "Location"),
          employmentType: String(item.fields.Employment_x0020_Type || ""),
          closingDate: item.fields.Closing_x0020_Date ? String(item.fields.Closing_x0020_Date) : null,
          status: String(item.fields.Status || "New"),
          applicationCount: numberField(item.fields.Application_x0020_Count),
          created: String(item.fields.Created || ""),
          customFields,
        };
      });

    return res.status(200).json({ jobs, portalCards } as unknown as Record<string, unknown>);
  } catch (e) {
    logError("api:jobs-list", "Failed to list jobs", e);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

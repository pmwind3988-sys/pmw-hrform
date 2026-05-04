import { getAccessToken, spGet, SP_SITE_URL } from "./_utils/sharepoint.ts";

// Minimal Vercel request/response types
interface ApiRequest {
  query: Record<string, string | string[]>;
  method: string;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const slug = req.query.slug as string;
  const pinVersion = req.query.version as string | undefined;
  if (!slug) return res.status(400).json({ error: "Missing slug parameter" });

  try {
    const token = await getAccessToken();

    // 1. Get form config from Master Form
    const configUrl =
      `${SP_SITE_URL}/_api/web/lists/getByTitle('Master%20Form')/items` +
      `?$filter=Slug eq '${encodeURIComponent(slug)}'` +
      `&$select=Title,CurrentVersion,FormID,NumberOfApprovalLayer,Slug,IsPublished,IsPublic,ConditionField,ApprovalRules` +
      `&$top=1`;

    const configData = (await spGet(token, configUrl)) as {
      value: Array<Record<string, unknown>>;
    };
    const formConfig = configData.value?.[0];

    if (!formConfig) {
      return res.status(404).json({ error: `Form "${slug}" not found.` });
    }
    if (!formConfig.IsPublished) {
      return res.status(403).json({ error: "Form is not published." });
    }

    // 2. Get version data from Web Form Versions
    const targetVersion = pinVersion || (formConfig.CurrentVersion as string) || "1.0";
    const versionUrl =
      `${SP_SITE_URL}/_api/web/lists/getByTitle('Web%20Form%20Versions')/items` +
      `?$filter=FormTitle eq '${encodeURIComponent(formConfig.Title as string)}'` +
      ` and FormVersion eq '${encodeURIComponent(targetVersion)}'` +
      `&$select=SurveyJSON,FormVersion,PublishedAt,PublishedBy` +
      `&$top=1`;

    const versionData = (await spGet(token, versionUrl)) as {
      value: Array<{ SurveyJSON?: string }>;
    };
    const row = versionData.value?.[0];

    if (!row && pinVersion) {
      return res.status(404).json({ error: `Version ${pinVersion} not found.` });
    }

    let surveyJson: unknown = null;
    let meta: Record<string, unknown> = {};
    if (row?.SurveyJSON) {
      try {
        const parsed = JSON.parse(row.SurveyJSON) as {
          surveyJson?: unknown;
          meta?: Record<string, unknown>;
        };
        surveyJson = parsed.surveyJson || null;
        meta = parsed.meta || {};
      } catch {
        // Invalid JSON, leave as defaults
      }
    }

    return res.status(200).json({
      formConfig,
      surveyJson,
      meta,
    });
  } catch (err) {
    console.error("[API form-config]", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
}

import { getGraphToken, queryListItems } from "./_utils/graphClient.ts";

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
    const token = await getGraphToken();

    // 1. Get form config from Master Form
    const masterItems = await queryListItems(token, "Master Form", { top: 500 });
    const formConfig = masterItems.find((i) => i.fields.Slug === slug)?.fields;

    if (!formConfig) {
      return res.status(404).json({ error: `Form "${slug}" not found.` });
    }
    if (formConfig.IsPublished !== true) {
      return res.status(403).json({ error: "Form is not published." });
    }

    // 2. Get version data from Web Form Versions
    const targetVersion = pinVersion || (formConfig.CurrentVersion as string) || "1.0";
    const versionItems = await queryListItems(token, "Web Form Versions", { top: 500 });
    const row = versionItems.find(
      (i) => i.fields.FormTitle === formConfig.Title && i.fields.FormVersion === targetVersion
    )?.fields;

    if (!row && pinVersion) {
      return res.status(404).json({ error: `Version ${pinVersion} not found.` });
    }

    let surveyJson: unknown = null;
    let meta: Record<string, unknown> = {};
    if (row?.SurveyJSON) {
      try {
        const parsed = JSON.parse(row.SurveyJSON as string) as {
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

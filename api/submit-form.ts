import { getGraphToken, queryListItems, createListItem } from "./_utils/graphClient.js";

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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { listTitle, body: formBody } = req.body;
  if (!listTitle || typeof listTitle !== "string") {
    return res.status(400).json({ error: "Missing or invalid listTitle" });
  }
  if (!formBody || typeof formBody !== "object") {
    return res.status(400).json({ error: "Missing or invalid body" });
  }

  try {
    const token = await getGraphToken();

    // Verify the form exists and is public
    const masterItems = await queryListItems(token, "Master Form", { top: 500 });
    const formConfig = masterItems.find((i) => i.fields.Title === listTitle)?.fields;

    if (!formConfig) {
      return res.status(404).json({ error: "Form not found" });
    }
    if (formConfig.IsPublic === false) {
      return res.status(403).json({ error: "Form is not public" });
    }

    // Submit to SharePoint list via Graph
    const result = await createListItem(token, listTitle, formBody as Record<string, unknown>);

    return res.status(200).json({ success: true, id: result.id });
  } catch (err) {
    console.error("[API submit-form]", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
}

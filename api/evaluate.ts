import { getGraphToken, queryListItems, createListItem, updateListItemFields } from "./_utils/graphClient.ts";

interface ApiRequest {
  body: Record<string, unknown>;
  query: Record<string, string | string[]>;
  method: string;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

async function handleGet(req: ApiRequest, res: ApiResponse) {
  const { token } = req.query as { token?: string };
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Missing token query parameter" });
  }

  try {
    const graphToken = await getGraphToken();

    // Find the token in all Master Form items
    const masterItems = await queryListItems(graphToken, "Master Form", { top: 500 });
    let foundToken: Record<string, unknown> | null = null;
    let foundFormTitle = "";
    let foundLayerNumber = 0;
    let layerConfig: { layers: Record<string, unknown>[] } | null = null;

    for (const form of masterItems) {
      const rawLayerConfig = form.fields.LayerConfig as string | undefined;
      if (!rawLayerConfig) continue;
      try {
        const parsed = JSON.parse(rawLayerConfig) as { layers: Record<string, unknown>[] };
        for (const layer of parsed.layers) {
          if (layer.publicToken === token) {
            foundToken = layer;
            foundFormTitle = form.fields.Title as string;
            foundLayerNumber = layer.layerNumber as number;
            layerConfig = parsed;
            break;
          }
        }
      } catch { /* invalid JSON, skip */ }
      if (foundToken) break;
    }

    if (!foundToken) return res.status(404).json({ error: "Token not found" });
    if (foundToken.tokenExpiresAt && new Date(foundToken.tokenExpiresAt as string) < new Date()) {
      return res.status(403).json({ error: "Token has expired" });
    }

    // The caller must provide the response item ID
    const responseItemId = req.query.responseItemId ? Number(req.query.responseItemId) : undefined;
    if (!responseItemId) return res.status(400).json({ error: "Missing responseItemId query parameter" });

    const responseListName = `${foundFormTitle} Responses`;
    const items = await queryListItems(graphToken, responseListName, {
      filter: `fields/id eq ${responseItemId}`,
      top: 1,
    });
    const responseItem = items[0];
    if (!responseItem) return res.status(404).json({ error: "Response item not found" });

    // Filter fields based on layer visibility
    const visibleFields: Record<string, unknown> = {};
    const allFields = responseItem.fields || {};

    // Include submission metadata always
    for (const key of ["Title", "SubmittedBy", "SubmittedAt", "FormVersion", "FormID"]) {
      if (allFields[key] !== undefined) visibleFields[key] = allFields[key];
    }

    // Include previous layer results (layers < current layer)
    if (layerConfig) {
      for (const layer of layerConfig.layers) {
        const n = layer.layerNumber as number;
        if (n < foundLayerNumber) {
          visibleFields[`L${n}_Status`] = allFields[`L${n}_Status`];
          visibleFields[`L${n}_Email`] = allFields[`L${n}_Email`];
          visibleFields[`L${n}_SignedAt`] = allFields[`L${n}_SignedAt`];
        } else if (n === foundLayerNumber) {
          // Current layer — include status
          visibleFields[`L${n}_Status`] = allFields[`L${n}_Status`];
          visibleFields[`L${n}_Email`] = allFields[`L${n}_Email`];
        }
        // Future layers (n > foundLayerNumber) — HIDDEN
      }

      // Include evaluation data for previous layers only
      const rawEvalData = allFields.EvaluationData as string | undefined;
      if (rawEvalData) {
        try {
          const allEval = JSON.parse(rawEvalData) as Record<string, unknown>;
          const visibleEval: Record<string, unknown> = {};
          for (const layer of layerConfig.layers) {
            const n = layer.layerNumber as number;
            if (n < foundLayerNumber && allEval[String(n)]) {
              visibleEval[String(n)] = allEval[String(n)];
            }
          }
          visibleFields.EvaluationData = JSON.stringify(visibleEval);
        } catch { /* invalid JSON, skip */ }
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        formTitle: foundFormTitle,
        layerNumber: foundLayerNumber,
        totalLayers: layerConfig?.layers?.length || 0,
        layerType: foundToken.type || "approval",
        layerTitle: foundToken.title || "",
        fields: visibleFields,
      },
    });
  } catch (err) {
    console.error("[API evaluate GET]", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { token, layerNumber, formTitle, responseItemId, fields, action, signature } = req.body;

  // Validate required fields
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Missing or invalid public token" });
  }
  if (!formTitle || typeof formTitle !== "string") {
    return res.status(400).json({ error: "Missing or invalid formTitle" });
  }
  if (!layerNumber || typeof layerNumber !== "number") {
    return res.status(400).json({ error: "Missing or invalid layerNumber" });
  }
  if (!action || !["approve", "reject", "confirm"].includes(action)) {
    return res.status(400).json({ error: "action must be 'approve', 'reject', or 'confirm'" });
  }

  try {
    const graphToken = await getGraphToken();

    // 1. Load Master Form to find the layer config + validate token
    const masterItems = await queryListItems(graphToken, "Master Form", { top: 500 });
    const formConfig = masterItems.find((i) => i.fields.Title === formTitle)?.fields;
    if (!formConfig) return res.status(404).json({ error: "Form not found" });

    // Parse LayerConfig
    let layerConfigParsed: { layers: Record<string, unknown>[] } | null = null;
    const rawLayerConfig = formConfig.LayerConfig as string | undefined;
    if (rawLayerConfig) {
      try { layerConfigParsed = JSON.parse(rawLayerConfig); } catch { /* invalid JSON, fall through */ }
    }
    if (!layerConfigParsed?.layers) return res.status(400).json({ error: "Form has no layer config" });

    // Find the layer by number
    const layer = layerConfigParsed.layers.find((l) => l.layerNumber === layerNumber) as Record<string, unknown> | undefined;
    if (!layer) return res.status(404).json({ error: `Layer ${layerNumber} not found in config` });

    // Validate the token
    if (layer.publicToken !== token) {
      return res.status(403).json({ error: "Invalid token" });
    }
    if (layer.tokenExpiresAt && new Date(layer.tokenExpiresAt as string) < new Date()) {
      return res.status(403).json({ error: "Token has expired" });
    }

    // 2. Fetch the response item using Graph API
    const responseListName = `${formTitle} Responses`;
    const items = await queryListItems(graphToken, responseListName, {
      filter: `fields/id eq ${responseItemId}`,
      top: 1,
    });
    const responseItem = items[0];
    if (!responseItem) return res.status(404).json({ error: "Response item not found" });

    // 3. Build update payload based on action
    const updates: Record<string, unknown> = {};
    const now = new Date().toISOString();

    if (action === "approve" || action === "confirm") {
      updates[`L${layerNumber}_Status`] = action === "approve" ? "Approved" : "Confirmed";
      updates[`L${layerNumber}_SignedAt`] = now;
      if (signature) updates[`L${layerNumber}_Signature`] = signature;

      // For evaluation layers: also write to EvaluationData JSON
      if (layer.type === "evaluation" && fields) {
        // Read existing EvaluationData if any
        let evalData: Record<string, unknown> = {};
        if (responseItem.fields.EvaluationData) {
          try { evalData = JSON.parse(responseItem.fields.EvaluationData as string); } catch { /* invalid JSON, start fresh */ }
        }
        evalData[String(layerNumber)] = {
          confirmerEmail: "SYSTEM",
          confirmerName: null,
          confirmedAt: now,
          status: "confirmed",
          fields: fields,
          signatureUrl: signature || null,
        };
        updates.EvaluationData = JSON.stringify(evalData);
      }

      // Advance to next layer or complete
      const totalLayers = layerConfigParsed.layers.length;
      if (layerNumber < totalLayers) {
        updates.CurrentLayer = (layerNumber as number) + 1;
      } else {
        updates.FormStatus = "Completed";
        updates.CurrentLayer = 0;
      }
    } else if (action === "reject") {
      updates[`L${layerNumber}_Status`] = "Rejected";
      updates[`L${layerNumber}_SignedAt`] = now;
      updates.FormStatus = "Rejected";
    }

    // 4. Update the response item
    await updateListItemFields(graphToken, responseListName, responseItem.id, updates);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[API evaluate]", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
}
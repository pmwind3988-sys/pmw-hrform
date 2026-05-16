import { getGraphToken, queryListItems, createListItem, getListId, getSiteId, createDocLibrary, uploadFileToDrive, listExistsGraph } from "./_utils/graphClient.js";

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

  const { listTitle, body: formBody, matrixData } = req.body as {
    listTitle?: string;
    body?: Record<string, unknown>;
    matrixData?: Record<string, { rows: Record<string, unknown>[]; columns: { name: string; title: string; cellType?: string; choices?: string[] }[] }>;
  };
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

    // Upload file/image data to document library (server-side)
    const docLibName = `${listTitle} Files`;
    let docLibReady = false;

    for (const [k, v] of Object.entries(formBody)) {
      if (typeof v === "string" && v.startsWith("data:")) {
        try {
          if (!docLibReady) {
            if (!(await listExistsGraph(token, docLibName))) {
              await createDocLibrary(token, docLibName);
            }
            docLibReady = true;
          }
          const mimeMatch = v.match(/^data:([\w/+-]+);/);
          const ext = mimeMatch ? mimeMatch[1].split('/').pop() || 'bin' : 'bin';
          const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '');
          const fileName = `${k}_${Date.now()}.${safeExt}`;
          const base64 = v.replace(/^data:[\w/+-]+;base64,/, '');
          const binary = new Uint8Array(Buffer.from(base64, 'base64'));
          const fileUrl = await uploadFileToDrive(token, docLibName, fileName, binary);
          formBody[k] = { Url: fileUrl, Description: fileName };
        } catch (e) {
          console.warn("[API submit-form] File upload failed for", k, (e as Error).message);
        }
      }
    }

    // Submit to SharePoint list via Graph
    const result = await createListItem(token, listTitle, formBody as Record<string, unknown>);
    const parentId = result.id;

    // Create child list items for matrix fields
    const childItemIds: Record<string, number[]> = {};
    if (matrixData && parentId) {
      for (const [fieldName, data] of Object.entries(matrixData)) {
        const childListDisplayName = `${listTitle} Matrix ${fieldName.replace(/[^a-zA-Z0-9_ -]/g, '').trim()}`;
        const rows = data.rows;
        const columns = data.columns;
        if (!Array.isArray(rows) || rows.length === 0) continue;

        const childIds: number[] = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const fields: Record<string, unknown> = {
            ParentResponseId: Number(parentId),
            RowIndex: i,
          };
          for (const col of columns) {
            if (col.name && row[col.name] !== undefined) {
              fields[col.name] = row[col.name];
            }
          }
          try {
            const item = await createListItem(token, childListDisplayName, fields);
            if (item.id) childIds.push(Number(item.id));
          } catch (e) {
            console.warn(`[API submit-form] Matrix child item failed for ${fieldName} row ${i}:`, (e as Error).message);
          }
        }
        if (childIds.length > 0) {
          childItemIds[fieldName] = childIds;
        }
      }

      // If matrix child items were created, PATCH the parent item with RowIds
      if (Object.keys(childItemIds).length > 0) {
        const updateFields: Record<string, string> = {};
        for (const [fieldName, ids] of Object.entries(childItemIds)) {
          updateFields[`${fieldName}_RowIds`] = JSON.stringify(ids);
        }
        try {
          const { updateListItemFields } = await import("./_utils/graphClient.js");
          await updateListItemFields(token, listTitle, parentId, updateFields);
        } catch (e) {
          console.warn("[API submit-form] Failed to update parent with RowIds:", (e as Error).message);
        }
      }
    }

    return res.status(200).json({ success: true, id: parentId, childItemIds });
  } catch (err) {
    console.error("[API submit-form]", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
}

import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken, queryListItems, createListItem, uploadFileToDrive, updateListItemFields } from "./_utils/graphClient.js";
import { logError, logWarn } from "./_utils/logger.js";
import { ensurePdpaColumns, ensureUploadLibrary } from "./_utils/provisioning.js";

const PDPA_NOTICE_VERSION = "PDPA-MY-HR-2026-05-22";
const PDPA_RETENTION_YEARS = Number(process.env.PDPA_RETENTION_YEARS || "7");

function getRetentionUntil(from: Date = new Date()): string {
  const retentionUntil = new Date(from);
  retentionUntil.setFullYear(retentionUntil.getFullYear() + PDPA_RETENTION_YEARS);
  return retentionUntil.toISOString();
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers as Record<string, string | string[] | undefined>);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { listTitle, body: formBody, matrixData, pdpaConsent, pdpaNoticeVersion, pdpaConsentedAt, retentionUntil } = req.body as {
    listTitle?: string;
    body?: Record<string, unknown>;
    matrixData?: Record<string, { rows: Record<string, unknown>[]; columns: { name: string; title: string; cellType?: string; choices?: string[] }[] }>;
    pdpaConsent?: boolean;
    pdpaNoticeVersion?: string;
    pdpaConsentedAt?: string;
    retentionUntil?: string;
  };
  if (!listTitle || typeof listTitle !== "string") {
    return res.status(400).json({ error: "Missing or invalid listTitle" });
  }
  if (!formBody || typeof formBody !== "object") {
    return res.status(400).json({ error: "Missing or invalid body" });
  }
  if (pdpaConsent !== true) {
    return res.status(400).json({ error: "PDPA consent is required before submitting this form." });
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

    await ensurePdpaColumns(token, listTitle);
    const consentedAt = typeof pdpaConsentedAt === "string" && !Number.isNaN(Date.parse(pdpaConsentedAt))
      ? pdpaConsentedAt
      : new Date().toISOString();
    const retentionDate = typeof retentionUntil === "string" && !Number.isNaN(Date.parse(retentionUntil))
      ? retentionUntil
      : getRetentionUntil(new Date(consentedAt));
    formBody.PDPAConsent = "Accepted";
    formBody.PDPANoticeVersion = pdpaNoticeVersion || PDPA_NOTICE_VERSION;
    formBody.PDPAConsentAt = consentedAt;
    formBody.RetentionUntil = retentionDate;

    // Upload file/image data to document library (server-side)
    const docLibName = `${listTitle} Files`;
    let docLibReady = false;

    for (const [k, v] of Object.entries(formBody)) {
      if (typeof v === "string" && v.startsWith("data:")) {
        try {
          if (!docLibReady) {
            await ensureUploadLibrary(token, docLibName);
            docLibReady = true;
          }
          const mimeMatch = v.match(/^data:([\w/+-]+);/);
          const ext = mimeMatch ? mimeMatch[1].split('/').pop() || 'bin' : 'bin';
          const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '');
          const fileName = `${k}_${Date.now()}.${safeExt}`;
          const base64 = v.replace(/^data:[\w/+-]+;base64,/, '');
          const rawSize = Math.ceil((base64.length * 3) / 4);
          if (rawSize > 10 * 1024 * 1024) {
            logWarn("api:submit-form", "Skipping oversized upload", { fieldName: k, rawSize });
            continue;
          }
          const binary = new Uint8Array(Buffer.from(base64, 'base64'));
          const fileUrl = await uploadFileToDrive(token, docLibName, fileName, binary);
          formBody[k] = { Url: fileUrl, Description: fileName };
        } catch (e) {
          logWarn("api:submit-form", "File upload failed", {
            fieldName: k,
            errorMessage: e instanceof Error ? e.message : String(e),
          });
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
            logWarn("api:submit-form", "Matrix child item write failed", {
              fieldName,
              rowIndex: i,
              errorMessage: e instanceof Error ? e.message : String(e),
            });
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
          await updateListItemFields(token, listTitle, parentId, updateFields);
        } catch (e) {
          logWarn("api:submit-form", "Failed to update parent with matrix row ids", {
            parentId,
            errorMessage: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    return res.status(200).json({ success: true, id: parentId, childItemIds });
  } catch (err) {
    logError("api:submit-form", "Failed to submit public form", err);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

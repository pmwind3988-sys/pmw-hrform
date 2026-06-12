import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken, queryListItems, createListItem, uploadFileToDrive, updateListItemFields } from "./_utils/graphClient.js";
import { logError, logWarn } from "./_utils/logger.js";
import { resolveDepartmentApproverFromList } from "./_utils/departmentApproverLookup.js";
import { ensurePdpaColumns, ensureUploadLibrary, ensureWorkflowColumns } from "./_utils/provisioning.js";

const PDPA_NOTICE_VERSION = "PDPA-MY-HR-2026-05-22";
const PDPA_RETENTION_YEARS = Number(process.env.PDPA_RETENTION_YEARS || "7");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LAYER_PENDING_STATUS = "Pending";
const FORM_SUBMITTED_STATUS = "Submitted";

interface ApiFixedUserLayerAssignee {
  type: "user";
  value: string;
}

interface ApiFieldReferenceLayerAssignee {
  type: "field-reference";
  value: string;
}

interface ApiDepartmentApproverLayerAssignee {
  type: "department-approver";
  value: string;
  listName?: string;
  departmentColumn?: string;
  emailColumn?: string;
  nameColumn?: string;
  roleColumn?: string;
  roleValue?: string;
}

type ApiLayerAssignee =
  | ApiFixedUserLayerAssignee
  | ApiFieldReferenceLayerAssignee
  | ApiDepartmentApproverLayerAssignee;

interface ApiLayerConfigItem {
  layerNumber: number;
  type: "approval" | "evaluation";
  authMode: "365" | "public";
  assignee: ApiLayerAssignee;
  title?: string;
}

interface ApiLayerConfig {
  layers?: ApiLayerConfigItem[];
  manualBranches?: { layers?: ApiLayerConfigItem[] }[];
}

function getRetentionUntil(from: Date = new Date()): string {
  const retentionUntil = new Date(from);
  retentionUntil.setFullYear(retentionUntil.getFullYear() + PDPA_RETENTION_YEARS);
  return retentionUntil.toISOString();
}

function parseLayerConfig(value: unknown): ApiLayerConfig | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as ApiLayerConfig;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function stripFieldReference(value: string): string {
  return value.replace(/^\$\{/, "").replace(/\}$/, "");
}

function valueToText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["email", "Email", "value", "Value", "text", "Title"]) {
      const next = record[key];
      if (typeof next === "string" && next.trim()) return next.trim();
    }
  }
  return "";
}

async function resolveLayerAssignee(
  token: string,
  layer: ApiLayerConfigItem,
  formBody: Record<string, unknown>,
): Promise<{ email: string; name: string }> {
  const label = layer.title || `Layer ${layer.layerNumber}`;
  if (layer.assignee.type === "department-approver") {
    return resolveDepartmentApproverFromList(token, layer.assignee, formBody, label);
  }

  const rawEmail = layer.assignee.type === "user"
    ? layer.assignee.value
    : valueToText(formBody[stripFieldReference(layer.assignee.value)]);
  const email = rawEmail.trim();
  if (layer.authMode === "365" && !EMAIL_RE.test(email)) {
    throw new Error(`${label} needs a valid assignee email before the workflow can start.`);
  }
  return { email, name: "" };
}

async function applyLayerConfigWorkflow(
  token: string,
  listTitle: string,
  formBody: Record<string, unknown>,
  layerConfig: ApiLayerConfig | null,
): Promise<void> {
  const manualBranches = layerConfig?.manualBranches ?? [];
  if (manualBranches.length > 0) {
    const maxBranchLayers = Math.max(1, ...manualBranches.map((branch) => branch.layers?.length ?? 0));
    await ensureWorkflowColumns(token, listTitle, maxBranchLayers);
    formBody.FormStatus = FORM_SUBMITTED_STATUS;
    formBody.Status = FORM_SUBMITTED_STATUS;
    formBody.CurrentLayer = 0;
    return;
  }

  const layers = layerConfig?.layers ?? [];
  if (layers.length === 0) return;

  await ensureWorkflowColumns(token, listTitle, layers.length);
  for (let index = 0; index < layers.length; index++) {
    const layerNumber = index + 1;
    const resolved = await resolveLayerAssignee(token, layers[index], formBody);
    formBody[`L${layerNumber}_Status`] = LAYER_PENDING_STATUS;
    formBody[`L${layerNumber}_Email`] = resolved.email;
  }
  formBody.FormStatus = FORM_SUBMITTED_STATUS;
  formBody.CurrentLayer = 1;
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

    await applyLayerConfigWorkflow(token, listTitle, formBody, parseLayerConfig(formConfig.LayerConfig));

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

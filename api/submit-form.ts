import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken, queryListItems, createListItem, uploadFileToDrive, updateListItemFields, getListColumns } from "./_utils/graphClient.js";
import { logError, logWarn } from "./_utils/logger.js";
import { resolveDepartmentApproverFromList } from "./_utils/departmentApproverLookup.js";
import { ensureUploadLibrary } from "./_utils/provisioning.js";

const PDPA_NOTICE_VERSION = "PDPA-MY-HR-2026-05-22";
const PDPA_RETENTION_YEARS = Number(process.env.PDPA_RETENTION_YEARS || "7");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LAYER_PENDING_STATUS = "Pending";
const FORM_SUBMITTED_STATUS = "Submitted";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

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

interface ApiMatrixColumn {
  name: string;
  title: string;
  cellType?: string;
  choices?: string[];
}

interface ApiMatrixFieldSpec {
  name: string;
  columns: ApiMatrixColumn[];
}

type ApiFieldKind = "text" | "note" | "number" | "boolean" | "dateTime" | "choice" | "multiChoice" | "url" | "file";

interface ApiFieldSpec {
  name: string;
  kind: ApiFieldKind;
}

interface ApiSubmissionSchema {
  fields: ApiFieldSpec[];
  matrices: ApiMatrixFieldSpec[];
}

interface ApiUploadContext {
  token: string;
  listTitle: string;
  docLibReady: boolean;
}

interface ApiUploadCandidate {
  content: string;
  name?: string;
}

interface ApiDataUri {
  mime: string;
  base64: string;
  ext: string;
  rawSize: number;
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

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = parseJsonValue(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
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

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["true", "yes", "1", "accepted", "checked"].includes(normalized)) return true;
  if (["false", "no", "0", "declined", "unchecked"].includes(normalized)) return false;
  return undefined;
}

function toIsoDateTime(value: unknown): string | undefined {
  const text = valueToText(value);
  if (!text) return undefined;
  const time = Date.parse(text);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(valueToText).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const parsed = parseJsonValue(trimmed);
    if (Array.isArray(parsed)) return parsed.map(valueToText).filter(Boolean);
    return [trimmed];
  }
  const text = valueToText(value);
  return text ? [text] : [];
}

function isMatrixType(type: string): boolean {
  return type === "dynamicmatrix" || type === "matrixdynamic" || type === "tableinput";
}

function isLayoutOrDisplayOnlyType(type: string): boolean {
  return [
    "alert",
    "chartdisplay",
    "columns",
    "countdown",
    "datatable",
    "divider",
    "html",
    "image",
    "pagebreak",
    "panel",
    "repeater",
    "spacer",
    "videoembed",
  ].includes(type);
}

function questionFieldKind(question: Record<string, unknown>): ApiFieldKind | null {
  const type = typeof question.type === "string" ? question.type : "";
  const inputType = typeof question.inputType === "string" ? question.inputType : "";
  if (!type || isLayoutOrDisplayOnlyType(type) || isMatrixType(type)) return null;
  if (question._expression || type === "expression" || type === "formula") return "number";

  if (type === "text" && inputType) {
    if (inputType === "number" || inputType === "range") return "number";
    if (inputType === "date" || inputType === "datetime-local") return "dateTime";
  }

  if (["number", "counter", "currency", "duration", "rating", "scorecard", "slider"].includes(type)) return "number";
  if (["date", "datetime"].includes(type)) return "dateTime";
  if (["boolean", "consent"].includes(type)) return "boolean";
  if (type === "checkbox") return "multiChoice";
  if (type === "dropdown" || type === "radiogroup") return "choice";
  if (type === "comment" || type === "jsoneditor" || type === "ranking") return "note";
  if (type === "signaturepad") return "url";
  if (type === "file" || type === "imageupload") return "file";

  return "text";
}

function collectSubmissionSchema(surveyJson: Record<string, unknown>): ApiSubmissionSchema {
  const fields: ApiFieldSpec[] = [];
  const matrices: ApiMatrixFieldSpec[] = [];
  const seenFields = new Set<string>();

  function addField(name: string, kind: ApiFieldKind): void {
    if (!name || seenFields.has(name)) return;
    seenFields.add(name);
    fields.push({ name, kind });
  }

  function walk(elements: unknown[]): void {
    for (const element of elements) {
      if (!element || typeof element !== "object") continue;
      const question = element as Record<string, unknown>;
      const type = typeof question.type === "string" ? question.type : "";
      const name = typeof question.name === "string" ? question.name.trim() : "";

      if (type === "panel" && Array.isArray(question.elements)) {
        walk(question.elements);
        continue;
      }

      if (name && isMatrixType(type)) {
        const columns = Array.isArray(question.columns)
          ? question.columns
              .filter((col): col is Record<string, unknown> => !!col && typeof col === "object")
              .map((col) => ({
                name: valueToText(col.name),
                title: valueToText(col.title),
                cellType: valueToText(col.cellType) || undefined,
                choices: Array.isArray(col.choices) ? col.choices.map(valueToText).filter(Boolean) : undefined,
              }))
              .filter((col) => col.name)
          : [];
        matrices.push({ name, columns });
        continue;
      }

      if (name) {
        const kind = questionFieldKind(question);
        if (kind) addField(name, kind);
      }

      if (Array.isArray(question.elements)) {
        walk(question.elements);
      }
    }
  }

  const pages = Array.isArray(surveyJson.pages) ? surveyJson.pages : [];
  for (const page of pages) {
    if (page && typeof page === "object" && Array.isArray((page as Record<string, unknown>).elements)) {
      walk((page as { elements: unknown[] }).elements);
    }
  }

  return { fields, matrices };
}

async function getPublishedSurveyJson(
  token: string,
  formConfig: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const formTitle = valueToText(formConfig.Title);
  const targetVersion = valueToText(formConfig.CurrentVersion) || "1.0";
  if (!formTitle) return null;

  const versionItems = await queryListItems(token, "Web Form Versions", { top: 500 });
  const row = versionItems.find(
    (item) => item.fields.FormTitle === formTitle && item.fields.FormVersion === targetVersion,
  )?.fields;
  const parsed = parseJsonRecord(row?.SurveyJSON);
  const surveyJson = parsed?.surveyJson ?? parsed;
  return surveyJson && typeof surveyJson === "object" && !Array.isArray(surveyJson)
    ? surveyJson as Record<string, unknown>
    : null;
}

function extractUploadCandidates(value: unknown): ApiUploadCandidate[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("data:")) return [{ content: trimmed }];
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      const parsed = parseJsonValue(trimmed);
      if (parsed !== undefined) return extractUploadCandidates(parsed);
    }
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(extractUploadCandidates);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const content = record.content ?? record.data ?? record.fileContent;
    if (typeof content === "string" && content.trim().startsWith("data:")) {
      return [{ content, name: valueToText(record.name) || valueToText(record.fileName) || undefined }];
    }
  }
  return [];
}

function parseDataUri(value: string): ApiDataUri | null {
  const match = value.match(/^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const base64 = match[2];
  const rawSize = Math.ceil((base64.length * 3) / 4);
  const ext = (mime.split("/").pop() || "bin").replace(/[^a-zA-Z0-9]/g, "") || "bin";
  return { mime, base64, ext, rawSize };
}

async function uploadDataUri(
  context: ApiUploadContext,
  fieldName: string,
  candidate: ApiUploadCandidate,
  index: number,
): Promise<{ url: string; fileName: string }> {
  const parsed = parseDataUri(candidate.content);
  if (!parsed) {
    throw new Error(`Invalid data URI for field "${fieldName}".`);
  }
  if (parsed.rawSize > MAX_UPLOAD_BYTES) {
    throw new Error(`Field "${fieldName}" upload exceeds the 10MB limit.`);
  }
  if (!context.docLibReady) {
    await ensureUploadLibrary(context.token, `${context.listTitle} Files`);
    context.docLibReady = true;
  }
  const safeField = fieldName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "upload";
  const originalName = candidate.name ? candidate.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) : "";
  const fileName = originalName || `${safeField}_${Date.now()}_${index}.${parsed.ext}`;
  const binary = new Uint8Array(Buffer.from(parsed.base64, "base64"));
  const url = await uploadFileToDrive(context.token, `${context.listTitle} Files`, fileName, binary);
  return { url, fileName };
}

async function coerceFieldValue(
  context: ApiUploadContext,
  spec: ApiFieldSpec,
  value: unknown,
): Promise<unknown> {
  if (value === undefined || value === null) return undefined;

  if (spec.kind === "file") {
    const candidates = extractUploadCandidates(value);
    if (candidates.length > 0) {
      const uploads: string[] = [];
      for (let index = 0; index < candidates.length; index++) {
        const uploaded = await uploadDataUri(context, spec.name, candidates[index], index);
        uploads.push(uploaded.url);
      }
      return uploads.length === 1 ? uploads[0] : JSON.stringify(uploads);
    }
    return stringifyValue(valueToText(value) || value);
  }

  if (spec.kind === "url") {
    const candidates = extractUploadCandidates(value);
    if (candidates.length > 0) {
      const uploaded = await uploadDataUri(context, spec.name, candidates[0], 0);
      return { Url: uploaded.url, Description: uploaded.fileName };
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const url = valueToText(record.Url) || valueToText(record.url);
      if (url) return { Url: url, Description: valueToText(record.Description) || valueToText(record.description) || spec.name };
    }
    const url = valueToText(value);
    return url ? { Url: url, Description: spec.name } : undefined;
  }

  switch (spec.kind) {
    case "number":
      return toFiniteNumber(value);
    case "boolean":
      return toBoolean(value);
    case "dateTime":
      return toIsoDateTime(value);
    case "multiChoice":
      return toStringArray(value);
    case "choice":
      return valueToText(value) || undefined;
    case "note":
      return stringifyValue(value);
    case "text":
    default:
      return stringifyValue(valueToText(value) || value);
  }
}

function coerceMatrixCellValue(value: unknown, column: ApiMatrixColumn): unknown {
  if (value === undefined || value === null) return undefined;
  switch (column.cellType) {
    case "number":
      return toFiniteNumber(value);
    case "boolean":
      return toBoolean(value);
    case "date":
      return toIsoDateTime(value);
    case "checkbox":
      return Array.isArray(column.choices) && column.choices.length > 0
        ? toStringArray(value)
        : toBoolean(value);
    case "dropdown":
      return Array.isArray(value) ? toStringArray(value) : valueToText(value);
    case "text":
    default:
      return stringifyValue(valueToText(value) || value);
  }
}

async function buildSubmissionFields(
  token: string,
  listTitle: string,
  incomingBody: Record<string, unknown>,
  formConfig: Record<string, unknown>,
  schema: ApiSubmissionSchema,
): Promise<Record<string, unknown>> {
  const context: ApiUploadContext = { token, listTitle, docLibReady: false };
  const fields: Record<string, unknown> = {
    SubmittedAt: new Date().toISOString(),
    FormVersion: valueToText(formConfig.CurrentVersion) || "1.0",
    FormID: valueToText(formConfig.FormID),
    SubmittedBy: "GUEST",
  };

  for (const spec of schema.fields) {
    if (!(spec.name in incomingBody)) continue;
    const coerced = await coerceFieldValue(context, spec, incomingBody[spec.name]);
    if (coerced !== undefined) fields[spec.name] = coerced;
  }

  for (const matrix of schema.matrices) {
    const rawMatrix = incomingBody[matrix.name];
    const rawMatrixRecord = rawMatrix && typeof rawMatrix === "object" && !Array.isArray(rawMatrix)
      ? rawMatrix as Record<string, unknown>
      : null;
    const html = valueToText(incomingBody[`${matrix.name}_Response`])
      || valueToText(incomingBody[`${matrix.name}_Html`])
      || valueToText(rawMatrixRecord?.html);
    const json = valueToText(incomingBody[`${matrix.name}_Json`])
      || valueToText(rawMatrixRecord?.json)
      || (Array.isArray(rawMatrixRecord?.rows) ? JSON.stringify(rawMatrixRecord.rows) : "");
    if (html) {
      fields[`${matrix.name}_Response`] = html;
      fields[`${matrix.name}_Html`] = html;
    }
    if (json) fields[`${matrix.name}_Json`] = json;
  }

  return fields;
}

async function getColumnKeyResolver(
  token: string,
  listTitle: string,
): Promise<(fieldName: string) => string | null> {
  const columns = await getListColumns(token, listTitle);
  const byName = new Map<string, string>();
  for (const column of columns) {
    byName.set(column.name.toLowerCase(), column.name);
    byName.set(column.displayName.toLowerCase(), column.name);
  }
  return (fieldName: string) => byName.get(fieldName.toLowerCase()) ?? null;
}

function mapToExistingColumns(
  fields: Record<string, unknown>,
  resolveColumnKey: (fieldName: string) => string | null,
  listTitle: string,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [fieldName, value] of Object.entries(fields)) {
    const columnKey = resolveColumnKey(fieldName);
    if (!columnKey) {
      logWarn("api:submit-form", "Skipping field missing from response list schema", { listTitle, fieldName });
      continue;
    }
    mapped[columnKey] = value;
  }
  return mapped;
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
  formBody: Record<string, unknown>,
  layerConfig: ApiLayerConfig | null,
): Promise<void> {
  const manualBranches = layerConfig?.manualBranches ?? [];
  if (manualBranches.length > 0) {
    formBody.FormStatus = FORM_SUBMITTED_STATUS;
    formBody.Status = FORM_SUBMITTED_STATUS;
    formBody.CurrentLayer = 0;
    return;
  }

  const layers = layerConfig?.layers ?? [];
  if (layers.length === 0) return;

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
    matrixData?: Record<string, { rows: Record<string, unknown>[]; columns: ApiMatrixColumn[] }>;
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

    const surveyJson = await getPublishedSurveyJson(token, formConfig);
    if (!surveyJson) {
      logError("api:submit-form", "Published form schema unavailable", undefined, { listTitle });
      return res.status(500).json({ error: "Internal server error. Please try again." });
    }

    const schema = collectSubmissionSchema(surveyJson);
    const submissionBody = await buildSubmissionFields(token, listTitle, formBody, formConfig, schema);
    const consentedAt = typeof pdpaConsentedAt === "string" && !Number.isNaN(Date.parse(pdpaConsentedAt))
      ? pdpaConsentedAt
      : new Date().toISOString();
    const retentionDate = typeof retentionUntil === "string" && !Number.isNaN(Date.parse(retentionUntil))
      ? retentionUntil
      : getRetentionUntil(new Date(consentedAt));
    submissionBody.PDPAConsent = "Accepted";
    submissionBody.PDPANoticeVersion = pdpaNoticeVersion || PDPA_NOTICE_VERSION;
    submissionBody.PDPAConsentAt = consentedAt;
    submissionBody.RetentionUntil = retentionDate;

    await applyLayerConfigWorkflow(token, submissionBody, parseLayerConfig(formConfig.LayerConfig));
    const resolveColumnKey = await getColumnKeyResolver(token, listTitle);
    const writableBody = mapToExistingColumns(submissionBody, resolveColumnKey, listTitle);

    // Submit to SharePoint list via Graph
    const result = await createListItem(token, listTitle, writableBody);
    const parentId = result.id;

    // Create child list items for matrix fields
    const childItemIds: Record<string, number[]> = {};
    if (matrixData && parentId) {
      const matrixSpecs = new Map(schema.matrices.map((matrix) => [matrix.name, matrix]));
      for (const [fieldName, data] of Object.entries(matrixData)) {
        const matrixSpec = matrixSpecs.get(fieldName);
        if (!matrixSpec) {
          logWarn("api:submit-form", "Skipping matrix data not present in published schema", { listTitle, fieldName });
          continue;
        }
        const childListDisplayName = `${listTitle} Matrix ${fieldName.replace(/[^a-zA-Z0-9_ -]/g, '').trim()}`;
        const rows = data.rows;
        const columns = matrixSpec.columns;
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
              const value = coerceMatrixCellValue(row[col.name], col);
              if (value !== undefined) fields[col.name] = value;
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

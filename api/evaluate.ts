import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { ensureListColumns, getGraphToken, getSharePointToken, queryListItems, queryListItemById, queryMasterFormByTitle, queryWebFormVersion, updateListItemFields } from "./_utils/graphClient.js";
import { logError, logWarn } from "./_utils/logger.js";
import {
  buildWorkflowActionEmail,
  buildManualPaperWorkflowEmail,
  getApplicationBaseUrl,
  scheduleOrDeliverWorkflowEmail,
  type WorkflowEmailScheduleConfig,
} from "./_utils/workflowEmail.js";
import { buildWorkflowReviewLink } from "./_utils/workflowLink.js";
import { REFERENCE_NO_FIELD } from "./_utils/referenceNumber.js";
import { parseEmailList, parseValidEmailList } from "./_utils/layerRecipients.js";
import {
  currentGrantSerial,
  GRANT_SERIAL_COLUMN,
  issueLayerLinkToken,
  looksLikePublicGrant,
  verifyPublicGrant,
  type PublicGrant,
  type PublicGrantFailure,
} from "./_utils/publicGrant.js";
import {
  enabledIdentityFields,
  normalizePublicAccessConfig,
  validateDeclaredIdentity,
  writeDeclaredIdentityFields,
} from "./_utils/publicIdentity.js";

const SP_SITE_URL = (process.env.VITE_SP_SITE_URL || process.env.SP_SITE_URL || "").replace(/\/$/, "");

interface ApiRequest {
  body: Record<string, unknown>;
  query: Record<string, string | string[]>;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

function rejectedAtLayerStatus(layerNumber: number): string {
  return `Rejected at Layer ${layerNumber}`;
}

const SYSTEM_FIELDS = new Set([
  "id", "Id", "Title", "SubmittedBy", "SubmittedAt", "Status", "CurrentApprovalLayer",
  "FormVersion", "PublishKey", "FormID", "RawJSON", "CurrentLayer", "FormStatus", "EvaluationData", "WorkflowAssignmentData", "WorkflowEmailLog", "WorkflowEmailSchedule",
  "PDPAConsent", "PDPANoticeVersion", "PDPAConsentAt", "RetentionUntil",
  "Author", "Editor", "Created", "Modified", "ContentType", "PermMask",
  "SelectedBranch", REFERENCE_NO_FIELD,
]);

function isWorkflowField(key: string): boolean {
  return SYSTEM_FIELDS.has(key) || /^L\d+_/.test(key);
}

function isTerminalLayerStatus(value: unknown): boolean {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]/g, "");
  return ["approved", "confirmed", "rejected", "skipped", "cancelled"].includes(normalized) || normalized.includes("reject");
}

function isTerminalFormStatus(value: unknown): boolean {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]/g, "");
  return ["completed", "rejected", "cancelled", "fullyapproved"].includes(normalized);
}

function isManualPaperLayerStatus(value: unknown): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "manual evaluation required" || normalized === "manual approval required";
}

function layerSurveyElements(layer: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(layer.surveyElements)
    ? layer.surveyElements.filter((element): element is Record<string, unknown> =>
        typeof element === "object" && element !== null && !Array.isArray(element)
      )
    : [];
}

function parseVersionPayload(raw: unknown): { surveyJson: unknown; meta: Record<string, unknown>; layerConfig: Record<string, unknown> | null } {
  if (typeof raw !== "string" || !raw.trim()) return { surveyJson: null, meta: {}, layerConfig: null };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      surveyJson: parsed.surveyJson || parsed,
      meta: isRecord(parsed.meta) ? parsed.meta : {},
      layerConfig: isRecord(parsed.layerConfig) ? parsed.layerConfig : null,
    };
  } catch {
    return { surveyJson: null, meta: {}, layerConfig: null };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectMediaFieldNames(surveyJson: unknown): Set<string> {
  const names = new Set<string>();
  const root = isRecord(surveyJson) && isRecord(surveyJson.surveyJson) ? surveyJson.surveyJson : surveyJson;
  const walk = (elements: unknown): void => {
    if (!Array.isArray(elements)) return;
    for (const element of elements) {
      if (!isRecord(element)) continue;
      const type = typeof element.type === "string" ? element.type : "";
      const name = typeof element.name === "string" ? element.name : "";
      if (name && ["signaturepad", "imageupload", "file"].includes(type)) names.add(name);
      walk(element.elements);
      walk(element.templateElements);
    }
  };
  if (isRecord(root) && Array.isArray(root.pages)) {
    for (const page of root.pages) {
      if (isRecord(page)) walk(page.elements);
    }
  }
  return names;
}

function normalizeMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function toAbsoluteSharePointUrl(value: string): string {
  if (!value || value.startsWith("http") || value.startsWith("data:")) return value;
  if (!value.startsWith("/")) return value;
  try {
    return `${new URL(SP_SITE_URL).origin}${value}`;
  } catch {
    return value;
  }
}

function extractImageSrcFromHtml(value: string): string {
  return value.match(/<img\b[^>]*\bsrc=(["'])(.*?)\1/i)?.[2]?.trim() ?? "";
}

function splitSharePointUrlFieldValue(value: string): string {
  const separatorIndex = value.search(/,\s+/);
  return separatorIndex === -1 ? value : value.slice(0, separatorIndex).trim();
}

function linkFromRecord(record: Record<string, unknown>): string {
  for (const key of ["Url", "url", "webUrl", "WebUrl", "LinkingUrl", "linkingUrl", "ServerRelativeUrl", "serverRelativeUrl"]) {
    const next = record[key];
    if (typeof next === "string" && next.trim()) return toAbsoluteSharePointUrl(next.trim());
  }
  const serverUrl = record.serverUrl || record.ServerUrl;
  const relativeUrl = record.serverRelativeUrl || record.ServerRelativeUrl;
  if (typeof serverUrl === "string" && typeof relativeUrl === "string") {
    return `${serverUrl.replace(/\/$/, "")}${relativeUrl}`;
  }
  return "";
}

function mediaSourcesFromValue(value: unknown): string[] {
  const normalized = normalizeMaybeJson(value);
  if (Array.isArray(normalized)) return normalized.flatMap(mediaSourcesFromValue);
  if (isRecord(normalized)) {
    const link = linkFromRecord(normalized);
    return link ? [link] : [];
  }
  if (typeof normalized !== "string") return [];
  const trimmed = normalized.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("data:image/")) return [trimmed];
  const htmlSrc = extractImageSrcFromHtml(trimmed);
  const candidate = splitSharePointUrlFieldValue(htmlSrc || trimmed);
  if (/^(https?:\/\/|\/)/i.test(candidate)) return [toAbsoluteSharePointUrl(candidate)];
  return [];
}

function encodeServerRelativePathParam(serverRelativeUrl: string): string {
  return encodeURIComponent(serverRelativeUrl.replace(/'/g, "''")).replace(/%2F/gi, "/");
}

function serverRelativePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:")) return "";
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const siteUrl = new URL(SP_SITE_URL);
      const mediaUrl = new URL(trimmed);
      if (siteUrl.origin.toLowerCase() !== mediaUrl.origin.toLowerCase()) return "";
      return decodeURIComponent(mediaUrl.pathname);
    }
  } catch {
    return "";
  }
  return trimmed.startsWith("/") ? decodeURIComponent(trimmed.split(/[?#]/)[0] ?? trimmed) : "";
}

function sharePointFileValueUrl(value: string): string {
  const serverPath = serverRelativePath(value);
  if (!serverPath) return "";
  return `${SP_SITE_URL}/_api/web/getFileByServerRelativePath(decodedurl='${encodeServerRelativePathParam(serverPath)}')/$value`;
}

async function sourceToDataUrl(token: string, source: string): Promise<string> {
  if (source.startsWith("data:image/")) return source;
  const requestUrl = sharePointFileValueUrl(source) || source;
  const response = await fetch(requestUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error(`Media fetch failed: ${response.status}`);
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  if (!contentType.startsWith("image/")) return source;
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function buildMediaSrcByField(surveyJson: unknown, fields: Record<string, unknown>): Promise<Record<string, string | string[]>> {
  const mediaFields = collectMediaFieldNames(surveyJson);
  if (mediaFields.size === 0) return {};
  let spToken = "";
  const result: Record<string, string | string[]> = {};

  for (const fieldName of mediaFields) {
    const sources = mediaSourcesFromValue(fields[fieldName]);
    if (sources.length === 0) continue;
    const converted: string[] = [];
    for (const source of sources) {
      try {
        if (!spToken) spToken = await getSharePointToken();
        converted.push(await sourceToDataUrl(spToken, source));
      } catch {
        converted.push(source);
      }
    }
    result[fieldName] = converted.length === 1 ? converted[0] : converted;
  }

  return result;
}

interface LayerConfigShape {
  layers?: Record<string, unknown>[];
  manualBranches?: { name?: string; label?: string; layers?: Record<string, unknown>[] }[];
}

/** Main-path layers plus every manual branch's layers, in one list. */
function allConfiguredLayers(config: LayerConfigShape | null): Record<string, unknown>[] {
  return [
    ...(config?.layers ?? []),
    ...((config?.manualBranches ?? []).flatMap((branch) => branch.layers ?? [])),
  ];
}

function parseLayerConfigJson(raw: unknown): LayerConfigShape | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed as LayerConfigShape : null;
  } catch {
    return null;
  }
}

/**
 * The legacy form-wide `publicToken`: one UUID shared by every submission of a
 * form, so it can only be resolved by scanning. Retained for links already in an
 * inbox — new links are signed grants (`_utils/publicGrant.ts`).
 */
async function findLayerByLegacyToken(graphToken: string, token: string): Promise<{
  layer: Record<string, unknown>;
  formTitle: string;
  layerConfig: LayerConfigShape;
} | null> {
  const masterItems = await queryListItems(graphToken, "Master Form", { top: 500 });
  for (const form of masterItems) {
    const parsed = parseLayerConfigJson(form.fields.LayerConfig);
    if (!parsed) continue;
    const layer = allConfiguredLayers(parsed).find((entry) => entry.publicToken === token);
    if (layer) return { layer, formTitle: String(form.fields.Title || ""), layerConfig: parsed };
  }

  const versionItems = await queryListItems(graphToken, "Web Form Versions", { top: 500 });
  for (const versionItem of versionItems) {
    const parsed = parseVersionPayload(versionItem.fields.SurveyJSON).layerConfig as LayerConfigShape | null;
    if (!parsed) continue;
    const layer = allConfiguredLayers(parsed).find((entry) => entry.publicToken === token);
    if (layer) return { layer, formTitle: String(versionItem.fields.FormTitle || ""), layerConfig: parsed };
  }

  return null;
}

/** Client-facing wording for each way a signed grant can fail to resolve. */
const GRANT_FAILURES: Record<PublicGrantFailure, { status: number; code: string; error: string }> = {
  malformed: { status: 400, code: "invalid-link", error: "This review link is not valid. Please ask the sender for a new one." },
  "bad-signature": { status: 403, code: "invalid-link", error: "This review link is not valid. Please ask the sender for a new one." },
  expired: { status: 403, code: "expired", error: "This review link has expired. Please ask the sender for a new one." },
  unconfigured: { status: 500, code: "unconfigured", error: "Public review links are not configured on this deployment." },
};

const REVOKED_ERROR = {
  status: 403,
  code: "revoked",
  error: "This review link has been replaced by a newer one. Please use the most recent email.",
};

/**
 * Persists a decision, surviving a response list that predates the declared
 * identity columns.
 *
 * Those lists exist in the wild — the columns only arrive on republish — and a
 * single unknown field makes Graph reject the whole PATCH. Losing the recorded
 * identity is bad; losing the approval itself is worse, so the columns are
 * created if possible and dropped if not.
 */
async function writeDecision(
  graphToken: string,
  responseListName: string,
  itemId: string,
  updates: Record<string, unknown>,
  layerNumber: number,
): Promise<void> {
  const identityColumns = [`L${layerNumber}_ActorName`, `L${layerNumber}_ActorIdentity`];
  const writingIdentity = identityColumns.some((column) => column in updates);

  if (writingIdentity) {
    await ensureListColumns(graphToken, responseListName, [
      { name: `L${layerNumber}_ActorName`, displayName: `L${layerNumber}_ActorName`, type: "text" },
      { name: `L${layerNumber}_ActorIdentity`, displayName: `L${layerNumber}_ActorIdentity`, type: "note" },
    ]).catch(() => {});
  }

  try {
    await updateListItemFields(graphToken, responseListName, itemId, updates);
  } catch (error) {
    if (!writingIdentity) throw error;
    const withoutIdentity = { ...updates };
    for (const column of identityColumns) delete withoutIdentity[column];
    logWarn("api:evaluate", "Declared identity columns missing; recording the decision without them", {
      responseListName,
      layerNumber,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    await updateListItemFields(graphToken, responseListName, itemId, withoutIdentity);
  }
}

/** The layer's actor addresses, for `requireAssigneeEmailMatch`. */
function layerActorEmails(fields: Record<string, unknown>, layerNumber: number): string[] {
  const actors = parseEmailList(fields[`L${layerNumber}_Emails`]);
  return actors.length > 0 ? actors : parseEmailList(fields[`L${layerNumber}_Email`]);
}

async function handleGet(req: ApiRequest, res: ApiResponse) {
  const { token } = req.query as { token?: string };
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Missing token query parameter" });
  }

  try {
    const graphToken = await getGraphToken();

    let foundToken: Record<string, unknown> | null = null;
    let foundFormTitle = "";
    let foundLayerNumber = 0;
    let responseItemId = 0;
    let layerConfig: LayerConfigShape | null = null;
    let grant: PublicGrant | null = null;

    if (looksLikePublicGrant(token)) {
      const verification = verifyPublicGrant(token);
      if (!verification.ok) {
        const failure = GRANT_FAILURES[verification.reason];
        return res.status(failure.status).json({ error: failure.error, code: failure.code });
      }
      grant = verification.grant;
      foundFormTitle = grant.formTitle;
      foundLayerNumber = grant.layerNumber;
      // The submission is inside the signature, so ?item= is never consulted —
      // editing it cannot point this link at somebody else's submission.
      responseItemId = grant.responseItemId;
      const masterItem = await queryMasterFormByTitle(graphToken, foundFormTitle);
      layerConfig = parseLayerConfigJson(masterItem?.fields.LayerConfig);
      foundToken = allConfiguredLayers(layerConfig)
        .find((layer) => Number(layer.layerNumber) === foundLayerNumber) ?? null;
    } else {
      const legacy = await findLayerByLegacyToken(graphToken, token);
      if (!legacy) return res.status(404).json({ error: "Token not found", code: "invalid-link" });
      logWarn("api:evaluate:get", "Legacy form-wide public token used", { formTitle: legacy.formTitle });
      foundToken = legacy.layer;
      foundFormTitle = legacy.formTitle;
      foundLayerNumber = Number(legacy.layer.layerNumber);
      layerConfig = legacy.layerConfig;
      if (foundToken.tokenExpiresAt && new Date(foundToken.tokenExpiresAt as string) < new Date()) {
        return res.status(403).json({ error: "This review link has expired.", code: "expired" });
      }
      responseItemId = req.query.responseItemId ? Number(req.query.responseItemId) : 0;
      if (!responseItemId) return res.status(400).json({ error: "Missing responseItemId query parameter" });
    }

    const responseListName = `${foundFormTitle} Responses`;
    const responseItem = await queryListItemById(graphToken, responseListName, String(responseItemId));
    if (!responseItem) return res.status(404).json({ error: "Response item not found" });
    const allFields = responseItem.fields || {};

    if (grant && currentGrantSerial(allFields[GRANT_SERIAL_COLUMN], foundLayerNumber) !== grant.serial) {
      return res.status(REVOKED_ERROR.status).json({ error: REVOKED_ERROR.error, code: REVOKED_ERROR.code });
    }

    const formVersion = String(allFields.FormVersion || "");
    const responsePublishKey = String(allFields.PublishKey || "");
    let parsedResponseVersion = { surveyJson: null as unknown, meta: {} as Record<string, unknown>, layerConfig: null as Record<string, unknown> | null };
    if (formVersion) {
      const versionRow = (await queryWebFormVersion(graphToken, foundFormTitle, formVersion, responsePublishKey || undefined))?.fields;
      parsedResponseVersion = parseVersionPayload(versionRow?.SurveyJSON);
      const responseLayerConfig = parsedResponseVersion.layerConfig as LayerConfigShape | null;
      if (responseLayerConfig) {
        layerConfig = responseLayerConfig;
        // The version the submission was made under is authoritative — same
        // form, same publish key can still carry different layers.
        const responseLayer = allConfiguredLayers(responseLayerConfig).find((layer) =>
          grant ? Number(layer.layerNumber) === foundLayerNumber : layer.publicToken === token
        );
        if (responseLayer) {
          foundToken = responseLayer;
          foundLayerNumber = Number(responseLayer.layerNumber);
        }
      }
    }

    if (!foundToken) {
      return res.status(404).json({ error: "This layer is no longer part of the form.", code: "invalid-link" });
    }

    // Filter fields based on layer visibility
    const visibleFields: Record<string, unknown> = {};
    const selectedBranch = typeof allFields.SelectedBranch === "string" ? allFields.SelectedBranch.trim().toLowerCase() : "";
    const activeLayers = (() => {
      if (selectedBranch && layerConfig?.manualBranches?.length) {
        const branch = layerConfig.manualBranches.find((b) =>
          [b.name, b.label].some((candidate) => typeof candidate === "string" && candidate.trim().toLowerCase() === selectedBranch)
        );
        if (branch?.layers?.length) return branch.layers;
      }
      return layerConfig?.layers ?? [];
    })();
    const previousLayerSummaries = activeLayers
      .filter((layer) => Number(layer.layerNumber) < foundLayerNumber)
      .map((layer) => ({
        layerNumber: layer.layerNumber,
        type: layer.type,
        title: typeof layer.title === "string" ? layer.title : "",
        description: typeof layer.description === "string" ? layer.description : "",
        surveyElements: Array.isArray(layer.surveyElements) ? layer.surveyElements : [],
      }));

    // Include submission metadata always
    for (const key of [REFERENCE_NO_FIELD, "Title", "SubmittedBy", "SubmittedAt", "FormVersion", "PublishKey", "FormID", "Status", "FormStatus", "CurrentLayer", "CurrentApprovalLayer"]) {
      if (allFields[key] !== undefined) visibleFields[key] = allFields[key];
    }

    // Include submitted form fields, but not workflow/system columns.
    for (const [key, value] of Object.entries(allFields)) {
      if (!isWorkflowField(key) && value !== null && value !== undefined) {
        visibleFields[key] = value;
      }
    }

    // Include previous layer results (layers < current layer)
    if (activeLayers.length > 0) {
      for (const layer of activeLayers) {
        const n = layer.layerNumber as number;
        if (n < foundLayerNumber) {
          visibleFields[`L${n}_Status`] = allFields[`L${n}_Status`];
          visibleFields[`L${n}_Email`] = allFields[`L${n}_Email`];
          visibleFields[`L${n}_Emails`] = allFields[`L${n}_Emails`];
          visibleFields[`L${n}_ActedBy`] = allFields[`L${n}_ActedBy`];
          // The name a public link holder declared, so earlier public layers
          // read as a person rather than a bare address.
          visibleFields[`L${n}_ActorName`] = allFields[`L${n}_ActorName`];
          visibleFields[`L${n}_SignedAt`] = allFields[`L${n}_SignedAt`];
        } else if (n === foundLayerNumber) {
          // Current layer — include status
          visibleFields[`L${n}_Status`] = allFields[`L${n}_Status`];
          visibleFields[`L${n}_Email`] = allFields[`L${n}_Email`];
          visibleFields[`L${n}_Emails`] = allFields[`L${n}_Emails`];
        }
        // Future layers (n > foundLayerNumber) — HIDDEN
      }

      // Include evaluation data for previous layers only
      const rawEvalData = allFields.EvaluationData as string | undefined;
      if (rawEvalData) {
        try {
          const allEval = JSON.parse(rawEvalData) as Record<string, unknown>;
          const visibleEval: Record<string, unknown> = {};
          for (const layer of activeLayers) {
            const n = layer.layerNumber as number;
            if (n < foundLayerNumber && allEval[String(n)]) {
              visibleEval[String(n)] = allEval[String(n)];
            }
          }
          visibleFields.EvaluationData = JSON.stringify(visibleEval);
        } catch { /* invalid JSON, skip */ }
      }
    }

    let surveyJson: unknown = null;
    let versionMeta: Record<string, unknown> = {};
    if (formVersion) {
      surveyJson = parsedResponseVersion.surveyJson;
      versionMeta = parsedResponseVersion.meta;
    }
    const mediaSrcByField = await buildMediaSrcByField(surveyJson, visibleFields);

    // What the link holder must declare about themselves before the action
    // buttons unlock. Normalized here so a layer authored before public access
    // was configurable still gets the defaults.
    const publicAccess = normalizePublicAccessConfig(foundToken.publicAccess);

    return res.status(200).json({
      success: true,
      data: {
        formTitle: foundFormTitle,
        layerNumber: foundLayerNumber,
        identity: {
          required: publicAccess.requireIdentity,
          fields: publicAccess.requireIdentity ? enabledIdentityFields(publicAccess) : [],
        },
        linkExpiresAt: grant ? grant.expiresAt.toISOString() : (foundToken.tokenExpiresAt || ""),
        totalLayers: activeLayers.length || 0,
        layerType: foundToken.type || "approval",
        layerTitle: foundToken.title || "",
        layerDescription: foundToken.description || "",
        layerStatus: allFields[`L${foundLayerNumber}_Status`] || "",
        formStatus: allFields.FormStatus || allFields.Status || "",
        surveyElements: Array.isArray(foundToken.surveyElements) ? foundToken.surveyElements : [],
        previousLayerSummaries,
        confirmationLabel: foundToken.confirmationLabel || "",
        confirmationType: foundToken.confirmationType || "",
        surveyJson,
        logoUrl: typeof versionMeta.logoUrl === "string" ? versionMeta.logoUrl : "",
        mediaSrcByField,
        fields: visibleFields,
      },
    });
  } catch (err) {
    logError("api:evaluate:get", "Failed to load public evaluation data", err);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers as Record<string, string | string[] | undefined>);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { token, fields, action, signature, rejection, identity: declaredIdentity } = req.body;

  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Missing or invalid public token" });
  }
  if (typeof action !== "string" || !["approve", "reject", "confirm"].includes(action)) {
    return res.status(400).json({ error: "action must be 'approve', 'reject', or 'confirm'" });
  }

  let grant: PublicGrant | null = null;
  if (looksLikePublicGrant(token)) {
    const verification = verifyPublicGrant(token);
    if (!verification.ok) {
      const failure = GRANT_FAILURES[verification.reason];
      return res.status(failure.status).json({ error: failure.error, code: failure.code });
    }
    grant = verification.grant;
  }

  // A signed grant names its own target, so the body's copies are ignored:
  // rewriting them cannot aim a valid link at somebody else's submission.
  const formTitle = grant ? grant.formTitle : req.body.formTitle;
  const safeResponseItemId = grant ? grant.responseItemId : Number(req.body.responseItemId);
  const layerNumber = grant ? grant.layerNumber : req.body.layerNumber;

  if (!formTitle || typeof formTitle !== "string") {
    return res.status(400).json({ error: "Missing or invalid formTitle" });
  }
  if (!safeResponseItemId) return res.status(400).json({ error: "Invalid responseItemId" });
  if (!layerNumber || typeof layerNumber !== "number") {
    return res.status(400).json({ error: "Missing or invalid layerNumber" });
  }

  try {
    const graphToken = await getGraphToken();

    // 1. Load Master Form to find the layer config + validate token
    const formConfig = (await queryMasterFormByTitle(graphToken, formTitle))?.fields;
    if (!formConfig) return res.status(404).json({ error: "Form not found" });

    // 2. Fetch the response item using Graph API before resolving the workflow
    // config, because same-version profiles can have different layers.
    const responseListName = `${formTitle} Responses`;
    const responseItem = await queryListItemById(graphToken, responseListName, String(safeResponseItemId));
    if (!responseItem) return res.status(404).json({ error: "Response item not found" });
    if (grant && currentGrantSerial(responseItem.fields[GRANT_SERIAL_COLUMN], layerNumber) !== grant.serial) {
      return res.status(REVOKED_ERROR.status).json({ error: REVOKED_ERROR.error, code: REVOKED_ERROR.code });
    }
    const itemFormVersion = String(responseItem.fields.FormVersion || formConfig.CurrentVersion || "1.0");
    const itemPublishKey = String(responseItem.fields.PublishKey || formConfig.CurrentPublishKey || "");
    const versionRow = itemFormVersion
      ? (await queryWebFormVersion(graphToken, formTitle, itemFormVersion, itemPublishKey || undefined))?.fields
      : null;
    const versionPayload = parseVersionPayload(versionRow?.SurveyJSON);

    // Parse LayerConfig
    let layerConfigParsed: { layers: Record<string, unknown>[]; manualBranches?: { name?: string; label?: string; layers?: Record<string, unknown>[] }[] } | null = null;
    const rawLayerConfig = versionPayload.layerConfig
      ? JSON.stringify(versionPayload.layerConfig)
      : formConfig.LayerConfig as string | undefined;
    if (rawLayerConfig) {
      try { layerConfigParsed = JSON.parse(rawLayerConfig); } catch { /* invalid JSON, fall through */ }
    }
    if (!layerConfigParsed?.layers) return res.status(400).json({ error: "Form has no layer config" });

    // Find the layer by number
    const searchableLayers = [
      ...(layerConfigParsed.layers ?? []),
      ...((layerConfigParsed.manualBranches ?? []).flatMap((branch) => branch.layers ?? [])),
    ];
    // A grant's layer number is signed, so it identifies the layer on its own;
    // a legacy link must still match the form-wide token stored on the layer.
    const layer = searchableLayers.find((l) =>
      l.layerNumber === layerNumber && (grant ? true : l.publicToken === token)
    ) as Record<string, unknown> | undefined;
    if (!layer) return res.status(404).json({ error: `Layer ${layerNumber} not found in config` });

    if (!grant && layer.tokenExpiresAt && new Date(layer.tokenExpiresAt as string) < new Date()) {
      return res.status(403).json({ error: "This review link has expired.", code: "expired" });
    }

    // This is the single-use rule: the link stays readable, but once a decision
    // has landed the layer is terminal and no second decision is accepted.
    const latestCurrentLayer = Number(responseItem.fields.CurrentLayer || responseItem.fields.CurrentApprovalLayer || 0);
    const latestLayerStatus = responseItem.fields[`L${layerNumber}_Status`];
    if (isTerminalFormStatus(responseItem.fields.FormStatus || responseItem.fields.Status) || isTerminalLayerStatus(latestLayerStatus)) {
      return res.status(409).json({
        error: "This layer has already been completed and cannot be submitted again.",
        code: "already-actioned",
      });
    }
    if (latestCurrentLayer && latestCurrentLayer !== layerNumber) {
      return res.status(409).json({
        error: "This evaluation link is no longer active for the current workflow layer.",
        code: "already-actioned",
      });
    }

    // Nobody signed in, so the actor is whoever the link holder says they are.
    // Declared, never verified — see `_utils/publicIdentity.ts`.
    const publicAccess = normalizePublicAccessConfig(layer.publicAccess);
    const identityResult = validateDeclaredIdentity(publicAccess, declaredIdentity, {
      actorEmails: layerActorEmails(responseItem.fields, layerNumber),
    });
    if (!identityResult.ok) {
      return res.status(400).json({
        error: "Please complete your details before submitting this decision.",
        code: "identity-required",
        fieldErrors: identityResult.errors,
      });
    }

    const selectedBranch = typeof responseItem.fields.SelectedBranch === "string" ? responseItem.fields.SelectedBranch.trim().toLowerCase() : "";
    const activeLayers = (() => {
      if (selectedBranch && layerConfigParsed?.manualBranches?.length) {
        const branch = layerConfigParsed.manualBranches.find((b) =>
          [b.name, b.label].some((candidate) => typeof candidate === "string" && candidate.trim().toLowerCase() === selectedBranch)
        );
        if (branch?.layers?.length) return branch.layers;
      }
      return layerConfigParsed?.layers ?? [];
    })();

    // 3. Build update payload based on action
    const updates: Record<string, unknown> = {};
    let notificationNextLayer: Record<string, unknown> | undefined;
    const now = new Date().toISOString();

    // Stamped on every outcome, so a rejection is as attributable as an approval.
    writeDeclaredIdentityFields(updates, layerNumber, identityResult);

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
          // Whoever the link holder declared themselves to be. "SYSTEM" only
          // remains for a layer configured not to ask.
          confirmerEmail: identityResult.email || "SYSTEM",
          confirmerName: identityResult.name || null,
          confirmedAt: now,
          status: "confirmed",
          fields: fields,
          signatureUrl: signature || null,
          ...(Object.keys(identityResult.identity).length > 0 ? { identity: identityResult.identity } : {}),
        };
        updates.EvaluationData = JSON.stringify(evalData);
      }

      // Advance to next layer or complete
      const sortedLayers = [...activeLayers].sort((a, b) => Number(a.layerNumber) - Number(b.layerNumber));
      const currentIndex = sortedLayers.findIndex((candidate) => candidate.layerNumber === layerNumber);
      const nextLayer = currentIndex >= 0 ? sortedLayers[currentIndex + 1] : sortedLayers.find((candidate) => Number(candidate.layerNumber) > layerNumber);
      notificationNextLayer = nextLayer;
      if (nextLayer) {
        updates.CurrentLayer = nextLayer.layerNumber;
        updates.CurrentApprovalLayer = nextLayer.layerNumber;
        updates.FormStatus = "In Review";
      } else {
        updates.FormStatus = "Completed";
        updates.CurrentLayer = layerNumber;
        updates.CurrentApprovalLayer = layerNumber;
      }
    } else if (action === "reject") {
      updates[`L${layerNumber}_Status`] = "Rejected";
      updates[`L${layerNumber}_SignedAt`] = now;
      if (rejection) updates[`L${layerNumber}_Rejection`] = rejection;
      updates.FormStatus = "Rejected";
      updates.Status = "Rejected";
      updates.CurrentLayer = layerNumber;
      updates.CurrentApprovalLayer = layerNumber;
      for (const futureLayer of activeLayers) {
        const n = Number(futureLayer.layerNumber);
        if (n <= layerNumber) continue;
        updates[`L${n}_Status`] = rejectedAtLayerStatus(layerNumber);
      }
    }

    // 4. Update the response item
    await writeDecision(graphToken, responseListName, responseItem.id, updates, layerNumber);

    if (notificationNextLayer) {
      const nextLayerNumber = Number(notificationNextLayer.layerNumber);
      // The next layer may fan out to several evaluators and/or a shared
      // mailbox; L{n}_Email holds only the primary actor.
      const recipients = parseValidEmailList(
        responseItem.fields[`L${nextLayerNumber}_NotifyEmails`]
        || responseItem.fields[`L${nextLayerNumber}_Email`],
      );
      const recipient = recipients.length === 1 ? recipients[0] : recipients;
      if (recipients.length > 0) {
        const appBaseUrl = getApplicationBaseUrl();
        const formSlug = String(formConfig.Slug || "").trim();
        // A public next layer gets its own grant, bound to this submission and
        // expiring on that layer's own schedule.
        const publicToken = issueLayerLinkToken(notificationNextLayer, {
          formTitle,
          responseItemId: safeResponseItemId,
          layerNumber: nextLayerNumber,
          serial: currentGrantSerial(responseItem.fields[GRANT_SERIAL_COLUMN], nextLayerNumber),
        });
        const reviewLink = buildWorkflowReviewLink({
          baseUrl: appBaseUrl,
          layerType: String(notificationNextLayer.type || ""),
          authMode: String(notificationNextLayer.authMode || ""),
          publicToken,
          formSlug,
          responseItemId: safeResponseItemId,
          layerNumber: nextLayerNumber,
        });
        try {
          const layerType = notificationNextLayer.type === "evaluation" ? "evaluation" : "approval";
          const totalLayerCount = activeLayers.length;
          const submittedBy = String(responseItem.fields.SubmittedBy || "Public respondent");
          const referenceNo = String(responseItem.fields[REFERENCE_NO_FIELD] || "");
          const manualPaper = isManualPaperLayerStatus(responseItem.fields[`L${nextLayerNumber}_Status`]);
          await scheduleOrDeliverWorkflowEmail(
            graphToken,
            manualPaper
              ? buildManualPaperWorkflowEmail({
                  formTitle,
                  submittedBy,
                  responseItemId: safeResponseItemId,
                  layer: nextLayerNumber,
                  totalLayers: totalLayerCount,
                  recipient,
                  layerType,
                  layerTitle: typeof notificationNextLayer.title === "string" ? notificationNextLayer.title : undefined,
                  surveyElements: layerSurveyElements(notificationNextLayer),
                  referenceNo,
                })
              : buildWorkflowActionEmail({
                  formTitle,
                  submittedBy,
                  responseItemId: safeResponseItemId,
                  layer: nextLayerNumber,
                  totalLayers: totalLayerCount,
                  recipient,
                  layerType,
                  reviewLink,
                  referenceNo,
                }),
            {
              listTitle: responseListName,
              responseItemId: responseItem.id,
              layer: nextLayerNumber,
            },
            notificationNextLayer.type === "evaluation"
              ? notificationNextLayer.emailSchedule as WorkflowEmailScheduleConfig | undefined
              : undefined,
            {
              layer: nextLayerNumber,
              layerType,
              totalLayers: totalLayerCount,
              reviewLink: manualPaper ? "" : reviewLink,
              submittedBy,
            },
          );
        } catch (emailError) {
          logWarn("api:evaluate", "Next workflow email delivery failed", {
            formTitle,
            responseItemId: safeResponseItemId,
            layer: nextLayerNumber,
            errorMessage: emailError instanceof Error ? emailError.message : String(emailError),
          });
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    logError("api:evaluate", "Failed to submit public evaluation action", err);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

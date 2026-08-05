/**
 * POST /api/workflow-link
 *
 * Issues the review link for one workflow layer of one submission, so the
 * signed-in browser (which has no signing secret) can resend or reissue a
 * public layer's link. Optionally revokes whatever was issued before.
 *
 * Scoped the same way as `expand-group.ts`: the caller names a form + layer +
 * submission, never a token or a target address. The server refuses unless the
 * layer really is `authMode: "public"` and the submission is currently sitting
 * on that layer, so the browser-side API key cannot be turned into a generator
 * of links for arbitrary submissions.
 */
import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import {
  ensureListColumns,
  getGraphToken,
  queryListItemById,
  queryMasterFormBySlug,
  queryWebFormVersion,
  updateListItemFields,
} from "./_utils/graphClient.js";
import { logError, logWarn } from "./_utils/logger.js";
import { buildWorkflowReviewLink } from "./_utils/workflowLink.js";
import { getApplicationBaseUrl } from "./_utils/workflowEmail.js";
import {
  bumpGrantSerial,
  currentGrantSerial,
  GRANT_SERIAL_COLUMN,
  issueLayerLinkToken,
} from "./_utils/publicGrant.js";

interface ApiRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

interface ConfigLayer {
  layerNumber?: number;
  type?: string;
  authMode?: string;
  publicToken?: string;
  publicAccess?: unknown;
}

interface ConfigShape {
  layers?: ConfigLayer[];
  manualBranches?: { name?: string; label?: string; layers?: ConfigLayer[] }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(raw: unknown): Record<string, unknown> | null {
  if (isRecord(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function allLayers(config: ConfigShape | null): ConfigLayer[] {
  return [
    ...(config?.layers ?? []),
    ...((config?.manualBranches ?? []).flatMap((branch) => branch.layers ?? [])),
  ];
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = validateApiKey(req.headers);
  if (!auth.valid) {
    res.status(401).json({ error: auth.reason || "Unauthorized" });
    return;
  }

  const body = isRecord(req.body) ? req.body : {};
  const slug = readString(body, "slug");
  const layerNumber = Number(body.layerNumber);
  const responseItemId = Number(body.responseItemId);
  const revokeExisting = body.revokeExisting === true;

  if (!slug || !Number.isInteger(layerNumber) || layerNumber < 1 || !Number.isInteger(responseItemId) || responseItemId < 1) {
    res.status(400).json({ error: "slug, responseItemId and layerNumber are required." });
    return;
  }

  try {
    const token = await getGraphToken();
    const formItem = await queryMasterFormBySlug(token, slug);
    if (!formItem) {
      res.status(404).json({ error: "Form not found." });
      return;
    }

    const formTitle = String(formItem.fields.Title || "").trim();
    const responseListName = `${formTitle} Responses`;
    const responseItem = await queryListItemById(token, responseListName, String(responseItemId));
    if (!responseItem) {
      res.status(404).json({ error: "Submission not found." });
      return;
    }

    // The version the submission was made under wins over the form's current
    // config — republishing must not change the terms of a live link.
    const itemVersion = String(responseItem.fields.FormVersion || formItem.fields.CurrentVersion || "").trim();
    const itemPublishKey = String(responseItem.fields.PublishKey || formItem.fields.CurrentPublishKey || "").trim();
    let config = parseJson(formItem.fields.LayerConfig) as ConfigShape | null;
    if (itemVersion) {
      const versionRow = (await queryWebFormVersion(token, formTitle, itemVersion, itemPublishKey || undefined))?.fields;
      const versionPayload = parseJson(versionRow?.SurveyJSON);
      const versionLayerConfig = versionPayload?.layerConfig;
      if (isRecord(versionLayerConfig)) config = versionLayerConfig as ConfigShape;
    }

    const layer = allLayers(config).find((entry) => Number(entry.layerNumber) === layerNumber) ?? null;
    if (!layer) {
      res.status(404).json({ error: "Layer not found on this form." });
      return;
    }
    if (layer.authMode !== "public") {
      res.status(400).json({ error: "This layer is not a public link layer." });
      return;
    }

    // Only the layer the submission is actually waiting on may be issued a
    // link. Without this the API key would mint links for any layer of any
    // submission, including ones already decided.
    const currentLayer = Number(responseItem.fields.CurrentLayer || responseItem.fields.CurrentApprovalLayer || 0);
    if (currentLayer && currentLayer !== layerNumber) {
      res.status(409).json({ error: "This submission is not waiting on that layer." });
      return;
    }

    let serial = currentGrantSerial(responseItem.fields[GRANT_SERIAL_COLUMN], layerNumber);
    if (revokeExisting) {
      const bumped = bumpGrantSerial(responseItem.fields[GRANT_SERIAL_COLUMN], layerNumber);
      // A list provisioned before this column exists cannot record the bump.
      // Issuing an unrevoked link beats refusing to issue one at all, so the
      // failure is a warning and the old link stays live until a republish.
      await ensureListColumns(token, responseListName, [
        { name: GRANT_SERIAL_COLUMN, displayName: GRANT_SERIAL_COLUMN, type: "note" },
      ]).catch(() => {});
      try {
        await updateListItemFields(token, responseListName, responseItem.id, {
          [GRANT_SERIAL_COLUMN]: JSON.stringify(bumped.serials),
        });
        serial = bumped.serial;
      } catch (revokeError) {
        logWarn("workflow-link", "Could not revoke the previous link; republish the form to add WorkflowGrantSerials", {
          responseListName,
          layerNumber,
          errorMessage: revokeError instanceof Error ? revokeError.message : String(revokeError),
        });
      }
    }

    const publicToken = issueLayerLinkToken(layer, {
      formTitle,
      responseItemId,
      layerNumber,
      serial,
    });
    const reviewLink = buildWorkflowReviewLink({
      baseUrl: getApplicationBaseUrl(),
      layerType: layer.type,
      authMode: layer.authMode,
      publicToken,
      formSlug: slug,
      responseItemId,
      layerNumber,
    });

    res.status(200).json({ reviewLink, revoked: revokeExisting });
  } catch (error) {
    logError("workflow-link", "Could not issue a workflow review link", error);
    res.status(500).json({ error: "Could not issue a review link for this layer." });
  }
}

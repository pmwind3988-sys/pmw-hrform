/**
 * POST /api/expand-group
 *
 * Expands the distribution list configured on one workflow layer into its
 * member addresses, so the signed-in submission path (which has no
 * client-credentials Graph token) can still resolve a `distribution-list`
 * assignee before writing the layer columns.
 *
 * The caller names a form + layer, never an arbitrary address: the server reads
 * the published `LayerConfig`, confirms that layer really is a distribution-list
 * assignee, and expands the address it finds there. That keeps this from
 * becoming a general group-membership lookup for anyone holding the client API
 * key, which ships in the browser bundle.
 *
 * `{ action: "search", query }` additionally backs the builder's recipient
 * picker. That one *is* a directory lookup, so the API key alone is not enough
 * to reach it — it also requires a Microsoft 365 bearer that resolves to a
 * signed-in tenant identity, because the API key is public and a tenant address
 * book should not be. It lives here rather than in its own file because every
 * `api/*.ts` is a deployed serverless function and the plan's ceiling is
 * already reached; see `api/_utils/deploymentLimits.test.ts`.
 */
import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken, queryMasterFormBySlug } from "./_utils/graphClient.js";
import { expandDistributionList } from "./_utils/groupMembers.js";
import { logError } from "./_utils/logger.js";
import { searchRecipients } from "./_utils/recipientSearch.js";
import { resolveSignedInViewer } from "./_utils/viewerIdentity.js";

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
  assignee?: { type?: string; value?: string };
}

interface ConfigShape {
  layers?: ConfigLayer[];
  manualBranches?: { name?: string; layers?: ConfigLayer[] }[];
}

function parseLayerConfig(raw: unknown): ConfigShape | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as ConfigShape
      : null;
  } catch {
    return null;
  }
}

function findLayer(config: ConfigShape, layerNumber: number, branch: string): ConfigLayer | null {
  const pool = branch
    ? config.manualBranches?.find((entry) => (entry.name || "").trim() === branch)?.layers ?? []
    : config.layers ?? [];
  return pool.find((layer) => Number(layer.layerNumber) === layerNumber) ?? null;
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

function bearerToken(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value || "").replace(/^Bearer\s+/i, "").trim();
}

/**
 * Answers the builder's recipient picker.
 *
 * Gated on a real signed-in Microsoft 365 identity rather than the API key on
 * its own: the key ships in the browser bundle, and enumerating the tenant
 * directory is not something a public bundle should be able to do. Portal
 * accounts are turned away too — only staff author forms.
 */
async function handleRecipientSearch(
  body: Record<string, unknown>,
  headers: Record<string, string | string[] | undefined>,
  res: ApiResponse,
): Promise<void> {
  const bearer = bearerToken(headers);
  if (!bearer) {
    res.status(401).json({ error: "Sign in to search for recipients." });
    return;
  }

  const token = await getGraphToken();
  const viewer = await resolveSignedInViewer(bearer, token);
  if (viewer?.kind !== "m365") {
    res.status(403).json({ error: "Only signed-in staff accounts can search the directory." });
    return;
  }

  res.status(200).json({ matches: await searchRecipients(token, readString(body, "query")) });
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

  const body = (req.body && typeof req.body === "object" && !Array.isArray(req.body))
    ? req.body as Record<string, unknown>
    : {};
  if (readString(body, "action") === "search") {
    try {
      await handleRecipientSearch(body, req.headers, res);
    } catch (error) {
      logError("expand-group", "Recipient search failed", error);
      res.status(500).json({ error: "Could not search for recipients." });
    }
    return;
  }

  const slug = readString(body, "slug");
  const branch = readString(body, "branch");
  const layerNumber = Number(body.layerNumber);

  if (!slug || !Number.isInteger(layerNumber) || layerNumber < 1) {
    res.status(400).json({ error: "slug and a positive integer layerNumber are required." });
    return;
  }

  try {
    const token = await getGraphToken();
    const formItem = await queryMasterFormBySlug(token, slug);
    if (!formItem) {
      res.status(404).json({ error: "Form not found." });
      return;
    }

    const config = parseLayerConfig(formItem.fields.LayerConfig);
    const layer = config ? findLayer(config, layerNumber, branch) : null;
    if (!layer) {
      res.status(404).json({ error: "Layer not found on this form." });
      return;
    }
    if (layer.assignee?.type !== "distribution-list") {
      res.status(400).json({ error: "This layer is not assigned to a distribution list." });
      return;
    }

    const address = (layer.assignee.value || "").trim();
    if (!address) {
      res.status(400).json({ error: "This layer has no distribution list address configured." });
      return;
    }

    const members = await expandDistributionList(token, address);
    res.status(200).json({ address, members });
  } catch (error) {
    logError("expand-group", "Distribution list expansion failed", error);
    res.status(500).json({ error: "Could not expand the distribution list." });
  }
}

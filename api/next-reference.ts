/**
 * next-reference.ts — `POST /api/next-reference`, the single place a submission
 * reference is handed out.
 *
 * Both submission paths call this: the signed-in browser (which writes its own
 * response item via SharePoint REST) and `submit-form.ts` (which writes guest
 * submissions server-side). Allocating in either caller instead would give two
 * concurrent submitters the same number, so the counter has exactly one door.
 *
 * The prefix and padding come from the form's stored config, never from the
 * request body — otherwise any caller holding the API key could mint references
 * in another form's namespace.
 */

import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken, queryMasterFormByTitle } from "./_utils/graphClient.js";
import { logError } from "./_utils/logger.js";
import { allocateReferenceNumber, ReferenceAllocationError } from "./_utils/referenceCounter.js";
import { parseReferenceNumberConfig } from "./_utils/referenceNumber.js";
import { checkRateLimit, clientIp } from "./_utils/rateLimit.js";

/** Per caller address. See the note at the check itself. */
const REFERENCE_RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

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

  /*
    Anyone opening a public form reaches this, so there is no identity to key
    on and the caller's address has to do. Each call permanently consumes a
    reference number, which is what makes an unlimited version worth abusing:
    a loop would run a form's numbering into the millions and leave HR's
    records renumbered around a gap nobody can explain.

    One per second sustained is far above filling in a form and far below
    anything worth doing on purpose.
  */
  const limit = checkRateLimit(`next-reference:${clientIp(req.headers)}`, REFERENCE_RATE_LIMIT);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSeconds));
    return res.status(429).json({ error: "Too many requests. Please try again shortly." });
  }

  const listTitle = typeof req.body?.listTitle === "string" ? req.body.listTitle.trim() : "";
  if (!listTitle) return res.status(400).json({ error: "Missing or invalid listTitle" });

  try {
    const token = await getGraphToken();
    const formConfig = (await queryMasterFormByTitle(token, listTitle))?.fields;
    if (!formConfig) return res.status(404).json({ error: "Form not found" });

    const config = parseReferenceNumberConfig(formConfig.ReferenceConfig);
    if (!config.enabled) return res.status(200).json({ enabled: false });

    const referenceNo = await allocateReferenceNumber({ formTitle: listTitle, config });
    return res.status(200).json({ enabled: true, referenceNo });
  } catch (err) {
    if (err instanceof ReferenceAllocationError) {
      logError("api:next-reference", "Reference allocation exhausted retries", err, { listTitle });
      return res.status(503).json({ error: "Could not allocate a reference number. Please try again." });
    }
    logError("api:next-reference", "Failed to allocate reference number", err, { listTitle });
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

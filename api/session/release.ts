/**
 * POST /api/session/release
 *
 * Releases (deactivates) a user session. Called on explicit logout or tab close.
 *
 * Body: { sessionId }
 */
import { validateAccessToken } from "../_utils/validateUserToken.ts";
import { releaseSession } from "../_utils/sessionStore.ts";

interface ApiRequest {
  headers: Record<string, string | undefined>;
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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate access token
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const validation = await validateAccessToken(token);
  if (!validation.valid || !validation.user) {
    return res.status(401).json({ error: validation.error || "Unauthorized" });
  }

  const { sessionId } = req.body as { sessionId?: string };

  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ error: "Missing or invalid sessionId" });
  }

  try {
    await releaseSession(sessionId, validation.user.oid);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[API session/release]", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
}

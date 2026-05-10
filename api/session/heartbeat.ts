/**
 * POST /api/session/heartbeat
 *
 * Updates the session's last activity timestamp. Returns 409 if the session
 * has been invalidated (taken over by another browser).
 *
 * Body: { sessionId }
 */
import { validateAccessToken } from "../_utils/validateUserToken.ts";
import { heartbeatSession } from "../_utils/sessionStore.ts";

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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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
    const result = await heartbeatSession(sessionId, validation.user.oid);

    if (!result.valid) {
      return res.status(409).json({
        error: "SESSION_INVALIDATED",
        message: "Your session was taken over by another browser or has expired.",
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[API session/heartbeat]", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
}

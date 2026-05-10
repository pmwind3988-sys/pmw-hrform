/**
 * POST /api/session/register
 *
 * Registers a new user session. If the user already has an active session,
 * returns 409 Conflict unless `force: true` is specified.
 *
 * Body: { sessionId, userObjectId, userEmail, userAgent, force? }
 */
import { validateAccessToken } from "../_utils/validateUserToken.ts";
import { registerSession } from "../_utils/sessionStore.ts";

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
  // CORS
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

  const { sessionId, force, isAdmin } = req.body as {
    sessionId?: string;
    force?: boolean;
    isAdmin?: boolean;
  };

  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ error: "Missing or invalid sessionId" });
  }

  // Use claims from the validated token
  const userObjectId = validation.user.oid;
  const userEmail = validation.user.email;
  const userAgent = req.headers["user-agent"] || "Unknown";
  const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || "Unknown";

  try {
    const result = await registerSession({
      sessionId,
      userObjectId,
      userEmail,
      userAgent,
      ipAddress,
      isAdmin: isAdmin === true,
      force: force === true,
    });

    if ("conflict" in result && result.conflict) {
      return res.status(409).json({
        error: "ACTIVE_SESSION",
        message: "You have an active session from another browser or tab.",
        existing: result.existing,
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[API session/register]", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
}

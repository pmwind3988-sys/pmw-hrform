import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken } from "./_utils/graphClient.js";
import { logError } from "./_utils/logger.js";

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

  const { to, subject, body } = req.body as Record<string, unknown>;

  const recipients = typeof to === "string"
    ? [to]
    : Array.isArray(to)
      ? to.filter((recipient): recipient is string => typeof recipient === "string")
      : [];
  const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  if (recipients.length === 0 || recipients.some((recipient) => !isEmail(recipient))) {
    return res.status(400).json({ error: "Invalid recipient email address" });
  }

  if (typeof subject !== "string" || !subject.trim() || typeof body !== "string" || !body.trim()) {
    return res.status(400).json({ error: "Missing required fields: to, subject, body" });
  }

  // Sender: use EMAIL_FROM env var, or fall back to a placeholder that will fail gracefully
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || process.env.VITE_EMAIL_FROM_ADDRESS || "";
  if (!fromAddress) {
    return res.status(500).json({
      error: "EMAIL_FROM_ADDRESS not configured. Set this env var to a mail-enabled user (e.g. admin@tenant.onmicrosoft.com). " +
        "The Azure AD app registration also needs the 'Mail.Send' application permission (granted by admin).",
    });
  }

  try {
    const token = await getGraphToken();

    const graphRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromAddress)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject,
            body: {
              contentType: "HTML",
              content: body,
            },
            toRecipients: recipients.map((r: string) => ({
              emailAddress: { address: r },
            })),
          },
          saveToSentItems: false,
        }),
      }
    );

    if (!graphRes.ok) {
      const errText = await graphRes.text();
      throw new Error(`Graph sendMail failed ${graphRes.status}: ${errText}`);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    logError("api:send-email", "Failed to send email", e);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

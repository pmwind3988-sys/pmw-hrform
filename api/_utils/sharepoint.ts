// Shared SharePoint client-credentials helpers for Vercel serverless functions

const TENANT_ID = process.env.VITE_AZURE_TENANT_ID || process.env.AZURE_TENANT_ID || "";
const CLIENT_ID = process.env.SYSTEM_CLIENT_ID || process.env.VITE_AZURE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.SYSTEM_CLIENT_SECRET || process.env.VITE_AZURE_CLIENT_SECRET || "";
export const SP_SITE_URL = (process.env.VITE_SP_SITE_URL || process.env.SP_SITE_URL || "").replace(/\/$/, "");

export async function getAccessToken(): Promise<string> {
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !SP_SITE_URL) {
    throw new Error("Missing required environment variables for SharePoint access");
  }

  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

  // SharePoint Online service principal ID — MUST use this for Sites.Selected
  const spServicePrincipal = "00000003-0000-0ff1-ce00-000000000000";

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: `${spServicePrincipal}/.default`,
    grant_type: "client_credentials",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token acquisition failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function spGet(token: string, url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SP GET ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getDigest(token: string): Promise<string> {
  const url = `${SP_SITE_URL}/_api/contextinfo`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json;odata=nometadata",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Digest ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { FormDigestValue: string };
  return data.FormDigestValue;
}

export async function spPost(
  token: string,
  url: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const digest = await getDigest(token);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
      "Content-Type": "application/json;odata=nometadata",
      "X-RequestDigest": digest,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SP POST ${res.status}: ${text}`);
  }
  return res.json();
}

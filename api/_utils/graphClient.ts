// Microsoft Graph client for serverless API (Sites.Selected compatible)
// Uses client credentials flow with Graph API scope

const TENANT_ID = process.env.VITE_AZURE_TENANT_ID || process.env.AZURE_TENANT_ID || "";
const CLIENT_ID = process.env.SYSTEM_CLIENT_ID || process.env.VITE_AZURE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.SYSTEM_CLIENT_SECRET || process.env.VITE_AZURE_CLIENT_SECRET || "";
const SP_SITE_URL = (process.env.VITE_SP_SITE_URL || process.env.SP_SITE_URL || "").replace(/\/$/, "");

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// Extract hostname and server-relative path from SP_SITE_URL
function parseSiteUrl(url: string): { hostname: string; path: string } {
  try {
    const u = new URL(url);
    return { hostname: u.hostname, path: u.pathname };
  } catch {
    throw new Error("Invalid SP_SITE_URL");
  }
}

// --- Token ---

export async function getGraphToken(): Promise<string> {
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Missing required environment variables for Graph API");
  }

  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(tokenUrl, {
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

// --- Site / List cache ---

let cachedSiteId: string | null = null;
const cachedListIds: Record<string, string> = {};

async function getSiteId(token: string): Promise<string> {
  if (cachedSiteId) return cachedSiteId;
  const { hostname, path } = parseSiteUrl(SP_SITE_URL);
  const res = await fetch(`${GRAPH_BASE}/sites/${hostname}:${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Graph GET site ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  cachedSiteId = data.id;
  return data.id;
}

async function getListId(token: string, displayName: string): Promise<string> {
  if (cachedListIds[displayName]) return cachedListIds[displayName];
  const siteId = await getSiteId(token);
  const filter = `$filter=displayName eq '${encodeURIComponent(displayName)}'`;
  const res = await fetch(`${GRAPH_BASE}/sites/${siteId}/lists?${filter}&$select=id,displayName`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Graph GET lists ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { value: Array<{ id: string; displayName: string }> };
  const list = data.value?.[0];
  if (!list) throw new Error(`List "${displayName}" not found`);
  cachedListIds[displayName] = list.id;
  return list.id;
}

// --- Low-level Graph helpers ---

export async function graphGet(token: string, path: string): Promise<unknown> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph GET ${res.status}: ${text}`);
  }
  return res.json();
}

export async function graphPost(token: string, path: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph POST ${res.status}: ${text}`);
  }
  return res.json();
}

// --- High-level helpers ---

export interface GraphListItem {
  id: string;
  fields: Record<string, unknown>;
}

export async function queryListItems(
  token: string,
  listDisplayName: string,
  options?: {
    filter?: string;
    top?: number;
    expand?: string;
  }
): Promise<GraphListItem[]> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);

  const params = new URLSearchParams();
  params.set("$select", "id");
  params.set("$expand", "fields");
  if (options?.top) params.set("$top", String(options.top));
  if (options?.filter) params.set("$filter", options.filter);

  const data = (await graphGet(token, `/sites/${siteId}/lists/${listId}/items?${params.toString()}`)) as {
    value: Array<{ id: string; fields?: Record<string, unknown> }>;
  };

  return (data.value || []).map((item) => ({
    id: item.id,
    fields: item.fields || {},
  }));
}

export async function createListItem(
  token: string,
  listDisplayName: string,
  fields: Record<string, unknown>
): Promise<{ id: string }> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);

  const data = (await graphPost(token, `/sites/${siteId}/lists/${listId}/items`, {
    fields,
  })) as { id: string };

  return data;
}

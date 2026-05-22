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
  const missing: string[] = [];
  if (!TENANT_ID) missing.push("VITE_AZURE_TENANT_ID (or AZURE_TENANT_ID)");
  if (!CLIENT_ID) missing.push("SYSTEM_CLIENT_ID (or VITE_AZURE_CLIENT_ID)");
  if (!CLIENT_SECRET) missing.push("SYSTEM_CLIENT_SECRET (or VITE_AZURE_CLIENT_SECRET)");
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for Graph API: ${missing.join(", ")}. ` +
      `If you recently updated .env.local, restart the dev server (vercel dev) to pick up changes.`
    );
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

export async function getListId(token: string, displayName: string): Promise<string> {
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
    preferNonIndexed?: boolean;
  }
): Promise<GraphListItem[]> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);

  const params = new URLSearchParams();
  params.set("$select", "id");
  params.set("$expand", "fields");
  if (options?.top) params.set("$top", String(options.top));
  if (options?.filter) params.set("$filter", options.filter);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  // Allow filtering on non-indexed columns (e.g. ApplicantEmail)
  if (options?.preferNonIndexed) {
    headers["Prefer"] = "HonorNonIndexedQueriesWarningMayFailRandomly";
  }

  const res = await fetch(
    `${GRAPH_BASE}/sites/${siteId}/lists/${listId}/items?${params.toString()}`,
    { headers },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph GET ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    value: Array<{ id: string; fields?: Record<string, unknown> }>;
  };

  return (data.value || []).map((item) => ({
    id: item.id,
    fields: item.fields || {},
  }));
}

/**
 * Fetch a single list item by its item ID (no OData filter — avoids filter-on-id issues).
 */
export async function queryListItemById(
  token: string,
  listDisplayName: string,
  itemId: string,
): Promise<GraphListItem | null> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  try {
    const data = (await graphGet(
      token,
      `/sites/${siteId}/lists/${listId}/items/${encodeURIComponent(itemId)}?$expand=fields`,
    )) as { id: string; fields?: Record<string, unknown> };
    return { id: data.id, fields: data.fields || {} };
  } catch {
    return null;
  }
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

/**
 * Add a multi-line text column to a SharePoint list via Graph API.
 */
export async function createListColumn(
  token: string,
  listDisplayName: string,
  columnName: string,
  displayName: string,
): Promise<void> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  await graphPost(token, `/sites/${siteId}/lists/${listId}/columns`, {
    name: columnName,
    text: { multiline: true, allowUnlimitedLength: true },
    displayName,
  });
}

/**
 * Get all columns of a SharePoint list via Graph API.
 * Returns name and displayName for each column.
 */
export async function getListColumns(
  token: string,
  listDisplayName: string,
): Promise<Array<{ name: string; displayName: string }>> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  const data = (await graphGet(
    token,
    `/sites/${siteId}/lists/${listId}/columns?$select=name,displayName`,
  )) as { value: Array<{ name: string; displayName: string }> };
  return data.value || [];
}

/**
 * Ensure a column exists on a SharePoint list, creating it if missing.
 * Supports text, number, note (multiline), hyperlink, and dateTime types.
 * Efficiently checks existence first — no-op if column already exists.
 */
export async function ensureListColumn(
  token: string,
  listDisplayName: string,
  columnName: string,
  displayName: string,
  columnType: "text" | "number" | "note" | "hyperlink" | "dateTime",
): Promise<boolean> {
  const existing = await getListColumns(token, listDisplayName);
  if (existing.some((c) => c.name === columnName || c.displayName === displayName)) {
    return false; // Already exists — nothing done
  }
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  let columnBody: Record<string, unknown>;
  switch (columnType) {
    case "note":
      columnBody = { text: { multiline: true, allowUnlimitedLength: true } };
      break;
    case "number":
      columnBody = { number: {} };
      break;
    case "hyperlink":
      columnBody = { hyperlinkOrPicture: {} };
      break;
    case "dateTime":
      columnBody = { dateTime: { format: "dateTime" } };
      break;
    case "text":
    default:
      columnBody = { text: {} };
      break;
  }
  await graphPost(token, `/sites/${siteId}/lists/${listId}/columns`, {
    name: columnName,
    displayName,
    ...columnBody,
  });
  return true; // Created
}

// --- SharePoint field/choice helpers (for server-side survey JSON enrichment) ---

/**
 * Fetch choices from a Choice/MultiChoice column definition via Graph API.
 */
export async function getListColumnChoices(
  token: string,
  listDisplayName: string,
  columnName: string
): Promise<string[]> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  // Fetch ALL columns and find by displayName — $filter on displayName is unreliable
  const data = (await graphGet(
    token,
    `/sites/${siteId}/lists/${listId}/columns`
  )) as {
    value: Array<{
      name: string;
      displayName: string;
      choice?: { choices: string[] };
      multiChoice?: { choices: string[] };
    }>;
  };
  const col = data.value?.find((c) => c.displayName === columnName);
  if (!col) return [];
  return col.choice?.choices || col.multiChoice?.choices || [];
}

/**
 * Resolve a column's internal name from its display name via Graph API.
 */
async function resolveColumnName(
  token: string,
  listDisplayName: string,
  displayName: string
): Promise<string> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  try {
    // Fetch ALL columns and find by displayName — $filter on displayName is unreliable
    const data = (await graphGet(
      token,
      `/sites/${siteId}/lists/${listId}/columns?$select=name,displayName`
    )) as { value: Array<{ name: string; displayName: string }> };
    const col = data.value?.find((c) => c.displayName === displayName);
    return col?.name || displayName;
  } catch {
    return displayName; // fallback — use as-is
  }
}

/**
 * Fetch distinct values from a list column items via Graph API.
 * Equivalent to the client-side `getFilteredListChoices`.
 */
export async function getListColumnValues(
  token: string,
  listDisplayName: string,
  valueColumn: string,
  filterColumn?: string,
  filterValue?: string
): Promise<string[]> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);

  // Resolve display names → internal names for Graph API
  const internalValueCol = await resolveColumnName(token, listDisplayName, valueColumn);
  const internalFilterCol = filterColumn
    ? await resolveColumnName(token, listDisplayName, filterColumn)
    : undefined;

  const expand = encodeURIComponent(`fields($select=${internalValueCol})`);
  let filter = "";
  if (internalFilterCol && filterValue) {
    // Sanitize filter value — strip characters that could break Graph $filter syntax
    const safeValue = String(filterValue).replace(/[^\w\s\-_.,@]/g, "");
    filter = `&$filter=fields/${encodeURIComponent(internalFilterCol)} eq '${encodeURIComponent(safeValue)}'`;
  }
  const data = (await graphGet(
    token,
    `/sites/${siteId}/lists/${listId}/items?$expand=${expand}&$top=5000${filter}`
  )) as { value: Array<{ fields?: Record<string, unknown> }> };

  const values = new Set<string>();
  for (const item of data.value || []) {
    const v = item.fields?.[internalValueCol];
    if (v != null && v !== "") values.add(String(v));
  }
  return Array.from(values).sort();
}

export async function updateListItemFields(
  token: string,
  listDisplayName: string,
  itemId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  const res = await fetch(`${GRAPH_BASE}/sites/${siteId}/lists/${listId}/items/${encodeURIComponent(itemId)}/fields`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph PATCH fields ${res.status}: ${text}`);
  }
}

export async function deleteListItem(
  token: string,
  listDisplayName: string,
  itemId: string
): Promise<void> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  const res = await fetch(`${GRAPH_BASE}/sites/${siteId}/lists/${listId}/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Graph DELETE item ${res.status}: ${text}`);
  }
}

// ── Document Library & File Upload Helpers (server-side) ────────────────

/**
 * Creates a document library via Graph API.
 * Returns the list id of the newly created library.
 */
export async function createDocLibrary(
  token: string,
  displayName: string,
): Promise<string> {
  const siteId = await getSiteId(token);
  const data = (await graphPost(token, `/sites/${siteId}/lists`, {
    displayName,
    columns: [],
    list: { template: "documentLibrary" },
  })) as { id: string };
  return data.id;
}

/**
 * Uploads binary content to a SharePoint document library via Graph API drive endpoint.
 * Returns the web URL of the uploaded file.
 */
export async function uploadFileToDrive(
  token: string,
  listDisplayName: string,
  fileName: string,
  content: Uint8Array,
): Promise<string> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  const encodedName = encodeURIComponent(fileName);

  const res = await fetch(
    `${GRAPH_BASE}/sites/${siteId}/lists/${listId}/drive/root:/${encodedName}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: content as Uint8Array,
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph PUT file ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { webUrl?: string; "@microsoft.graph.downloadUrl"?: string };
  return data.webUrl || data["@microsoft.graph.downloadUrl"] || "";
}

/**
 * Update a single list item via Graph API (PATCH to the item resource, not /fields).
 * Some column types (URL/hyperlink) may behave differently on this endpoint.
 */
export async function updateListItem(
  token: string,
  listDisplayName: string,
  itemId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  const res = await fetch(`${GRAPH_BASE}/sites/${siteId}/lists/${listId}/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph PATCH item ${res.status}: ${text}`);
  }
}

/**
 * Lists all files (drive items) in a document library via Graph API.
 */
export async function listDocLibraryFiles(
  token: string,
  listDisplayName: string,
): Promise<Array<{ id: string; name: string; webUrl: string }>> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  try {
    const data = (await graphGet(
      token,
      `/sites/${siteId}/lists/${listId}/drive/root/children?$select=id,name,webUrl`,
    )) as { value: Array<{ id: string; name: string; webUrl: string }> };
    return data.value || [];
  } catch {
    return [];
  }
}

/**
 * Checks whether a SharePoint list exists via Graph API.
 */
export async function listExistsGraph(
  token: string,
  displayName: string,
): Promise<boolean> {
  try {
    await getListId(token, displayName);
    return true;
  } catch {
    return false;
  }
}

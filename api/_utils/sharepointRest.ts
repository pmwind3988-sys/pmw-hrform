const SP_SITE_URL = (process.env.VITE_SP_SITE_URL || process.env.SP_SITE_URL || "").replace(/\/$/, "");

function requireSpSiteUrl(): string {
  if (!SP_SITE_URL) throw new Error("SP_SITE_URL env var not set.");
  return SP_SITE_URL;
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function spListEndpoint(listName: string): string {
  return `/_api/web/lists/getbytitle('${encodeURIComponent(escapeODataString(listName))}')`;
}

async function readJsonOrThrow<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${label} ${res.status}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

async function getSpDigest(token: string): Promise<string> {
  const res = await fetch(`${requireSpSiteUrl()}/_api/contextinfo`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
    },
  });
  const data = await readJsonOrThrow<{ FormDigestValue?: string }>(res, "SP REST contextinfo");
  if (!data.FormDigestValue) throw new Error("SharePoint did not return a FormDigestValue.");
  return data.FormDigestValue;
}

async function getOptionalSpDigest(token: string): Promise<string | null> {
  try {
    return await getSpDigest(token);
  } catch {
    return null;
  }
}

function mergeHeaders(token: string, digest: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json;odata=nometadata",
    "Content-Type": "application/json;odata=verbose",
    "X-HTTP-Method": "MERGE",
    "IF-MATCH": "*",
  };
  if (digest) headers["X-RequestDigest"] = digest;
  return headers;
}

async function spGet<T>(token: string, path: string, label: string): Promise<T> {
  const res = await fetch(`${requireSpSiteUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
    },
  });
  return readJsonOrThrow<T>(res, label);
}

async function getListEntityType(token: string, listName: string): Promise<string> {
  const data = await spGet<{ ListItemEntityTypeFullName?: string }>(
    token,
    `${spListEndpoint(listName)}?$select=ListItemEntityTypeFullName`,
    `SP REST list metadata ${listName}`,
  );
  if (!data.ListItemEntityTypeFullName) {
    throw new Error(`Could not resolve SharePoint entity type for "${listName}".`);
  }
  return data.ListItemEntityTypeFullName;
}

export async function patchHyperlinkViaSPRest(
  token: string,
  listName: string,
  numericItemId: string,
  fieldName: string,
  url: string,
  description = "",
): Promise<void> {
  const digest = await getOptionalSpDigest(token);
  const entityType = await getListEntityType(token, listName);
  const res = await fetch(`${requireSpSiteUrl()}${spListEndpoint(listName)}/items(${numericItemId})`, {
    method: "POST",
    headers: mergeHeaders(token, digest),
    body: JSON.stringify({
      __metadata: { type: entityType },
      [fieldName]: {
        __metadata: { type: "SP.FieldUrlValue" },
        Url: url,
        Description: description || url,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SP REST FieldUrlValue update ${res.status}: ${text.slice(0, 300)}`);
  }
}

export async function updateListItemViaSPRest(
  token: string,
  listName: string,
  itemId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const digest = await getOptionalSpDigest(token);
  const entityType = await getListEntityType(token, listName);
  const res = await fetch(`${requireSpSiteUrl()}${spListEndpoint(listName)}/items(${itemId})`, {
    method: "POST",
    headers: mergeHeaders(token, digest),
    body: JSON.stringify({ __metadata: { type: entityType }, ...fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SP REST update item ${res.status}: ${text.slice(0, 300)}`);
  }
}

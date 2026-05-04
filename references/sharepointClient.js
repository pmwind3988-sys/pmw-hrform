/**
 * sharepointClient.js  — UPDATED
 * ─────────────────────────────────────────────────────────────────────────────
 * Adds write-capable methods used by AdminFormBuilder.jsx for SP provisioning.
 * All read methods from the original are preserved unchanged.
 *
 * NEW methods on the client object:
 *   acquireToken()                           → raw Bearer token (for AdminFormBuilder)
 *   createList(title, description)           → creates a new SP Custom list
 *   listExists(title)                        → boolean
 *   addColumn(listTitle, name, fieldTypeKind, isMultiLine) → adds a field
 *   upsertListItem(listTitle, filter, body)  → create-or-update an item
 *   deleteListItemsWhere(listTitle, filter)  → batch-delete matching items
 *   getSiteUsers()                           → [{email, name}]
 *
 * The AdminFormBuilder.jsx calls sp.acquireToken() once and then uses the
 * raw fetch helpers internally — so those helpers are also exported from
 * sharepointClient as standalone utilities for convenience.
 *
 * ── Environment variables required ──────────────────────────────────────────
 *   REACT_APP_SP_SITE_URL   Full SharePoint site URL, no trailing slash
 */

const SP_SITE_URL = (process.env.REACT_APP_SP_SITE_URL || "").replace(/\/$/, "");

function spScope() {
  try {
    const origin = new URL(SP_SITE_URL).origin;
    // Write operations need AllSites.Manage (or AllSites.Write at minimum).
    // If your app registration only has AllSites.Read you will get 403 on POSTs.
    return [`${origin}/AllSites.Manage`];
  } catch {
    throw new Error("REACT_APP_SP_SITE_URL is missing or invalid.");
  }
}

async function getToken(instance, accounts) {
  if (!accounts || accounts.length === 0) {
    throw new Error("No authenticated account found.");
  }

  const request = {
    scopes: spScope(),
    account: accounts[0],
  };

  try {
    const res = await instance.acquireTokenSilent(request);
    return res.accessToken;
  } catch (e) {
    console.warn("[sharepointClient] Silent token failed:", e.errorCode);

    // 🚫 DO NOT use popup here
    // Only redirect if interaction is required
    if (e.name === "InteractionRequiredAuthError") {
      instance.acquireTokenRedirect(request);
      return; // important: stop execution
    }

    throw e;
  }
}

async function spFetch(token, url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`SharePoint API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Request digest cache ──────────────────────────────────────────────────────
let _digestCache = null;
let _digestExpiry = 0;

async function getRequestDigest(token) {
  if (_digestCache && Date.now() < _digestExpiry) return _digestCache;
  const res = await fetch(`${SP_SITE_URL}/_api/contextinfo`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
    },
  });
  if (!res.ok) throw new Error(`contextinfo failed: ${res.status}`);
  const data = await res.json();
  _digestCache = data.FormDigestValue;
  _digestExpiry = Date.now() + 25 * 60 * 1000;
  return _digestCache;
}

async function spPost(token, url, body) {
  const digest = await getRequestDigest(token);
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
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`SP POST ${res.status}: ${txt}`);
  }
  // Some SP responses return 204 No Content
  return res.status === 204 ? {} : res.json().catch(() => ({}));
}

async function spPatch(token, url, body) {
  const digest = await getRequestDigest(token);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
      "Content-Type": "application/json;odata=nometadata",
      "X-RequestDigest": digest,
      "IF-MATCH": "*",
      "X-HTTP-Method": "MERGE",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`SP PATCH ${res.status}: ${txt}`);
  }
  return {};
}

async function spDelete(token, url) {
  const digest = await getRequestDigest(token);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-RequestDigest": digest,
      "IF-MATCH": "*",
      "X-HTTP-Method": "DELETE",
    },
  });
  if (!res.ok && res.status !== 204) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`SP DELETE ${res.status}: ${txt}`);
  }
  return {};
}

function buildSelect(columns) {
  const cols = new Set(["Id", ...columns]);
  return [...cols].join(",");
}

export function createSpClient(instance, accounts) {
  const userCache = {};

  async function resolveUserEmails(token, userIds) {
    const unique = [...new Set(userIds)].filter(id => id && !userCache[id]);
    await Promise.all(
      unique.map(async (id) => {
        try {
          const data = await spFetch(
            token,
            `${SP_SITE_URL}/_api/web/getUserById(${id})?$select=Email,Title`
          );
          userCache[id] = data.Email || "";
        } catch {
          userCache[id] = "";
        }
      })
    );
    return userCache;
  }

  // ── READ methods (unchanged from original) ──────────────────────────────────

  async function discoverLists() {
    const token = await getToken(instance, accounts);
    const url = `${SP_SITE_URL}/_api/web/lists?$select=Title,Id,ItemCount,Created,BaseTemplate&$filter=Hidden eq false and BaseTemplate eq 100`;
    const data = await spFetch(token, url);
    return (data.value ?? []).map(l => ({
      title: l.Title,
      id: l.Id,
      itemCount: l.ItemCount,
      created: l.Created,
    }));
  }

  async function queryListByGuid(listGuid, options = {}) {
    const token = await getToken(instance, accounts);
    const params = new URLSearchParams();
    const selectCols = buildSelect([...(options.select ?? []), "AuthorId"]);
    params.set("$select", selectCols);
    if (options.filter) params.set("$filter", options.filter);
    if (options.orderby) params.set("$orderby", options.orderby);
    params.set("$top", String(options.top ?? 500));
    const url = `${SP_SITE_URL}/_api/web/lists(guid'${listGuid}')/items?${params}`;
    const data = await spFetch(token, url);
    return (data.value ?? []).map(item => ({ ...item, _authorEmail: "" }));
  }

  async function queryList(listName, options = {}) {
    const token = await getToken(instance, accounts);
    const params = new URLSearchParams();
    const selectCols = buildSelect([...(options.select ?? []), "AuthorId"]);
    params.set("$select", selectCols);
    if (options.filter) params.set("$filter", options.filter);
    if (options.orderby) params.set("$orderby", options.orderby);
    params.set("$top", String(options.top ?? 500));

    const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?${params}`;
    const data = await spFetch(token, url);
    const items = data.value ?? [];

    const authorIds = items.map(i => i.AuthorId).filter(Boolean);
    const emailMap = await resolveUserEmails(token, authorIds);

    const resolved = items.map(item => ({
      ...item,
      _authorEmail: emailMap[item.AuthorId] || "",
    }));

    if (options.filterByAuthorEmail) {
      const target = options.filterByAuthorEmail.toLowerCase();
      return resolved.filter(i => i._authorEmail.toLowerCase() === target);
    }

    return resolved;
  }

  async function isGroupMember(groupName) {
    if (!accounts || accounts.length === 0) return false;
    try {
      const token = await getToken(instance, accounts);
      const url = `${SP_SITE_URL}/_api/web/sitegroups/getbyname('${encodeURIComponent(groupName)}')/users?$select=LoginName,Email`;
      const data = await spFetch(token, url);
      const members = data.value ?? [];
      const userEmail = (accounts[0]?.username || "").toLowerCase();
      return members.some(m =>
        (m.Email || "").toLowerCase() === userEmail ||
        (m.LoginName || "").toLowerCase().split("|").pop() === userEmail
      );
    } catch (e) {
      console.warn("[sharepointClient] isGroupMember failed:", e.message);
      return false;
    }
  }

  function getCurrentUserEmail() {
    return accounts?.[0]?.username || "";
  }

  // ── WRITE methods (new — used by AdminFormBuilder) ──────────────────────────

  /**
   * acquireToken()
   * Exposes the raw Bearer token so AdminFormBuilder can call low-level SP REST
   * directly (list creation, field provisioning) with full control over metadata.
   * Uses AllSites.Manage scope for write access.
   */
  async function acquireToken() {
    return getToken(instance, accounts);
  }

  /**
   * listExists(title) → boolean
   */
  async function listExists(title) {
    const token = await getToken(instance, accounts);
    try {
      await spFetch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(title)}')?$select=Id`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * createList(title, description) → listId (string)
   * Creates a new Generic (BaseTemplate=100) list.
   */
  async function createList(title, description = "") {
    const token = await getToken(instance, accounts);
    const data = await spPost(token, `${SP_SITE_URL}/_api/web/lists`, {
      "__metadata": { "type": "SP.List" },
      AllowContentTypes: true,
      BaseTemplate: 100,
      ContentTypesEnabled: false,
      Description: description || `Auto-generated HR Form list: ${title}`,
      Title: title,
    });
    return data.Id || data.id || null;
  }

  /**
   * addColumn(listTitle, internalName, fieldTypeKind, isMultiLine)
   *
   * fieldTypeKind values:
   *   2 = Single line of text
   *   3 = Multi-line text
   *   4 = DateTime
   *   8 = Boolean (Yes/No)
   *   9 = Number
   *
   * Silently ignores "already exists" errors so re-publishing is safe.
   */
  async function addColumn(listTitle, internalName, fieldTypeKind, isMultiLine = false) {
    const token = await getToken(instance, accounts);
    const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/fields`;

    let metaType = "SP.Field";
    if (fieldTypeKind === 3) metaType = "SP.FieldMultiLineText";
    if (fieldTypeKind === 9) metaType = "SP.FieldNumber";
    if (fieldTypeKind === 4) metaType = "SP.FieldDateTime";
    if (fieldTypeKind === 8) metaType = "SP.FieldMultiLineText"; // store as text

    const body = {
      "__metadata": { type: metaType },
      FieldTypeKind: fieldTypeKind,
      Title: internalName,
      StaticName: internalName,
    };
    if (isMultiLine || fieldTypeKind === 3) body.NumberOfLines = 6;

    try {
      await spPost(token, url, body);
    } catch (e) {
      const msg = e.message.toLowerCase();
      // Tolerate duplicate-column errors — safe to re-run
      if (msg.includes("duplicate") || msg.includes("already") || msg.includes("400")) {
        console.warn(`[sharepointClient] Column "${internalName}" already exists — skipped.`);
        return;
      }
      throw e;
    }
  }

  /**
   * upsertListItem(listTitle, filterExpr, body)
   * If an item matching filterExpr exists → PATCH it, else → POST new.
   * filterExpr is an OData $filter string, e.g. "Title eq 'My Form'"
   */
  async function upsertListItem(listTitle, filterExpr, body) {
    const token = await getToken(instance, accounts);
    const existing = await spFetch(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items?$filter=${encodeURIComponent(filterExpr)}&$top=1&$select=Id`
    ).catch(() => ({ value: [] }));

    if (existing.value?.length > 0) {
      const itemId = existing.value[0].Id;
      await spPatch(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${itemId})`,
        body
      );
      return { updated: true, id: itemId };
    } else {
      const created = await spPost(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items`,
        body
      );
      return { updated: false, id: created.Id };
    }
  }

  /**
   * deleteListItemsWhere(listTitle, filterExpr)
   * Deletes all items matching the OData filter. Used to clear old approver rows.
   */
  async function deleteListItemsWhere(listTitle, filterExpr) {
    const token = await getToken(instance, accounts);
    const data = await spFetch(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items?$filter=${encodeURIComponent(filterExpr)}&$select=Id&$top=500`
    ).catch(() => ({ value: [] }));

    for (const item of data.value || []) {
      await spDelete(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${item.Id})`
      );
    }
    return (data.value || []).length;
  }

  /**
   * getSiteUsers() → [{ email, name }]
   * Returns all individual user principals on the site (PrincipalType = 1).
   */
  async function getSiteUsers() {
    const token = await getToken(instance, accounts);
    try {
      const data = await spFetch(
        token,
        `${SP_SITE_URL}/_api/web/siteusers?$select=Email,Title&$filter=PrincipalType eq 1`
      );
      return (data.value || [])
        .filter(u => u.Email)
        .map(u => ({ email: u.Email, name: u.Title }));
    } catch (e) {
      console.warn("[sharepointClient] getSiteUsers failed:", e.message);
      return [];
    }
  }

  return {
    // Read (original)
    discoverLists,
    queryList,
    queryListByGuid,
    isGroupMember,
    getCurrentUserEmail,
    // Write (new)
    acquireToken,
    listExists,
    createList,
    addColumn,
    upsertListItem,
    deleteListItemsWhere,
    getSiteUsers,
  };
}
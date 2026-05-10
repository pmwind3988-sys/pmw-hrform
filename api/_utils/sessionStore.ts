/**
 * sessionStore.ts — CRUD for Session Log SharePoint list
 *
 * Wraps Graph API calls to manage session records in a SharePoint list
 * named "Session Log". The list is auto-created on first use if missing.
 */

import { getGraphToken, queryListItems, createListItem, updateListItemFields, graphPost } from "./graphClient.ts";

const LIST_NAME = "Session Log";

export interface SessionRecord {
  sessionId: string;
  userEmail: string;
  userObjectId: string;
  startedAt: string;
  lastActivityAt: string;
  userAgent: string;
  ipAddress: string;
  isActive: boolean;
  isAdmin?: boolean;
}

// ── Ensure the Session Log list exists ─────────────────────────────────

async function ensureSessionList(token: string): Promise<void> {
  try {
    await queryListItems(token, LIST_NAME, { top: 1 });
  } catch {
    // List doesn't exist — create it via Graph API
    // First get the site ID
    const TENANT_ID = process.env.VITE_AZURE_TENANT_ID || process.env.AZURE_TENANT_ID || "";
    const CLIENT_ID = process.env.SYSTEM_CLIENT_ID || process.env.VITE_AZURE_CLIENT_ID || "";
    const CLIENT_SECRET = process.env.SYSTEM_CLIENT_SECRET || process.env.VITE_AZURE_CLIENT_SECRET || "";
    const SP_SITE_URL = (process.env.VITE_SP_SITE_URL || process.env.SP_SITE_URL || "").replace(/\/$/, "");

    // Get site ID using the same pattern as graphClient
    const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const tokenData = (await tokenRes.json()) as { access_token: string };

    const u = new URL(SP_SITE_URL);
    const siteRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${u.hostname}:${u.pathname}`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!siteRes.ok) return; // Can't create list, fail gracefully
    const siteData = (await siteRes.json()) as { id: string };

    // Create the list
    await graphPost(tokenData.access_token, `/sites/${siteData.id}/lists`, {
      displayName: LIST_NAME,
      description: "Tracks active user sessions for single-session enforcement",
      columns: [
        { name: "UserEmail", text: { } },
        { name: "UserObjectId", text: { } },
        { name: "SessionId", text: { } },
        { name: "StartedAt", dateTime: { format: "dateTime" } },
        { name: "LastActivityAt", dateTime: { format: "dateTime" } },
        { name: "UserAgent", text: { } },
        { name: "IPAddress", text: { } },
        { name: "IsActive", choice: { choices: ["Yes", "No"] } },
        { name: "TakenOverBy", text: { } },
        { name: "IsAdmin", choice: { choices: ["Yes", "No"] } },
      ],
    });
  }
}

// ── Query helpers ──────────────────────────────────────────────────────

function rowToSession(fields: Record<string, unknown>): SessionRecord {
  return {
    sessionId: String(fields.SessionId || ""),
    userEmail: String(fields.UserEmail || ""),
    userObjectId: String(fields.UserObjectId || ""),
    startedAt: String(fields.StartedAt || ""),
    lastActivityAt: String(fields.LastActivityAt || ""),
    userAgent: String(fields.UserAgent || ""),
    ipAddress: String(fields.IPAddress || ""),
    isActive: fields.IsActive === "Yes",
  };
}

// ── Public API ─────────────────────────────────────────────────────────

const SESSION_STALE_MS = 15 * 60 * 1000; // 15 min without heartbeat = stale

/**
 * Register a new session. Returns existing active session info if conflict.
 */
export async function registerSession(params: {
  sessionId: string;
  userObjectId: string;
  userEmail: string;
  userAgent: string;
  ipAddress: string;
  isAdmin?: boolean;
  force?: boolean;
}): Promise<{ success: true } | { conflict: true; existing: { startedAt: string; userAgent: string } }> {
  const token = await getGraphToken();
  await ensureSessionList(token);

  // Find any active session for this user
  const existing = await queryListItems(token, LIST_NAME, {
    filter: `fields/UserObjectId eq '${params.userObjectId}' and fields/IsActive eq 'Yes'`,
    top: 5,
  });

  // Filter out stale sessions client-side (SP filtering limitations)
  const now = Date.now();
  const activeSessions = existing.filter((item) => {
    const lastActivity = item.fields.LastActivityAt
      ? new Date(String(item.fields.LastActivityAt)).getTime()
      : now;
    return now - lastActivity < SESSION_STALE_MS;
  });

  if (activeSessions.length > 0 && !params.force) {
    // Return conflict with existing session info
    const existingRecord = activeSessions[0].fields;
    return {
      conflict: true,
      existing: {
        startedAt: String(existingRecord.StartedAt || ""),
        userAgent: String(existingRecord.UserAgent || ""),
      },
    };
  }

  // Invalidate old sessions (either force=true or stale)
  for (const item of activeSessions) {
    await updateListItemFields(token, LIST_NAME, item.id, { IsActive: "No", TakenOverBy: params.sessionId });
  }

  // Check if a session with this sessionId already exists (update it)
  const existingById = await queryListItems(token, LIST_NAME, {
    filter: `fields/SessionId eq '${params.sessionId}'`,
    top: 1,
  });

  const timestamp = new Date().toISOString();

  if (existingById.length > 0) {
    await updateListItemFields(token, LIST_NAME, existingById[0].id, {
      UserEmail: params.userEmail,
      UserObjectId: params.userObjectId,
      StartedAt: timestamp,
      LastActivityAt: timestamp,
      UserAgent: params.userAgent,
      IPAddress: params.ipAddress,
      IsActive: "Yes",
      IsAdmin: params.isAdmin ? "Yes" : "No",
      TakenOverBy: "",
    });
  } else {
    await createListItem(token, LIST_NAME, {
      Title: `Session-${params.sessionId.slice(0, 8)}`,
      SessionId: params.sessionId,
      UserEmail: params.userEmail,
      UserObjectId: params.userObjectId,
      StartedAt: timestamp,
      LastActivityAt: timestamp,
      UserAgent: params.userAgent,
      IPAddress: params.ipAddress,
      IsActive: "Yes",
      IsAdmin: params.isAdmin ? "Yes" : "No",
    });
  }

  return { success: true };
}

/**
 * Release (deactivate) a session.
 */
export async function releaseSession(sessionId: string, userObjectId: string): Promise<void> {
  const token = await getGraphToken();

  const items = await queryListItems(token, LIST_NAME, {
    filter: `fields/SessionId eq '${sessionId}'`,
    top: 1,
  });

  if (items.length > 0) {
    await updateListItemFields(token, LIST_NAME, items[0].id, {
      IsActive: "No",
      LastActivityAt: new Date().toISOString(),
    });
  }
}

/**
 * Heartbeat — update last activity time. Returns false if session was invalidated.
 */
export async function heartbeatSession(
  sessionId: string,
  userObjectId: string
): Promise<{ valid: boolean }> {
  const token = await getGraphToken();

  const items = await queryListItems(token, LIST_NAME, {
    filter: `fields/SessionId eq '${sessionId}'`,
    top: 1,
  });

  if (items.length === 0) {
    return { valid: false };
  }

  const fields = items[0].fields;
  if (fields.IsActive !== "Yes") {
    return { valid: false };
  }

  await updateListItemFields(token, LIST_NAME, items[0].id, {
    LastActivityAt: new Date().toISOString(),
  });

  return { valid: true };
}

/**
 * Get all active sessions (admin only).
 */
export async function getActiveSessions(): Promise<SessionRecord[]> {
  const token = await getGraphToken();
  await ensureSessionList(token);

  const items = await queryListItems(token, LIST_NAME, {
    filter: "fields/IsActive eq 'Yes'",
    top: 500,
  });

  return items.map((i) => rowToSession(i.fields));
}

/**
 * Get session history (last 100 entries, for admin monitoring).
 */
export async function getSessionHistory(limit = 100): Promise<SessionRecord[]> {
  const token = await getGraphToken();
  await ensureSessionList(token);

  const items = await queryListItems(token, LIST_NAME, { top: limit });

  return items.map((i) => rowToSession(i.fields));
}

/**
 * Admin force-invalidate a session by sessionId.
 */
export async function forceInvalidateSession(sessionId: string): Promise<void> {
  const token = await getGraphToken();

  const items = await queryListItems(token, LIST_NAME, {
    filter: `fields/SessionId eq '${sessionId}'`,
    top: 1,
  });

  if (items.length > 0) {
    await updateListItemFields(token, LIST_NAME, items[0].id, {
      IsActive: "No",
      LastActivityAt: new Date().toISOString(),
    });
  }
}

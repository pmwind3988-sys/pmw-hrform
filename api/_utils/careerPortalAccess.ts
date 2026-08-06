import { createListItem, queryListItems, updateListItemFields } from "./graphClient.js";
import { logWarn } from "./logger.js";
import { ensureAdminPanelSettingsList } from "./provisioning.js";
import { ensureTextFieldViaSPRest } from "./sharepointRest.js";

const SP_SITE_URL = (process.env.VITE_SP_SITE_URL || process.env.SP_SITE_URL || "").replace(/\/$/, "");
const SETTINGS_LIST = "AdminPanelSettings";
const SETTING_TITLE = "career-portal-access";
const SETTING_VALUE_COLUMN = "SettingValue";

export interface CareerPortalAccessSetting {
  /** true = anyone can browse and apply; false = signed-in tenant accounts only. */
  isPublic: boolean;
  updatedBy?: string;
  updatedAt?: string;
}

/**
 * The portal was open to everyone before this setting existed, so a site whose
 * `AdminPanelSettings` list has no `career-portal-access` item — or no list at
 * all — must keep behaving exactly as it did.
 */
export const DEFAULT_CAREER_PORTAL_ACCESS: CareerPortalAccessSetting = { isPublic: true };

interface SharePointUser {
  Email?: string;
  LoginName?: string;
  UserPrincipalName?: string;
}

/**
 * Reads the stored `SettingValue`. Anything unrecognised — including a blank
 * cell left behind by a half-written item — means public, so the portal never
 * closes itself on a value nobody chose.
 */
export function parseCareerPortalAccessValue(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return DEFAULT_CAREER_PORTAL_ACCESS.isPublic;
  return normalized !== "internal" && normalized !== "false" && normalized !== "private";
}

export function careerPortalAccessValue(isPublic: boolean): string {
  return isPublic ? "public" : "internal";
}

async function findSettingItem(token: string): Promise<{ id: string; fields: Record<string, unknown> } | null> {
  const items = await queryListItems(token, SETTINGS_LIST, { top: 50 });
  return items.find((item) => String(item.fields.Title || "") === SETTING_TITLE) ?? null;
}

/**
 * Never throws. An unreadable settings list falls back to public, matching the
 * portal's behaviour before this setting existed: the alternative is a careers
 * site that goes dark whenever the settings list is missing or Graph is having
 * a bad minute, and the job data those calls fetch is unavailable then anyway.
 */
export async function readCareerPortalAccess(token: string): Promise<CareerPortalAccessSetting> {
  let item: { id: string; fields: Record<string, unknown> } | null;
  try {
    item = await findSettingItem(token);
  } catch (error) {
    logWarn("api:career-portal-access", "Using default career portal access", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return DEFAULT_CAREER_PORTAL_ACCESS;
  }

  if (!item) return DEFAULT_CAREER_PORTAL_ACCESS;

  return {
    isPublic: parseCareerPortalAccessValue(item.fields.SettingValue),
    updatedBy: item.fields.UpdatedBy ? String(item.fields.UpdatedBy) : undefined,
    updatedAt: item.fields.UpdatedAt ? String(item.fields.UpdatedAt) : undefined,
  };
}

/**
 * Makes sure the settings list and its `SettingValue` column exist before a
 * write. Split across two identities on purpose: the app-only Graph principal
 * can create the list and write items but is denied column creation (Graph
 * answers 403 accessDenied on POST .../columns), so the column is added with
 * the signed-in admin's own SharePoint token, which does have Manage rights.
 */
export async function ensureCareerPortalAccessSchema(
  graphToken: string,
  delegatedToken: string,
): Promise<void> {
  try {
    await ensureAdminPanelSettingsList(graphToken, SETTINGS_LIST);
  } catch (error) {
    // Expected whenever a column is missing — the delegated step below is the
    // one that has to succeed, and it reports a missing list clearly enough.
    logWarn("api:career-portal-access", "App-only settings list ensure failed; continuing with delegated provisioning", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  await ensureTextFieldViaSPRest(delegatedToken, SETTINGS_LIST, SETTING_VALUE_COLUMN, SETTING_VALUE_COLUMN);
}

export async function writeCareerPortalAccess(
  token: string,
  isPublic: boolean,
  updatedBy: string,
): Promise<CareerPortalAccessSetting> {
  const updatedAt = new Date().toISOString();
  const fields = {
    Title: SETTING_TITLE,
    SettingValue: careerPortalAccessValue(isPublic),
    UpdatedBy: updatedBy,
    UpdatedAt: updatedAt,
  };

  const existing = await findSettingItem(token);
  const writeItem = async () => {
    if (existing) {
      await updateListItemFields(token, SETTINGS_LIST, existing.id, fields);
    } else {
      await createListItem(token, SETTINGS_LIST, fields);
    }
  };

  try {
    await writeItem();
  } catch (error) {
    // Graph can still be serving a cached list schema for a few hundred ms
    // after the column is created over SP REST, and rejects the unknown field.
    // One retry turns a confusing first-save failure into a non-event.
    logWarn("api:career-portal-access", "Retrying career portal access write", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await writeItem();
  }

  return { isPublic, updatedBy, updatedAt };
}

/**
 * Resolves the tenant identity behind a delegated SharePoint token. Used to
 * decide whether a career-portal caller is a signed-in employee — it answers
 * "is this somebody" only, never "is this an admin".
 */
export async function resolveDelegatedUserEmail(accessToken: string): Promise<string> {
  if (!accessToken || !SP_SITE_URL) return "";

  try {
    const response = await fetch(`${SP_SITE_URL}/_api/web/currentuser?$select=Email,UserPrincipalName,LoginName`, {
      headers: {
        Accept: "application/json;odata=nometadata",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) return "";

    const user = await response.json() as SharePointUser;
    const email = String(user.Email || user.UserPrincipalName || "").toLowerCase();
    if (email) return email;
    const login = String(user.LoginName || "").toLowerCase();
    return login.split("|").pop() || "";
  } catch (error) {
    logWarn("api:career-portal-access", "Failed to resolve delegated user", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}

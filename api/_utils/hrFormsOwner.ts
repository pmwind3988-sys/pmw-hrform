import { logWarn } from "./logger.js";

/**
 * "Is this delegated SharePoint token an HR Forms Owner?" — the check that gates
 * every admin action.
 *
 * Asked against SharePoint rather than Graph because the group is a SharePoint
 * site group, which is where HR actually maintains it.
 *
 * Most callers want `resolveHrFormsOwner`: one token in, the owner's email or
 * `null` out. The two halves are exported separately for `job-admin.ts`, which
 * needs the caller's identity whether or not they turn out to be an owner —
 * a non-owner there still gets to see their own applications.
 */

const ADMIN_GROUP = "_HR_ Forms Owners";
const SP_SITE_URL = (process.env.VITE_SP_SITE_URL || process.env.SP_SITE_URL || "").replace(/\/$/, "");

interface SharePointUser {
  Email?: string;
  LoginName?: string;
  UserPrincipalName?: string;
}

export interface DelegatedUser {
  email: string;
  login: string;
}

async function delegatedSharePointGet<T>(accessToken: string, path: string): Promise<T> {
  if (!SP_SITE_URL) throw new Error("SharePoint site URL is not configured");
  const response = await fetch(`${SP_SITE_URL}${path}`, {
    headers: {
      Accept: "application/json;odata=nometadata",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) throw new Error(`SharePoint GET ${response.status}`);
  return (await response.json()) as T;
}

function normalizeDelegatedUser(user: SharePointUser): DelegatedUser | null {
  const email = String(user.Email || user.UserPrincipalName || "").toLowerCase();
  const login = String(user.LoginName || "").toLowerCase();
  const loginEmail = login.split("|").pop() || "";
  const resolvedEmail = email || loginEmail;
  if (!resolvedEmail && !login) return null;
  return { email: resolvedEmail, login };
}

/** Who the delegated token belongs to, or `null` if SharePoint will not say. */
export async function resolveDelegatedUser(accessToken: string): Promise<DelegatedUser | null> {
  if (!accessToken) return null;
  try {
    return normalizeDelegatedUser(
      await delegatedSharePointGet<SharePointUser>(
        accessToken,
        "/_api/web/currentuser?$select=Email,UserPrincipalName,LoginName",
      ),
    );
  } catch (error) {
    logWarn("api:hr-owner", "Failed to resolve delegated user", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Membership for an identity already resolved from the same token. Answers
 * `false` when the group cannot be read at all — failing closed is the point:
 * an unreadable group must never open an admin action.
 */
export async function isHrFormsOwner(accessToken: string, user: DelegatedUser): Promise<boolean> {
  try {
    const members = await delegatedSharePointGet<{ value?: SharePointUser[] }>(
      accessToken,
      `/_api/web/sitegroups/getByName('${encodeURIComponent(ADMIN_GROUP)}')/users?$select=LoginName,Email,UserPrincipalName`,
    );
    return (members.value || []).some((member) => {
      const memberUser = normalizeDelegatedUser(member);
      if (!memberUser) return false;
      return (
        (user.email && memberUser.email === user.email) ||
        (user.login && memberUser.login === user.login) ||
        (user.email && memberUser.login.endsWith(user.email))
      );
    });
  } catch (error) {
    logWarn("api:hr-owner", "Failed to verify HR Forms Owner membership", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Returns the owner's email address, or `null` for anyone else — including a
 * caller whose identity or membership could not be read at all.
 */
export async function resolveHrFormsOwner(accessToken: string): Promise<string | null> {
  const user = await resolveDelegatedUser(accessToken);
  if (!user) return null;
  return (await isHrFormsOwner(accessToken, user)) ? user.email : null;
}

/**
 * peopleSearch.ts — look colleagues up in the company's Microsoft 365 directory.
 *
 * Typing a couple of letters into an email field should find the person the
 * way Outlook does, rather than demanding the address be remembered exactly.
 * An approval routes on the address being right, so guessing at spelling is
 * the failure this removes.
 *
 * Reading the tenant's people needs a permission the sign-in does not already
 * carry, so consent is asked for once, by a button the admin presses, and
 * never by a redirect that would throw away a half-filled dialog.
 */
import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";

/** Enough to read names and addresses; grants nothing else. */
export const PEOPLE_SCOPES = ["User.ReadBasic.All"];

const GRAPH_USERS = "https://graph.microsoft.com/v1.0/users";

export interface DirectoryPerson {
  email: string;
  name: string;
  department: string;
  position: string;
}

/** Why a lookup produced nothing, when the reason is worth showing. */
export type PeopleSearchStatus = "ok" | "needs-consent" | "unavailable";

export interface PeopleSearchResult {
  people: DirectoryPerson[];
  status: PeopleSearchStatus;
}

interface GraphUser {
  displayName?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  department?: string | null;
  jobTitle?: string | null;
}

/** Consent has not been given yet, as opposed to the lookup being broken. */
function isConsentError(error: unknown): boolean {
  const code = (error as { errorCode?: string } | null)?.errorCode ?? "";
  return code === "consent_required"
    || code === "interaction_required"
    || code === "login_required"
    || code === "no_tokens_found";
}

/**
 * A token for reading people, without ever leaving the page.
 *
 * `interactive` is the admin having pressed the button that asks for consent;
 * without it a missing permission is reported, not prompted for.
 */
export async function acquirePeopleToken(
  instance: IPublicClientApplication,
  account: AccountInfo | undefined,
  interactive = false,
): Promise<string | null> {
  if (!account) return null;
  try {
    const result = await instance.acquireTokenSilent({ scopes: PEOPLE_SCOPES, account });
    return result.accessToken;
  } catch (error) {
    if (!interactive || !isConsentError(error)) {
      if (!interactive) return null;
      throw error;
    }
    const result = await instance.acquireTokenPopup({ scopes: PEOPLE_SCOPES, account });
    return result.accessToken;
  }
}

/** A quoted term Graph's $search will accept, with its own quotes removed. */
function searchTerm(query: string): string {
  return query.replace(/["\\]/g, " ").trim();
}

function toPerson(user: GraphUser): DirectoryPerson | null {
  const email = (user.mail || user.userPrincipalName || "").trim();
  if (!email || !email.includes("@")) return null;
  return {
    email,
    name: (user.displayName || "").trim(),
    department: (user.department || "").trim(),
    position: (user.jobTitle || "").trim(),
  };
}

/**
 * People whose name or address begins with (or contains) what was typed.
 *
 * `$search` matches on word starts across name and address, which is what
 * makes "sar" find "Sarah Tan"; a tenant that refuses it falls back to a
 * plain starts-with filter so the field still finds somebody.
 */
export async function searchDirectoryPeople(
  token: string,
  query: string,
  signal?: AbortSignal,
): Promise<DirectoryPerson[]> {
  const term = searchTerm(query);
  if (term.length < 2) return [];

  const select = "displayName,mail,userPrincipalName,department,jobTitle";
  const search = `"displayName:${term}" OR "mail:${term}" OR "userPrincipalName:${term}" OR "givenName:${term}" OR "surname:${term}"`;
  const searchUrl = `${GRAPH_USERS}?$select=${select}&$top=15&$search=${encodeURIComponent(search)}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    ConsistencyLevel: "eventual",
    Accept: "application/json",
  };

  let response = await fetch(searchUrl, { headers, signal });
  if (!response.ok) {
    const escaped = term.replace(/'/g, "''");
    const filter = `startswith(displayName,'${escaped}') or startswith(mail,'${escaped}') or startswith(userPrincipalName,'${escaped}')`;
    const filterUrl = `${GRAPH_USERS}?$select=${select}&$top=15&$filter=${encodeURIComponent(filter)}`;
    response = await fetch(filterUrl, { headers, signal });
  }
  if (!response.ok) {
    throw new Error(`Directory lookup failed (${response.status})`);
  }

  const data = await response.json() as { value?: GraphUser[] };
  const people: DirectoryPerson[] = [];
  const seen = new Set<string>();
  for (const user of data.value ?? []) {
    const person = toPerson(user);
    if (!person) continue;
    const key = person.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    people.push(person);
  }
  return people;
}

/** Silent lookup: a token when there is one, and why not when there is not. */
export async function lookupPeople(
  instance: IPublicClientApplication,
  account: AccountInfo | undefined,
  query: string,
  signal?: AbortSignal,
): Promise<PeopleSearchResult> {
  const token = await acquirePeopleToken(instance, account);
  if (!token) return { people: [], status: "needs-consent" };
  try {
    return { people: await searchDirectoryPeople(token, query, signal), status: "ok" };
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") throw error;
    return { people: [], status: "unavailable" };
  }
}

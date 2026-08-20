/**
 * recipientSearch.ts — directory search behind the builder's recipient picker.
 *
 * The picker used to read SharePoint's `siteusers` filtered to
 * `PrincipalType eq 1`, which is *users only* — so distribution lists, the one
 * thing an author most needs to find when routing a layer to a team, were the
 * kind it could never offer. It also only ever saw principals already added to
 * that site, not the tenant.
 *
 * This searches Entra directly instead, and reports what kind of thing each hit
 * is, because the distinction decides whether an address can *act* on a layer:
 *
 *   - `user`   — a real sign-in identity. Can approve or evaluate.
 *   - `shared` — a mailbox with no usable sign-in. Receives mail, can never act,
 *                so a layer assigned to one strands itself. The builder warns.
 *   - `group`  — a mail-enabled group / distribution list. Expanded to its
 *                members at submit time, and each member can act.
 *
 * Needs `Group.Read.All` and `User.Read.All` as Microsoft Graph *application*
 * permissions on the `SYSTEM_CLIENT_ID` app registration. Group search failing
 * does not take people down with it — a half-populated picker is far better
 * than an empty one.
 */
import { graphGet } from "./graphClient.js";

export type RecipientKind = "user" | "shared" | "group";

export interface RecipientMatch {
  email: string;
  name: string;
  kind: RecipientKind;
}

/** Below this a query matches most of the directory, which is not a suggestion. */
const MIN_QUERY_LENGTH = 2;
/** Per source, so a picker list stays scannable. */
const MAX_PER_SOURCE = 10;

interface GraphDirectoryEntry {
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
  accountEnabled?: boolean;
  mailEnabled?: boolean;
}

interface GraphCollection {
  value?: GraphDirectoryEntry[];
}

/**
 * `$search` values are double-quoted, so an embedded quote would end the term
 * early and change the query's meaning. Backslashes go first, or escaping a
 * quote would leave a dangling escape of its own.
 */
function escapeSearchTerm(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Directory `$search` is an advanced query: Graph refuses it outright without
 * `ConsistencyLevel: eventual`. That header is the whole reason `graphGet`
 * takes headers at all.
 */
async function searchDirectory(
  token: string,
  resource: "users" | "groups",
  term: string,
  select: string,
): Promise<GraphDirectoryEntry[]> {
  const search = encodeURIComponent(`"displayName:${term}" OR "mail:${term}"`);
  try {
    const response = await graphGet(
      token,
      `/${resource}?$search=${search}&$select=${select}&$top=${MAX_PER_SOURCE}`,
      { ConsistencyLevel: "eventual" },
    ) as GraphCollection;
    return response.value ?? [];
  } catch {
    // One source being unavailable — an ungranted permission, a throttle — must
    // not empty the picker. The caller shows whatever the other source found.
    return [];
  }
}

function addressOf(entry: GraphDirectoryEntry): string {
  return (entry.mail || entry.userPrincipalName || "").trim();
}

export async function searchRecipients(token: string, query: string): Promise<RecipientMatch[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];
  const term = escapeSearchTerm(trimmed);

  const [people, groups] = await Promise.all([
    searchDirectory(token, "users", term, "displayName,mail,userPrincipalName,accountEnabled"),
    searchDirectory(token, "groups", term, "displayName,mail,mailEnabled"),
  ]);

  const seen = new Set<string>();
  const matches: RecipientMatch[] = [];

  const add = (entry: GraphDirectoryEntry, kind: RecipientKind) => {
    const email = addressOf(entry);
    if (!email) return;
    const key = email.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    matches.push({ email, name: (entry.displayName || "").trim(), kind });
  };

  for (const person of people) {
    // A disabled account with a mailbox is how a shared mailbox appears here:
    // mail arrives, but nobody can sign in as it, so it can never act.
    add(person, person.accountEnabled === false ? "shared" : "user");
  }
  for (const group of groups) {
    // A security group with no mailbox cannot be a recipient at all.
    if (group.mailEnabled === false) continue;
    add(group, "group");
  }

  return matches;
}

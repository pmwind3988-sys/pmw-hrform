/**
 * Distribution-list expansion for workflow layers.
 *
 * A layer whose assignee is a distribution list / mail-enabled group is
 * expanded to its individual members at submit time, so the layer's actor list
 * is concrete addresses that the 365 access check can match against. Nested
 * groups are flattened via `transitiveMembers`.
 *
 * Requires **`Group.Read.All`** as a *Microsoft Graph* Application permission
 * (admin consent) on the `SYSTEM_CLIENT_ID` app registration — not SharePoint.
 * This runs on the `getGraphToken()` token, so granting it under the SharePoint
 * API has no effect. Without it Graph returns 403 and the caller surfaces a
 * configuration error rather than silently assigning nobody.
 */
import { escapeGraphODataString, graphGet } from "./graphClient.js";
import { parseValidEmailList } from "./layerRecipients.js";

const MEMBER_PAGE_SIZE = 200;
/** Guards against a runaway nested group; far above any realistic approver DL. */
const MAX_MEMBERS = 500;

interface GraphGroupRef {
  id?: string;
  mail?: string;
}

interface GraphMember {
  mail?: string;
  userPrincipalName?: string;
  accountEnabled?: boolean;
}

interface GraphCollection<T> {
  value?: T[];
  "@odata.nextLink"?: string;
}

function memberAddress(member: GraphMember): string {
  return (member.mail || member.userPrincipalName || "").trim();
}

/**
 * `findGroupIdByMail` with the Graph failure translated into something an
 * operator can act on. A refused lookup and an address that simply is not a
 * group are very different problems, and both used to read "returned no
 * members".
 */
async function findGroupId(token: string, address: string): Promise<string> {
  try {
    return await findGroupIdByMail(token, address);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.includes("403")) {
      throw new Error(
        `Reading the members of ${address} was refused. Grant Group.Read.All as a `
        + "Microsoft Graph *application* permission on the app registration and "
        + "admin-consent it — granting it under SharePoint has no effect here.",
        { cause: error },
      );
    }
    throw new Error(
      `Could not look up the distribution list ${address}: ${detail}`,
      { cause: error },
    );
  }
}

/**
 * Resolves the group's object id from its mail address. Covers M365 groups,
 * mail-enabled security groups and classic distribution groups, all of which
 * live under `/groups`.
 */
async function findGroupIdByMail(token: string, address: string): Promise<string> {
  const escaped = encodeURIComponent(escapeGraphODataString(address));

  // `mail eq` on its own is a basic query every tenant answers.
  const byMail = await graphGet(
    token,
    `/groups?$filter=mail eq '${escaped}'&$select=id,mail&$top=1`,
  ) as GraphCollection<GraphGroupRef>;
  const primary = byMail.value?.[0]?.id?.trim();
  if (primary) return primary;

  // A lambda over the multi-valued `proxyAddresses` is an *advanced* query, and
  // Graph rejects one outright unless it is asked for with `$count=true` plus
  // `ConsistencyLevel: eventual`. OR-ing it into the filter above is what made
  // every list expansion fail with 400 before reaching a single member — so it
  // is a second request, and only for addresses the primary lookup missed.
  try {
    const byAlias = await graphGet(
      token,
      `/groups?$count=true&$filter=proxyAddresses/any(p:p eq 'smtp:${escaped}')&$select=id,mail&$top=1`,
      { ConsistencyLevel: "eventual" },
    ) as GraphCollection<GraphGroupRef>;
    return byAlias.value?.[0]?.id?.trim() || "";
  } catch {
    // The primary lookup already succeeded, so this is not a permission or
    // connectivity problem — only the alias form is unavailable. "Not a group"
    // is a legitimate answer and the caller knows what to do with it.
    return "";
  }
}

/**
 * Expands a distribution list address into its member addresses.
 *
 * Returns `[]` when the address is not a group — callers decide whether that is
 * a hard error (365 layers) or a fallback to mailing the address itself.
 * Throws only on a Graph failure, so a missing permission is never mistaken for
 * an empty group.
 */
export async function expandDistributionList(token: string, address: string): Promise<string[]> {
  const normalized = address.trim();
  if (!normalized) return [];

  const groupId = await findGroupId(token, normalized);
  if (!groupId) return [];

  const members: string[] = [];
  let path: string | null =
    `/groups/${encodeURIComponent(groupId)}/transitiveMembers/microsoft.graph.user`
    + `?$select=mail,userPrincipalName,accountEnabled&$top=${MEMBER_PAGE_SIZE}`;

  while (path && members.length < MAX_MEMBERS) {
    const page = await graphGet(token, path) as GraphCollection<GraphMember>;
    for (const member of page.value ?? []) {
      if (member.accountEnabled === false) continue;
      const email = memberAddress(member);
      if (email) members.push(email);
    }
    const next = page["@odata.nextLink"];
    // Graph returns an absolute nextLink; graphGet prepends the base itself.
    path = next ? next.replace("https://graph.microsoft.com/v1.0", "") : null;
  }

  return parseValidEmailList(members).slice(0, MAX_MEMBERS);
}

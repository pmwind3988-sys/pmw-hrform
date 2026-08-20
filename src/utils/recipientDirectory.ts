/**
 * recipientDirectory.ts — the builder's tenant-wide recipient lookup.
 *
 * Backs the address pickers on a workflow layer. The builder's own `siteUsers`
 * list comes from SharePoint `siteusers` filtered to `PrincipalType eq 1`, which
 * is users only and only those already added to that site — so a distribution
 * list could never be suggested, however carefully it was typed. This asks the
 * tenant directory instead, through `/api/expand-group`.
 *
 * Server counterpart: `api/_utils/recipientSearch.ts`.
 */
import { isLayerEmail } from "./layerRecipients";

/** Matches the server's `RecipientKind`; see `api/_utils/recipientSearch.ts`. */
export type RecipientKind = "user" | "shared" | "group";

export interface RecipientMatch {
  email: string;
  name: string;
  kind: RecipientKind;
}

const API_KEY = (import.meta.env.VITE_API_SECRET_KEY || "").trim();

const KINDS: RecipientKind[] = ["user", "shared", "group"];

/**
 * True when an address can never approve or evaluate, whatever a layer says.
 *
 * A distribution list is fine as an assignee — it is expanded to members who
 * each have their own sign-in. A shared mailbox is not: nobody can sign in as
 * one, so a layer assigned to it can never be actioned by anybody.
 */
export function cannotAct(kind: RecipientKind): boolean {
  return kind === "shared";
}

export function parseRecipientMatches(payload: unknown): RecipientMatch[] {
  const matches = (payload as { matches?: unknown } | null)?.matches;
  if (!Array.isArray(matches)) return [];

  return matches.flatMap((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    const email = typeof record.email === "string" ? record.email.trim() : "";
    if (!isLayerEmail(email)) return [];
    const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : email;
    // An unfamiliar kind means a newer server, not a bad person — show them as
    // an ordinary user rather than hiding them from the picker.
    const kind = KINDS.find((candidate) => candidate === record.kind) ?? "user";
    return [{ email, name, kind }];
  });
}

/**
 * Searches the tenant directory. `graphToken` must be a Microsoft Graph token
 * for the signed-in author — the endpoint refuses the API key on its own,
 * because a public bundle key must not be able to read the address book.
 */
export async function searchRecipientDirectory(
  graphToken: string,
  query: string,
): Promise<RecipientMatch[]> {
  if (query.trim().length < 2) return [];

  const response = await fetch(`${window.location.origin}/api/expand-group`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Authorization: `Bearer ${graphToken}`,
      ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
    },
    body: JSON.stringify({ action: "search", query }),
  });
  if (!response.ok) return [];
  return parseRecipientMatches(await response.json().catch(() => null));
}

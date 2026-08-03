import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { acquireAccessTokenSilentOrRedirect, fetchWithAuthRecovery } from "../utils/authRecovery";
import { SP_STATIC } from "../utils/spConfig";

/**
 * Resolves whether the signed-in account is an HR Forms Owner, by reading the
 * SharePoint site group directly with the visitor's own delegated token.
 *
 * The career surfaces each used to carry their own copy of this check. It is not
 * an authorisation boundary — it only decides whether privileged affordances are
 * offered. Every action it gates is re-checked server-side against the same group
 * (see `isHrFormsOwner` in api/job-apply.ts), so a false positive here cannot
 * grant anything.
 *
 * Returns `false` for a Public Respondent, who has no delegated token to ask with.
 */
export function useHrFormsOwner(): boolean {
  const { instance, accounts } = useMsal();
  const activeAccount = instance.getActiveAccount() ?? accounts[0];
  const userEmail = activeAccount?.username?.toLowerCase() || "";
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Reset on account change so a switched-to account never inherits the
    // previous one's answer while its own check is still in flight.
    setIsOwner(false);

    async function check() {
      if (!activeAccount || !userEmail) return;

      try {
        const spSiteUrl = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
        if (!spSiteUrl) return;

        const token = await acquireAccessTokenSilentOrRedirect(instance, {
          scopes: [`${new URL(spSiteUrl).origin}/AllSites.Manage`],
          account: activeAccount,
        });

        const response = await fetchWithAuthRecovery(
          `${spSiteUrl}/_api/web/sitegroups/getByName('${encodeURIComponent(SP_STATIC.adminGroup)}')/users?$select=Email`,
          { headers: { Accept: "application/json;odata=nometadata", Authorization: `Bearer ${token}` } },
        );
        if (!response.ok) return;

        const data = (await response.json()) as { value?: { Email?: string }[] };
        if (!cancelled) {
          setIsOwner((data.value || []).some((user) => (user.Email || "").toLowerCase() === userEmail));
        }
      } catch {
        // Not an owner, or the group is unreadable — either way, offer nothing extra.
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [instance, activeAccount, userEmail]);

  return isOwner;
}

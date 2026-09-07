/**
 * apiIdentity.ts — proves to our own API who is making a call.
 *
 * The API has always been guarded by `X-Api-Key`, which ships to every browser
 * inside the bundle as `VITE_API_SECRET_KEY`. That answers "does the caller
 * have our JavaScript", which every visitor does. It cannot answer "who is the
 * caller", so no endpoint holding one person's data could be reached with it
 * alone — which is why a reviewer's submission is still fetched from SharePoint
 * by the browser rather than served by us.
 *
 * These headers add the missing half: a Microsoft 365 access token the server
 * checks against the identity provider. The key stays, as a weaker outer layer.
 *
 * A *Graph* token, deliberately, and not the SharePoint one the rest of the app
 * carries. The server proves identity by asking Graph who the token belongs to,
 * and a token minted for SharePoint cannot answer that question. Both are
 * issued to the same signed-in account, so this costs a silent token fetch and
 * no extra sign-in. `useUserProfile` and `useRecipientSearch` already take
 * `User.Read` this way.
 */
import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";

import { acquireAccessTokenSilentOrRedirect } from "./authRecovery";

const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";

/** The narrowest scope that lets the server read back who the caller is. */
export const API_IDENTITY_SCOPES = ["User.Read"];

/**
 * Headers naming the signed-in caller, for a request to our own API.
 *
 * Falls back to the API key alone when no token can be had — the caller is then
 * unidentified, and every endpoint that needs a name will refuse it. That is
 * the right failure: it turns "signed out" into a clean 401 from the server
 * rather than a request that quietly proceeds as nobody.
 */
export async function apiIdentityHeaders(
  instance: IPublicClientApplication,
  account: AccountInfo | undefined,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (API_KEY) headers["X-Api-Key"] = API_KEY;
  if (!account) return headers;

  try {
    const token = await acquireAccessTokenSilentOrRedirect(instance, {
      scopes: API_IDENTITY_SCOPES,
      account,
    });
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Leave the identity off rather than failing here. The endpoint decides
    // whether it can proceed without one, and says so in its own words.
  }
  return headers;
}

/**
 * The same headers, for callers with no MSAL hook in reach.
 *
 * Components take `instance` and `account` from `useMsal` and should keep
 * using `apiIdentityHeaders` above. This exists for the plain functions in
 * `utils/` — `sendSpEmail` and the notification helpers that call it — which
 * are several layers below any component and would otherwise have to thread an
 * MSAL instance through half a dozen signatures to name their caller.
 *
 * It reads the one application-wide instance directly. That is the same object
 * `useMsal` hands out, so this cannot disagree with what a component would have
 * passed. An active account is preferred, falling back to the first signed in —
 * matching how the rest of the app picks one (`accounts[0]`).
 *
 * The instance is imported here rather than at the top of the file, and that is
 * load-bearing: `msalConfig` builds its `PublicClientApplication` as its module
 * body runs, reading `window.location`. A static import would drag that into
 * every module that transitively imports this one — including `formBuilderSP`,
 * whose unit tests run under Node with no `window` and would fail on import
 * alone. Deferring it to the call keeps this usable from a module graph that
 * never reaches a browser.
 */
export async function currentApiIdentityHeaders(): Promise<Record<string, string>> {
  const { msalInstance } = await import("../auth/msalConfig");
  const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  return apiIdentityHeaders(msalInstance, account);
}

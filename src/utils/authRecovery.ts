import {
  InteractionRequiredAuthError,
  type AccountInfo,
  type AuthenticationResult,
  type IPublicClientApplication,
  type SilentRequest,
} from "@azure/msal-browser";
import { loginRequest } from "../auth/msalConfig";
import { setStoredAuthDecision } from "./authDecision";

const STALE_AUTH_ERROR_CODES = new Set([
  "interaction_required",
  "login_required",
  "consent_required",
  "bad_token",
  "no_tokens_found",
  "refresh_token_expired",
  "native_account_unavailable",
  "no_account_in_silent_request",
  "no_account_found",
  "token_refresh_required",
  "invalid_grant",
  "monitor_window_timeout",
]);

let redirectStarted = false;

function getErrorField(error: unknown, field: string): string {
  if (!error || typeof error !== "object" || !(field in error)) {
    return "";
  }

  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" ? value.toLowerCase() : "";
}

export function isStaleAuthError(error: unknown): boolean {
  if (error instanceof InteractionRequiredAuthError) {
    return true;
  }

  const errorCode = getErrorField(error, "errorCode") || getErrorField(error, "code");
  const errorName = getErrorField(error, "name");
  const message = getErrorField(error, "message");

  return (
    STALE_AUTH_ERROR_CODES.has(errorCode) ||
    errorName === "interactionrequiredautherror" ||
    message.includes("interaction_required") ||
    message.includes("login_required") ||
    message.includes("refresh token") ||
    message.includes("no account") ||
    message.includes("token refresh")
  );
}

function preserveCurrentRoute(): void {
  try {
    sessionStorage.setItem("pmw_post_login_redirect", window.location.pathname + window.location.search);
    sessionStorage.removeItem("msal.interaction.status");
    sessionStorage.removeItem("msal.login.error");
  } catch {
    // Storage can be restricted in private browsing.
  }
}

export async function startReauthentication(
  instance: IPublicClientApplication,
  scopes: string[] = loginRequest.scopes,
  account?: AccountInfo,
): Promise<never> {
  if (redirectStarted) {
    return new Promise<never>(() => undefined);
  }

  redirectStarted = true;
  setStoredAuthDecision("msal");
  preserveCurrentRoute();

  try {
    await instance.loginRedirect({
      scopes,
      account,
      loginHint: account?.username,
      redirectStartPage: window.location.href,
    });
  } catch (error) {
    redirectStarted = false;
    throw error;
  }

  return new Promise<never>(() => undefined);
}

export async function acquireTokenSilentOrRedirect(
  instance: IPublicClientApplication,
  request: SilentRequest,
): Promise<AuthenticationResult> {
  try {
    return await instance.acquireTokenSilent(request);
  } catch (error) {
    if (isStaleAuthError(error)) {
      return startReauthentication(instance, request.scopes, request.account);
    }
    throw error;
  }
}

export async function acquireAccessTokenSilentOrRedirect(
  instance: IPublicClientApplication,
  request: SilentRequest,
): Promise<string> {
  const response = await acquireTokenSilentOrRedirect(instance, request);
  return response.accessToken;
}

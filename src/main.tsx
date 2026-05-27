import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Buffer } from "buffer";
if (typeof globalThis !== "undefined") {
  (globalThis as Record<string, unknown>).Buffer = Buffer;
}

// ── Required env var validation ─────────────────────────────────────────
const REQUIRED_VITE_VARS = ["VITE_AZURE_CLIENT_ID", "VITE_AZURE_TENANT_ID", "VITE_SP_SITE_URL"] as const;
const missing = REQUIRED_VITE_VARS.filter((name) => !import.meta.env[name]);
if (missing.length > 0) {
  const msg = `❌ pmw-hrform: Missing required env vars: ${missing.join(", ")}. Check .env.local or .env file.`;
  document.body.textContent = msg;
  throw new Error(msg);
}

import { msalInstance } from "./auth/msalConfig";
import AuthProvider from "./auth/AuthProvider";
import "./index.css";
import App from "./App";

async function initializeMsal() {
  try {
    await msalInstance.initialize();
  } catch (err) {
    console.warn("MSAL initialization warning (expected in private browsing):", err);
    return;
  }

  // Handle any redirect response from previous auth flow
  // Cap at 3s so a hung redirect never blocks app render
  try {
    await Promise.race([
      msalInstance.handleRedirectPromise(),
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch (err) {
    // no_token_request_cache_error is expected in private/incognito windows
    // where localStorage is restricted or cleared between redirects
    console.warn("MSAL redirect handling warning (expected in private browsing):", err);
  }
}

initializeMsal().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>,
  );
});

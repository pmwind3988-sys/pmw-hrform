import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { msalInstance } from "./auth/msalConfig";
import AuthProvider from "./auth/AuthProvider";
import "./index.css";
import "survey-core/survey-core.min.css";
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

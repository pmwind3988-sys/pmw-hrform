import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { msalInstance } from "./auth/msalConfig";
import AuthProvider from "./auth/AuthProvider";
import "./index.css";
import "survey-core/survey-core.min.css";
import App from "./App";

async function initializeMsal() {
  await msalInstance.initialize();

  // Handle any redirect response from previous auth flow
  // Cap at 3s so a hung redirect never blocks app render
  await Promise.race([
    msalInstance.handleRedirectPromise(),
    new Promise<void>((resolve) => setTimeout(resolve, 3000)),
  ]);
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

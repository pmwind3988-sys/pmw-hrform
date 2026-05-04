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
  await msalInstance.handleRedirectPromise();
  
  // Force clear any stale interaction by getting accounts
  const accounts = msalInstance.getAllAccounts();
  console.log("MSAL initialized, accounts:", accounts.length);
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

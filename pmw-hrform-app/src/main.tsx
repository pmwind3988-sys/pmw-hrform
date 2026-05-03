import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { msalInstance } from "./auth/msalConfig";
import AuthProvider from "./auth/AuthProvider";
import "./index.css";
import "survey-core/survey-core.min.css";
import "survey-creator-core/survey-creator-core.min.css";
import App from "./App";

await msalInstance.initialize();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

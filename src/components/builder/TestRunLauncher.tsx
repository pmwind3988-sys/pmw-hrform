/**
 * TestRunLauncher.tsx - "Start a test run" dialog for the form builder.
 *
 * Mints a signed test ticket via `/api/submit-form` (`mint-test-ticket`
 * action) and opens the form's one route with that ticket in the query
 * string. Every email the run generates is redirected server-side to the
 * address entered here; nothing about the redirect decision comes from the
 * browser once the ticket is minted — the server reads it out of the signed
 * ticket, never out of the URL.
 */
import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { C } from "./constants";
import { acquireAccessTokenSilentOrRedirect } from "../../utils/authRecovery";
import { testRunFormUrl } from "../../utils/testRunLaunch";

const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";

interface TestRunLauncherProps {
  open: boolean;
  onClose: () => void;
  form: { Title: string; Slug?: string };
}

export default function TestRunLauncher({ open, onClose, form }: TestRunLauncherProps) {
  const { instance, accounts } = useMsal();
  const defaultEmail = accounts[0]?.username || "";
  const [email, setEmail] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [blockedUrl, setBlockedUrl] = useState("");

  if (!open) return null;

  const slug = form.Slug || "";

  const startTestRun = async () => {
    setError("");
    setBlockedUrl("");
    if (!slug) {
      setError("This form has no published slug yet — publish it before starting a test run.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address to receive the test run.");
      return;
    }
    setBusy(true);
    try {
      const account = accounts[0];
      const origin = window.location.origin;
      const delegatedToken = await acquireAccessTokenSilentOrRedirect(instance, {
        scopes: [`${origin}/AllSites.Manage`],
        account,
      });
      const res = await fetch("/api/submit-form", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
        },
        body: JSON.stringify({
          action: "mint-test-ticket",
          slug,
          listTitle: form.Title,
          testEmail: email.trim().toLowerCase(),
          delegatedToken,
        }),
      });
      const data = await res.json().catch(() => ({})) as { ticket?: string; error?: string };
      if (!res.ok || !data.ticket) {
        setError(data.error || `Could not start a test run (${res.status}).`);
        setBusy(false);
        return;
      }
      const url = testRunFormUrl({ slug, ticket: data.ticket });
      const withDisplayEmail = `${url}&testEmail=${encodeURIComponent(email.trim().toLowerCase())}`;
      const popup = window.open(withDisplayEmail, "_blank", "noopener");
      setBusy(false);
      if (!popup) {
        // The run is already minted and the columns are already provisioned —
        // only the popup failed. Closing the dialog here would strand the
        // tester with no way back to a run that already exists, so the dialog
        // stays open and hands them the link to open themselves.
        setBlockedUrl(withDisplayEmail);
        return;
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start a test run.");
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(17,24,39,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: C.white, borderRadius: 10, width: 420, maxWidth: "100%", padding: 22, boxShadow: "0 20px 48px rgba(0,0,0,0.25)" }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>Test workflow</div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
          Rehearse "{form.Title}"'s approval workflow. Every email this run generates goes only to the
          address below — no real approver is contacted — and the run will not appear in normal
          submission listings.
        </div>
        <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 5 }}>
          Send all test emails to
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@company.com"
          disabled={busy}
          style={{
            width: "100%",
            boxSizing: "border-box",
            height: 34,
            padding: "0 10px",
            borderRadius: 7,
            border: `1px solid ${C.border}`,
            fontSize: 13,
            marginBottom: 12,
          }}
        />
        {error && (
          <div style={{ fontSize: 12, color: C.red, background: C.redPale, borderRadius: 7, padding: "8px 10px", marginBottom: 12, lineHeight: 1.5 }}>
            {error}
          </div>
        )}
        {blockedUrl && (
          <div style={{ fontSize: 12, color: C.textSecond, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 7, padding: "8px 10px", marginBottom: 12, lineHeight: 1.5 }}>
            The test run started, but your browser blocked the popup. Open it yourself:{" "}
            <a href={blockedUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.purple, fontWeight: 600, wordBreak: "break-all" }}>
              {blockedUrl}
            </a>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{ height: 32, padding: "0 14px", border: `1px solid ${C.border}`, borderRadius: 7, background: C.white, color: C.textSecond, fontSize: 12, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={startTestRun}
            disabled={busy}
            style={{ height: 32, padding: "0 14px", border: "none", borderRadius: 7, background: C.purple, color: C.white, fontSize: 12, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
          >
            {busy ? "Starting…" : "Start test run"}
          </button>
        </div>
      </div>
    </div>
  );
}

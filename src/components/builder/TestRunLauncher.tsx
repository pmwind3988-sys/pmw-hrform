/**
 * TestRunLauncher.tsx - "Start a test run" dialog for the form builder.
 *
 * Mints a signed test ticket via `/api/submit-form` (`mint-test-ticket`
 * action) and opens the form's one route with that ticket in the query
 * string ("Fill in myself"), or with `simulate=1` as well ("Simulate
 * submission"), which has the form fill itself with sample answers and submit,
 * leaving the tester only the approval or evaluation to do.
 *
 * Every email the run generates is redirected server-side to the
 * address entered here; nothing about the redirect decision comes from the
 * browser once the ticket is minted — the server reads it out of the signed
 * ticket, never out of the URL.
 */
import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { C } from "./constants";
import { acquireAccessTokenSilentOrRedirect } from "../../utils/authRecovery";
import { sharePointManageScope } from "../../utils/sharePointScope";
import { testRunFormUrl } from "../../utils/testRunLaunch";
import { editorial } from "../../theme/editorial";

const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";

interface TestRunLauncherProps {
  open: boolean;
  onClose: () => void;
  form: { Title: string; Slug?: string };
  /**
   * The SharePoint site this form lives on. The delegated token must be asked
   * for against SharePoint's origin, never the app's own — requesting
   * `https://<app>/AllSites.Manage` makes Azure answer AADSTS500011, because no
   * resource by that name exists in the tenant. Passed in rather than read from
   * the environment so a form on a secondary site asks for the right site.
   */
  siteUrl?: string;
}

export default function TestRunLauncher({ open, onClose, form, siteUrl }: TestRunLauncherProps) {
  const { instance, accounts } = useMsal();
  const defaultEmail = accounts[0]?.username || "";
  const [email, setEmail] = useState(defaultEmail);
  /** Which button started the run in flight, so only that one says "Starting…". */
  const [busy, setBusy] = useState<"" | "fill" | "simulate">("");
  const [error, setError] = useState("");
  const [blockedUrl, setBlockedUrl] = useState("");

  if (!open) return null;

  const slug = form.Slug || "";

  const startTestRun = async (simulate: boolean) => {
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
    setBusy(simulate ? "simulate" : "fill");
    try {
      const account = accounts[0];
      const delegatedToken = await acquireAccessTokenSilentOrRedirect(instance, {
        scopes: [sharePointManageScope(siteUrl)],
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
        setBusy("");
        return;
      }
      const url = testRunFormUrl({ slug, ticket: data.ticket, simulate });
      const withDisplayEmail = `${url}&testEmail=${encodeURIComponent(email.trim().toLowerCase())}`;
      const popup = window.open(withDisplayEmail, "_blank", "noopener");
      setBusy("");
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
      setBusy("");
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(17,24,39,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: C.white, borderRadius: 28, width: 420, maxWidth: "100%", padding: 22, boxShadow: "0 20px 48px rgba(0,0,0,0.25)" }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>Test workflow</div>
        <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
          Rehearse "{form.Title}"'s approval workflow. Every email this run generates goes only to the
          address below — no real approver is contacted — and the run will not appear in normal
          submission listings.
        </div>
        <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
          <strong style={{ color: C.textPrimary }}>Simulate submission</strong> fills every question with sample
          answers and submits for you, so you only do the approval or evaluation.{" "}
          <strong style={{ color: C.textPrimary }}>Fill in myself</strong> opens the form pre-filled for you to check first.
        </div>
        <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: C.textMuted, marginBottom: 5 }}>
          Send all test emails to
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@company.com"
          disabled={busy !== ""}
          style={{
            width: "100%",
            boxSizing: "border-box",
            height: 34,
            padding: "0 10px",
            borderRadius: 12,
            border: `1px solid ${C.border}`,
            fontSize: 13.5,
            marginBottom: 12,
          }}
        />
        {error && (
          <div style={{ fontSize: 12.5, color: C.red, background: C.redPale, borderRadius: 12, padding: "8px 10px", marginBottom: 12, lineHeight: 1.5 }}>
            {error}
          </div>
        )}
        {blockedUrl && (
          <div style={{ fontSize: 12.5, color: C.textSecond, background: editorial.accentSoft, border: "1px solid #FDE68A", borderRadius: 12, padding: "8px 10px", marginBottom: 12, lineHeight: 1.5 }}>
            The test run started, but your browser blocked the popup. Open it yourself:{" "}
            <a href={blockedUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.purple, fontWeight: 600, wordBreak: "break-all" }}>
              {blockedUrl}
            </a>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            disabled={busy !== ""}
            style={{ height: 32, padding: "0 14px", border: `1px solid ${C.border}`, borderRadius: "999px", background: C.white, color: C.textSecond, fontSize: 12.5, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={() => startTestRun(false)}
            disabled={busy !== ""}
            style={{ height: 32, padding: "0 14px", border: `1px solid ${C.border}`, borderRadius: "999px", background: C.white, color: C.textPrimary, fontSize: 12.5, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy && busy !== "fill" ? 0.6 : 1 }}
          >
            {busy === "fill" ? "Starting…" : "Fill in myself"}
          </button>
          <button
            onClick={() => startTestRun(true)}
            disabled={busy !== ""}
            style={{ height: 32, padding: "0 14px", border: "none", borderRadius: "999px", background: C.purple, color: C.white, fontSize: 12.5, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
          >
            {busy === "simulate" ? "Starting…" : "Simulate submission"}
          </button>
        </div>
      </div>
    </div>
  );
}

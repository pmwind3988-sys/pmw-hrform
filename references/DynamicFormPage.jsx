/**
 * DynamicFormPage.jsx  — v3
 * Route: /forms/:slug
 *
 * AUTH RULES:
 *   PUBLIC FORM  → loads immediately, no MSAL, no redirect, no auth wall ever.
 *                  If an existing MSAL session is found (e.g. user came from admin),
 *                  silently picks it up and shows "signed in as X".
 *                  Optional "Sign in with M365" button for internal users.
 *                  Submit: user token (if available) → /api/submit-form system account.
 *
 *   PRIVATE FORM → shows sign-in gate. Must authenticate before seeing the form.
 *
 * FEATURES:
 *   ✓ Dark mode (persisted to localStorage)
 *   ✓ QR code + link share modal
 *   ✓ Scroll progress bar
 *   ✓ Floating action bar
 *   ✓ showBanner support (ISO/company header toggled from AdminFormBuilder)
 *   ✓ Silent session pickup (admin → public form stays signed in)
 *   ✓ System account fallback for unauthenticated submissions
 *   ✓ Proper survey reset (new Model instance)
 *   ✓ ?version=x.x for historical replay
 */

import React, {
  useEffect, useState, useMemo, useCallback, useRef,
} from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import { LayeredDarkPanelless, LayeredLightPanelless } from "survey-core/themes";
import "survey-core/survey-core.min.css";

//import { registerDynamicMatrix, registerQuestionData } from "../utils/DynamicMatrix";
import { getLatestFormBySlug, getFormVersion, spPost, spGet } from "./formBuilderSP";
import { loginRequest } from "../authConfig";
//import logo from "../assets/logo.png";

registerDynamicMatrix();

const SP_SITE_URL = (process.env.REACT_APP_SP_SITE_URL || "").replace(/\/$/, "");

// ─────────────────────────────────────────────────────────────────────────────
//  Tokens — light + dark
// ─────────────────────────────────────────────────────────────────────────────
const LIGHT = {
  purple: "#5B21B6", purpleLight: "#7C3AED", purplePale: "#EDE9FE",
  purpleMid: "#DDD6FE", purpleDark: "#3B0764",
  bg: "#F8F7FF", cardBg: "#FFFFFF", offWhite: "#F8F7FF", border: "#E5E3F0",
  textPrimary: "#1E1B4B", textSecond: "#6B7280", textMuted: "#9CA3AF",
  green: "#059669", greenPale: "#D1FAE5", greenBorder: "#6EE7B7",
  red: "#DC2626", redPale: "#FEE2E2",
  amber: "#D97706", amberPale: "#FEF3C7",
  shadow: "0 1px 3px rgba(91,33,182,0.08),0 4px 16px rgba(91,33,182,0.06)",
  shadowLg: "0 8px 40px rgba(91,33,182,0.16)",
  shadowFab: "0 4px 20px rgba(91,33,182,0.18)",
};
const DARK = {
  ...LIGHT,
  bg: "#0F0B1E", cardBg: "#1A1330", offWhite: "#160E28", border: "#2D2456",
  textPrimary: "#EDE9FE", textSecond: "#A78BFA", textMuted: "#6D5FA6",
  greenPale: "#052e16", greenBorder: "#166534",
  redPale: "#3b0707",
  amberPale: "#2d1b00",
  shadow: "0 1px 3px rgba(0,0,0,.4),0 4px 16px rgba(0,0,0,.3)",
  shadowLg: "0 8px 40px rgba(0,0,0,.5)",
  shadowFab: "0 4px 20px rgba(0,0,0,.4)",
};

const globalCss = (C) => `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'DM Sans',sans-serif;background:${C.bg};color:${C.textPrimary};transition:background .3s,color .3s}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  .dfp-survey-wrap .sd-root-modern{background:transparent!important}
  .dfp-survey-wrap .sd-container-modern{max-width:100%!important}
  ::-webkit-scrollbar{width:5px}
  ::-webkit-scrollbar-thumb{background:${C.purpleMid};border-radius:10px}
`;

// ─────────────────────────────────────────────────────────────────────────────
//  Atoms
// ─────────────────────────────────────────────────────────────────────────────
const Spinner = ({ size = 30, C }) => (
  <div style={{ width: size, height: size, border: `2.5px solid ${C.purpleMid}`, borderTop: `2.5px solid ${C.purple}`, borderRadius: "50%", animation: "spin .85s linear infinite", flexShrink: 0 }} />
);

const Pill = ({ children, color, bg, border }) => (
  <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, border: border ? `1px solid ${border}` : "none", borderRadius: 20, padding: "2px 10px", letterSpacing: ".04em", textTransform: "uppercase" }}>
    {children}
  </span>
);

const MsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="6.5" height="6.5" fill="#F25022" />
    <rect x="8.5" y="1" width="6.5" height="6.5" fill="#7FBA00" />
    <rect x="1" y="8.5" width="6.5" height="6.5" fill="#00A4EF" />
    <rect x="8.5" y="8.5" width="6.5" height="6.5" fill="#FFB900" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
//  Scroll progress
// ─────────────────────────────────────────────────────────────────────────────
const ScrollProgress = ({ C }) => {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const fn = () => {
      const el = document.documentElement;
      const total = el.scrollHeight - el.clientHeight;
      setPct(total > 0 ? Math.min(100, (el.scrollTop / total) * 100) : 0);
    };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 9999, pointerEvents: "none" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${C.purple},${C.purpleLight})`, transition: "width .1s linear", borderRadius: "0 2px 2px 0" }} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Floating action bar
// ─────────────────────────────────────────────────────────────────────────────
const FloatingBar = ({ dark, onToggleDark, onShare, C }) => {
  const Btn = ({ icon, label, onClick, active }) => (
    <button title={label} onClick={onClick}
      style={{ width: 42, height: 42, border: `1px solid ${C.border}`, borderRadius: 13, background: active ? C.purplePale : C.cardBg, color: active ? C.purple : C.textSecond, fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: C.shadowFab, transition: "all .15s" }}
      onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.borderColor = C.purpleMid; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.borderColor = C.border; }}>
      {icon}
    </button>
  );
  return (
    <div style={{ position: "fixed", bottom: 28, right: 24, display: "flex", flexDirection: "column", gap: 9, zIndex: 100 }}>
      <Btn icon="🔗" label="Share / QR Code" onClick={onShare} />
      <Btn icon={dark ? "☀️" : "🌙"} label={dark ? "Light mode" : "Dark mode"} onClick={onToggleDark} active={dark} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Share / QR modal
// ─────────────────────────────────────────────────────────────────────────────
const ShareModal = ({ url, formTitle, onClose, C }) => {
  const [copied, setCopied] = useState(false);
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}&bgcolor=ffffff&color=3b0764&margin=10`;
  const copy = () => navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(10,5,25,.7)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: C.cardBg, borderRadius: 22, padding: "34px 30px", maxWidth: 380, width: "100%", border: `1px solid ${C.border}`, boxShadow: C.shadowLg, animation: "fadeUp .2s ease", textAlign: "center" }}>

        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 21, color: C.textPrimary, marginBottom: 4 }}>Share Form</div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 24 }}>{formTitle}</div>

        {/* QR code */}
        <div style={{ display: "inline-flex", padding: 10, background: "#fff", borderRadius: 14, border: `2px solid ${C.purpleMid}`, marginBottom: 22 }}>
          <img src={qrSrc} alt="QR Code" width={180} height={180} style={{ display: "block", borderRadius: 6 }} />
        </div>

        {/* URL + copy */}
        <div style={{ display: "flex", gap: 7, marginBottom: 12 }}>
          <input readOnly value={url}
            style={{ flex: 1, height: 36, border: `1px solid ${C.border}`, borderRadius: 8, padding: "0 10px", fontSize: 11, fontFamily: "monospace", color: C.textSecond, background: C.offWhite, outline: "none", minWidth: 0 }} />
          <button onClick={copy}
            style={{ flexShrink: 0, height: 36, padding: "0 16px", border: "none", borderRadius: 8, background: copied ? C.green : C.purple, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans'", transition: "background .2s" }}>
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>

        {/* Native share (mobile) */}
        {typeof navigator !== "undefined" && navigator.share && (
          <button onClick={() => navigator.share({ title: formTitle, url })}
            style={{ width: "100%", height: 36, border: `1px solid ${C.border}`, borderRadius: 8, background: "none", color: C.purple, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans'", marginBottom: 14 }}>
            📤 Share via…
          </button>
        )}

        <button onClick={onClose}
          style={{ fontSize: 12, color: C.textMuted, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans'" }}>
          Close
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Auth identity banner
//  Shown INSIDE the form body (not sticky top bar)
//  3 states:
//    "signed-in"  → green, shows name, sign-out button
//    "guest"      → purple, optional sign-in CTA (public forms only)
//    null         → nothing (private form after auth)
// ─────────────────────────────────────────────────────────────────────────────
const IdentityBanner = ({ userEmail, isSignedIn, isPublicForm, onSignIn, onSignOut, C }) => {
  if (isSignedIn) {
    return (
      <div style={{ background: C.greenPale, border: `1px solid ${C.greenBorder}`, borderRadius: 12, padding: "12px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12, animation: "slideDown .2s ease" }}>
        {/* Avatar */}
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg,${C.green},#34D399)`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
          {(userEmail?.[0] || "?").toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.green }}>Submitting as yourself</div>
          <div style={{ fontSize: 11, color: C.textSecond, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userEmail}</div>
        </div>
        <button onClick={onSignOut}
          style={{ flexShrink: 0, fontSize: 11, color: C.textSecond, background: "none", border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 11px", cursor: "pointer", fontFamily: "'DM Sans'" }}>
          Sign out
        </button>
      </div>
    );
  }

  // Only show guest CTA on public forms
  if (!isPublicForm) return null;

  return (
    <div style={{ background: `linear-gradient(135deg,${C.purplePale},#F5F3FF)`, border: `1px solid ${C.purpleMid}`, borderRadius: 12, padding: "14px 16px", marginBottom: 18, animation: "slideDown .2s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.purple, marginBottom: 3 }}>
            🏢 PMW Employee? Sign in to track your submission
          </div>
          <div style={{ fontSize: 11, color: C.textSecond, lineHeight: 1.6 }}>
            You can fill this form without signing in. Signing in with your M365 account links the submission to your identity so you can track approval status from your dashboard.
          </div>
        </div>
        <button onClick={onSignIn}
          style={{ flexShrink: 0, height: 36, padding: "0 18px", border: "none", borderRadius: 9, background: `linear-gradient(135deg,${C.purple},${C.purpleLight})`, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans'", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 2px 10px rgba(91,33,182,.25)" }}>
          <MsIcon /> Sign in
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Document header banner (ISO + companies)
// ─────────────────────────────────────────────────────────────────────────────
const DocumentHeader = ({ formTitle, formVersion, formId, isoStandards, companies, C }) => {
  const isoLine = isoStandards || "ISO 9001 · ISO 14001 · ISO 45001";
  const companyList = (companies || "").split("\n").filter(Boolean);
  const label = { width: 140, borderRight: `1px solid ${C.border}`, background: C.offWhite, padding: "9px 14px", fontWeight: 600, fontSize: 10, color: C.textSecond, textTransform: "uppercase", letterSpacing: ".04em", verticalAlign: "middle" };
  const value = { padding: "9px 14px", color: C.textPrimary, fontSize: 13, verticalAlign: "middle" };
  return (
    <div style={{ background: C.cardBg, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: 22, boxShadow: C.shadow }}>
      <div style={{ background: `linear-gradient(135deg,${C.purpleDark},${C.purple})`, padding: "16px 22px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,.5)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 3 }}>{isoLine}</div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 17, color: "#fff" }}>{formTitle}</div>
        </div>
        <span style={{ fontSize: 10, color: "#DDD6FE", background: "rgba(255,255,255,.1)", borderRadius: 20, padding: "3px 13px", border: "1px solid rgba(255,255,255,.15)" }}>v{formVersion}</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ ...label, textAlign: "center", padding: "10px 14px" }}>
              <img src={logo} alt="logo" style={{ maxHeight: 36, objectFit: "contain" }} />
            </td>
            <td style={{ padding: "12px 16px", fontWeight: 700, fontSize: 13, color: C.textPrimary }}>PMW INTERNATIONAL BERHAD</td>
          </tr>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={label}>Form Title</td>
            <td style={value}>{formTitle}</td>
          </tr>
          {companyList.length > 0 && (
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={label}>Companies</td>
              <td style={{ ...value, lineHeight: 1.9 }}>{companyList.map((c, i) => <div key={i}>{c}</div>)}</td>
            </tr>
          )}
          <tr>
            <td style={label}>Doc No.</td>
            <td style={{ ...value, fontFamily: "monospace" }}>{formId}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Success screen
// ─────────────────────────────────────────────────────────────────────────────
const SuccessScreen = ({ formTitle, submittedAs, onReset, C }) => (
  <div style={{ textAlign: "center", padding: "60px 20px", animation: "fadeUp .3s ease" }}>
    <div style={{ width: 72, height: 72, borderRadius: "50%", background: C.greenPale, border: `2px solid ${C.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 32 }}>✓</div>
    <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 26, color: C.textPrimary, marginBottom: 10 }}>Submitted Successfully</div>
    <p style={{ color: C.textSecond, fontSize: 14, lineHeight: 1.8, maxWidth: 420, margin: "0 auto 10px" }}>
      Your response for <strong>{formTitle}</strong> has been recorded.
    </p>
    <div style={{ fontSize: 12, color: submittedAs?.isUser ? C.green : C.textMuted, marginBottom: 28 }}>
      {submittedAs?.isUser
        ? `✓ Submitted as ${submittedAs.email}`
        : "Submitted as guest — sign in next time to track your submission"}
    </div>
    <button onClick={onReset}
      style={{ padding: "11px 30px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.cardBg, color: C.textSecond, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans'" }}>
      Submit another response
    </button>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
//  Private gate
// ─────────────────────────────────────────────────────────────────────────────
const PrivateGate = ({ formTitle, onSignIn, C }) => (
  <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
    <div style={{ background: C.cardBg, borderRadius: 22, padding: "56px 44px", maxWidth: 420, width: "100%", textAlign: "center", boxShadow: C.shadowLg, border: `1px solid ${C.border}`, animation: "fadeUp .3s ease" }}>
      <div style={{ width: 66, height: 66, borderRadius: 18, margin: "0 auto 22px", background: C.purplePale, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>🔒</div>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, color: C.textPrimary, marginBottom: 10 }}>Sign in required</div>
      <p style={{ color: C.textSecond, fontSize: 13, lineHeight: 1.7, marginBottom: 32 }}>
        <strong>{formTitle || "This form"}</strong> is restricted to authorised Microsoft 365 users only.
      </p>
      <button onClick={onSignIn}
        style={{ width: "100%", padding: "14px", borderRadius: 11, border: "none", background: `linear-gradient(135deg,${C.purple},${C.purpleLight})`, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans'", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 3px 16px rgba(91,33,182,.3)" }}>
        <MsIcon /> Sign in with Microsoft 365
      </button>
      <div style={{ marginTop: 18, fontSize: 11, color: C.textMuted }}>PMW HR Forms · Restricted Access</div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
//  Main page component
// ─────────────────────────────────────────────────────────────────────────────
export default function DynamicFormPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const pinVersion = searchParams.get("version");

  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  // ── Theme ─────────────────────────────────────────────────────────────────────
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("dfp_dark") === "1"; } catch { return false; }
  });
  const toggleDark = useCallback(() => {
    setDark(d => { const n = !d; try { localStorage.setItem("dfp_dark", n ? "1" : "0"); } catch {} return n; });
  }, []);
  const C = dark ? DARK : LIGHT;

  useEffect(() => {
    document.body.style.background = C.bg;
    document.body.style.color = C.textPrimary;
    return () => { document.body.style.background = ""; document.body.style.color = ""; };
  }, [dark]);

  // ── UI state ──────────────────────────────────────────────────────────────────
  const [showShare, setShowShare] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState(null);       // { formConfig, surveyJson, meta }
  const [patchedJson, setPatchedJson] = useState(null); // surveyJson with SP choices injected
  const [choicesLoading, setChoicesLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitStatus, setSubmitStatus] = useState(null);
  const [submittedAs, setSubmittedAs] = useState(null);
  const [resetKey, setResetKey] = useState(0);

  // ── Token — optional, never blocks public form ────────────────────────────────
  const tokenRef = useRef(null);
  const userEmail = accounts[0]?.username || null;

  // Try to silently pick up an existing MSAL session.
  // This runs AFTER the form loads — never blocks or redirects.
  useEffect(() => {
    if (inProgress !== InteractionStatus.None) return;
    if (!isAuthenticated) return; // no active session — that's fine
    const origin = new URL(process.env.REACT_APP_SP_SITE_URL || "https://placeholder.sharepoint.com").origin;
    instance.acquireTokenSilent({
      scopes: [`${origin}/AllSites.Manage`],
      account: accounts[0],
    }).then(r => {
      tokenRef.current = r.accessToken;
    }).catch(() => {
      // Silent fail — user just won't be "signed in" on this form
    });
  }, [isAuthenticated, inProgress, instance, accounts]);

  // ── Load form — public forms use system API, no user token needed ─────────────
  useEffect(() => {
    if (!slug) { setError("No form slug provided."); setLoading(false); return; }

    const load = async () => {
      try {
        // Try with user token first (already signed in admin user etc.)
        const origin = new URL(process.env.REACT_APP_SP_SITE_URL || "https://placeholder.sharepoint.com").origin;
        let token = tokenRef.current;

        // Non-blocking silent attempt
        if (!token && inProgress === InteractionStatus.None && isAuthenticated) {
          try {
            const r = await instance.acquireTokenSilent({ scopes: [`${origin}/AllSites.Manage`], account: accounts[0] });
            token = r.accessToken;
            tokenRef.current = token;
          } catch { /* no token, will use system API */ }
        }

        if (token) {
          // ── Authenticated path: hit SP REST directly ─────────────────────────
          let versionData;
          if (pinVersion) {
            const cfgRaw = await fetch(
              `${SP_SITE_URL}/_api/web/lists/getbytitle('Master Form')/items?$filter=Slug eq '${encodeURIComponent(slug)}'&$select=Title,CurrentVersion,FormID,NumberOfApprovalLayer,Slug,IsPublic,ApprovalRules,ConditionField&$top=1`,
              { headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata" } }
            ).then(r => r.json()).then(d => d.value?.[0]);
            if (!cfgRaw) throw new Error(`Form "${slug}" not found.`);
            const ver = await getFormVersion(token, cfgRaw.Title, pinVersion);
            if (!ver) throw new Error(`Version ${pinVersion} not found.`);
            versionData = { ...cfgRaw, versionData: ver };
          } else {
            versionData = await getLatestFormBySlug(token, slug);
            if (!versionData) throw new Error(`Form "${slug}" not found or not published.`);
          }
          setFormData({
            formConfig: versionData,
            surveyJson: versionData.versionData?.surveyJson || versionData.versionData,
            meta: versionData.versionData?.meta || {},
          });
        } else {
          // ── Unauthenticated path: use system API route ────────────────────────
          // Your /api/form-config endpoint fetches form config + version JSON
          // using the system account (SYSTEM_CLIENT_ID/SECRET), no user token needed.
          const res = await fetch(`/api/form-config?slug=${encodeURIComponent(slug)}${pinVersion ? `&version=${pinVersion}` : ""}`);
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Form not found (${res.status})`);
          }
          const data = await res.json();
          setFormData({ formConfig: data.formConfig, surveyJson: data.surveyJson, meta: data.meta || {} });
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [slug, pinVersion]); // deliberately minimal deps — never re-runs on auth change

  // ── Inject SP choices ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!formData?.surveyJson) return;
    const token = tokenRef.current;
    const elements = formData.surveyJson?.pages?.[0]?.elements ?? [];
    const needsInjection = elements.some(el => el.spChoicesSource?.list && el.spChoicesSource?.column);

    if (!needsInjection || !token) {
      setPatchedJson(formData.surveyJson);
      return;
    }

    setChoicesLoading(true);
    (async () => {
      try {
        const patched = await Promise.all(elements.map(async el => {
          if (!el.spChoicesSource?.list || !el.spChoicesSource?.column) return el;
          try {
            const filterPart = el.spChoicesSource.filter ? `&$filter=${encodeURIComponent(el.spChoicesSource.filter)}` : "";
            const labelCol = el.spChoicesSource.labelColumn || el.spChoicesSource.column;
            const cols = labelCol !== el.spChoicesSource.column ? `${el.spChoicesSource.column},${labelCol}` : el.spChoicesSource.column;
            const data = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(el.spChoicesSource.list)}')/items?$select=${encodeURIComponent(cols)}${filterPart}&$top=500`);
            const choices = (data.value ?? []).map(item => {
              const val = item[el.spChoicesSource.column];
              const lbl = item[labelCol];
              return val === lbl ? String(val) : { value: String(val), text: String(lbl) };
            }).filter(Boolean);
            return { ...el, type: el.spChoicesSource.multiSelect ? "checkbox" : "dropdown", choices };
          } catch { return el; }
        }));
        setPatchedJson({ ...formData.surveyJson, pages: [{ ...formData.surveyJson.pages[0], elements: patched }] });
      } catch { setPatchedJson(formData.surveyJson); }
      finally { setChoicesLoading(false); }
    })();
  }, [formData]);

  // ── Build SurveyJS model ──────────────────────────────────────────────────────
  const survey = useMemo(() => {
    const json = patchedJson ?? formData?.surveyJson;
    if (!json) return null;
    try {
      registerQuestionData(json);
      const m = new Model(json);
      m.applyTheme(dark ? LayeredDarkPanelless : LayeredLightPanelless);
      m.showCompletedPage = false;
      return m;
    } catch (e) { console.error("[DFP] Model error:", e); return null; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patchedJson, resetKey]);

  useEffect(() => { survey?.applyTheme(dark ? LayeredDarkPanelless : LayeredLightPanelless); }, [dark, survey]);

  // ── Submit ────────────────────────────────────────────────────────────────────
  const lastDataRef = useRef(null);

  const onCompleting = useCallback((sender) => { lastDataRef.current = { ...sender.data }; }, []);

  const onComplete = useCallback(async () => {
    setSubmitStatus("loading");
    const raw = lastDataRef.current ?? {};
    const cfg = formData?.formConfig;
    if (!cfg) { setSubmitStatus("error"); return; }

    try {
      // ── Resolve approval layers ──────────────────────────────────────────────
      let activeLayers = [], resolvedLayerCount = cfg.NumberOfApprovalLayer ?? 0;
      const token = tokenRef.current;

      let approvalRules = null;
      try { approvalRules = cfg.ApprovalRules ? JSON.parse(cfg.ApprovalRules) : null; } catch {}

      if (approvalRules?.conditionField && approvalRules?.rules?.length) {
        const condVal = String(raw[approvalRules.conditionField] ?? "").toLowerCase();
        const matched = approvalRules.rules.find(r => r.when.toLowerCase() === condVal);
        if (matched) { activeLayers = matched.layers; resolvedLayerCount = matched.layers.length; }
      } else if (token) {
        const apData = await spGet(token,
          `${SP_SITE_URL}/_api/web/lists/getbytitle('Approvers')/items?$filter=FormTitle eq '${encodeURIComponent(cfg.Title)}'&$select=LayerNumber,ApproverEmail,ApproverName&$orderby=LayerNumber asc&$top=10`
        ).catch(() => ({ value: [] }));
        activeLayers = (apData.value ?? []).map(a => ({ email: a.ApproverEmail, name: a.ApproverName, role: "" }));
        resolvedLayerCount = activeLayers.length;
      }

      // ── Build body ───────────────────────────────────────────────────────────
      const body = {};
      for (const [k, v] of Object.entries(raw)) {
        if (v && typeof v === "object" && v.html && v.json) {
          // Dynamic matrix: save HTML table to _Response (Enhanced Rich Text)
          // and raw JSON to _Json (plain multi-line) for backup
          body[`${k}_Response`] = v.html;
          body[`${k}_Json`]     = typeof v.json === "string" ? v.json : JSON.stringify(v.json);
        } else if (Array.isArray(v)) {
          // Array answers (checkbox etc.) — stringify
          body[k] = JSON.stringify(v);
        } else if (v && typeof v === "object") {
          body[k] = JSON.stringify(v);
        } else {
          body[k] = v;
        }
      }
      body.SubmittedAt = new Date().toISOString();
      body.FormVersion = cfg.CurrentVersion;
      body.FormID = cfg.FormID;
      for (let n = 1; n <= resolvedLayerCount; n++) {
        body[`L${n}_Status`] = n === 1 ? "Pending" : "Waiting";
        body[`L${n}_Email`] = activeLayers[n - 1]?.email ?? "";
        body[`L${n}_Role`] = activeLayers[n - 1]?.role ?? "";
      }

      if (token) {
        // ── Authenticated submit — as the user ───────────────────────────────
        body.SubmittedBy = userEmail || accounts[0]?.username || "authenticated-user";
        await spPost(token,
          `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(cfg.Title)}')/items`,
          body
        );
        setSubmittedAs({ isUser: true, email: body.SubmittedBy });
      } else {
        // ── Guest submit — system account via API route ──────────────────────
        body.SubmittedBy = "GUEST";
        const res = await fetch("/api/submit-form", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listTitle: cfg.Title, body }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Submit failed: ${res.status}`);
        }
        setSubmittedAs({ isUser: false, email: null });
      }

      setSubmitStatus("success");
    } catch (e) {
      console.error("[DFP] submit error:", e);
      setSubmitStatus("error");
    }
  }, [formData, userEmail, accounts]);

  useEffect(() => {
    if (!survey) return;
    survey.onCompleting.add(onCompleting);
    survey.onComplete.add(onComplete);
    return () => { survey.onCompleting.remove(onCompleting); survey.onComplete.remove(onComplete); };
  }, [survey, onCompleting, onComplete]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleSignIn = useCallback(() => {
    instance.loginRedirect({ ...loginRequest, redirectStartPage: window.location.href });
  }, [instance]);

  const handleSignOut = useCallback(() => {
    instance.logoutRedirect({ postLogoutRedirectUri: window.location.href });
  }, [instance]);

  const handleReset = useCallback(() => {
    setSubmitStatus(null);
    setSubmittedAs(null);
    lastDataRef.current = null;
    setResetKey(k => k + 1);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const isPublicForm = formData?.formConfig?.IsPublic !== false;
  const showBannerHeader = formData?.meta?.showBanner !== false;
  const formTitle = formData?.formConfig?.Title || formData?.surveyJson?.title || "Form";
  const formVersion = formData?.formConfig?.CurrentVersion || "1.0";
  const formId = formData?.formConfig?.FormID || "";
  const meta = formData?.meta || {};
  const formUrl = typeof window !== "undefined" ? window.location.href : "";

  // ── Render: loading ───────────────────────────────────────────────────────────
  if (loading || (formData && !patchedJson && !error)) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <style>{globalCss(C)}</style>
        <Spinner C={C} />
        <div style={{ fontSize: 13, color: C.textMuted, animation: "pulse 1.5s infinite" }}>
          {choicesLoading ? "Loading choices from SharePoint…" : "Loading form…"}
        </div>
      </div>
    );
  }

  // ── Render: error ─────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{globalCss(C)}</style>
        <div style={{ background: C.cardBg, borderRadius: 20, padding: "56px 44px", maxWidth: 420, textAlign: "center", boxShadow: C.shadowLg, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 44, marginBottom: 18 }}>⚠️</div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: C.red, marginBottom: 10 }}>Form not found</div>
          <p style={{ color: C.textSecond, fontSize: 13, lineHeight: 1.7 }}>{error}</p>
        </div>
      </div>
    );
  }

  // ── Render: private gate ──────────────────────────────────────────────────────
  if (!isPublicForm && !isAuthenticated) {
    return (
      <>
        <style>{globalCss(C)}</style>
        <PrivateGate formTitle={formTitle} onSignIn={handleSignIn} C={C} />
      </>
    );
  }

  // ── Render: main ──────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <style>{globalCss(C)}</style>
      <ScrollProgress C={C} />

      {/* Sticky header */}
      <header style={{ background: C.cardBg, borderBottom: `1px solid ${C.border}`, height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", position: "sticky", top: 0, zIndex: 50, boxShadow: "0 1px 0 rgba(91,33,182,.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={logo} alt="logo" style={{ height: 26, objectFit: "contain" }} />
          <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 15, color: C.textPrimary }}>{formTitle}</span>
          {pinVersion && <Pill color={C.amber} bg={C.amberPale}>Viewing v{pinVersion}</Pill>}
          {!isPublicForm && <Pill color={C.purple} bg={C.purplePale}>🔒 Private</Pill>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isAuthenticated
            ? (
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: C.green }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.green }} />
                {userEmail?.split("@")[0]}
              </div>
            ) : (
              <button onClick={handleSignIn}
                style={{ height: 28, padding: "0 13px", border: `1px solid ${C.purpleMid}`, borderRadius: 8, background: "none", color: C.purple, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans'", display: "flex", alignItems: "center", gap: 6 }}>
                <MsIcon /> Sign in
              </button>
            )
          }
          <span style={{ fontSize: 10, color: C.textMuted }}>v{formVersion}</span>
        </div>
      </header>

      {/* Body */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px 88px", animation: "fadeUp .3s ease" }}>
        {submitStatus === "success" ? (
          <SuccessScreen formTitle={formTitle} submittedAs={submittedAs} onReset={handleReset} C={C} />
        ) : (
          <>
            {/* Identity banner */}
            <IdentityBanner
              userEmail={userEmail}
              isSignedIn={isAuthenticated}
              isPublicForm={isPublicForm}
              onSignIn={handleSignIn}
              onSignOut={handleSignOut}
              C={C}
            />

            {/* Document header (togglable) */}
            {showBannerHeader && (
              <DocumentHeader
                formTitle={formTitle}
                formVersion={formVersion}
                formId={formId}
                isoStandards={meta.isoStandards}
                companies={meta.companies}
                C={C}
              />
            )}

            {/* Survey */}
            {survey ? (
              <div className="dfp-survey-wrap">
                <Survey model={survey} />
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 40, color: C.textMuted }}>Unable to render form.</div>
            )}

            {/* Status messages */}
            {submitStatus === "loading" && (
              <div style={{ marginTop: 16, padding: "13px 16px", background: C.purplePale, border: `1px solid ${C.purpleMid}`, borderRadius: 10, color: C.purple, fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
                <Spinner size={14} C={C} /> Submitting…
              </div>
            )}
            {submitStatus === "error" && (
              <div style={{ marginTop: 16, padding: "13px 16px", background: C.redPale, border: "1px solid #FCA5A5", borderRadius: 10, color: C.red, fontSize: 13 }}>
                ❌ Submission failed. Please try again or contact IT support.
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 32, textAlign: "center", fontSize: 11, color: C.textMuted }}>
          PMW International Berhad · HR Forms · Confidential
        </div>
      </div>

      {/* Floating bar */}
      <FloatingBar dark={dark} onToggleDark={toggleDark} onShare={() => setShowShare(true)} C={C} />

      {/* Share modal */}
      {showShare && <ShareModal url={formUrl} formTitle={formTitle} onClose={() => setShowShare(false)} C={C} />}
    </div>
  );
}
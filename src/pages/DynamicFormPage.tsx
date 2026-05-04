/**
 * DynamicFormPage.tsx - Public form renderer
 * Route: /form/:formId
 */
// @ts-nocheck - Pre-existing type errors from incomplete implementations
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import { LayeredDarkPanelless, LayeredLightPanelless } from "survey-core/themes";
import "survey-core/survey-core.min.css";

import { registerDynamicMatrix, registerQuestionData } from "../utils/DynamicMatrix";
import { getLatestFormBySlug, getFormVersion, spGet, spPost, triggerApprovalNotification } from "../utils/formBuilderSP";
import { loginRequest } from "../auth/msalConfig";

registerDynamicMatrix();

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

// Theme tokens
const LIGHT = {
  purple: "#5B21B6", purpleLight: "#7C3AED", purplePale: "#EDE9FE", purpleMid: "#DDD6FE",
  purpleDark: "#3B0764", bg: "#F8F7FF", cardBg: "#FFFFFF", offWhite: "#F8F7FF", border: "#E5E3F0",
  textPrimary: "#1E1B4B", textSecond: "#6B7280", textMuted: "#9CA3AF",
  green: "#059669", greenPale: "#D1FAE5", greenBorder: "#6EE7B7",
  red: "#DC2626", redPale: "#FEE2E2", amber: "#D97706", amberPale: "#FEF3C7",
  shadow: "0 1px 3px rgba(91,33,182,0.08),0 4px 16px rgba(91,33,182,0.06)",
  shadowLg: "0 8px 40px rgba(91,33,182,0.16)", shadowFab: "0 4px 20px rgba(91,33,182,0.18)",
};

const DARK = {
  ...LIGHT, bg: "#0F0B1E", cardBg: "#1A1330", offWhite: "#160E28", border: "#2D2456",
  textPrimary: "#EDE9FE", textSecond: "#A78BFA", textMuted: "#6D5FA6",
  greenPale: "#052e16", greenBorder: "#166534", redPale: "#3b0707", amberPale: "#2d1b00",
  shadow: "0 1px 3px rgba(0,0,0,.4),0 4px 16px rgba(0,0,0,.3)",
  shadowLg: "0 8px 40px rgba(0,0,0,.5)", shadowFab: "0 4px 20px rgba(0,0,0,.4)",
};

const globalCss = (t: typeof LIGHT) => `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'DM Sans',sans-serif;background:${t.bg};color:${t.textPrimary};transition:background .3s,color .3s}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  .dfp-survey-wrap .sd-root-modern{background:transparent!important}
  ::-webkit-scrollbar{width:5px}
  ::-webkit-scrollbar-thumb{background:${t.purpleMid};border-radius:10px}
`;

const Spinner = ({ size = 30, t }: { size?: number; t: typeof LIGHT }) => (
  <div style={{ width: size, height: size, border: `2.5px solid ${t.purpleMid}`, borderTop: `2.5px solid ${t.purple}`, borderRadius: "50%", animation: "spin .85s linear infinite", flexShrink: 0 }} />
);

const MsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="6.5" height="6.5" fill="#F25022" />
    <rect x="8.5" y="1" width="6.5" height="6.5" fill="#7FBA00" />
    <rect x="1" y="8.5" width="6.5" height="6.5" fill="#00A4EF" />
    <rect x="8.5" y="8.5" width="6.5" height="6.5" fill="#FFB900" />
  </svg>
);

const ScrollProgress = ({ t }: { t: typeof LIGHT }) => {
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
      <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${t.purple},${t.purpleLight})`, transition: "width .1s linear", borderRadius: "0 2px 2px 0" }} />
    </div>
  );
};

const SuccessScreen = ({ formTitle, onReset, t }: { formTitle: string; onReset: () => void; t: typeof LIGHT }) => (
  <div style={{ textAlign: "center", padding: "60px 20px", animation: "fadeUp .3s ease" }}>
    <div style={{ width: 72, height: 72, borderRadius: "50%", background: t.greenPale, border: `2px solid ${t.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 32 }}>OK</div>
    <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 26, color: t.textPrimary, marginBottom: 10 }}>Submitted Successfully</div>
    <p style={{ color: t.textSecond, fontSize: 14, lineHeight: 1.8, maxWidth: 420, margin: "0 auto 10px" }}>Your response for <strong>{formTitle}</strong> has been recorded.</p>
    <button onClick={onReset} style={{ padding: "11px 30px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.cardBg, color: t.textSecond, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans'" }}>Submit another response</button>
  </div>
);

const PrivateGate = ({ formTitle, onSignIn, t }: { formTitle: string; onSignIn: () => void; t: typeof LIGHT }) => (
  <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
    <div style={{ background: t.cardBg, borderRadius: 22, padding: "56px 44px", maxWidth: 420, width: "100%", textAlign: "center", boxShadow: t.shadowLg, border: `1px solid ${t.border}`, animation: "fadeUp .3s ease" }}>
      <div style={{ width: 66, height: 66, borderRadius: 18, margin: "0 auto 22px", background: t.purplePale, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>LOCK</div>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, color: t.textPrimary, marginBottom: 10 }}>Sign in required</div>
      <p style={{ color: t.textSecond, fontSize: 13, lineHeight: 1.7, marginBottom: 32 }}><strong>{formTitle || "This form"}</strong> is restricted.</p>
      <button onClick={onSignIn} style={{ width: "100%", padding: "14px", borderRadius: 11, border: "none", background: `linear-gradient(135deg,${t.purple},${t.purpleLight})`, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans'", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <MsIcon /> Sign in with Microsoft 365
      </button>
    </div>
  </div>
);

export default function DynamicFormPage() {
  const { formId } = useParams<{ formId: string }>();
  const [searchParams] = useSearchParams();
  const pinVersion = searchParams.get("version");
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const [dark, setDark] = useState(() => { try { return localStorage.getItem("dfp_dark") === "1"; } catch { return false; } });
  const _toggleDark = useCallback(() => { setDark(d => { const n = !d; try { localStorage.setItem("dfp_dark", n ? "1" : "0"); } catch {} return n; }); }, []);
  const t = dark ? DARK : LIGHT;

  useEffect(() => { document.body.style.background = t.bg; document.body.style.color = t.textPrimary; return () => { document.body.style.background = ""; document.body.style.color = ""; }; }, [t]);

  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<{ formConfig: Record<string, unknown>; surveyJson: Record<string, unknown>; meta: Record<string, unknown> } | null>(null);
  const [error, setError] = useState("");
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const tokenRef = useRef<string | null>(null);
  const userEmail = accounts[0]?.username || null;
  const lastDataRef = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (inProgress !== InteractionStatus.None) return;
    if (!isAuthenticated) return;
    const origin = new URL(import.meta.env.VITE_SP_SITE_URL || "https://placeholder.sharepoint.com").origin;
    instance.acquireTokenSilent({ scopes: [`${origin}/AllSites.Manage`], account: accounts[0] }).then(r => { tokenRef.current = r.accessToken; }).catch(() => {});
  }, [isAuthenticated, inProgress, instance, accounts]);

  useEffect(() => {
    if (!formId) { setError("No form slug provided."); setLoading(false); return; }
    const load = async () => {
      try {
        const origin = new URL(import.meta.env.VITE_SP_SITE_URL || "https://placeholder.sharepoint.com").origin;
        let token = tokenRef.current;
        if (!token && inProgress === InteractionStatus.None && isAuthenticated) {
          try { const r = await instance.acquireTokenSilent({ scopes: [`${origin}/AllSites.Manage`], account: accounts[0] }); token = r.accessToken; tokenRef.current = token; } catch {} }
        if (token) {
          let versionData;
          if (pinVersion) {
            const cfgRaw = await fetch(`${SP_SITE_URL}/_api/web/lists/getbytitle('Master Form')/items?$filter=Slug eq '${encodeURIComponent(formId)}'&$select=Title,CurrentVersion,FormID,NumberOfApprovalLayer,Slug,IsPublic&$top=1`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata" } }).then(r => r.json()).then(d => d.value?.[0]);
            if (!cfgRaw) throw new Error(`Form "${formId}" not found.`);
            const ver = await getFormVersion(token, cfgRaw.Title, pinVersion);
            if (!ver) throw new Error(`Version ${pinVersion} not found.`);
            versionData = { ...cfgRaw, versionData: ver };
          } else { versionData = await getLatestFormBySlug(token, formId); if (!versionData) throw new Error(`Form "${formId}" not found.`); }
          setFormData({ formConfig: versionData, surveyJson: versionData.versionData?.surveyJson || versionData.versionData, meta: versionData.versionData?.meta || {} });
        } else {
          const res = await fetch(`/api/form-config?slug=${encodeURIComponent(formId)}${pinVersion ? `&version=${pinVersion}` : ""}`);
          if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `Form not found (${res.status})`); }
          const data = await res.json(); setFormData({ formConfig: data.formConfig, surveyJson: data.surveyJson, meta: data.meta || {} });
        }
      } catch (e) { setError(e.message); } finally { setLoading(false); }
    };
    load();
  }, [formId, pinVersion, isAuthenticated, inProgress, instance, accounts]);

  const survey = useMemo(() => {
    const json = formData?.surveyJson;
    if (!json) return null;
    try { registerQuestionData(json); const m = new Model(json); m.applyTheme(dark ? LayeredDarkPanelless : LayeredLightPanelless); m.showCompletedPage = false; return m; } catch (e) { console.error("[DFP] Model error:", e); return null; }
  }, [formData, resetKey]);

  useEffect(() => { survey?.applyTheme(dark ? LayeredDarkPanelless : LayeredLightPanelless); }, [dark, survey]);

  const onCompleting = useCallback((sender: { data: Record<string, unknown> }) => { lastDataRef.current = { ...sender.data }; }, []);
  const onComplete = useCallback(async () => {
    setSubmitStatus("loading");
    const raw = lastDataRef.current ?? {};
    const cfg = formData?.formConfig;
    if (!cfg) { setSubmitStatus("error"); return; }
    try {
      let activeLayers: { email: string; name: string; role: string }[] = [];
      let resolvedLayerCount = cfg.NumberOfApprovalLayer ?? 0;
      const token = tokenRef.current;
      let approvalRules = null;
      try { approvalRules = cfg.ApprovalRules ? JSON.parse(cfg.ApprovalRules as string) : null; } catch {}
      if (approvalRules?.conditionField && approvalRules?.rules?.length) {
        const condVal = String(raw[approvalRules.conditionField] ?? "").toLowerCase();
        const matched = approvalRules.rules.find((r: Record<string, unknown>) => (r.when as string).toLowerCase() === condVal);
        if (matched) { activeLayers = matched.layers; resolvedLayerCount = matched.layers.length; }
      } else if (token) {
        const apData = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Approvers')/items?$filter=FormTitle eq '${encodeURIComponent(cfg.Title as string)}'&$select=LayerNumber,ApproverEmail,ApproverName&$orderby=LayerNumber asc&$top=10`).catch(() => ({ value: [] }));
        activeLayers = (apData.value ?? []).map((a: Record<string, string>) => ({ email: a.ApproverEmail, name: a.ApproverName, role: "" }));
        resolvedLayerCount = activeLayers.length;
      }
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (v && typeof v === "object" && (v as Record<string, unknown>).html && (v as Record<string, unknown>).json) {
          body[`${k}_Response`] = (v as Record<string, unknown>).html;
          body[`${k}_Json`] = typeof (v as Record<string, unknown>).json === "string" ? (v as Record<string, unknown>).json : JSON.stringify((v as Record<string, unknown>).json);
        } else if (Array.isArray(v)) { body[k] = JSON.stringify(v); }
        else if (v && typeof v === "object") { body[k] = JSON.stringify(v); }
        else { body[k] = v; }
      }
      body.SubmittedAt = new Date().toISOString();
      body.FormVersion = cfg.CurrentVersion;
      body.FormID = cfg.FormID;
      for (let n = 1; n <= resolvedLayerCount; n++) { body[`L${n}_Status`] = n === 1 ? "Pending" : "Waiting"; body[`L${n}_Email`] = activeLayers[n - 1]?.email ?? ""; }
      let submittedByEmail = "";
      if (token) {
        submittedByEmail = userEmail || accounts[0]?.username || "authenticated-user";
        body.SubmittedBy = submittedByEmail;
        const result = await spPost(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(cfg.Title as string)}')/items`, body) as { Id?: number };
        // Trigger approval notification if there are layers
        if (resolvedLayerCount > 0 && result?.Id) {
          await triggerApprovalNotification(token, {
            formTitle: cfg.Title as string,
            submittedBy: submittedByEmail,
            responseItemId: result.Id,
            layer: 1,
            totalLayers: resolvedLayerCount,
            action: "submit",
          }).catch(e => console.warn("[DFP] approval notification skipped:", e.message));
        }
      } else {
        submittedByEmail = "GUEST";
        body.SubmittedBy = submittedByEmail;
        const res = await fetch("/api/submit-form", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listTitle: cfg.Title, body }) });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `Submit failed: ${res.status}`); }
      }
      setSubmitStatus("success");
    } catch (e) { console.error("[DFP] submit error:", e); setSubmitStatus("error"); }
  }, [formData, userEmail, accounts]);

  useEffect(() => {
    if (!survey) return;
    survey.onCompleting.add(onCompleting);
    survey.onComplete.add(onComplete);
    return () => { survey.onCompleting.remove(onCompleting); survey.onComplete.remove(onComplete); };
  }, [survey, onCompleting, onComplete]);

  const handleSignIn = useCallback(() => { instance.loginRedirect({ ...loginRequest, redirectStartPage: window.location.href }); }, [instance]);
  const handleSignOut = useCallback(() => { instance.logoutRedirect({ postLogoutRedirectUri: window.location.href }); }, [instance]);
  const handleReset = useCallback(() => { setSubmitStatus(null); lastDataRef.current = null; setResetKey(k => k + 1); }, []);

  const isPublicForm = formData?.formConfig?.IsPublic !== false;
  const _showBannerHeader = formData?.meta?.showBanner !== false;
  const formTitle = formData?.formConfig?.Title || formData?.surveyJson?.title || "Form";
  const formVersion = formData?.formConfig?.CurrentVersion || "1.0";

  if (loading || (formData && !formData.surveyJson && !error)) return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <style>{globalCss(t)}</style>
      <Spinner t={t} />
      <div style={{ fontSize: 13, color: t.textMuted, animation: "pulse 1.5s infinite" }}>Loading form...</div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{globalCss(t)}</style>
      <div style={{ background: t.cardBg, borderRadius: 20, padding: "56px 44px", maxWidth: 420, textAlign: "center", boxShadow: t.shadowLg, border: `1px solid ${t.border}` }}>
        <div style={{ fontSize: 44, marginBottom: 18 }}>ERR</div>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: t.red, marginBottom: 10 }}>Form not found</div>
        <p style={{ color: t.textSecond, fontSize: 13, lineHeight: 1.7 }}>{error}</p>
      </div>
    </div>
  );

  if (!isPublicForm && !isAuthenticated) return (<><style>{globalCss(t)}</style><PrivateGate formTitle={formTitle} onSignIn={handleSignIn} t={t} /></>);

  return (
    <div style={{ minHeight: "100vh", background: t.bg }}>
      <style>{globalCss(t)}</style>
      <ScrollProgress t={t} />
      <header style={{ background: t.cardBg, borderBottom: `1px solid ${t.border}`, height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href="/" title="Back to Dashboard" style={{ display: "flex", alignItems: "center", gap: 4, height: 28, padding: "0 10px", border: `1px solid ${t.border}`, borderRadius: 6, background: "none", color: t.textSecond, fontSize: 11, textDecoration: "none", cursor: "pointer", fontFamily: "'DM Sans'" }}>← Dashboard</a>
          <span style={{ fontSize: 20, color: '#6264A7' }}>📋</span>
          <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 15, color: t.textPrimary }}>{formTitle}</span>
          {pinVersion && <span style={{ fontSize: 10, fontWeight: 700, color: t.amber, background: t.amberPale, borderRadius: 20, padding: "2px 10px" }}>v{pinVersion}</span>}
          {!isPublicForm && <span style={{ fontSize: 10, fontWeight: 700, color: t.purple, background: t.purplePale, borderRadius: 20, padding: "2px 10px" }}>Private</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isAuthenticated ? (
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: t.green }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: t.green }} />
              {userEmail?.split("@")[0]}
            </div>
          ) : (<button onClick={handleSignIn} style={{ height: 28, padding: "0 13px", border: `1px solid ${t.purpleMid}`, borderRadius: 8, background: "none", color: t.purple, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans'", display: "flex", alignItems: "center", gap: 6 }}><MsIcon /> Sign in</button>)}
          <span style={{ fontSize: 10, color: t.textMuted }}>v{formVersion}</span>
        </div>
      </header>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px 88px", animation: "fadeUp .3s ease" }}>
        {submitStatus === "success" ? (
          <SuccessScreen formTitle={formTitle} onReset={handleReset} t={t} />
        ) : (
          <div>
            {!isPublicForm && isAuthenticated && (
              <div style={{ background: t.greenPale, border: `1px solid ${t.greenBorder}`, borderRadius: 12, padding: "12px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg,${t.green},#34D399)`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700 }}>{(userEmail?.[0] || "?").toUpperCase()}</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 700, color: t.green }}>Submitting as yourself</div><div style={{ fontSize: 11, color: t.textSecond }}>{userEmail}</div></div>
                <button onClick={handleSignOut} style={{ fontSize: 11, color: t.textSecond, background: "none", border: `1px solid ${t.border}`, borderRadius: 7, padding: "5px 11px", cursor: "pointer", fontFamily: "'DM Sans'" }}>Sign out</button>
              </div>
            )}
            {survey ? <div className="dfp-survey-wrap"><Survey model={survey} /></div> : <div style={{ textAlign: "center", padding: 40, color: t.textMuted }}>Unable to render form.</div>}
            {submitStatus === "loading" && <div style={{ marginTop: 16, padding: "13px 16px", background: t.purplePale, border: `1px solid ${t.purpleMid}`, borderRadius: 10, color: t.purple, fontSize: 13 }}><Spinner size={14} t={t} /> Submitting...</div>}
            {submitStatus === "error" && <div style={{ marginTop: 16, padding: "13px 16px", background: t.redPale, border: "1px solid #FCA5A5", borderRadius: 10, color: t.red, fontSize: 13 }}>X Submission failed. Please try again.</div>}
          </div>
        )}
        <div style={{ marginTop: 32, textAlign: "center", fontSize: 11, color: t.textMuted }}>PMW International Berhad HR Forms</div>
      </div>
    </div>
  );
}
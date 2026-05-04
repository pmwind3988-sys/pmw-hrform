/**
 * ProvisionOverlay.tsx - Full-screen overlay for provisioning status
 */
import { useEffect, useRef } from "react";
import { C } from "./constants";

interface ProvisionOverlayProps {
  logs: { m: string; t: string }[];
  success?: boolean;
  error?: boolean;
  onDone: () => void;
}

const Spinner = ({ size = 18 }: { size?: number }) => (
  <div style={{
    width: size,
    height: size,
    border: `2px solid ${C.purpleMid}`,
    borderTop: `2px solid ${C.purple}`,
    borderRadius: "50%",
    animation: "spin 0.9s linear infinite",
    flexShrink: 0,
  }} />
);

const G = `@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`;

export default function ProvisionOverlay({ logs, success, error, onDone }: ProvisionOverlayProps) {
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <>
      <style>{G}</style>
      <div style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(10,5,25,.88)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}>
        <div style={{
          background: C.purpleDark,
          borderRadius: 16,
          width: "100%",
          maxWidth: 580,
          border: "1px solid rgba(167,139,250,.3)",
          boxShadow: C.shadowMd,
          overflow: "hidden",
          animation: "fadeUp .2s ease",
        }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(167,139,250,.2)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.purpleMid }}>
              {success ? "✅ Done" : error ? "❌ Failed" : "⚙️ Publishing…"}
            </div>
          </div>
          <div style={{
            padding: "12px 20px",
            fontFamily: "monospace",
            fontSize: 11,
            color: "rgba(255,255,255,.8)",
            lineHeight: 2,
            maxHeight: 360,
            overflowY: "auto",
            background: "rgba(0,0,0,.2)",
          }}>
            {logs.map((l, i) => (
              <div key={i} style={{
                color: l.t === "err" ? "#FCA5A5" : l.t === "ok" ? "#6EE7B7" : l.t === "warn" ? "#FCD34D" : "rgba(255,255,255,.7)",
              }}>
                {l.t === "err" ? "✗ " : l.t === "ok" ? "✓ " : l.t === "warn" ? "⚠ " : "› "}
                {l.m}
              </div>
            ))}
            {!success && !error && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Spinner size={11} />
                <span style={{ color: "rgba(255,255,255,.3)", animation: "pulse 1.4s infinite" }}>Working…</span>
              </div>
            )}
            <div ref={ref} />
          </div>
          {(success || error) && (
            <div style={{
              padding: "12px 20px",
              borderTop: "1px solid rgba(167,139,250,.2)",
              display: "flex",
              justifyContent: "flex-end",
            }}>
              <button
                onClick={onDone}
                style={{
                  padding: "8px 22px",
                  borderRadius: 8,
                  background: success ? C.green : C.purple,
                  color: C.white,
                  border: "none",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "'DM Sans'",
                }}
              >
                {success ? "Done →" : "Close"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
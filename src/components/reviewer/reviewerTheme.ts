/**
 * reviewerTheme.ts — colours, shared button styles and the page-level CSS for
 * the approver / evaluator screens. Colours and font come from
 * `reviewerTokens.ts`; do not paste hex values here.
 */
import type { CSSProperties } from "react";
import { FONT_STACK, R } from "./reviewerTokens";

export { R };

export const CARD_SHADOW = "0 1px 2px rgba(12, 14, 20, 0.06), 0 1px 3px rgba(12, 14, 20, 0.05)";

export const eyebrowStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: R.label,
};

export const btnBase: CSSProperties = {
  height: 46,
  padding: "0 24px",
  borderRadius: 4,
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

export const btnPrimary: CSSProperties = {
  ...btnBase,
  padding: "0 28px",
  border: "none",
  background: R.navy,
  color: R.card,
};

export const btnDisabled: CSSProperties = {
  ...btnBase,
  padding: "0 28px",
  border: "none",
  background: R.disabledBg,
  color: R.label,
};

export const btnDangerOutline: CSSProperties = {
  ...btnBase,
  padding: "0 20px",
  border: `1px solid ${R.inputBorder}`,
  background: R.card,
  color: R.red,
};

export const btnDanger: CSSProperties = {
  ...btnBase,
  border: "none",
  background: R.red,
  color: R.card,
};

export const btnGhost: CSSProperties = {
  ...btnBase,
  padding: "0 20px",
  border: `1px solid ${R.inputBorder}`,
  background: R.card,
  color: R.body,
};

/** Shared by every reviewer screen; mounted once per screen via `ReviewerStyles`. */
export const REVIEWER_CSS = `
.rv-page { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; font-family: ${FONT_STACK}; color: ${R.body}; font-size: 15px; line-height: 1.55; }
.rv-page h1, .rv-page h2, .rv-page h3 { text-wrap: balance; }
.rv-page p, .rv-page li { text-wrap: pretty; }
.rv-page button:focus-visible, .rv-page textarea:focus-visible, .rv-page a:focus-visible {
  outline: none; box-shadow: 0 0 0 3px ${R.focus};
}
.rv-btn { transition-property: transform, background-color, color, opacity; transition-duration: 150ms; transition-timing-function: cubic-bezier(0.2, 0, 0, 1); }
.rv-btn:active:not(:disabled) { transform: scale(0.97); }
.rv-btn:disabled { cursor: not-allowed; }
@keyframes rvSpin { to { transform: rotate(360deg); } }
@keyframes rvFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes rvRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.rv-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 24px; background: ${R.scrim}; animation: rvFade .2s ease; }
.rv-overlay-card { background: ${R.card}; border-radius: 10px; box-shadow: 0 18px 48px rgba(15, 14, 43, 0.22); padding: 32px 28px; max-width: 380px; width: 100%; text-align: center; animation: rvRise .25s ease; }
@media (prefers-reduced-motion: reduce) {
  .rv-overlay, .rv-overlay-card { animation: none !important; }
  .rv-btn { transition: none; }
}
.rv-jump { display: none; }
.rv-reason { font-size: 15px; }
@media (max-width: 640px) {
  .rv-main { padding: 28px 20px 120px !important; gap: 28px !important; }
  .rv-eyebrow { font-size: 11.5px !important; }
  .rv-title { font-size: 27px !important; line-height: 1.2 !important; }
  .rv-lead { font-size: 14.5px !important; }
  .rv-meta-row { grid-template-columns: minmax(0, 1fr) !important; gap: 2px !important; }
  .rv-actions { flex-direction: column-reverse; align-items: stretch !important; }
  .rv-actions > button { width: 100%; }
  .rv-eval-actions { flex-direction: column !important; align-items: stretch !important; gap: 10px !important; }
  .rv-eval-actions > button { width: 100%; }
  .rv-eval-actions > span { text-align: center; }
  .rv-reject-actions { flex-direction: column-reverse; }
  .rv-reject-actions > button { width: 100%; }
  .rv-reason { font-size: 16px; }
  .rv-header { padding: 12px 20px !important; }
  .rv-ref { font-size: 11.5px !important; }
  .rv-logo { height: 24px !important; }
  .rv-jump { display: block; position: fixed; left: 0; right: 0; bottom: 0; z-index: 900; padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); background: ${R.card}; border-top: 1px solid ${R.line}; box-shadow: 0 -4px 12px rgba(15, 23, 42, 0.06); }
  .rv-jump button { width: 100%; }
}
`;

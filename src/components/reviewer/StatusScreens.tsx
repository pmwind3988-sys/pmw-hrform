import type { ReactNode } from "react";
import logo128 from "../../assets/logo-128.png";
import ReviewerStyles from "./ReviewerStyles";
import { btnPrimary, CARD_SHADOW, eyebrowStyle, R } from "./reviewerTheme";

export type ScreenTone = "navy" | "red" | "green" | "amber" | "grey";
export type DeadEndIcon = "link-off" | "user-x";

const TONES: Record<ScreenTone, { bg: string; fg: string }> = {
  navy: { bg: R.navyTint, fg: R.navy },
  red: { bg: R.redSoft, fg: R.red },
  green: { bg: R.greenSoft, fg: R.green },
  amber: { bg: R.amberSoft, fg: R.amber },
  grey: { bg: R.disabledBg, fg: R.muted },
};

/** The prototype's arc spinner. */
export function Spinner({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={R.navy}
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
      style={{ animation: "rvSpin 900ms linear infinite", flexShrink: 0 }}
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.55" />
    </svg>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <div
      className="rv-page"
      style={{ minHeight: "100vh", background: R.paper, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <ReviewerStyles />
      {children}
    </div>
  );
}

function IconCircle({ tone, size = 56, children }: { tone: ScreenTone; size?: number; children: ReactNode }) {
  const t = TONES[tone];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: t.bg,
        color: t.fg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

function Glyph({ size, stroke = 2, children }: { size: number; stroke?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const cardBox = {
  background: R.card,
  borderRadius: 10,
  padding: "clamp(28px, 6vw, 48px) clamp(20px, 5vw, 40px)",
  width: "100%",
  boxSizing: "border-box" as const,
  textAlign: "center" as const,
  border: `1px solid ${R.line}`,
  boxShadow: CARD_SHADOW,
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
};

/** Loading the request. */
export function LoadingScreen() {
  return (
    <Screen>
      <div role="status" aria-live="polite" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, color: R.muted, fontSize: 15 }}>
        <Spinner />
        <span>Loading the request{"\u2026"}</span>
      </div>
    </Screen>
  );
}

/** Dead end: link problem, wrong account, link replaced, already decided. */
export function DeadEndCard({
  tone = "amber",
  icon = "link-off",
  eyebrow,
  title,
  children,
  footer,
  action,
}: {
  tone?: ScreenTone;
  icon?: DeadEndIcon;
  eyebrow: string;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Screen>
      <div
        style={{
          background: R.card,
          border: `1px solid ${R.line}`,
          borderRadius: 6,
          padding: "36px 32px",
          width: "100%",
          maxWidth: 460,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ alignSelf: "center" }}>
          <IconCircle tone={tone} size={40}>
            {icon === "user-x" ? (
              <Glyph size={20}>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21v-1a6 6 0 0 1 12 0v1" />
                <line x1="17" y1="11" x2="22" y2="16" />
                <line x1="22" y1="11" x2="17" y2="16" />
              </Glyph>
            ) : (
              <Glyph size={20}>
                <path d="M9 17H7A5 5 0 0 1 7 7h2" />
                <path d="M15 7h2a5 5 0 0 1 4 8" />
                <line x1="8" y1="12" x2="12" y2="12" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </Glyph>
            )}
          </IconCircle>
        </div>
        <div style={eyebrowStyle}>{eyebrow}</div>
        <h1 style={{ margin: 0, fontSize: 21, lineHeight: 1.3, fontWeight: 700, letterSpacing: "-0.01em", color: R.ink }}>{title}</h1>
        <div style={{ color: R.copy, display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
        {action ? <div style={{ alignSelf: "center", marginTop: 6 }}>{action}</div> : null}
        {footer ? (
          <div style={{ marginTop: 6, color: R.label, fontSize: 13, textAlign: "center", overflowWrap: "anywhere" }}>{footer}</div>
        ) : null}
      </div>
    </Screen>
  );
}

function MicrosoftMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

/** Not signed in. */
export function SignInRequiredCard({ kind, onSignIn }: { kind: "approval" | "evaluation"; onSignIn: () => void }) {
  return (
    <Screen>
      <div style={{ ...cardBox, maxWidth: 420, padding: "40px 40px" }}>
        <div style={{ marginBottom: 24 }}>
          <img src={logo128} alt="PMW logo" style={{ display: "block", height: 60, width: "auto" }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <IconCircle tone="navy">
            <Glyph size={26}>
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </Glyph>
          </IconCircle>
        </div>
        <div style={{ ...eyebrowStyle, marginBottom: 6 }}>{kind === "approval" ? "Approval review" : "Evaluation review"}</div>
        <h1 style={{ margin: "0 0 8px", fontSize: 22, lineHeight: 1.25, fontWeight: 700, letterSpacing: "-0.02em", color: R.ink }}>Sign in required</h1>
        <p style={{ margin: "0 0 24px", color: R.muted, fontSize: 15, lineHeight: 1.6 }}>
          You need to sign in with your Microsoft 365 account to access this {kind}.
        </p>
        <button
          type="button"
          className="rv-btn"
          onClick={onSignIn}
          style={{ ...btnPrimary, width: "100%", height: 48, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}
        >
          <MicrosoftMark />
          Sign in with Microsoft 365
        </button>
        <p style={{ margin: "16px 0 0", color: R.label, fontSize: 12, lineHeight: 1.6 }}>
          Use the account this request was sent to. Signing in only confirms who you are; nothing is submitted.
        </p>
      </div>
    </Screen>
  );
}

/** Decision recorded. */
export function SuccessCard({
  rejected,
  heading,
  formTitle,
  reference,
  nextLine,
}: {
  rejected: boolean;
  heading: string;
  formTitle: string;
  reference: string;
  nextLine: string;
}) {
  return (
    <Screen>
      <div role="status" aria-live="polite" style={{ ...cardBox, maxWidth: 440 }}>
        <div style={{ marginBottom: 16 }}>
          <IconCircle tone={rejected ? "red" : "green"} size={56}>
            {rejected ? (
              <Glyph size={28} stroke={2.25}>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </Glyph>
            ) : (
              <Glyph size={28} stroke={2.25}>
                <polyline points="20 6 9 17 4 12" />
              </Glyph>
            )}
          </IconCircle>
        </div>
        <h1 style={{ margin: "0 0 8px", fontSize: 24, lineHeight: 1.2, fontWeight: 700, letterSpacing: "-0.02em", color: rejected ? R.red : R.green }}>{heading}</h1>
        {(formTitle || reference) && (
          <p style={{ color: R.ink, fontSize: 14, margin: "0 0 16px" }}>
            {formTitle}
            {formTitle && reference ? " \u00b7 " : ""}
            {reference && <>Ref <strong>{reference}</strong></>}
          </p>
        )}
        <p style={{ color: R.muted, fontSize: 14, lineHeight: 1.6, margin: "0 0 8px" }}>
          <strong style={{ color: R.ink }}>What happens next.</strong> {nextLine}
        </p>
        <p style={{ color: R.label, fontSize: 13, margin: 0 }}>You can close this page.</p>
      </div>
    </Screen>
  );
}

/**
 * The whole page is blocked while a decision is in flight. A reviewer who only
 * saw a greyed-out button could scroll away, press again, or close the tab while
 * the server is still writing the outcome and mailing whoever is next.
 */
export function SubmittingOverlay({ action }: { action: "approve" | "reject" | "confirm" }) {
  const label =
    action === "reject" ? "Recording your rejection" : action === "confirm" ? "Submitting your evaluation" : "Recording your approval";
  return (
    <div className="rv-overlay" role="alertdialog" aria-modal="true" aria-busy="true" aria-live="assertive" aria-label={label}>
      <div className="rv-overlay-card">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <Spinner />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: R.ink, marginBottom: 8 }}>{label}</div>
        <div style={{ fontSize: 13, lineHeight: 1.7, color: R.muted }}>
          This can take a moment while the record is written and the next step is notified.
          <br />
          <strong style={{ color: R.ink }}>Please do not close or refresh this page.</strong>
        </div>
      </div>
    </div>
  );
}

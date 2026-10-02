import type { ReactNode } from "react";
import LockIcon from "@mui/icons-material/Lock";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Logo from "../Logo";
import ReviewerStyles from "./ReviewerStyles";
import { btnPrimary, CARD_SHADOW, eyebrowStyle, R } from "./reviewerTheme";

export type ScreenTone = "navy" | "red" | "green" | "amber";

const TONES: Record<ScreenTone, { bg: string; fg: string }> = {
  navy: { bg: R.navyTint, fg: R.navy },
  red: { bg: R.redSoft, fg: R.red },
  green: { bg: R.greenSoft, fg: R.green },
  amber: { bg: R.navyTint, fg: R.navy },
};

export function Spinner({ size = 42 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `2.5px solid ${R.navyTint}`,
        borderTop: `2.5px solid ${R.navy}`,
        borderRadius: "50%",
        animation: "rvSpin .85s linear infinite",
        flexShrink: 0,
      }}
    />
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
        marginBottom: 16,
      }}
    >
      {children}
    </div>
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
      <div role="status" aria-live="polite" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, color: R.muted, fontSize: 14 }}>
        <Spinner />
        <span>Loading the request…</span>
      </div>
    </Screen>
  );
}

/** Dead end: link problem, wrong account, link replaced, already decided. */
export function DeadEndCard({
  tone = "amber",
  eyebrow,
  title,
  children,
  footer,
  action,
}: {
  tone?: ScreenTone;
  eyebrow: string;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Screen>
      <div style={{ ...cardBox, maxWidth: 460 }}>
        <IconCircle tone={tone}>
          <WarningAmberIcon aria-hidden="true" style={{ fontSize: 28 }} />
        </IconCircle>
        <div style={{ ...eyebrowStyle, marginBottom: 6 }}>{eyebrow}</div>
        <h1 style={{ margin: "0 0 12px", fontSize: 22, lineHeight: 1.25, fontWeight: 700, letterSpacing: "-0.02em", color: R.ink }}>{title}</h1>
        <div style={{ color: R.muted, fontSize: 14.5, lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
        {action ? <div style={{ marginTop: 20 }}>{action}</div> : null}
        {footer ? (
          <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${R.line}`, width: "100%", color: R.muted, fontSize: 12 }}>{footer}</div>
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
      <div style={{ ...cardBox, maxWidth: 420 }}>
        <div style={{ marginBottom: 24 }}>
          <Logo size={56} alt="PMW logo" />
        </div>
        <IconCircle tone="navy">
          <LockIcon aria-hidden="true" style={{ fontSize: 26 }} />
        </IconCircle>
        <div style={{ ...eyebrowStyle, marginBottom: 6 }}>{kind === "approval" ? "Approval" : "Evaluation"}</div>
        <h1 style={{ margin: "0 0 8px", fontSize: 22, lineHeight: 1.25, fontWeight: 700, letterSpacing: "-0.02em", color: R.ink }}>Sign in required</h1>
        <p style={{ margin: "0 0 24px", color: R.muted, fontSize: 15, lineHeight: 1.6 }}>
          You need to sign in with your Microsoft 365 account to access this {kind}.
        </p>
        <button
          type="button"
          className="rv-btn"
          onClick={onSignIn}
          style={{ ...btnPrimary, width: "100%", minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}
        >
          <MicrosoftMark />
          Sign in with Microsoft 365
        </button>
        <p style={{ margin: "16px 0 0", color: R.muted, fontSize: 12, lineHeight: 1.6 }}>
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
      <div role="status" aria-live="polite" style={{ ...cardBox, maxWidth: 460 }}>
        <IconCircle tone={rejected ? "red" : "green"} size={72}>
          {rejected ? <CloseIcon aria-hidden="true" style={{ fontSize: 38 }} /> : <CheckIcon aria-hidden="true" style={{ fontSize: 38 }} />}
        </IconCircle>
        <h1 style={{ margin: "0 0 8px", fontSize: 26, lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.02em", color: rejected ? R.red : R.green }}>{heading}</h1>
        {(formTitle || reference) && (
          <p style={{ color: R.ink, fontSize: 14, margin: "0 0 16px", fontVariantNumeric: "tabular-nums" }}>
            {formTitle}
            {formTitle && reference ? " · " : ""}
            {reference && <>Ref <strong>{reference}</strong></>}
          </p>
        )}
        <p style={{ color: R.muted, fontSize: 14.5, lineHeight: 1.6, margin: "0 0 8px" }}>
          <strong style={{ color: R.ink }}>What happens next.</strong> {nextLine}
        </p>
        <p style={{ color: R.muted, fontSize: 13, margin: 0 }}>You can close this page.</p>
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

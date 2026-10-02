import { R } from "./reviewerTheme";
import type { SignOffVerdict } from "../../utils/signOff";

/**
 * "Approved by / Evaluated by", right-aligned just above the action buttons.
 * The signature line is drawn only when there is a signature to sit on it.
 * The wording (label, name, position) is decided in `utils/signOff.ts`; this
 * only draws it. Shared with My Submissions' detail modal (`align="start"`).
 */
export default function SignOffBlock({
  verdict,
  label,
  name,
  position,
  date,
  signature,
  compact = false,
  align = "end",
}: {
  verdict: SignOffVerdict;
  label: string;
  name: string;
  position: string;
  date?: string;
  signature?: string | null;
  /** The smaller variant, for a list of earlier layers rather than a page's close. */
  compact?: boolean;
  /** `end` sits the block at the right, as a form's signature does; `start` for lists. */
  align?: "start" | "end";
}) {
  const end = align === "end";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: end ? "flex-end" : "flex-start",
        textAlign: end ? "right" : "left",
        gap: 2,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: verdict === "rejected" ? R.red : R.label }}>{label}</div>
      {signature ? (
        <div style={{ display: "flex", flexDirection: "column", margin: "6px 0 4px", width: compact ? 200 : 260, maxWidth: "100%" }}>
          <img
            src={signature}
            alt={`Signature of ${name || "the signer"}`}
            style={{ display: "block", width: "100%", height: compact ? 48 : 72, objectFit: "contain", objectPosition: end ? "right bottom" : "left bottom" }}
          />
          <div style={{ height: 1, background: R.ink }} />
        </div>
      ) : null}
      <div style={{ fontSize: compact ? 14 : 15, fontWeight: 700, color: R.ink, overflowWrap: "anywhere" }}>{name || "—"}</div>
      {position ? <div style={{ fontSize: 13, color: R.muted }}>{position}</div> : null}
      {date ? (
        <div style={{ fontSize: 12, color: R.label, fontVariantNumeric: "tabular-nums" }}>Date: {date}</div>
      ) : null}
    </div>
  );
}

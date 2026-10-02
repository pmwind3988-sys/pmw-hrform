import { R } from "./reviewerTheme";

/**
 * "Approved by / Evaluated by", right-aligned just above the action buttons.
 * The signature line is drawn only when there is a signature to sit on it.
 */
export default function SignOffBlock({
  label,
  name,
  role,
  signature,
}: {
  label: string;
  name: string;
  role: string;
  signature?: string | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", textAlign: "right", gap: 2, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: R.label }}>{label}</div>
      {signature ? (
        <div style={{ display: "flex", flexDirection: "column", margin: "6px 0 4px", width: 260, maxWidth: "100%" }}>
          <img src={signature} alt="Signature" style={{ display: "block", width: "100%", height: 72, objectFit: "contain", objectPosition: "right bottom" }} />
          <div style={{ height: 1, background: R.ink }} />
        </div>
      ) : null}
      <div style={{ fontSize: 15, fontWeight: 700, color: R.ink, overflowWrap: "anywhere" }}>{name}</div>
      {role ? <div style={{ fontSize: 13, color: R.muted }}>{role}</div> : null}
    </div>
  );
}

import Logo from "../Logo";
import { R } from "./reviewerTheme";

/** Top bar: logo + "HR Form" on the left, the reference number on the right. */
export default function ReviewerHeader({ logoUrl, reference }: { logoUrl?: string; reference?: string }) {
  return (
    <header
      className="rv-header"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 32px",
        background: R.card,
        borderBottom: `1px solid ${R.line}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {logoUrl ? (
          <img src={logoUrl} alt="Company logo" style={{ height: 28, width: "auto", maxWidth: 120, objectFit: "contain" }} />
        ) : (
          <Logo size={28} alt="PMW logo" />
        )}
        <span style={{ fontWeight: 600, color: R.navy, fontSize: 15 }}>HR Form</span>
      </div>
      {reference ? (
        <span style={{ fontSize: 13, color: R.label, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
          Ref {reference}
        </span>
      ) : null}
    </header>
  );
}

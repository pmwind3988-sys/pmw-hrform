import logo128 from "../../assets/logo-128.png";
import { R } from "./reviewerTheme";

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/** Top bar: logo + "HR Form" on the left, the reference on the right. */
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
          <img className="rv-logo" src={logoUrl} alt="Company logo" style={{ height: 28, width: "auto", maxWidth: 120, objectFit: "contain" }} />
        ) : (
          // The mark is wider than it is tall: fix the height and let the
          // width follow, rather than boxing it into a square.
          <img className="rv-logo" src={logo128} alt="PMW logo" style={{ height: 28, width: "auto" }} />
        )}
        <span style={{ fontWeight: 600, color: R.navy, fontSize: 15 }}>HR Form</span>
      </div>
      {reference ? (
        <span className="rv-ref" style={{ fontFamily: MONO, fontSize: 12.5, color: R.label, textAlign: "right" }}>
          {reference}
        </span>
      ) : null}
    </header>
  );
}

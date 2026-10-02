import { useState } from "react";
import LockIcon from "@mui/icons-material/Lock";
import DrawOutlinedIcon from "@mui/icons-material/DrawOutlined";
import { SignatureModal } from "../../utils/signatureCapture";
import { R } from "./reviewerTheme";

/**
 * Tap-to-sign. Unsigned it is a dashed box; tapping opens the drawing dialog,
 * and "Done & lock" stores the image and shows it with a Locked tag. The only
 * way back into the pad is "Unlock & redraw".
 */
export default function SignatureField({
  value,
  onChange,
  disabled = false,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const [padOpen, setPadOpen] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: R.body }}>Signature</span>
        {value && !disabled && (
          <button
            type="button"
            onClick={() => setPadOpen(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "none",
              border: "none",
              padding: "4px 0",
              minHeight: 32,
              fontSize: 13.5,
              fontWeight: 600,
              color: R.link,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <LockIcon aria-hidden="true" style={{ fontSize: 14 }} />
            Unlock &amp; redraw
          </button>
        )}
      </div>
      {value ? (
        <div
          style={{
            position: "relative",
            minHeight: 120,
            border: `1px solid ${R.line}`,
            borderRadius: 4,
            background: R.card,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "12px 12px 28px",
          }}
        >
          <img src={value} alt="Your signature" style={{ display: "block", maxWidth: 260, width: "100%", maxHeight: 100, objectFit: "contain" }} />
          <span
            style={{
              position: "absolute",
              right: 10,
              bottom: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              fontWeight: 600,
              color: R.muted,
            }}
          >
            <LockIcon aria-hidden="true" style={{ fontSize: 12 }} />
            Locked
          </span>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setPadOpen(true)}
          style={{
            minHeight: 120,
            border: `1px dashed ${R.dash}`,
            borderRadius: 4,
            background: R.paper,
            color: R.body,
            cursor: disabled ? "not-allowed" : "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: 0,
            fontFamily: "inherit",
            fontSize: 14.5,
            fontWeight: 500,
          }}
        >
          <DrawOutlinedIcon aria-hidden="true" style={{ fontSize: 22, color: R.muted }} />
          Tap to sign
        </button>
      )}
      {padOpen && (
        <SignatureModal
          width={600}
          height={240}
          penColor="#000000"
          backgroundColor={R.card}
          existingDataUrl={value}
          title="Sign here"
          saveLabel="Done & lock"
          onSave={(dataUrl) => {
            onChange(dataUrl);
            setPadOpen(false);
          }}
          onCancel={() => setPadOpen(false)}
        />
      )}
    </div>
  );
}

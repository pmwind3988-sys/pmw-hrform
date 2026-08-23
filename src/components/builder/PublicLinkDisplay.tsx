/**
 * PublicLinkDisplay.tsx - Copyable link display for public evaluation layers
 */
import { useState, type CSSProperties } from "react";
import { C } from "./constants";
import type { LayerFieldOption } from "./layerValidation";
import type { PublicLinkExpiry } from "../../types";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningIcon from "@mui/icons-material/Warning";

/**
 * Question types whose answer can be read as a date.
 *
 * A layer may expire on an answer rather than on one date the author picks, and
 * pointing that at a free-text question produces a link that never expires —
 * see `api/_utils/layerExpiry.ts`. Anything else stays selectable but is
 * labelled, because a form may hold a date in a plain column for reasons this
 * component cannot see.
 */
function isDateProducingField(field: LayerFieldOption | undefined): boolean {
  if (!field) return false;
  if (field.type === "datepicker" || field.type === "date") return true;
  return field.type === "text"
    && (field.inputType === "date" || field.inputType === "datetime-local");
}

interface PublicLinkDisplayProps {
  slug: string;
  /**
   * Origin of the deployment that serves this form — not necessarily this one,
   * since the builder can author for a second site. See `src/config/sites.ts`.
   */
  appOrigin: string;
  publicToken: string;
  tokenExpiresAt: string;
  /** Absent means the fixed date above. See `PublicLinkExpiry`. */
  tokenExpiry?: PublicLinkExpiry;
  /** The form's questions, for a layer that expires on one of its answers. */
  formFields: LayerFieldOption[];
  onTokenChange: (token: string) => void;
  onExpiryChange: (date: string) => void;
  onTokenExpiryChange: (expiry: PublicLinkExpiry | undefined) => void;
}

const modeButton = (active: boolean): CSSProperties => ({
  flex: 1,
  height: 24,
  border: `1px solid ${active ? C.purple : C.border}`,
  borderRadius: 6,
  background: active ? C.purplePale : C.white,
  color: active ? C.purple : C.textMuted,
  fontSize: 10,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  transition: "all .15s",
});

const inputBox: CSSProperties = {
  height: 26,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "0 7px",
  fontSize: 11,
  color: C.textPrimary,
  background: C.white,
  outline: "none",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

const hintText: CSSProperties = {
  fontSize: 10,
  color: C.textMuted,
  marginTop: 4,
  lineHeight: 1.5,
};

export default function PublicLinkDisplay({
  slug,
  appOrigin,
  publicToken,
  tokenExpiresAt,
  tokenExpiry,
  formFields,
  onTokenChange,
  onExpiryChange,
  onTokenExpiryChange,
}: PublicLinkDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const url = `${appOrigin}/form/${slug}?eval=${publicToken}`;

  const isFieldMode = tokenExpiry?.mode === "field";
  const selectedField = formFields.find((field) => field.name === tokenExpiry?.field);
  const selectedFieldLabel = selectedField?.title || tokenExpiry?.field || "";
  const offsetDays = tokenExpiry?.offsetDays ?? 0;

  const setFieldExpiry = (patch: Partial<PublicLinkExpiry>) =>
    onTokenExpiryChange({
      mode: "field",
      field: tokenExpiry?.field || "",
      offsetDays,
      ...patch,
    });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRegenerate = () => {
    if (!confirmRegen) {
      setConfirmRegen(true);
      setTimeout(() => setConfirmRegen(false), 3000);
      return;
    }
    const newToken = crypto.randomUUID();
    onTokenChange(newToken);
    setConfirmRegen(false);
  };

  return (
    <div
      style={{
        background: C.offWhite,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "9px 11px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: C.textMuted,
          textTransform: "uppercase",
          letterSpacing: ".05em",
          marginBottom: 6,
        }}
      >
        Public Access Link
      </div>

      {/* URL display + copy */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
        <div
          style={{
            flex: 1,
            background: C.white,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: "5px 9px",
            fontSize: 11,
            color: C.textSecond,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: "monospace",
          }}
        >
          {url}
        </div>
        <button
          onClick={handleCopy}
          style={{
            height: 28,
            padding: "0 10px",
            border: `1px solid ${copied ? C.green : C.border}`,
            borderRadius: 6,
            background: copied ? C.greenPale : C.white,
            color: copied ? C.green : C.purple,
            fontSize: 10,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
            flexShrink: 0,
            transition: "all .15s",
          }}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>

      {/*
        Token expiry — one date the author fixes for everyone, or a date each
        submission carries in its own answers.
      */}
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        <button onClick={() => onTokenExpiryChange(undefined)} style={modeButton(!isFieldMode)}>
          Fixed date
        </button>
        <button onClick={() => setFieldExpiry({})} style={modeButton(isFieldMode)}>
          From a form field
        </button>
      </div>

      {isFieldMode ? (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select
              value={tokenExpiry?.field || ""}
              onChange={(e) => setFieldExpiry({ field: e.target.value })}
              style={{ ...inputBox, flex: 1 }}
            >
              <option value="">- Select date field -</option>
              {formFields.map((field) => (
                <option key={field.name} value={field.name}>
                  {field.title || field.name}
                  {isDateProducingField(field) ? "" : " (not a date field)"}
                </option>
              ))}
            </select>
            <label style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>+ days</label>
            <input
              type="number"
              min={0}
              value={offsetDays}
              onChange={(e) => setFieldExpiry({ offsetDays: Math.max(0, Number(e.target.value) || 0) })}
              style={{ ...inputBox, width: 58 }}
            />
          </div>

          <div style={hintText}>
            {selectedFieldLabel
              ? `Each submission's link closes at the end of its "${selectedFieldLabel}"${
                  offsetDays > 0 ? ` plus ${offsetDays} day${offsetDays === 1 ? "" : "s"}` : ""
                }, Malaysian time.`
              : "Pick the question holding the date each submission's link should expire on."}
          </div>

          {tokenExpiry?.field && !isDateProducingField(selectedField) && (
            <div style={{ ...hintText, color: C.amber }}>
              This question is not a date field. Any submission whose answer cannot be
              read as a date gets a link that never expires.
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <label style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>Token expires</label>
          <input
            type="date"
            value={tokenExpiresAt ? tokenExpiresAt.split("T")[0] : ""}
            onChange={(e) => onExpiryChange(e.target.value ? new Date(e.target.value).toISOString() : "")}
            style={inputBox}
          />
        </div>
      )}

      {/* Regenerate token */}
      <button
        onClick={handleRegenerate}
        style={{
          fontSize: 10,
          color: confirmRegen ? C.red : C.amber,
          background: confirmRegen ? C.redPale : C.amberPale,
          border: `1px solid ${confirmRegen ? C.red : C.amber}`,
          borderRadius: 6,
          padding: "4px 9px",
          cursor: "pointer",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          fontWeight: 600,
          transition: "all .15s",
        }}
      >
        {confirmRegen ? <><WarningIcon style={{ fontSize: 12, marginRight: 4 }} /> Confirm: regenerate token?</> : <><RefreshIcon style={{ fontSize: 12, marginRight: 4 }} /> Regenerate token</>}
      </button>
    </div>
  );
}

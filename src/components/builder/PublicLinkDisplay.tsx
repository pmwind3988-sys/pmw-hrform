/**
 * PublicLinkDisplay.tsx - Copyable link display for public evaluation layers
 */
import { useState, type CSSProperties } from "react";
import { C } from "./constants";
import {
  findExpirySourceForm,
  isDateProducingField,
  SUBMITTED_FORM_SOURCE_LAYER,
} from "./publicLinkExpirySources";
import type { ExpirySourceForm } from "./publicLinkExpirySources";
import type { PublicLinkExpiry } from "../../types";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningIcon from "@mui/icons-material/Warning";

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
  /**
   * The forms this layer may read an expiry date from — the submitted form and
   * any earlier layer that collects answers. See `publicLinkExpirySources.ts`.
   */
  expirySources: ExpirySourceForm[];
  onTokenChange: (token: string) => void;
  onExpiryChange: (date: string) => void;
  onTokenExpiryChange: (expiry: PublicLinkExpiry | undefined) => void;
}

const modeButton = (active: boolean, available = true): CSSProperties => ({
  flex: 1,
  height: 24,
  border: `1px solid ${active ? C.purple : C.border}`,
  borderRadius: 6,
  background: active ? C.purplePale : C.white,
  color: active ? C.purple : available ? C.textMuted : C.border,
  fontSize: 10,
  fontWeight: 600,
  cursor: available ? "pointer" : "not-allowed",
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
  expirySources,
  onTokenChange,
  onExpiryChange,
  onTokenExpiryChange,
}: PublicLinkDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const url = `${appOrigin}/form/${slug}?eval=${publicToken}`;

  const isFieldMode = tokenExpiry?.mode === "field";
  const sourceLayer = Number(tokenExpiry?.sourceLayer) > 0
    ? Number(tokenExpiry?.sourceLayer)
    : SUBMITTED_FORM_SOURCE_LAYER;
  const source = findExpirySourceForm(expirySources, sourceLayer);
  // A layer since reordered or emptied is still shown, flagged, rather than
  // silently swapped for another form's questions.
  const sourceMissing = isFieldMode && !source;
  const selectedField = source?.questions.find((field) => field.name === tokenExpiry?.field);
  const selectedFieldLabel = selectedField?.title || tokenExpiry?.field || "";
  const fieldMissing = isFieldMode && !!tokenExpiry?.field && !selectedField;
  const offsetDays = tokenExpiry?.offsetDays ?? 0;
  const hasSources = expirySources.length > 0;

  const setFieldExpiry = (patch: Partial<PublicLinkExpiry>) =>
    onTokenExpiryChange({
      mode: "field",
      sourceLayer,
      field: tokenExpiry?.field || "",
      offsetDays,
      ...patch,
    });

  // The question belongs to the form that asks it, so changing forms cannot
  // keep the previous choice.
  const chooseSource = (nextLayer: number) =>
    setFieldExpiry({
      sourceLayer: nextLayer,
      field: findExpirySourceForm(expirySources, nextLayer)?.questions[0]?.name ?? "",
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
        <button
          onClick={() => {
            if (!hasSources) return;
            const first = expirySources[0];
            setFieldExpiry({ sourceLayer: first.sourceLayer, field: first.questions[0]?.name ?? "" });
          }}
          disabled={!hasSources}
          title={hasSources ? undefined : "No form questions to read a date from yet"}
          style={modeButton(isFieldMode, hasSources)}
        >
          From a form field
        </button>
      </div>

      {isFieldMode ? (
        <div style={{ marginBottom: 8 }}>
          {/*
            Which form the date comes from. Only the submitted form and earlier
            layers are on offer — a later layer has answered nothing while this
            link is live. See publicLinkExpirySources.ts.
          */}
          <select
            value={sourceLayer}
            onChange={(e) => chooseSource(Number(e.target.value))}
            style={{ ...inputBox, width: "100%", marginBottom: 6, borderColor: sourceMissing ? C.red : C.border }}
          >
            {sourceMissing && (
              <option value={sourceLayer}>
                {sourceLayer === SUBMITTED_FORM_SOURCE_LAYER
                  ? "Submitted form (no questions yet)"
                  : `Layer ${sourceLayer} (no longer available)`}
              </option>
            )}
            {expirySources.map((form) => (
              <option key={form.sourceLayer} value={form.sourceLayer}>{form.label}</option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select
              value={tokenExpiry?.field || ""}
              onChange={(e) => setFieldExpiry({ field: e.target.value })}
              style={{ ...inputBox, flex: 1, borderColor: fieldMissing ? C.red : C.border }}
            >
              <option value="">- Select date field -</option>
              {fieldMissing && (
                <option value={tokenExpiry?.field}>
                  {`${tokenExpiry?.field} (not in this form)`}
                </option>
              )}
              {(source?.questions ?? []).map((field) => (
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
                  sourceLayer === SUBMITTED_FORM_SOURCE_LAYER ? "" : ` from layer ${sourceLayer}`
                }${
                  offsetDays > 0 ? ` plus ${offsetDays} day${offsetDays === 1 ? "" : "s"}` : ""
                }, Malaysian time.`
              : "Pick the question holding the date each submission's link should expire on."}
          </div>

          {sourceLayer !== SUBMITTED_FORM_SOURCE_LAYER && !!tokenExpiry?.field && (
            <div style={hintText}>
              Layer {sourceLayer} is answered before this one, so until it is
              completed this link has no expiry date to read yet and stays open.
            </div>
          )}

          {fieldMissing && (
            <div style={{ ...hintText, color: C.red }}>
              This form does not ask that question. Pick one it does, or the link
              will have no date to read and will never expire.
            </div>
          )}

          {tokenExpiry?.field && !fieldMissing && !isDateProducingField(selectedField) && (
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

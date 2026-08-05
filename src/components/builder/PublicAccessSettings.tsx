/**
 * PublicAccessSettings.tsx — how a public (no sign-in) layer behaves.
 *
 * Replaces the old `PublicLinkDisplay`, which showed one copyable URL for the
 * whole form. There is no such URL any more: every submission is mailed its own
 * signed link, scoped to that submission and expiring on its own clock, so the
 * only things left to configure are how long a link lives and what the person
 * holding it must tell us about themselves.
 */
import { C } from "./constants";
import LinkIcon from "@mui/icons-material/Link";
import {
  DEFAULT_PUBLIC_IDENTITY_FIELDS,
  MAX_PUBLIC_LINK_TTL_HOURS,
  MIN_PUBLIC_LINK_TTL_HOURS,
  IDENTITY_EMAIL_KEY,
  isIdentityDomain,
  normalizePublicAccessConfig,
  type PublicAccessConfig,
  type PublicIdentityField,
} from "../../utils/publicIdentity";

interface PublicAccessSettingsProps {
  value: PublicAccessConfig | undefined;
  onChange: (patch: PublicAccessConfig) => void;
}

const LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: C.textMuted,
  textTransform: "uppercase",
  letterSpacing: ".05em",
  display: "block",
  marginBottom: 4,
};

const HINT: React.CSSProperties = {
  fontSize: 10,
  color: C.textMuted,
  lineHeight: 1.5,
  marginTop: 4,
};

const SMALL_INPUT: React.CSSProperties = {
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

/** Presets cover the realistic span; the hours box handles everything else. */
const TTL_PRESETS: { label: string; hours: number }[] = [
  { label: "24 hours", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
  { label: "30 days", hours: 720 },
];

function ttlSummary(hours: number): string {
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export default function PublicAccessSettings({ value, onChange }: PublicAccessSettingsProps) {
  const config = normalizePublicAccessConfig(value);
  // Off-by-default fields are only in the stored config once someone has
  // touched them, so the built-in list is merged in to keep them offerable.
  const fields: PublicIdentityField[] = [
    ...config.identityFields,
    ...DEFAULT_PUBLIC_IDENTITY_FIELDS.filter(
      (preset) => !config.identityFields.some((field) => field.key === preset.key),
    ),
  ];
  const emailEnabled = fields.some((field) => field.key === IDENTITY_EMAIL_KEY && field.enabled);
  const enabledCount = fields.filter((field) => field.enabled).length;

  const patch = (next: Partial<PublicAccessConfig>) => onChange({ ...config, ...next });

  const patchField = (key: string, change: Partial<PublicIdentityField>) =>
    patch({ identityFields: fields.map((field) => (field.key === key ? { ...field, ...change } : field)) });

  const domainText = config.allowedEmailDomains.join(", ");
  const domainsValid = config.allowedEmailDomains.every(isIdentityDomain);

  return (
    <div style={{ background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px" }}>
      <div style={{ ...LABEL, marginBottom: 6 }}>Public link access</div>

      <div style={{ fontSize: 10, color: C.textSecond, lineHeight: 1.5, marginBottom: 10 }}>
        <LinkIcon style={{ fontSize: 12, marginRight: 4, verticalAlign: "-2px" }} />
        Each submission is emailed its own link. A link only ever opens that one submission, expires
        on the schedule below, and stops working the moment a decision is submitted.
      </div>

      {/* Link lifetime */}
      <div style={{ marginBottom: 10 }}>
        <label style={LABEL}>Link valid for</label>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {TTL_PRESETS.map((preset) => {
            const active = config.linkTtlHours === preset.hours;
            return (
              <button
                key={preset.hours}
                onClick={() => patch({ linkTtlHours: preset.hours })}
                style={{
                  height: 26,
                  padding: "0 9px",
                  borderRadius: 6,
                  border: `1px solid ${active ? C.purple : C.border}`,
                  background: active ? C.purplePale : C.white,
                  color: active ? C.purple : C.textSecond,
                  fontSize: 10,
                  fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="number"
            min={MIN_PUBLIC_LINK_TTL_HOURS}
            max={MAX_PUBLIC_LINK_TTL_HOURS}
            value={config.linkTtlHours}
            onChange={(event) => patch({ linkTtlHours: Number(event.target.value) })}
            style={{ ...SMALL_INPUT, width: 72 }}
          />
          <span style={{ fontSize: 10, color: C.textMuted }}>hours ({ttlSummary(config.linkTtlHours)})</span>
        </div>
      </div>

      {/* Identity declaration */}
      <label style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 8, fontSize: 10, color: C.textSecond, lineHeight: 1.5, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={config.requireIdentity}
          onChange={(event) => patch({ requireIdentity: event.target.checked })}
          style={{ marginTop: 1, accentColor: C.purple }}
        />
        <span>
          Require the person to say who they are before they can act. Their answers are recorded
          against the decision.
        </span>
      </label>

      {config.requireIdentity && (
        <>
          <label style={LABEL}>Details they must give</label>
          <div style={{ display: "grid", gap: 4, marginBottom: 8 }}>
            {fields.map((field) => (
              <div
                key={field.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: C.white,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: "5px 8px",
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={field.enabled}
                    onChange={(event) => patchField(field.key, { enabled: event.target.checked })}
                    style={{ accentColor: C.purple }}
                  />
                  <input
                    value={field.label}
                    onChange={(event) => patchField(field.key, { label: event.target.value })}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      fontSize: 11,
                      color: field.enabled ? C.textPrimary : C.textMuted,
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                    }}
                  />
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 10,
                    color: field.enabled ? C.textSecond : C.textMuted,
                    cursor: field.enabled ? "pointer" : "default",
                    flexShrink: 0,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={field.required}
                    disabled={!field.enabled}
                    onChange={(event) => patchField(field.key, { required: event.target.checked })}
                    style={{ accentColor: C.purple }}
                  />
                  Required
                </label>
              </div>
            ))}
          </div>

          {enabledCount === 0 && (
            <div style={{ fontSize: 10, color: C.red, lineHeight: 1.5, marginBottom: 8 }}>
              Turn on at least one detail, or switch off the requirement above.
            </div>
          )}

          {/* Email restrictions — only meaningful when an address is collected. */}
          {emailEnabled && (
            <>
              <label style={LABEL}>Restrict email to (optional)</label>
              <input
                value={domainText}
                onChange={(event) => patch({
                  allowedEmailDomains: event.target.value
                    .split(/[,;\s]+/)
                    .map((entry) => entry.trim().toLowerCase().replace(/^@/, ""))
                    .filter(Boolean),
                })}
                placeholder="company.com, partner.com"
                style={{ ...SMALL_INPUT, width: "100%", height: 28 }}
              />
              {!domainsValid && (
                <div style={{ fontSize: 10, color: C.red, marginTop: 4, lineHeight: 1.5 }}>
                  Enter bare domains, without "@" or a path.
                </div>
              )}
              <label style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 6, fontSize: 10, color: C.textSecond, lineHeight: 1.5, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={config.requireAssigneeEmailMatch}
                  onChange={(event) => patch({ requireAssigneeEmailMatch: event.target.checked })}
                  style={{ marginTop: 1, accentColor: C.purple }}
                />
                <span>
                  The address they give must be one this layer was assigned to. Use when the link is
                  forwarded but only the named reviewer may sign off.
                </span>
              </label>
            </>
          )}
        </>
      )}

      <div style={HINT}>
        Nothing here proves the address belongs to them — it is a declaration, not a sign-in. The
        protection is the link itself: one submission, one decision, one expiry.
      </div>
    </div>
  );
}

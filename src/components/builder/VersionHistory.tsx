/**
 * VersionHistory.tsx - Sidebar component showing version history
 */
import { C } from "./constants";

interface VersionHistoryProps {
  history: { FormVersion: string; PublishKey?: string; PublishLabel?: string; PublishStatus?: "active" | "off"; PublishExpiresAt?: string; DisabledAt?: string; DisabledBy?: string; PublishedBy?: string; PublishedAt?: string }[];
  current: string;
  currentPublishKey?: string;
  slug?: string;
  onView: (v: string, publishKey?: string) => void;
  onSetDefault?: (v: string, publishKey: string, publishLabel: string) => void;
  onToggleStatus?: (v: string, publishKey: string, nextStatus: "active" | "off") => void;
  onSetExpiry?: (v: string, publishKey: string, expiry: string) => void;
  onCopyLink?: (publishKey: string) => void;
  onEditLayers?: (v: string, publishKey: string, publishLabel: string) => void;
  onOpenQr?: (v: string, publishKey: string, publishLabel: string) => void;
  /** `${version}::${publishKey}` of the row whose QR is currently loading. */
  qrBusyKey?: string;
  onOpenDocHeader?: (v: string, publishKey: string, publishLabel: string) => void;
  /** `${version}::${publishKey}` of the row whose document header is currently loading. */
  docHeaderBusyKey?: string;
}

const Tag = ({ children, color = C.purple, bg = C.purplePale }: { children: React.ReactNode; color?: string; bg?: string }) => (
  <span style={{
    fontSize: 10,
    fontWeight: 700,
    color,
    background: bg,
    borderRadius: 20,
    padding: "2px 9px",
    textTransform: "uppercase",
    letterSpacing: ".04em",
  }}>{children}</span>
);

function isExpired(value?: string): boolean {
  return !!value && Date.parse(value) <= Date.now();
}

function dateInputValue(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default function VersionHistory({
  history,
  current,
  currentPublishKey = "production",
  slug,
  onView,
  onSetDefault,
  onToggleStatus,
  onSetExpiry,
  onCopyLink,
  onEditLayers,
  onOpenQr,
  qrBusyKey,
  onOpenDocHeader,
  docHeaderBusyKey,
}: VersionHistoryProps) {
  if (!history.length) return <div style={{ fontSize: 11, color: C.textMuted, fontStyle: "italic" }}>No history yet.</div>;

  return (
    <div>
      {history.map((v, i) => {
        const publishKey = v.PublishKey || "production";
        const isCurrent = v.FormVersion === current && publishKey === currentPublishKey;
        const expired = isExpired(v.PublishExpiresAt);
        const off = v.PublishStatus === "off";
        const statusLabel = off ? "Off" : expired ? "Expired" : "Active";
        const statusColor = off ? C.textMuted : expired ? C.amber : C.green;
        const statusBg = off ? C.offWhite : expired ? C.amberPale : C.greenPale;
        const publishLabel = v.PublishLabel || publishKey;
        const canUseAsDefault = !off && !expired && !isCurrent;
        return (
        <div key={`${v.FormVersion}-${publishKey}-${i}`} style={{
          padding: "10px",
          border: `1px solid ${isCurrent ? C.purple : C.border}`,
          borderRadius: 8,
          background: isCurrent ? C.purplePale : C.white,
          marginBottom: 8,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
              <Tag>v{v.FormVersion}</Tag>
              <Tag color={C.textSecond} bg={C.offWhite}>{publishLabel}</Tag>
              <Tag color={statusColor} bg={statusBg}>{statusLabel}</Tag>
              {isCurrent && <Tag color={C.green} bg={C.greenPale}>Current</Tag>}
            </div>
            <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.5 }}>
              <div>{publishKey}{slug ? ` · /form/${slug}${publishKey === "production" ? "" : `?publish=${publishKey}`}` : ""}</div>
              <div>{v.PublishedBy?.split("@")[0]} · {v.PublishedAt ? new Date(v.PublishedAt).toLocaleString("en-MY", { dateStyle: "short", timeStyle: "short" }) : "-"}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 7, marginTop: 9 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: C.textMuted }}>
              Expiry date
              <input
                type="date"
                value={dateInputValue(v.PublishExpiresAt)}
                onChange={(event) => onSetExpiry?.(v.FormVersion, publishKey, event.target.value)}
                style={{
                  height: 29,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: "0 8px",
                  fontSize: 11,
                  color: C.textSecond,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                }}
              />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 6 }}>
              <button
                onClick={() => onView(v.FormVersion, publishKey)}
                style={profileBtn(C.purple, C.white, C.purple)}
              >
                View
              </button>
              <button
                onClick={() => onEditLayers?.(v.FormVersion, publishKey, publishLabel)}
                style={profileBtn(C.purpleAccent, C.white, C.purpleAccent)}
              >
                Edit layers
              </button>
              <button
                onClick={() => onCopyLink?.(publishKey)}
                disabled={!slug}
                style={profileBtn(C.textSecond, C.white, C.border, !slug)}
              >
                Copy link
              </button>
              <button
                onClick={() => onOpenQr?.(v.FormVersion, publishKey, publishLabel)}
                disabled={!slug || off || expired || qrBusyKey === `${v.FormVersion}::${publishKey}`}
                title={off || expired ? "Turn this profile on to create a QR for it" : "Create a prefilled QR for this profile"}
                style={profileBtn(C.purple, C.white, C.purpleMid, !slug || off || expired || qrBusyKey === `${v.FormVersion}::${publishKey}`)}
              >
                {qrBusyKey === `${v.FormVersion}::${publishKey}` ? "Loading…" : "Prefilled QR"}
              </button>
              <button
                onClick={() => onOpenDocHeader?.(v.FormVersion, publishKey, publishLabel)}
                disabled={docHeaderBusyKey === `${v.FormVersion}::${publishKey}`}
                title="Edit the document control header for this profile"
                style={profileBtn(C.purpleAccent, C.white, C.purpleAccent, docHeaderBusyKey === `${v.FormVersion}::${publishKey}`)}
              >
                {docHeaderBusyKey === `${v.FormVersion}::${publishKey}` ? "Loading…" : "Doc header"}
              </button>
              <button
                onClick={() => onSetDefault?.(v.FormVersion, publishKey, publishLabel)}
                disabled={!canUseAsDefault}
                style={profileBtn(C.green, C.greenPale, C.green, !canUseAsDefault)}
              >
                Set default
              </button>
              <button
                onClick={() => onToggleStatus?.(v.FormVersion, publishKey, off ? "active" : "off")}
                disabled={isCurrent && !off}
                style={profileBtn(off ? C.green : C.amber, off ? C.greenPale : C.amberPale, off ? C.green : C.amber, isCurrent && !off)}
              >
                {isCurrent && !off ? "Default on" : off ? "Turn on" : "Turn off"}
              </button>
            </div>
          </div>
        </div>
      )})}
    </div>
  );
}

function profileBtn(color: string, background: string, border: string, disabled = false): React.CSSProperties {
  return {
    minHeight: 30,
    border: `1px solid ${disabled ? C.border : border}`,
    borderRadius: 6,
    background: disabled ? C.offWhite : background,
    color: disabled ? C.textMuted : color,
    fontSize: 11,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  };
}

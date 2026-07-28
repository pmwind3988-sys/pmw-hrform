/**
 * VersionHistory.tsx - Published profile manager for the builder sidebar.
 * Each card is one publish profile: its name (editable), where it is served,
 * when it stops being served, and the actions scoped to that profile alone.
 */
import { useState } from "react";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import { C } from "./constants";

interface VersionHistoryProps {
  history: { FormVersion: string; PublishKey?: string; PublishLabel?: string; PublishStatus?: "active" | "off"; PublishExpiresAt?: string; DisabledAt?: string; DisabledBy?: string; PublishedBy?: string; PublishedAt?: string }[];
  current: string;
  currentPublishKey?: string;
  slug?: string;
  /** Form the profiles belong to; used as the fallback profile name. */
  formTitle?: string;
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
  onRename?: (v: string, publishKey: string, publishLabel: string) => void;
  /** `${version}::${publishKey}` of the row currently being renamed. */
  renameBusyKey?: string;
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
    whiteSpace: "nowrap",
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
  formTitle,
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
  onRename,
  renameBusyKey,
}: VersionHistoryProps) {
  if (!history.length) return <div style={{ fontSize: 11, color: C.textMuted, fontStyle: "italic" }}>No history yet.</div>;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {history.map((entry, index) => {
        const publishKey = entry.PublishKey || "production";
        return (
          <ProfileCard
            key={`${entry.FormVersion}-${publishKey}-${index}-${entry.PublishLabel || ""}`}
            entry={entry}
            publishKey={publishKey}
            isCurrent={entry.FormVersion === current && publishKey === currentPublishKey}
            slug={slug}
            formTitle={formTitle}
            onView={onView}
            onSetDefault={onSetDefault}
            onToggleStatus={onToggleStatus}
            onSetExpiry={onSetExpiry}
            onCopyLink={onCopyLink}
            onEditLayers={onEditLayers}
            onOpenQr={onOpenQr}
            qrBusyKey={qrBusyKey}
            onOpenDocHeader={onOpenDocHeader}
            docHeaderBusyKey={docHeaderBusyKey}
            onRename={onRename}
            renameBusyKey={renameBusyKey}
          />
        );
      })}
    </div>
  );
}

function ProfileCard({
  entry,
  publishKey,
  isCurrent,
  slug,
  formTitle,
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
  onRename,
  renameBusyKey,
}: Omit<VersionHistoryProps, "history" | "current" | "currentPublishKey"> & {
  entry: VersionHistoryProps["history"][number];
  publishKey: string;
  isCurrent: boolean;
}) {
  const version = entry.FormVersion;
  const rowKey = `${version}::${publishKey}`;
  const expired = isExpired(entry.PublishExpiresAt);
  const off = entry.PublishStatus === "off";
  const statusLabel = off ? "Off" : expired ? "Expired" : "Active";
  const statusColor = off ? C.textMuted : expired ? C.amber : C.green;
  const statusBg = off ? C.offWhite : expired ? C.amberPale : C.greenPale;
  const publishLabel = entry.PublishLabel || formTitle || publishKey;
  const canUseAsDefault = !off && !expired && !isCurrent;
  const route = slug ? `/form/${slug}${publishKey === "production" ? "" : `?publish=${publishKey}`}` : "";

  // The card is keyed on the stored name, so a rename that lands in SharePoint
  // remounts this card and the field starts from the saved value again.
  const [draftName, setDraftName] = useState(publishLabel);
  const renaming = renameBusyKey === rowKey;

  const trimmedName = draftName.trim();
  const nameDirty = trimmedName !== publishLabel && trimmedName.length > 0;

  const saveName = () => {
    if (!nameDirty || renaming) return;
    onRename?.(version, publishKey, trimmedName);
  };

  return (
    <section style={{
      border: `1px solid ${isCurrent ? C.purple : C.border}`,
      borderRadius: 10,
      background: C.white,
      boxShadow: isCurrent ? "0 1px 2px rgba(0,120,212,0.14)" : "0 1px 2px rgba(26,31,43,0.04)",
      overflow: "hidden",
    }}>
      {/* Identity */}
      <div style={{ padding: "10px 11px 11px", background: isCurrent ? C.purplePale : C.white }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
          <Tag color={statusColor} bg={statusBg}>{statusLabel}</Tag>
          {isCurrent && <Tag color={C.purple} bg={C.white}>Default route</Tag>}
          <Tag color={C.textSecond} bg={C.offWhite}>v{version}</Tag>
        </div>

        <label style={{ display: "block" }}>
          <span style={{ display: "block", fontSize: 9, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: C.textSecond, marginBottom: 3 }}>
            Profile name
          </span>
          <span style={{ display: "block" }}>
            <input
              value={draftName}
              onChange={event => setDraftName(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") { event.preventDefault(); saveName(); }
                if (event.key === "Escape") { event.preventDefault(); setDraftName(publishLabel); }
              }}
              disabled={!onRename || renaming}
              placeholder={formTitle || publishKey}
              aria-label={`Name of the ${publishLabel} profile`}
              style={{
                width: "100%",
                height: 36,
                border: `1px solid ${nameDirty ? C.purple : C.border}`,
                borderRadius: 7,
                padding: "0 9px",
                background: onRename && !renaming ? C.white : C.offWhite,
                fontSize: 13,
                fontWeight: 700,
                color: C.textPrimary,
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
              }}
            />
            {nameDirty && (
              <span style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 5, marginTop: 5 }}>
                <button
                  type="button"
                  onClick={saveName}
                  disabled={renaming}
                  title="Save this name to SharePoint now — no publish needed"
                  style={{ ...profileBtn(C.white, C.purple, C.purple, renaming), display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}
                >
                  <CheckIcon style={{ fontSize: 15 }} /> {renaming ? "Applying…" : "Apply name"}
                </button>
                <button
                  type="button"
                  onClick={() => setDraftName(publishLabel)}
                  disabled={renaming}
                  title="Discard the new name"
                  style={{ ...profileBtn(C.textSecond, C.white, C.border, renaming), width: 36, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                >
                  <CloseIcon style={{ fontSize: 16 }} />
                </button>
              </span>
            )}
          </span>
        </label>
        <div style={{ fontSize: 10, color: renaming ? C.purple : C.textSecond, lineHeight: 1.5, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
          {renaming
            ? "Saving the name to SharePoint…"
            : nameDirty
              ? <><DriveFileRenameOutlineIcon style={{ fontSize: 12 }} /> Apply saves this name on its own — publishing is not needed</>
              : `${publishKey}${route ? ` · ${route}` : ""}`}
        </div>
      </div>

      {/* Provenance + availability */}
      <div style={{ padding: "9px 11px", borderTop: `1px solid ${C.borderLight}`, background: C.offWhite, display: "grid", gap: 8 }}>
        <div style={{ fontSize: 10, color: C.textSecond, lineHeight: 1.5 }}>
          Published by {entry.PublishedBy?.split("@")[0] || "unknown"} ·{" "}
          {entry.PublishedAt ? new Date(entry.PublishedAt).toLocaleString("en-MY", { dateStyle: "short", timeStyle: "short" }) : "-"}
        </div>
        <label style={{ display: "grid", gap: 3, fontSize: 10, fontWeight: 700, color: C.textSecond }}>
          Stops serving on
          <input
            type="date"
            value={dateInputValue(entry.PublishExpiresAt)}
            onChange={event => onSetExpiry?.(version, publishKey, event.target.value)}
            style={{
              height: 34,
              border: `1px solid ${C.border}`,
              borderRadius: 7,
              padding: "0 8px",
              fontSize: 11,
              color: C.textSecond,
              background: C.white,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
            }}
          />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(104px, 1fr))", gap: 6 }}>
          <button
            onClick={() => onSetDefault?.(version, publishKey, publishLabel)}
            disabled={!canUseAsDefault}
            title={isCurrent ? "This profile already serves the default route" : "Serve this profile at the default /form route"}
            style={profileBtn(C.green, C.greenPale, C.green, !canUseAsDefault)}
          >
            Set default
          </button>
          <button
            onClick={() => onToggleStatus?.(version, publishKey, off ? "active" : "off")}
            disabled={isCurrent && !off}
            title={isCurrent && !off ? "Set another profile as default before turning this one off" : off ? "Let public users open this profile again" : "Stop public users from opening this profile"}
            style={profileBtn(off ? C.green : C.amber, off ? C.greenPale : C.amberPale, off ? C.green : C.amber, isCurrent && !off)}
          >
            {isCurrent && !off ? "Default on" : off ? "Turn on" : "Turn off"}
          </button>
        </div>
      </div>

      {/* Profile-scoped tools */}
      <div style={{ padding: "9px 11px 11px", borderTop: `1px solid ${C.borderLight}`, display: "grid", gap: 6 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(104px, 1fr))", gap: 6 }}>
          <button
            onClick={() => onEditLayers?.(version, publishKey, publishLabel)}
            title="Load this profile's approval, evaluation, and approver settings"
            style={profileBtn(C.white, C.purple, C.purple)}
          >
            Edit settings
          </button>
          <button
            onClick={() => onView(version, publishKey)}
            title="Preview the form exactly as this profile serves it"
            style={profileBtn(C.purple, C.white, C.purpleMid)}
          >
            Preview
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(88px, 1fr))", gap: 6 }}>
          <button
            onClick={() => onCopyLink?.(publishKey)}
            disabled={!slug}
            title={slug ? `Copy ${route}` : "Add a slug to this form first"}
            style={profileBtn(C.textSecond, C.white, C.border, !slug)}
          >
            Copy link
          </button>
          <button
            onClick={() => onOpenQr?.(version, publishKey, publishLabel)}
            disabled={!slug || off || expired || qrBusyKey === rowKey}
            title={off || expired ? "Turn this profile on to create a QR for it" : "Create a prefilled QR for this profile"}
            style={profileBtn(C.purple, C.white, C.purpleMid, !slug || off || expired || qrBusyKey === rowKey)}
          >
            {qrBusyKey === rowKey ? "Loading…" : "Prefilled QR"}
          </button>
          <button
            onClick={() => onOpenDocHeader?.(version, publishKey, publishLabel)}
            disabled={docHeaderBusyKey === rowKey}
            title="Edit the document control header for this profile"
            style={profileBtn(C.purpleAccent, C.white, C.purpleAccent, docHeaderBusyKey === rowKey)}
          >
            {docHeaderBusyKey === rowKey ? "Loading…" : "Doc header"}
          </button>
        </div>
      </div>
    </section>
  );
}

function profileBtn(color: string, background: string, border: string, disabled = false): React.CSSProperties {
  return {
    minHeight: 34,
    padding: "0 8px",
    border: `1px solid ${disabled ? C.border : border}`,
    borderRadius: 7,
    background: disabled ? C.offWhite : background,
    color: disabled ? C.textMuted : color,
    fontSize: 11,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    transition: "background-color .12s, border-color .12s, color .12s",
  };
}

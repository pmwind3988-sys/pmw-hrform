/**
 * LayerCard.tsx - Single layer summary card for the layer config panel
 */
import { useState } from "react";
import { C } from "./constants";
import type { LayerConfigItem } from "../../types";

interface LayerCardProps {
  layer: LayerConfigItem;
  index: number;
  total: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}

const TYPE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  approval: { bg: "#DBEAFE", color: "#1D4ED8", label: "Approval" },
  evaluation: { bg: C.greenPale, color: C.green, label: "Evaluation" },
};

const AUTH_ICON: Record<string, { icon: string; label: string }> = {
  "365": { icon: "🔒", label: "365 Sign-in" },
  public: { icon: "🔗", label: "Public Link" },
};

export default function LayerCard({
  layer,
  index,
  total,
  expanded,
  onToggleExpand,
  onMoveUp,
  onMoveDown,
  onDelete,
  children,
}: LayerCardProps) {
  const [hoverDel, setHoverDel] = useState(false);
  const badge = TYPE_BADGE[layer.type] || TYPE_BADGE.approval;
  const auth = AUTH_ICON[layer.authMode] || AUTH_ICON["365"];
  const assigneeLabel =
    layer.assignee.type === "field-reference"
      ? `Field: ${layer.assignee.value || "—"}`
      : layer.assignee.value || "No assignee";

  return (
    <div
      style={{
        border: `1px solid ${expanded ? C.purpleMid : C.border}`,
        borderRadius: 10,
        background: expanded ? C.white : C.offWhite,
        marginBottom: 8,
        overflow: "hidden",
        transition: "border-color .15s",
      }}
    >
      {/* Header row */}
      <div
        onClick={onToggleExpand}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 11px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {/* Layer number */}
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            flexShrink: 0,
            background: `linear-gradient(135deg,${C.purple},${C.purpleLight})`,
            color: C.white,
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {index + 1}
        </div>

        {/* Type badge */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: badge.color,
            background: badge.bg,
            borderRadius: 20,
            padding: "2px 8px",
            textTransform: "uppercase",
            letterSpacing: ".04em",
          }}
        >
          {badge.label}
        </span>

        {/* Auth mode icon */}
        <span style={{ fontSize: 12 }} title={auth.label}>
          {auth.icon}
        </span>

        {/* Title / assignee */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.textPrimary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {layer.title || `Layer ${index + 1}`}
          </div>
          <div style={{ fontSize: 10, color: C.textMuted }}>{assigneeLabel}</div>
        </div>

        {/* Move / delete buttons */}
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            style={{
              width: 22,
              height: 22,
              border: `1px solid ${C.border}`,
              borderRadius: 5,
              background: C.white,
              color: index === 0 ? C.textMuted : C.textSecond,
              cursor: index === 0 ? "default" : "pointer",
              fontSize: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            style={{
              width: 22,
              height: 22,
              border: `1px solid ${C.border}`,
              borderRadius: 5,
              background: C.white,
              color: index === total - 1 ? C.textMuted : C.textSecond,
              cursor: index === total - 1 ? "default" : "pointer",
              fontSize: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ↓
          </button>
          <button
            onClick={onDelete}
            onMouseEnter={() => setHoverDel(true)}
            onMouseLeave={() => setHoverDel(false)}
            style={{
              width: 22,
              height: 22,
              border: "none",
              borderRadius: 5,
              background: hoverDel ? C.red : C.redPale,
              color: hoverDel ? C.white : C.red,
              cursor: "pointer",
              fontSize: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Expand chevron */}
        <div
          style={{
            fontSize: 10,
            color: C.textMuted,
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform .15s",
          }}
        >
          ▼
        </div>
      </div>

      {/* Expanded settings */}
      {expanded && (
        <div
          style={{
            padding: "0 11px 11px",
            borderTop: `1px solid ${C.border}`,
            animation: "fadeUp .15s ease",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

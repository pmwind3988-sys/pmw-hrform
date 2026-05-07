import { Chip } from "@mui/material";

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  fullyapproved: { label: "Fully Approved", color: "#16a34a", bg: "#dcfce7", dot: "#22c55e" },
  approved: { label: "Approved", color: "#16a34a", bg: "#dcfce7", dot: "#22c55e" },
  confirmed: { label: "Confirmed", color: "#059669", bg: "#d1fae5", dot: "#10b981" },
  rejected: { label: "Rejected", color: "#dc2626", bg: "#fee2e2", dot: "#ef4444" },
  inprogress: { label: "In Review", color: "#9333ea", bg: "#f3e8ff", dot: "#a855f7" },
  pending: { label: "Pending", color: "#d97706", bg: "#fef3c7", dot: "#f59e0b" },
  cancelled: { label: "Cancelled", color: "#6b7280", bg: "#f3f4f6", dot: "#9ca3af" },
} as const;

function normalizeStatus(status: string | null): string {
  if (!status) return "pending";
  const normalized = status.toLowerCase().replace(/[\s_-]/g, "");
  if (normalized === "fullyapproved" || normalized === "completed") return "fullyapproved";
  if (normalized === "approved") return "approved";
  if (normalized === "confirmed") return "confirmed";
  if (normalized === "cancelled") return "cancelled";
  if (normalized.includes("reject")) return "rejected";
  if (normalized.includes("progress") || normalized.includes("review") || normalized === "inreview") return "inprogress";
  return "pending";
}

interface StatusBadgeProps {
  status: string | null;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const key = normalizeStatus(status);
  const cfg = STATUS_CFG[key] ?? STATUS_CFG.pending;

  return (
    <Chip
      label={cfg.label}
      size="small"
      sx={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.color}20`,
        fontWeight: 500,
        fontSize: "0.75rem",
        "&::before": {
          content: '""',
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: cfg.dot,
          marginRight: 6,
        },
      }}
    />
  );
}

import { Chip } from "@mui/material";

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  fullyapproved: { label: "Fully Approved", color: "#107c10", bg: "#e3f1e3", dot: "#107c10" },
  approved: { label: "Approved", color: "#107c10", bg: "#e3f1e3", dot: "#107c10" },
  confirmed: { label: "Confirmed", color: "#107c10", bg: "#e3f1e3", dot: "#107c10" },
  rejected: { label: "Rejected", color: "#c62828", bg: "#f8e4e4", dot: "#c62828" },
  inprogress: { label: "In Review", color: "#101010", bg: "#eaf5fc", dot: "#101010" },
  pending: { label: "Pending", color: "#805800", bg: "#fff7bd", dot: "#805800" },
  cancelled: { label: "Cancelled", color: "#5f646d", bg: "#f7f5ef", dot: "#5f646d" },
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
        border: `1px solid ${cfg.color}`,
        fontWeight: 800,
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

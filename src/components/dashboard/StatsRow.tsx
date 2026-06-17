import { Box, Grid, Typography } from "@mui/material";
import { Description as DescriptionIcon, CheckCircle as CheckCircleIcon, AccessTime as AccessTimeIcon, Cancel as CancelIcon } from "@mui/icons-material";
import type { Submission } from "../../types";
import { editorial } from "../../theme/editorial";

interface StatsRowProps {
  submissions: Submission[];
}

export default function StatsRow({ submissions }: StatsRowProps) {
  let approved = 0;
  let pending = 0;
  let rejected = 0;

  for (const s of submissions) {
    const status = (s.formStatus ?? "").toLowerCase().replace(/[\s_-]/g, "");
    if (status === "fullyapproved" || status === "approved" || status === "completed") {
      approved++;
    } else if (status.includes("reject")) {
      rejected++;
    } else {
      pending++;
    }
  }

  const total = submissions.length;
  const percent = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

  const stats = [
    {
      label: "Total",
      value: total,
      helper: total === 1 ? "1 visible submission" : `${total} visible submissions`,
      progress: total > 0 ? 100 : 0,
      icon: <DescriptionIcon sx={{ fontSize: 24 }} />,
      bg: editorial.blueWash,
      color: editorial.pmwBlueDark,
      accent: editorial.pmwBlue,
    },
    {
      label: "Approved",
      value: approved,
      helper: `${percent(approved)}% completed`,
      progress: percent(approved),
      icon: <CheckCircleIcon sx={{ fontSize: 24 }} />,
      bg: "rgba(16, 124, 16, 0.08)",
      color: editorial.success,
      accent: editorial.success,
    },
    {
      label: "Pending",
      value: pending,
      helper: `${percent(pending)}% awaiting action`,
      progress: percent(pending),
      icon: <AccessTimeIcon sx={{ fontSize: 24 }} />,
      bg: editorial.yellowSoft,
      color: editorial.warning,
      accent: editorial.warning,
    },
    {
      label: "Rejected",
      value: rejected,
      helper: `${percent(rejected)}% rejected`,
      progress: percent(rejected),
      icon: <CancelIcon sx={{ fontSize: 24 }} />,
      bg: "rgba(198, 40, 40, 0.08)",
      color: editorial.error,
      accent: editorial.error,
    },
  ];

  return (
    <Grid container spacing={2}>
      {stats.map((stat) => (
        <Grid size={{ xs: 6, md: 3 }} key={stat.label}>
          <Box
            sx={{
              minHeight: 154,
              backgroundColor: "rgba(255, 255, 255, 0.9)",
              borderRadius: "8px",
              p: { xs: 1.5, sm: 2 },
              display: "grid",
              gridTemplateRows: "auto 1fr auto",
              gap: 1.5,
              transition: "box-shadow 0.2s ease, transform 0.2s ease",
              border: `1px solid ${editorial.border}`,
              boxShadow: "0 10px 28px rgba(0, 90, 158, 0.06)",
              cursor: "default",
              position: "relative",
              overflow: "hidden",
              "&::before": {
                content: '""',
                position: "absolute",
                inset: "0 0 auto 0",
                height: 3,
                backgroundColor: stat.accent,
              },
              "&:hover": {
                boxShadow: "0 14px 34px rgba(0, 90, 158, 0.12)",
                transform: "translateY(-2px)",
              },
              "@media (prefers-reduced-motion: reduce)": {
                transition: "box-shadow 0.2s ease",
                "&:hover": {
                  transform: "none",
                },
              },
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
              <Typography
                variant="caption"
                sx={{
                  textTransform: "uppercase",
                  letterSpacing: 0,
                  color: editorial.muted,
                  fontWeight: 800,
                  fontSize: "0.7rem",
                  display: "block",
                }}
              >
                {stat.label}
              </Typography>
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: "8px",
                  backgroundColor: stat.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: stat.color,
                  border: `1px solid ${stat.accent}40`,
                  flexShrink: 0,
                }}
              >
                {stat.icon}
              </Box>
            </Box>
            <Box sx={{ alignSelf: "end" }}>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 800,
                  color: editorial.ink,
                  letterSpacing: 0,
                  lineHeight: 1,
                  fontSize: { xs: "1.9rem", sm: "2.25rem" },
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {stat.value}
              </Typography>
              <Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 700 }}>
                {stat.helper}
              </Typography>
            </Box>
            <Box
              sx={{
                height: 6,
                borderRadius: 999,
                backgroundColor: "rgba(16, 16, 16, 0.08)",
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  height: "100%",
                  width: `${stat.progress}%`,
                  borderRadius: 999,
                  backgroundColor: stat.accent,
                  transition: "width 0.28s ease",
                }}
              />
            </Box>
          </Box>
        </Grid>
      ))}
    </Grid>
  );
}

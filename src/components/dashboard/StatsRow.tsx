import { Box, Grid, Typography } from "@mui/material";
import { Description as DescriptionIcon, CheckCircle as CheckCircleIcon, AccessTime as AccessTimeIcon, Cancel as CancelIcon } from "@mui/icons-material";
import type { Submission } from "../../types";

interface StatsRowProps {
  submissions: Submission[];
}

export default function StatsRow({ submissions }: StatsRowProps) {

  let approved = 0;
  let pending = 0;
  let rejected = 0;

  for (const s of submissions) {
    const status = (s.formStatus ?? "").toLowerCase().replace(/[\s_-]/g, "");
    if (status === "fullyapproved" || status === "approved") {
      approved++;
    } else if (status.includes("reject")) {
      rejected++;
    } else {
      pending++;
    }
  }

  const stats = [
    {
      label: "Total",
      value: submissions.length,
      icon: <DescriptionIcon sx={{ fontSize: 24 }} />,
      bg: "rgba(98, 100, 167, 0.08)",
      color: "#6264A7",
      accent: "#8E91C4",
    },
    {
      label: "Approved",
      value: approved,
      icon: <CheckCircleIcon sx={{ fontSize: 24 }} />,
      bg: "rgba(22, 163, 74, 0.08)",
      color: "#16A34A",
      accent: "#4ADE80",
    },
    {
      label: "Pending",
      value: pending,
      icon: <AccessTimeIcon sx={{ fontSize: 24 }} />,
      bg: "rgba(217, 119, 6, 0.08)",
      color: "#D97706",
      accent: "#FBBF24",
    },
    {
      label: "Rejected",
      value: rejected,
      icon: <CancelIcon sx={{ fontSize: 24 }} />,
      bg: "rgba(220, 38, 38, 0.08)",
      color: "#DC2626",
      accent: "#F87171",
    },
  ];

  return (
    <Grid container spacing={2.5}>
      {stats.map((stat) => (
        <Grid size={{ xs: 6, md: 3 }} key={stat.label}>
          <Box
            sx={{
              backgroundColor: "#ffffff",
              borderRadius: "8px",
              p: { xs: 1.75, sm: 2.5 },
              display: "flex",
              alignItems: "center",
              gap: { xs: 1.25, sm: 2 },
              transition: "box-shadow 0.2s ease, border-color 0.2s ease",
              border: "1px solid rgba(17, 24, 39, 0.08)",
              boxShadow: "0 1px 2px rgba(17, 24, 39, 0.05), 0 4px 12px rgba(17, 24, 39, 0.05)",
              cursor: "default",
              "&:hover": {
                boxShadow: "0 8px 20px rgba(17, 24, 39, 0.08)",
                borderColor: "rgba(17, 24, 39, 0.12)",
              },
            }}
          >
            <Box
              sx={{
                width: { xs: 44, sm: 56 },
                height: { xs: 44, sm: 56 },
                borderRadius: "8px",
                backgroundColor: stat.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: stat.color,
                border: `1px solid ${stat.accent}40`,
              }}
            >
              {stat.icon}
            </Box>
            <Box>
              <Typography
                variant="caption"
                sx={{
                  textTransform: "uppercase",
                  letterSpacing: 0,
                  color: "#6B7280",
                  fontWeight: 600,
                  fontSize: "0.7rem",
                  display: "block",
                  mb: 0.5,
                }}
              >
                {stat.label}
              </Typography>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 700,
                  color: "#111827",
                  letterSpacing: 0,
                  lineHeight: 1.15,
                  fontSize: "2rem",
                }}
              >
                {stat.value}
              </Typography>
            </Box>
          </Box>
        </Grid>
      ))}
    </Grid>
  );
}

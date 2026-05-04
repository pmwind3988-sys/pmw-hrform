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
      icon: <DescriptionIcon sx={{ fontSize: 22 }} />,
      bg: "rgba(98, 100, 167, 0.1)",
      color: "#6264A7",
      accent: "#8E91C4",
    },
    {
      label: "Approved",
      value: approved,
      icon: <CheckCircleIcon sx={{ fontSize: 22 }} />,
      bg: "rgba(22, 163, 74, 0.1)",
      color: "#16A34A",
      accent: "#4ADE80",
    },
    {
      label: "Pending",
      value: pending,
      icon: <AccessTimeIcon sx={{ fontSize: 22 }} />,
      bg: "rgba(217, 119, 6, 0.1)",
      color: "#D97706",
      accent: "#FBBF24",
    },
    {
      label: "Rejected",
      value: rejected,
      icon: <CancelIcon sx={{ fontSize: 22 }} />,
      bg: "rgba(220, 38, 38, 0.1)",
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
              backgroundColor: stat.bg,
              borderRadius: "18px",
              p: 2.5,
              display: "flex",
              alignItems: "center",
              gap: 2,
              transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
              border: "1px solid transparent",
              cursor: "default",
              "&:hover": {
                transform: "translateY(-3px)",
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.1)",
                borderColor: "rgba(0, 0, 0, 0.04)",
              },
            }}
          >
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: "14px",
                backgroundColor: "rgba(255, 255, 255, 0.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: stat.color,
                boxShadow: "inset 0 1px 2px rgba(255, 255, 255, 0.5)",
                border: "1px solid rgba(255, 255, 255, 0.5)",
              }}
            >
              {stat.icon}
            </Box>
            <Box>
              <Typography
                variant="caption"
                sx={{
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "rgba(26, 26, 46, 0.55)",
                  fontWeight: 600,
                  fontSize: "0.7rem",
                }}
              >
                {stat.label}
              </Typography>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 500,
                  color: stat.color,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                  fontSize: "1.75rem",
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

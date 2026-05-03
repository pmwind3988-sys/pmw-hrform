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
      icon: <DescriptionIcon sx={{ fontSize: 20 }} />,
      bg: "rgba(98,100,167,0.08)",
      color: "#6264A7",
    },
    {
      label: "Approved",
      value: approved,
      icon: <CheckCircleIcon sx={{ fontSize: 20 }} />,
      bg: "rgba(22,163,74,0.08)",
      color: "#16a34a",
    },
    {
      label: "Pending",
      value: pending,
      icon: <AccessTimeIcon sx={{ fontSize: 20 }} />,
      bg: "rgba(217,119,6,0.08)",
      color: "#d97706",
    },
    {
      label: "Rejected",
      value: rejected,
      icon: <CancelIcon sx={{ fontSize: 20 }} />,
      bg: "rgba(220,38,38,0.08)",
      color: "#dc2626",
    },
  ];

  return (
    <Grid container spacing={2}>
      {stats.map((stat) => (
        <Grid size={{ xs: 6, md: 3 }} key={stat.label}>
          <Box
            sx={{
              backgroundColor: stat.bg,
              borderRadius: "14px",
              p: 2.5,
              display: "flex",
              alignItems: "center",
              gap: 2,
              transition: "all 0.2s ease",
              "&:hover": {
                transform: "translateY(-1px)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
              },
            }}
          >
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: "12px",
                backgroundColor: "rgba(255,255,255,0.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: stat.color,
              }}
            >
              {stat.icon}
            </Box>
            <Box>
              <Typography
                variant="caption"
                sx={{
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "rgba(0,0,0,0.45)",
                  fontWeight: 500,
                  fontSize: "0.7rem",
                }}
              >
                {stat.label}
              </Typography>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 300,
                  color: stat.color,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.2,
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

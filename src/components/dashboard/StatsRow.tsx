import { Box, Grid, Typography } from "@mui/material";
import { Description as DescriptionIcon, CheckCircle as CheckCircleIcon, AccessTime as AccessTimeIcon, Cancel as CancelIcon } from "@mui/icons-material";
import type { Submission } from "../../types";
import { editorial, editorialShadow } from "../../theme/editorial";

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
      bg: editorial.blueWash,
      color: editorial.ink,
      accent: editorial.ink,
    },
    {
      label: "Approved",
      value: approved,
      icon: <CheckCircleIcon sx={{ fontSize: 24 }} />,
      bg: "#E3F1E3",
      color: editorial.success,
      accent: editorial.success,
    },
    {
      label: "Pending",
      value: pending,
      icon: <AccessTimeIcon sx={{ fontSize: 24 }} />,
      bg: "#FFF7BD",
      color: editorial.warning,
      accent: editorial.warning,
    },
    {
      label: "Rejected",
      value: rejected,
      icon: <CancelIcon sx={{ fontSize: 24 }} />,
      bg: "#F8E4E4",
      color: editorial.error,
      accent: editorial.error,
    },
  ];

  return (
    <Grid container spacing={2.5}>
      {stats.map((stat) => (
        <Grid size={{ xs: 6, md: 3 }} key={stat.label}>
          <Box
            sx={{
              backgroundColor: "#ffffff",
              borderRadius: "14px",
              p: { xs: 1.75, sm: 2.5 },
              display: "flex",
              alignItems: "center",
              gap: { xs: 1.25, sm: 2 },
              transition: "box-shadow 0.2s ease, border-color 0.2s ease",
              border: `1px solid ${editorial.border}`,
              boxShadow: "none",
              cursor: "default",
              "&:hover": {
                boxShadow: editorialShadow,
                borderColor: editorial.ink,
              },
            }}
          >
            <Box
              sx={{
                width: { xs: 44, sm: 56 },
                height: { xs: 44, sm: 56 },
                borderRadius: "50%",
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
                color: editorial.muted,
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
                  color: editorial.ink,
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

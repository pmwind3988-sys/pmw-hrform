import { Box, Grid, Typography } from "@mui/material";
import {
  CancelOutlined as CancelIcon,
  CheckCircleOutlined as CheckCircleIcon,
  DescriptionOutlined as DescriptionIcon,
  AccessTimeOutlined as AccessTimeIcon,
} from "@mui/icons-material";
import type { Submission } from "../../types";
import { editorial, si, siType } from "../../theme/editorial";
import { bucketSubmissions } from "../../utils/submissionStatusBuckets";

interface StatsRowProps {
  submissions: Submission[];
}

/**
 * The four KPI tiles.
 *
 * Redrawn to SI's StatCard: a flat white card at the one card elevation, a
 * micro uppercase label, the number in tabular figures, and a thin progress
 * bar. Three things it deliberately no longer does:
 *
 *   - It does not lift on hover. Every card in this system sits at the same
 *     depth and hierarchy comes from size and position, so a tile that rises
 *     when the pointer crosses it claims an importance it does not have —
 *     especially as these are not clickable.
 *   - It does not tint its own background. `rgba(255,255,255,0.94)` was a
 *     translucent white that let the old page gradient bleed through; the
 *     canvas is flat now, so the card is simply white with a hairline.
 *   - It does not compute its own status buckets. That rule is shared with the
 *     Dashboard section's summary line — see `submissionStatusBuckets`.
 *
 * The `accent` on each tile is the bright FILL (a 3px cap and a progress bar,
 * no text on it); `color` is the readable variant, because it tints a 24px icon
 * that has to be legible.
 */
export default function StatsRow({ submissions }: StatsRowProps) {
  const { total, approved, pending, rejected } = bucketSubmissions(submissions);

  const percent = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);
  const submissionLabel = (value: number, label: string) =>
    `${value} ${label} submission${value === 1 ? "" : "s"}`;

  const stats = [
    {
      label: "Total",
      value: total,
      helper: total === 1 ? "1 visible submission" : `${total} visible submissions`,
      progress: total > 0 ? 100 : 0,
      icon: <DescriptionIcon sx={{ fontSize: 24 }} />,
      bg: editorial.blueWash,
      color: editorial.navyDeep,
      accent: editorial.navy,
    },
    {
      label: "Approved",
      value: approved,
      helper: submissionLabel(approved, "approved"),
      progress: percent(approved),
      icon: <CheckCircleIcon sx={{ fontSize: 24 }} />,
      bg: editorial.successSoft,
      color: editorial.success,
      accent: editorial.successFill,
    },
    {
      label: "Pending",
      value: pending,
      helper: submissionLabel(pending, "pending"),
      progress: percent(pending),
      icon: <AccessTimeIcon sx={{ fontSize: 24 }} />,
      bg: editorial.accentSoft,
      color: editorial.accentText,
      accent: editorial.accent,
    },
    {
      label: "Rejected",
      value: rejected,
      helper: submissionLabel(rejected, "rejected"),
      progress: percent(rejected),
      icon: <CancelIcon sx={{ fontSize: 24 }} />,
      bg: editorial.errorSoft,
      color: editorial.error,
      accent: editorial.errorFill,
    },
  ];

  return (
    <Grid container spacing={2}>
      {stats.map((stat) => (
        <Grid size={{ xs: 6, md: 3 }} key={stat.label}>
          <Box
            sx={{
              minHeight: 138,
              backgroundColor: editorial.panel,
              border: `1px solid ${editorial.border}`,
              borderRadius: `${si.radius}px`,
              p: { xs: 1.5, sm: `${si.padTight}px` },
              display: "grid",
              gridTemplateRows: "auto 1fr auto",
              gap: 1.5,
              boxShadow: si.shadow,
              position: "relative",
              overflow: "hidden",
              "&::before": {
                content: '""',
                position: "absolute",
                inset: "0 0 auto 0",
                height: 3,
                backgroundColor: stat.accent,
              },
            }}
          >
            <Box
              sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}
            >
              <Typography sx={{ ...siType.micro, color: editorial.muted, display: "block" }}>
                {stat.label}
              </Typography>
              <Box
                sx={{
                  width: 38,
                  height: 38,
                  borderRadius: `${si.radiusSm}px`,
                  backgroundColor: stat.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: stat.color,
                  flexShrink: 0,
                }}
              >
                {stat.icon}
              </Box>
            </Box>
            <Box sx={{ alignSelf: "end" }}>
              <Typography
                sx={{
                  fontWeight: 700,
                  color: editorial.ink,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                  fontSize: { xs: "1.75rem", sm: "2rem" },
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {stat.value}
              </Typography>
              <Typography sx={{ ...siType.subtext, color: editorial.muted, mt: 0.25 }}>
                {stat.helper}
              </Typography>
            </Box>
            <Box
              sx={{
                height: 5,
                borderRadius: 999,
                backgroundColor: editorial.skySoft,
                overflow: "hidden",
              }}
            >
              {/**
                * Scaled, not resized. Animating `width` runs layout on every
                * frame; `transform` runs on the compositor. Same pattern as
                * `ScrollProgress` in DynamicFormPage.
                *
                * The fill carries NO radius of its own -- a horizontal scale
                * would squash its rounded caps into ellipses. The rounded ends
                * come from the track clipping it (`borderRadius` + `overflow:
                * hidden` above), which is undistortable.
                */}
              <Box
                sx={{
                  height: "100%",
                  width: "100%",
                  transformOrigin: "left center",
                  transform: `scaleX(${stat.progress / 100})`,
                  backgroundColor: stat.accent,
                  transition: "transform 0.28s ease",
                  "@media (prefers-reduced-motion: reduce)": { transition: "none" },
                }}
              />
            </Box>
          </Box>
        </Grid>
      ))}
    </Grid>
  );
}

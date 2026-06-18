import type { ReactNode } from "react";
import { Alert, Box, Button, Paper, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { Refresh, SearchOff } from "@mui/icons-material";
import { editorial, editorialHairline, editorialShadow } from "../../theme/editorial";

export const careerPageSx = {
  minHeight: "100vh",
  background: "var(--app-bg, linear-gradient(180deg, #EAF5FC 0%, #F7FAFD 48%, #FFFFFF 100%))",
  WebkitFontSmoothing: "antialiased",
  MozOsxFontSmoothing: "grayscale",
} satisfies SxProps<Theme>;

export const careerContentSx = {
  maxWidth: 1440,
  mx: "auto",
  px: { xs: 2, sm: 3, md: 4 },
  py: { xs: 2.5, sm: 3.5, md: 4 },
} satisfies SxProps<Theme>;

export const careerPanelSx = {
  borderRadius: "12px",
  boxShadow: editorialShadow,
  backgroundColor: "rgba(255,255,255,0.92)",
  backgroundImage: "none",
} satisfies SxProps<Theme>;

export const careerToolbarSx = {
  ...careerPanelSx,
  p: { xs: 1.5, md: 2 },
  display: "flex",
  flexDirection: "column",
  gap: 1.5,
} satisfies SxProps<Theme>;

export const careerSearchFieldSx = {
  flex: "1 1 300px",
  minWidth: { xs: "100%", sm: 280 },
  "& .MuiOutlinedInput-root": {
    borderRadius: "10px",
    backgroundColor: editorial.white,
  },
} satisfies SxProps<Theme>;

export const careerActionButtonSx = {
  borderRadius: "8px",
  textTransform: "none",
  fontWeight: 800,
  minHeight: 40,
  transition: "background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease",
  "&:active": {
    transform: "scale(0.96)",
  },
} satisfies SxProps<Theme>;

export const careerIconButtonSx = {
  width: 40,
  height: 40,
  borderRadius: "8px",
  border: `1px solid ${editorial.border}`,
  backgroundColor: editorial.white,
  color: editorial.pmwBlueDark,
  transition: "background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease",
  "&:hover": {
    backgroundColor: editorial.blueWash,
    borderColor: editorial.pmwBlue,
  },
  "&:active": {
    transform: "scale(0.96)",
  },
} satisfies SxProps<Theme>;

export const careerTableShellSx = {
  ...careerPanelSx,
  overflowX: "auto",
  "& .MuiTableCell-root": {
    fontVariantNumeric: "tabular-nums",
  },
  "& .MuiTableRow-root": {
    transition: "background-color 0.18s ease",
  },
  "& .MuiTableRow-hover:hover": {
    backgroundColor: editorial.blueSoft,
  },
} satisfies SxProps<Theme>;

export const careerReduceMotionSx = {
  "@media (prefers-reduced-motion: reduce)": {
    animation: "none",
    transition: "none",
    transform: "none",
    "&:hover": {
      transform: "none",
    },
    "&:active": {
      transform: "none",
    },
  },
} satisfies SxProps<Theme>;

export function getCareerErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const message = raw.replace(/\s+/g, " ").trim();
  if (!message) return fallback;

  if (/\b(401|unauthorized|not authenticated)\b/i.test(message) || /no signed-in account/i.test(message)) {
    return "Your session could not be verified. Sign in again, then retry.";
  }

  if (/\b(403|forbidden)\b/i.test(message) || /access denied/i.test(message)) {
    return "You do not have permission for this career area. Ask an HR Forms owner to check your access.";
  }

  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Could not reach the career service. Check your connection and retry.";
  }

  return message;
}

export function CareerErrorState({
  message,
  onRetry,
  retryLabel = "Retry",
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <Alert
      severity="error"
      sx={{
        mb: 3,
        borderRadius: "12px",
        border: "1px solid rgba(198, 40, 40, 0.22)",
        backgroundColor: "rgba(255,255,255,0.9)",
        color: editorial.ink,
        fontWeight: 600,
        "& .MuiAlert-icon": { color: editorial.error },
      }}
      action={
        onRetry ? (
          <Button size="small" startIcon={<Refresh />} onClick={onRetry} sx={careerActionButtonSx}>
            {retryLabel}
          </Button>
        ) : undefined
      }
    >
      <Typography variant="body2" sx={{ fontWeight: 800, color: editorial.ink, lineHeight: 1.4 }}>
        Something needs attention
      </Typography>
      <Typography variant="body2" sx={{ color: editorial.muted, lineHeight: 1.5 }}>
        {message}
      </Typography>
    </Alert>
  );
}

export function CareerEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Paper
      sx={{
        ...careerPanelSx,
        textAlign: "center",
        py: { xs: 5, sm: 7 },
        px: { xs: 2, sm: 3 },
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: "12px",
          mx: "auto",
          mb: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: editorial.muted,
          backgroundColor: editorial.blueWash,
          "& .MuiSvgIcon-root": { fontSize: 24 },
        }}
      >
        {icon ?? <SearchOff />}
      </Box>
      <Typography variant="h6" sx={{ color: editorial.ink, fontWeight: 800, mb: 0.5, textWrap: "balance" }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ color: editorial.muted, maxWidth: 520, mx: "auto", textWrap: "pretty" }}>
        {description}
      </Typography>
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Paper>
  );
}

type MetricTone = "blue" | "purple" | "success" | "warning" | "neutral";

const metricToneMap: Record<MetricTone, { bg: string; color: string }> = {
  blue: { bg: editorial.blueWash, color: editorial.pmwBlueDark },
  purple: { bg: editorial.purpleWash, color: editorial.pmwPurpleDark },
  success: { bg: "rgba(16, 124, 16, 0.12)", color: editorial.success },
  warning: { bg: "rgba(177, 92, 0, 0.12)", color: editorial.warning },
  neutral: { bg: "rgba(95, 100, 109, 0.12)", color: editorial.muted },
};

export function CareerMetricPill({
  icon,
  label,
  value,
  tone = "blue",
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  tone?: MetricTone;
}) {
  const colors = metricToneMap[tone];
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: { xs: 0.85, sm: 1.1 },
        p: { xs: 1, sm: 1.25 },
        minHeight: { xs: 64, sm: 70 },
        borderRadius: "12px",
        border: editorialHairline,
        backgroundColor: editorial.white,
        transition: "box-shadow 0.18s ease, border-color 0.18s ease, transform 0.18s ease",
        "&:hover": {
          borderColor: colors.color,
          boxShadow: editorialShadow,
          transform: "translateY(-2px)",
        },
        ...careerReduceMotionSx,
      }}
    >
      <Box
        sx={{
          width: { xs: 32, sm: 38 },
          height: { xs: 32, sm: 38 },
          borderRadius: "10px",
          backgroundColor: colors.bg,
          color: colors.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          "& .MuiSvgIcon-root": { fontSize: { xs: 18, sm: 20 } },
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            color: editorial.ink,
            fontWeight: 900,
            fontSize: { xs: "1rem", sm: "1.15rem" },
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </Typography>
        <Typography variant="caption" sx={{ color: editorial.muted, fontWeight: 800, lineHeight: 1.2 }}>
          {label}
        </Typography>
      </Box>
    </Box>
  );
}

import type { ReactNode } from "react";
import StatusPanel, { FailurePanel } from "../common/StatusPanel";
import { ensureReadable } from "../../theme/contrast";
import { Box, Paper, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { SearchOff } from "@mui/icons-material";
import { editorial, si, siType } from "../../theme/editorial";

export const careerPageSx = {
  minHeight: "100vh",
  background: `var(--app-bg, ${editorial.paper})`,
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
  borderRadius: `${si.radius}px`,
  boxShadow: si.shadow,
  border: "none",
  backgroundColor: editorial.panel,
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
    borderRadius: "999px",
    backgroundColor: editorial.skySoft,
  },
  "& .MuiOutlinedInput-notchedOutline": { border: "none" },
} satisfies SxProps<Theme>;

export const careerActionButtonSx = {
  textTransform: "none",
  fontWeight: 700,
  minHeight: 40,
  transition: "background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease",
  "&:active": {
    transform: "scale(0.96)",
  },
} satisfies SxProps<Theme>;

export const careerIconButtonSx = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  border: "none",
  backgroundColor: editorial.panel,
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
  color: editorial.navy,
  transition: "background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease",
  "&:hover": {
    backgroundColor: editorial.blueSoft,
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

/**
 * Job board geometry, measured from the Figma job-portal template
 * (file its0mTyfN3jAVbef8BKpEr, Jobs frame 25:6653).
 *
 * The template's own accent is a teal `#309689`. That is deliberately NOT carried
 * over — PRODUCT.md makes logo-led identity a design principle, so PMW blue takes
 * every place the teal appeared, including the tint in the card shadow. What the
 * template contributes is proportion: the generous 40px card padding, the 20px
 * radius, and the meta row rhythm are what make it read as a job board rather
 * than an admin table.
 */
export const jobBoardCardSx = {
  backgroundColor: editorial.panel,
  borderRadius: `${si.radius}px`,
  p: { xs: 2.5, sm: 3, md: 3.5 },
  display: "flex",
  flexDirection: "column",
  gap: { xs: 2, md: 2.5 },
  boxShadow: si.shadow,
} satisfies SxProps<Theme>;

/** Small tinted pill, for a posted-ago stamp or a plain label. */
export const jobBoardBadgeSx = {
  height: 26,
  borderRadius: `${si.radiusPill}px`,
  px: 0.5,
  backgroundColor: editorial.skySoft,
  color: editorial.navyDeep,
  ...siType.subtext,
  fontWeight: 600,
  "& .MuiChip-label": { px: 1 },
} satisfies SxProps<Theme>;

/** One `icon + label` pair in the card's meta row. */
export const jobBoardMetaItemSx = {
  display: "flex",
  alignItems: "center",
  gap: 1.5,
  color: editorial.muted,
  ...siType.body,
  minWidth: 0,
  "& .MuiSvgIcon-root": {
    fontSize: 18,
    color: editorial.muted,
    flexShrink: 0,
  },
} satisfies SxProps<Theme>;

/** Solid primary action ("Job details" / "Apply"). */
export const jobBoardPrimaryButtonSx = {
  ...careerActionButtonSx,
  px: 3,
  boxShadow: "none",
} satisfies SxProps<Theme>;

/** Left filter rail container from the template's sidebar. */
export const jobBoardRailSx = {
  backgroundColor: editorial.panel,
  borderRadius: `${si.radius}px`,
  boxShadow: si.shadow,
  p: { xs: 2, md: 2.5 },
  display: "flex",
  flexDirection: "column",
  gap: 2.5,
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

/**
 * A career page that could not show what it was asked for.
 *
 * Two cases, kept apart because they need opposite advice:
 * - A failed load (`message` is an error): the shared failure panel, which
 *   names what did not load and never blames the reader's connection for a
 *   server outage. This replaced "Something needs attention / Check your
 *   connection and retry", which said both.
 * - Something deliberately unavailable (pass `title`): a closed opening, say.
 *   Said plainly, with the way forward as the button.
 */
export function CareerErrorState({
  message,
  onRetry,
  retryLabel = "Try again",
  title,
  what = "this page",
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  title?: string;
  what?: string;
}) {
  if (title) {
    return (
      <Box sx={{ mb: 3 }}>
        <StatusPanel
          tone="gone"
          title={title}
          body={message}
          primary={onRetry ? { label: retryLabel, onClick: onRetry } : undefined}
        />
      </Box>
    );
  }
  return (
    <Box sx={{ mb: 3 }}>
      <FailurePanel what={what} error={message} onRetry={onRetry} />
    </Box>
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
          borderRadius: "50%",
          mx: "auto",
          mb: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: editorial.muted,
          backgroundColor: editorial.skySoft,
          "& .MuiSvgIcon-root": { fontSize: 24 },
        }}
      >
        {icon ?? <SearchOff />}
      </Box>
      <Typography variant="h6" sx={{ color: editorial.ink, fontWeight: 700, mb: 0.5, textWrap: "balance" }}>
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
  success: { bg: editorial.successSoft, color: editorial.success },
  warning: { bg: editorial.warningSoft, color: editorial.warning },
  neutral: { bg: editorial.skySoft, color: editorial.muted },
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
        borderRadius: `${si.radius}px`,
        backgroundColor: editorial.panel,
        boxShadow: si.shadow,
        ...careerReduceMotionSx,
      }}
    >
      <Box
        sx={{
          width: { xs: 32, sm: 38 },
          height: { xs: 32, sm: 38 },
          borderRadius: "50%",
          backgroundColor: colors.bg,
          // The tile's tint comes from config, so the pairing is only known here.
          color: ensureReadable(colors.color, colors.bg),
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
            fontWeight: 700,
            fontSize: { xs: "1rem", sm: "1.15rem" },
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </Typography>
        <Typography variant="caption" sx={{ color: editorial.muted, fontWeight: 700, lineHeight: 1.2 }}>
          {label}
        </Typography>
      </Box>
    </Box>
  );
}

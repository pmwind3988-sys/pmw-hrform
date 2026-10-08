import type { ReactNode } from "react";
import { Box, Button, Typography } from "@mui/material";
import {
  CloudOffOutlined,
  ErrorOutlineRounded,
  EventBusyRounded,
  HourglassTopRounded,
  InboxOutlined,
  LockOutlined,
  SearchOffRounded,
  WifiOffRounded,
} from "@mui/icons-material";
import { editorial, si, siType } from "../../theme/editorial";
import { describeFailure, type FailureKind } from "../../utils/friendlyError";

export type StatusTone = FailureKind | "waiting" | "lock" | "empty";

interface StatusAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
}

export interface StatusPanelProps {
  tone: StatusTone;
  title: string;
  body?: ReactNode;
  /** A short reference for support. Shown small, never as the message. */
  code?: string;
  primary?: StatusAction;
  secondary?: StatusAction;
  /**
   * `inline` sits among other content as one rounded sheet; `page` owns the
   * screen and centres itself with no sheet at all.
   */
  variant?: "inline" | "page";
}

/**
 * Colour by what happened, not by alarm. A server that did not answer is not
 * the reader's mistake, so it is amber ("wait and retry"), not red. Red is
 * kept for the case where something genuinely broke.
 */
const TONE: Record<StatusTone, { icon: ReactNode; bg: string; fg: string }> = {
  unreachable: { icon: <CloudOffOutlined />, bg: editorial.accentSoft, fg: editorial.accentText },
  offline: { icon: <WifiOffRounded />, bg: editorial.accentSoft, fg: editorial.accentText },
  waiting: { icon: <HourglassTopRounded />, bg: editorial.accentSoft, fg: editorial.accentText },
  "not-found": { icon: <SearchOffRounded />, bg: editorial.sky, fg: editorial.navyDeep },
  gone: { icon: <EventBusyRounded />, bg: editorial.sky, fg: editorial.navyDeep },
  "no-access": { icon: <LockOutlined />, bg: editorial.sky, fg: editorial.navyDeep },
  lock: { icon: <LockOutlined />, bg: editorial.sky, fg: editorial.navyDeep },
  empty: { icon: <InboxOutlined />, bg: editorial.sky, fg: editorial.navyDeep },
  unknown: { icon: <ErrorOutlineRounded />, bg: editorial.errorSoft, fg: editorial.error },
};

/**
 * The one way this app says "this didn't work" or "there's nothing here".
 *
 * A round icon, a headline that names what happened, one sentence on what to
 * do, and at most two actions. It REPLACES whatever the screen would otherwise
 * have shown — never sits beside zeros or an empty list, which is how the guest
 * members page came to say "Could not load", "No members" and "Nobody has
 * signed in yet" all at once.
 */
export default function StatusPanel({
  tone,
  title,
  body,
  code,
  primary,
  secondary,
  variant = "inline",
}: StatusPanelProps) {
  const look = TONE[tone];
  const isPage = variant === "page";

  return (
    <Box
      role={tone === "empty" ? undefined : "status"}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 1.5,
        px: { xs: 2.5, sm: 4 },
        py: isPage ? { xs: 6, sm: 10 } : { xs: 4, sm: 5 },
        ...(isPage
          ? { minHeight: "60vh", justifyContent: "center" }
          : { backgroundColor: editorial.panel, borderRadius: `${si.radius}px`, boxShadow: si.shadow }),
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: isPage ? 88 : 64,
          height: isPage ? 88 : 64,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: look.bg,
          color: look.fg,
          mb: 0.5,
          "& svg": { fontSize: isPage ? 40 : 30 },
        }}
      >
        {look.icon}
      </Box>

      <Typography component="h2" sx={{ ...(isPage ? siType.pageTitle : siType.subsectionTitle), color: editorial.ink }}>
        {title}
      </Typography>

      {body && (
        <Typography component="div" sx={{ ...siType.body, color: editorial.muted, maxWidth: 440 }}>
          {body}
        </Typography>
      )}

      {(primary || secondary) && (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center", mt: 1 }}>
          {primary && (
            <Button variant="contained" onClick={primary.onClick} startIcon={primary.icon}>
              {primary.label}
            </Button>
          )}
          {secondary && (
            <Button variant="text" onClick={secondary.onClick} startIcon={secondary.icon}>
              {secondary.label}
            </Button>
          )}
        </Box>
      )}

      {code && (
        <Typography sx={{ ...siType.subtext, color: editorial.softMuted, mt: 0.5, fontVariantNumeric: "tabular-nums" }}>
          Reference: {code}
        </Typography>
      )}
    </Box>
  );
}

interface FailurePanelProps {
  /** The thing that did not load, as a reader would say it: "openings". */
  what: string;
  error?: unknown;
  status?: number | null;
  onRetry?: () => void;
  secondary?: StatusAction;
  variant?: "inline" | "page";
}

/** `StatusPanel` for a failed load, with the words chosen by `describeFailure`. */
export function FailurePanel({ what, error, status, onRetry, secondary, variant }: FailurePanelProps) {
  const copy = describeFailure(what, { error, status });
  return (
    <StatusPanel
      tone={copy.kind}
      title={copy.title}
      body={copy.body}
      code={copy.code}
      primary={onRetry ? { label: "Try again", onClick: onRetry } : undefined}
      secondary={secondary}
      variant={variant}
    />
  );
}

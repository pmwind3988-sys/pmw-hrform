import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import {
  CheckCircleOutlined as CheckCircleOutlinedIcon,
  ErrorOutlined as ErrorOutlinedIcon,
  Login as LoginIcon,
  Logout as LogoutIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import StatusPanel from "../common/StatusPanel";
import type { LoadingStep, LoadingStepStatus } from "./LoadingScreen";
import { editorial } from "../../theme/editorial";
import { statusFromError } from "../../utils/friendlyError";

interface ErrorScreenProps {
  errorMsg: string;
  onRetry: () => void;
  onSignOut?: () => void;
  title?: string;
  primaryActionLabel?: string;
  primaryActionIcon?: "refresh" | "login";
  recoverySteps?: LoadingStep[];
}

function getStepColor(status: LoadingStepStatus): string {
  if (status === "complete") return editorial.success;
  if (status === "error") return editorial.error;
  if (status === "active") return editorial.pmwBlue;
  return editorial.softMuted;
}

function StepIcon({ status }: { status: LoadingStepStatus }) {
  const color = getStepColor(status);

  if (status === "complete") {
    return <CheckCircleOutlinedIcon sx={{ color, fontSize: 20 }} />;
  }

  if (status === "error") {
    return <ErrorOutlinedIcon sx={{ color, fontSize: 20 }} />;
  }

  if (status === "active") {
    return <CircularProgress size={18} thickness={5} sx={{ color }} />;
  }

  return <RadioButtonUncheckedIcon sx={{ color, fontSize: 20 }} />;
}

/**
 * Only a sentence written for a person goes on screen. Raw technical text
 * (a status code, an exception name, "undefined") is replaced by a plain line.
 */
function isHumanMessage(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (statusFromError(text) !== null) return false;
  return !/exception|typeerror|failed to fetch|undefined|null|^error\b/i.test(text);
}

export default function ErrorScreen({
  errorMsg,
  onRetry,
  onSignOut,
  title = "We couldn't load the portal",
  primaryActionLabel = "Try again",
  primaryActionIcon = "refresh",
  recoverySteps,
}: ErrorScreenProps) {
  const primaryIcon = primaryActionIcon === "login" ? <LoginIcon /> : <RefreshIcon />;
  const hasRecoverySteps = Boolean(recoverySteps?.length);

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        backgroundColor: editorial.paper,
      }}
    >
      <StatusPanel
        variant="page"
        tone="unknown"
        title={title}
        body={isHumanMessage(errorMsg) ? errorMsg : "Try again in a minute."}
        primary={{ label: primaryActionLabel, onClick: onRetry, icon: primaryIcon }}
        secondary={onSignOut ? { label: "Sign out", onClick: onSignOut, icon: <LogoutIcon /> } : undefined}
      />

      {hasRecoverySteps && (
        <Stack
          component="ol"
          spacing={1}
          sx={{
            width: "100%",
            maxWidth: 440,
            mx: "auto",
            mb: 4,
            p: 1,
            boxSizing: "border-box",
            listStyle: "none",
            borderRadius: "12px",
            backgroundColor: editorial.panel,
            boxShadow: "0 12px 34px rgba(15, 23, 42, 0.08)",
          }}
        >
          {recoverySteps?.map((step) => {
            const color = getStepColor(step.status);
            const isActive = step.status === "active";

            return (
              <Box
                component="li"
                key={step.label}
                aria-current={isActive ? "step" : undefined}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "24px 1fr",
                  gap: 1.25,
                  alignItems: "start",
                  px: 1.5,
                  py: 1.25,
                  borderRadius: "12px",
                  backgroundColor: isActive ? "rgba(0, 120, 212, 0.08)" : "transparent",
                }}
              >
                <Box sx={{ minHeight: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <StepIcon status={step.status} />
                </Box>

                <Stack spacing={0.25}>
                  <Typography
                    variant="body2"
                    sx={{
                      color: step.status === "pending" ? editorial.muted : editorial.ink,
                      fontWeight: isActive ? 700 : 600,
                      lineHeight: 1.35,
                    }}
                  >
                    {step.label}
                  </Typography>
                  {step.description && (
                    <Typography
                      variant="caption"
                      sx={{
                        color,
                        lineHeight: 1.45,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {step.description}
                    </Typography>
                  )}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}

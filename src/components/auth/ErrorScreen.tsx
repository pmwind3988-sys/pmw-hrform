import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  CircularProgress,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  CheckCircleOutlined as CheckCircleOutlinedIcon,
  ErrorOutlined as ErrorOutlinedIcon,
  Login as LoginIcon,
  Logout as LogoutIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { fadeInUp } from "../../theme";
import Logo from "../../components/Logo";
import type { LoadingStep, LoadingStepStatus } from "./LoadingScreen";
import { editorial } from "../../theme/editorial";

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

export default function ErrorScreen({
  errorMsg,
  onRetry,
  onSignOut,
  title = "Something went wrong",
  primaryActionLabel = "Try again",
  primaryActionIcon = "refresh",
  recoverySteps,
}: ErrorScreenProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const primaryIcon = primaryActionIcon === "login" ? <LoginIcon /> : <RefreshIcon />;
  const hasRecoverySteps = Boolean(recoverySteps?.length);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: editorial.paperSoft,
        position: "relative",
        overflow: "hidden",
        py: 4,
        padding: isMobile ? 2 : 4,
      }}
    >
      <Box
        sx={{
          position: "absolute",
          top: "-15%",
          right: "-10%",
          width: isMobile ? 300 : 500,
          height: isMobile ? 300 : 500,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(220,38,38,0.04) 0%, rgba(220,38,38,0) 70%)",
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          bottom: "-20%",
          left: "-15%",
          width: isMobile ? 350 : 600,
          height: isMobile ? 350 : 600,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(98,100,167,0.03) 0%, rgba(98,100,167,0) 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Subtle geometric accent lines */}
      <svg
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 0,
        }}
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <path d="M0 120 Q360 80 720 140 T1440 100" stroke="rgba(220, 38, 38, 0.04)" strokeWidth="1.5" />
        <path d="M0 780 Q360 820 720 760 T1440 800" stroke="rgba(98, 100, 167, 0.04)" strokeWidth="1.5" />
        <circle cx="1200" cy="150" r="100" stroke="rgba(220, 38, 38, 0.03)" strokeWidth="1" />
        <circle cx="180" cy="720" r="70" stroke="rgba(98, 100, 167, 0.03)" strokeWidth="1" />
      </svg>

      <Container maxWidth="xs" sx={{ position: "relative", zIndex: 1 }}>
        <Card
          elevation={0}
          sx={{
            borderRadius: "12px",
            border: "1px solid rgba(220,38,38,0.1)",
            boxShadow: "0 4px 24px rgba(220,38,38,0.06)",
            backgroundColor: "rgba(255, 255, 255, 0.92)",
            backdropFilter: "blur(12px)",
            transition: "box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            "&:hover": {
              boxShadow: "0 8px 40px rgba(220, 38, 38, 0.1), 0 2px 8px rgba(220, 38, 38, 0.06)",
            },
            animation: `${fadeInUp} 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
          }}
        >
          <Box sx={{ height: 4, background: "linear-gradient(90deg, #DC2626, #F59E0B)" }} />

          <CardContent sx={{ p: isMobile ? 3.5 : 5 }}>
            <Stack spacing={3} sx={{ alignItems: "center" }}>
              {/* Logo */}
              <Box
                sx={{
                  position: "relative",
                  "&::before": {
                    content: '""',
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 120,
                    height: 120,
                    borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(220, 38, 38, 0.1) 0%, rgba(220, 38, 38, 0) 70%)",
                    zIndex: -1,
                  },
                }}
              >
                <Logo size={{ xs: 64, sm: 72 }} />
              </Box>

              <Typography
                variant="h2"
                sx={{
                  fontWeight: 700,
                  color: editorial.error,
                  letterSpacing: 0,
                  textAlign: "center",
                  fontSize: isMobile ? "1.75rem" : "2.25rem",
                  textWrap: "balance",
                }}
              >
                {title}
              </Typography>

              <Typography
                variant="body1"
                sx={{
                  color: editorial.muted,
                  lineHeight: 1.6,
                  textAlign: "center",
                  wordBreak: "break-word",
                  maxWidth: 400,
                  textWrap: "pretty",
                }}
              >
                {errorMsg}
              </Typography>

              {hasRecoverySteps && (
                <Stack
                  component="ol"
                  spacing={1}
                  sx={{
                    width: "100%",
                    m: 0,
                    p: 1,
                    listStyle: "none",
                    borderRadius: "12px",
                    backgroundColor: "rgba(255, 255, 255, 0.8)",
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

              <Button
                variant="contained"
                fullWidth
                size="large"
                startIcon={primaryIcon}
                onClick={onRetry}
                sx={{
                  backgroundColor: editorial.pmwBlue,
                  borderRadius: "12px",
                  py: 1.75,
                  fontSize: "0.9375rem",
                  fontWeight: 500,
                  boxShadow: "0 2px 8px rgba(0, 120, 212, 0.2)",
                  transition: "background-color 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1), transform 0.12s cubic-bezier(0.2, 0, 0, 1)",
                  "&:hover": {
                    backgroundColor: editorial.pmwBlue,
                    boxShadow: "0 6px 20px rgba(0, 120, 212, 0.3)",
                  },
                  "&:active": {
                    transform: "scale(0.96)",
                  },
                }}
              >
                {primaryActionLabel}
              </Button>

              {onSignOut && (
                <Button
                  variant="outlined"
                  fullWidth
                  size="large"
                  startIcon={<LogoutIcon />}
                  onClick={onSignOut}
                  sx={{
                    borderRadius: "12px",
                    py: 1.75,
                    fontSize: "0.9375rem",
                    fontWeight: 500,
                    borderColor: "rgba(17, 24, 39, 0.15)",
                    color: editorial.muted,
                    borderWidth: "1.5px",
                    transition: "border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1), color 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.25s cubic-bezier(0.4, 0, 0.2, 1), transform 0.12s cubic-bezier(0.2, 0, 0, 1)",
                    "&:hover": {
                      borderColor: editorial.pmwBlue,
                      color: editorial.pmwBlue,
                      backgroundColor: "rgba(0, 120, 212, 0.04)",
                    },
                    "&:active": {
                      transform: "scale(0.96)",
                    },
                  }}
                >
                  Sign out
                </Button>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}

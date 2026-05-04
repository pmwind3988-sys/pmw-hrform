import {
  Box,
  CircularProgress,
  Container,
  LinearProgress,
  Stack,
  Typography,
  useTheme,
  useMediaQuery,
} from "@mui/material";

interface LoadingScreenProps {
  userEmail?: string;
  progress?: number; // 0-100
  status?: string; // e.g. "Fetching submissions from 'Leave Form' (2/5)..."
}

export default function LoadingScreen({ userEmail, progress, status }: LoadingScreenProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const hasProgress = typeof progress === "number" && progress > 0;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        background: "#FAFBFC",
        position: "relative",
        overflow: "hidden",
        padding: isMobile ? 2 : 4,
      }}
    >
      {/* Decorative background blobs */}
      <Box
        sx={{
          position: "absolute",
          top: "-20%",
          right: "-15%",
          width: isMobile ? "350px" : "600px",
          height: isMobile ? "350px" : "600px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0, 120, 212, 0.08) 0%, rgba(0, 120, 212, 0) 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <Box
        sx={{
          position: "absolute",
          bottom: "-25%",
          left: "-20%",
          width: isMobile ? "400px" : "700px",
          height: isMobile ? "400px" : "700px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(98, 100, 167, 0.06) 0%, rgba(98, 100, 167, 0) 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <Box
        sx={{
          position: "absolute",
          top: "35%",
          left: "55%",
          width: isMobile ? "250px" : "450px",
          height: isMobile ? "250px" : "450px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(98, 100, 167, 0.04) 0%, rgba(98, 100, 167, 0) 70%)",
          pointerEvents: "none",
          zIndex: 0,
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
        <path d="M0 120 Q360 80 720 140 T1440 100" stroke="rgba(0, 120, 212, 0.05)" strokeWidth="1.5" />
        <path d="M0 780 Q360 820 720 760 T1440 800" stroke="rgba(98, 100, 167, 0.05)" strokeWidth="1.5" />
        <circle cx="1200" cy="150" r="100" stroke="rgba(0, 120, 212, 0.04)" strokeWidth="1" />
        <circle cx="180" cy="720" r="70" stroke="rgba(98, 100, 167, 0.04)" strokeWidth="1" />
      </svg>

      <Container maxWidth="sm" sx={{ position: "relative", zIndex: 1 }}>
        <Stack spacing={3.5} sx={{ alignItems: "center" }}>
          {/* Animated spinner with glow */}
          <Box sx={{ position: "relative" }}>
            <Box
              sx={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 100,
                height: 100,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(0, 120, 212, 0.15) 0%, rgba(0, 120, 212, 0) 70%)",
                animation: "pulse 2s ease-in-out infinite",
                "@keyframes pulse": {
                  "0%, 100%": { transform: "translate(-50%, -50%) scale(1)", opacity: 0.6 },
                  "50%": { transform: "translate(-50%, -50%) scale(1.2)", opacity: 0.3 },
                },
              }}
            />
            {hasProgress && progress < 100 ? (
              <CircularProgress
                variant="determinate"
                value={progress}
                size={72}
                thickness={4}
                sx={{ color: "#0078D4" }}
              />
            ) : (
              <CircularProgress size={64} thickness={4} sx={{ color: "#0078D4" }} />
            )}
          </Box>

          {/* Percentage for determinate state */}
          {hasProgress && progress < 100 && (
            <Typography
              variant="h4"
              sx={{
                fontWeight: 500,
                color: "#1A1A2E",
                letterSpacing: "-0.02em",
                fontSize: "1.5rem",
              }}
            >
              {progress}%
            </Typography>
          )}

          <Stack spacing={1} sx={{ alignItems: "center" }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 500,
                color: "#1A1A2E",
                letterSpacing: "-0.01em",
              }}
            >
              {hasProgress && progress < 100 ? "Loading..." : "Please wait..."}
            </Typography>

            {status && (
              <Typography
                variant="body2"
                sx={{
                  color: "rgba(26, 26, 46, 0.55)",
                  fontFamily: "monospace",
                  textAlign: "center",
                  minHeight: "1.5em",
                  maxWidth: 400,
                }}
              >
                {status}
              </Typography>
            )}
          </Stack>

          {hasProgress && (
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                width: "100%",
                maxWidth: 360,
                borderRadius: 6,
                height: 6,
                backgroundColor: "rgba(0, 120, 212, 0.12)",
                "& .MuiLinearProgress-bar": {
                  borderRadius: 6,
                  backgroundColor: "#0078D4",
                },
              }}
            />
          )}

          {userEmail && (
            <Typography
              variant="body2"
              sx={{
                color: "rgba(26, 26, 46, 0.45)",
                fontFamily: "monospace",
                fontSize: "0.8rem",
              }}
            >
              Signed in as {userEmail}
            </Typography>
          )}
        </Stack>
      </Container>
    </Box>
  );
}

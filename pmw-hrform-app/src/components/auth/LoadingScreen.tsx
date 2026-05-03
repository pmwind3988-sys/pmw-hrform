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
  progress?: number;   // 0-100
  status?: string;      // e.g. "Fetching submissions from 'Leave Form' (2/5)..."
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
        background: "#ffffff",
        position: "relative",
        overflow: "hidden",
        padding: isMobile ? 2 : 4,
      }}
    >
      {/* Decorative background blobs */}
      <Box
        sx={{
          position: "absolute",
          top: "-15%",
          right: "-10%",
          width: isMobile ? "300px" : "500px",
          height: isMobile ? "300px" : "500px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(0,120,212,0.06) 0%, rgba(0,120,212,0) 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <Box
        sx={{
          position: "absolute",
          bottom: "-20%",
          left: "-15%",
          width: isMobile ? "350px" : "600px",
          height: isMobile ? "350px" : "600px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(98,100,167,0.05) 0%, rgba(98,100,167,0) 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <Box
        sx={{
          position: "absolute",
          top: "40%",
          left: "60%",
          width: isMobile ? "200px" : "350px",
          height: isMobile ? "200px" : "350px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(0,120,212,0.04) 0%, rgba(0,120,212,0) 70%)",
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
        <path
          d="M0 120 Q360 80 720 140 T1440 100"
          stroke="rgba(0,120,212,0.04)"
          strokeWidth="1.5"
        />
        <path
          d="M0 780 Q360 820 720 760 T1440 800"
          stroke="rgba(98,100,167,0.04)"
          strokeWidth="1.5"
        />
        <circle
          cx="1200"
          cy="150"
          r="80"
          stroke="rgba(0,120,212,0.03)"
          strokeWidth="1"
        />
        <circle
          cx="200"
          cy="700"
          r="60"
          stroke="rgba(98,100,167,0.03)"
          strokeWidth="1"
        />
      </svg>

      <Container
        maxWidth="sm"
        sx={{ position: "relative", zIndex: 1 }}
      >
        <Stack spacing={3} sx={{ alignItems: "center" }}>
          {hasProgress && progress < 100 ? (
            <>
              <CircularProgress
                variant="determinate"
                value={progress}
                size={64}
                thickness={4}
                sx={{ color: "#0078D4" }}
              />
              <Typography
                variant="h6"
                sx={{ fontWeight: 300, color: "#1a1a2e", letterSpacing: "-0.02em" }}
              >
                {progress}%
              </Typography>
            </>
          ) : (
            <CircularProgress size={56} thickness={4} sx={{ color: "#0078D4" }} />
          )}

          <Typography
            variant="h6"
            sx={{ fontWeight: 300, color: "#1a1a2e", letterSpacing: "-0.02em" }}
          >
            Loading...
          </Typography>

          {status && (
            <Typography
              variant="body2"
              sx={{
                color: "rgba(0,0,0,0.45)",
                fontFamily: "monospace",
                textAlign: "center",
                minHeight: "1.5em",
              }}
            >
              {status}
            </Typography>
          )}

          {hasProgress && (
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                width: "100%",
                borderRadius: 4,
                height: 6,
                backgroundColor: "rgba(0,120,212,0.12)",
                "& .MuiLinearProgress-bar": {
                  borderRadius: 4,
                  backgroundColor: "#0078D4",
                },
              }}
            />
          )}

          {userEmail && (
            <Typography variant="body2" sx={{ color: "rgba(0,0,0,0.45)", fontFamily: "monospace" }}>
              Signed in as {userEmail}
            </Typography>
          )}
        </Stack>
      </Container>
    </Box>
  );
}

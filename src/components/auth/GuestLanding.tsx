import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Login as LoginIcon } from "@mui/icons-material";
import { fadeInUp } from "../../theme";
import Logo from "../../components/Logo";

interface GuestLandingProps {
  onLogin: () => void;
  onForgetChoice: () => void;
}

export default function GuestLanding({ onLogin, onForgetChoice }: GuestLandingProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        background: "#F8F9FC",
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
            "radial-gradient(circle, rgba(0,120,212,0.05) 0%, rgba(0,120,212,0) 70%)",
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
            "radial-gradient(circle, rgba(98,100,167,0.04) 0%, rgba(98,100,167,0) 70%)",
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
            "radial-gradient(circle, rgba(0,120,212,0.03) 0%, rgba(0,120,212,0) 70%)",
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

      <Container maxWidth="sm" sx={{ position: "relative", zIndex: 1 }}>
        <Card
          sx={{
            width: "100%",
            maxWidth: isMobile ? "100%" : 480,
            mx: "auto",
            borderRadius: "24px",
            boxShadow: "0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)",
            border: "1px solid rgba(0, 0, 0, 0.04)",
            backgroundColor: "rgba(255, 255, 255, 0.92)",
            backdropFilter: "blur(12px)",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            "&:hover": {
              boxShadow: "0 8px 40px rgba(0, 0, 0, 0.1), 0 2px 8px rgba(0, 0, 0, 0.06)",
              transform: "translateY(-2px)",
            },
            animation: `${fadeInUp} 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
          }}
        >
          {/* Top accent bar */}
          <Box
            sx={{
              height: 4,
              background: "linear-gradient(90deg, #0078D4 0%, #6264A7 100%)",
              borderRadius: "24px 24px 0 0",
            }}
          />

          <CardContent
            sx={{
              padding: isMobile ? 3.5 : 5,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* Back to choice link */}
            <Button
              variant="text"
              onClick={onForgetChoice}
              sx={{
                alignSelf: "flex-start",
                mb: 3,
                color: "#6B7280",
                fontSize: "0.85rem",
                fontWeight: 500,
                textTransform: "none",
                "&:hover": {
                  color: "#0078D4",
                  backgroundColor: "rgba(0, 120, 212, 0.04)",
                },
              }}
            >
              ← Back to choice
            </Button>

            {/* Logo with colored background */}
            <Box
              sx={{
                position: "relative",
                mb: 3,
                "&::before": {
                  content: '""',
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 120,
                  height: 120,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(0, 120, 212, 0.1) 0%, rgba(0, 120, 212, 0) 70%)",
                  zIndex: -1,
                },
              }}
            >
              <Logo size={72} />
            </Box>

            <Typography
              variant="h2"
              component="h2"
              align="center"
              sx={{
                fontWeight: 700,
                color: "#111827",
                letterSpacing: "-0.03em",
                fontSize: isMobile ? "1.75rem" : "2.25rem",
                mb: 2,
              }}
            >
              PMW HR Forms Portal
            </Typography>

            <Typography
              variant="body1"
              align="center"
              sx={{
                color: "#6B7280",
                lineHeight: 1.6,
                maxWidth: 480,
                mb: 4,
              }}
            >
              Sign in with your Microsoft 365 account to access submission history, approval status, and full portal features.
            </Typography>

            <Button
              variant="contained"
              size="large"
              startIcon={<LoginIcon />}
              onClick={onLogin}
              sx={{
                backgroundColor: "#0078D4",
                color: "#ffffff",
                borderRadius: "12px",
                py: 1.75,
                px: 4,
                fontSize: "1rem",
                fontWeight: 500,
                boxShadow: "0 2px 8px rgba(0, 120, 212, 0.2)",
                transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                "&:hover": {
                  backgroundColor: "#0068C4",
                  boxShadow: "0 6px 20px rgba(0, 120, 212, 0.3)",
                  transform: "translateY(-1px)",
                },
                "&:active": {
                  transform: "scale(0.98) translateY(0)",
                },
              }}
            >
              Sign in with Microsoft 365
            </Button>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
import {
  AppBar,
  Box,
  Button,
  Container,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Login as LoginIcon, Description as DescriptionIcon } from "@mui/icons-material";

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
        background: "#ffffff",
        position: "relative",
        overflow: "hidden",
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

      {/* Sticky header */}
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          backgroundColor: "#ffffff",
          borderBottom: "1px solid rgba(0,0,0,0.04)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          zIndex: 2,
        }}
      >
        <Toolbar>
          <Typography
            variant="h6"
            component="h1"
            sx={{
              fontWeight: 300,
              color: "#1a1a2e",
              letterSpacing: "-0.02em",
            }}
          >
            PMW HR Forms
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button
            variant="outlined"
            onClick={onForgetChoice}
            sx={{
              mr: 2,
              borderColor: "rgba(0,0,0,0.15)",
              color: "rgba(0,0,0,0.65)",
              borderRadius: "12px",
              textTransform: "none",
            }}
          >
            Back
          </Button>
          <Button
            variant="contained"
            onClick={onLogin}
            startIcon={<LoginIcon />}
            sx={{
              backgroundColor: "#0078D4",
              borderRadius: "12px",
              textTransform: "none",
              "&:hover": {
                backgroundColor: "#005A9E",
              },
            }}
          >
            Sign in
          </Button>
        </Toolbar>
      </AppBar>

      {/* Main content */}
      <Container
        maxWidth="md"
        sx={{
          position: "relative",
          zIndex: 1,
          flexGrow: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          py: 8,
        }}
      >
        <Stack
          spacing={3}
          sx={{ alignItems: "center", maxWidth: 600, px: isMobile ? 2 : 4 }}
        >
          <DescriptionIcon
            sx={{
              fontSize: 64,
              color: "rgba(0,0,0,0.2)",
              mb: 2,
            }}
          />

          <Typography
            variant="h2"
            component="h2"
            align="center"
            sx={{
              fontWeight: 300,
              color: "#1a1a2e",
              letterSpacing: "-0.02em",
              fontSize: isMobile ? "2rem" : "3rem",
            }}
          >
            PMW HR Forms Portal
          </Typography>

          <Typography
            variant="body1"
            align="center"
            sx={{
              color: "rgba(0,0,0,0.55)",
              lineHeight: 1.7,
              maxWidth: 480,
              mb: 2,
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
              boxShadow: "0 2px 8px rgba(0,120,212,0.25)",
              transition: "all 0.2s ease",
              "&:hover": {
                backgroundColor: "#005A9E",
                boxShadow: "0 4px 16px rgba(0,120,212,0.35)",
                transform: "translateY(-1px)",
              },
              "&:active": {
                transform: "translateY(0)",
              },
            }}
          >
            Sign in with Microsoft 365
          </Button>
        </Stack>
      </Container>
    </Box>
  );
}

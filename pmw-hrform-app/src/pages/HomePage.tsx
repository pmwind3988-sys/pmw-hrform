import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Divider,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Login as LoginIcon, Person as PersonIcon } from "@mui/icons-material";

interface HomePageProps {
  onSignIn: () => void;
  onGuest: () => void;
}

export default function HomePage({ onSignIn, onGuest }: HomePageProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTablet = useMediaQuery(theme.breakpoints.between("sm", "md"));

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
        padding: isMobile ? 2 : isTablet ? 3 : 4,
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
        <Card
          sx={{
            width: "100%",
            maxWidth: isMobile ? "100%" : 480,
            mx: "auto",
            borderRadius: "20px",
            boxShadow:
              "0 2px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
            border: "1px solid rgba(0,0,0,0.04)",
            backdropFilter: "blur(8px)",
            backgroundColor: "rgba(255,255,255,0.95)",
            transition: "box-shadow 0.3s ease",
            "&:hover": {
              boxShadow:
                "0 4px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
            },
          }}
        >
          <CardContent
            sx={{
              padding: isMobile ? 3 : 5,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <Box
              component="img"
              src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiB4PSIwIiB5PSIwIiBmaWxsPSIjMDA3OEQ0Ii8+CjxyZWN0IHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgeD0iNDAiIHk9IjAiIGZpbGw9IiM0REFFMzgiLz4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiB4PSIwIiB5PSI0MCIgZmlsbD0iIzQ1RTRFMCIvPgo8cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHg9IjQwIiB5PSI0MCIgZmlsbD0iI0YyNTAyMiIvPgo8L3N2Zz4K"
              alt="Logo"
              sx={{
                width: isMobile ? 56 : 72,
                height: isMobile ? 56 : 72,
                mb: 2.5,
              }}
            />

            <Typography
              variant={isMobile ? "h4" : "h3"}
              component="h1"
              gutterBottom
              align="center"
              sx={{
                fontWeight: 300,
                color: "#1a1a2e",
                letterSpacing: "-0.02em",
                fontSize: isMobile ? "1.75rem" : "2.25rem",
              }}
            >
              HR Form System
            </Typography>

            <Typography
              variant="body1"
              color="text.secondary"
              align="center"
              sx={{
                mb: 4,
                maxWidth: 380,
                lineHeight: 1.7,
                color: "rgba(0,0,0,0.55)",
                fontSize: "0.95rem",
              }}
            >
              Sign in with your Microsoft 365 account or continue as a guest to
              access the HR form system.
            </Typography>

            <Stack spacing={2.5} sx={{ width: "100%" }}>
              <Button
                variant="contained"
                fullWidth
                size="large"
                startIcon={<LoginIcon />}
                onClick={onSignIn}
                sx={{
                  backgroundColor: "#0078D4",
                  color: "#ffffff",
                  borderRadius: "12px",
                  py: 1.75,
                  fontSize: "0.95rem",
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

              <Divider>
                <Typography
                  variant="body2"
                  sx={{ color: "rgba(0,0,0,0.35)", fontSize: "0.8rem" }}
                >
                  or
                </Typography>
              </Divider>

              <Button
                variant="outlined"
                fullWidth
                size="large"
                startIcon={<PersonIcon />}
                onClick={onGuest}
                sx={{
                  borderColor: "rgba(0,0,0,0.15)",
                  color: "rgba(0,0,0,0.65)",
                  borderRadius: "12px",
                  py: 1.75,
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  borderWidth: "1.5px",
                  transition: "all 0.2s ease",
                  "&:hover": {
                    borderColor: "rgba(0,120,212,0.4)",
                    backgroundColor: "rgba(0,120,212,0.04)",
                    color: "#0078D4",
                    transform: "translateY(-1px)",
                  },
                  "&:active": {
                    transform: "translateY(0)",
                  },
                }}
              >
                Continue as Guest
              </Button>
            </Stack>

            <Typography
              variant="caption"
              align="center"
              sx={{
                mt: 4,
                color: "rgba(0,0,0,0.3)",
                fontSize: "0.75rem",
                lineHeight: 1.6,
              }}
            >
              By signing in, you agree to our Terms of Service and Privacy
              Policy.
            </Typography>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}

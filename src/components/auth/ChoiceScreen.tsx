import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Container,
  Divider,
  FormControlLabel,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Login as LoginIcon, Person as PersonIcon } from "@mui/icons-material";

const MICROSOFT_LOGO =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiB4PSIwIiB5PSIwIiBmaWxsPSIjRjI1MDIyIi8+CjxyZWN0IHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgeD0iNDAiIHk9IjAiIGZpbGw9IiM3RkJBMDAiLz4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiB4PSIwIiB5PSI0MCIgZmlsbD0iIzAwQTRFRiIvPgo8cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHg9IjQwIiB5PSI0MCIgZmlsbD0iI0ZGQjkwMCIvPgo8L3N2Zz4K";

interface ChoiceScreenProps {
  onLogin: () => void;
  onGuest: () => void;
}

export default function ChoiceScreen({ onLogin, onGuest }: ChoiceScreenProps) {
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
        background: "#FAFBFC",
        position: "relative",
        overflow: "hidden",
        padding: isMobile ? 2 : isTablet ? 3 : 4,
      }}
    >
      {/* Decorative background - refined gradient mesh */}
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
        <Card
          sx={{
            width: "100%",
            maxWidth: isMobile ? "100%" : 480,
            mx: "auto",
            borderRadius: "24px",
            boxShadow: "0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 4px rgba(0, 0, 0, 0.04)",
            border: "1px solid rgba(0, 0, 0, 0.05)",
            backgroundColor: "rgba(255, 255, 255, 0.92)",
            backdropFilter: "blur(12px)",
            transition: "all 0.3s ease",
            "&:hover": {
              boxShadow: "0 8px 40px rgba(0, 0, 0, 0.1), 0 2px 8px rgba(0, 0, 0, 0.06)",
            },
          }}
        >
          {/* Top accent bar */}
          <Box
            sx={{
              height: 4,
              background: "linear-gradient(90deg, #0078D4 0%, #6264A7 50%, #0078D4 100%)",
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
            {/* Logo with subtle glow */}
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
                  width: isMobile ? 72 : 88,
                  height: isMobile ? 72 : 88,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(0, 120, 212, 0.15) 0%, rgba(0, 120, 212, 0) 70%)",
                  zIndex: -1,
                },
              }}
            >
              <Box
                component="img"
                src={MICROSOFT_LOGO}
                alt="Microsoft Logo"
                sx={{
                  width: isMobile ? 56 : 72,
                  height: isMobile ? 56 : 72,
                  borderRadius: "16px",
                }}
              />
            </Box>

            <Typography
              variant="h3"
              component="h1"
              gutterBottom
              align="center"
              sx={{
                fontWeight: 500,
                color: "#1A1A2E",
                letterSpacing: "-0.02em",
                fontSize: isMobile ? "1.65rem" : "2rem",
              }}
            >
              PMW HR Forms
            </Typography>

            <Typography
              variant="body1"
              align="center"
              sx={{
                mb: 4,
                maxWidth: 380,
                lineHeight: 1.7,
                color: "rgba(26, 26, 46, 0.65)",
                fontSize: "0.95rem",
              }}
            >
              Sign in with your Microsoft 365 account to access your submission history and track approval status.
            </Typography>

            <Stack spacing={2.5} sx={{ width: "100%" }}>
              <Button
                variant="contained"
                fullWidth
                size="large"
                startIcon={<LoginIcon />}
                onClick={() => {
                  console.log("Button onClick fired, calling onLogin...");
                  onLogin();
                }}
                sx={{
                  backgroundColor: "#0078D4",
                  color: "#ffffff",
                  borderRadius: "14px",
                  py: 1.75,
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  boxShadow: "0 4px 12px rgba(0, 120, 212, 0.3)",
                  transition: "all 0.2s ease",
                  "&:hover": {
                    backgroundColor: "#0068C4",
                    boxShadow: "0 6px 20px rgba(0, 120, 212, 0.4)",
                    transform: "translateY(-1px)",
                  },
                  "&:active": {
                    transform: "translateY(0)",
                  },
                }}
              >
                Sign in with Microsoft 365
              </Button>

              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    sx={{
                      color: "rgba(26, 26, 46, 0.3)",
                      "&.Mui-checked": {
                        color: "#0078D4",
                      },
                    }}
                  />
                }
                label={
                  <Typography variant="body2" sx={{ color: "rgba(26, 26, 46, 0.55)", fontSize: "0.85rem" }}>
                    Remember my choice on this device
                  </Typography>
                }
                sx={{ alignSelf: "flex-start", ml: 0.5 }}
              />

              <Divider>
                <Typography variant="body2" sx={{ color: "rgba(26, 26, 46, 0.35)", fontSize: "0.75rem" }}>
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
                  borderColor: "rgba(26, 26, 46, 0.15)",
                  color: "rgba(26, 26, 46, 0.7)",
                  borderRadius: "14px",
                  py: 1.75,
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  borderWidth: "1.5px",
                  transition: "all 0.2s ease",
                  "&:hover": {
                    borderColor: "rgba(0, 120, 212, 0.5)",
                    backgroundColor: "rgba(0, 120, 212, 0.04)",
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
                color: "rgba(26, 26, 46, 0.35)",
                fontSize: "0.7rem",
                lineHeight: 1.6,
                maxWidth: 380,
              }}
            >
              Only PMW internal M365 accounts are permitted. Guests can browse publicly available forms.
            </Typography>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}

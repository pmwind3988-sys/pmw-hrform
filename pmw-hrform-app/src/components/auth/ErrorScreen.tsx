import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Cancel as CancelIcon, Refresh as RefreshIcon, Logout as LogoutIcon } from "@mui/icons-material";

interface ErrorScreenProps {
  errorMsg: string;
  onRetry: () => void;
  onSignOut?: () => void;
}

export default function ErrorScreen({ errorMsg, onRetry, onSignOut }: ErrorScreenProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffffff",
        position: "relative",
        overflow: "hidden",
        py: 4,
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

      <Container maxWidth="xs" sx={{ position: "relative", zIndex: 1 }}>
        <Card
          elevation={0}
          sx={{
            borderRadius: 24,
            border: "1px solid rgba(220,38,38,0.1)",
            boxShadow: "0 4px 24px rgba(220,38,38,0.06)",
          }}
        >
          <Box sx={{ height: 4, background: "linear-gradient(90deg, #dc2626, #f59e0b)" }} />

          <CardContent sx={{ p: 4 }}>
            <Stack spacing={3} sx={{ alignItems: "center" }}>
              <CancelIcon
                sx={{
                  fontSize: 48,
                  color: "rgba(220,38,38,0.6)",
                }}
              />

              <Typography
                variant="h2"
                sx={{
                  fontWeight: 300,
                  color: "#dc2626",
                  letterSpacing: "-0.02em",
                  textAlign: "center",
                  fontSize: isMobile ? "1.75rem" : "2rem",
                }}
              >
                Something went wrong
              </Typography>

              <Typography
                variant="body1"
                sx={{
                  color: "rgba(0,0,0,0.55)",
                  lineHeight: 1.7,
                  textAlign: "center",
                  wordBreak: "break-word",
                }}
              >
                {errorMsg}
              </Typography>

              <Button
                variant="contained"
                fullWidth
                size="large"
                startIcon={<RefreshIcon />}
                onClick={onRetry}
                sx={{
                  backgroundColor: "#0078D4",
                  borderRadius: "12px",
                  py: 1.5,
                  textTransform: "none",
                  fontWeight: 500,
                  boxShadow: "0 2px 8px rgba(0,120,212,0.25)",
                  "&:hover": {
                    backgroundColor: "#005A9E",
                  },
                }}
              >
                Try again
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
                    py: 1.5,
                    textTransform: "none",
                    borderColor: "rgba(0,0,0,0.15)",
                    color: "rgba(0,0,0,0.65)",
                    "&:hover": {
                      borderColor: "#0078D4",
                      color: "#0078D4",
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

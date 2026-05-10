/**
 * SessionTakenOverScreen.tsx
 *
 * Shown when the current session is invalidated (taken over by another browser).
 * Offers the user the option to take back the session or sign out.
 */
import { Box, Typography, Button, ThemeProvider, CssBaseline } from "@mui/material";
import { LockOutlined as LockIcon, RefreshOutlined as RefreshIcon, LogoutOutlined as LogoutIcon } from "@mui/icons-material";
import theme from "../../theme";

interface Props {
  onTakeover: () => void;
  onSignOut: () => void;
}

export default function SessionTakenOverScreen({ onTakeover, onSignOut }: Props) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#F8F9FC",
          p: 3,
        }}
      >
        <Box sx={{ textAlign: "center", maxWidth: 440 }}>
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              backgroundColor: "rgba(245, 158, 11, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mx: "auto",
              mb: 3,
              border: "1px solid rgba(245, 158, 11, 0.12)",
            }}
          >
            <LockIcon sx={{ fontSize: 34, color: "#F59E0B" }} />
          </Box>

          <Typography
            variant="h4"
            sx={{ fontWeight: 700, color: "#111827", mb: 1, letterSpacing: "-0.02em" }}
          >
            Session Taken Over
          </Typography>

          <Typography variant="body1" sx={{ color: "#6B7280", mb: 0.5, lineHeight: 1.6 }}>
            Your session was ended because you signed in from another browser or tab.
          </Typography>

          <Typography variant="body2" sx={{ color: "#9CA3AF", mb: 4, lineHeight: 1.5 }}>
            If this was unexpected, you can take back the session or sign in again.
          </Typography>

          <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={onTakeover}
              sx={{
                borderRadius: "12px",
                textTransform: "none",
                fontWeight: 600,
                px: 4,
                py: 1.25,
                backgroundColor: "#0078D4",
                "&:hover": { backgroundColor: "#106EBE" },
              }}
            >
              Take Back Session
            </Button>
            <Button
              variant="outlined"
              startIcon={<LogoutIcon />}
              onClick={onSignOut}
              sx={{
                borderRadius: "12px",
                textTransform: "none",
                fontWeight: 500,
                px: 4,
                py: 1.25,
                borderColor: "#DC2626",
                color: "#DC2626",
                "&:hover": {
                  borderColor: "#B91C1C",
                  backgroundColor: "rgba(220, 38, 38, 0.04)",
                },
              }}
            >
              Sign Out
            </Button>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

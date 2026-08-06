import { Box, Button, Card, CardContent, Container, Stack, Typography } from "@mui/material";
import { Lock as LockIcon, Login as LoginIcon } from "@mui/icons-material";
import { useMsal } from "@azure/msal-react";
import Logo from "../Logo";
import { loginRequest } from "../../auth/msalConfig";
import { editorial, editorialShadow } from "../../theme/editorial";
import { careerPageSx } from "./careerUi";

/**
 * Shown when an admin has closed the career portal to the public and the
 * visitor is not signed in. The API refuses these callers on its own — this is
 * the human-readable half of that refusal, not the control itself.
 */
export default function CareerPortalPrivateGate({ message }: { message?: string }) {
  const { instance } = useMsal();

  const handleSignIn = () => {
    try {
      sessionStorage.setItem("pmw_post_login_redirect", window.location.pathname + window.location.search);
    } catch {
      // Storage can be unavailable in private browsing — sign-in still works.
    }
    void instance.loginRedirect(loginRequest);
  };

  return (
    <Box sx={{ ...careerPageSx, display: "flex", alignItems: "center", justifyContent: "center", p: 2 }}>
      <Container maxWidth="sm">
        <Card
          sx={{
            borderRadius: "14px",
            boxShadow: editorialShadow,
            border: `1px solid ${editorial.border}`,
            backgroundColor: "rgba(255,255,255,0.94)",
          }}
        >
          <CardContent sx={{ p: { xs: 3.5, sm: 5 }, textAlign: "center" }}>
            <Box sx={{ display: "flex", justifyContent: "center", mb: 2.5 }}>
              <Logo size={{ xs: 60, sm: 72 }} />
            </Box>

            <Box
              sx={{
                width: 44,
                height: 44,
                mx: "auto",
                mb: 2,
                borderRadius: "50%",
                backgroundColor: editorial.blueWash,
                border: `1px solid ${editorial.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <LockIcon sx={{ fontSize: 22, color: editorial.pmwBlueDark }} />
            </Box>

            <Typography variant="h5" component="h1" sx={{ fontWeight: 800, color: editorial.ink, mb: 1.25 }}>
              Sign in to view openings
            </Typography>

            <Typography variant="body2" sx={{ color: editorial.muted, lineHeight: 1.6, mb: 3.5 }}>
              {message || "The career portal is currently open to signed-in PMW accounts only."}
            </Typography>

            <Stack spacing={1.5}>
              <Button
                variant="contained"
                size="large"
                startIcon={<LoginIcon />}
                onClick={handleSignIn}
                sx={{
                  backgroundColor: editorial.black,
                  color: editorial.white,
                  borderRadius: "8px",
                  py: 1.5,
                  fontWeight: 800,
                  textTransform: "none",
                  boxShadow: "none",
                  "&:hover": { backgroundColor: "#333333", boxShadow: "none" },
                }}
              >
                Sign in with Microsoft 365
              </Button>
              <Typography variant="caption" sx={{ color: editorial.muted }}>
                Need access without a PMW account? Contact HR.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}

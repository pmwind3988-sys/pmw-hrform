/**
 * THESIS: A sign-in gate is a threshold, not a marketing page — one card, one
 * decision, standing on the organisation's own wall. Refuses the split-screen
 * brand-panel/form-panel login the category ships.
 * OWN-WORLD: The inherited PMW product world — Inter, `--pmw-*` blue, 1px
 * `#DDE4EC` hairlines, a white panel over the admin's live background photo.
 * Restrained: neutrals plus PMW blue carrying the single primary action.
 * STORY: Arrive, recognise PMW at once, see Microsoft 365 as the way in — and
 * if HR issued a portal account instead, find that door without hunting.
 * FIRST VIEWPORT: Centred 440px card on `--app-bg`. Logo, wordmark, one line of
 * purpose, full-width primary, hairline "or", portal panel expanding in place.
 * FORM: Centred single-card threshold, position 1 of 1 — the composition was
 * pinned by the requester's reference, so no concept tournament was run.
 */
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Collapse,
  Container,
  Divider,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { LockOutlined } from "@mui/icons-material";
import { fadeInUp } from "../../theme";
import Logo from "../../components/Logo";
import { editorial, editorialHairline, editorialShadow } from "../../theme/editorial";
import { applyDashboardBackground } from "../../utils/dashboardBackgrounds";
import { fetchDashboardBackground } from "../../utils/dashboardBackgroundService";
import {
  signInWithPortalAccount,
  storePortalSession,
  type PortalSession,
} from "../../utils/internalAccountService";

/**
 * White on `pmwBlue` measures 3.4:1 — under the 4.5:1 a 16px button label needs.
 * The dark blue clears it at 6.0:1, so the primary action uses that and reserves
 * the lighter blue for large text and non-text edges.
 */
const PRIMARY_BLUE = editorial.pmwBlueDark;
const PRIMARY_BLUE_HOVER = "#004A82";

interface ChoiceScreenProps {
  onLogin: () => void;
  onGuest: () => void;
  /**
   * Handed a signed portal session once login ID and password check out. Left
   * optional so this screen works before the route gating that consumes it —
   * without it, a successful sign-in still stores the session and reloads.
   */
  onPortalSignIn?: (session: PortalSession) => void;
}

/** Microsoft's four-square mark, drawn rather than fetched — the CSP allows no external images. */
function MicrosoftMark() {
  return (
    <Box component="svg" viewBox="0 0 20 20" aria-hidden="true" sx={{ width: 18, height: 18, flexShrink: 0 }}>
      <rect x="0" y="0" width="9" height="9" fill="#F25022" />
      <rect x="11" y="0" width="9" height="9" fill="#7FBA00" />
      <rect x="0" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </Box>
  );
}

export default function ChoiceScreen({ onLogin, onPortalSignIn }: ChoiceScreenProps) {
  const [portalOpen, setPortalOpen] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [portalError, setPortalError] = useState("");
  const loginIdRef = useRef<HTMLInputElement | null>(null);

  // The background an admin picked for the app, on the one screen that renders
  // before anybody is signed in. It reads with the API key alone, so there is
  // no token to wait for. A failure leaves the CSS fallback in place.
  useEffect(() => {
    let cancelled = false;
    void fetchDashboardBackground()
      .then((setting) => {
        if (!cancelled) applyDashboardBackground(setting);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const openPortalPanel = () => {
    setPortalOpen(true);
    setPortalError("");
    // Opening a form and leaving the cursor outside it makes the person hunt
    // for where to start. Waits for the collapse to mount the input.
    //
    // `preventScroll` is the whole point of the option: the expanded card is
    // taller than a laptop viewport, and a default focus scrolls the input into
    // view by pushing the logo and heading off the top of the screen — so the
    // person lands on an anonymous pair of fields with no idea what they are
    // signing in to.
    window.setTimeout(() => loginIdRef.current?.focus({ preventScroll: true }), 180);
  };

  async function handlePortalSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (signingIn) return;

    const id = loginId.trim();
    if (!id || !password) {
      setPortalError("Enter both your login ID and password.");
      return;
    }

    setSigningIn(true);
    setPortalError("");
    try {
      const session = await signInWithPortalAccount(id, password);
      storePortalSession(session);
      // Cleared the instant it has been exchanged — a password has no reason to
      // outlive the request that used it.
      setPassword("");
      if (onPortalSignIn) {
        onPortalSignIn(session);
      } else {
        window.location.reload();
      }
    } catch (error) {
      setPortalError(error instanceof Error ? error.message : "Sign-in failed. Please try again.");
      setPassword("");
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        py: { xs: 2.5, sm: 3.5 },
        background: "var(--app-bg, var(--app-bg-fallback, linear-gradient(180deg, #BFDDF4 0%, #DCECF8 48%, #F7F5EF 100%)))",
        backgroundAttachment: "fixed",
      }}
    >
      <Container maxWidth="xs" disableGutters sx={{ maxWidth: 440 }}>
        <Box
          sx={{
            backgroundColor: editorial.white,
            borderRadius: "14px",
            border: editorialHairline,
            boxShadow: editorialShadow,
            px: { xs: 3, sm: 4.5 },
            py: { xs: 3.5, sm: 4.5 },
            animation: `${fadeInUp} 0.5s cubic-bezier(0.16, 1, 0.3, 1) both`,
            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
          }}
        >
          <Stack sx={{ alignItems: "center", textAlign: "center" }}>
            <Logo size={{ xs: 52, sm: 60 }} />
            <Typography
              component="h1"
              sx={{
                mt: 2,
                fontSize: { xs: "1.4rem", sm: "1.6rem" },
                fontWeight: 800,
                letterSpacing: "-0.02em",
                lineHeight: 1.15,
                color: editorial.ink,
                textWrap: "balance",
              }}
            >
              PMW Group HR Portal
            </Typography>
            <Typography
              sx={{
                mt: 1.25,
                mb: 3,
                maxWidth: 320,
                fontSize: "0.925rem",
                fontWeight: 500,
                lineHeight: 1.5,
                color: editorial.muted,
                textWrap: "pretty",
              }}
            >
              Sign in to reach your submissions, approvals, and learning materials.
            </Typography>
          </Stack>

          <Button
            fullWidth
            variant="contained"
            disableElevation
            onClick={onLogin}
            startIcon={<MicrosoftMark />}
            sx={{
              py: 1.4,
              borderRadius: "10px",
              fontSize: "0.95rem",
              fontWeight: 700,
              letterSpacing: "-0.01em",
              textTransform: "none",
              backgroundColor: PRIMARY_BLUE,
              color: editorial.white,
              transition: "background-color 0.16s ease",
              "&:hover": { backgroundColor: PRIMARY_BLUE_HOVER },
              "&:focus-visible": { outline: `3px solid ${editorial.pmwBlueSoft}`, outlineOffset: 2 },
            }}
          >
            Continue with Microsoft 365
          </Button>

          <Divider sx={{ my: 2.5, color: editorial.softMuted, fontSize: "0.75rem", fontWeight: 700 }}>
            or
          </Divider>

          {!portalOpen ? (
            <Button
              fullWidth
              variant="outlined"
              onClick={openPortalPanel}
              startIcon={<LockOutlined sx={{ fontSize: 18 }} />}
              sx={{
                py: 1.3,
                borderRadius: "10px",
                fontSize: "0.9rem",
                fontWeight: 700,
                textTransform: "none",
                color: editorial.ink,
                borderColor: editorial.border,
                backgroundColor: editorial.white,
                transition: "background-color 0.16s ease, border-color 0.16s ease",
                "&:hover": { backgroundColor: editorial.blueWash, borderColor: editorial.pmwBlueSoft },
                "&:focus-visible": { outline: `3px solid ${editorial.pmwBlueSoft}`, outlineOffset: 2 },
              }}
            >
              Sign in with a portal account
            </Button>
          ) : null}

          <Collapse in={portalOpen} unmountOnExit>
            <Box component="form" onSubmit={handlePortalSubmit} noValidate>
              <Typography
                component="h2"
                sx={{
                  fontSize: "0.8rem",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: editorial.muted,
                  mb: 1.75,
                }}
              >
                Portal account
              </Typography>

              <Stack spacing={1.75}>
                <TextField
                  inputRef={loginIdRef}
                  label="Login ID"
                  value={loginId}
                  onChange={(event) => setLoginId(event.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={signingIn}
                  fullWidth
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
                />
                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  disabled={signingIn}
                  fullWidth
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
                />

                {portalError && (
                  <Alert
                    severity="error"
                    role="alert"
                    sx={{ borderRadius: "10px", fontSize: "0.85rem", fontWeight: 600, py: 0.25 }}
                  >
                    {portalError}
                  </Alert>
                )}

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  disableElevation
                  disabled={signingIn}
                  sx={{
                    py: 1.25,
                    borderRadius: "10px",
                    fontSize: "0.9rem",
                    fontWeight: 700,
                    textTransform: "none",
                    backgroundColor: editorial.ink,
                    color: editorial.white,
                    transition: "background-color 0.16s ease",
                    "&:hover": { backgroundColor: "#2A2A2A" },
                    "&.Mui-disabled": { backgroundColor: editorial.softMuted, color: editorial.white },
                    "&:focus-visible": { outline: `3px solid ${editorial.pmwBlueSoft}`, outlineOffset: 2 },
                  }}
                >
                  {signingIn ? "Signing in…" : "Sign in"}
                </Button>
              </Stack>

              <Typography
                sx={{ mt: 1.75, fontSize: "0.78rem", lineHeight: 1.55, color: editorial.muted, textWrap: "pretty" }}
              >
                Portal accounts are issued by HR. Contact your administrator if you need one, or to have your
                password reset.
              </Typography>

              <Button
                onClick={() => {
                  setPortalOpen(false);
                  setPortalError("");
                  setPassword("");
                }}
                sx={{
                  mt: 0.5,
                  px: 0,
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  textTransform: "none",
                  color: editorial.pmwBlueDark,
                  "&:hover": { backgroundColor: "transparent", textDecoration: "underline" },
                }}
              >
                Back to sign-in options
              </Button>
            </Box>
          </Collapse>

          <Typography
            sx={{
              mt: 3,
              pt: 2.25,
              borderTop: editorialHairline,
              fontSize: "0.75rem",
              lineHeight: 1.6,
              textAlign: "center",
              color: editorial.muted,
              textWrap: "pretty",
            }}
          >
            Only PMW Microsoft 365 accounts and HR-issued portal accounts can sign in.{" "}
            <Link
              href="/privacy"
              sx={{ color: editorial.pmwBlueDark, fontWeight: 700, textDecorationColor: "currentColor" }}
            >
              Privacy Notice
            </Link>
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}

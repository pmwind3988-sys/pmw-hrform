/**
 * THESIS: A sign-in gate is a threshold, not a marketing page — one card, one
 * decision, standing on the organisation's own wall. Refuses the split-screen
 * brand-panel/form-panel login the category ships.
 * OWN-WORLD: The inherited PMW product world — Inter, `--pmw-*` blue, 1px
 * `#DDE4EC` hairlines, a white panel over the admin's live background photo.
 * Restrained: neutrals plus PMW blue carrying the single primary action.
 * STORY: Arrive, recognise PMW at once, see Microsoft 365 as the way in — and
 * if you are not staff, find the Google door without hunting for it.
 * FIRST VIEWPORT: Centred 440px card on `--app-bg`. Logo, wordmark, one line of
 * purpose, full-width primary, hairline "or", Google button beneath it.
 * FORM: Centred single-card threshold, position 1 of 1 — the composition was
 * pinned by the requester's reference, so no concept tournament was run.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Container, Divider, Link, Stack, Typography } from "@mui/material";
import { fadeInUp } from "../../theme";
import Logo from "../../components/Logo";
import { editorial, editorialHairline, editorialShadow } from "../../theme/editorial";
import { applyDashboardBackground } from "../../utils/dashboardBackgrounds";
import { fetchDashboardBackground } from "../../utils/dashboardBackgroundService";
import { googleSignInConfigured, renderGoogleButton } from "../../auth/googleSignIn";
import {
  signInWithGoogle,
  storeGuestSession,
  type GuestMemberSummary,
  type GuestSession,
} from "../../utils/guestMemberService";

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
   * Handed a signed guest session once Google's token has been verified. Left
   * optional so this screen works before the route gating that consumes it —
   * without it, a successful sign-in still stores the session and reloads.
   */
  onGuestSignIn?: (session: GuestSession, member: GuestMemberSummary) => void;
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

export default function ChoiceScreen({ onLogin, onGuestSignIn }: ChoiceScreenProps) {
  const [signingIn, setSigningIn] = useState(false);
  const [guestError, setGuestError] = useState("");
  const [googleReady, setGoogleReady] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

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

  /**
   * The in-flight guard is a ref, not the `signingIn` state.
   *
   * Google's button is rendered once, on mount, and the callback it is given is
   * captured then — so a check against `signingIn` would read the value from
   * that first render for the rest of the page's life, and never be true. The
   * state still exists, because the button has to *look* busy; the ref is what
   * actually stops a second exchange starting.
   */
  const signInProgressRef = useRef(false);

  const completeGoogleSignIn = useCallback(
    async (credential: string) => {
      if (signInProgressRef.current) return;
      signInProgressRef.current = true;
      setSigningIn(true);
      setGuestError("");
      try {
        const { session, member } = await signInWithGoogle(credential);
        storeGuestSession(session);
        if (onGuestSignIn) {
          onGuestSignIn(session, member);
        } else {
          window.location.reload();
        }
      } catch (error) {
        setGuestError(error instanceof Error ? error.message : "Sign-in failed. Please try again.");
      } finally {
        signInProgressRef.current = false;
        setSigningIn(false);
      }
    },
    [onGuestSignIn],
  );

  // Google renders its own button into this slot. It is mounted on arrival
  // rather than behind a "show me the other option" click: unlike the portal
  // panel this replaces, there is nothing to fill in, so hiding it would only
  // add a step to the door most non-staff visitors need.
  //
  // `completeGoogleSignIn` is read through a ref for the same reason the guard
  // above is one — the effect must not re-run and replace a rendered button
  // when the callback identity changes.
  const completeRef = useRef(completeGoogleSignIn);
  completeRef.current = completeGoogleSignIn;

  useEffect(() => {
    if (!googleSignInConfigured()) return;
    const parent = googleButtonRef.current;
    if (!parent) return;

    let cancelled = false;

    void renderGoogleButton(parent, (credential) => {
      if (cancelled) return;
      void completeRef.current(credential);
    })
      .then(() => {
        if (!cancelled) setGoogleReady(true);
      })
      .catch(() => {
        // The usual cause is the Content-Security-Policy blocking Google's
        // script in one of the two files it is written in. Nothing useful can
        // be said to the visitor about that, so the slot stays empty and
        // Microsoft 365 remains available.
        if (!cancelled) setGoogleReady(false);
      });

    return () => {
      cancelled = true;
    };
    // Mounted once. Re-running would replace a rendered button with an identical
    // one and drop whatever state Google keeps behind it.
  }, []);

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
            borderRadius: "12px",
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
                fontWeight: 700,
                letterSpacing: "-0.01em",
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
              borderRadius: "12px",
              fontSize: "0.9375rem",
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

          <Divider sx={{ my: 2.5, color: editorial.softMuted, fontSize: "0.78rem", fontWeight: 700 }}>
            or
          </Divider>

          {/*
            Google's own button, rendered by their script into this slot. It
            cannot be restyled to match the Microsoft button above — their
            branding rules forbid it — so the two deliberately sit as siblings
            rather than pretending to be one set.
          */}
          <Box
            ref={googleButtonRef}
            sx={{
              display: "flex",
              justifyContent: "center",
              minHeight: googleSignInConfigured() ? 44 : 0,
              opacity: signingIn ? 0.6 : 1,
              pointerEvents: signingIn ? "none" : "auto",
              transition: "opacity 0.16s ease",
            }}
          />

          {googleSignInConfigured() && !googleReady && !guestError ? (
            <Typography
              sx={{ mt: 1, fontSize: "0.78rem", textAlign: "center", color: editorial.muted }}
            >
              Loading Google sign-in…
            </Typography>
          ) : null}

          {guestError ? (
            <Alert
              severity="error"
              role="alert"
              sx={{ mt: 1.75, borderRadius: "12px", fontSize: "0.845rem", fontWeight: 600, py: 0.25 }}
            >
              {guestError}
            </Alert>
          ) : null}

          <Typography
            sx={{ mt: 1.75, fontSize: "0.78rem", lineHeight: 1.55, color: editorial.muted, textAlign: "center", textWrap: "pretty" }}
          >
            Signing in with Google makes you a guest member. You will be asked for your name,
            position and department once.
          </Typography>

          <Typography
            sx={{
              mt: 3,
              pt: 2.25,
              borderTop: editorialHairline,
              fontSize: "0.78rem",
              lineHeight: 1.6,
              textAlign: "center",
              color: editorial.muted,
              textWrap: "pretty",
            }}
          >
PMW staff sign in with Microsoft 365. Everyone else is welcome to continue with Google.{" "}
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

import { useEffect, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { RefreshRounded } from "@mui/icons-material";
import Logo from "../../components/Logo";
import { editorial, si, siType } from "../../theme/editorial";

export type LoadingStepStatus = "pending" | "active" | "complete" | "error";

export interface LoadingStep {
  label: string;
  description?: string;
  status: LoadingStepStatus;
}

interface LoadingScreenProps {
  userEmail?: string;
  progress?: number; // 0-100
  status?: string; // e.g. "Fetching submissions from 'Leave Form' (2/5)..."
  steps?: LoadingStep[];
}

const RING = 112;
const STROKE = 5;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** After this the screen admits it is slow and offers a way out. */
const SLOW_AFTER_MS = 12000;

/**
 * The full-screen wait: sign-in and first load only.
 *
 * ONE SIGNAL. This used to report the same wait six ways at once — a spinner,
 * a pulsing glow, a 36px percentage, "Loading...", a sentence, a bar and a
 * five-step checklist describing token state and SharePoint group names — over
 * decorative blobs in the retired blue and purple. Now: a ring around the logo
 * that fills as progress arrives, and one sentence saying what is happening in
 * the reader's terms.
 *
 * The step list still exists, because it is genuinely useful when something
 * breaks. It is shown only then: the failed step, with its detail, in place of
 * the reassurance line.
 *
 * Page-to-page loads inside the app do NOT use this; they use `PageSkeleton`,
 * which keeps the navigation on screen.
 */
export default function LoadingScreen({ userEmail, progress, status, steps }: LoadingScreenProps) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const determinate = typeof progress === "number" && progress > 0 && progress < 100;
  const failed = steps?.find((step) => step.status === "error");
  const active = steps?.find((step) => step.status === "active");
  const headline = failed?.label ?? active?.label ?? "Getting things ready";

  return (
    <Box
      component="main"
      role="status"
      aria-live="polite"
      aria-busy={!failed}
      sx={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        px: 3,
        py: 6,
        textAlign: "center",
        background: editorial.paper,
      }}
    >
      <Box sx={{ position: "relative", width: RING, height: RING }}>
        <svg
          width={RING}
          height={RING}
          viewBox={`0 0 ${RING} ${RING}`}
          aria-hidden
          style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}
        >
          <circle cx={RING / 2} cy={RING / 2} r={RADIUS} fill="none" stroke={editorial.sky} strokeWidth={STROKE} />
          {/* Without a known amount, a short arc travels the ring instead
              (`.si-loading-arc` in index.css, still under reduced motion). */}
          <circle
            className={determinate || failed ? undefined : "si-loading-arc"}
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            fill="none"
            stroke={failed ? editorial.accent : editorial.navy}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={determinate ? CIRCUMFERENCE * (1 - (progress as number) / 100) : CIRCUMFERENCE * 0.72}
            style={{ transformOrigin: "center", transition: "stroke-dashoffset 0.5s cubic-bezier(0.2, 0.7, 0.2, 1)" }}
          />
        </svg>
        <Box
          sx={{
            position: "absolute",
            inset: 14,
            borderRadius: "50%",
            backgroundColor: editorial.panel,
            boxShadow: si.shadow,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Logo size={44} sx={{ outline: "none" }} />
        </Box>
      </Box>

      <Box sx={{ maxWidth: 420 }}>
        <Typography component="h1" sx={{ ...siType.sectionTitle, color: editorial.ink }}>
          {headline}
        </Typography>

        {failed ? (
          <Typography sx={{ ...siType.body, color: editorial.accentText, mt: 1 }}>
            {failed.description || "This step didn't finish."}
          </Typography>
        ) : (
          (active?.description || status) && (
            <Typography sx={{ ...siType.body, color: editorial.muted, mt: 1, minHeight: "1.5em" }}>
              {active?.description || status}
            </Typography>
          )
        )}
      </Box>

      {slow && !failed && (
        <Box sx={{ display: "grid", gap: 1, justifyItems: "center" }}>
          <Typography sx={{ ...siType.subtext, color: editorial.muted }}>
            This is taking longer than usual.
          </Typography>
          <Button variant="text" startIcon={<RefreshRounded />} onClick={() => window.location.reload()}>
            Reload the page
          </Button>
        </Box>
      )}

      {userEmail && (
        <Typography sx={{ ...siType.subtext, color: editorial.softMuted }}>
          Signed in as {userEmail}
        </Typography>
      )}
    </Box>
  );
}

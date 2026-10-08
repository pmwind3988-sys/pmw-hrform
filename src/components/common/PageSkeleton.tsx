import { useEffect, useState } from "react";
import { Box, Skeleton, Typography } from "@mui/material";
import { editorial, si, siType } from "../../theme/editorial";

interface PageSkeletonProps {
  /** What is loading, for screen readers and for the slow-load line. */
  label?: string;
  /** How many placeholder rows to draw. */
  rows?: number;
}

/** Nothing for this long, so a page that is already cached never flashes. */
const SHOW_AFTER_MS = 200;
/** After this, say it is slow rather than leaving people to wonder. */
const SLOW_AFTER_MS = 8000;

/**
 * The shape of a page while it loads, drawn INSIDE the shell.
 *
 * Every route used to fall back to the full-screen boot loader, so the first
 * visit to any tab took the navigation away and replayed the sign-in splash —
 * it read as the app restarting. This keeps the frame on screen and draws a
 * title and a few rows where the page will be.
 */
export default function PageSkeleton({ label = "Loading", rows = 5 }: PageSkeletonProps) {
  const [visible, setVisible] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const show = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    const late = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(late);
    };
  }, []);

  return (
    <Box role="status" aria-live="polite" aria-busy="true" sx={{ maxWidth: 1120, mx: "auto" }}>
      <Box component="span" sx={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {label}
      </Box>
      {visible && (
        <>
          <Skeleton variant="rounded" width={220} height={32} sx={{ borderRadius: `${si.radiusPill}px`, mb: 2.5 }} />
          <Box sx={{ backgroundColor: editorial.panel, borderRadius: `${si.radius}px`, boxShadow: si.shadow, p: 1.5 }}>
            {Array.from({ length: rows }, (_, index) => (
              <Box key={index} sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.25 }}>
                <Skeleton variant="circular" width={40} height={40} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="rounded" height={12} width={`${62 - (index % 3) * 12}%`} sx={{ borderRadius: `${si.radiusPill}px` }} />
                  <Skeleton variant="rounded" height={10} width={`${38 - (index % 2) * 10}%`} sx={{ borderRadius: `${si.radiusPill}px`, mt: 1 }} />
                </Box>
              </Box>
            ))}
          </Box>
          {slow && (
            <Typography sx={{ ...siType.subtext, color: editorial.muted, mt: 2, textAlign: "center" }}>
              Still loading. This is taking longer than usual.
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}

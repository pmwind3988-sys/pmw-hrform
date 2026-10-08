import { Box, Typography } from "@mui/material";
import type { Submission } from "../../types";
import { editorial, si, siType } from "../../theme/editorial";
import { bucketSubmissions } from "../../utils/submissionStatusBuckets";

export type StatusBucketKey = "pending" | "approved" | "rejected";

interface StatsRowProps {
  submissions: Submission[];
  /** Opens the list behind a ring. Omit it and the rings are read-only. */
  onOpen?: (bucket: StatusBucketKey) => void;
}

const RING_SIZE = 64;
const STROKE = 7;
const RADIUS = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Where submissions stand, as three rings you can press.
 *
 * This replaced four boxed tiles that each said their number three times — a
 * coloured cap, a tinted icon tile and a progress bar — next to a helper line
 * repeating the number in words ("157 / 157 visible submissions"), plus a
 * "Total" tile whose bar was always full. The total is now the sentence above
 * the rings, and each ring shows one thing: its share of that total.
 *
 * A ring is the right shape here because the share IS the content: an amber
 * ring nearly closed beside an almost empty green one is the whole story of a
 * backlog, readable before any number is.
 *
 * Each ring is a pill-shaped button. Pressing one opens the matching list, so
 * the summary leads somewhere instead of being a dead end.
 *
 * Counting is shared with the dashboard's summary line through
 * `bucketSubmissions`, so the sentence and the rings cannot disagree.
 */
export default function StatsRow({ submissions, onOpen }: StatsRowProps) {
  const { total, approved, pending, rejected } = bucketSubmissions(submissions);
  const share = (value: number) => (total > 0 ? value / total : 0);

  const rings: Array<{ key: StatusBucketKey; label: string; hint: string; value: number; fill: string }> = [
    { key: "pending", label: "In progress", hint: "Still in an approval chain", value: pending, fill: editorial.accent },
    { key: "approved", label: "Approved", hint: "Finished and signed off", value: approved, fill: editorial.successFill },
    { key: "rejected", label: "Sent back", hint: "Rejected along the way", value: rejected, fill: editorial.errorFill },
  ];

  return (
    <Box
      component="ul"
      sx={{
        listStyle: "none",
        m: 0,
        p: 0,
        display: "grid",
        gap: 1.5,
        gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
      }}
    >
      {rings.map((ring) => {
        const portion = share(ring.value);
        const percent = Math.round(portion * 100);
        const interactive = Boolean(onOpen);
        return (
          <Box component="li" key={ring.key} sx={{ minWidth: 0 }}>
            <Box
              component={interactive ? "button" : "div"}
              type={interactive ? "button" : undefined}
              onClick={interactive ? () => onOpen?.(ring.key) : undefined}
              aria-label={interactive ? `${ring.label}: ${ring.value} of ${total}. Open the list.` : undefined}
              sx={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 1.75,
                border: "none",
                textAlign: "left",
                p: 1,
                pr: 2.5,
                borderRadius: `${si.radiusPill}px`,
                backgroundColor: editorial.panel,
                boxShadow: si.shadow,
                cursor: interactive ? "pointer" : "default",
                transition: "background-color 0.15s ease, transform 0.15s ease",
                ...(interactive
                  ? {
                      "&:hover": { backgroundColor: editorial.blueSoft },
                      "&:hover .ring": { transform: "scale(1.06)" },
                      "&:active": { transform: "scale(0.985)" },
                    }
                  : null),
                "@media (prefers-reduced-motion: reduce)": { transition: "none" },
              }}
            >
              <Box
                className="ring"
                sx={{
                  position: "relative",
                  width: RING_SIZE,
                  height: RING_SIZE,
                  flexShrink: 0,
                  transition: "transform 0.2s cubic-bezier(0.2, 0.7, 0.2, 1)",
                  "@media (prefers-reduced-motion: reduce)": { transition: "none" },
                }}
              >
                <svg
                  width={RING_SIZE}
                  height={RING_SIZE}
                  viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
                  aria-hidden
                  style={{ transform: "rotate(-90deg)", display: "block" }}
                >
                  <circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke={editorial.skySoft}
                    strokeWidth={STROKE}
                  />
                  {/* Drawn as a dash so the sweep can animate on the compositor-
                      friendly `stroke-dashoffset` rather than redrawing a path.
                      A zero share draws nothing, not a dot. */}
                  {portion > 0 && (
                    <circle
                      cx={RING_SIZE / 2}
                      cy={RING_SIZE / 2}
                      r={RADIUS}
                      fill="none"
                      stroke={ring.fill}
                      strokeWidth={STROKE}
                      strokeLinecap="round"
                      strokeDasharray={CIRCUMFERENCE}
                      strokeDashoffset={CIRCUMFERENCE * (1 - portion)}
                      style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.2, 0.7, 0.2, 1)" }}
                    />
                  )}
                </svg>
                <Typography
                  component="span"
                  sx={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    ...siType.data,
                    fontWeight: 700,
                    color: ring.value === 0 ? editorial.softMuted : editorial.ink,
                  }}
                >
                  {ring.value}
                </Typography>
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ ...siType.cardTitle, color: editorial.ink }} noWrap>
                  {ring.label}
                </Typography>
                <Typography sx={{ ...siType.subtext, color: editorial.muted }} noWrap>
                  {total > 0 ? `${percent}% · ${ring.hint}` : ring.hint}
                </Typography>
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

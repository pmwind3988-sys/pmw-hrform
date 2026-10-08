import { Box, Button, Chip, Paper, Typography } from "@mui/material";
import { CheckRounded, WorkOutlined } from "@mui/icons-material";
import type { JobListing } from "../../types";
import { editorial, si, siType } from "../../theme/editorial";
import { careerReduceMotionSx, jobBoardBadgeSx } from "./careerUi";

/**
 * Job list card, adapted from the Figma job-portal template
 * (file its0mTyfN3jAVbef8BKpEr, Card 25:6880).
 *
 * Two of the template's card elements are deliberately absent because no data
 * backs them: the salary line and the bookmark/save control. Closing date takes
 * the salary slot instead — it is real, and it is the thing an applicant most
 * needs to see next to a role.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Renders the template's "10 min ago" stamp from the listing's created date. */
function formatPostedAgo(created: string, now: number = Date.now()): string {
  const createdAt = Date.parse(created);
  if (Number.isNaN(createdAt)) return "";

  const elapsed = now - createdAt;
  if (elapsed < 0) return "Just posted";
  if (elapsed < HOUR_MS) {
    const minutes = Math.max(1, Math.floor(elapsed / MINUTE_MS));
    return `${minutes} min ago`;
  }
  if (elapsed < DAY_MS) {
    const hours = Math.floor(elapsed / HOUR_MS);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(elapsed / DAY_MS);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function formatClosingDate(closingDate: string): string {
  const parsed = Date.parse(closingDate);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface JobCardProps {
  job: JobListing;
  onOpen: (job: JobListing) => void;
  /** Shown when the signed-in employee has already applied. */
  applied?: boolean;
}

export default function JobCard({ job, onOpen, applied = false }: JobCardProps) {
  const postedAgo = formatPostedAgo(job.created);
  const closing = job.closingDate ? formatClosingDate(job.closingDate) : "";

  const muted = [
    job.company,
    job.department,
    job.location,
    job.employmentType,
    closing && `Closes ${closing}`,
  ].filter(Boolean).join(" · ");

  return (
    <Paper
      component="article"
      onClick={() => onOpen(job)}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target === event.currentTarget) onOpen(job);
      }}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        p: { xs: 2, sm: 2.5 },
        borderRadius: `${si.radius}px`,
        boxShadow: si.shadow,
        cursor: "pointer",
        transition: "background-color 0.15s ease",
        "&:hover": { backgroundColor: editorial.blueSoft },
        ...careerReduceMotionSx,
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: editorial.blueWash,
        }}
      >
        <WorkOutlined sx={{ fontSize: 20, color: editorial.navy }} />
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography component="h3" sx={{ ...siType.cardTitle, color: editorial.ink, overflowWrap: "anywhere" }}>
          {job.title}
        </Typography>
        {muted && (
          <Typography sx={{ ...siType.subtext, color: editorial.muted, mt: 0.25 }}>{muted}</Typography>
        )}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1 }}>
          {applied && (
            <Chip
              icon={<CheckRounded />}
              label="Applied"
              size="small"
              sx={{
                ...jobBoardBadgeSx,
                backgroundColor: editorial.successSoft,
                color: editorial.success,
                "& .MuiChip-icon": { color: editorial.success, fontSize: 16 },
              }}
            />
          )}
          {postedAgo && <Chip label={`Posted ${postedAgo}`} size="small" sx={jobBoardBadgeSx} />}
        </Box>
      </Box>

      <Button
        variant="text"
        onClick={(event) => {
          event.stopPropagation();
          onOpen(job);
        }}
        sx={{ flexShrink: 0, display: { xs: "none", sm: "inline-flex" }, backgroundColor: editorial.skySoft }}
      >
        Job details
      </Button>
    </Paper>
  );
}

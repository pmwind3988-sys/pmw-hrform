import { Box, Button, Chip, Paper, Typography } from "@mui/material";
import {
  BusinessCenterOutlined,
  EventBusyOutlined,
  LocationOnOutlined,
  ScheduleOutlined,
  WorkOutlined,
} from "@mui/icons-material";
import type { JobListing } from "../../types";
import { editorial } from "../../theme/editorial";
import {
  careerReduceMotionSx,
  jobBoardBadgeSx,
  jobBoardCardSx,
  jobBoardMetaItemSx,
  jobBoardPrimaryButtonSx,
} from "./careerUi";

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

  const meta = [
    job.department && { key: "department", icon: <BusinessCenterOutlined />, label: job.department },
    job.employmentType && { key: "type", icon: <ScheduleOutlined />, label: job.employmentType },
    job.location && { key: "location", icon: <LocationOnOutlined />, label: job.location },
    closing && { key: "closing", icon: <EventBusyOutlined />, label: `Closes ${closing}` },
  ].filter(Boolean) as { key: string; icon: React.ReactElement; label: string }[];

  return (
    <Paper component="article" sx={{ ...jobBoardCardSx, ...careerReduceMotionSx }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: { xs: 2, md: 3 } }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5 }}>
          {postedAgo ? <Chip label={postedAgo} size="small" sx={jobBoardBadgeSx} /> : <Box />}
          {applied && (
            <Chip
              label="Applied"
              size="small"
              sx={{
                ...jobBoardBadgeSx,
                backgroundColor: "rgba(16, 124, 16, 0.10)",
                color: editorial.success,
              }}
            />
          )}
        </Box>

        <Box sx={{ display: "flex", gap: 2.5, alignItems: "flex-start", minWidth: 0 }}>
          <Box
            aria-hidden
            sx={{
              width: 40,
              height: 40,
              flexShrink: 0,
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: editorial.blueWash,
              border: `1px solid ${editorial.pmwBlueSoft}`,
            }}
          >
            <WorkOutlined sx={{ fontSize: 20, color: editorial.pmwBlueDark }} />
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <Typography
              variant="h3"
              sx={{
                color: editorial.ink,
                fontWeight: 700,
                fontSize: { xs: "1.25rem", sm: "1.5rem", md: "1.75rem" },
                lineHeight: 1.15,
                letterSpacing: "-0.01em",
                textWrap: "balance",
              }}
            >
              {job.title}
            </Typography>
            {job.company && (
              <Typography variant="body1" sx={{ color: editorial.ink, fontSize: "1rem" }}>
                {job.company}
              </Typography>
            )}
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: { xs: "stretch", md: "flex-end" },
          justifyContent: "space-between",
          flexDirection: { xs: "column", md: "row" },
          gap: 2,
        }}
      >
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: { xs: 1.5, md: 3 }, minWidth: 0 }}>
          {meta.map((item) => (
            <Box key={item.key} sx={jobBoardMetaItemSx}>
              {item.icon}
              <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.label}
              </Box>
            </Box>
          ))}
        </Box>

        <Button
          variant="contained"
          disableElevation
          onClick={() => onOpen(job)}
          sx={{ ...jobBoardPrimaryButtonSx, ...careerReduceMotionSx, alignSelf: { xs: "stretch", md: "auto" } }}
        >
          Job details
        </Button>
      </Box>
    </Paper>
  );
}

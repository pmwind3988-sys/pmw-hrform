import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Grid,
  Paper,
  Typography,
} from "@mui/material";
import {
  ArrowForward,
  BusinessCenterOutlined,
  BusinessOutlined,
  EventBusyOutlined,
  LocationOnOutlined,
  PeopleOutlined,
  ScheduleOutlined,
  WorkOutlined,
} from "@mui/icons-material";
import DOMPurify from "dompurify";
import type { JobAdminApplication, JobListing } from "../types";
import {
  acquireCareerPortalToken,
  fetchJob,
  fetchJobs,
  fetchMyApplications,
  isCareerPortalPrivateError,
} from "../utils/careersService";
import CareerPortalPrivateGate from "../components/careers/CareerPortalPrivateGate";
import { acquireAccessTokenSilentOrRedirect } from "../utils/authRecovery";
import { useHrFormsOwner } from "../hooks/useHrFormsOwner";
import CareerPortalHeader from "../components/careers/CareerPortalHeader";
import CareerHero from "../components/careers/CareerHero";
import JobCard from "../components/careers/JobCard";
import {
  CareerErrorState,
  getCareerErrorMessage,
  careerActionButtonSx,
  careerPageSx,
  careerReduceMotionSx,
  jobBoardCardSx,
  jobBoardMetaItemSx,
  jobBoardPrimaryButtonSx,
} from "../components/careers/careerUi";
import { editorial } from "../theme/editorial";

/**
 * Public job detail surface, adapted from the Figma job-portal template
 * (file its0mTyfN3jAVbef8BKpEr, Job Details 25:6306).
 *
 * Replaces the modal that used to live inside CareersPage, so a role now has a
 * shareable URL — the reason this exists at all, now that the portal is public.
 *
 * Three of the template's blocks are absent because nothing backs them: the
 * location map (no address data), the per-job contact form (applications go
 * through the apply route), and the Key Responsibilities / Professional Skills
 * checklists (jobDescription is a single rich-text field, not structured lists).
 */

const RELATED_JOB_LIMIT = 3;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const parsed = Date.parse(dateStr);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" });
}

interface OverviewRow {
  key: string;
  icon: React.ReactElement;
  label: string;
  value: string;
}

function JobOverviewCard({ job }: { job: JobListing }) {
  const rows: OverviewRow[] = [
    { key: "title", icon: <WorkOutlined />, label: "Job title", value: job.title },
    job.company && { key: "company", icon: <BusinessOutlined />, label: "Company", value: job.company },
    job.department && { key: "department", icon: <BusinessCenterOutlined />, label: "Department", value: job.department },
    job.employmentType && { key: "type", icon: <ScheduleOutlined />, label: "Job type", value: job.employmentType },
    job.location && { key: "location", icon: <LocationOnOutlined />, label: "Location", value: job.location },
    job.closingDate && {
      key: "closing",
      icon: <EventBusyOutlined />,
      label: "Closing date",
      value: formatDate(job.closingDate),
    },
    {
      key: "applicants",
      icon: <PeopleOutlined />,
      label: "Applicants",
      value: `${job.applicationCount} ${job.applicationCount === 1 ? "applicant" : "applicants"}`,
    },
  ].filter(Boolean) as OverviewRow[];

  return (
    <Paper
      component="aside"
      aria-labelledby="job-overview-heading"
      sx={{
        // Template uses a low-saturation tint of its accent for this panel.
        backgroundColor: editorial.blueWash,
        borderRadius: "12px",
        border: `1px solid ${editorial.pmwBlueSoft}`,
        boxShadow: "none",
        pt: 3.5,
        pb: 2.5,
        px: 2.5,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <Typography
        id="job-overview-heading"
        variant="h2"
        sx={{ fontWeight: 700, fontSize: "1.125rem", color: editorial.ink }}
      >
        Job overview
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 3.5 }}>
        {rows.map((row) => (
          <Box key={row.key} sx={{ display: "flex", gap: 2.5, alignItems: "flex-start" }}>
            <Box sx={{ display: "flex", color: editorial.pmwBlue, "& .MuiSvgIcon-root": { fontSize: 24 } }}>
              {row.icon}
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, minWidth: 0 }}>
              <Typography variant="body1" sx={{ fontWeight: 600, color: editorial.ink, fontSize: "0.9375rem" }}>
                {row.label}
              </Typography>
              <Typography variant="body1" sx={{ color: editorial.muted, fontSize: "0.9375rem", overflowWrap: "anywhere" }}>
                {row.value}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

export default function JobDetailsPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { instance, accounts } = useMsal();
  const activeAccount = instance.getActiveAccount() ?? accounts[0];
  // MSAL rebuilds AccountInfo on every read, so `activeAccount` has a new object
  // identity each render. Effects must key on this stable string - depending on
  // the object re-runs them every render, and any effect that then sets state
  // re-renders into an unbounded fetch loop. Signed out the value is a stable
  // undefined, which is why only signed-in sessions spin.
  const accountKey = activeAccount?.homeAccountId || activeAccount?.username || "";
  const isHrFormsOwner = useHrFormsOwner();

  const [job, setJob] = useState<JobListing | null>(null);
  const [allJobs, setAllJobs] = useState<JobListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restrictedMessage, setRestrictedMessage] = useState<string | null>(null);
  const [myApps, setMyApps] = useState<JobAdminApplication[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Re-read rather than closing over the render-time object.
        const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
        const accessToken = await acquireCareerPortalToken(instance, account);
        const [found, jobs] = await Promise.all([
          jobId ? fetchJob(jobId, { accessToken }) : Promise.resolve(null),
          fetchJobs({ accessToken }).catch(() => [] as JobListing[]),
        ]);
        if (cancelled) return;
        setJob(found);
        setAllJobs(jobs);
      } catch (err) {
        if (cancelled) return;
        if (isCareerPortalPrivateError(err)) {
          setRestrictedMessage(err instanceof Error ? err.message : "");
        } else {
          setError(getCareerErrorMessage(err, "Could not load this opportunity."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [jobId, instance, accountKey]);

  // Application history needs the visitor's own delegated token, so this stays
  // empty for a Public Respondent — they simply do not see an applied state.
  useEffect(() => {
    let cancelled = false;
    async function loadApplications() {
      // Re-read rather than closing over the render-time object.
      const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
      const email = account?.username?.toLowerCase() || "";
      if (!email || !account) return;
      try {
        const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
        if (!SP_SITE_URL) return;
        const accessToken = await acquireAccessTokenSilentOrRedirect(instance, {
          scopes: [`${new URL(SP_SITE_URL).origin}/AllSites.Manage`],
          account,
        });
        const applications = await fetchMyApplications(email, { accessToken });
        if (!cancelled) setMyApps(applications);
      } catch {
        // Applied state is an enhancement — browsing must not depend on it.
      }
    }
    void loadApplications();
    return () => {
      cancelled = true;
    };
  }, [instance, accountKey]);

  const isApplied = useMemo(
    () => Boolean(jobId) && myApps.some((app) => app.jobListingId === jobId),
    [myApps, jobId],
  );

  const relatedJobs = useMemo(() => {
    if (!job) return [];
    return allJobs
      .filter((candidate) => candidate.id !== job.id)
      .filter((candidate) => candidate.department === job.department || candidate.company === job.company)
      .slice(0, RELATED_JOB_LIMIT);
  }, [allJobs, job]);

  const sanitizedDescription = useMemo(
    () => (job?.jobDescription ? DOMPurify.sanitize(job.jobDescription) : ""),
    [job],
  );

  const heroSubtitle = job
    ? [job.company, job.department].filter(Boolean).join(" · ")
    : "Loading opportunity...";

  if (restrictedMessage !== null) {
    return <CareerPortalPrivateGate message={restrictedMessage} />;
  }

  return (
    <Box sx={careerPageSx}>
      <CareerPortalHeader
        title="Job details"
        subtitle={job ? job.title : "Opportunity details"}
        activeSection="opportunities"
        backPath="/career-portal"
        backLabel="Back to opportunities"
        showSectionNav={false}
      />

      <CareerHero title={job ? job.title : "Opportunity"} subtitle={heroSubtitle} />

      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress sx={{ color: editorial.pmwBlue }} />
          </Box>
        ) : error ? (
          <CareerErrorState message={error} onRetry={() => navigate(0)} />
        ) : !job ? (
          <CareerErrorState
            message="This opportunity is no longer open, or the link is out of date."
            onRetry={() => navigate("/career-portal")}
            retryLabel="Browse opportunities"
          />
        ) : (
          <Grid container spacing={{ xs: 3, md: 4 }}>
            <Grid size={{ xs: 12, md: 8 }}>
              <Paper component="article" sx={{ ...jobBoardCardSx, "&:hover": undefined }}>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
                  {isApplied && (
                    <Chip
                      label="Already submitted"
                      size="small"
                      sx={{
                        borderRadius: "12px",
                        fontWeight: 700,
                        backgroundColor: "rgba(16, 124, 16, 0.10)",
                        color: editorial.success,
                      }}
                    />
                  )}
                </Box>

                <Box sx={{ display: "flex", flexWrap: "wrap", gap: { xs: 1.5, md: 3 } }}>
                  {job.department && (
                    <Box sx={jobBoardMetaItemSx}>
                      <BusinessCenterOutlined />
                      <span>{job.department}</span>
                    </Box>
                  )}
                  {job.employmentType && (
                    <Box sx={jobBoardMetaItemSx}>
                      <ScheduleOutlined />
                      <span>{job.employmentType}</span>
                    </Box>
                  )}
                  {job.location && (
                    <Box sx={jobBoardMetaItemSx}>
                      <LocationOnOutlined />
                      <span>{job.location}</span>
                    </Box>
                  )}
                </Box>

                <Box>
                  <Typography
                    variant="h2"
                    sx={{ fontWeight: 700, fontSize: "1.375rem", color: editorial.ink, mb: 2 }}
                  >
                    Job description
                  </Typography>
                  {sanitizedDescription ? (
                    <Box
                      sx={{
                        "& p": { mb: 1.5, lineHeight: 1.7, color: editorial.ink, fontSize: "0.9375rem" },
                        "& ul, & ol": { pl: 3, mb: 1.5 },
                        "& li": { mb: 0.5, lineHeight: 1.7, color: editorial.ink, fontSize: "0.9375rem" },
                        "& h1, & h2, & h3, & h4": { mt: 2, mb: 1, fontWeight: 700, color: editorial.ink },
                        "& strong": { fontWeight: 600 },
                        "& a": { color: editorial.pmwBlueDark, fontWeight: 500 },
                      }}
                      dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
                    />
                  ) : (
                    <Typography variant="body2" sx={{ color: editorial.muted }}>
                      No description provided.
                    </Typography>
                  )}
                </Box>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, position: { md: "sticky" }, top: { md: 88 } }}>
                {isApplied && isHrFormsOwner ? (
                  // Duplicate applications are blocked for everyone; an HR Forms
                  // Owner can still raise a second one for testing. The API
                  // re-checks group membership before honouring `override`, so
                  // this button only reveals the path — it does not open it.
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={() => navigate(`/career-portal/${job.id}/apply?override=1`)}
                    sx={{
                      ...careerActionButtonSx,
                      ...careerReduceMotionSx,
                      borderColor: editorial.warning,
                      color: editorial.warning,
                      "&:hover": {
                        borderColor: editorial.warning,
                        backgroundColor: "rgba(177, 92, 0, 0.06)",
                      },
                    }}
                  >
                    Override apply
                  </Button>
                ) : isApplied ? (
                  <Button
                    variant="contained"
                    disabled
                    fullWidth
                    sx={{ ...jobBoardPrimaryButtonSx, backgroundColor: editorial.softMuted }}
                  >
                    Already submitted
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    fullWidth
                    disableElevation
                    endIcon={<ArrowForward />}
                    onClick={() => navigate(`/career-portal/${job.id}/apply`)}
                    sx={{ ...jobBoardPrimaryButtonSx, ...careerReduceMotionSx }}
                  >
                    Apply for this role
                  </Button>
                )}
                <JobOverviewCard job={job} />
              </Box>
            </Grid>

            {relatedJobs.length > 0 && (
              <Grid size={12}>
                <Typography
                  variant="h2"
                  sx={{ fontWeight: 700, fontSize: "1.5rem", color: editorial.ink, mb: 2.5, mt: { xs: 1, md: 2 } }}
                >
                  Related opportunities
                </Typography>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                  {relatedJobs.map((related) => (
                    <JobCard
                      key={related.id}
                      job={related}
                      onOpen={(target) => navigate(`/career-portal/${target.id}`)}
                      applied={myApps.some((app) => app.jobListingId === related.id)}
                    />
                  ))}
                </Box>
              </Grid>
            )}
          </Grid>
        )}
      </Container>
    </Box>
  );
}

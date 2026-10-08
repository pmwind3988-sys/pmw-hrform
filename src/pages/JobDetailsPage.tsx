import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Grid,
  Paper,
  useMediaQuery,
  useTheme,
  Typography,
} from "@mui/material";
import {
  ArrowForward,
  CheckCircleRounded,
  BusinessCenterOutlined,
  BusinessOutlined,
  EventBusyOutlined,
  LocationOnOutlined,
  PeopleOutlined,
  ScheduleOutlined,
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
} from "../components/careers/careerUi";
import { editorial, si, siType } from "../theme/editorial";

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
        backgroundColor: editorial.panel,
        borderRadius: `${si.radius}px`,
        boxShadow: si.shadow,
        p: 3,
        display: "flex",
        flexDirection: "column",
        gap: 2.5,
      }}
    >
      <Typography
        id="job-overview-heading"
        component="h2"
        sx={{ ...siType.sectionTitle, color: editorial.ink }}
      >
        Job overview
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {rows.map((row) => (
          <Box key={row.key} sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                flexShrink: 0,
                borderRadius: "50%",
                backgroundColor: editorial.blueWash,
                color: editorial.navy,
                "& .MuiSvgIcon-root": { fontSize: 20 },
              }}
            >
              {row.icon}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ ...siType.subtext, color: editorial.muted }}>{row.label}</Typography>
              <Typography sx={{ ...siType.cardTitle, color: editorial.ink, overflowWrap: "anywhere" }}>
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

  const appliedRecord = myApps.find((app) => app.jobListingId === jobId);
  const appliedOn = appliedRecord?.submittedAt ? formatDate(appliedRecord.submittedAt) : "";
  const isPhone = useMediaQuery(useTheme().breakpoints.down("md"));
  const canApply = Boolean(job) && !isApplied;

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
        subtitle="Opportunity details"
        activeSection="opportunities"
        backPath="/career-portal"
        backLabel="Back to opportunities"
        showSectionNav={false}
      />

      <CareerHero title={job ? job.title : "Opportunity"} subtitle={heroSubtitle} />

      <Container maxWidth="lg" sx={{ pt: { xs: 3, md: 4 }, pb: { xs: canApply ? 12 : 3, md: 4 } }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress sx={{ color: editorial.navy }} />
          </Box>
        ) : error ? (
          <CareerErrorState what="this opportunity" message={error} onRetry={() => navigate(0)} />
        ) : !job ? (
          <CareerErrorState
            title="This opportunity has closed"
            message="It is no longer open, or the link is out of date."
            onRetry={() => navigate("/career-portal")}
            retryLabel="Browse opportunities"
          />
        ) : (
          <Grid container spacing={{ xs: 3, md: 4 }}>
            <Grid size={{ xs: 12, md: 8 }}>
              <Paper component="article" sx={jobBoardCardSx}>
                {isApplied && (
                  <Box
                    role="status"
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      p: 2,
                      borderRadius: `${si.radius}px`,
                      backgroundColor: editorial.successSoft,
                      color: editorial.success,
                    }}
                  >
                    <CheckCircleRounded />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ ...siType.cardTitle, color: editorial.success }}>
                        {appliedOn ? `You applied on ${appliedOn}` : "You've applied for this role"}
                      </Typography>
                      {appliedRecord?.submissionRef && (
                        <Typography sx={{ ...siType.data, color: editorial.success }}>
                          Reference {appliedRecord.submissionRef}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                )}

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
                  <Typography component="h2" sx={{ ...siType.sectionTitle, color: editorial.ink, mb: 1.5 }}>
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
                        "& a": { color: editorial.navy, fontWeight: 500 },
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
                {isApplied && isHrFormsOwner && (
                  // Duplicate applications are blocked for everyone; an HR Forms
                  // Owner can still raise a second one for testing. The API
                  // re-checks group membership before honouring `override`, so
                  // this button only reveals the path - it does not open it.
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={() => navigate(`/career-portal/${job.id}/apply?override=1`)}
                    sx={{
                      ...careerActionButtonSx,
                      ...careerReduceMotionSx,
                      borderColor: editorial.warning,
                      color: editorial.warning,
                      "&:hover": { borderColor: editorial.warning, backgroundColor: editorial.warningSoft },
                    }}
                  >
                    Submit a test duplicate (HR only)
                  </Button>
                )}
                {canApply && !isPhone && (
                  <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    disableElevation
                    endIcon={<ArrowForward />}
                    onClick={() => navigate(`/career-portal/${job.id}/apply`)}
                    sx={careerReduceMotionSx}
                  >
                    Apply for this role
                  </Button>
                )}
                <JobOverviewCard job={job} />
              </Box>
            </Grid>

            {relatedJobs.length > 0 && (
              <Grid size={12}>
                <Typography component="h2" sx={{ ...siType.sectionTitle, color: editorial.ink, mb: 1.5, mt: { xs: 1, md: 2 } }}>
                  Related opportunities
                </Typography>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
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

      {canApply && isPhone && job && (
        <Box
          sx={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 20,
            px: 2,
            pt: 1.5,
            pb: "calc(12px + env(safe-area-inset-bottom))",
            backgroundColor: editorial.panel,
            boxShadow: "0 -4px 16px rgba(15, 23, 42, 0.08)",
          }}
        >
          <Button
            variant="contained"
            fullWidth
            size="large"
            disableElevation
            endIcon={<ArrowForward />}
            onClick={() => navigate(`/career-portal/${job.id}/apply`)}
          >
            Apply for this role
          </Button>
        </Box>
      )}
    </Box>
  );
}

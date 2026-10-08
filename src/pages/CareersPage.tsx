import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Chip,
  Container,
  Paper,
  TextField,
  InputAdornment,
  Badge,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TablePagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  ArrowBack,
  AccessTime,
  Search as SearchIcon,
  Close,
  AssignmentTurnedIn,
  CheckRounded,
  FilterList,
  Description,
} from "@mui/icons-material";
import { useMsal } from "@azure/msal-react";
import {
  acquireCareerPortalToken,
  fetchCareersPortalData,
  fetchMyApplications,
  isCareerPortalPrivateError,
} from "../utils/careersService";
import { acquireAccessTokenSilentOrRedirect } from "../utils/authRecovery";
import { useHrFormsOwner } from "../hooks/useHrFormsOwner";
import CareerPortalPrivateGate from "../components/careers/CareerPortalPrivateGate";
import CareerPortalHeader from "../components/careers/CareerPortalHeader";
import CareerPortalCarousel from "../components/careers/CareerPortalCarousel";
import CareerHero from "../components/careers/CareerHero";
import PageHeader from "../components/common/PageHeader";
import { useInShell } from "../components/shell/ShellContext";
import { FailurePanel } from "../components/common/StatusPanel";
import JobCard from "../components/careers/JobCard";
import {
  CareerEmptyState,
  careerActionButtonSx,
  careerIconButtonSx,
  careerPageSx,
  careerReduceMotionSx as reduceMotionSx,
  careerSearchFieldSx,
  careerToolbarSx,
  getCareerErrorMessage,
} from "../components/careers/careerUi";
import type { JobListing, JobAdminApplication, CareerPortalCard } from "../types";
import { editorial, si, siType } from "../theme/editorial";

const paginationSx = {
  "& .MuiTablePagination-toolbar": {
    display: "flex",
    flexWrap: "wrap",
    gap: { xs: 0.75, sm: 1.25 },
    px: { xs: 1, sm: 2 },
  },
  "& .MuiTablePagination-spacer": {
    display: "none",
  },
  "& .MuiTablePagination-selectLabel": {
    m: 0,
    mr: 0.75,
    flexShrink: 0,
  },
  "& .MuiTablePagination-input": {
    flexShrink: 0,
  },
  "& .MuiTablePagination-displayedRows": {
    m: 0,
    ml: "auto",
    flexShrink: 0,
  },
  "& .MuiTablePagination-actions": {
    ml: 0,
    flexShrink: 0,
  },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getThisWeekStart(): Date {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  return start;
}

function dateInputBoundary(value: string, boundary: "start" | "end"): number | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (boundary === "end") {
    date.setHours(23, 59, 59, 999);
  }
  return date.getTime();
}

function CareersLoadingSkeleton() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {[1, 2, 3, 4].map((item) => (
        <Paper key={item} sx={{ display: "flex", alignItems: "center", gap: 2, p: 2.5, borderRadius: `${si.radius}px`, boxShadow: si.shadow }}>
          <Skeleton variant="circular" width={40} height={40} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="55%" height={22} />
            <Skeleton variant="text" width="35%" height={16} />
          </Box>
        </Paper>
      ))}
    </Box>
  );
}

export default function CareersPage() {
  const { instance, accounts } = useMsal();
  const navigate = useNavigate();
  const location = useLocation();
  const activeAccount = instance.getActiveAccount() ?? accounts[0];
  const inShell = useInShell();
  // MSAL rebuilds AccountInfo on every read, so `activeAccount` has a new object
  // identity each render. Effects must key on this stable string - depending on
  // the object re-runs them every render, and any effect that then sets state
  // re-renders into an unbounded fetch loop. Signed out the value is a stable
  // undefined, which is why only signed-in sessions spin.
  const accountKey = activeAccount?.homeAccountId || activeAccount?.username || "";
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [portalCards, setPortalCards] = useState<CareerPortalCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCause, setErrorCause] = useState<unknown>(null);
  const [restrictedMessage, setRestrictedMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedApp, setSelectedApp] = useState<JobAdminApplication | null>(null);
  const [myApps, setMyApps] = useState<JobAdminApplication[]>([]);
  const isAdmin = useHrFormsOwner();
  const [appliedFilter, setAppliedFilter] = useState(() =>
    new URLSearchParams(location.search).get("view") === "applications" ? "applied" : "all",
  ); // "all" | "applied" | "unapplied"
  const [jobsPage, setJobsPage] = useState(0);
  const [jobsRowsPerPage, setJobsRowsPerPage] = useState(12);
  const [myAppsSearch, setMyAppsSearch] = useState("");
  const [myAppsTimeline, setMyAppsTimeline] = useState("all");
  const [myAppsFrom, setMyAppsFrom] = useState("");
  const [myAppsTo, setMyAppsTo] = useState("");
  const [myAppsSort, setMyAppsSort] = useState("newest");
  const [showMyAppsAdvancedFilters, setShowMyAppsAdvancedFilters] = useState(false);
  const [myAppsPage, setMyAppsPage] = useState(0);
  const [myAppsRowsPerPage, setMyAppsRowsPerPage] = useState(10);

  // Opportunities that the current user has applied to -> set of job listing IDs
  const appliedJobIds = useMemo(() => new Set(myApps.map((a) => a.jobListingId).filter(Boolean)), [myApps]);

  const isSignedIn = Boolean(activeAccount);

  // Applied/unapplied filtering is derived from the signed-in employee's own
  // application history, which a public visitor has no way to load.
  const canFilterByApplied = isSignedIn;

  const isJobApplied = (jobId: string) => appliedJobIds.has(jobId);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Re-read rather than closing over the render-time object.
        const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
        const email = account?.username?.toLowerCase() || "";
        // Two different tokens: the Graph one proves to the API that a signed-in
        // employee is asking (all a closed portal wants to know), the SharePoint
        // one reads their own application history.
        const identityToken = await acquireCareerPortalToken(instance, account);
        const myApplications = email && account
          ? acquireAccessTokenSilentOrRedirect(instance, {
              scopes: [`${new URL(import.meta.env.VITE_SP_SITE_URL || "https://placeholder.sharepoint.com").origin}/AllSites.Manage`],
              account,
            })
              .then((accessToken) => fetchMyApplications(email, { accessToken }))
              .catch(() => [] as JobAdminApplication[])
          : Promise.resolve([] as JobAdminApplication[]);
        const [portalData, appData] = await Promise.all([
          fetchCareersPortalData({ accessToken: identityToken }),
          myApplications,
        ]);
        if (!cancelled) {
          setJobs(portalData.jobs);
          setPortalCards(portalData.portalCards);
          setMyApps(appData);
        }
      } catch (err) {
        if (cancelled) return;
        if (isCareerPortalPrivateError(err)) {
          setRestrictedMessage(err instanceof Error ? err.message : "");
        } else {
          setErrorCause(err); setError(getCareerErrorMessage(err, "Failed to load opportunities."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [instance, accountKey, reloadKey]);

  useEffect(() => {
    setJobsPage(0);
  }, [searchText, companyFilter, deptFilter, typeFilter, sortBy, appliedFilter]);

  useEffect(() => {
    setMyAppsPage(0);
  }, [myAppsSearch, myAppsTimeline, myAppsFrom, myAppsTo, myAppsSort, appliedFilter]);

  const departments = useMemo(() => {
    const set = new Set(jobs.map((j) => j.department).filter(Boolean));
    return [...set].sort();
  }, [jobs]);

  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const job of jobs) {
      if (job.company) set.add(job.company);
    }
    return [...set].sort();
  }, [jobs]);

  const employmentTypes = useMemo(() => {
    const set = new Set(jobs.map((j) => j.employmentType).filter(Boolean));
    return [...set].sort();
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const result = jobs.filter((job) => {
      if (searchText) {
        const q = searchText.toLowerCase();
        const matchesSearch =
          job.title.toLowerCase().includes(q) ||
          (job.company || "").toLowerCase().includes(q) ||
          job.department.toLowerCase().includes(q) ||
          (job.location || "").toLowerCase().includes(q) ||
          job.employmentType.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (companyFilter && job.company !== companyFilter) return false;
      if (deptFilter && job.department !== deptFilter) return false;
      if (typeFilter && job.employmentType !== typeFilter) return false;
      if (appliedFilter === "applied" && !isJobApplied(job.id)) return false;
      if (appliedFilter === "unapplied" && isJobApplied(job.id)) return false;
      return true;
    });

    if (sortBy === "name") {
      result.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === "closing") {
      result.sort((a, b) => new Date(a.closingDate || "9999-12-31").getTime() - new Date(b.closingDate || "9999-12-31").getTime());
    } else if (sortBy === "applicants") {
      result.sort((a, b) => b.applicationCount - a.applicationCount);
    } else {
      result.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
    }

    return result;
  }, [jobs, searchText, companyFilter, deptFilter, typeFilter, sortBy, appliedFilter, appliedJobIds]);

  const hasFilters = Boolean(searchText.trim()) || Boolean(companyFilter) || Boolean(deptFilter) || Boolean(typeFilter) || appliedFilter !== "all";
  const pagedJobs = filteredJobs.slice(jobsPage * jobsRowsPerPage, jobsPage * jobsRowsPerPage + jobsRowsPerPage);
  const filteredMyApps = useMemo(() => {
    const q = myAppsSearch.trim().toLowerCase();
    const now = new Date();
    let timelineFrom: number | null = null;
    if (myAppsTimeline === "today") {
      timelineFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    } else if (myAppsTimeline === "week") {
      timelineFrom = getThisWeekStart().getTime();
    } else if (myAppsTimeline === "30d") {
      const date = new Date(now);
      date.setDate(date.getDate() - 30);
      timelineFrom = date.getTime();
    } else if (myAppsTimeline === "custom") {
      timelineFrom = dateInputBoundary(myAppsFrom, "start");
    }
    const timelineTo = myAppsTimeline === "custom" ? dateInputBoundary(myAppsTo, "end") : null;
    const result = myApps.filter((app) => {
      const submittedTime = new Date(app.submittedAt).getTime();
      if (timelineFrom !== null && (!Number.isFinite(submittedTime) || submittedTime < timelineFrom)) return false;
      if (timelineTo !== null && (!Number.isFinite(submittedTime) || submittedTime > timelineTo)) return false;
      if (q) {
        const haystack = [
          app.jobTitle,
          app.company ?? "",
          app.submissionRef,
          app.status,
          app.applicantName,
          app.applicantEmail,
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      if (myAppsSort === "oldest") return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
      if (myAppsSort === "role") return a.jobTitle.localeCompare(b.jobTitle);
      if (myAppsSort === "status") return a.status.localeCompare(b.status);
      return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
    });

    return result;
  }, [myApps, myAppsSearch, myAppsTimeline, myAppsFrom, myAppsTo, myAppsSort]);
  const pagedMyApps = filteredMyApps.slice(
    myAppsPage * myAppsRowsPerPage,
    myAppsPage * myAppsRowsPerPage + myAppsRowsPerPage,
  );
  const myAppsAdvancedFilterCount = [
    myAppsTimeline !== "all",
    myAppsSort !== "newest",
  ].filter(Boolean).length;
  const hasMyAppsFilters = Boolean(myAppsSearch.trim()) || myAppsTimeline !== "all";
  const hasMyAppsSearchOptions = hasMyAppsFilters || myAppsSort !== "newest";
  const selectedSupportingDocuments = selectedApp?.supportingDocuments?.length
    ? selectedApp.supportingDocuments
    : selectedApp?.coverLetterUrl
      ? [{ name: "Supporting document", url: selectedApp.coverLetterUrl }]
      : [];
  const requestedJobId = new URLSearchParams(location.search).get("job")?.trim() || "";

  // `?job=` is the legacy deep link — dashboard portal cards and older emails still
  // carry it. Job detail is its own route now, so forward rather than reopening a
  // dialog that no longer exists.
  useEffect(() => {
    if (!requestedJobId) return;
    navigate(`/career-portal/${encodeURIComponent(requestedJobId)}`, { replace: true });
  }, [requestedJobId, navigate]);

  const openJobDetails = (job: JobListing) => navigate(`/career-portal/${job.id}`);

  const handleViewApplications = () => setAppliedFilter((current) => current === "applied" ? "all" : "applied");
  const handlePortalCardTarget = (card: CareerPortalCard) => {
    const targetValue = card.targetValue.trim();
    if (card.targetType === "none" || !targetValue) return;

    if (card.targetType === "job") {
      navigate(`/career-portal/${encodeURIComponent(targetValue)}`);
      return;
    }

    if (targetValue.startsWith("/")) {
      navigate(targetValue);
    } else {
      window.open(targetValue, "_blank", "noopener,noreferrer");
    }
  };

  if (restrictedMessage !== null) {
    return <CareerPortalPrivateGate message={restrictedMessage} />;
  }

  const openRoleCount = jobs.length;
  const pageDescription = loading
    ? "Loading open roles"
    : error
      ? "Open roles could not be loaded right now"
      : openRoleCount > 0
        ? `${openRoleCount} open ${openRoleCount === 1 ? "role" : "roles"} across PMW Group`
        : isSignedIn
          ? "Internal roles you can apply for"
          : "Roles you can apply for at PMW Group";
  const viewingApplications = appliedFilter === "applied";
  const toggle = (current: string, value: string, set: (next: string) => void) => set(current === value ? "" : value);
  const filterChipSx = { "& .MuiChip-icon": { fontSize: 18 } };

  return (
    <Box sx={careerPageSx}>
      <CareerPortalHeader
        title="PMW Careers"
        subtitle="Explore internal openings and track your submitted applications."
        activeSection="opportunities"
        isAdmin={isAdmin}
        backPath={isAdmin ? "/admin/dashboard" : "/user/dashboard"}
        backLabel="Back to forms dashboard"
        showBack={Boolean(activeAccount)}
      />

      {!inShell && (
        <CareerHero
          title={isSignedIn ? "Internal opportunities" : "Careers at PMW Group"}
          subtitle={pageDescription}
        />
      )}

      <Container maxWidth="lg" sx={{ py: inShell ? 0 : 4 }}>
        {inShell && (
          <PageHeader
            title={viewingApplications ? "My applications" : "Job portal"}
            description={
              viewingApplications
                ? `${myApps.length} submitted ${myApps.length === 1 ? "application" : "applications"}`
                : pageDescription
            }
          />
        )}

        {!loading && !error && portalCards.length > 0 && !viewingApplications && (
          <Box sx={{ mb: 3, minWidth: 0 }}>
            <CareerPortalCarousel cards={portalCards} onCardTarget={handlePortalCardTarget} />
          </Box>
        )}

        {!loading && !error && jobs.length > 0 && !viewingApplications && (
          <Box sx={{ mb: 2.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <TextField
                placeholder="Search roles, companies, departments"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                size="small"
                sx={{ ...careerSearchFieldSx, flex: "1 1 320px" }}
                slotProps={{
                  htmlInput: { "aria-label": "Search roles" },
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon sx={{ color: editorial.muted, fontSize: 20 }} />
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  inputProps={{ "aria-label": "Sort roles" }}
                  sx={{
                    borderRadius: "999px",
                    backgroundColor: editorial.skySoft,
                    "& .MuiOutlinedInput-notchedOutline": { border: "none" },
                  }}
                >
                  <MenuItem value="newest">Newest first</MenuItem>
                  <MenuItem value="closing">Closing soon</MenuItem>
                  <MenuItem value="name">Name A to Z</MenuItem>
                  <MenuItem value="applicants">Most applicants</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box className="no-scrollbar" sx={{ display: "flex", gap: 1, overflowX: "auto", pb: 0.5 }} role="group" aria-label="Filter roles">
              <Chip
                label="All"
                clickable
                color={hasFilters ? "default" : "primary"}
                variant={hasFilters ? "outlined" : "filled"}
                icon={hasFilters ? undefined : <CheckRounded />}
                onClick={() => {
                  setSearchText("");
                  setCompanyFilter("");
                  setDeptFilter("");
                  setTypeFilter("");
                  setAppliedFilter("all");
                }}
                sx={filterChipSx}
              />
              {companies.length > 1 &&
                companies.map((company) => (
                  <Chip
                    key={`c-${company}`}
                    label={company}
                    clickable
                    color={companyFilter === company ? "primary" : "default"}
                    variant={companyFilter === company ? "filled" : "outlined"}
                    icon={companyFilter === company ? <CheckRounded /> : undefined}
                    onClick={() => toggle(companyFilter, company, setCompanyFilter)}
                    sx={filterChipSx}
                  />
                ))}
              {departments.map((d) => (
                <Chip
                  key={`d-${d}`}
                  label={d}
                  clickable
                  color={deptFilter === d ? "primary" : "default"}
                  variant={deptFilter === d ? "filled" : "outlined"}
                  icon={deptFilter === d ? <CheckRounded /> : undefined}
                  onClick={() => toggle(deptFilter, d, setDeptFilter)}
                  sx={filterChipSx}
                />
              ))}
              {employmentTypes.map((t) => (
                <Chip
                  key={`t-${t}`}
                  label={t}
                  clickable
                  color={typeFilter === t ? "primary" : "default"}
                  variant={typeFilter === t ? "filled" : "outlined"}
                  icon={typeFilter === t ? <CheckRounded /> : undefined}
                  onClick={() => toggle(typeFilter, t, setTypeFilter)}
                  sx={filterChipSx}
                />
              ))}
              {canFilterByApplied && (
                <Chip
                  label="Not applied yet"
                  clickable
                  color={appliedFilter === "unapplied" ? "primary" : "default"}
                  variant={appliedFilter === "unapplied" ? "filled" : "outlined"}
                  icon={appliedFilter === "unapplied" ? <CheckRounded /> : undefined}
                  onClick={() => setAppliedFilter((current) => (current === "unapplied" ? "all" : "unapplied"))}
                  sx={filterChipSx}
                />
              )}
              {myApps.length > 0 && (
                <Chip
                  label={`My applications · ${myApps.length}`}
                  clickable
                  variant="outlined"
                  icon={<AssignmentTurnedIn />}
                  onClick={handleViewApplications}
                  sx={filterChipSx}
                />
              )}
            </Box>
            {hasFilters && (
              <Typography sx={{ ...siType.subtext, color: editorial.muted, fontVariantNumeric: "tabular-nums" }}>
                Showing {filteredJobs.length} of {jobs.length} roles
              </Typography>
            )}
          </Box>
        )}

        {viewingApplications && (
          <Box sx={{ mb: 2 }}>
            <Button
              variant="text"
              startIcon={<ArrowBack />}
              onClick={handleViewApplications}
              sx={{ backgroundColor: editorial.panel, boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)" }}
            >
              Back to open roles
            </Button>
          </Box>
        )}

        {loading && <CareersLoadingSkeleton />}

        {!loading && error && (
          <>
            <FailurePanel what="openings" error={errorCause} onRetry={() => setReloadKey((key) => key + 1)} />
            <Box aria-hidden sx={{ opacity: 0.55 }}>
              <CareersLoadingSkeleton />
            </Box>
          </>
        )}

        {!loading && !error && jobs.length === 0 && (
          <CareerEmptyState
            icon={<AccessTime />}
            title="No open roles right now"
            description="There are no openings at the moment. Check back later."
          />
        )}
        {!loading && !error && jobs.length > 0 && filteredJobs.length === 0 && !viewingApplications && (
          <CareerEmptyState
            icon={<SearchIcon />}
            title="No roles match"
            description="Try a different search, or clear the filters."
          />
        )}
        {!loading && !error && viewingApplications && myApps.length === 0 && (
          <CareerEmptyState
            icon={<AssignmentTurnedIn />}
            title="No applications yet"
            description="Roles you apply for will be listed here."
          />
        )}

        {/* My Applications list */}
        {!loading && !error && appliedFilter === "applied" && myApps.length > 0 && (
          <>
          <Paper
            sx={{
              ...careerToolbarSx,
              mb: 2,
                            ...reduceMotionSx,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, width: "100%", flexWrap: "wrap" }}>
              <Box
                sx={{
                  flex: "1 1 360px",
                  minWidth: { xs: "100%", sm: 320 },
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                }}
              >
                <TextField
                  placeholder="Search applications..."
                  value={myAppsSearch}
                  onChange={(e) => setMyAppsSearch(e.target.value)}
                  size="small"
                  sx={{
                    ...careerSearchFieldSx,
                    flex: "1 1 auto",
                    minWidth: 0,
                    "& .MuiOutlinedInput-root": {
                      borderRadius: "999px",
                      backgroundColor: editorial.skySoft,
                      "& .MuiOutlinedInput-notchedOutline": { border: "none" },
                      transition: "box-shadow 0.18s ease, background-color 0.18s ease",
                      "&:hover": { backgroundColor: editorial.blueSoft },
                      "&.Mui-focused": {
                        backgroundColor: editorial.white,
                        boxShadow: "none",
                      },
                    },
                  }}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon sx={{ color: editorial.muted, fontSize: 20 }} />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                <Tooltip title={showMyAppsAdvancedFilters ? "Hide advanced search" : "Show advanced search"}>
                  <IconButton
                    aria-label={showMyAppsAdvancedFilters ? "Hide advanced search" : "Show advanced search"}
                    aria-pressed={showMyAppsAdvancedFilters}
                    onClick={() => setShowMyAppsAdvancedFilters((open) => !open)}
                    sx={{
                      ...careerIconButtonSx,
                      borderColor: showMyAppsAdvancedFilters || myAppsAdvancedFilterCount > 0 ? editorial.navy : editorial.border,
                      color: showMyAppsAdvancedFilters || myAppsAdvancedFilterCount > 0 ? editorial.navy : editorial.muted,
                      backgroundColor: showMyAppsAdvancedFilters || myAppsAdvancedFilterCount > 0 ? editorial.blueSoft : editorial.white,
                      flexShrink: 0,
                      "&:hover": {
                        transform: "translateY(-1px)",
                        backgroundColor: editorial.blueSoft,
                        borderColor: editorial.navy,
                      },
                      "&:active": { transform: "scale(0.96)" },
                      ...reduceMotionSx,
                    }}
                  >
                    <Badge
                      badgeContent={myAppsAdvancedFilterCount}
                      color="primary"
                      invisible={myAppsAdvancedFilterCount === 0}
                      sx={{ "& .MuiBadge-badge": { fontSize: "0.72rem", minWidth: 16, height: 16 } }}
                    >
                      <FilterList sx={{ fontSize: 20 }} />
                    </Badge>
                  </IconButton>
                </Tooltip>
              </Box>
              {hasMyAppsSearchOptions && (
                <Button
                  size="small"
                  startIcon={<Close />}
                  onClick={() => {
                    setMyAppsSearch("");
                    setMyAppsTimeline("all");
                    setMyAppsFrom("");
                    setMyAppsTo("");
                    setMyAppsSort("newest");
                  }}
                  sx={{
                    ...careerActionButtonSx,
                    color: editorial.muted,
                    fontWeight: 700,
                    "&:hover": { transform: "translateY(-1px)", backgroundColor: editorial.blueSoft },
                    ...reduceMotionSx,
                  }}
                >
                  Clear
                </Button>
              )}
              {filteredMyApps.length < myApps.length && (
                <Chip
                  label={`${filteredMyApps.length} of ${myApps.length} applications`}
                  size="small"
                  sx={{ backgroundColor: editorial.skySoft, color: editorial.navyDeep, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                />
              )}
            </Box>

            {showMyAppsAdvancedFilters && (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", md: myAppsTimeline === "custom" ? "repeat(4, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))" },
                  gap: 1.25,
                  width: "100%",
                }}
              >
                <FormControl size="small" fullWidth>
                  <InputLabel>Timeline</InputLabel>
                  <Select
                    value={myAppsTimeline}
                    label="Timeline"
                    onChange={(e) => setMyAppsTimeline(e.target.value)}
                    sx={{
                      borderRadius: "999px",
                      backgroundColor: editorial.skySoft,
                      "& .MuiOutlinedInput-notchedOutline": { border: "none" },
                      transition: "box-shadow 0.18s ease, background-color 0.18s ease",
                      "&:hover": { backgroundColor: editorial.white },
                      "&.Mui-focused": { boxShadow: "none" },
                    }}
                  >
                    <MenuItem value="all">All dates</MenuItem>
                    <MenuItem value="today">Today</MenuItem>
                    <MenuItem value="week">This week</MenuItem>
                    <MenuItem value="30d">30 days</MenuItem>
                    <MenuItem value="custom">Custom</MenuItem>
                  </Select>
                </FormControl>
                {myAppsTimeline === "custom" && (
                  <>
                    <TextField
                      type="date"
                      label="From"
                      value={myAppsFrom}
                      onChange={(e) => setMyAppsFrom(e.target.value)}
                      size="small"
                      fullWidth
                      slotProps={{ inputLabel: { shrink: true }, input: { sx: { borderRadius: "999px" } } }}
                    />
                    <TextField
                      type="date"
                      label="To"
                      value={myAppsTo}
                      onChange={(e) => setMyAppsTo(e.target.value)}
                      size="small"
                      fullWidth
                      slotProps={{ inputLabel: { shrink: true }, input: { sx: { borderRadius: "999px" } } }}
                    />
                  </>
                )}
                <FormControl size="small" fullWidth>
                  <InputLabel>Sort</InputLabel>
                  <Select
                    value={myAppsSort}
                    label="Sort"
                    onChange={(e) => setMyAppsSort(e.target.value)}
                    sx={{
                      borderRadius: "999px",
                      backgroundColor: editorial.skySoft,
                      "& .MuiOutlinedInput-notchedOutline": { border: "none" },
                      transition: "box-shadow 0.18s ease, background-color 0.18s ease",
                      "&:hover": { backgroundColor: editorial.white },
                      "&.Mui-focused": { boxShadow: "none" },
                    }}
                  >
                    <MenuItem value="newest">Newest first</MenuItem>
                    <MenuItem value="oldest">Oldest first</MenuItem>
                    <MenuItem value="role">Role A-Z</MenuItem>
                    <MenuItem value="status">Status A-Z</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            )}
          </Paper>
          <Paper
            sx={{
              borderRadius: `${si.radius}px`,
              boxShadow: si.shadow,
              overflow: "hidden",
                            ...reduceMotionSx,
            }}
          >
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...siType.micro, color: editorial.muted, borderBottom: "none" }}>Reference</TableCell>
                  <TableCell sx={{ ...siType.micro, color: editorial.muted, borderBottom: "none" }}>Role</TableCell>
                  <TableCell sx={{ ...siType.micro, color: editorial.muted, borderBottom: "none" }}>Status</TableCell>
                  <TableCell sx={{ ...siType.micro, color: editorial.muted, borderBottom: "none" }}>Submitted</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedMyApps.map((app) => (
                  <TableRow
                    key={app.id}
                    hover
                    sx={{
                      cursor: "pointer",
                                            transition: "background-color 0.15s ease",
                      "&:hover": { backgroundColor: editorial.blueSoft },
                      "& .MuiTableCell-root": { borderBottom: "none" },
                    }}
                    onClick={() => setSelectedApp(app)}
                  >
                    <TableCell>
                      <Typography className="application-ref" variant="body2" sx={{ ...siType.data, color: editorial.navy }}>
                        {app.submissionRef}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: editorial.ink, fontSize: "0.845rem" }}>
                        {app.jobTitle}
                      </Typography>
                      {app.company && (
                        <Typography variant="caption" sx={{ color: editorial.muted, display: "block" }}>
                          {app.company}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={app.status || "New"}
                        size="small"
                        sx={{
                          borderRadius: "999px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          backgroundColor: app.status === "Reviewed" ? editorial.successSoft : editorial.blueSoft,
                          color: app.status === "Reviewed" ? editorial.success : editorial.navy,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: editorial.muted, fontSize: "0.78rem" }}>
                        {app.submittedAt ? formatDate(app.submittedAt) : "—"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              component="div"
              count={filteredMyApps.length}
              page={myAppsPage}
              onPageChange={(_, nextPage) => setMyAppsPage(nextPage)}
              rowsPerPage={myAppsRowsPerPage}
              labelRowsPerPage="Rows"
              sx={paginationSx}
              onRowsPerPageChange={(e) => {
                setMyAppsRowsPerPage(Number.parseInt(e.target.value, 10));
                setMyAppsPage(0);
              }}
              rowsPerPageOptions={[10, 25, 50]}
            />
          </Paper>
          </>
        )}

        {!loading && !error && !viewingApplications && filteredJobs.length > 0 && (
          <>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {pagedJobs.map((job) => (
                <JobCard key={job.id} job={job} onOpen={openJobDetails} applied={isJobApplied(job.id)} />
              ))}
            </Box>
            {filteredJobs.length > jobsRowsPerPage && (
              <TablePagination
                component="div"
                count={filteredJobs.length}
                page={jobsPage}
                onPageChange={(_, nextPage) => setJobsPage(nextPage)}
                rowsPerPage={jobsRowsPerPage}
                labelRowsPerPage="Rows"
                sx={paginationSx}
                onRowsPerPageChange={(e) => {
                  setJobsRowsPerPage(Number.parseInt(e.target.value, 10));
                  setJobsPage(0);
                }}
                rowsPerPageOptions={[12, 24, 48]}
              />
            )}
          </>
        )}

        {/* Application detail dialog */}
        <Dialog
          open={!!selectedApp}
          onClose={() => setSelectedApp(null)}
          maxWidth="sm"
          fullWidth
          slotProps={{
            backdrop: {
              sx: {
                backgroundColor: "rgba(15, 23, 42, 0.36)",
              },
            },
            paper: {
              sx: {
                borderRadius: `${si.radiusSheet}px`,
                overflow: "hidden",
              },
            },
          }}
        >
          {selectedApp && (
            <>
              <DialogTitle sx={{ pb: 1, backgroundColor: editorial.panel }}>
                <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: editorial.ink }}>
                  Application details
                </Typography>
                <IconButton
                  aria-label="Close"
                  onClick={() => setSelectedApp(null)}
                  size="small"
                  sx={{
                    position: "absolute",
                    right: 12,
                    top: 12,
                    color: editorial.muted,
                    transition: "transform 0.18s ease, background-color 0.18s ease",
                    "&:hover": { backgroundColor: editorial.blueSoft },
                  }}
                >
                  <Close />
                </IconButton>
              </DialogTitle>
              <DialogContent>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <Box><Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 500 }}>Reference</Typography><Typography variant="body2" sx={{ ...siType.data, color: editorial.navy }}>{selectedApp.submissionRef}</Typography></Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 500 }}>Role</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600, color: editorial.ink }}>{selectedApp.jobTitle}</Typography>
                    {selectedApp.company && <Typography variant="body2" sx={{ color: editorial.muted, mt: 0.25 }}>{selectedApp.company}</Typography>}
                  </Box>
                  <Box><Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 500 }}>Applicant</Typography><Typography variant="body1" sx={{ fontWeight: 600, color: editorial.ink }}>{selectedApp.applicantName}</Typography><Typography variant="body2" sx={{ color: editorial.muted }}>{selectedApp.applicantEmail}</Typography>{selectedApp.applicantPhone && <Typography variant="body2" sx={{ color: editorial.muted, mt: 0.25 }}>{selectedApp.applicantPhone}</Typography>}</Box>
                  <Box><Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 500 }}>Status</Typography><Chip label={selectedApp.status || "New"} size="small" sx={{ borderRadius: "999px", fontWeight: 600, backgroundColor: selectedApp.status === "Reviewed" ? editorial.successSoft : editorial.blueSoft, color: selectedApp.status === "Reviewed" ? editorial.success : editorial.navy }} /></Box>
                  <Box><Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 500 }}>Submitted</Typography><Typography variant="body2" sx={{ color: editorial.muted }}>{selectedApp.submittedAt ? formatDate(selectedApp.submittedAt) : "—"}</Typography></Box>

                  {(selectedApp.resumeUrl || selectedSupportingDocuments.length > 0) && (
                    <Box>
                      <Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 500 }}>Documents</Typography>
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 0.5 }}>
                        {selectedApp.resumeUrl && (
                          <Box
                            component="a"
                            href={selectedApp.resumeUrl?.startsWith("https://") ? selectedApp.resumeUrl : "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{
                              display: "inline-flex", alignItems: "center", gap: 1,
                              px: 1.75, py: 0.75, borderRadius: "999px",
                              color: editorial.navy, fontWeight: 600, fontSize: "0.845rem",
                              backgroundColor: editorial.blueSoft,
                              textDecoration: "none", width: "fit-content",
                              transition: "transform 0.18s ease, background-color 0.18s ease",
                              "&:hover": { backgroundColor: editorial.blueWash, transform: "translateY(-1px)" },
                              "&:active": { transform: "translateY(0) scale(0.99)" },
                              ...reduceMotionSx,
                            }}
                          >
                            <Description sx={{ fontSize: 16 }} />
                            View resume
                          </Box>
                        )}
                        {selectedSupportingDocuments.map((doc) => (
                          <Box
                            key={doc.url}
                            component="a"
                            href={doc.url.startsWith("https://") ? doc.url : "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{
                              display: "inline-flex", alignItems: "center", gap: 1,
                              px: 1.75, py: 0.75, borderRadius: "999px",
                              color: editorial.navy, fontWeight: 600, fontSize: "0.845rem",
                              backgroundColor: editorial.blueSoft,
                              textDecoration: "none", width: "fit-content",
                              transition: "transform 0.18s ease, background-color 0.18s ease",
                              "&:hover": { backgroundColor: editorial.blueWash, transform: "translateY(-1px)" },
                              "&:active": { transform: "translateY(0) scale(0.99)" },
                              ...reduceMotionSx,
                            }}
                          >
                            <Description sx={{ fontSize: 16 }} />
                            {doc.name ? `View ${doc.name}` : "View supporting document"}
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}

                  {selectedApp.customAnswers && Object.keys(selectedApp.customAnswers).length > 0 && (
                    <Box>
                      <Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 500 }}>
                        Additional responses
                      </Typography>
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 0.5 }}>
                        {Object.entries(selectedApp.customAnswers).map(([key, value]) => (
                          <Box key={key}>
                            <Typography variant="caption" sx={{ color: editorial.muted, fontWeight: 600, display: "block" }}>
                              {key}
                            </Typography>
                            <Typography variant="body2" sx={{ color: editorial.ink }}>
                              {String(value ?? "")}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}
                </Box>
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={() => setSelectedApp(null)} variant="text">
                  Close
                </Button>
              </DialogActions>
            </>
          )}
        </Dialog>

      </Container>
    </Box>
  );
}

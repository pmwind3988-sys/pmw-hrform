import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  Chip,
  Select,
  MenuItem,
  Skeleton,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  IconButton,
  Checkbox,
  LinearProgress,
  CircularProgress,
  FormControl,
  InputLabel,
  TextField,
  InputAdornment,
  TablePagination,
} from "@mui/material";
import {
  Close,
  Refresh,
  People,
  Delete as DeleteIcon,
  Description,
  FilterList as FilterIcon,
  Search as SearchIcon,
  CheckRounded,
} from "@mui/icons-material";
import { useMsal } from "@azure/msal-react";
import { fetchApplications, updateApplicationStatus, deleteApplications } from "../utils/careersService";
import { acquireAccessTokenSilentOrRedirect } from "../utils/authRecovery";
import { CareerEmptyState, getCareerErrorMessage } from "../components/careers/careerUi";
import { FailurePanel } from "../components/common/StatusPanel";
import Card from "../components/common/Card";
import PageHeader from "../components/common/PageHeader";
import PillTabs from "../components/common/PillTabs";
import { editorial, si, siType } from "../theme/editorial";
import type { JobAdminApplication } from "../types";

type TimelinePreset = "today" | "7d" | "month" | "year" | "custom" | "all";

type SortOption = "newest" | "oldest" | "applicant" | "role" | "status";

type DateRange = {
  from?: string;
  to?: string;
};

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

const searchFieldSx = {
  flex: "1 1 280px",
  minWidth: { xs: "100%", sm: 280 },
  "& .MuiOutlinedInput-root": { borderRadius: "999px", backgroundColor: editorial.skySoft },
  "& .MuiOutlinedInput-notchedOutline": { border: "none" },
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function getThisWeekStart(date: Date): Date {
  const start = startOfDay(date);
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  return start;
}

function dateInputToIso(value: string, boundary: "start" | "end"): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  return (boundary === "start" ? startOfDay(date) : endOfDay(date)).toISOString();
}

function getTimelineRange(preset: TimelinePreset, customFrom = "", customTo = ""): DateRange {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: startOfDay(now).toISOString() };
    case "7d":
      return { from: getThisWeekStart(now).toISOString() };
    case "month": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { from: d.toISOString() };
    }
    case "year": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return { from: d.toISOString() };
    }
    case "custom":
      return {
        from: dateInputToIso(customFrom, "start"),
        to: dateInputToIso(customTo, "end"),
      };
    default:
      return {};
  }
}

const TIMELINE_OPTIONS: { value: TimelinePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "This week" },
  { value: "month", label: "Last 30 days" },
  { value: "year", label: "Last year" },
  { value: "custom", label: "Custom dates" },
  { value: "all", label: "All time" },
];

const SORT_LABELS: Record<SortOption, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  applicant: "Applicant A-Z",
  role: "Role A-Z",
  status: "Status A-Z",
};

const STATUS_OPTIONS = ["New", "KIV", "Shortlisted", "Not Suitable"] as const;

const STATUS_LABELS: Record<string, string> = {
  New: "New",
  KIV: "KIV",
  Shortlisted: "Shortlisted",
  "Not Suitable": "Not suitable",
};

const STATUS_COLORS: Record<string, string> = {
  New: editorial.pmwBlue,
  KIV: editorial.warning,
  Shortlisted: editorial.success,
  "Not Suitable": editorial.error,
};

const STATUS_FILLS: Record<string, string> = {
  New: editorial.blueWash,
  KIV: editorial.warningSoft,
  Shortlisted: editorial.successSoft,
  "Not Suitable": editorial.errorSoft,
};

/** A dot and a word in a pill: the status, nothing shouted. */
function StatusChip({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || editorial.muted;
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        px: 1.25,
        height: 26,
        borderRadius: `${si.radiusPill}px`,
        backgroundColor: STATUS_FILLS[status] || editorial.skySoft,
        color,
        ...siType.subtext,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <Box component="span" aria-hidden sx={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: color }} />
      {STATUS_LABELS[status] ?? status}
    </Box>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-MY", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function AdminApplicationsLoadingSkeleton() {
  return (
    <Card pad="tight">
      {[1, 2, 3, 4, 5].map((item) => (
        <Box key={item} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1.25 }}>
          <Skeleton variant="circular" width={40} height={40} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="40%" />
            <Skeleton variant="text" width="65%" height={16} />
          </Box>
          <Skeleton variant="rounded" width={84} height={26} sx={{ borderRadius: "999px" }} />
        </Box>
      ))}
    </Card>
  );
}

function sharePointScope(): string {
  const spSiteUrl = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
  return `${new URL(spSiteUrl).origin}/AllSites.Manage`;
}

export default function AdminJobsPage() {
  const { instance, accounts } = useMsal();
  const [applications, setApplications] = useState<JobAdminApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCause, setErrorCause] = useState<unknown>(null);
  const [selectedApp, setSelectedApp] = useState<JobAdminApplication | null>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: "success" | "error" } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<TimelinePreset>("today");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const getAdminAccessToken = useCallback(async () => {
    const account = instance.getActiveAccount() ?? accounts[0];
    if (!account) throw new Error("No signed-in account found.");
    return acquireAccessTokenSilentOrRedirect(instance, {
      scopes: [sharePointScope()],
      account,
    });
  }, [instance, accounts]);

  // The status pills show a count for every stage at once, so the fetch no
  // longer narrows by status: the list below is filtered by status on the page.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = getTimelineRange(timelineFilter, customFrom, customTo);
      const accessToken = await getAdminAccessToken();
      const data = await fetchApplications({ accessToken }, {
        status: "",
        submittedFrom: range.from,
        submittedTo: range.to,
        limit: 999,
      });
      setApplications(data);
    } catch (err) {
      setErrorCause(err);
      setError(getCareerErrorMessage(err, "Failed to load applications."));
    } finally {
      setLoading(false);
    }
  }, [timelineFilter, customFrom, customTo, getAdminAccessToken]);

  useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
    void load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [searchText, sortBy, statusFilter]);

  const handleStatusChange = useCallback(
    async (applicationId: string, newStatus: string) => {
      setUpdatingStatusId(applicationId);
      try {
        const accessToken = await getAdminAccessToken();
        const success = await updateApplicationStatus(applicationId, newStatus, { accessToken });
        if (success) {
          setApplications((prev) =>
            prev.map((app) => (app.id === applicationId ? { ...app, status: newStatus } : app)),
          );
          setSnackbar({ message: "Application status updated.", severity: "success" });
        }
      } catch (err) {
        setSnackbar({
          message: getCareerErrorMessage(err, "Failed to update status."),
          severity: "error",
        });
      } finally {
        setUpdatingStatusId(null);
      }
    },
    [getAdminAccessToken],
  );

  // Everything except the status stage: the pills count from this, so each
  // pill tells you what picking it would show.
  const scopedApplications = (() => {
    const range = getTimelineRange(timelineFilter, customFrom, customTo);
    const fromTime = range.from ? new Date(range.from).getTime() : null;
    const toTime = range.to ? new Date(range.to).getTime() : null;
    const q = searchText.trim().toLowerCase();
    return applications.filter((app) => {
      const appTime = new Date(app.submittedAt).getTime();
      if (fromTime !== null && (!Number.isFinite(appTime) || appTime < fromTime)) return false;
      if (toTime !== null && (!Number.isFinite(appTime) || appTime > toTime)) return false;
      if (q) {
        const haystack = [
          app.applicantName,
          app.applicantEmail,
          app.jobTitle,
          app.company ?? "",
          app.submissionRef,
          app.applicantPhone ?? "",
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  })();

  const filteredApplications = useMemo(() => {
    const result = statusFilter
      ? scopedApplications.filter((app) => app.status === statusFilter)
      : [...scopedApplications];

    result.sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
        case "applicant":
          return a.applicantName.localeCompare(b.applicantName);
        case "role":
          return a.jobTitle.localeCompare(b.jobTitle);
        case "status":
          return a.status.localeCompare(b.status);
        default:
          return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      }
    });

    return result;
  }, [scopedApplications, statusFilter, sortBy]);

  const pagedApplications = filteredApplications.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );
  const allSelected = pagedApplications.length > 0 && pagedApplications.every((app) => selectedIds.has(app.id));
  const hasFilters = !!searchText.trim() || !!statusFilter || timelineFilter !== "all";
  const hasSearchOptions = hasFilters || sortBy !== "newest";
  const selectedSupportingDocuments = selectedApp?.supportingDocuments?.length
    ? selectedApp.supportingDocuments
    : selectedApp?.coverLetterUrl
      ? [{ name: "Supporting Document", url: selectedApp.coverLetterUrl }]
      : [];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const app of pagedApplications) next.delete(app.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const app of pagedApplications) next.add(app.id);
        return next;
      });
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteResult(null);
    try {
      const accessToken = await getAdminAccessToken();
      const result = await deleteApplications([...selectedIds], { accessToken });
      const appText = `Deleted ${result.deleted} application${result.deleted !== 1 ? "s" : ""}`;
      const fileText = `${result.deletedFiles ?? 0} attached document${(result.deletedFiles ?? 0) !== 1 ? "s" : ""}`;
      const msg = `${appText} and ${fileText}`;
      const warnings = [...(result.errors ?? []), ...(result.fileWarnings ?? [])];
      if (warnings.length > 0) {
        setSnackbar({ message: `${msg}. Warnings: ${warnings.join("; ")}`, severity: "error" });
      } else {
        setSnackbar({ message: msg, severity: "success" });
      }
      setSelectedIds(new Set());
      setConfirmDeleteOpen(false);
      void load();
    } catch (err) {
      setSnackbar({
        message: getCareerErrorMessage(err, "Failed to delete applications."),
        severity: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  const stats = {
    total: scopedApplications.length,
    new: scopedApplications.filter((a) => a.status === "New").length,
    kiv: scopedApplications.filter((a) => a.status === "KIV").length,
    shortlisted: scopedApplications.filter((a) => a.status === "Shortlisted").length,
    notSuitable: scopedApplications.filter((a) => a.status === "Not Suitable").length,
  };

  const clearAll = () => {
    setTimelineFilter("all");
    setStatusFilter("");
    setSearchText("");
    setSortBy("newest");
    setCustomFrom("");
    setCustomTo("");
    setSelectedIds(new Set());
  };

  const timelineLabel = TIMELINE_OPTIONS.find((opt) => opt.value === timelineFilter)?.label ?? "";

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="Applications"
        description="Review internal advancement submissions and update applicant status."
        secondary={[{ label: "Refresh", icon: <Refresh />, onClick: () => void load(), disabled: loading }]}
      />

      {/* Search and filters */}
      {!loading && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <TextField
              placeholder="Search applicant, email, role, ref..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              size="small"
              sx={searchFieldSx}
              slotProps={{
                htmlInput: { "aria-label": "Search applications" },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: editorial.muted, fontSize: 20 }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button
              variant="text"
              startIcon={<FilterIcon />}
              onClick={() => setShowAdvancedFilters((open) => !open)}
              aria-expanded={showAdvancedFilters}
              sx={{ backgroundColor: showAdvancedFilters ? editorial.blueWash : editorial.panel, boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)", whiteSpace: "nowrap" }}
            >
              Dates and sorting
            </Button>
            {timelineFilter !== "all" && (
              <Chip
                icon={<CheckRounded />}
                label={timelineLabel}
                color="primary"
                onDelete={() => { setTimelineFilter("all"); setSelectedIds(new Set()); }}
                deleteIcon={<Close aria-label={`Remove the ${timelineLabel} filter`} />}
              />
            )}
            {sortBy !== "newest" && (
              <Chip
                icon={<CheckRounded />}
                label={SORT_LABELS[sortBy]}
                color="primary"
                onDelete={() => setSortBy("newest")}
                deleteIcon={<Close aria-label="Go back to newest first" />}
              />
            )}
            {hasSearchOptions && (
              <Button size="small" startIcon={<Close />} onClick={clearAll} sx={{ color: editorial.muted }}>
                Clear all
              </Button>
            )}
          </Box>

          {showAdvancedFilters && (
            <Card pad="tight" sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Typography sx={{ ...siType.cardTitle, color: editorial.ink }}>Submitted</Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {TIMELINE_OPTIONS.map((opt) => {
                  const on = timelineFilter === opt.value;
                  return (
                    <Chip
                      key={opt.value}
                      label={opt.label}
                      clickable
                      icon={on ? <CheckRounded /> : undefined}
                      color={on ? "primary" : "default"}
                      variant={on ? "filled" : "outlined"}
                      onClick={() => { setTimelineFilter(opt.value); setSelectedIds(new Set()); }}
                    />
                  );
                })}
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: timelineFilter === "custom" ? "repeat(3, minmax(0, 1fr))" : "minmax(0, 320px)" },
                  gap: 1.25,
                  width: "100%",
                }}
              >
                {timelineFilter === "custom" && (
                  <>
                    <TextField
                      type="date"
                      label="From"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      size="small"
                      fullWidth
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                    <TextField
                      type="date"
                      label="To"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      size="small"
                      fullWidth
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  </>
                )}

                <FormControl size="small" fullWidth>
                  <InputLabel>Sort</InputLabel>
                  <Select
                    value={sortBy}
                    label="Sort"
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                  >
                    {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
                      <MenuItem key={key} value={key}>{SORT_LABELS[key]}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Card>
          )}
        </Box>
      )}

      {/* Pipeline stages: pick one to filter the list */}
      {!loading && !error && (
        <PillTabs
          aria-label="Application status"
          value={statusFilter || "all"}
          onChange={(value) => { setStatusFilter(value === "all" ? "" : value); setSelectedIds(new Set()); }}
          tabs={[
            { value: "all", label: "All", count: stats.total },
            { value: "New", label: "New", count: stats.new },
            { value: "KIV", label: "KIV", count: stats.kiv },
            { value: "Shortlisted", label: "Shortlisted", count: stats.shortlisted },
            { value: "Not Suitable", label: "Not suitable", count: stats.notSuitable },
          ]}
        />
      )}

      {/* Loading */}
      {loading && (
        <AdminApplicationsLoadingSkeleton />
      )}

      {/* Error */}
      {!loading && error && (
        <FailurePanel what="applications" error={errorCause} onRetry={load} />
      )}

      {/* Empty */}
      {!loading && !error && filteredApplications.length === 0 && (
        <CareerEmptyState
          icon={<People />}
          title={applications.length === 0 ? "No applications yet" : "No results match"}
          description={
            applications.length === 0
              ? "Applications from internal advancement openings will appear here."
              : "Try adjusting your search, dates, or status."
          }
        />
      )}

      {/* Delete bar */}
      {selectedIds.size > 0 && (
        <Box
          sx={{
            mb: 2,
            p: 1.5,
            px: 2,
            borderRadius: `${si.radius}px`,
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 1.5,
            backgroundColor: editorial.errorSoft,
          }}
        >
          <Typography sx={{ ...siType.body, color: editorial.error, fontWeight: 600, flex: 1 }}>
            {selectedIds.size} application{selectedIds.size !== 1 ? "s" : ""} selected
          </Typography>
          <Button
            variant="contained"
            color="error"
            size="small"
            startIcon={<DeleteIcon />}
            onClick={() => setConfirmDeleteOpen(true)}
          >
            Delete
          </Button>
          <Button size="small" onClick={() => setSelectedIds(new Set())} sx={{ color: editorial.muted }}>
            Clear
          </Button>
        </Box>
      )}

      {/* List */}
      {!loading && !error && filteredApplications.length > 0 && (
        <Card pad="none" clip>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, pt: 1 }}>
            <Checkbox
              checked={allSelected}
              indeterminate={pagedApplications.some((app) => selectedIds.has(app.id)) && !allSelected}
              onChange={toggleSelectAll}
              slotProps={{ input: { "aria-label": "Select every application on this page" } }}
            />
            <Typography sx={{ ...siType.subtext, color: editorial.muted }}>
              {filteredApplications.length} application{filteredApplications.length !== 1 ? "s" : ""}
              {filteredApplications.length < applications.length ? ` of ${applications.length}` : ""}
            </Typography>
          </Box>
          <Box sx={{ px: 1, pb: 1 }}>
            {pagedApplications.map((app) => (
              <Box
                key={app.id}
                onClick={() => setSelectedApp(app)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 1.5,
                  px: 1,
                  py: 1.25,
                  borderRadius: `${si.radius}px`,
                  cursor: "pointer",
                  backgroundColor: selectedIds.has(app.id) ? editorial.blueWash : "transparent",
                  "&:hover": { backgroundColor: editorial.blueSoft },
                }}
              >
                <Box onClick={(e) => e.stopPropagation()} sx={{ display: "flex" }}>
                  <Checkbox
                    checked={selectedIds.has(app.id)}
                    onChange={() => toggleSelect(app.id)}
                    slotProps={{ input: { "aria-label": `Select ${app.applicantName}` } }}
                  />
                </Box>
                <Box
                  aria-hidden
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "grid",
                    placeItems: "center",
                    backgroundColor: editorial.blueWash,
                    color: editorial.navyDeep,
                    ...siType.subtext,
                    fontWeight: 700,
                  }}
                >
                  {initialsOf(app.applicantName)}
                </Box>
                <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
                  <Typography noWrap sx={{ ...siType.cardTitle, color: editorial.ink }}>
                    {app.applicantName} <Box component="span" sx={{ color: editorial.muted, fontWeight: 400 }}>· {app.jobTitle}</Box>
                  </Typography>
                  <Typography noWrap sx={{ ...siType.subtext, color: editorial.muted }}>
                    {app.applicantEmail}
                    {app.company ? ` · ${app.company}` : ""} · {app.submissionRef} · {formatDate(app.submittedAt)}
                  </Typography>
                </Box>
                <StatusChip status={app.status} />
                <Box
                  onClick={(e) => e.stopPropagation()}
                  sx={{ position: "relative", display: "inline-flex", alignItems: "center" }}
                >
                  <Select
                    value={app.status}
                    size="small"
                    disabled={updatingStatusId === app.id}
                    onChange={(e) => handleStatusChange(app.id, e.target.value)}
                    inputProps={{ "aria-label": `Change status for ${app.applicantName}` }}
                    sx={{
                      borderRadius: `${si.radiusPill}px`,
                      ...siType.subtext,
                      minWidth: 132,
                      backgroundColor: editorial.skySoft,
                      opacity: updatingStatusId === app.id ? 0.6 : 1,
                      "& .MuiOutlinedInput-notchedOutline": { border: "none" },
                    }}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <MenuItem key={opt} value={opt}>
                        {STATUS_LABELS[opt]}
                      </MenuItem>
                    ))}
                  </Select>
                  {updatingStatusId === app.id && (
                    <CircularProgress
                      size={16}
                      sx={{ position: "absolute", right: 30, color: editorial.pmwBlue, pointerEvents: "none" }}
                    />
                  )}
                </Box>
              </Box>
            ))}
          </Box>
          <TablePagination
            component="div"
            count={filteredApplications.length}
            page={page}
            onPageChange={(_, nextPage) => setPage(nextPage)}
            rowsPerPage={rowsPerPage}
            labelRowsPerPage="Rows"
            sx={paginationSx}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(Number.parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[25, 50, 100]}
          />
        </Card>
      )}

        {/* Detail Dialog */}
        <Dialog
          open={!!selectedApp}
          onClose={() => setSelectedApp(null)}
          maxWidth="sm"
          fullWidth
          slotProps={{
            paper: {
              sx: { borderRadius: `${si.radiusSheet}px`, p: 1 },
            },
          }}
        >
          {selectedApp && (
            <>
              <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}>
                <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: editorial.ink }}>
                  Application Details
                </Typography>
                <IconButton onClick={() => setSelectedApp(null)} size="small" aria-label="Close">
                  <Close />
                </IconButton>
              </DialogTitle>
              <DialogContent>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 500 }}>
                      Reference
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600, color: editorial.pmwBlue }}>
                      {selectedApp.submissionRef}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 500 }}>
                      Applicant
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600, color: editorial.ink }}>
                      {selectedApp.applicantName}
                    </Typography>
                    <Typography variant="body2" sx={{ color: editorial.muted }}>
                      {selectedApp.applicantEmail}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 500 }}>
                      Position
                    </Typography>
                    <Typography variant="body1" sx={{ color: editorial.ink }}>
                      {selectedApp.jobTitle}
                    </Typography>
                    {selectedApp.company && (
                      <Typography variant="body2" sx={{ color: editorial.muted, mt: 0.25 }}>
                        {selectedApp.company}
                      </Typography>
                    )}
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 500 }}>
                      Status
                    </Typography>
                    <Box sx={{ mt: 0.5 }}>
                      <StatusChip status={selectedApp.status} />
                    </Box>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 500 }}>
                      Submitted
                    </Typography>
                    <Typography variant="body2" sx={{ color: editorial.muted }}>
                      {formatDate(selectedApp.submittedAt)}
                    </Typography>
                  </Box>

                  {(selectedApp.resumeUrl || selectedSupportingDocuments.length > 0) && (
                    <Box>
                      <Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 500 }}>
                        Documents
                      </Typography>
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 0.5 }}>
                        {selectedApp.resumeUrl && (
                          <Box
                            component="a"
                            href={selectedApp.resumeUrl?.startsWith("https://") ? selectedApp.resumeUrl : "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{
                              display: "inline-flex", alignItems: "center", gap: 1,
                              px: 1.5, py: 0.75, borderRadius: "999px",
                              color: editorial.pmwBlue, fontWeight: 600, fontSize: "0.845rem",
                              backgroundColor: editorial.blueSoft, 
                              textDecoration: "none", width: "fit-content",
                              "&:hover": { backgroundColor: editorial.blueWash },
                            }}
                          >
                            <Description sx={{ fontSize: 16 }} />
                            View Resume
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
                              px: 1.5, py: 0.75, borderRadius: "999px",
                              color: editorial.pmwBlue, fontWeight: 600, fontSize: "0.845rem",
                              backgroundColor: editorial.blueSoft, 
                              textDecoration: "none", width: "fit-content",
                              "&:hover": { backgroundColor: editorial.blueWash },
                            }}
                          >
                            <Description sx={{ fontSize: 16 }} />
                            {doc.name ? `View ${doc.name}` : "View Supporting Document"}
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}

                  {selectedApp.customAnswers && Object.keys(selectedApp.customAnswers).length > 0 && (
                    <Box>
                      <Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 500 }}>
                        Additional Responses
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
                <Button
                  variant="outlined"
                  onClick={() => setSelectedApp(null)}
                  sx={{ color: editorial.muted }}
                >
                  Close
                </Button>
              </DialogActions>
            </>
          )}
        </Dialog>

        {/* Delete confirmation dialog */}
        <Dialog open={confirmDeleteOpen} onClose={() => !deleting && setConfirmDeleteOpen(false)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: `${si.radiusSheet}px` } } }}>
          <DialogTitle sx={{ pb: 1 }}>
            <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: editorial.ink }}>
              Delete Applications
            </Typography>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ color: editorial.muted }}>
              Are you sure you want to delete <strong>{selectedIds.size}</strong> application{selectedIds.size !== 1 ? "s" : ""}? This action cannot be undone.
            </Typography>
            {deleting && <LinearProgress sx={{ mt: 2, borderRadius: "4px" }} />}
            {deleteResult && (
              <Alert severity="info" sx={{ mt: 2, borderRadius: `${si.radius}px` }}>{deleteResult}</Alert>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={deleting}
              sx={{ color: editorial.muted }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDelete}
              disabled={deleting}
              
            >
              {deleting ? "Deleting..." : `Delete ${selectedIds.size}`}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Snackbar */}
        <Snackbar
          open={!!snackbar}
          autoHideDuration={4000}
          onClose={() => setSnackbar(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          {snackbar ? (
            <Alert
              severity={snackbar.severity}
              onClose={() => setSnackbar(null)}
              sx={{
                borderRadius: `${si.radius}px`,
                fontWeight: 700,
                fontSize: "0.875rem",
                boxShadow: si.shadowRaised,
                color: editorial.ink,
                "& .MuiAlert-icon": { fontSize: 22, alignSelf: "center" },
              }}
            >
              {snackbar.message}
            </Alert>
          ) : undefined}
        </Snackbar>
    </Box>
  );
}

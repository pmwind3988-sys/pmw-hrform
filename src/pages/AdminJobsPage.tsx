import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
  Grid,
  Card,
  CardContent,
  IconButton,
  Checkbox,
  LinearProgress,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
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
  NewReleases,
  CheckCircle,
  AccessTime,
  Delete as DeleteIcon,
  Today as TodayIcon,
  DateRange as WeekIcon,
  CalendarMonth as MonthIcon,
  FilterList as FilterIcon,
  Search as SearchIcon,
} from "@mui/icons-material";
import { fetchApplications, updateApplicationStatus, deleteApplications } from "../utils/careersService";
import CareerPortalHeader from "../components/careers/CareerPortalHeader";
import type { JobAdminApplication } from "../types";

type TimelinePreset = "today" | "7d" | "month" | "year" | "custom" | "all";

type SortOption = "newest" | "oldest" | "applicant" | "role" | "status";

type DateRange = {
  from?: string;
  to?: string;
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

const TIMELINE_OPTIONS: { value: TimelinePreset; label: string; icon: React.ReactNode }[] = [
  { value: "today", label: "Today", icon: <TodayIcon sx={{ fontSize: 16 }} /> },
  { value: "7d", label: "This Week", icon: <WeekIcon sx={{ fontSize: 16 }} /> },
  { value: "month", label: "30 Days", icon: <MonthIcon sx={{ fontSize: 16 }} /> },
  { value: "year", label: "Year", icon: <MonthIcon sx={{ fontSize: 16 }} /> },
  { value: "custom", label: "Custom", icon: <WeekIcon sx={{ fontSize: 16 }} /> },
  { value: "all", label: "All", icon: null },
];

const STATUS_OPTIONS = ["New", "KIV", "Shortlisted", "Not Suitable"] as const;

const STATUS_COLORS: Record<string, string> = {
  New: "#0078D4",
  KIV: "#F59E0B",
  Shortlisted: "#34A853",
  "Not Suitable": "#DC2626",
};

function StatusChip({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || "#6B7280";
  return (
    <Chip
      label={status}
      size="small"
      sx={{
        backgroundColor: `${color}18`,
        color,
        fontWeight: 600,
        fontSize: "0.75rem",
        borderRadius: "8px",
      }}
    />
  );
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

export default function AdminJobsPage() {
  const [applications, setApplications] = useState<JobAdminApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = getTimelineRange(timelineFilter, customFrom, customTo);
      const data = await fetchApplications({
        status: statusFilter,
        submittedFrom: range.from,
        submittedTo: range.to,
        limit: 999,
      });
      setApplications(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load applications");
    } finally {
      setLoading(false);
    }
  }, [timelineFilter, statusFilter, customFrom, customTo]);

  useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
    void load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [searchText, sortBy]);

  const handleStatusChange = useCallback(
    async (applicationId: string, newStatus: string) => {
      setUpdatingStatusId(applicationId);
      try {
        const success = await updateApplicationStatus(applicationId, newStatus);
        if (success) {
          setApplications((prev) =>
            prev.map((app) => (app.id === applicationId ? { ...app, status: newStatus } : app)),
          );
          setSnackbar({ message: "Status updated successfully", severity: "success" });
        }
      } catch (err) {
        setSnackbar({
          message: err instanceof Error ? err.message : "Failed to update status",
          severity: "error",
        });
      } finally {
        setUpdatingStatusId(null);
      }
    },
    [],
  );

  const filteredApplications = useMemo(() => {
    const range = getTimelineRange(timelineFilter, customFrom, customTo);
    const fromTime = range.from ? new Date(range.from).getTime() : null;
    const toTime = range.to ? new Date(range.to).getTime() : null;
    const q = searchText.trim().toLowerCase();
    const result = applications.filter((app) => {
      const appTime = new Date(app.submittedAt).getTime();
      if (fromTime !== null && (!Number.isFinite(appTime) || appTime < fromTime)) return false;
      if (toTime !== null && (!Number.isFinite(appTime) || appTime > toTime)) return false;
      if (statusFilter && app.status !== statusFilter) return false;
      if (q) {
        const haystack = [
          app.applicantName,
          app.applicantEmail,
          app.jobTitle,
          app.submissionRef,
          app.applicantPhone ?? "",
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

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
  }, [applications, timelineFilter, customFrom, customTo, statusFilter, searchText, sortBy]);

  const pagedApplications = filteredApplications.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );
  const allSelected = pagedApplications.length > 0 && pagedApplications.every((app) => selectedIds.has(app.id));
  const hasFilters = !!searchText.trim() || !!statusFilter || timelineFilter !== "all";
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
      const result = await deleteApplications([...selectedIds]);
      const appText = `Deleted ${result.deleted} application${result.deleted !== 1 ? "s" : ""}`;
      const fileText = `deleted ${result.deletedFiles ?? 0} attached document${(result.deletedFiles ?? 0) !== 1 ? "s" : ""}`;
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
        message: err instanceof Error ? err.message : "Failed to delete applications",
        severity: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  const stats = {
    total: filteredApplications.length,
    new: filteredApplications.filter((a) => a.status === "New").length,
    kiv: filteredApplications.filter((a) => a.status === "KIV").length,
    shortlisted: filteredApplications.filter((a) => a.status === "Shortlisted").length,
    notSuitable: filteredApplications.filter((a) => a.status === "Not Suitable").length,
  };

  return (
    <Box sx={{ minHeight: "100vh", background: "var(--app-bg, #F6F8FB)" }}>
      <CareerPortalHeader
        title="Career Applications"
        subtitle="Review internal advancement submissions and update applicant status."
        activeSection="applications"
        isAdmin
        backPath="/admin/dashboard"
        backLabel="Back to forms dashboard"
        maxWidth="xl"
        actions={(
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={load}
            disabled={loading}
            sx={{
              whiteSpace: "nowrap",
              borderColor: "#D1D5DB",
              color: "#6B7280",
            }}
          >
            Refresh
          </Button>
        )}
      />

      <Box sx={{ maxWidth: 1440, mx: "auto", px: { xs: 1.5, sm: 3, md: 4 }, py: { xs: 2, sm: 3 } }}>
        {/* Filter bar */}
        <Paper
          sx={{
            p: 2,
            mb: 3,
            borderRadius: "8px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            display: "flex",
            flexWrap: "wrap",
            gap: 2,
            alignItems: "center",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mr: 1 }}>
            <FilterIcon sx={{ fontSize: 18, color: "#6B7280" }} />
            <Typography variant="body2" sx={{ fontWeight: 600, color: "#374151", fontSize: "0.85rem" }}>
              Timeline
            </Typography>
          </Box>
          <ToggleButtonGroup
            value={timelineFilter}
            exclusive
            onChange={(_, val) => { if (val !== null) { setTimelineFilter(val); setSelectedIds(new Set()); } }}
            size="small"
            sx={{
              gap: 0.5,
              flexWrap: "wrap",
              "& .MuiToggleButton-root": {
                borderRadius: "8px !important",
                border: "1px solid #E5E7EB",
                px: 1.5,
                py: 0.5,
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "#6B7280",
                textTransform: "none",
                "&:not(:first-of-type)": {
                  borderLeft: "1px solid #E5E7EB",
                  marginLeft: 0,
                },
                "&.Mui-selected": {
                  backgroundColor: "#F0F7FF",
                  color: "#0078D4",
                  borderColor: "#0078D4",
                },
              },
            }}
          >
            {TIMELINE_OPTIONS.map((opt) => (
              <ToggleButton key={opt.value} value={opt.value}>
                {opt.icon && <Box sx={{ mr: 0.5, display: "flex" }}>{opt.icon}</Box>}
                {opt.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {timelineFilter === "custom" && (
            <>
              <TextField
                type="date"
                label="From"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                size="small"
                sx={{ width: { xs: "100%", sm: 150 } }}
                slotProps={{
                  inputLabel: { shrink: true },
                  input: { sx: { borderRadius: "8px", fontSize: "0.8rem" } },
                }}
              />
              <TextField
                type="date"
                label="To"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                size="small"
                sx={{ width: { xs: "100%", sm: 150 } }}
                slotProps={{
                  inputLabel: { shrink: true },
                  input: { sx: { borderRadius: "8px", fontSize: "0.8rem" } },
                }}
              />
            </>
          )}

          <Box sx={{ width: "1px", height: 28, backgroundColor: "#E5E7EB", mx: 1 }} />

          <TextField
            placeholder="Search applicant, email, role, ref..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            size="small"
            sx={{
              flex: { xs: "1 1 100%", md: "1 1 260px" },
              minWidth: { xs: "unset", md: 240 },
              "& .MuiOutlinedInput-root": {
                borderRadius: "8px",
                backgroundColor: "#F8F9FC",
                fontSize: "0.85rem",
              },
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: "#6B7280", fontSize: 20 }} />
                  </InputAdornment>
                ),
              },
            }}
          />

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(e) => { setStatusFilter(e.target.value); setSelectedIds(new Set()); }}
              sx={{ borderRadius: "8px", fontSize: "0.8rem" }}
            >
              <MenuItem value="">All statuses</MenuItem>
              {STATUS_OPTIONS.map((opt) => (
                <MenuItem key={opt} value={opt}>{opt}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Sort</InputLabel>
            <Select
              value={sortBy}
              label="Sort"
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              sx={{ borderRadius: "8px", fontSize: "0.8rem" }}
            >
              <MenuItem value="newest">Newest first</MenuItem>
              <MenuItem value="oldest">Oldest first</MenuItem>
              <MenuItem value="applicant">Applicant A-Z</MenuItem>
              <MenuItem value="role">Role A-Z</MenuItem>
              <MenuItem value="status">Status A-Z</MenuItem>
            </Select>
          </FormControl>

          {hasFilters && (
            <Button
              size="small"
              onClick={() => {
                setTimelineFilter("all");
                setStatusFilter("");
                setSearchText("");
                setCustomFrom("");
                setCustomTo("");
                setSelectedIds(new Set());
              }}
              sx={{ borderRadius: "8px", textTransform: "none", color: "#6B7280", fontWeight: 600 }}
            >
              Clear
            </Button>
          )}

          {(filteredApplications.length < applications.length || hasFilters) && (
            <Chip
              label={`${filteredApplications.length} of ${applications.length}`}
              size="small"
              sx={{
                backgroundColor: "#F0F7FF",
                color: "#0078D4",
                fontWeight: 600,
                fontSize: "0.75rem",
                borderRadius: "8px",
              }}
            />
          )}
        </Paper>

        {/* Stats Row */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: "Total Applications", value: stats.total, icon: <People />, color: "#0078D4" },
            { label: "New", value: stats.new, icon: <NewReleases />, color: "#0078D4" },
            { label: "KIV", value: stats.kiv, icon: <AccessTime />, color: "#F59E0B" },
            { label: "Shortlisted", value: stats.shortlisted, icon: <CheckCircle />, color: "#34A853" },
            { label: "Not Suitable", value: stats.notSuitable, icon: <People />, color: "#DC2626" },
          ].map((stat) => (
            <Grid size={{ xs: 6, sm: 4, lg: 2 }} key={stat.label}>
              <Card
                sx={{
                  borderRadius: "8px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  transition: "box-shadow 0.2s ease",
                  "&:hover": { boxShadow: "0 8px 20px rgba(17,24,39,0.08)" },
                }}
              >
                <CardContent sx={{ p: { xs: 1.5, sm: 2.5 } }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
                    <Box sx={{ color: stat.color, display: "flex" }}>{stat.icon}</Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: "#111827", fontSize: { xs: "1.3rem", sm: "1.5rem" } }}>
                      {stat.value}
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: "#6B7280", fontWeight: 500 }}>
                    {stat.label}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Loading */}
        {loading && (
          <TableContainer component={Paper} sx={{ borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: "#F9FAFB" }}>
                  {["Reference", "Applicant", "Role", "Status", "Submitted", "Actions"].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", textTransform: "uppercase" }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {[1, 2, 3, 4].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton variant="text" width={110} /></TableCell>
                    <TableCell>
                      <Skeleton variant="text" width={130} />
                      <Skeleton variant="text" width={160} height={14} />
                    </TableCell>
                    <TableCell><Skeleton variant="text" width={120} /></TableCell>
                    <TableCell><Skeleton variant="rounded" width={70} height={24} sx={{ borderRadius: "8px" }} /></TableCell>
                    <TableCell><Skeleton variant="text" width={100} /></TableCell>
                    <TableCell><Skeleton variant="text" width={50} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Error */}
        {!loading && error && (
          <Alert
            severity="error"
            sx={{ borderRadius: "8px", mb: 3, fontWeight: 700, backgroundColor: "#FEF2F2", color: "#991B1B", "& .MuiAlert-icon": { color: "#DC2626" } }}
            action={
              <Button size="small" onClick={load} sx={{ textTransform: "none" }}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {/* Empty */}
        {!loading && !error && filteredApplications.length === 0 && (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <People sx={{ fontSize: 48, color: "#D1D5DB", mb: 2 }} />
            <Typography variant="h6" sx={{ color: "#6B7280", fontWeight: 600 }}>
              {applications.length === 0 ? "No Applications Yet" : "No Results Match"}
            </Typography>
            <Typography variant="body2" sx={{ color: "#9CA3AF" }}>
              {applications.length === 0
                ? "Applications from internal advancement openings will appear here."
                : "Try adjusting your search, timeline, or status filter."
              }
            </Typography>
          </Box>
        )}

        {/* Delete bar */}
        {selectedIds.size > 0 && (
          <Paper
            sx={{
              mb: 2,
              p: 1.5,
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: 2,
              backgroundColor: "#FEF2F2",
              border: "1px solid #FECACA",
            }}
          >
            <Typography variant="body2" sx={{ color: "#991B1B", fontWeight: 600, flex: 1 }}>
              {selectedIds.size} application{selectedIds.size !== 1 ? "s" : ""} selected
            </Typography>
            <Button
              variant="contained"
              color="error"
              size="small"
              startIcon={<DeleteIcon />}
              onClick={() => setConfirmDeleteOpen(true)}
              sx={{ borderRadius: "8px", textTransform: "none", fontWeight: 600 }}
            >
              Delete
            </Button>
            <Button
              size="small"
              onClick={() => setSelectedIds(new Set())}
              sx={{ borderRadius: "8px", textTransform: "none", color: "#6B7280", fontWeight: 500 }}
            >
              Clear
            </Button>
          </Paper>
        )}

        {/* Table */}
        {!loading && !error && filteredApplications.length > 0 && (
          <TableContainer
            component={Paper}
            sx={{
              borderRadius: "8px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              overflowX: "auto",
            }}
          >
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: "#F9FAFB" }}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={pagedApplications.some((app) => selectedIds.has(app.id)) && !allSelected}
                      onChange={toggleSelectAll}
                      sx={{ color: "#D1D5DB", "&.Mui-checked": { color: "#0078D4" } }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", textTransform: "uppercase" }}>
                    Reference
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", textTransform: "uppercase" }}>
                    Applicant
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", textTransform: "uppercase" }}>
                    Role
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", textTransform: "uppercase" }}>
                    Status
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", textTransform: "uppercase" }}>
                    Submitted
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", textTransform: "uppercase" }}>
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedApplications.map((app) => (
                  <TableRow
                    key={app.id}
                    hover
                    selected={selectedIds.has(app.id)}
                    sx={{ cursor: "pointer", "&:hover": { backgroundColor: "#FAFBFC" } }}
                    onClick={() => setSelectedApp(app)}
                  >
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(app.id)}
                        onChange={() => toggleSelect(app.id)}
                        sx={{ color: "#D1D5DB", "&.Mui-checked": { color: "#0078D4" } }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600, color: "#0078D4", fontSize: "0.8rem" }}>
                        {app.submissionRef}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: "#111827", fontSize: "0.85rem" }}>
                        {app.applicantName}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "#9CA3AF" }}>
                        {app.applicantEmail}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: "#374151", fontSize: "0.85rem" }}>
                        {app.jobTitle}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <StatusChip status={app.status} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: "#6B7280", fontSize: "0.8rem" }}>
                        {formatDate(app.submittedAt)}
                      </Typography>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Box sx={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                        <Select
                          value={app.status}
                          size="small"
                          disabled={updatingStatusId === app.id}
                          onChange={(e) => handleStatusChange(app.id, e.target.value)}
                          sx={{
                            borderRadius: "8px",
                            fontSize: "0.8rem",
                            minWidth: 120,
                            opacity: updatingStatusId === app.id ? 0.6 : 1,
                            "& .MuiOutlinedInput-notchedOutline": { borderColor: "#E5E7EB" },
                          }}
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <MenuItem key={opt} value={opt} sx={{ fontSize: "0.85rem" }}>
                              {opt}
                            </MenuItem>
                          ))}
                        </Select>
                        {updatingStatusId === app.id && (
                          <CircularProgress
                            size={16}
                            sx={{
                              position: "absolute",
                              right: 28,
                              color: "#0078D4",
                              pointerEvents: "none",
                            }}
                          />
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              component="div"
              count={filteredApplications.length}
              page={page}
              onPageChange={(_, nextPage) => setPage(nextPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(Number.parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[25, 50, 100]}
            />
          </TableContainer>
        )}

        {/* Detail Dialog */}
        <Dialog
          open={!!selectedApp}
          onClose={() => setSelectedApp(null)}
          maxWidth="sm"
          fullWidth
          slotProps={{
            paper: {
              sx: { borderRadius: "8px", p: 1 },
            },
          }}
        >
          {selectedApp && (
            <>
              <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}>
                <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: "#111827" }}>
                  Application Details
                </Typography>
                <IconButton onClick={() => setSelectedApp(null)} size="small">
                  <Close />
                </IconButton>
              </DialogTitle>
              <DialogContent>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: "#9CA3AF", fontWeight: 500 }}>
                      Reference
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600, color: "#0078D4" }}>
                      {selectedApp.submissionRef}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: "#9CA3AF", fontWeight: 500 }}>
                      Applicant
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600, color: "#111827" }}>
                      {selectedApp.applicantName}
                    </Typography>
                    <Typography variant="body2" sx={{ color: "#6B7280" }}>
                      {selectedApp.applicantEmail}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: "#9CA3AF", fontWeight: 500 }}>
                      Position
                    </Typography>
                    <Typography variant="body1" sx={{ color: "#374151" }}>
                      {selectedApp.jobTitle}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: "#9CA3AF", fontWeight: 500 }}>
                      Status
                    </Typography>
                    <Box sx={{ mt: 0.5 }}>
                      <StatusChip status={selectedApp.status} />
                    </Box>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: "#9CA3AF", fontWeight: 500 }}>
                      Submitted
                    </Typography>
                    <Typography variant="body2" sx={{ color: "#6B7280" }}>
                      {formatDate(selectedApp.submittedAt)}
                    </Typography>
                  </Box>

                  {(selectedApp.resumeUrl || selectedSupportingDocuments.length > 0) && (
                    <Box>
                      <Typography variant="caption" sx={{ color: "#9CA3AF", fontWeight: 500 }}>
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
                              px: 1.5, py: 0.75, borderRadius: "8px",
                              color: "#0078D4", fontWeight: 600, fontSize: "0.85rem",
                              backgroundColor: "#F0F7FF", border: "1px solid rgba(0,120,212,0.15)",
                              textDecoration: "none", width: "fit-content",
                              "&:hover": { backgroundColor: "#DBEAFE" },
                              "&::before": { content: "'📄 '", fontSize: "14px" },
                            }}
                          >
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
                              px: 1.5, py: 0.75, borderRadius: "8px",
                              color: "#0078D4", fontWeight: 600, fontSize: "0.85rem",
                              backgroundColor: "#F0F7FF", border: "1px solid rgba(0,120,212,0.15)",
                              textDecoration: "none", width: "fit-content",
                              "&:hover": { backgroundColor: "#DBEAFE" },
                              "&::before": { content: "'📝 '", fontSize: "14px" },
                            }}
                          >
                            {doc.name ? `View ${doc.name}` : "View Supporting Document"}
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}

                  {selectedApp.customAnswers && Object.keys(selectedApp.customAnswers).length > 0 && (
                    <Box>
                      <Typography variant="caption" sx={{ color: "#9CA3AF", fontWeight: 500 }}>
                        Additional Responses
                      </Typography>
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 0.5 }}>
                        {Object.entries(selectedApp.customAnswers).map(([key, value]) => (
                          <Box key={key}>
                            <Typography variant="caption" sx={{ color: "#6B7280", fontWeight: 600, display: "block" }}>
                              {key}
                            </Typography>
                            <Typography variant="body2" sx={{ color: "#374151" }}>
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
                  sx={{ borderRadius: "8px", textTransform: "none", borderColor: "#D1D5DB", color: "#6B7280" }}
                >
                  Close
                </Button>
              </DialogActions>
            </>
          )}
        </Dialog>

        {/* Delete confirmation dialog */}
        <Dialog open={confirmDeleteOpen} onClose={() => !deleting && setConfirmDeleteOpen(false)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: "8px" } } }}>
          <DialogTitle sx={{ pb: 1 }}>
            <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: "#111827" }}>
              Delete Applications
            </Typography>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ color: "#6B7280" }}>
              Are you sure you want to delete <strong>{selectedIds.size}</strong> application{selectedIds.size !== 1 ? "s" : ""}? This action cannot be undone.
            </Typography>
            {deleting && <LinearProgress sx={{ mt: 2, borderRadius: "4px" }} />}
            {deleteResult && (
              <Alert severity="info" sx={{ mt: 2, borderRadius: "8px" }}>{deleteResult}</Alert>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={deleting}
              sx={{ borderRadius: "8px", textTransform: "none", color: "#6B7280" }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDelete}
              disabled={deleting}
              sx={{ borderRadius: "8px", textTransform: "none", fontWeight: 600 }}
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
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "0.9rem",
                boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
                color: "#111827",
                "& .MuiAlert-icon": { fontSize: 22, alignSelf: "center" },
              }}
            >
              {snackbar.message}
            </Alert>
          ) : undefined}
        </Snackbar>
      </Box>
    </Box>
  );
}

import { useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Popover,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  AccountTreeOutlined as BranchIcon,
  AssignmentTurnedInOutlined as SubmissionIcon,
  CheckCircleOutlined as ReadIcon,
  Close as CloseIcon,
  DoneAllOutlined as MarkAllIcon,
  NotificationsOutlined as BellIcon,
  RefreshOutlined as RefreshIcon,
  WorkOutlined as JobIcon,
  ChevronLeft as PreviousIcon,
  ChevronRight as NextIcon,
  ClearAllOutlined as ClearReadIcon,
  CloseRounded as ClearItemIcon,
} from "@mui/icons-material";
import { useMsal } from "@azure/msal-react";
import { useNavigate } from "react-router-dom";
import { acquireAccessTokenSilentOrRedirect } from "../../utils/authRecovery";
import { fetchApplications, fetchMyApplications } from "../../utils/careersService";
import type { JobAdminApplication, Submission } from "../../types";
import { editorial, editorialHairline } from "../../theme/editorial";

type NotificationKind = "branch" | "submission" | "form-status" | "job";

interface NotificationItem {
  id: string;
  kind: NotificationKind;
  group: string;
  title: string;
  description: string;
  meta: string;
  timestamp: string;
  submission?: Submission;
  application?: JobAdminApplication;
}

interface NotificationCenterProps {
  userEmail: string;
  isAdmin: boolean;
  submissions: Submission[];
  onViewSubmission: (item: Submission) => void;
  compact?: boolean;
}

const JOB_STATUSES_TO_SURFACE = new Set(["new", "kiv", "shortlisted", "not suitable", "pending", "reviewed"]);
const MAX_ITEMS = 80;
const ITEMS_PER_PAGE = 10;

function sharePointScope(): string {
  const spSiteUrl = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
  return `${new URL(spSiteUrl).origin}/AllSites.Manage`;
}

function readStorageSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function writeStorageSet(key: string, value: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...value].slice(-400)));
}

function normalizeStatusText(value: string | null | undefined): string {
  const status = String(value || "Pending").trim();
  return status || "Pending";
}

function statusKey(value: string | null | undefined): string {
  return normalizeStatusText(value).toLowerCase();
}

function timeValue(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRelativeTime(value: string): string {
  const then = timeValue(value);
  if (!then) return "No date";
  const seconds = Math.max(1, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(then));
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "PM";
}

function toneForKind(kind: NotificationKind): { icon: ReactNode; bg: string; color: string } {
  if (kind === "branch") return { icon: <BranchIcon fontSize="small" />, bg: editorial.purpleWash, color: editorial.pmwPurpleDark };
  if (kind === "job") return { icon: <JobIcon fontSize="small" />, bg: editorial.blueWash, color: editorial.pmwBlueDark };
  return { icon: <SubmissionIcon fontSize="small" />, bg: editorial.paperSoft, color: editorial.ink };
}

function hasUnsetBranch(item: Submission): boolean {
  return (item.layerConfig?.manualBranches?.length ?? 0) > 0 && !item.selectedBranch && statusKey(item.formStatus).includes("pending");
}

function buildSubmissionNotifications(submissions: Submission[], isAdmin: boolean, userEmail: string): NotificationItem[] {
  const lowerEmail = userEmail.toLowerCase();
  const items: NotificationItem[] = [];

  for (const submission of submissions) {
    const timestamp = submission.modifiedAt || submission.submittedAt || "";
    if (isAdmin && hasUnsetBranch(submission)) {
      items.push({
        id: `branch:${submission.listTitle}:${submission.id}:${timestamp}`,
        kind: "branch",
        group: "Branch assignment needed",
        title: submission.title || submission.listTitle,
        description: "Choose a branch before this workflow can continue.",
        meta: `${submission.listTitle} · Ref ${submission.submissionId}`,
        timestamp,
        submission,
      });
    }

    if (isAdmin) {
      const category = submission.meta?.category || "Forms";
      items.push({
        id: `submission:${submission.listTitle}:${submission.id}:${timestamp}`,
        kind: "submission",
        group: `New submissions · ${category}`,
        title: submission.title || submission.listTitle,
        description: `${submission.submittedByEmail || "Unknown submitter"} submitted ${submission.listTitle}.`,
        meta: `${normalizeStatusText(submission.formStatus)} · Ref ${submission.submissionId}`,
        timestamp,
        submission,
      });
      continue;
    }

    if (submission.submittedByEmail.toLowerCase() === lowerEmail) {
      items.push({
        id: `form-status:${submission.listTitle}:${submission.id}:${normalizeStatusText(submission.formStatus)}:${timestamp}`,
        kind: "form-status",
        group: "Form status updates",
        title: submission.title || submission.listTitle,
        description: `Your ${submission.listTitle} item is now ${normalizeStatusText(submission.formStatus)}.`,
        meta: `Ref ${submission.submissionId}`,
        timestamp,
        submission,
      });
    }
  }

  return items;
}

function buildJobNotifications(applications: JobAdminApplication[], isAdmin: boolean): NotificationItem[] {
  return applications
    .filter((application) => isAdmin || JOB_STATUSES_TO_SURFACE.has(statusKey(application.status)))
    .map((application) => {
      const status = normalizeStatusText(application.status);
      const timestamp = application.modifiedAt || application.submittedAt || "";
      return {
        id: `job:${application.id}:${status}:${timestamp}`,
        kind: "job" as const,
        group: isAdmin ? "Job applications" : "Job application updates",
        title: application.jobTitle || "Job application",
        description: isAdmin
          ? `${application.applicantName || "Applicant"} is ${status} for this role.`
          : `Your application is now ${status}.`,
        meta: `${application.submissionRef || "No reference"} · ${application.company || "PMW Group"}`,
        timestamp,
        application,
      };
    });
}

function sortNotifications(items: NotificationItem[]): NotificationItem[] {
  return [...items]
    .sort((a, b) => timeValue(b.timestamp) - timeValue(a.timestamp))
    .slice(0, MAX_ITEMS);
}

function groupNotifications(items: NotificationItem[]): Array<{ group: string; items: NotificationItem[] }> {
  const groups: Array<{ group: string; items: NotificationItem[] }> = [];
  for (const item of items) {
    let group = groups.find((entry) => entry.group === item.group);
    if (!group) {
      group = { group: item.group, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

export default function NotificationCenter({
  userEmail,
  isAdmin,
  submissions,
  onViewSubmission,
  compact = false,
}: NotificationCenterProps) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const navigate = useNavigate();
  const { instance, accounts } = useMsal();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [applications, setApplications] = useState<JobAdminApplication[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [jobError, setJobError] = useState("");
  const [clearedIds, setClearedIds] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(0);
  const [selectedApplication, setSelectedApplication] = useState<JobAdminApplication | null>(null);
  const storageScope = `${isAdmin ? "admin" : "user"}:${userEmail.toLowerCase() || "unknown"}`;
  const readStorageKey = `pmw_hr_notifications_read:${storageScope}`;
  const clearedStorageKey = `pmw_hr_notifications_cleared:${storageScope}`;
  const open = Boolean(anchorEl);
  const allNotifications = sortNotifications([
    ...buildSubmissionNotifications(submissions, isAdmin, userEmail),
    ...buildJobNotifications(applications, isAdmin),
  ]);
  const notifications = allNotifications.filter((item) => !clearedIds.has(item.id));
  const unreadCount = notifications.filter((item) => !readIds.has(item.id)).length;
  const clearableReadCount = notifications.filter((item) => readIds.has(item.id)).length;
  const totalPages = Math.max(1, Math.ceil(notifications.length / ITEMS_PER_PAGE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageStart = currentPage * ITEMS_PER_PAGE;
  const pageItems = notifications.slice(pageStart, pageStart + ITEMS_PER_PAGE);
  const grouped = groupNotifications(pageItems);

  useEffect(() => {
    setReadIds(readStorageSet(readStorageKey));
    setClearedIds(readStorageSet(clearedStorageKey));
    setPage(0);
  }, [readStorageKey, clearedStorageKey]);

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(totalPages - 1);
    }
  }, [page, totalPages]);

  async function loadJobNotifications() {
    const account = instance.getActiveAccount() ?? accounts[0];
    if (!account || !userEmail) {
      setApplications([]);
      return;
    }

    setLoadingJobs(true);
    setJobError("");
    try {
      const accessToken = await acquireAccessTokenSilentOrRedirect(instance, {
        scopes: [sharePointScope()],
        account,
      });
      const data = isAdmin
        ? await fetchApplications({ accessToken }, { limit: 80 })
        : await fetchMyApplications(userEmail, { accessToken }, { limit: 80 });
      setApplications(data);
    } catch (error) {
      setApplications([]);
      setJobError(error instanceof Error ? error.message : "Could not load job notifications.");
    } finally {
      setLoadingJobs(false);
    }
  }

  useEffect(() => {
    void loadJobNotifications();
  }, [instance, accounts, isAdmin, userEmail]);

  function markRead(ids: string[]) {
    setReadIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.add(id));
      writeStorageSet(readStorageKey, next);
      return next;
    });
  }

  function clearRead(ids: string[]) {
    const clearableIds = ids.filter((id) => readIds.has(id));
    if (clearableIds.length === 0) return;

    setClearedIds((current) => {
      const next = new Set(current);
      clearableIds.forEach((id) => next.add(id));
      writeStorageSet(clearedStorageKey, next);
      return next;
    });
  }

  function handleOpen(event: MouseEvent<HTMLElement>) {
    setAnchorEl(event.currentTarget);
  }

  function handleClose() {
    setAnchorEl(null);
  }

  function handleMarkAllRead() {
    markRead(notifications.map((item) => item.id));
  }

  function handleClearRead() {
    clearRead(notifications.map((item) => item.id));
  }

  function handleClearItem(event: MouseEvent<HTMLButtonElement>, item: NotificationItem) {
    event.stopPropagation();
    if (!readIds.has(item.id)) return;
    clearRead([item.id]);
  }

  function handleNotificationClick(item: NotificationItem) {
    markRead([item.id]);
    if (item.submission) {
      handleClose();
      onViewSubmission(item.submission);
      return;
    }
    if (item.application) {
      setSelectedApplication(item.application);
    }
  }

  function handleApplicationRoute() {
    setSelectedApplication(null);
    handleClose();
    navigate(isAdmin ? "/admin/career/applications" : "/career-portal");
  }

  const buttonSx = compact
    ? {
        borderRadius: "10px",
        color: editorial.pmwBlueDark,
        backgroundColor: editorial.blueWash,
        border: `1px solid ${editorial.pmwBlueSoft}`,
        transition: "background-color 0.2s ease, border-color 0.2s ease, transform 0.2s ease",
        "&:hover": { backgroundColor: editorial.pmwBlueSoft, borderColor: editorial.pmwBlue },
        "&:active": { transform: "scale(0.96)" },
        "&:focus-visible": { outline: `3px solid ${editorial.pmwBlueSoft}`, outlineOffset: 2 },
      }
    : {
        width: 46,
        height: 46,
        borderRadius: "12px",
        color: editorial.pmwBlueDark,
        backgroundColor: editorial.white,
        border: `1px solid ${editorial.pmwBlueSoft}`,
        transition: "background-color 0.2s ease, border-color 0.2s ease, transform 0.2s ease",
        "&:hover": { backgroundColor: editorial.blueWash, borderColor: editorial.pmwBlue },
        "&:active": { transform: "scale(0.96)" },
        "&:focus-visible": { outline: `3px solid ${editorial.pmwBlueSoft}`, outlineOffset: 2 },
      } as const;

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          aria-label={`${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
          onClick={handleOpen}
          size="small"
          sx={buttonSx}
        >
          <Badge
            badgeContent={unreadCount}
            max={99}
            color="error"
            sx={{
              "& .MuiBadge-badge": {
                minWidth: 18,
                height: 18,
                px: 0.5,
                fontSize: "0.68rem",
                fontWeight: 900,
                fontVariantNumeric: "tabular-nums",
                border: `2px solid ${compact ? editorial.blueWash : editorial.white}`,
              },
            }}
          >
            <BellIcon sx={{ fontSize: compact ? 22 : 21 }} />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        slotProps={{
          paper: {
            sx: {
              width: { xs: "calc(100vw - 24px)", sm: 430 },
              maxHeight: { xs: "calc(100vh - 96px)", sm: 620 },
              mt: 1,
              borderRadius: "12px",
              border: editorialHairline,
              boxShadow: "0 18px 42px rgba(16, 16, 16, 0.16)",
              overflow: "hidden",
            },
          },
        }}
      >
        <Box sx={{ p: 2, pb: 1.5, backgroundColor: editorial.white }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
            <Box sx={{ minWidth: 0, flex: "1 1 180px" }}>
              <Typography variant="h6" sx={{ fontWeight: 900, color: editorial.ink, lineHeight: 1.15 }}>
                Notifications
              </Typography>
              <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 700 }}>
                {isAdmin ? "Admin workspace updates" : "Your forms and applications"}
              </Typography>
            </Box>
            <Tooltip title="Refresh job notifications">
              <span>
                <IconButton
                  aria-label="Refresh job notifications"
                  onClick={() => void loadJobNotifications()}
                  disabled={loadingJobs}
                  size="small"
                  sx={{ minWidth: 40, minHeight: 40 }}
                >
                  {loadingJobs ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
            <Button
              size="small"
              startIcon={<MarkAllIcon />}
              onClick={handleMarkAllRead}
              disabled={notifications.length === 0 || unreadCount === 0}
              sx={{ minHeight: 40, borderRadius: "8px", whiteSpace: "nowrap" }}
            >
              Mark all read
            </Button>
            <Button
              size="small"
              startIcon={<ClearReadIcon />}
              onClick={handleClearRead}
              disabled={clearableReadCount === 0}
              sx={{ minHeight: 40, borderRadius: "8px", whiteSpace: "nowrap" }}
            >
              Clear read
            </Button>
          </Stack>
        </Box>
        <Divider />

        <Box sx={{ maxHeight: isPhone ? "calc(100vh - 205px)" : 486, overflowY: "auto", backgroundColor: editorial.appSurface }}>
          {jobError && (
            <Alert severity="warning" sx={{ m: 1.5, borderRadius: "8px" }}>
              {jobError}
            </Alert>
          )}

          {grouped.length === 0 && !loadingJobs ? (
            <Box sx={{ px: 3, py: 5, textAlign: "center", backgroundColor: editorial.white }}>
              <ReadIcon sx={{ color: editorial.success, fontSize: 34, mb: 1 }} />
              <Typography variant="body1" sx={{ fontWeight: 900, color: editorial.ink }}>
                Nothing needs attention
              </Typography>
              <Typography variant="body2" sx={{ color: editorial.muted, mt: 0.5 }}>
                New form and job updates will appear here.
              </Typography>
            </Box>
          ) : (
            grouped.map((group) => (
              <Box key={group.group} sx={{ py: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", px: 2, py: 1 }}>
                  <Typography variant="caption" sx={{ color: editorial.muted, fontWeight: 900 }}>
                    {group.group}
                  </Typography>
                  <Chip
                    label={group.items.length}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: "0.68rem",
                      fontWeight: 900,
                      fontVariantNumeric: "tabular-nums",
                      backgroundColor: editorial.white,
                    }}
                  />
                </Stack>
                <Stack spacing={0.75} sx={{ px: 1 }}>
                  {group.items.map((item) => {
                    const unread = !readIds.has(item.id);
                    const tone = toneForKind(item.kind);
                    return (
                      <Box
                        key={item.id}
                        sx={{
                          width: "100%",
                          borderRadius: "8px",
                          display: "grid",
                          gridTemplateColumns: unread ? "40px minmax(0, 1fr)" : "40px minmax(0, 1fr) 40px",
                          gap: 1.25,
                          alignItems: "center",
                          p: 1.25,
                          backgroundColor: unread ? editorial.blueWash : editorial.white,
                          boxShadow: unread ? "0 0 0 1px rgba(0, 120, 212, 0.22)" : "0 0 0 1px rgba(214, 220, 229, 0.78)",
                          transition: "background-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
                          "&:hover": {
                            backgroundColor: unread ? editorial.pmwBlueSoft : editorial.paperSoft,
                            boxShadow: "0 0 0 1px rgba(0, 120, 212, 0.36)",
                          },
                          "&:active": {
                            transform: "scale(0.99)",
                          },
                          "&:focus-visible": {
                            outline: `3px solid ${editorial.pmwBlueSoft}`,
                            outlineOffset: 2,
                          },
                        }}
                      >
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: "8px",
                            backgroundColor: tone.bg,
                            color: tone.color,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                            flexShrink: 0,
                          }}
                        >
                          {tone.icon}
                          {unread && (
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: 999,
                                backgroundColor: editorial.error,
                                position: "absolute",
                                top: 5,
                                right: 5,
                              }}
                            />
                          )}
                        </Box>
                        <Box
                          component="button"
                          type="button"
                          onClick={() => handleNotificationClick(item)}
                          sx={{
                            minWidth: 0,
                            border: "none",
                            backgroundColor: "transparent",
                            p: 0,
                            textAlign: "left",
                            cursor: "pointer",
                            "&:focus-visible": {
                              outline: `3px solid ${editorial.pmwBlueSoft}`,
                              outlineOffset: 2,
                              borderRadius: "6px",
                            },
                          }}
                        >
                          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                            <Typography
                              variant="body2"
                              sx={{
                                color: editorial.ink,
                                fontWeight: unread ? 900 : 800,
                                lineHeight: 1.25,
                                flex: 1,
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {item.title}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{ color: editorial.softMuted, fontWeight: 800, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}
                            >
                              {formatRelativeTime(item.timestamp)}
                            </Typography>
                          </Stack>
                          <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 700, mt: 0.25, lineHeight: 1.35 }}>
                            {item.description}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              display: "block",
                              color: editorial.softMuted,
                              fontWeight: 800,
                              mt: 0.35,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.meta}
                          </Typography>
                        </Box>
                        {!unread && (
                          <Tooltip title="Clear this read notification">
                            <IconButton
                              aria-label="Clear this read notification"
                              onClick={(event) => handleClearItem(event, item)}
                              size="small"
                              sx={{
                                width: 40,
                                height: 40,
                                color: editorial.softMuted,
                                "&:hover": {
                                  color: editorial.error,
                                  backgroundColor: "rgba(198, 40, 40, 0.08)",
                                },
                              }}
                            >
                              <ClearItemIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            ))
          )}
        </Box>
        {notifications.length > ITEMS_PER_PAGE && (
          <>
            <Divider />
            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: "center",
                justifyContent: "space-between",
                px: 1.5,
                py: 1,
                backgroundColor: editorial.white,
              }}
            >
              <Typography variant="caption" sx={{ color: editorial.muted, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
                {pageStart + 1}-{Math.min(pageStart + ITEMS_PER_PAGE, notifications.length)} of {notifications.length}
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                <Tooltip title="Previous page">
                  <span>
                    <IconButton
                      aria-label="Previous notification page"
                      onClick={() => setPage((value) => Math.max(0, value - 1))}
                      disabled={currentPage === 0}
                      size="small"
                      sx={{ width: 40, height: 40 }}
                    >
                      <PreviousIcon />
                    </IconButton>
                  </span>
                </Tooltip>
                <Typography variant="caption" sx={{ color: editorial.ink, fontWeight: 900, fontVariantNumeric: "tabular-nums", minWidth: 56, textAlign: "center" }}>
                  {currentPage + 1} / {totalPages}
                </Typography>
                <Tooltip title="Next page">
                  <span>
                    <IconButton
                      aria-label="Next notification page"
                      onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))}
                      disabled={currentPage >= totalPages - 1}
                      size="small"
                      sx={{ width: 40, height: 40 }}
                    >
                      <NextIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            </Stack>
          </>
        )}
      </Popover>

      <Dialog
        open={Boolean(selectedApplication)}
        onClose={() => setSelectedApplication(null)}
        fullWidth
        maxWidth="sm"
        slotProps={{
          paper: {
            sx: {
              borderRadius: isPhone ? 0 : "12px",
              border: isPhone ? 0 : editorialHairline,
              boxShadow: "0 18px 42px rgba(16, 16, 16, 0.16)",
            },
          },
        }}
      >
        <DialogTitle sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 40px", gap: 2, alignItems: "start", pb: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Chip
              label={normalizeStatusText(selectedApplication?.status)}
              size="small"
              sx={{ mb: 1, backgroundColor: editorial.blueWash, color: editorial.pmwBlueDark, fontWeight: 900 }}
            />
            <Typography variant="h5" sx={{ fontWeight: 900, color: editorial.ink, textWrap: "balance" }}>
              {selectedApplication?.jobTitle || "Job application"}
            </Typography>
            <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 700 }}>
              {selectedApplication?.submissionRef || "No reference"}
            </Typography>
          </Box>
          <IconButton aria-label="Close application details" onClick={() => setSelectedApplication(null)} sx={{ width: 40, height: 40 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.25}>
            <Box sx={{ display: "grid", gridTemplateColumns: "40px minmax(0, 1fr)", gap: 1.25, alignItems: "center" }}>
              <Box sx={{ width: 40, height: 40, borderRadius: "8px", backgroundColor: editorial.purpleWash, color: editorial.pmwPurpleDark, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>
                {initials(selectedApplication?.applicantName || selectedApplication?.applicantEmail || "PM")}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ color: editorial.ink, fontWeight: 900 }}>
                  {selectedApplication?.applicantName || "Applicant"}
                </Typography>
                <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selectedApplication?.applicantEmail || "No email"}
                </Typography>
              </Box>
            </Box>
            <Divider />
            {[
              ["Company", selectedApplication?.company || "PMW Group"],
              ["Phone", selectedApplication?.applicantPhone || "Not provided"],
              ["Submitted", selectedApplication?.submittedAt ? formatRelativeTime(selectedApplication.submittedAt) : "No date"],
              ["Last update", selectedApplication?.modifiedAt ? formatRelativeTime(selectedApplication.modifiedAt) : "No update date"],
            ].map(([label, value]) => (
              <Box key={label} sx={{ display: "grid", gridTemplateColumns: "120px minmax(0, 1fr)", gap: 1.5 }}>
                <Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 900 }}>
                  {label}
                </Typography>
                <Typography variant="body2" sx={{ color: editorial.ink, fontWeight: 700, minWidth: 0 }}>
                  {value}
                </Typography>
              </Box>
            ))}
            <Button variant="contained" startIcon={<JobIcon />} onClick={handleApplicationRoute} sx={{ alignSelf: "flex-start", mt: 1, borderRadius: "8px" }}>
              {isAdmin ? "Open applications" : "Open career portal"}
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}

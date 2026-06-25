import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Badge,
  Card,
  CardContent,
  Button,
  Chip,
  Grid,
  Container,
  Paper,
  TextField,
  InputAdornment,
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
import { keyframes } from "@mui/material/styles";
import {
  ArrowBack,
  ArrowForward,
  LocationOn,
  CalendarToday,
  People,
  AccessTime,
  Search as SearchIcon,
  Close,
  AutoAwesome,
  AssignmentTurnedIn,
  TrendingUp,
  WorkOutlined,
  FilterList,
  Business,
  Description,
} from "@mui/icons-material";
import DOMPurify from "dompurify";
import { useMsal } from "@azure/msal-react";
import { fetchCareersPortalData, fetchMyApplications } from "../utils/careersService";
import { acquireAccessTokenSilentOrRedirect, fetchWithAuthRecovery } from "../utils/authRecovery";
import CareerPortalHeader from "../components/careers/CareerPortalHeader";
import CareerPortalCarousel from "../components/careers/CareerPortalCarousel";
import {
  CareerEmptyState,
  CareerErrorState,
  CareerMetricPill,
  careerActionButtonSx,
  careerIconButtonSx,
  careerPageSx,
  careerSearchFieldSx,
  careerToolbarSx,
  getCareerErrorMessage,
} from "../components/careers/careerUi";
import type { JobListing, JobAdminApplication, CareerPortalCard } from "../types";
import { editorial, editorialShadow } from "../theme/editorial";

const fadeInUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const scaleIn = keyframes`
  from {
    opacity: 0;
    transform: scale(0.96) translateY(12px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
`;

const reduceMotionSx = {
  "@media (prefers-reduced-motion: reduce)": {
    animation: "none",
    transition: "none",
    transform: "none",
    "&:hover": {
      transform: "none",
    },
    "&:active": {
      transform: "none",
    },
  },
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

function staggerDelay(index: number, step = 55, max = 440): string {
  return `${Math.min(index * step, max)}ms`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getEmploymentTypeColor(type: string): string {
  const map: Record<string, string> = {
    "Full-time": "#101010",
    "Part-time": "#5F646D",
    Contract: "#805800",
    Internship: "#107C10",
  };
  return map[type] || "#5F646D";
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

function JobCard({
  job,
  onSelect,
  isApplied,
  index,
}: {
  job: JobListing;
  onSelect: (job: JobListing) => void;
  isApplied: boolean;
  index: number;
}) {
  const openJob = () => onSelect(job);

  return (
    <Card
      sx={{
        borderRadius: "12px",
        position: "relative",
        overflow: "hidden",
        height: "100%",
        border: `1px solid ${editorial.border}`,
        boxShadow: "none",
        transition: "transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease, opacity 0.22s ease",
        animation: `${fadeInUp} 0.42s ease both`,
        animationDelay: staggerDelay(index),
        cursor: "pointer",
        opacity: isApplied ? 0.82 : 1,
        transform: "translateY(0)",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${editorial.pmwBlue}, ${editorial.pmwPurple})`,
          transform: "scaleX(0)",
          transformOrigin: "left",
          transition: "transform 0.24s ease",
        },
        "&:hover": {
          transform: "translateY(-3px)",
          borderColor: editorial.pmwBlue,
          boxShadow: editorialShadow,
          opacity: 1,
          "&::before": {
            transform: "scaleX(1)",
          },
          "& .job-card-title": {
            color: editorial.pmwBlueDark,
          },
          "& .job-card-cta": {
            color: editorial.pmwBlueDark,
            transform: "translateX(3px)",
          },
          "& .job-card-icon": {
            color: editorial.pmwBlue,
            transform: "scale(1.08)",
          },
        },
        "&:active": {
          transform: "translateY(-1px) scale(0.96)",
        },
        "&:focus-visible": {
          outline: `3px solid ${editorial.pmwBlueSoft}`,
          outlineOffset: 3,
        },
        ...reduceMotionSx,
      }}
      onClick={openJob}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openJob();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`View ${job.title}`}
    >
      <CardContent sx={{ p: { xs: 2.25, md: 2.75 }, "&:last-child": { pb: { xs: 2.25, md: 2.75 } } }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(230px, 280px)" },
            gap: { xs: 2, md: 3 },
            alignItems: { xs: "stretch", md: "center" },
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.25, flexWrap: "wrap", mb: 1.25 }}>
              <Typography
                className="job-card-title"
                variant="h6"
                sx={{
                  flex: "1 1 320px",
                  minWidth: 0,
                  fontWeight: 800,
                  color: editorial.ink,
                  fontSize: { xs: "1.08rem", md: "1.2rem" },
                  lineHeight: 1.25,
                  wordBreak: "break-word",
                  transition: "color 0.2s ease",
                }}
              >
                {job.title}
              </Typography>
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", justifyContent: { xs: "flex-start", md: "flex-end" } }}>
                {job.company && (
                  <Chip
                    label={job.company}
                    size="small"
                    sx={{
                      backgroundColor: editorial.blueWash,
                      color: editorial.ink,
                      fontWeight: 800,
                      fontSize: "0.7rem",
                      borderRadius: "999px",
                      border: `1px solid ${editorial.border}`,
                    }}
                  />
                )}
                <Chip
                  label={job.department}
                  size="small"
                  sx={{
                    backgroundColor: editorial.purpleWash,
                    color: editorial.pmwPurpleDark,
                    fontWeight: 800,
                    fontSize: "0.7rem",
                    borderRadius: "999px",
                    border: `1px solid ${editorial.pmwPurpleSoft}`,
                  }}
                />
                {isApplied && (
                  <Chip
                    label="Already Submitted"
                    size="small"
                    sx={{
                      backgroundColor: "#E6F4EA",
                      color: "#34A853",
                      fontWeight: 700,
                      fontSize: "0.65rem",
                      borderRadius: "999px",
                    }}
                  />
                )}
              </Box>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1, sm: 1.75 }, flexWrap: "wrap" }}>
              {job.location && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
                  <LocationOn className="job-card-icon" sx={{ fontSize: 15, color: editorial.muted, transition: "transform 0.2s ease, color 0.2s ease" }} />
                  <Typography variant="body2" sx={{ color: editorial.muted, fontSize: "0.82rem", overflowWrap: "anywhere" }}>
                    {job.location}
                  </Typography>
                </Box>
              )}
              {job.closingDate && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <CalendarToday className="job-card-icon" sx={{ fontSize: 14, color: editorial.softMuted, transition: "transform 0.2s ease, color 0.2s ease" }} />
                  <Typography variant="caption" sx={{ color: editorial.softMuted, fontSize: "0.78rem" }}>
                    Closing {formatDate(job.closingDate)}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>

          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "row", md: "column" },
              alignItems: { xs: "center", md: "flex-end" },
              justifyContent: { xs: "space-between", md: "center" },
              gap: { xs: 1.25, md: 1 },
              minWidth: 0,
              pt: { xs: 1.5, md: 0 },
              pl: { xs: 0, md: 2.75 },
              borderTop: { xs: `1px solid ${editorial.border}`, md: "none" },
              borderLeft: { xs: "none", md: `1px solid ${editorial.border}` },
              flexWrap: { xs: "wrap", md: "nowrap" },
            }}
          >
            <Chip
              label={job.employmentType}
              size="small"
              sx={{
                backgroundColor: `${getEmploymentTypeColor(job.employmentType)}14`,
                color: getEmploymentTypeColor(job.employmentType),
                fontWeight: 800,
                fontSize: "0.7rem",
                borderRadius: "999px",
                flexShrink: 0,
              }}
            />
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
              <People className="job-card-icon" sx={{ fontSize: 14, color: editorial.softMuted, transition: "transform 0.2s ease, color 0.2s ease" }} />
              <Typography variant="caption" sx={{ color: editorial.softMuted, fontSize: "0.78rem", whiteSpace: "nowrap" }}>
                {job.applicationCount} {job.applicationCount === 1 ? "applicant" : "applicants"}
              </Typography>
            </Box>
            <Box
              className="job-card-cta"
              sx={{
                color: editorial.ink,
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                fontWeight: 800,
                fontSize: "0.82rem",
                whiteSpace: "nowrap",
                transition: "transform 0.2s ease, color 0.2s ease",
              }}
            >
              View role
              <ArrowForward sx={{ fontSize: 16 }} />
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function PortalWelcomePanel({
  totalJobs,
  visibleJobs,
  applicationsCount,
  viewingApplications,
  portalCards,
  onViewApplications,
  onPortalCardTarget,
}: {
  totalJobs: number;
  visibleJobs: number;
  applicationsCount: number;
  viewingApplications: boolean;
  portalCards: CareerPortalCard[];
  onViewApplications: () => void;
  onPortalCardTarget: (card: CareerPortalCard) => void;
}) {
  const stats = [
    { label: "Open roles", value: totalJobs, icon: <WorkOutlined />, tone: "blue" as const },
    {
      label: viewingApplications ? "Tracked apps" : "Visible now",
      value: viewingApplications ? applicationsCount : visibleJobs,
      icon: <TrendingUp />,
      tone: "purple" as const,
    },
    { label: "My applications", value: applicationsCount, icon: <AssignmentTurnedIn />, tone: "success" as const },
  ];

  return (
    <Paper
      component="section"
      sx={{
        p: { xs: 2.5, md: 3 },
        mb: 3,
        borderRadius: "12px",
        border: `1px solid ${editorial.pmwBlueSoft}`,
        boxShadow: "none",
        background: "rgba(255, 255, 255, 0.9)",
        position: "relative",
        overflow: "hidden",
        animation: `${fadeInUp} 0.48s ease both`,
        ...reduceMotionSx,
      }}
    >
      <Box
        sx={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(320px, 0.92fr)" },
          gap: { xs: 2.5, md: 3 },
          alignItems: "center",
        }}
      >
        <Box sx={{ order: { xs: 2, md: 1 } }}>
          <Chip
            icon={<AutoAwesome sx={{ fontSize: 16 }} />}
            label="Welcome back"
            size="small"
            sx={{
              mb: 1.5,
              borderRadius: "999px",
              backgroundColor: editorial.blueWash,
              color: editorial.pmwBlueDark,
              fontWeight: 800,
              border: `1px solid ${editorial.pmwBlueSoft}`,
              "& .MuiChip-icon": { color: editorial.pmwBlue },
            }}
          />
          <Typography
            variant="h4"
            component="h2"
            sx={{
              color: editorial.ink,
              fontWeight: 800,
              fontSize: { xs: "1.75rem", sm: "2.2rem" },
              lineHeight: 1.08,
              mb: 1,
              letterSpacing: 0,
              textWrap: "balance",
            }}
          >
            Internal advancement starts here
          </Typography>
          <Typography variant="body1" sx={{ color: editorial.ink, maxWidth: 640, mb: 2.25 }}>
            Explore roles built for PMW talent and keep your application journey in view.
          </Typography>
          {applicationsCount > 0 && (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button
                variant={viewingApplications ? "contained" : "outlined"}
                startIcon={viewingApplications ? <ArrowBack /> : <AssignmentTurnedIn />}
                onClick={onViewApplications}
                sx={{
                  ...careerActionButtonSx,
                  fontWeight: 700,
                  borderColor: viewingApplications ? editorial.pmwBlue : editorial.pmwBlueSoft,
                  backgroundColor: viewingApplications ? editorial.pmwBlue : "#ffffff",
                  color: viewingApplications ? "#ffffff" : editorial.pmwBlueDark,
                  "&:hover": {
                    transform: "translateY(-2px)",
                    borderColor: editorial.pmwBlueDark,
                    backgroundColor: viewingApplications ? editorial.pmwBlueDark : editorial.blueWash,
                    boxShadow: "none",
                  },
                  ...reduceMotionSx,
                }}
              >
                {viewingApplications ? "Back to careers" : "My applications"}
              </Button>
            </Box>
          )}
        </Box>
        <Box sx={{ order: { xs: 1, md: 2 }, minWidth: 0 }}>
          <CareerPortalCarousel cards={portalCards} onCardTarget={onPortalCardTarget} />
        </Box>
      </Box>

      <Box
        sx={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
          gap: 1,
          mt: { xs: 2, md: 2.5 },
        }}
      >
        {stats.map((stat) => (
          <CareerMetricPill
            key={stat.label}
            icon={stat.icon}
            label={stat.label}
            value={stat.value}
            tone={stat.tone}
          />
        ))}
      </Box>
    </Paper>
  );
}

function CareersLoadingSkeleton() {
  return (
    <>
      <Paper
        component="section"
        sx={{
          p: { xs: 2.5, md: 3 },
          mb: 3,
          borderRadius: "8px",
          border: "1px solid rgba(17, 24, 39, 0.08)",
          boxShadow: "0 10px 30px rgba(17, 24, 39, 0.06)",
          background: "linear-gradient(135deg, #FFFFFF 0%, #F8FBFF 48%, #F7F7FF 100%)",
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(320px, 0.92fr)" },
            gap: { xs: 2.5, md: 3 },
            alignItems: "center",
          }}
        >
          <Box sx={{ order: { xs: 2, md: 1 } }}>
            <Skeleton variant="rounded" width={124} height={26} sx={{ borderRadius: "8px", mb: 1.5 }} />
            <Skeleton variant="text" width="72%" height={38} />
            <Skeleton variant="text" width="88%" height={24} sx={{ mb: 2 }} />
            <Skeleton variant="rounded" width={150} height={38} sx={{ borderRadius: "8px" }} />
          </Box>
          <Box sx={{ order: { xs: 1, md: 2 }, minWidth: 0 }}>
            <Skeleton variant="rounded" width="100%" height={280} sx={{ borderRadius: "8px" }} />
          </Box>
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" }, gap: 1, mt: { xs: 2, md: 2.5 } }}>
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} variant="rounded" height={74} sx={{ borderRadius: "8px" }} />
          ))}
        </Box>
      </Paper>

      <Paper
        sx={{
          p: 2,
          mb: 3,
          borderRadius: "8px",
          border: "1px solid rgba(17, 24, 39, 0.08)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, width: "100%", flexWrap: "wrap" }}>
          <Skeleton variant="rounded" height={40} sx={{ borderRadius: "8px", flex: "1 1 360px", minWidth: { xs: "100%", sm: 320 } }} />
          <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: "8px" }} />
          <Skeleton variant="rounded" width={96} height={32} sx={{ borderRadius: "8px" }} />
        </Box>
      </Paper>

      <Grid container spacing={2.5}>
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={item}>
            <Paper
              sx={{
                p: 3,
                borderRadius: "8px",
                border: "1px solid rgba(17, 24, 39, 0.08)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1.5, mb: 1.5 }}>
                <Skeleton variant="text" width="64%" height={30} />
                <Skeleton variant="rounded" width={84} height={24} sx={{ borderRadius: "8px" }} />
              </Box>
              <Box sx={{ display: "flex", gap: 0.5, mb: 2 }}>
                <Skeleton variant="rounded" width={82} height={24} sx={{ borderRadius: "8px" }} />
                <Skeleton variant="rounded" width={116} height={24} sx={{ borderRadius: "8px" }} />
              </Box>
              <Skeleton variant="text" width="72%" height={20} />
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, mt: 1 }}>
                <Skeleton variant="text" width="42%" height={18} />
                <Skeleton variant="text" width="34%" height={18} />
              </Box>
              <Skeleton variant="text" width={88} height={22} sx={{ mt: 2.25 }} />
            </Paper>
          </Grid>
        ))}
      </Grid>
    </>
  );
}

function JobDetailDialog({
  job,
  open,
  onClose,
  isApplied,
  isAdmin,
  onTestSubmit,
}: {
  job: JobListing | null;
  open: boolean;
  onClose: () => void;
  isApplied: boolean;
  isAdmin: boolean;
  onTestSubmit: (jobId: string) => void;
}) {
  const navigate = useNavigate();

  if (!job) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: "rgba(17, 24, 39, 0.36)",
            backdropFilter: "blur(3px)",
          },
        },
        paper: {
          sx: {
            borderRadius: "12px",
            maxHeight: "90vh",
            overflow: "hidden",
            border: `1px solid ${editorial.pmwBlueSoft}`,
            animation: `${scaleIn} 0.24s ease both`,
            ...reduceMotionSx,
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          pb: 2,
          pr: 8,
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#FFFFFF",
          borderBottom: `1px solid ${editorial.pmwBlueSoft}`,
          ...reduceMotionSx,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1 }}>
          <Typography variant="h5" component="div" sx={{ fontWeight: 800, color: editorial.ink, fontSize: "1.25rem", textWrap: "balance" }}>
            {job.title}
          </Typography>
          {isApplied && (
            <Chip label="Already Submitted" size="small" sx={{ backgroundColor: "#E6F4EA", color: "#34A853", fontWeight: 600, borderRadius: "8px", fontSize: "0.7rem" }} />
          )}
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
          {job.company && (
            <Chip
              icon={<Business sx={{ fontSize: 14 }} />}
              label={job.company}
              size="small"
              sx={{ backgroundColor: editorial.blueWash, color: editorial.pmwBlueDark, fontWeight: 800, borderRadius: "8px", "& .MuiChip-icon": { color: editorial.pmwBlue } }}
            />
          )}
          <Chip
            label={job.department}
            size="small"
            sx={{ backgroundColor: editorial.pmwPurple, color: "#fff", fontWeight: 800, borderRadius: "8px" }}
          />
          <Chip
            label={job.employmentType}
            size="small"
            sx={{
              backgroundColor: `${getEmploymentTypeColor(job.employmentType)}14`,
              color: getEmploymentTypeColor(job.employmentType),
              fontWeight: 600,
              borderRadius: "8px",
            }}
          />
          {job.location && (
            <Typography variant="caption" sx={{ color: editorial.muted, display: "flex", alignItems: "center", gap: 0.3 }}>
              <LocationOn sx={{ fontSize: 14 }} /> {job.location}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
          {job.closingDate && (
            <Typography variant="caption" sx={{ color: editorial.muted, display: "flex", alignItems: "center", gap: 0.3 }}>
              <CalendarToday sx={{ fontSize: 12 }} /> Closing {formatDate(job.closingDate)}
            </Typography>
          )}
          <Typography variant="caption" sx={{ color: editorial.muted, display: "flex", alignItems: "center", gap: 0.3 }}>
            <People sx={{ fontSize: 12 }} /> {job.applicationCount} {job.applicationCount === 1 ? "applicant" : "applicants"}
          </Typography>
        </Box>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{
            ...careerIconButtonSx,
            position: "absolute",
            right: 12,
            top: 12,
            zIndex: 1,
            color: editorial.muted,
            "&:hover": {
              transform: "rotate(90deg)",
              backgroundColor: editorial.blueWash,
            },
            ...reduceMotionSx,
          }}
        >
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ py: 3 }}>
        {job.jobDescription ? (
          <Box
            sx={{
              "& p": { mb: 1.5, lineHeight: 1.7, color: editorial.ink, fontSize: "0.9rem" },
              "& ul, & ol": { pl: 3, mb: 1.5 },
              "& li": { mb: 0.5, lineHeight: 1.7, color: editorial.ink, fontSize: "0.9rem" },
              "& h1, & h2, & h3, & h4": { mt: 2, mb: 1, fontWeight: 800, color: editorial.ink },
              "& strong": { fontWeight: 600 },
              "& a": {
                color: editorial.pmwBlueDark,
                textDecoration: "none",
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "1px 6px",
                borderRadius: "6px",
                backgroundColor: editorial.blueWash,
                border: "1px solid rgba(0,120,212,0.15)",
                transition: "transform 0.18s ease, background-color 0.18s ease",
                "&:hover": { backgroundColor: editorial.pmwBlueSoft, textDecoration: "underline", transform: "translateY(-1px)" },
              },
              "& br": { display: "block", content: '""', mb: 0.5 },
            }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.jobDescription) }}
          />
        ) : (
          <Typography variant="body2" sx={{ color: editorial.muted }}>
            No description provided.
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1, backgroundColor: editorial.blueSoft }}>
        <Button
          startIcon={<Close />}
          onClick={onClose}
          sx={{
            ...careerActionButtonSx,
            color: editorial.muted,
            fontWeight: 700,
            "&:hover": { transform: "translateY(-1px)", backgroundColor: editorial.white },
            ...reduceMotionSx,
          }}
        >
          Close
        </Button>
        {isApplied && isAdmin ? (
          <Button
            variant="outlined"
            onClick={() => onTestSubmit(job.id)}
            sx={{
              borderRadius: "8px",
              textTransform: "none",
              fontWeight: 600,
              borderColor: "#E67635",
              color: "#E67635",
              px: 3,
              transition: "transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease",
              "&:hover": { borderColor: "#D4621A", backgroundColor: "rgba(230, 118, 53, 0.06)", transform: "translateY(-2px)", boxShadow: "0 8px 18px rgba(230, 118, 53, 0.16)" },
              "&:active": { transform: "translateY(0) scale(0.98)" },
              ...reduceMotionSx,
            }}
          >
            Override Apply
          </Button>
        ) : isApplied ? (
          <Button
            variant="contained"
            disabled
            sx={{
              ...careerActionButtonSx,
              fontWeight: 600,
              px: 4,
              backgroundColor: "#9CA3AF",
            }}
          >
            Already Submitted
          </Button>
        ) : (
          <Button
            variant="contained"
            endIcon={<ArrowForward />}
            onClick={() => navigate(`/career-portal/${job.id}/apply`)}
            sx={{
              ...careerActionButtonSx,
              backgroundColor: editorial.pmwBlue,
              fontWeight: 800,
              px: 4,
              "&:hover": {
                backgroundColor: editorial.pmwBlueDark,
                transform: "translateY(-2px)",
                boxShadow: "0 8px 18px rgba(0, 120, 212, 0.24)",
              },
              ...reduceMotionSx,
            }}
          >
            Apply now
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default function CareersPage() {
  const { instance, accounts } = useMsal();
  const navigate = useNavigate();
  const location = useLocation();
  const activeAccount = instance.getActiveAccount() ?? accounts[0];
  const userEmail = activeAccount?.username?.toLowerCase() || "";
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [portalCards, setPortalCards] = useState<CareerPortalCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [showJobAdvancedFilters, setShowJobAdvancedFilters] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobListing | null>(null);
  const [selectedApp, setSelectedApp] = useState<JobAdminApplication | null>(null);
  const [myApps, setMyApps] = useState<JobAdminApplication[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [appliedFilter, setAppliedFilter] = useState("all"); // "all" | "applied" | "unapplied"
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

  const isJobApplied = (jobId: string) => appliedJobIds.has(jobId);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const myApplications = userEmail && activeAccount
          ? acquireAccessTokenSilentOrRedirect(instance, {
              scopes: [`${new URL(import.meta.env.VITE_SP_SITE_URL || "https://placeholder.sharepoint.com").origin}/AllSites.Manage`],
              account: activeAccount,
            })
              .then((accessToken) => fetchMyApplications(userEmail, { accessToken }))
              .catch(() => [] as JobAdminApplication[])
          : Promise.resolve([] as JobAdminApplication[]);
        const [portalData, appData] = await Promise.all([
          fetchCareersPortalData(),
          myApplications,
        ]);
        if (!cancelled) {
          setJobs(portalData.jobs);
          setPortalCards(portalData.portalCards);
          setMyApps(appData);
        }
      } catch (err) {
        if (!cancelled) setError(getCareerErrorMessage(err, "Failed to load opportunities."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [instance, activeAccount, userEmail, reloadKey]);

  // Check admin status
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!activeAccount) return;
      try {
        const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
        const token = await acquireAccessTokenSilentOrRedirect(instance, {
          scopes: [`${new URL(SP_SITE_URL).origin}/AllSites.Manage`],
          account: activeAccount,
        });
        const groupResp = await fetchWithAuthRecovery(
          `${SP_SITE_URL}/_api/web/sitegroups/getByName('_HR_ Forms Owners')/users?$select=Email`,
          { headers: { Accept: "application/json;odata=nometadata", Authorization: `Bearer ${token}` } },
        );
        if (groupResp.ok) {
          const data = await groupResp.json() as { value?: { Email?: string }[] };
          if (!cancelled) setIsAdmin((data.value || []).some((u) => (u.Email || "").toLowerCase() === userEmail));
        }
      } catch { /* not admin */ }
    }
    if (userEmail) void check();
    return () => { cancelled = true; };
  }, [instance, activeAccount, userEmail]);

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

  const jobAdvancedFilterCount = [
    Boolean(companyFilter),
    Boolean(deptFilter),
    Boolean(typeFilter),
    appliedFilter !== "all",
    sortBy !== "newest",
  ].filter(Boolean).length;
  const hasFilters = Boolean(searchText.trim()) || Boolean(companyFilter) || Boolean(deptFilter) || Boolean(typeFilter) || appliedFilter !== "all";
  const hasJobSearchOptions = hasFilters || sortBy !== "newest";
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
      ? [{ name: "Supporting Document", url: selectedApp.coverLetterUrl }]
      : [];
  const requestedJobId = new URLSearchParams(location.search).get("job")?.trim() || "";

  useEffect(() => {
    if (!requestedJobId || loading) return;
    const targetJob = jobs.find((job) => job.id === requestedJobId);
    if (targetJob) setSelectedJob(targetJob);
  }, [jobs, loading, requestedJobId]);

  function closeJobDetail(): void {
    setSelectedJob(null);
    if (!requestedJobId) return;

    const params = new URLSearchParams(location.search);
    params.delete("job");
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}`, { replace: true });
  }

  const handleViewApplications = () => setAppliedFilter((current) => current === "applied" ? "all" : "applied");
  const handlePortalCardTarget = (card: CareerPortalCard) => {
    const targetValue = card.targetValue.trim();
    if (card.targetType === "none" || !targetValue) return;

    if (card.targetType === "job") {
      const targetJob = jobs.find((job) => job.id === targetValue);
      if (targetJob) {
        setSelectedJob(targetJob);
      } else {
        navigate(`/career-portal?job=${encodeURIComponent(targetValue)}`);
      }
      return;
    }

    if (targetValue.startsWith("/")) {
      navigate(targetValue);
    } else {
      window.open(targetValue, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Box sx={careerPageSx}>
      <CareerPortalHeader
        title="PMW Careers"
        subtitle="Explore internal openings and track your submitted applications."
        activeSection="opportunities"
        isAdmin={isAdmin}
        backPath={isAdmin ? "/admin/dashboard" : "/user/dashboard"}
        backLabel="Back to forms dashboard"
      />

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {!loading && !error && (
          <PortalWelcomePanel
            totalJobs={jobs.length}
            visibleJobs={filteredJobs.length}
            applicationsCount={myApps.length}
            viewingApplications={appliedFilter === "applied"}
            portalCards={portalCards}
            onViewApplications={handleViewApplications}
            onPortalCardTarget={handlePortalCardTarget}
          />
        )}

        {/* Filters (hidden when viewing My Applications) */}
        {!loading && !error && jobs.length > 0 && appliedFilter !== "applied" && (
          <Paper
            sx={{
              ...careerToolbarSx,
              mb: 3,
              animation: `${fadeInUp} 0.4s ease both`,
              animationDelay: "90ms",
              "&:hover": {
                borderColor: editorial.pmwBlue,
                boxShadow: editorialShadow,
              },
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
                  placeholder="Search opportunities..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  size="small"
                  sx={{
                    ...careerSearchFieldSx,
                    flex: "1 1 auto",
                    minWidth: 0,
                    "& .MuiOutlinedInput-root": {
                      borderRadius: "10px",
                      backgroundColor: editorial.white,
                      transition: "box-shadow 0.18s ease, background-color 0.18s ease",
                      "&:hover": { backgroundColor: editorial.blueSoft },
                      "&.Mui-focused": {
                        backgroundColor: "#ffffff",
                        boxShadow: "0 0 0 3px rgba(0, 120, 212, 0.16)",
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
                <Tooltip title={showJobAdvancedFilters ? "Hide advanced search" : "Show advanced search"}>
                  <IconButton
                    aria-label={showJobAdvancedFilters ? "Hide advanced search" : "Show advanced search"}
                    aria-pressed={showJobAdvancedFilters}
                    onClick={() => setShowJobAdvancedFilters((open) => !open)}
                    sx={{
                      ...careerIconButtonSx,
                      borderRadius: "10px",
                      borderColor: showJobAdvancedFilters || jobAdvancedFilterCount > 0 ? editorial.pmwBlue : editorial.border,
                      color: showJobAdvancedFilters || jobAdvancedFilterCount > 0 ? editorial.pmwBlueDark : editorial.muted,
                      backgroundColor: showJobAdvancedFilters || jobAdvancedFilterCount > 0 ? editorial.blueWash : "#ffffff",
                      flexShrink: 0,
                      "&:hover": {
                        transform: "translateY(-1px)",
                        backgroundColor: editorial.blueWash,
                        borderColor: editorial.pmwBlue,
                      },
                      "&:active": { transform: "scale(0.96)" },
                      ...reduceMotionSx,
                    }}
                  >
                    <Badge
                      badgeContent={jobAdvancedFilterCount}
                      color="primary"
                      invisible={jobAdvancedFilterCount === 0}
                      sx={{ "& .MuiBadge-badge": { fontSize: "0.62rem", minWidth: 16, height: 16 } }}
                    >
                      <FilterList sx={{ fontSize: 20 }} />
                    </Badge>
                  </IconButton>
                </Tooltip>
              </Box>
              {hasJobSearchOptions && (
                <Button
                  size="small"
                  startIcon={<Close />}
                  onClick={() => {
                    setSearchText("");
                    setCompanyFilter("");
                    setDeptFilter("");
                    setTypeFilter("");
                    setAppliedFilter("all");
                    setSortBy("newest");
                  }}
                  sx={{
                    ...careerActionButtonSx,
                    borderRadius: "8px",
                    color: editorial.muted,
                    fontWeight: 700,
                  }}
                >
                  Clear
                </Button>
              )}
              {hasFilters && (
                <Chip
                  label={`${filteredJobs.length} of ${jobs.length} opportunities`}
                  size="small"
                  sx={{
                    backgroundColor: editorial.blueWash,
                    color: editorial.pmwBlueDark,
                    fontWeight: 800,
                    fontSize: "0.75rem",
                    height: 32,
                    fontVariantNumeric: "tabular-nums",
                    animation: `${scaleIn} 0.22s ease both`,
                    ...reduceMotionSx,
                  }}
                />
              )}
            </Box>

            {showJobAdvancedFilters && (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", md: "repeat(5, minmax(0, 1fr))" },
                  gap: 1.25,
                  width: "100%",
                }}
              >
                <FormControl size="small" fullWidth>
                  <InputLabel>Company</InputLabel>
                  <Select
                    value={companyFilter}
                    label="Company"
                    onChange={(e) => setCompanyFilter(e.target.value)}
                    sx={{
                      borderRadius: "8px",
                      backgroundColor: "#F8F9FC",
                      transition: "box-shadow 0.18s ease, background-color 0.18s ease",
                      "&:hover": { backgroundColor: "#ffffff" },
                      "&.Mui-focused": { boxShadow: "0 0 0 3px rgba(0, 120, 212, 0.10)" },
                    }}
                  >
                    <MenuItem value="">All companies</MenuItem>
                    {companies.map((company) => (
                      <MenuItem key={company} value={company}>{company}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Department</InputLabel>
                  <Select
                    value={deptFilter}
                    label="Department"
                    onChange={(e) => setDeptFilter(e.target.value)}
                    sx={{
                      borderRadius: "8px",
                      backgroundColor: "#F8F9FC",
                      transition: "box-shadow 0.18s ease, background-color 0.18s ease",
                      "&:hover": { backgroundColor: "#ffffff" },
                      "&.Mui-focused": { boxShadow: "0 0 0 3px rgba(0, 120, 212, 0.10)" },
                    }}
                  >
                    <MenuItem value="">All departments</MenuItem>
                    {departments.map((d) => (
                      <MenuItem key={d} value={d}>{d}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={typeFilter}
                    label="Type"
                    onChange={(e) => setTypeFilter(e.target.value)}
                    sx={{
                      borderRadius: "8px",
                      backgroundColor: "#F8F9FC",
                      transition: "box-shadow 0.18s ease, background-color 0.18s ease",
                      "&:hover": { backgroundColor: "#ffffff" },
                      "&.Mui-focused": { boxShadow: "0 0 0 3px rgba(0, 120, 212, 0.10)" },
                    }}
                  >
                    <MenuItem value="">All types</MenuItem>
                    {employmentTypes.map((t) => (
                      <MenuItem key={t} value={t}>{t}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Applied</InputLabel>
                  <Select
                    value={appliedFilter}
                    label="Applied"
                    onChange={(e) => setAppliedFilter(e.target.value)}
                    sx={{
                      borderRadius: "8px",
                      backgroundColor: "#F8F9FC",
                      transition: "box-shadow 0.18s ease, background-color 0.18s ease",
                      "&:hover": { backgroundColor: "#ffffff" },
                      "&.Mui-focused": { boxShadow: "0 0 0 3px rgba(0, 120, 212, 0.10)" },
                    }}
                  >
                    <MenuItem value="all">All opportunities</MenuItem>
                    <MenuItem value="applied">Applied</MenuItem>
                    <MenuItem value="unapplied">Unapplied</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Sort</InputLabel>
                  <Select
                    value={sortBy}
                    label="Sort"
                    onChange={(e) => setSortBy(e.target.value)}
                    sx={{
                      borderRadius: "8px",
                      backgroundColor: "#F8F9FC",
                      transition: "box-shadow 0.18s ease, background-color 0.18s ease",
                      "&:hover": { backgroundColor: "#ffffff" },
                      "&.Mui-focused": { boxShadow: "0 0 0 3px rgba(0, 120, 212, 0.10)" },
                    }}
                  >
                    <MenuItem value="newest">Newest</MenuItem>
                    <MenuItem value="closing">Closing soon</MenuItem>
                    <MenuItem value="name">Name</MenuItem>
                    <MenuItem value="applicants">Most applicants</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            )}
          </Paper>
        )}

        {/* Loading */}
        {loading && (
          <CareersLoadingSkeleton />
        )}

        {/* Error */}
        {!loading && error && (
          <CareerErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
        )}

        {/* Empty */}
        {!loading && !error && jobs.length === 0 && (
          <CareerEmptyState
            icon={<AccessTime />}
            title="No internal opportunities"
            description="There are no internal advancement openings at the moment. Check back later."
          />
        )}
        {!loading && !error && jobs.length > 0 && filteredJobs.length === 0 && appliedFilter !== "applied" && (
          <CareerEmptyState
            icon={<SearchIcon />}
            title="No opportunities match"
            description="Try adjusting your search, company, department, type, or applied filter."
          />
        )}

        {/* My Applications list */}
        {!loading && !error && appliedFilter === "applied" && myApps.length > 0 && (
          <>
          <Paper
            sx={{
              ...careerToolbarSx,
              mb: 2,
              animation: `${fadeInUp} 0.4s ease both`,
              animationDelay: "80ms",
              "&:hover": {
                borderColor: editorial.pmwPurple,
                boxShadow: editorialShadow,
              },
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
                      borderRadius: "10px",
                      backgroundColor: editorial.white,
                      transition: "box-shadow 0.18s ease, background-color 0.18s ease",
                      "&:hover": { backgroundColor: editorial.purpleWash },
                      "&.Mui-focused": {
                        backgroundColor: "#ffffff",
                        boxShadow: "0 0 0 3px rgba(98, 100, 167, 0.12)",
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
                      borderRadius: "8px",
                      borderColor: showMyAppsAdvancedFilters || myAppsAdvancedFilterCount > 0 ? editorial.pmwPurple : editorial.border,
                      color: showMyAppsAdvancedFilters || myAppsAdvancedFilterCount > 0 ? editorial.pmwPurpleDark : editorial.muted,
                      backgroundColor: showMyAppsAdvancedFilters || myAppsAdvancedFilterCount > 0 ? editorial.purpleWash : "#ffffff",
                      flexShrink: 0,
                      "&:hover": {
                        transform: "translateY(-1px)",
                        backgroundColor: editorial.purpleWash,
                        borderColor: editorial.pmwPurple,
                      },
                      "&:active": { transform: "scale(0.96)" },
                      ...reduceMotionSx,
                    }}
                  >
                    <Badge
                      badgeContent={myAppsAdvancedFilterCount}
                      color="secondary"
                      invisible={myAppsAdvancedFilterCount === 0}
                      sx={{ "& .MuiBadge-badge": { fontSize: "0.62rem", minWidth: 16, height: 16 } }}
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
                    borderRadius: "8px",
                    color: editorial.muted,
                    fontWeight: 700,
                    "&:hover": { transform: "translateY(-1px)", backgroundColor: editorial.purpleWash },
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
                  sx={{ backgroundColor: editorial.blueWash, color: editorial.pmwBlueDark, fontWeight: 800, fontSize: "0.75rem", fontVariantNumeric: "tabular-nums", animation: `${scaleIn} 0.22s ease both`, ...reduceMotionSx }}
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
                      borderRadius: "8px",
                      backgroundColor: "#F8F9FC",
                      transition: "box-shadow 0.18s ease, background-color 0.18s ease",
                      "&:hover": { backgroundColor: "#ffffff" },
                      "&.Mui-focused": { boxShadow: "0 0 0 3px rgba(98, 100, 167, 0.12)" },
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
                      slotProps={{ inputLabel: { shrink: true }, input: { sx: { borderRadius: "8px" } } }}
                    />
                    <TextField
                      type="date"
                      label="To"
                      value={myAppsTo}
                      onChange={(e) => setMyAppsTo(e.target.value)}
                      size="small"
                      fullWidth
                      slotProps={{ inputLabel: { shrink: true }, input: { sx: { borderRadius: "8px" } } }}
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
                      borderRadius: "8px",
                      backgroundColor: "#F8F9FC",
                      transition: "box-shadow 0.18s ease, background-color 0.18s ease",
                      "&:hover": { backgroundColor: "#ffffff" },
                      "&.Mui-focused": { boxShadow: "0 0 0 3px rgba(98, 100, 167, 0.12)" },
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
              borderRadius: "12px",
              border: `1px solid ${editorial.border}`,
              boxShadow: "none",
              overflow: "hidden",
              animation: `${fadeInUp} 0.42s ease both`,
              animationDelay: "140ms",
              ...reduceMotionSx,
            }}
          >
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: editorial.blueSoft }}>
                  <TableCell sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", textTransform: "uppercase" }}>Reference</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", textTransform: "uppercase" }}>Role</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", textTransform: "uppercase" }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", textTransform: "uppercase" }}>Submitted</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedMyApps.map((app, index) => (
                  <TableRow
                    key={app.id}
                    hover
                    sx={{
                      cursor: "pointer",
                      animation: `${fadeInUp} 0.32s ease both`,
                      animationDelay: staggerDelay(index, 38, 260),
                      transition: "background-color 0.18s ease, transform 0.18s ease",
                      "&:hover": {
                        backgroundColor: "#FAFBFC",
                        transform: "translateX(4px)",
                        "& .application-ref": { color: "#005A9E" },
                      },
                      "&:active": { transform: "translateX(2px) scale(0.998)" },
                      ...reduceMotionSx,
                    }}
                    onClick={() => setSelectedApp(app)}
                  >
                    <TableCell>
                      <Typography className="application-ref" variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600, color: "#0078D4", fontSize: "0.8rem", transition: "color 0.18s ease" }}>
                        {app.submissionRef}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: "#111827", fontSize: "0.85rem" }}>
                        {app.jobTitle}
                      </Typography>
                      {app.company && (
                        <Typography variant="caption" sx={{ color: "#6B7280", display: "block" }}>
                          {app.company}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={app.status || "New"}
                        size="small"
                        sx={{
                          borderRadius: "8px",
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          backgroundColor: app.status === "Reviewed" ? "#E6F4EA" : "#F0F7FF",
                          color: app.status === "Reviewed" ? "#34A853" : "#0078D4",
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: "#6B7280", fontSize: "0.8rem" }}>
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

        {/* Job Cards Grid (hidden when viewing My Applications) */}
        {!loading && !error && appliedFilter !== "applied" && filteredJobs.length > 0 && (
          <>
            <Grid container spacing={2.5}>
              {pagedJobs.map((job, index) => (
                <Grid size={{ xs: 12 }} key={job.id}>
                  <JobCard job={job} onSelect={setSelectedJob} isApplied={isJobApplied(job.id)} index={index} />
                </Grid>
              ))}
            </Grid>
            <Paper
              sx={{
                mt: 2,
                borderRadius: "12px",
                border: `1px solid ${editorial.border}`,
                boxShadow: "none",
                overflow: "hidden",
                animation: `${fadeInUp} 0.32s ease both`,
                animationDelay: "180ms",
                ...reduceMotionSx,
              }}
            >
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
            </Paper>
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
                backgroundColor: "rgba(17, 24, 39, 0.36)",
                backdropFilter: "blur(3px)",
              },
            },
            paper: {
              sx: {
                borderRadius: "8px",
                overflow: "hidden",
                border: "1px solid rgba(17, 24, 39, 0.08)",
                animation: `${scaleIn} 0.24s ease both`,
                ...reduceMotionSx,
              },
            },
          }}
        >
          {selectedApp && (
            <>
              <DialogTitle sx={{ pb: 1, background: "linear-gradient(135deg, #FFFFFF 0%, #F8FBFF 100%)", borderBottom: "1px solid rgba(17, 24, 39, 0.08)" }}>
                <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: "#111827" }}>
                  Application Details
                </Typography>
                <IconButton
                  onClick={() => setSelectedApp(null)}
                  size="small"
                  sx={{
                    position: "absolute",
                    right: 12,
                    top: 12,
                    color: "#6B7280",
                    transition: "transform 0.18s ease, background-color 0.18s ease",
                    "&:hover": { transform: "rotate(90deg)", backgroundColor: "#F0F7FF" },
                    ...reduceMotionSx,
                  }}
                >
                  <Close />
                </IconButton>
              </DialogTitle>
              <DialogContent>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <Box><Typography variant="caption" sx={{ color: "#9CA3AF", fontWeight: 500 }}>Reference</Typography><Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600, color: "#0078D4" }}>{selectedApp.submissionRef}</Typography></Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: "#9CA3AF", fontWeight: 500 }}>Role</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600, color: "#111827" }}>{selectedApp.jobTitle}</Typography>
                    {selectedApp.company && <Typography variant="body2" sx={{ color: "#6B7280", mt: 0.25 }}>{selectedApp.company}</Typography>}
                  </Box>
                  <Box><Typography variant="caption" sx={{ color: "#9CA3AF", fontWeight: 500 }}>Applicant</Typography><Typography variant="body1" sx={{ fontWeight: 600, color: "#111827" }}>{selectedApp.applicantName}</Typography><Typography variant="body2" sx={{ color: "#6B7280" }}>{selectedApp.applicantEmail}</Typography>{selectedApp.applicantPhone && <Typography variant="body2" sx={{ color: "#6B7280", mt: 0.25 }}>{selectedApp.applicantPhone}</Typography>}</Box>
                  <Box><Typography variant="caption" sx={{ color: "#9CA3AF", fontWeight: 500 }}>Status</Typography><Chip label={selectedApp.status || "New"} size="small" sx={{ borderRadius: "8px", fontWeight: 600, backgroundColor: selectedApp.status === "Reviewed" ? "#E6F4EA" : "#F0F7FF", color: selectedApp.status === "Reviewed" ? "#34A853" : "#0078D4" }} /></Box>
                  <Box><Typography variant="caption" sx={{ color: "#9CA3AF", fontWeight: 500 }}>Submitted</Typography><Typography variant="body2" sx={{ color: "#6B7280" }}>{selectedApp.submittedAt ? formatDate(selectedApp.submittedAt) : "—"}</Typography></Box>

                  {(selectedApp.resumeUrl || selectedSupportingDocuments.length > 0) && (
                    <Box>
                      <Typography variant="caption" sx={{ color: "#9CA3AF", fontWeight: 500 }}>Documents</Typography>
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
                              transition: "transform 0.18s ease, background-color 0.18s ease",
                              "&:hover": { backgroundColor: "#DBEAFE", transform: "translateY(-1px)" },
                              "&:active": { transform: "translateY(0) scale(0.99)" },
                              ...reduceMotionSx,
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
                              px: 1.5, py: 0.75, borderRadius: "8px",
                              color: "#0078D4", fontWeight: 600, fontSize: "0.85rem",
                              backgroundColor: "#F0F7FF", border: "1px solid rgba(0,120,212,0.15)",
                              textDecoration: "none", width: "fit-content",
                              transition: "transform 0.18s ease, background-color 0.18s ease",
                              "&:hover": { backgroundColor: "#DBEAFE", transform: "translateY(-1px)" },
                              "&:active": { transform: "translateY(0) scale(0.99)" },
                              ...reduceMotionSx,
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
              <DialogActions sx={{ px: 3, pb: 2, backgroundColor: "#FAFBFC" }}>
                <Button
                  onClick={() => setSelectedApp(null)}
                  sx={{
                    borderRadius: "8px",
                    textTransform: "none",
                    color: "#6B7280",
                    fontWeight: 700,
                    transition: "transform 0.18s ease, background-color 0.18s ease",
                    "&:hover": { transform: "translateY(-1px)", backgroundColor: "#F3F4F6" },
                    "&:active": { transform: "translateY(0) scale(0.98)" },
                    ...reduceMotionSx,
                  }}
                >
                  Close
                </Button>
              </DialogActions>
            </>
          )}
        </Dialog>

        {/* Job detail dialog */}
        <JobDetailDialog
          job={selectedJob}
          open={!!selectedJob}
          onClose={closeJobDetail}
          isApplied={!!(selectedJob && isJobApplied(selectedJob.id))}
          isAdmin={isAdmin}
          onTestSubmit={(jobId) => {
            setSelectedJob(null);
            navigate(`/career-portal/${jobId}/apply?override=1`);
          }}
        />
      </Container>
    </Box>
  );
}

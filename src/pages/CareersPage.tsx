import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Grid,
  Alert,
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
} from "@mui/material";
import { keyframes } from "@mui/material/styles";
import {
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
} from "@mui/icons-material";
import DOMPurify from "dompurify";
import { useMsal } from "@azure/msal-react";
import { fetchCareersPortalData, fetchMyApplications } from "../utils/careersService";
import CareerPortalHeader from "../components/careers/CareerPortalHeader";
import type { JobListing, JobAdminApplication, CareerPortalCard } from "../types";

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

const shimmerSweep = keyframes`
  from {
    transform: translateX(-120%);
  }
  to {
    transform: translateX(120%);
  }
`;

const softPulse = keyframes`
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(0, 120, 212, 0.18);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(0, 120, 212, 0);
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

function staggerDelay(index: number, step = 55, max = 440): string {
  return `${Math.min(index * step, max)}ms`;
}

const DEFAULT_CARD_COLORS = {
  start: "#0078D4",
  end: "#6264A7",
  accent: "#16A34A",
};

const DEFAULT_PORTAL_CARDS: CareerPortalCard[] = [
  {
    id: "system-default-1",
    title: "Grow into your next role",
    description: "Browse internal openings, compare fit, and move forward with confidence.",
    imageUrl: "",
    sortOrder: 1,
    status: "Active",
    targetType: "none",
    targetValue: "",
    colorStart: "#0078D4",
    colorEnd: "#6264A7",
    colorAccent: "#16A34A",
    isSystemDefault: true,
    locked: true,
    source: "system",
    created: "",
  },
  {
    id: "system-default-2",
    title: "Your progress stays visible",
    description: "Keep every submitted application easy to find while HR reviews your next step.",
    imageUrl: "",
    sortOrder: 2,
    status: "Active",
    targetType: "none",
    targetValue: "",
    colorStart: "#6264A7",
    colorEnd: "#0078D4",
    colorAccent: "#E67635",
    isSystemDefault: true,
    locked: true,
    source: "system",
    created: "",
  },
  {
    id: "system-default-3",
    title: "Built for PMW talent",
    description: "Internal advancement opportunities are gathered here for quick, focused browsing.",
    imageUrl: "",
    sortOrder: 3,
    status: "Active",
    targetType: "none",
    targetValue: "",
    colorStart: "#16A34A",
    colorEnd: "#0078D4",
    colorAccent: "#6264A7",
    isSystemDefault: true,
    locked: true,
    source: "system",
    created: "",
  },
];

function safeColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function cardGradient(card: CareerPortalCard): string {
  return `linear-gradient(135deg, ${safeColor(card.colorStart, DEFAULT_CARD_COLORS.start)} 0%, ${safeColor(card.colorEnd, DEFAULT_CARD_COLORS.end)} 58%, ${safeColor(card.colorAccent, DEFAULT_CARD_COLORS.accent)} 100%)`;
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
    "Full-time": "#0078D4",
    "Part-time": "#6264A7",
    Contract: "#E67635",
    Internship: "#498205",
  };
  return map[type] || "#6B7280";
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
        borderRadius: "8px",
        position: "relative",
        overflow: "hidden",
        height: "100%",
        border: "1px solid rgba(17, 24, 39, 0.08)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
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
          background: "linear-gradient(90deg, #0078D4, #6264A7, #16A34A)",
          transform: "scaleX(0)",
          transformOrigin: "left",
          transition: "transform 0.24s ease",
        },
        "&::after": {
          content: '""',
          position: "absolute",
          inset: 0,
          background: "linear-gradient(110deg, transparent 12%, rgba(255,255,255,0.45) 44%, transparent 68%)",
          opacity: 0,
          transform: "translateX(-120%)",
          pointerEvents: "none",
        },
        "&:hover": {
          transform: "translateY(-5px)",
          borderColor: "rgba(0, 120, 212, 0.34)",
          boxShadow: "0 12px 30px rgba(17,24,39,0.11), 0 4px 10px rgba(0,120,212,0.08)",
          opacity: 1,
          "&::before": {
            transform: "scaleX(1)",
          },
          "&::after": {
            animation: `${shimmerSweep} 0.86s ease`,
            opacity: 1,
          },
          "& .job-card-title": {
            color: "#005A9E",
          },
          "& .job-card-cta": {
            color: "#005A9E",
            transform: "translateX(3px)",
          },
          "& .job-card-icon": {
            color: "#0078D4",
            transform: "scale(1.08)",
          },
        },
        "&:active": {
          transform: "translateY(-2px) scale(0.99)",
        },
        "&:focus-visible": {
          outline: "3px solid rgba(0, 120, 212, 0.22)",
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
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1.5 }}>
          <Typography
            className="job-card-title"
            variant="h6"
            sx={{ fontWeight: 700, color: "#111827", fontSize: "1.1rem", lineHeight: 1.3, transition: "color 0.2s ease" }}
          >
            {job.title}
          </Typography>
          <Chip
            label={job.employmentType}
            size="small"
            sx={{
              backgroundColor: `${getEmploymentTypeColor(job.employmentType)}14`,
              color: getEmploymentTypeColor(job.employmentType),
              fontWeight: 600,
              fontSize: "0.7rem",
              borderRadius: "8px",
              ml: 1,
              flexShrink: 0,
            }}
          />
        </Box>

        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 2 }}>
          <Chip
            label={job.department}
            size="small"
            sx={{
              backgroundColor: "#6264A7",
              color: "#ffffff",
              fontWeight: 500,
              fontSize: "0.7rem",
              borderRadius: "8px",
            }}
          />
          {isApplied && (
            <Chip
              label="Already Submitted"
              size="small"
              sx={{
                backgroundColor: "#E6F4EA",
                color: "#34A853",
                fontWeight: 600,
                fontSize: "0.65rem",
                borderRadius: "8px",
              }}
            />
          )}
        </Box>

        {job.location && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
            <LocationOn className="job-card-icon" sx={{ fontSize: 14, color: "#6B7280", transition: "transform 0.2s ease, color 0.2s ease" }} />
            <Typography variant="body2" sx={{ color: "#6B7280", fontSize: "0.8rem" }}>
              {job.location}
            </Typography>
          </Box>
        )}

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {job.closingDate && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <CalendarToday className="job-card-icon" sx={{ fontSize: 12, color: "#9CA3AF", transition: "transform 0.2s ease, color 0.2s ease" }} />
              <Typography variant="caption" sx={{ color: "#9CA3AF" }}>
                Closing {formatDate(job.closingDate)}
              </Typography>
            </Box>
          )}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, ml: "auto" }}>
            <People className="job-card-icon" sx={{ fontSize: 12, color: "#9CA3AF", transition: "transform 0.2s ease, color 0.2s ease" }} />
            <Typography variant="caption" sx={{ color: "#9CA3AF" }}>
              {job.applicationCount} {job.applicationCount === 1 ? "applicant" : "applicants"}
            </Typography>
          </Box>
        </Box>
        <Box
          className="job-card-cta"
          sx={{
            mt: 2.25,
            pt: 1.75,
            borderTop: "1px solid rgba(17, 24, 39, 0.08)",
            color: "#0078D4",
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            fontWeight: 700,
            fontSize: "0.82rem",
            transition: "transform 0.2s ease, color 0.2s ease",
          }}
        >
          View role
          <ArrowForward sx={{ fontSize: 16 }} />
        </Box>
      </CardContent>
    </Card>
  );
}

function PortalCardSwipe({
  cards,
  onCardTarget,
}: {
  cards: CareerPortalCard[];
  onCardTarget: (card: CareerPortalCard) => void;
}) {
  const activeCards = cards.length > 0 ? cards : DEFAULT_PORTAL_CARDS;
  const [activeIndex, setActiveIndex] = useState(0);
  const boundedActiveIndex = Math.min(activeIndex, activeCards.length - 1);

  useEffect(() => {
    if (activeCards.length <= 1) return undefined;
    const intervalId = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % activeCards.length);
    }, 4400);
    return () => window.clearInterval(intervalId);
  }, [activeCards.length]);

  return (
    <Box
      sx={{
        position: "relative",
        minHeight: { xs: 250, md: 280 },
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid rgba(17, 24, 39, 0.08)",
        background: "linear-gradient(135deg, #EEF6FF 0%, #F4F3FF 56%, #EAF7EF 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75), 0 12px 26px rgba(17, 24, 39, 0.08)",
        ...reduceMotionSx,
      }}
      aria-label="Career portal highlights"
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          width: `${activeCards.length * 100}%`,
          transform: `translateX(-${boundedActiveIndex * (100 / activeCards.length)}%)`,
          transition: "transform 0.62s cubic-bezier(0.22, 1, 0.36, 1)",
          "@media (prefers-reduced-motion: reduce)": {
            transition: "none",
          },
        }}
      >
        {activeCards.map((card, index) => {
          const showFallback = !card.imageUrl;
          const canOpen = card.targetType !== "none" && Boolean(card.targetValue.trim());
          return (
            <Box
              key={card.id || `${card.title}-${index}`}
              sx={{
                flex: `0 0 ${100 / activeCards.length}%`,
                minWidth: 0,
                p: { xs: 1.5, sm: 1.75 },
                boxSizing: "border-box",
              }}
            >
              <Box
                role={canOpen ? "button" : undefined}
                tabIndex={canOpen ? 0 : undefined}
                onClick={canOpen ? () => onCardTarget(card) : undefined}
                onKeyDown={(event) => {
                  if (!canOpen) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onCardTarget(card);
                  }
                }}
                sx={{
                  position: "relative",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  borderRadius: "8px",
                  overflow: "hidden",
                  backgroundColor: "#111827",
                  boxShadow: "0 14px 32px rgba(17, 24, 39, 0.18)",
                  cursor: canOpen ? "pointer" : "default",
                  outline: "none",
                  transition: "transform 0.18s ease, box-shadow 0.18s ease",
                  "&:hover": canOpen ? {
                    transform: "translateY(-2px)",
                    boxShadow: "0 18px 36px rgba(17, 24, 39, 0.22)",
                  } : undefined,
                  "&:focus-visible": {
                    boxShadow: "0 0 0 3px rgba(0, 120, 212, 0.35), 0 18px 36px rgba(17, 24, 39, 0.22)",
                  },
                  ...reduceMotionSx,
                }}
              >
                {showFallback ? (
                  <Box
                    sx={{
                      position: "absolute",
                      inset: 0,
                      background: cardGradient(card),
                    }}
                  />
                ) : (
                  <Box
                    component="img"
                    src={card.imageUrl}
                    alt=""
                    sx={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      filter: "saturate(1.02)",
                    }}
                  />
                )}
                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(180deg, rgba(17,24,39,0.05) 0%, rgba(17,24,39,0.62) 58%, rgba(17,24,39,0.86) 100%)",
                  }}
                />
                <Box sx={{ position: "relative", p: { xs: 2, sm: 2.5 }, pb: { xs: 4.75, sm: 5 } }}>
                  <Chip
                    label={canOpen ? "Tap to open" : "Portal highlight"}
                    size="small"
                    sx={{
                      mb: 1,
                      width: "fit-content",
                      borderRadius: "8px",
                      backgroundColor: "rgba(255,255,255,0.88)",
                      color: "#005A9E",
                      fontWeight: 800,
                      fontSize: "0.68rem",
                    }}
                  />
                  <Typography
                    variant="h6"
                    sx={{
                      color: "#ffffff",
                      fontWeight: 800,
                      fontSize: { xs: "1.05rem", sm: "1.18rem" },
                      lineHeight: 1.24,
                      mb: 0.65,
                    }}
                  >
                    {card.title}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: "rgba(255,255,255,0.86)",
                      fontWeight: 500,
                      lineHeight: 1.5,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {card.description}
                  </Typography>
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box
        sx={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: { xs: 18, sm: 20 },
          zIndex: 2,
          display: "flex",
          justifyContent: "center",
          gap: 0.75,
          pointerEvents: "auto",
        }}
      >
        {activeCards.map((card, index) => {
          const selected = boundedActiveIndex === index;
          return (
            <Box
              key={`dot-${card.id || index}`}
              component="button"
              type="button"
              aria-label={`Show highlight ${index + 1}`}
              aria-current={selected ? "true" : undefined}
              onClick={() => setActiveIndex(index)}
              sx={{
                width: selected ? 18 : 6,
                height: 6,
                p: 0,
                border: 0,
                borderRadius: 999,
                cursor: "pointer",
                backgroundColor: selected ? "#ffffff" : "rgba(255,255,255,0.52)",
                boxShadow: selected ? "0 0 0 1px rgba(255,255,255,0.38), 0 2px 8px rgba(0,0,0,0.18)" : "none",
                transition: "width 0.2s ease, background-color 0.2s ease, transform 0.2s ease",
                "&:hover": {
                  transform: "translateY(-1px)",
                  backgroundColor: "#ffffff",
                },
                "&:focus-visible": {
                  outline: "2px solid #ffffff",
                  outlineOffset: 3,
                },
                ...reduceMotionSx,
              }}
            />
          );
        })}
      </Box>
    </Box>
  );
}

function PortalWelcomePanel({
  totalJobs,
  visibleJobs,
  applicationsCount,
  viewingApplications,
  portalCards,
  onBrowseOpenings,
  onViewApplications,
  onPortalCardTarget,
}: {
  totalJobs: number;
  visibleJobs: number;
  applicationsCount: number;
  viewingApplications: boolean;
  portalCards: CareerPortalCard[];
  onBrowseOpenings: () => void;
  onViewApplications: () => void;
  onPortalCardTarget: (card: CareerPortalCard) => void;
}) {
  const stats = [
    { label: "Open roles", value: totalJobs, icon: <WorkOutlined />, color: "#0078D4", bg: "#F0F7FF" },
    {
      label: viewingApplications ? "Tracked apps" : "Visible now",
      value: viewingApplications ? applicationsCount : visibleJobs,
      icon: <TrendingUp />,
      color: "#6264A7",
      bg: "#F4F3FF",
    },
    { label: "My applications", value: applicationsCount, icon: <AssignmentTurnedIn />, color: "#16A34A", bg: "#E6F4EA" },
  ];

  return (
    <Paper
      component="section"
      sx={{
        p: { xs: 2.5, md: 3 },
        mb: 3,
        borderRadius: "8px",
        border: "1px solid rgba(17, 24, 39, 0.08)",
        boxShadow: "0 10px 30px rgba(17, 24, 39, 0.06)",
        background: "linear-gradient(135deg, #FFFFFF 0%, #F8FBFF 48%, #F7F7FF 100%)",
        position: "relative",
        overflow: "hidden",
        animation: `${fadeInUp} 0.48s ease both`,
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          background: "linear-gradient(110deg, transparent 0%, rgba(0,120,212,0.08) 36%, transparent 58%)",
          transform: "translateX(-120%)",
          animation: `${shimmerSweep} 7s ease-in-out infinite`,
          pointerEvents: "none",
        },
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
        <Box>
          <Chip
            icon={<AutoAwesome sx={{ fontSize: 16 }} />}
            label="Welcome back"
            size="small"
            sx={{
              mb: 1.5,
              borderRadius: "8px",
              backgroundColor: "#E6F4EA",
              color: "#2E7D32",
              fontWeight: 700,
              "& .MuiChip-icon": { color: "#2E7D32" },
            }}
          />
          <Typography
            variant="h4"
            component="h2"
            sx={{
              color: "#111827",
              fontWeight: 800,
              fontSize: { xs: "1.35rem", sm: "1.65rem" },
              lineHeight: 1.2,
              mb: 1,
              letterSpacing: 0,
            }}
          >
            Internal advancement starts here
          </Typography>
          <Typography variant="body1" sx={{ color: "#4B5563", maxWidth: 640, mb: 2.25 }}>
            Explore roles built for PMW talent and keep your application journey in view.
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              variant="contained"
              endIcon={<ArrowForward />}
              onClick={onBrowseOpenings}
              sx={{
                borderRadius: "8px",
                backgroundColor: "#0078D4",
                fontWeight: 700,
                px: 2.4,
                transition: "transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease",
                animation: `${softPulse} 2.8s ease-in-out infinite`,
                "&:hover": {
                  backgroundColor: "#106EBE",
                  transform: "translateY(-2px)",
                  boxShadow: "0 8px 20px rgba(0, 120, 212, 0.24)",
                },
                "&:active": { transform: "translateY(0) scale(0.98)" },
                ...reduceMotionSx,
              }}
            >
              Browse openings
            </Button>
            {applicationsCount > 0 && (
              <Button
                variant={viewingApplications ? "contained" : "outlined"}
                startIcon={<AssignmentTurnedIn />}
                onClick={onViewApplications}
                sx={{
                  borderRadius: "8px",
                  fontWeight: 700,
                  borderColor: viewingApplications ? "#6264A7" : "rgba(98, 100, 167, 0.45)",
                  backgroundColor: viewingApplications ? "#6264A7" : "#ffffff",
                  color: viewingApplications ? "#ffffff" : "#4A4C80",
                  transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background-color 0.18s ease",
                  "&:hover": {
                    transform: "translateY(-2px)",
                    borderColor: "#6264A7",
                    backgroundColor: viewingApplications ? "#4A4C80" : "#F4F3FF",
                    boxShadow: "0 8px 18px rgba(98, 100, 167, 0.16)",
                  },
                  "&:active": { transform: "translateY(0) scale(0.98)" },
                  ...reduceMotionSx,
                }}
              >
                {viewingApplications ? "Viewing applications" : "My applications"}
              </Button>
            )}
          </Box>
        </Box>
        <PortalCardSwipe cards={portalCards} onCardTarget={onPortalCardTarget} />
      </Box>

      <Box
        sx={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: { xs: 0.75, sm: 1 },
          mt: { xs: 2, md: 2.5 },
        }}
      >
          {stats.map((stat, index) => (
            <Box
              key={stat.label}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: { xs: "center", sm: "flex-start" },
                gap: { xs: 0.75, sm: 1.25 },
                p: { xs: 1, sm: 1.35 },
                borderRadius: "8px",
                border: "1px solid rgba(17, 24, 39, 0.08)",
                backgroundColor: "rgba(255,255,255,0.78)",
                transition: "transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease",
                animation: `${fadeInUp} 0.42s ease both`,
                animationDelay: staggerDelay(index + 1, 70, 300),
                "&:hover": {
                  transform: "translateY(-3px)",
                  borderColor: `${stat.color}55`,
                  boxShadow: "0 8px 18px rgba(17, 24, 39, 0.08)",
                },
                ...reduceMotionSx,
              }}
            >
              <Box
                sx={{
                  width: { xs: 30, sm: 38 },
                  height: { xs: 30, sm: 38 },
                  borderRadius: "8px",
                  backgroundColor: stat.bg,
                  color: stat.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  "& .MuiSvgIcon-root": { fontSize: { xs: 17, sm: 20 } },
                }}
              >
                {stat.icon}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ color: "#111827", fontWeight: 800, fontSize: { xs: "0.95rem", sm: "1.1rem" }, lineHeight: 1.1 }}>
                  {stat.value}
                </Typography>
                <Typography variant="caption" sx={{ color: "#6B7280", fontWeight: 700, fontSize: { xs: "0.62rem", sm: "0.75rem" }, lineHeight: 1.2 }}>
                  {stat.label}
                </Typography>
              </Box>
            </Box>
          ))}
      </Box>
    </Paper>
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
            borderRadius: "8px",
            maxHeight: "90vh",
            overflow: "hidden",
            border: "1px solid rgba(17, 24, 39, 0.08)",
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
          background: "linear-gradient(135deg, #FFFFFF 0%, #F8FBFF 58%, #F4F3FF 100%)",
          borderBottom: "1px solid rgba(17, 24, 39, 0.08)",
          "&::before": {
            content: '""',
            position: "absolute",
            inset: 0,
            background: "linear-gradient(110deg, transparent 4%, rgba(0,120,212,0.08) 42%, transparent 68%)",
            animation: `${shimmerSweep} 5.8s ease-in-out infinite`,
            pointerEvents: "none",
          },
          ...reduceMotionSx,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1 }}>
          <Typography variant="h5" component="div" sx={{ fontWeight: 700, color: "#111827", fontSize: "1.25rem" }}>
            {job.title}
          </Typography>
          {isApplied && (
            <Chip label="Already Submitted" size="small" sx={{ backgroundColor: "#E6F4EA", color: "#34A853", fontWeight: 600, borderRadius: "8px", fontSize: "0.7rem" }} />
          )}
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
          <Chip
            label={job.department}
            size="small"
            sx={{ backgroundColor: "#6264A7", color: "#fff", fontWeight: 500, borderRadius: "8px" }}
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
            <Typography variant="caption" sx={{ color: "#6B7280", display: "flex", alignItems: "center", gap: 0.3 }}>
              <LocationOn sx={{ fontSize: 14 }} /> {job.location}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
          {job.closingDate && (
            <Typography variant="caption" sx={{ color: "#9CA3AF", display: "flex", alignItems: "center", gap: 0.3 }}>
              <CalendarToday sx={{ fontSize: 12 }} /> Closing {formatDate(job.closingDate)}
            </Typography>
          )}
          <Typography variant="caption" sx={{ color: "#9CA3AF", display: "flex", alignItems: "center", gap: 0.3 }}>
            <People sx={{ fontSize: 12 }} /> {job.applicationCount} {job.applicationCount === 1 ? "applicant" : "applicants"}
          </Typography>
        </Box>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{
            position: "absolute",
            right: 12,
            top: 12,
            zIndex: 1,
            color: "#6B7280",
            backgroundColor: "rgba(255,255,255,0.72)",
            transition: "transform 0.18s ease, background-color 0.18s ease",
            "&:hover": {
              transform: "rotate(90deg)",
              backgroundColor: "#F0F7FF",
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
              "& p": { mb: 1.5, lineHeight: 1.7, color: "#374151", fontSize: "0.9rem" },
              "& ul, & ol": { pl: 3, mb: 1.5 },
              "& li": { mb: 0.5, lineHeight: 1.7, color: "#374151", fontSize: "0.9rem" },
              "& h1, & h2, & h3, & h4": { mt: 2, mb: 1, fontWeight: 600, color: "#111827" },
              "& strong": { fontWeight: 600 },
              "& a": {
                color: "#0078D4",
                textDecoration: "none",
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "1px 6px",
                borderRadius: "6px",
                backgroundColor: "#F0F7FF",
                border: "1px solid rgba(0,120,212,0.15)",
                transition: "transform 0.18s ease, background-color 0.18s ease",
                "&:hover": { backgroundColor: "#DBEAFE", textDecoration: "underline", transform: "translateY(-1px)" },
              },
              "& a[href$='.jpg'], & a[href$='.jpeg'], & a[href$='.png'], & a[href$='.gif'], & a[href$='.svg'], & a[href$='.webp']": { "&::before": { content: "'🖼 '", fontSize: "12px" } },
              "& a[href$='.pdf']": { "&::before": { content: "'📄 '", fontSize: "12px" } },
              "& a[href$='.doc'], & a[href$='.docx']": { "&::before": { content: "'📝 '", fontSize: "12px" } },
              "& a[href$='.xls'], & a[href$='.xlsx']": { "&::before": { content: "'📊 '", fontSize: "12px" } },
              "& br": { display: "block", content: '""', mb: 0.5 },
            }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.jobDescription) }}
          />
        ) : (
          <Typography variant="body2" sx={{ color: "#9CA3AF" }}>
            No description provided.
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1, backgroundColor: "#FAFBFC" }}>
        <Button
          onClick={onClose}
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
              borderRadius: "8px",
              textTransform: "none",
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
              borderRadius: "8px",
              textTransform: "none",
              backgroundColor: "#0078D4",
              fontWeight: 600,
              px: 4,
              transition: "transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease",
              "&:hover": {
                backgroundColor: "#106EBE",
                transform: "translateY(-2px)",
                boxShadow: "0 8px 18px rgba(0, 120, 212, 0.24)",
              },
              "&:active": { transform: "translateY(0) scale(0.98)" },
              ...reduceMotionSx,
            }}
          >
            Apply
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default function CareersPage() {
  const { instance, accounts } = useMsal();
  const navigate = useNavigate();
  const userEmail = accounts[0]?.username?.toLowerCase() || "";
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [portalCards, setPortalCards] = useState<CareerPortalCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");
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
  const [myAppsPage, setMyAppsPage] = useState(0);
  const [myAppsRowsPerPage, setMyAppsRowsPerPage] = useState(10);

  // Opportunities that the current user has applied to -> set of job listing IDs
  const appliedJobIds = useMemo(() => new Set(myApps.map((a) => a.jobListingId).filter(Boolean)), [myApps]);

  const isJobApplied = (jobId: string) => appliedJobIds.has(jobId);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [portalData, appData] = await Promise.all([
          fetchCareersPortalData(),
          userEmail ? fetchMyApplications(userEmail).catch(() => []) : Promise.resolve([] as JobAdminApplication[]),
        ]);
        if (!cancelled) {
          setJobs(portalData.jobs);
          setPortalCards(portalData.portalCards);
          setMyApps(appData);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load opportunities");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [userEmail]);

  // Check admin status
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
        const resp = await instance.acquireTokenSilent({
          scopes: [`${new URL(SP_SITE_URL).origin}/AllSites.Manage`],
          account: accounts[0],
        });
        const token = resp.accessToken;
        const groupResp = await fetch(
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
  }, [instance, accounts, userEmail]);

  useEffect(() => {
    setJobsPage(0);
  }, [searchText, deptFilter, typeFilter, sortBy, appliedFilter]);

  useEffect(() => {
    setMyAppsPage(0);
  }, [myAppsSearch, myAppsTimeline, myAppsFrom, myAppsTo, myAppsSort, appliedFilter]);

  const departments = useMemo(() => {
    const set = new Set(jobs.map((j) => j.department).filter(Boolean));
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
          job.department.toLowerCase().includes(q) ||
          (job.location || "").toLowerCase().includes(q) ||
          job.employmentType.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
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
  }, [jobs, searchText, deptFilter, typeFilter, sortBy, appliedFilter, appliedJobIds]);

  const hasFilters = searchText || deptFilter || typeFilter || appliedFilter !== "all";
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
  const selectedSupportingDocuments = selectedApp?.supportingDocuments?.length
    ? selectedApp.supportingDocuments
    : selectedApp?.coverLetterUrl
      ? [{ name: "Supporting Document", url: selectedApp.coverLetterUrl }]
      : [];
  const handleBrowseOpenings = () => {
    setAppliedFilter("all");
    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: 120,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
  };
  const handleViewApplications = () => setAppliedFilter("applied");
  const handlePortalCardTarget = (card: CareerPortalCard) => {
    const targetValue = card.targetValue.trim();
    if (card.targetType === "none" || !targetValue) return;

    if (card.targetType === "job") {
      const targetJob = jobs.find((job) => job.id === targetValue);
      if (targetJob) {
        setSelectedJob(targetJob);
      } else {
        navigate(`/career-portal/${encodeURIComponent(targetValue)}/apply`);
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
    <Box sx={{ minHeight: "100vh", background: "var(--app-bg, #F6F8FB)" }}>
      <CareerPortalHeader
        title="Internal Career Advancement Portal"
        subtitle="Explore internal openings and track your submitted applications."
        activeSection="opportunities"
        isAdmin={isAdmin}
        backPath={isAdmin ? "/admin/dashboard" : "/user/dashboard"}
        backLabel="Back to forms dashboard"
        actions={(
          <>
            {myApps.length > 0 && (
              <Button
                variant={appliedFilter === "applied" ? "contained" : "outlined"}
                size="small"
                onClick={() => setAppliedFilter(appliedFilter === "applied" ? "all" : "applied")}
                sx={{
                  whiteSpace: "nowrap",
                  fontWeight: 700,
                  backgroundColor: appliedFilter === "applied" ? "#0078D4" : "#ffffff",
                  color: appliedFilter === "applied" ? "#ffffff" : "#6B7280",
                  borderColor: appliedFilter === "applied" ? "#0078D4" : "#D1D5DB",
                  transition: "transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease, border-color 0.18s ease",
                  "&:hover": {
                    backgroundColor: appliedFilter === "applied" ? "#106EBE" : "#F8FAFC",
                    transform: "translateY(-1px)",
                    boxShadow: "0 6px 16px rgba(0, 120, 212, 0.14)",
                  },
                  "&:active": { transform: "translateY(0) scale(0.98)" },
                  ...reduceMotionSx,
                }}
              >
                My Applications ({myApps.length})
              </Button>
            )}
          </>
        )}
      />

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {!loading && !error && (
          <PortalWelcomePanel
            totalJobs={jobs.length}
            visibleJobs={filteredJobs.length}
            applicationsCount={myApps.length}
            viewingApplications={appliedFilter === "applied"}
            portalCards={portalCards}
            onBrowseOpenings={handleBrowseOpenings}
            onViewApplications={handleViewApplications}
            onPortalCardTarget={handlePortalCardTarget}
          />
        )}

        {/* Filters (hidden when viewing My Applications) */}
        {!loading && !error && jobs.length > 0 && appliedFilter !== "applied" && (
          <Paper
            sx={{
              p: 2,
              mb: 3,
              borderRadius: "8px",
              border: "1px solid rgba(17, 24, 39, 0.08)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              display: "flex",
              flexWrap: "wrap",
              gap: 2,
              alignItems: "center",
              animation: `${fadeInUp} 0.4s ease both`,
              animationDelay: "90ms",
              transition: "box-shadow 0.2s ease, border-color 0.2s ease",
              "&:hover": {
                borderColor: "rgba(0, 120, 212, 0.18)",
                boxShadow: "0 8px 24px rgba(17, 24, 39, 0.08)",
              },
              ...reduceMotionSx,
            }}
          >
            <TextField
              placeholder="Search opportunities..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              size="small"
              sx={{
                flex: { xs: "1 1 100%", sm: "1 1 260px" },
                minWidth: { xs: "unset", sm: 200 },
                "& .MuiOutlinedInput-root": {
                  borderRadius: "8px",
                  backgroundColor: "#F8F9FC",
                  transition: "box-shadow 0.18s ease, background-color 0.18s ease",
                  "&:hover": { backgroundColor: "#ffffff" },
                  "&.Mui-focused": {
                    backgroundColor: "#ffffff",
                    boxShadow: "0 0 0 3px rgba(0, 120, 212, 0.10)",
                  },
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
            <FormControl size="small" sx={{ flex: { xs: "1 1 100%", sm: "none" }, minWidth: { xs: "unset", sm: 160 } }}>
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
            <FormControl size="small" sx={{ flex: { xs: "1 1 100%", sm: "none" }, minWidth: { xs: "unset", sm: 150 } }}>
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
            <FormControl size="small" sx={{ flex: { xs: "1 1 100%", sm: "none" }, minWidth: { xs: "unset", sm: 130 } }}>
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
            <FormControl size="small" sx={{ flex: { xs: "1 1 100%", sm: "none" }, minWidth: { xs: "unset", sm: 130 } }}>
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
            {hasFilters && (
              <Chip
                label={`${filteredJobs.length} of ${jobs.length} opportunities`}
                size="small"
                sx={{
                  backgroundColor: "#F0F7FF",
                  color: "#0078D4",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  height: 32,
                  animation: `${scaleIn} 0.22s ease both`,
                  ...reduceMotionSx,
                }}
              />
            )}
          </Paper>
        )}

        {/* Loading */}
        {loading && (
          <Grid container spacing={2.5}>
            {[1, 2, 3].map((i) => (
              <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={i}>
                <Paper
                  sx={{
                    p: 3,
                    borderRadius: "8px",
                    border: "1px solid rgba(17, 24, 39, 0.08)",
                    animation: `${fadeInUp} 0.42s ease both`,
                    animationDelay: staggerDelay(i - 1),
                    ...reduceMotionSx,
                  }}
                >
                  <Skeleton variant="text" width="75%" height={28} sx={{ mb: 1 }} />
                  <Skeleton variant="rounded" width={100} height={24} sx={{ borderRadius: "8px", mb: 2 }} />
                  <Box sx={{ display: "flex", gap: 2, mb: 1 }}>
                    <Skeleton variant="text" width="40%" height={20} />
                    <Skeleton variant="text" width="40%" height={20} />
                  </Box>
                  <Box sx={{ display: "flex", gap: 2 }}>
                    <Skeleton variant="text" width="35%" height={16} />
                    <Skeleton variant="text" width="30%" height={16} />
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Error */}
        {!loading && error && (
          <Alert
            severity="error"
            sx={{ borderRadius: "8px", mb: 3, fontWeight: 700, backgroundColor: "#FEF2F2", color: "#991B1B", "& .MuiAlert-icon": { color: "#DC2626" } }}
            action={
              <Button size="small" onClick={() => window.location.reload()} sx={{ textTransform: "none" }}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {/* Empty */}
        {!loading && !error && jobs.length === 0 && (
          <Box sx={{ textAlign: "center", py: 8, animation: `${fadeInUp} 0.38s ease both`, ...reduceMotionSx }}>
            <AccessTime sx={{ fontSize: 48, color: "#D1D5DB", mb: 2 }} />
            <Typography variant="h6" sx={{ color: "#6B7280", fontWeight: 600, mb: 0.5 }}>
              No Internal Opportunities
            </Typography>
            <Typography variant="body2" sx={{ color: "#9CA3AF" }}>
              There are no internal advancement openings at the moment. Please check back later.
            </Typography>
          </Box>
        )}
        {!loading && !error && jobs.length > 0 && filteredJobs.length === 0 && appliedFilter !== "applied" && (
          <Box sx={{ textAlign: "center", py: 8, animation: `${fadeInUp} 0.38s ease both`, ...reduceMotionSx }}>
            <SearchIcon sx={{ fontSize: 48, color: "#D1D5DB", mb: 2 }} />
            <Typography variant="h6" sx={{ color: "#6B7280", fontWeight: 600, mb: 0.5 }}>
              No Opportunities Match
            </Typography>
            <Typography variant="body2" sx={{ color: "#9CA3AF" }}>
              Try adjusting your search or filters.
            </Typography>
          </Box>
        )}

        {/* My Applications list */}
        {!loading && !error && appliedFilter === "applied" && myApps.length > 0 && (
          <>
          <Paper
            sx={{
              p: 2,
              mb: 2,
              borderRadius: "8px",
              border: "1px solid rgba(17, 24, 39, 0.08)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              display: "flex",
              flexWrap: "wrap",
              gap: 2,
              alignItems: "center",
              animation: `${fadeInUp} 0.4s ease both`,
              animationDelay: "80ms",
              transition: "box-shadow 0.2s ease, border-color 0.2s ease",
              "&:hover": {
                borderColor: "rgba(98, 100, 167, 0.22)",
                boxShadow: "0 8px 24px rgba(17, 24, 39, 0.08)",
              },
              ...reduceMotionSx,
            }}
          >
            <TextField
              placeholder="Search applications..."
              value={myAppsSearch}
              onChange={(e) => setMyAppsSearch(e.target.value)}
              size="small"
              sx={{
                flex: { xs: "1 1 100%", md: "1 1 260px" },
                minWidth: { xs: "unset", md: 240 },
                "& .MuiOutlinedInput-root": {
                  borderRadius: "8px",
                  backgroundColor: "#F8F9FC",
                  transition: "box-shadow 0.18s ease, background-color 0.18s ease",
                  "&:hover": { backgroundColor: "#ffffff" },
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
                      <SearchIcon sx={{ color: "#6B7280", fontSize: 20 }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 150 } }}>
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
                  sx={{ width: { xs: "100%", sm: 150 } }}
                  slotProps={{ inputLabel: { shrink: true }, input: { sx: { borderRadius: "8px" } } }}
                />
                <TextField
                  type="date"
                  label="To"
                  value={myAppsTo}
                  onChange={(e) => setMyAppsTo(e.target.value)}
                  size="small"
                  sx={{ width: { xs: "100%", sm: 150 } }}
                  slotProps={{ inputLabel: { shrink: true }, input: { sx: { borderRadius: "8px" } } }}
                />
              </>
            )}
            <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 150 } }}>
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
            {(myAppsSearch || myAppsTimeline !== "all") && (
              <Button
                size="small"
                onClick={() => {
                  setMyAppsSearch("");
                  setMyAppsTimeline("all");
                  setMyAppsFrom("");
                  setMyAppsTo("");
                }}
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
                Clear
              </Button>
            )}
            {filteredMyApps.length < myApps.length && (
              <Chip
                label={`${filteredMyApps.length} of ${myApps.length} applications`}
                size="small"
                sx={{ backgroundColor: "#F0F7FF", color: "#0078D4", fontWeight: 600, fontSize: "0.75rem", animation: `${scaleIn} 0.22s ease both`, ...reduceMotionSx }}
              />
            )}
          </Paper>
          <Paper
            sx={{
              borderRadius: "8px",
              border: "1px solid rgba(17, 24, 39, 0.08)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              overflow: "hidden",
              animation: `${fadeInUp} 0.42s ease both`,
              animationDelay: "140ms",
              ...reduceMotionSx,
            }}
          >
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: "#F9FAFB" }}>
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
                <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={job.id}>
                  <JobCard job={job} onSelect={setSelectedJob} isApplied={isJobApplied(job.id)} index={index} />
                </Grid>
              ))}
            </Grid>
            <Paper
              sx={{
                mt: 2,
                borderRadius: "8px",
                border: "1px solid rgba(17, 24, 39, 0.08)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
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
                  <Box><Typography variant="caption" sx={{ color: "#9CA3AF", fontWeight: 500 }}>Role</Typography><Typography variant="body1" sx={{ fontWeight: 600, color: "#111827" }}>{selectedApp.jobTitle}</Typography></Box>
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
                              transition: "transform 0.18s ease, background-color 0.18s ease",
                              "&:hover": { backgroundColor: "#DBEAFE", transform: "translateY(-1px)" },
                              "&:active": { transform: "translateY(0) scale(0.99)" },
                              ...reduceMotionSx,
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
          onClose={() => setSelectedJob(null)}
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

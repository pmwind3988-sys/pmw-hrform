import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Grid,
  CircularProgress,
  Alert,
  Collapse,
  Divider,
  Container,
  Paper,
} from "@mui/material";
import {
  Work,
  LocationOn,
  CalendarToday,
  People,
  AttachMoney,
  AccessTime,
} from "@mui/icons-material";
import { fetchJobs } from "../utils/careersService";
import type { JobListing } from "../types";

function formatSalary(min: number | null, max: number | null): string {
  if (min == null && max == null) return "";
  const fmt = (n: number) => `RM ${n.toLocaleString()}`;
  if (min != null && max != null) return `${fmt(min)} - ${fmt(max)}`;
  if (min != null) return `From ${fmt(min)}`;
  return max != null ? `Up to ${fmt(max)}` : "";
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

function JobCard({ job }: { job: JobListing }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  return (
    <Card
      sx={{
        borderRadius: "16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        cursor: "pointer",
        "&:hover": {
          boxShadow: "0 8px 25px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)",
          transform: "translateY(-2px)",
        },
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: "#111827", fontSize: "1.1rem", lineHeight: 1.3 }}>
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

        <Chip
          label={job.department}
          size="small"
          sx={{
            backgroundColor: "#6264A7",
            color: "#ffffff",
            fontWeight: 500,
            fontSize: "0.7rem",
            borderRadius: "8px",
            mb: 2,
          }}
        />

        <Grid container spacing={1} sx={{ mb: 1 }}>
          {job.location && (
            <Grid size={{ xs: 6 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <LocationOn sx={{ fontSize: 14, color: "#6B7280" }} />
                <Typography variant="body2" sx={{ color: "#6B7280", fontSize: "0.8rem" }}>
                  {job.location}
                </Typography>
              </Box>
            </Grid>
          )}
          {formatSalary(job.salaryMin, job.salaryMax) && (
            <Grid size={{ xs: 6 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <AttachMoney sx={{ fontSize: 14, color: "#6B7280" }} />
                <Typography variant="body2" sx={{ color: "#6B7280", fontSize: "0.8rem" }}>
                  {formatSalary(job.salaryMin, job.salaryMax)}
                </Typography>
              </Box>
            </Grid>
          )}
        </Grid>

        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
          {job.closingDate && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <CalendarToday sx={{ fontSize: 12, color: "#9CA3AF" }} />
              <Typography variant="caption" sx={{ color: "#9CA3AF" }}>
                Closing {formatDate(job.closingDate)}
              </Typography>
            </Box>
          )}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <People sx={{ fontSize: 12, color: "#9CA3AF" }} />
            <Typography variant="caption" sx={{ color: "#9CA3AF" }}>
              {job.applicationCount} {job.applicationCount === 1 ? "applicant" : "applicants"}
            </Typography>
          </Box>
        </Box>

        <Collapse in={expanded}>
          <Divider sx={{ mb: 2 }} />
          <Typography
            variant="body2"
            sx={{ color: "#374151", fontSize: "0.85rem", lineHeight: 1.7, mb: 2, whiteSpace: "pre-line" }}
          >
            {job.jobDescription || "No description provided."}
          </Typography>
        </Collapse>

        <Button
          variant="contained"
          fullWidth
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/careers/${job.id}/apply`);
          }}
          sx={{
            borderRadius: "12px",
            textTransform: "none",
            backgroundColor: "#0078D4",
            fontWeight: 600,
            fontSize: "0.85rem",
            py: 1.2,
            boxShadow: "0 2px 8px rgba(0, 120, 212, 0.25)",
            transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            "&:hover": {
              backgroundColor: "#106EBE",
              boxShadow: "0 4px 14px rgba(0, 120, 212, 0.35)",
              transform: "translateY(-1px)",
            },
          }}
        >
          Apply Now
        </Button>
      </CardContent>
    </Card>
  );
}

export default function CareersPage() {
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchJobs();
        if (!cancelled) setJobs(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load jobs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "#F8F9FC" }}>
      {/* Header */}
      <Paper
        sx={{
          borderRadius: 0,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          backgroundColor: "#ffffff",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 2.5 }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: "12px",
                backgroundColor: "#0078D4",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Work sx={{ fontSize: 24, color: "#ffffff" }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: "#111827", fontSize: "1.3rem", lineHeight: 1.2 }}>
                Career Opportunities
              </Typography>
              <Typography variant="body2" sx={{ color: "#6B7280", fontSize: "0.85rem" }}>
                Explore open positions and join our team
              </Typography>
            </Box>
          </Box>
        </Container>
      </Paper>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Loading */}
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <Box sx={{ textAlign: "center" }}>
              <CircularProgress size={40} sx={{ color: "#0078D4", mb: 2 }} />
              <Typography variant="body2" sx={{ color: "#6B7280" }}>
                Loading positions...
              </Typography>
            </Box>
          </Box>
        )}

        {/* Error */}
        {!loading && error && (
          <Alert
            severity="error"
            sx={{ borderRadius: "12px", mb: 3 }}
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
          <Box sx={{ textAlign: "center", py: 8 }}>
            <AccessTime sx={{ fontSize: 48, color: "#D1D5DB", mb: 2 }} />
            <Typography variant="h6" sx={{ color: "#6B7280", fontWeight: 600, mb: 0.5 }}>
              No Open Positions
            </Typography>
            <Typography variant="body2" sx={{ color: "#9CA3AF" }}>
              There are no job openings at the moment. Please check back later.
            </Typography>
          </Box>
        )}

        {/* Job Cards Grid */}
        {!loading && !error && jobs.length > 0 && (
          <Grid container spacing={2.5}>
            {jobs.map((job) => (
              <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={job.id}>
                <JobCard job={job} />
              </Grid>
            ))}
          </Grid>
        )}
      </Container>
    </Box>
  );
}

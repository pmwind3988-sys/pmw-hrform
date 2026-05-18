import { useState, useEffect, useCallback } from "react";
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
  CircularProgress,
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
} from "@mui/material";
import {
  Close,
  Refresh,
  People,
  NewReleases,
  CheckCircle,
} from "@mui/icons-material";
import { fetchApplications, updateApplicationStatus } from "../utils/careersService";
import type { JobAdminApplication } from "../types";

const STATUS_OPTIONS = ["New", "Reviewed"] as const;

const STATUS_COLORS: Record<string, string> = {
  New: "#0078D4",
  Reviewed: "#34A853",
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApplications();
      setApplications(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load applications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleStatusChange = useCallback(
    async (applicationId: string, newStatus: string) => {
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
      }
    },
    [],
  );

  const stats = {
    total: applications.length,
    new: applications.filter((a) => a.status === "New").length,
    reviewed: applications.filter((a) => a.status === "Reviewed").length,
  };

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
        <Box sx={{ maxWidth: 1280, mx: "auto", px: { xs: 2, sm: 3, md: 4 }, py: 2.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: "#111827", fontSize: "1.3rem" }}>
                Job Applications
              </Typography>
              <Typography variant="body2" sx={{ color: "#6B7280", fontSize: "0.85rem" }}>
                Manage incoming applications
              </Typography>
            </Box>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={load}
              disabled={loading}
              sx={{
                borderRadius: "10px",
                textTransform: "none",
                fontWeight: 600,
                borderColor: "#D1D5DB",
                color: "#6B7280",
              }}
            >
              Refresh
            </Button>
          </Box>
        </Box>
      </Paper>

      <Box sx={{ maxWidth: 1280, mx: "auto", px: { xs: 2, sm: 3, md: 4 }, py: 3 }}>
        {/* Stats Row */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: "Total Applications", value: stats.total, icon: <People />, color: "#0078D4" },
            { label: "New", value: stats.new, icon: <NewReleases />, color: "#F59E0B" },
            { label: "Reviewed", value: stats.reviewed, icon: <CheckCircle />, color: "#34A853" },
          ].map((stat) => (
            <Grid size={{ xs: 6, sm: 4 }} key={stat.label}>
              <Card
                sx={{
                  borderRadius: "16px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  transition: "transform 0.2s",
                  "&:hover": { transform: "translateY(-2px)" },
                }}
              >
                <CardContent sx={{ p: 2.5 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
                    <Box sx={{ color: stat.color, display: "flex" }}>{stat.icon}</Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: "#111827" }}>
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
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress size={40} sx={{ color: "#0078D4" }} />
          </Box>
        )}

        {/* Error */}
        {!loading && error && (
          <Alert
            severity="error"
            sx={{ borderRadius: "12px", mb: 3 }}
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
        {!loading && !error && applications.length === 0 && (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <People sx={{ fontSize: 48, color: "#D1D5DB", mb: 2 }} />
            <Typography variant="h6" sx={{ color: "#6B7280", fontWeight: 600 }}>
              No Applications Yet
            </Typography>
            <Typography variant="body2" sx={{ color: "#9CA3AF" }}>
              Applications from job postings will appear here.
            </Typography>
          </Box>
        )}

        {/* Table */}
        {!loading && !error && applications.length > 0 && (
          <TableContainer
            component={Paper}
            sx={{
              borderRadius: "16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              overflow: "hidden",
            }}
          >
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: "#F9FAFB" }}>
                  <TableCell sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", textTransform: "uppercase" }}>
                    Reference
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", textTransform: "uppercase" }}>
                    Applicant
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", textTransform: "uppercase" }}>
                    Job Title
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
                {applications.map((app) => (
                  <TableRow
                    key={app.id}
                    hover
                    sx={{ cursor: "pointer", "&:hover": { backgroundColor: "#FAFBFC" } }}
                    onClick={() => setSelectedApp(app)}
                  >
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
                      <Select
                        value={app.status}
                        size="small"
                        onChange={(e) => handleStatusChange(app.id, e.target.value)}
                        sx={{
                          borderRadius: "8px",
                          fontSize: "0.8rem",
                          minWidth: 120,
                          "& .MuiOutlinedInput-notchedOutline": { borderColor: "#E5E7EB" },
                        }}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <MenuItem key={opt} value={opt} sx={{ fontSize: "0.85rem" }}>
                            {opt}
                          </MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
              sx: { borderRadius: "16px", p: 1 },
            },
          }}
        >
          {selectedApp && (
            <>
              <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: "#111827" }}>
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

                  {(selectedApp.resumeUrl || selectedApp.coverLetterUrl) && (
                    <Box>
                      <Typography variant="caption" sx={{ color: "#9CA3AF", fontWeight: 500 }}>
                        Documents
                      </Typography>
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 0.5 }}>
                        {selectedApp.resumeUrl && (
                          <a href={selectedApp.resumeUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#0078D4", fontSize: "0.85rem" }}>
                            View Resume
                          </a>
                        )}
                        {selectedApp.coverLetterUrl && (
                          <a href={selectedApp.coverLetterUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#0078D4", fontSize: "0.85rem" }}>
                            View Cover Letter
                          </a>
                        )}
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
                  sx={{ borderRadius: "10px", textTransform: "none", borderColor: "#D1D5DB", color: "#6B7280" }}
                >
                  Close
                </Button>
              </DialogActions>
            </>
          )}
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
              sx={{ borderRadius: "10px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
            >
              {snackbar.message}
            </Alert>
          ) : undefined}
        </Snackbar>
      </Box>
    </Box>
  );
}

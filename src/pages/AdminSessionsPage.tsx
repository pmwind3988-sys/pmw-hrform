/**
 * AdminSessionsPage.tsx — Session monitoring dashboard for admins
 * Route: /admin/sessions
 *
 * Shows: active sessions, session history, Azure AD sign-in logs
 */
import { useState, useEffect, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  Tab,
  Tabs,
  Alert,
  CircularProgress,
} from "@mui/material";
import {
  RefreshOutlined as RefreshIcon,
  DeleteOutlined as DeleteIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";

const SP_SCOPE = (() => {
  try {
    const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
    return `${new URL(SP_SITE_URL).origin}/AllSites.Manage`;
  } catch {
    return "https://graph.microsoft.com/.default";
  }
})();

interface SessionEntry {
  sessionId: string;
  userEmail: string;
  userObjectId: string;
  startedAt: string;
  lastActivityAt: string;
  userAgent: string;
  ipAddress: string;
  isActive: boolean;
  isAdmin?: boolean;
}

interface SignInLogEntry {
  id: string;
  userDisplayName: string;
  userPrincipalName: string;
  appDisplayName: string;
  createdDateTime: string;
  status: string;
  ipAddress: string;
  isInteractive: boolean;
  clientAppUsed: string;
  errorCode: number | null;
}

type TabValue = "active" | "history" | "signins";

export default function AdminSessionsPage() {
  const { instance, accounts } = useMsal();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabValue>("active");
  const [activeSessions, setActiveSessions] = useState<SessionEntry[]>([]);
  const [sessionHistory, setSessionHistory] = useState<SessionEntry[]>([]);
  const [signInLogs, setSignInLogs] = useState<SignInLogEntry[]>([]);
  const [signInLogError, setSignInLogError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await instance.acquireTokenSilent({
        scopes: [SP_SCOPE],
        account: accounts[0],
      });
      const res = await fetch("/api/admin/sessions", {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        activeSessions: SessionEntry[];
        sessionHistory: SessionEntry[];
        signInLogs: SignInLogEntry[];
        signInLogError?: string;
      };

      setActiveSessions(data.activeSessions || []);
      setSessionHistory(data.sessionHistory || []);
      setSignInLogs(data.signInLogs || []);
      setSignInLogError(data.signInLogError || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch sessions");
    } finally {
      setLoading(false);
    }
  }, [instance, accounts]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleForceInvalidate = async (sessionId: string) => {
    try {
      const token = await instance.acquireTokenSilent({
        scopes: [SP_SCOPE],
        account: accounts[0],
      });
      await fetch("/api/session/release", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.accessToken}`,
        },
        body: JSON.stringify({ sessionId }),
      });
      // Refresh the list
      fetchSessions();
    } catch {
      // Ignore
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const truncateUA = (ua: string) => {
    if (!ua || ua === "Unknown") return "—";
    if (ua.length > 60) return ua.slice(0, 60) + "...";
    return ua;
  };

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "#F8F9FC" }}>
      {/* Header */}
      <Box
        sx={{
          backgroundColor: "#FFFFFF",
          borderBottom: "1px solid #E5E7EB",
          px: { xs: 2, sm: 4 },
          py: 2,
        }}
      >
        <Box sx={{ maxWidth: 1280, mx: "auto", display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: "#111827" }}>
              Session Monitoring
            </Typography>
            <Typography variant="body2" sx={{ color: "#6B7280", mt: 0.25 }}>
              Active sessions, history, and Azure AD sign-in logs
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchSessions}
            disabled={loading}
            sx={{ borderRadius: "10px", textTransform: "none" }}
          >
            Refresh
          </Button>
          <Button
            variant="text"
            onClick={() => navigate("/admin/dashboard")}
            sx={{ borderRadius: "10px", textTransform: "none", color: "#6B7280" }}
          >
            Back to Dashboard
          </Button>
        </Box>
      </Box>

      <Box sx={{ maxWidth: 1280, mx: "auto", px: { xs: 2, sm: 4 }, py: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: "10px" }}>
            {error}
          </Alert>
        )}

        {signInLogError && (
          <Alert severity="warning" sx={{ mb: 2, borderRadius: "10px" }}>
            Azure AD sign-in logs unavailable: {signInLogError}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* Tabs */}
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              sx={{ mb: 2, "& .MuiTab-root": { textTransform: "none", fontWeight: 500 } }}
            >
              <Tab value="active" label={`Active Sessions (${activeSessions.length})`} />
              <Tab value="history" label="Session History" />
              <Tab value="signins" label="Azure AD Sign-in Logs" />
            </Tabs>

            {/* Active Sessions */}
            {tab === "active" && (
              <TableContainer component={Paper} sx={{ borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "#F9FAFB" }}>
                      <TableCell sx={{ fontWeight: 600 }}>User</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Started At</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Last Activity</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Browser</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>IP</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {activeSessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 4, color: "#9CA3AF" }}>
                          No active sessions
                        </TableCell>
                      </TableRow>
                    ) : (
                      activeSessions.map((s) => (
                        <TableRow key={s.sessionId} hover>
                          <TableCell sx={{ fontWeight: 500 }}>{s.userEmail}</TableCell>
                          <TableCell>{formatDate(s.startedAt)}</TableCell>
                          <TableCell>{formatDate(s.lastActivityAt)}</TableCell>
                          <TableCell sx={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {truncateUA(s.userAgent)}
                          </TableCell>
                          <TableCell>{s.ipAddress || "—"}</TableCell>
                          <TableCell>
                            <Chip
                              label={s.isAdmin ? "Admin" : "User"}
                              size="small"
                              color={s.isAdmin ? "primary" : "default"}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              size="small"
                              color="error"
                              startIcon={<DeleteIcon />}
                              onClick={() => handleForceInvalidate(s.sessionId)}
                              sx={{ textTransform: "none", borderRadius: "8px" }}
                            >
                              End
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {/* Session History */}
            {tab === "history" && (
              <TableContainer component={Paper} sx={{ borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "#F9FAFB" }}>
                      <TableCell sx={{ fontWeight: 600 }}>User</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Session ID</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Started At</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Last Activity</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>IP</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sessionHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 4, color: "#9CA3AF" }}>
                          No session history available
                        </TableCell>
                      </TableRow>
                    ) : (
                      sessionHistory.map((s, i) => (
                        <TableRow key={s.sessionId || i} hover>
                          <TableCell sx={{ fontWeight: 500 }}>{s.userEmail}</TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                              {s.sessionId ? s.sessionId.slice(0, 12) + "..." : "—"}
                            </Typography>
                          </TableCell>
                          <TableCell>{formatDate(s.startedAt)}</TableCell>
                          <TableCell>{formatDate(s.lastActivityAt)}</TableCell>
                          <TableCell>
                            <Chip
                              label={s.isActive ? "Active" : "Ended"}
                              size="small"
                              color={s.isActive ? "success" : "default"}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>{s.ipAddress || "—"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {/* Azure AD Sign-in Logs */}
            {tab === "signins" && (
              <TableContainer component={Paper} sx={{ borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "#F9FAFB" }}>
                      <TableCell sx={{ fontWeight: 600 }}>User</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Date/Time</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>IP Address</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>App</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Client</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {signInLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 4, color: "#9CA3AF" }}>
                          {signInLogError ? "Sign-in logs unavailable" : "No sign-in records found"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      signInLogs.slice(0, 50).map((log) => (
                        <TableRow key={log.id} hover>
                          <TableCell sx={{ fontWeight: 500 }}>
                            {log.userDisplayName || log.userPrincipalName}
                          </TableCell>
                          <TableCell>{formatDate(log.createdDateTime)}</TableCell>
                          <TableCell>
                            <Chip
                              label={log.status || "Unknown"}
                              size="small"
                              color={log.status === "Success" ? "success" : "error"}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>{log.ipAddress || "—"}</TableCell>
                          <TableCell>{log.appDisplayName || "—"}</TableCell>
                          <TableCell>{log.clientAppUsed || "—"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}

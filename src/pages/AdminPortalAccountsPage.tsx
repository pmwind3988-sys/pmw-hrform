import { useCallback, useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AutorenewOutlined,
  BadgeOutlined,
  BlockOutlined,
  CheckCircleOutlined,
  ContentCopyOutlined,
  DeleteOutlined,
  HistoryOutlined,
  LockOpenOutlined,
  MoreVert,
  PersonAddAlt1Outlined,
  Refresh,
  VisibilityOffOutlined,
  VisibilityOutlined,
  VpnKeyOutlined,
} from "@mui/icons-material";
import LearningHeader from "../components/learning/LearningHeader";
import {
  LearningEmptyState,
  learningButtonSx,
  learningContentSx,
  learningPageSx,
  learningPanelSx,
} from "../components/learning/learningUi";
import {
  createPortalAccount,
  deletePortalAccount,
  ensurePortalAccountsSchema,
  fetchPortalAccessLog,
  generatePortalPassword,
  listPortalAccounts,
  normalizePortalLoginId,
  resetPortalPassword,
  setPortalAccountStatus,
  suggestLoginId,
  unlockPortalAccount,
  MIN_PORTAL_PASSWORD_LENGTH,
  type PortalAccessLogEntry,
  type PortalAccountSummary,
} from "../utils/internalAccountService";
import { acquireAccessTokenSilentOrRedirect } from "../utils/authRecovery";
import { loginRequest } from "../auth/msalConfig";
import { formatDashboardDate, formatDashboardTime } from "../utils/submissionDisplay";
import { editorial } from "../theme/editorial";

/**
 * Portal accounts — where HR issues, suspends and revokes the login-ID accounts
 * that let someone with no PMW mailbox into the learning hub, and reads the
 * named record of what those accounts have opened.
 *
 * The screen is built around one fact that shapes everything on it: **a password
 * is stored as a one-way hash and can never be read back.** So the moment of
 * creation is also the only moment the password exists in readable form, and the
 * interface treats it that way — generating it, showing it once against a
 * deliberate hand-over panel, and offering replacement rather than recovery
 * everywhere afterwards. Any design that implies a password can be looked up
 * later would be lying about the system underneath.
 */

type Feedback = { message: string; severity: "success" | "error" } | null;

/** The credentials hand-over step, shown once and never recoverable after it. */
interface Handover {
  title: string;
  fullName: string;
  loginId: string;
  password: string;
}

type ConfirmKind = "disable" | "enable" | "delete";

interface ConfirmState {
  kind: ConfirmKind;
  account: PortalAccountSummary;
}

function formatWhen(value: string, fallback: string): string {
  if (!value) return fallback;
  const date = formatDashboardDate(value, "");
  if (!date) return fallback;
  const time = formatDashboardTime(value);
  return time ? `${date}, ${time}` : date;
}

export default function AdminPortalAccountsPage() {
  const { instance } = useMsal();

  const [spToken, setSpToken] = useState("");
  const [accounts, setAccounts] = useState<PortalAccountSummary[]>([]);
  const [provisioned, setProvisioned] = useState(true);
  const [sessionsConfigured, setSessionsConfigured] = useState(true);
  const [log, setLog] = useState<PortalAccessLogEntry[]>([]);
  /** When the entries on screen were read. Bumping the key re-reads them. */
  const [logReadAt, setLogReadAt] = useState<Date | null>(null);
  const [logRefreshKey, setLogRefreshKey] = useState(0);

  const [tab, setTab] = useState<"accounts" | "log">("accounts");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [menuFor, setMenuFor] = useState<{ anchor: HTMLElement; account: PortalAccountSummary } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetFor, setResetFor] = useState<PortalAccountSummary | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [handover, setHandover] = useState<Handover | null>(null);
  const [logFilter, setLogFilter] = useState("");

  const load = useCallback(
    async (token: string) => {
      const snapshot = await listPortalAccounts(token);
      setAccounts(snapshot.accounts);
      setProvisioned(snapshot.provisioned);
      setSessionsConfigured(snapshot.sessionsConfigured);
      return snapshot;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
        const token = await acquireAccessTokenSilentOrRedirect(instance, {
          scopes: loginRequest.scopes,
          account: account ?? undefined,
        });
        if (cancelled) return;
        setSpToken(token);
        await load(token);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load portal accounts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [instance, load]);

  /**
   * The log is fetched when its tab is opened rather than alongside the accounts:
   * it is the larger read of the two and most visits here are to create or reset
   * an account, not to read history.
   *
   * **Every** time the tab is opened, though, and never once per page load. A
   * trail is read to find out what has happened since last time, so an admin who
   * checks it, has somebody open a material, and comes back to look is asking a
   * new question — and answering it from a cached empty list is how you conclude
   * that logging is broken when it is working perfectly.
   */
  useEffect(() => {
    if (tab !== "log" || !spToken) return;

    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const entries = await fetchPortalAccessLog(spToken);
        if (cancelled) return;
        setLog(entries);
        setLogReadAt(new Date());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the access log.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tab, spToken, logRefreshKey]);

  const runAction = useCallback(
    async (work: () => Promise<void>, successMessage: string) => {
      setBusy(true);
      setError("");
      try {
        await work();
        await load(spToken);
        setFeedback({ message: successMessage, severity: "success" });
      } catch (e) {
        setFeedback({
          message: e instanceof Error ? e.message : "That did not work. Please try again.",
          severity: "error",
        });
      } finally {
        setBusy(false);
      }
    },
    [load, spToken],
  );

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      await load(spToken);
      if (tab === "log") setLog(await fetchPortalAccessLog(spToken));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh.");
    } finally {
      setBusy(false);
    }
  }, [load, spToken, tab]);

  const handleProvision = () =>
    runAction(async () => {
      await ensurePortalAccountsSchema(spToken);
    }, "Portal account storage is ready.");

  const copyToClipboard = useCallback(async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback({ message: `${what} copied.`, severity: "success" });
    } catch {
      // Clipboard access can be refused outright; the value is on screen anyway.
      setFeedback({ message: "Could not copy — select the text and copy it manually.", severity: "error" });
    }
  }, []);

  const closeMenu = () => setMenuFor(null);

  const filteredLog = useMemo(() => {
    const needle = logFilter.trim().toLowerCase();
    if (!needle) return log;
    return log.filter(
      (entry) =>
        entry.viewerName.toLowerCase().includes(needle) ||
        entry.loginId.toLowerCase().includes(needle) ||
        entry.materialName.toLowerCase().includes(needle),
    );
  }, [log, logFilter]);

  const activeCount = accounts.filter((account) => account.status === "active").length;

  if (loading) {
    return (
      <Box sx={{ ...learningPageSx, display: "grid", placeItems: "center" }}>
        <Stack spacing={2} sx={{ alignItems: "center" }}>
          <CircularProgress />
          <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 700 }}>
            Loading portal accounts...
          </Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={learningPageSx}>
      <LearningHeader
        title="Portal accounts"
        subtitle="Login-ID accounts for people without a PMW Microsoft 365 mailbox."
        backPath="/admin/dashboard"
        backLabel="Back to the dashboard"
        actions={
          <>
            <Button
              size="small"
              startIcon={<Refresh />}
              onClick={refresh}
              disabled={busy}
              sx={{ ...learningButtonSx, color: editorial.pmwBlueDark }}
            >
              Refresh
            </Button>
            {provisioned && (
              <Button
                size="small"
                variant="contained"
                startIcon={<PersonAddAlt1Outlined />}
                onClick={() => setCreateOpen(true)}
                disabled={busy}
                sx={learningButtonSx}
              >
                New account
              </Button>
            )}
          </>
        }
      />

      {busy && <LinearProgress sx={{ height: 3 }} />}

      <Container maxWidth="xl" disableGutters>
        <Box sx={learningContentSx}>
          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: "10px", fontWeight: 700 }}>
              {error}
            </Alert>
          )}

          {provisioned && !sessionsConfigured && (
            <Alert severity="warning" sx={{ mb: 2, borderRadius: "10px", fontWeight: 700 }}>
              Portal sign-in is switched off. These accounts exist but nobody can use them until
              <Box component="code" sx={{ mx: 0.75, fontWeight: 900 }}>
                INTERNAL_SESSION_SECRET
              </Box>
              is set in the Vercel environment variables and the site is redeployed.
            </Alert>
          )}

          {!provisioned ? (
            <LearningEmptyState
              icon={<BadgeOutlined />}
              title="Set up portal accounts"
              description={`This creates the "Internal Accounts" list and the "Learning Access Log" list in SharePoint. Accounts live in the first; every material a portal account opens is recorded in the second.`}
              action={
                <Button
                  variant="contained"
                  startIcon={<BadgeOutlined />}
                  onClick={handleProvision}
                  disabled={busy || !spToken}
                  sx={learningButtonSx}
                >
                  Set up
                </Button>
              }
            />
          ) : (
            <Paper sx={{ ...learningPanelSx, overflow: "hidden" }}>
              <Tabs
                value={tab}
                onChange={(_, next: "accounts" | "log") => setTab(next)}
                sx={{
                  px: { xs: 1, sm: 2 },
                  borderBottom: `1px solid ${editorial.border}`,
                  "& .MuiTab-root": { textTransform: "none", fontWeight: 800, minHeight: 52 },
                }}
              >
                <Tab
                  value="accounts"
                  label={`Accounts${accounts.length ? ` (${accounts.length})` : ""}`}
                  icon={<BadgeOutlined fontSize="small" />}
                  iconPosition="start"
                />
                <Tab
                  value="log"
                  label="Access log"
                  icon={<HistoryOutlined fontSize="small" />}
                  iconPosition="start"
                />
              </Tabs>

              {tab === "accounts" ? (
                accounts.length === 0 ? (
                  <Box sx={{ p: { xs: 3, md: 5 } }}>
                    <LearningEmptyState
                      icon={<PersonAddAlt1Outlined />}
                      title="No portal accounts yet"
                      description="Create one for each person outside the company who needs to reach the learning hub. You choose their login ID and password, and hand both over yourself — nothing is emailed."
                      action={
                        <Button
                          variant="contained"
                          startIcon={<PersonAddAlt1Outlined />}
                          onClick={() => setCreateOpen(true)}
                          sx={learningButtonSx}
                        >
                          Create the first account
                        </Button>
                      }
                    />
                  </Box>
                ) : (
                  <>
                    <Box sx={{ px: { xs: 2, sm: 3 }, py: 1.5 }}>
                      <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 700 }}>
                        {activeCount} active
                        {accounts.length - activeCount > 0 && ` · ${accounts.length - activeCount} disabled`}
                      </Typography>
                    </Box>
                    <TableContainer>
                      <Table size="medium" sx={{ minWidth: 720 }}>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 900 }}>Person</TableCell>
                            <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 900 }}>Last sign-in</TableCell>
                            <TableCell sx={{ fontWeight: 900 }}>Created</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 900 }}>
                              Manage
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {accounts.map((account) => (
                            <TableRow key={account.loginId} hover>
                              <TableCell>
                                <Typography sx={{ fontWeight: 800, color: editorial.ink }}>
                                  {account.fullName}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  sx={{ color: editorial.muted, fontWeight: 700 }}
                                >
                                  {account.loginId}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.75 }}>
                                  <Chip
                                    size="small"
                                    label={account.status === "active" ? "Active" : "Disabled"}
                                    sx={{
                                      fontWeight: 800,
                                      backgroundColor:
                                        account.status === "active" ? "#E8F5E9" : editorial.paper,
                                      color:
                                        account.status === "active" ? editorial.success : editorial.muted,
                                    }}
                                  />
                                  {account.locked && (
                                    <Chip
                                      size="small"
                                      label="Locked out"
                                      sx={{
                                        fontWeight: 800,
                                        backgroundColor: editorial.yellowSoft,
                                        color: editorial.warning,
                                      }}
                                    />
                                  )}
                                </Stack>
                              </TableCell>
                              <TableCell sx={{ color: editorial.muted, fontWeight: 700 }}>
                                {formatWhen(account.lastLoginAt, "Never")}
                              </TableCell>
                              <TableCell sx={{ color: editorial.muted, fontWeight: 700 }}>
                                {formatWhen(account.createdAt, "—")}
                              </TableCell>
                              <TableCell align="right">
                                <Tooltip title={`Manage ${account.fullName}`}>
                                  <IconButton
                                    onClick={(event) =>
                                      setMenuFor({ anchor: event.currentTarget, account })
                                    }
                                    disabled={busy}
                                    aria-label={`Manage ${account.fullName}`}
                                  >
                                    <MoreVert />
                                  </IconButton>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </>
                )
              ) : (
                <Box>
                  <Box sx={{ px: { xs: 2, sm: 3 }, py: 2 }}>
                    <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 700, mb: 1.5 }}>
                      Every material opened by a portal account, newest first. Staff signing in with
                      Microsoft 365 are not listed here — their views stay anonymous.
                    </Typography>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1.5}
                      sx={{ alignItems: { sm: "center" } }}
                    >
                      <TextField
                        size="small"
                        fullWidth
                        value={logFilter}
                        onChange={(event) => setLogFilter(event.target.value)}
                        placeholder="Filter by person or material"
                        sx={{ maxWidth: 420 }}
                      />
                      <Button
                        size="small"
                        startIcon={<Refresh />}
                        disabled={busy}
                        onClick={() => setLogRefreshKey((key) => key + 1)}
                        sx={learningButtonSx}
                      >
                        Refresh
                      </Button>
                      {logReadAt && (
                        <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 700 }}>
                          Read at {logReadAt.toLocaleTimeString()}
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                  {filteredLog.length === 0 ? (
                    <Box sx={{ px: { xs: 2, sm: 3 }, pb: 4 }}>
                      <Typography sx={{ color: editorial.muted, fontWeight: 700 }}>
                        {log.length === 0
                          ? "Nothing recorded yet. Entries appear here once a portal account opens a material."
                          : "No entries match that filter."}
                      </Typography>
                    </Box>
                  ) : (
                    <TableContainer>
                      <Table size="medium" sx={{ minWidth: 640 }}>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 900 }}>When</TableCell>
                            <TableCell sx={{ fontWeight: 900 }}>Person</TableCell>
                            <TableCell sx={{ fontWeight: 900 }}>Material</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {filteredLog.map((entry, index) => (
                            <TableRow key={`${entry.loginId}-${entry.materialId}-${entry.viewedAt}-${index}`} hover>
                              <TableCell sx={{ color: editorial.muted, fontWeight: 700, whiteSpace: "nowrap" }}>
                                {formatWhen(entry.viewedAt, "—")}
                              </TableCell>
                              <TableCell>
                                <Typography sx={{ fontWeight: 800, color: editorial.ink }}>
                                  {entry.viewerName || entry.loginId}
                                </Typography>
                                <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 700 }}>
                                  {entry.loginId}
                                </Typography>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, color: editorial.ink }}>
                                {entry.materialName || "(material removed)"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              )}
            </Paper>
          )}
        </Box>
      </Container>

      <Menu anchorEl={menuFor?.anchor ?? null} open={Boolean(menuFor)} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            setResetFor(menuFor?.account ?? null);
            closeMenu();
          }}
        >
          <ListItemIcon>
            <VpnKeyOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Reset password" />
        </MenuItem>

        {menuFor?.account.locked && (
          <MenuItem
            onClick={() => {
              const account = menuFor.account;
              closeMenu();
              void runAction(
                () => unlockPortalAccount(account.loginId, spToken),
                `${account.fullName} can try signing in again.`,
              );
            }}
          >
            <ListItemIcon>
              <LockOpenOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Unlock" />
          </MenuItem>
        )}

        <MenuItem
          onClick={() => {
            if (menuFor) {
              setConfirm({
                kind: menuFor.account.status === "active" ? "disable" : "enable",
                account: menuFor.account,
              });
            }
            closeMenu();
          }}
        >
          <ListItemIcon>
            {menuFor?.account.status === "active" ? (
              <BlockOutlined fontSize="small" />
            ) : (
              <CheckCircleOutlined fontSize="small" />
            )}
          </ListItemIcon>
          <ListItemText primary={menuFor?.account.status === "active" ? "Disable" : "Enable"} />
        </MenuItem>

        <Divider />

        <MenuItem
          onClick={() => {
            if (menuFor) setConfirm({ kind: "delete", account: menuFor.account });
            closeMenu();
          }}
          sx={{ color: editorial.error }}
        >
          <ListItemIcon>
            <DeleteOutlined fontSize="small" sx={{ color: editorial.error }} />
          </ListItemIcon>
          <ListItemText primary="Delete" />
        </MenuItem>
      </Menu>

      {createOpen && (
        <CreateAccountDialog
          busy={busy}
          onClose={() => setCreateOpen(false)}
          onCreate={async (input) => {
            await createPortalAccount(input, spToken);
            await load(spToken);
            setCreateOpen(false);
            setHandover({
              title: "Account created",
              fullName: input.fullName,
              loginId: input.loginId,
              password: input.password,
            });
          }}
        />
      )}

      {resetFor && (
        <ResetPasswordDialog
          account={resetFor}
          busy={busy}
          onClose={() => setResetFor(null)}
          onReset={async (account, password) => {
            await resetPortalPassword(account.loginId, password, spToken);
            await load(spToken);
            setResetFor(null);
            setHandover({
              title: "Password reset",
              fullName: account.fullName,
              loginId: account.loginId,
              password,
            });
          }}
        />
      )}

      <HandoverDialog handover={handover} onClose={() => setHandover(null)} onCopy={copyToClipboard} />

      <ConfirmDialog
        state={confirm}
        onClose={() => setConfirm(null)}
        onConfirm={(state) => {
          setConfirm(null);
          if (state.kind === "delete") {
            void runAction(
              () => deletePortalAccount(state.account.loginId, spToken),
              `${state.account.fullName}'s account was deleted.`,
            );
            return;
          }
          const nextStatus = state.kind === "disable" ? "disabled" : "active";
          void runAction(
            () => setPortalAccountStatus(state.account.loginId, nextStatus, spToken),
            state.kind === "disable"
              ? `${state.account.fullName} has been signed out and cannot sign in again.`
              : `${state.account.fullName} can sign in again.`,
          );
        }}
      />

      <Snackbar
        open={Boolean(feedback)}
        autoHideDuration={5000}
        onClose={() => setFeedback(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={feedback?.severity ?? "success"}
          onClose={() => setFeedback(null)}
          sx={{ borderRadius: "10px", fontWeight: 700 }}
        >
          {feedback?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// ── Password field ───────────────────────────────────────────────────────────

/**
 * Shown, not hidden. The usual dots exist to stop a shoulder-surfer reading
 * *your own* password back — but this one belongs to somebody else, HR is about
 * to read it out to them, and it is only visible on this screen once. Masking it
 * here would hide the field from the one person who needs to transcribe it.
 */
function PasswordField({
  value,
  onChange,
  reveal,
  onToggleReveal,
}: {
  value: string;
  onChange: (next: string) => void;
  reveal: boolean;
  onToggleReveal: () => void;
}) {
  const tooShort = value.length > 0 && value.length < MIN_PORTAL_PASSWORD_LENGTH;

  return (
    <TextField
      label="Password"
      fullWidth
      type={reveal ? "text" : "password"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={tooShort}
      helperText={
        tooShort
          ? `At least ${MIN_PORTAL_PASSWORD_LENGTH} characters.`
          : "Generated for you. Edit it if you would rather choose one."
      }
      slotProps={{
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <Tooltip title={reveal ? "Hide" : "Show"}>
                <IconButton onClick={onToggleReveal} edge="end" aria-label={reveal ? "Hide password" : "Show password"}>
                  {reveal ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
                </IconButton>
              </Tooltip>
              <Tooltip title="Generate a new one">
                <IconButton onClick={() => onChange(generatePortalPassword())} edge="end" aria-label="Generate a new password">
                  <AutorenewOutlined />
                </IconButton>
              </Tooltip>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

// ── Create ───────────────────────────────────────────────────────────────────

/**
 * Mounted only while it is open, which is what guarantees the generated password
 * is new every time. Resetting the fields on an `open` prop instead would leave
 * one person's password sitting in state until the next reset ran — and a reset
 * that is ever skipped hands the second person the first person's credentials.
 */
function CreateAccountDialog({
  busy,
  onClose,
  onCreate,
}: {
  busy: boolean;
  onClose: () => void;
  onCreate: (input: { fullName: string; loginId: string; password: string }) => Promise<void>;
}) {
  const [fullName, setFullName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [loginIdEdited, setLoginIdEdited] = useState(false);
  const [password, setPassword] = useState(generatePortalPassword);
  const [reveal, setReveal] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState("");

  const applyFullName = (next: string) => {
    setFullName(next);
    // The suggestion follows the name until HR types their own, and then stops —
    // silently overwriting a deliberate login ID on the next keystroke would be
    // worse than offering nothing.
    if (!loginIdEdited) setLoginId(suggestLoginId(next));
  };

  const valid =
    fullName.trim().length >= 2 && loginId.length >= 3 && password.length >= MIN_PORTAL_PASSWORD_LENGTH;

  const submit = async () => {
    setSubmitting(true);
    setFailure("");
    try {
      await onCreate({ fullName: fullName.replace(/\s+/g, " ").trim(), loginId, password });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Could not create the account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 900 }}>New portal account</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {failure && (
            <Alert severity="error" sx={{ borderRadius: "10px", fontWeight: 700 }}>
              {failure}
            </Alert>
          )}
          <TextField
            label="Full name"
            fullWidth
            autoFocus
            value={fullName}
            onChange={(event) => applyFullName(event.target.value)}
            helperText="Shown to them in the learning hub, and in the access log."
          />
          <TextField
            label="Login ID"
            fullWidth
            value={loginId}
            onChange={(event) => {
              setLoginIdEdited(true);
              setLoginId(normalizePortalLoginId(event.target.value));
            }}
            helperText="What they type to sign in. Letters, numbers, dots, dashes and underscores."
          />
          <PasswordField
            value={password}
            onChange={setPassword}
            reveal={reveal}
            onToggleReveal={() => setReveal((current) => !current)}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={submitting} sx={learningButtonSx}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={!valid || submitting || busy}
          sx={learningButtonSx}
        >
          {submitting ? "Creating..." : "Create account"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Reset ────────────────────────────────────────────────────────────────────

/** Mounted per reset, for the same reason `CreateAccountDialog` is. */
function ResetPasswordDialog({
  account,
  busy,
  onClose,
  onReset,
}: {
  account: PortalAccountSummary;
  busy: boolean;
  onClose: () => void;
  onReset: (account: PortalAccountSummary, password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState(generatePortalPassword);
  const [reveal, setReveal] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState("");

  const submit = async () => {
    setSubmitting(true);
    setFailure("");
    try {
      await onReset(account, password);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Could not reset the password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 900 }}>Reset password</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {failure && (
            <Alert severity="error" sx={{ borderRadius: "10px", fontWeight: 700 }}>
              {failure}
            </Alert>
          )}
          <DialogContentText sx={{ fontWeight: 700, color: editorial.muted }}>
            This replaces the password for <strong>{account.fullName}</strong> ({account.loginId}) and signs
            them out on every device. Their old password stops working immediately.
          </DialogContentText>
          <PasswordField
            value={password}
            onChange={setPassword}
            reveal={reveal}
            onToggleReveal={() => setReveal((current) => !current)}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={submitting} sx={learningButtonSx}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={password.length < MIN_PORTAL_PASSWORD_LENGTH || submitting || busy}
          sx={learningButtonSx}
        >
          {submitting ? "Resetting..." : "Reset password"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Hand-over ────────────────────────────────────────────────────────────────

/**
 * The one screen in the app where a password is readable, and the last one.
 * Everything about it — the warning, the copy buttons, the single "Done" — is
 * built to make HR finish the hand-over here rather than assume they can come
 * back for it.
 */
function HandoverDialog({
  handover,
  onClose,
  onCopy,
}: {
  handover: Handover | null;
  onClose: () => void;
  onCopy: (text: string, what: string) => Promise<void>;
}) {
  if (!handover) return null;

  const both = `Login ID: ${handover.loginId}\nPassword: ${handover.password}`;

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 900 }}>{handover.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Alert severity="warning" sx={{ borderRadius: "10px", fontWeight: 700 }}>
            Copy this password now. It cannot be shown again — if it is lost, the only way forward is another
            reset.
          </Alert>

          <Typography sx={{ fontWeight: 800, color: editorial.ink }}>
            Give these to {handover.fullName}:
          </Typography>

          <Paper variant="outlined" sx={{ borderRadius: "12px", p: 2, backgroundColor: editorial.paperSoft }}>
            <Stack spacing={1.5}>
              <CredentialRow label="Login ID" value={handover.loginId} onCopy={onCopy} />
              <Divider />
              <CredentialRow label="Password" value={handover.password} onCopy={onCopy} />
            </Stack>
          </Paper>

          <Button
            startIcon={<ContentCopyOutlined />}
            onClick={() => void onCopy(both, "Login ID and password")}
            sx={{ ...learningButtonSx, alignSelf: "flex-start" }}
          >
            Copy both
          </Button>

          <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 700 }}>
            Send them yourself — nothing is emailed automatically. They sign in from the site's front page
            using "Sign in with a portal account".
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button variant="contained" onClick={onClose} sx={learningButtonSx}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CredentialRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (text: string, what: string) => Promise<void>;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 800 }}>
          {label}
        </Typography>
        <Typography
          sx={{
            fontWeight: 900,
            color: editorial.ink,
            fontSize: "1.05rem",
            // Long values wrap rather than overflow; a truncated password is
            // worse than a wrapped one when someone is reading it out.
            wordBreak: "break-all",
          }}
        >
          {value}
        </Typography>
      </Box>
      <Tooltip title={`Copy ${label.toLowerCase()}`}>
        <IconButton onClick={() => void onCopy(value, label)} aria-label={`Copy ${label.toLowerCase()}`}>
          <ContentCopyOutlined />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

// ── Confirm ──────────────────────────────────────────────────────────────────

function ConfirmDialog({
  state,
  onClose,
  onConfirm,
}: {
  state: ConfirmState | null;
  onClose: () => void;
  onConfirm: (state: ConfirmState) => void;
}) {
  if (!state) return null;

  const { kind, account } = state;
  const copy = {
    disable: {
      title: "Disable this account?",
      body: `${account.fullName} will be signed out immediately and will not be able to sign in again until you enable the account. Nothing is deleted — their access log stays.`,
      confirm: "Disable",
      danger: false,
    },
    enable: {
      title: "Enable this account?",
      body: `${account.fullName} will be able to sign in again with their existing password.`,
      confirm: "Enable",
      danger: false,
    },
    delete: {
      title: "Delete this account?",
      body: `${account.fullName}'s account will be removed permanently and they will be signed out. Their entries in the access log remain, so the record of what they viewed is not lost. This cannot be undone.`,
      confirm: "Delete",
      danger: true,
    },
  }[kind];

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 900 }}>{copy.title}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ fontWeight: 700, color: editorial.muted }}>{copy.body}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={learningButtonSx}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={copy.danger ? "error" : "primary"}
          onClick={() => onConfirm(state)}
          sx={learningButtonSx}
        >
          {copy.confirm}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

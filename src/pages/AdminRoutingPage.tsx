/**
 * AdminRoutingPage.tsx — the Approval Directory workspace.
 * Route: /admin/routing (Form Builder Superuser only)
 *
 * One page answering "who approves whom", so that a form can say "the
 * submitter's approver" instead of naming somebody, and an admin can keep that
 * answer current in one place rather than inside every form.
 *
 * Editing here never rewrites history: a submission freezes its resolved
 * approver addresses onto its own record when it is routed, so changing a row
 * today cannot alter anything submitted yesterday.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import {
  Alert,
  AlertTitle,
  Autocomplete,
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
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import EditIcon from "@mui/icons-material/Edit";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import ManageSearchIcon from "@mui/icons-material/ManageSearch";
import { acquireAccessTokenSilentOrRedirect } from "../utils/authRecovery";
import { createSpClient } from "../utils/sharepointClient";
import { SP_STATIC } from "../utils/spConfig";
import { editorial, editorialShadow } from "../theme/editorial";
import { downloadCsv } from "../utils/csv";
import { directoryToCsv } from "../utils/approvalDirectoryCsv";
import type { DirectoryImportPlan } from "../utils/approvalDirectoryCsv";
import {
  approvalDirectoryExists,
  confirmApprovalDirectoryRow,
  createApprovalDirectoryRow,
  deleteApprovalDirectoryRow,
  ensureApprovalDirectory,
  loadApprovalDirectory,
  updateApprovalDirectoryRow,
  type ApprovalDirectoryInput,
} from "../utils/approvalDirectory";
import {
  APPROVAL_DIRECTORY_COLUMNS,
  APPROVAL_DIRECTORY_LIST,
  directoryEmailKey,
  type ApprovalDirectoryRow,
  type DirectoryColumnMap,
} from "../utils/approvalDirectorySchema";
import {
  applyDirectoryScan,
  hasGuessedEmail,
  isUnconfirmedRow,
  runDirectoryScan,
} from "../utils/directoryHarvestWrite";
import type { DirectoryScanPlan, ScanProposal } from "../utils/directoryScan";
import { findDirectoryProblems, traceApprovalChain } from "../utils/approvalDirectoryHealth";
import ChainTraceView from "../components/routing/ChainTraceView";
import DirectoryPersonDialog from "../components/routing/DirectoryPersonDialog";
import DirectoryImportDialog, { type DirectoryImportProgress } from "../components/routing/DirectoryImportDialog";
import DirectoryScanDialog, { type DirectoryScanProgress } from "../components/routing/DirectoryScanDialog";

type RoutingTab = "people" | "trace" | "health";
type SnackbarState = { message: string; severity: "success" | "error" } | null;

const ALL_DEPARTMENTS = "__all__";

/**
 * What is actually lost while a column is missing, so the warning says
 * something the admin can weigh instead of just naming a column.
 */
const MISSING_COLUMN_EFFECT: Record<string, string> = {
  [APPROVAL_DIRECTORY_COLUMNS.personName]: "the table and form dropdowns show email addresses instead of names",
  [APPROVAL_DIRECTORY_COLUMNS.department]: 'forms set to "Whoever holds a role" have nothing to match on',
  [APPROVAL_DIRECTORY_COLUMNS.position]: 'forms set to "Whoever holds a role" cannot tell who holds the post',
  [APPROVAL_DIRECTORY_COLUMNS.employeeId]: "staff numbers are not kept; nothing routes on them",
  [APPROVAL_DIRECTORY_COLUMNS.company]: "two companies with a department of the same name cannot be told apart",
  [APPROVAL_DIRECTORY_COLUMNS.isActive]: "somebody who has left can only be removed, not switched off",
  [APPROVAL_DIRECTORY_COLUMNS.source]: "a row cannot record where it came from, so forms cannot add their submitters",
  [APPROVAL_DIRECTORY_COLUMNS.confirmed]: "a guessed row cannot be marked for review, so forms cannot add their submitters",
};

/** Anything the page could not do, said in words an admin can act on. */
function errorMessage(error: unknown, fallback: string): string {
  const detail = error instanceof Error ? error.message : "";
  return detail ? `${fallback} ${detail}` : fallback;
}

export default function AdminRoutingPage() {
  const navigate = useNavigate();
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => { document.title = "Approval routing - PMW HR Form"; }, []);

  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [rows, setRows] = useState<ApprovalDirectoryRow[]>([]);
  const [listExists, setListExists] = useState(true);
  // Writes are addressed to the columns the list really has, not the names in
  // the schema — a column made by hand as "EmployeeID" would otherwise reject
  // every save. Null until the first successful read.
  const [columns, setColumns] = useState<DirectoryColumnMap | null>(null);
  const [missingColumns, setMissingColumns] = useState<string[]>([]);
  const [usable, setUsable] = useState(true);
  const [provisioning, setProvisioning] = useState(false);

  const [tab, setTab] = useState<RoutingTab>("people");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState(ALL_DEPARTMENTS);
  const [traceEmail, setTraceEmail] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ApprovalDirectoryRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApprovalDirectoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<DirectoryImportProgress | null>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState>(null);

  // The review queue: rows a form guessed, which nobody has checked yet.
  const [reviewOnly, setReviewOnly] = useState(false);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanLabel, setScanLabel] = useState("");
  const [scanPlan, setScanPlan] = useState<DirectoryScanPlan | null>(null);
  const [scanApplying, setScanApplying] = useState(false);
  const [scanProgress, setScanProgress] = useState<DirectoryScanProgress | null>(null);

  // Access check, backing up the route guard.
  useEffect(() => {
    if (inProgress !== InteractionStatus.None || !isAuthenticated) return;

    const origin = new URL(import.meta.env.VITE_SP_SITE_URL || "https://placeholder.sharepoint.com").origin;
    createSpClient(instance, accounts)
      .isGroupMember(SP_STATIC.formBuilderSuperuserGroup)
      .then((superuser) => {
        if (!superuser) {
          setTokenError("Only the SharePoint superuser group can manage approval routing.");
          setLoading(false);
          return null;
        }
        return acquireAccessTokenSilentOrRedirect(instance, {
          scopes: [`${origin}/AllSites.Manage`],
          account: accounts[0],
        });
      })
      .then((acquired) => { if (acquired) setToken(acquired); })
      .catch(() => {
        setTokenError("Could not sign in to SharePoint. Reload the page, or sign out and back in.");
        setLoading(false);
      });
  }, [isAuthenticated, inProgress, instance, accounts]);

  const load = useCallback(async (activeToken: string) => {
    setLoading(true);
    setLoadError("");
    try {
      // Told apart deliberately: a list that is not there yet needs a setup
      // button, while a list that failed to read needs a retry.
      if (!await approvalDirectoryExists(activeToken)) {
        setListExists(false);
        setRows([]);
        return;
      }
      setListExists(true);
      const result = await loadApprovalDirectory(activeToken);
      setRows(result.rows);
      setColumns(result.columns);
      setMissingColumns(result.missingColumns);
      setUsable(result.usable);
    } catch (error) {
      setLoadError(errorMessage(error, "Could not read the Approval Directory."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) void load(token);
  }, [token, load]);

  const departments = useMemo(
    () => [...new Set(rows.map((row) => row.department).filter(Boolean))].sort(),
    [rows],
  );

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (reviewOnly && !isUnconfirmedRow(row)) return false;
      if (departmentFilter !== ALL_DEPARTMENTS && row.department !== departmentFilter) return false;
      if (!needle) return true;
      return [row.personName, row.personEmail, row.department, row.company, row.position, row.employeeId, row.approverEmail]
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [rows, search, departmentFilter, reviewOnly]);

  /** Rows a form added and nobody has checked. Empty on a hand-kept list. */
  const unconfirmedRows = useMemo(() => rows.filter(isUnconfirmedRow), [rows]);

  const problems = useMemo(() => findDirectoryProblems(rows), [rows]);
  const blockingProblems = problems.filter((problem) => problem.blocking);
  const trace = useMemo(
    () => (traceEmail.trim() ? traceApprovalChain(rows, traceEmail) : null),
    [rows, traceEmail],
  );

  const nameByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) map.set(directoryEmailKey(row.personEmail), row.personName || row.personEmail);
    return map;
  }, [rows]);

  const handleProvision = async () => {
    if (!token) return;
    setProvisioning(true);
    try {
      await ensureApprovalDirectory(token);
      setSnackbar({ message: `"${APPROVAL_DIRECTORY_LIST}" is ready.`, severity: "success" });
      await load(token);
    } catch (error) {
      setSnackbar({
        message: errorMessage(error, "Could not create the list. You may not have permission to add lists to this site."),
        severity: "error",
      });
    } finally {
      setProvisioning(false);
    }
  };

  const handleSave = async (input: ApprovalDirectoryInput, id?: number) => {
    if (!token || !columns) return;
    setSaving(true);
    try {
      if (id === undefined) await createApprovalDirectoryRow(token, input, columns);
      else await updateApprovalDirectoryRow(token, id, input, columns);
      setEditorOpen(false);
      setSnackbar({ message: id === undefined ? "Person added." : "Changes saved.", severity: "success" });
      await load(token);
    } catch (error) {
      setSnackbar({ message: errorMessage(error, "Could not save that person."), severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !deleteTarget?.id) return;
    setDeleting(true);
    try {
      await deleteApprovalDirectoryRow(token, deleteTarget.id);
      setDeleteTarget(null);
      setSnackbar({ message: "Person removed.", severity: "success" });
      await load(token);
    } catch (error) {
      setSnackbar({ message: errorMessage(error, "Could not remove that person."), severity: "error" });
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Writes an import one row at a time, reporting rather than aborting on a
   * failure. Half an import that says which half is far more useful than a
   * rollback the admin cannot see into.
   */
  const handleImport = async (plan: DirectoryImportPlan) => {
    if (!token || !columns) return;
    const pending = plan.rows.filter((row) => row.action === "create" || row.action === "update");
    setImporting(true);
    setImportProgress({ done: 0, total: pending.length, failures: [] });

    const failures: string[] = [];
    let done = 0;
    for (const row of pending) {
      try {
        if (row.action === "create") await createApprovalDirectoryRow(token, row.input, columns);
        else if (row.existingId !== undefined) {
          await updateApprovalDirectoryRow(token, row.existingId, row.input, columns);
        }
        done++;
      } catch (error) {
        failures.push(`Line ${row.line} (${row.input.personEmail}): ${errorMessage(error, "could not be saved.")}`);
      }
      setImportProgress({ done, total: pending.length, failures: [...failures] });
    }

    setImporting(false);
    setSnackbar({
      message: failures.length === 0
        ? `Imported ${done} row${done === 1 ? "" : "s"}.`
        : `Imported ${done} of ${pending.length}; ${failures.length} failed.`,
      severity: failures.length === 0 ? "success" : "error",
    });
    await load(token);
  };

  /**
   * Accepts a guessed row as it stands, in one click.
   *
   * Kept separate from editing so the common case — the guess was right — does
   * not make an admin open a dialog only to press save.
   */
  const handleConfirm = async (row: ApprovalDirectoryRow) => {
    if (!token || !columns || row.id === undefined) return;
    setConfirmingId(row.id);
    try {
      await confirmApprovalDirectoryRow(token, row.id, columns);
      setSnackbar({
        message: `${row.personName || row.personEmail} confirmed.`,
        severity: "success",
      });
      await load(token);
    } catch (error) {
      setSnackbar({ message: errorMessage(error, "Could not confirm that row."), severity: "error" });
    } finally {
      setConfirmingId(null);
    }
  };

  const handleScan = async () => {
    if (!token) return;
    setScanOpen(true);
    setScanPlan(null);
    setScanProgress(null);
    setScanLabel("");
    setScanning(true);
    try {
      setScanPlan(await runDirectoryScan(token, (_done, _total, formTitle) => setScanLabel(formTitle)));
    } catch (error) {
      setSnackbar({
        message: errorMessage(error, "Could not read the evaluation submissions."),
        severity: "error",
      });
      setScanOpen(false);
    } finally {
      setScanning(false);
      setScanLabel("");
    }
  };

  const handleApplyScan = async (proposals: ScanProposal[]) => {
    if (!token || !columns) return;
    setScanApplying(true);
    setScanProgress({ done: 0, total: proposals.length, failures: [] });
    try {
      const result = await applyDirectoryScan(token, proposals, columns, (done) => {
        setScanProgress((current) => ({ done, total: proposals.length, failures: current?.failures ?? [] }));
      });
      setScanProgress({ done: result.created, total: proposals.length, failures: result.failures });
      setSnackbar({
        message: result.failures.length === 0
          ? `Added ${result.created} ${result.created === 1 ? "person" : "people"} for review.`
          : `Added ${result.created} of ${proposals.length}; ${result.failures.length} failed.`,
        severity: result.failures.length === 0 ? "success" : "error",
      });
      if (result.failures.length === 0) setScanOpen(false);
      // Show what just landed, rather than making them find it.
      setReviewOnly(true);
      await load(token);
    } finally {
      setScanApplying(false);
    }
  };

  const openEditorFor = (email: string) => {
    const match = rows.find((row) => directoryEmailKey(row.personEmail) === directoryEmailKey(email));
    setEditing(match ?? null);
    setEditorOpen(true);
  };

  if (tokenError) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Alert severity="warning">{tokenError}</Alert>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: editorial.appSurface }}>
      {/* Header */}
      <Box sx={{ backgroundColor: editorial.white, borderBottom: `1px solid ${editorial.border}` }}>
        <Container maxWidth="lg" sx={{ py: 2.5 }}>
          <Stack direction="row" sx={{ alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            <IconButton onClick={() => navigate("/admin/dashboard")} size="small" aria-label="Back to dashboard">
              <ArrowBackIcon fontSize="small" />
            </IconButton>
            <Box sx={{ flex: 1, minWidth: 220 }}>
              <Typography sx={{ fontSize: "1.15rem", fontWeight: 700, color: editorial.ink, lineHeight: 1.2 }}>
                Approval routing
              </Typography>
              <Typography sx={{ fontSize: "0.78rem", color: editorial.muted }}>
                Who approves whom. Forms set to a reporting line read their answer from here.
              </Typography>
            </Box>
            <Button
              startIcon={<RefreshIcon />}
              onClick={() => token && void load(token)}
              disabled={loading || !token}
              sx={{ textTransform: "none" }}
            >
              Refresh
            </Button>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        {loading && (
          <Stack sx={{ alignItems: "center", py: 8, gap: 2 }}>
            <CircularProgress size={28} />
            <Typography sx={{ color: editorial.muted, fontSize: "0.845rem" }}>Reading the directory...</Typography>
          </Stack>
        )}

        {!loading && loadError && (
          <Alert
            severity="error"
            action={<Button size="small" onClick={() => token && void load(token)}>Try again</Button>}
          >
            {loadError}
          </Alert>
        )}

        {/* Not set up yet: teach what the list is for before asking to make it. */}
        {!loading && !loadError && !listExists && (
          <Paper sx={{ p: 4, borderRadius: "12px", boxShadow: editorialShadow, textAlign: "center" }}>
            <Typography sx={{ fontSize: "1.0625rem", fontWeight: 700, color: editorial.ink, mb: 1 }}>
              The approval directory has not been set up yet
            </Typography>
            <Typography sx={{ fontSize: "0.875rem", color: editorial.muted, maxWidth: 620, mx: "auto", mb: 3 }}>
              It is one SharePoint list with a row per person, and one column that matters: who approves them.
              With it, a form can be set to "goes to the submitter's approver" and route a clerk to their head of
              department, that head to the CFO, and the CFO to the CEO, without writing a single rule.
            </Typography>
            <Button
              variant="contained"
              onClick={handleProvision}
              disabled={provisioning}
              sx={{ textTransform: "none", fontWeight: 700 }}
            >
              {provisioning ? "Creating..." : `Create "${APPROVAL_DIRECTORY_LIST}"`}
            </Button>
          </Paper>
        )}

        {!loading && !loadError && listExists && (
          <Stack sx={{ gap: 2 }}>
            {!usable && (
              <Alert
                severity="error"
                action={(
                  <Button size="small" onClick={handleProvision} disabled={provisioning}>
                    {provisioning ? "Adding..." : "Add them"}
                  </Button>
                )}
              >
                <AlertTitle>The list is missing a column routing cannot work without</AlertTitle>
                Nothing can be looked up until <strong>{missingColumns.join(", ")}</strong> exist on
                "{APPROVAL_DIRECTORY_LIST}".
              </Alert>
            )}

            {usable && missingColumns.length > 0 && (
              <Alert
                severity="warning"
                action={(
                  <Button size="small" onClick={handleProvision} disabled={provisioning}>
                    {provisioning ? "Adding..." : "Add them"}
                  </Button>
                )}
              >
                <AlertTitle>
                  {missingColumns.length === 1
                    ? "One column is missing"
                    : `${missingColumns.length} columns are missing`}
                </AlertTitle>
                Reporting lines work, and people can still be added — the fields below are simply left out until
                the columns exist on "{APPROVAL_DIRECTORY_LIST}".
                <Box component="ul" sx={{ m: "0.5rem 0 0", pl: 2.5 }}>
                  {missingColumns.map((column) => (
                    <li key={column}>
                      <strong>{column}</strong>
                      {MISSING_COLUMN_EFFECT[column] ? ` — ${MISSING_COLUMN_EFFECT[column]}` : ""}
                    </li>
                  ))}
                </Box>
              </Alert>
            )}

            {unconfirmedRows.length > 0 && (
              <Alert
                severity="info"
                action={(
                  <Button
                    size="small"
                    onClick={() => { setTab("people"); setReviewOnly(true); }}
                    sx={{ textTransform: "none", fontWeight: 700 }}
                  >
                    Review
                  </Button>
                )}
              >
                <AlertTitle>
                  {unconfirmedRows.length === 1
                    ? "One person needs review"
                    : `${unconfirmedRows.length} people need review`}
                </AlertTitle>
                A form added them from an evaluation and guessed their superior. Their submissions are waiting on
                the Approvals screen until you confirm the row.
              </Alert>
            )}

            <Paper sx={{ borderRadius: "12px", boxShadow: editorialShadow, overflow: "hidden" }}>
              <Tabs
                value={tab}
                onChange={(_, value: RoutingTab) => setTab(value)}
                sx={{ px: 2, borderBottom: `1px solid ${editorial.border}` }}
              >
                <Tab value="people" label={`People (${rows.length})`} sx={{ textTransform: "none", fontWeight: 700 }} />
                <Tab value="trace" label="Trace a line" sx={{ textTransform: "none", fontWeight: 700 }} />
                <Tab
                  value="health"
                  label={blockingProblems.length > 0 ? `Problems (${blockingProblems.length})` : "Problems"}
                  sx={{
                    textTransform: "none",
                    fontWeight: 700,
                    color: blockingProblems.length > 0 ? editorial.error : undefined,
                  }}
                />
              </Tabs>

              {tab === "people" && (
                <Box sx={{ p: 2 }}>
                  <Stack direction={{ xs: "column", md: "row" }} sx={{ gap: 1.5, mb: 2 }}>
                    <TextField
                      size="small"
                      placeholder="Search name, email, department..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      sx={{ flex: 1, minWidth: 200 }}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <SearchIcon fontSize="small" sx={{ color: editorial.softMuted }} />
                            </InputAdornment>
                          ),
                        },
                      }}
                    />
                    <TextField
                      select
                      size="small"
                      value={departmentFilter}
                      onChange={(event) => setDepartmentFilter(event.target.value)}
                      sx={{ minWidth: 180 }}
                    >
                      <MenuItem value={ALL_DEPARTMENTS}>All departments</MenuItem>
                      {departments.map((department) => (
                        <MenuItem key={department} value={department}>{department}</MenuItem>
                      ))}
                    </TextField>
                    {unconfirmedRows.length > 0 && (
                      <Chip
                        label={`Needs review (${unconfirmedRows.length})`}
                        color={reviewOnly ? "primary" : "default"}
                        variant={reviewOnly ? "filled" : "outlined"}
                        onClick={() => setReviewOnly((current) => !current)}
                        sx={{ fontWeight: 700, alignSelf: "center" }}
                      />
                    )}
                    <Button
                      startIcon={<ManageSearchIcon />}
                      onClick={() => void handleScan()}
                      disabled={!usable}
                      sx={{ textTransform: "none", whiteSpace: "nowrap" }}
                    >
                      Scan submissions
                    </Button>
                    <Button
                      startIcon={<UploadFileIcon />}
                      onClick={() => { setImportProgress(null); setImportOpen(true); }}
                      sx={{ textTransform: "none" }}
                    >
                      Import
                    </Button>
                    <Button
                      startIcon={<DownloadIcon />}
                      onClick={() => downloadCsv(directoryToCsv(rows), "approval-directory.csv")}
                      disabled={rows.length === 0}
                      sx={{ textTransform: "none" }}
                    >
                      Export
                    </Button>
                    <Button
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={() => { setEditing(null); setEditorOpen(true); }}
                      sx={{ textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" }}
                    >
                      Add person
                    </Button>
                  </Stack>

                  {rows.length === 0 ? (
                    <Box sx={{ py: 6, textAlign: "center" }}>
                      <Typography sx={{ fontWeight: 700, color: editorial.ink, mb: 1 }}>
                        Nobody in the directory yet
                      </Typography>
                      <Typography sx={{ fontSize: "0.845rem", color: editorial.muted, maxWidth: 560, mx: "auto" }}>
                        Two ways in, and you can mix them. Import the staff list HR already keeps as a
                        spreadsheet, or add nobody at all and let it fill in over time: a form that cannot find
                        somebody parks that submission as "Needs routing" instead of losing it, and you name the
                        approver once.
                      </Typography>
                    </Box>
                  ) : visibleRows.length === 0 ? (
                    <Typography sx={{ py: 4, textAlign: "center", color: editorial.muted, fontSize: "0.845rem" }}>
                      {reviewOnly ? "Nothing left to review." : "Nobody matches that search."}
                    </Typography>
                  ) : (
                    <Box sx={{ overflowX: "auto" }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Person</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Position</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Approved by</TableCell>
                            <TableCell sx={{ fontWeight: 700 }} align="right">Edit</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {visibleRows.map((row) => (
                            <TableRow key={row.id ?? row.personEmail} hover sx={{ opacity: row.isActive ? 1 : 0.55 }}>
                              <TableCell>
                                <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                                  <Box>
                                    <Typography sx={{ fontSize: "0.845rem", fontWeight: 700, color: editorial.ink }}>
                                      {row.personName || row.personEmail}
                                    </Typography>
                                    <Typography sx={{ fontSize: "0.72rem", color: editorial.softMuted }}>
                                      {row.personEmail}
                                      {row.employeeId ? ` - ${row.employeeId}` : ""}
                                    </Typography>
                                  </Box>
                                  {!row.isActive && (
                                    <Chip size="small" label="Off" sx={{ height: 20, fontSize: "0.72rem", fontWeight: 700 }} />
                                  )}
                                  {isUnconfirmedRow(row) && (
                                    <Tooltip title="A form added this from an evaluation. Everything on it is a guess until you confirm it.">
                                      <Chip
                                        size="small"
                                        label={hasGuessedEmail(row) ? "Unconfirmed - address guessed" : "Unconfirmed"}
                                        sx={{
                                          height: 20,
                                          fontSize: "0.72rem",
                                          fontWeight: 700,
                                          color: editorial.pmwBlueDark,
                                          backgroundColor: editorial.blueWash,
                                        }}
                                      />
                                    </Tooltip>
                                  )}
                                </Stack>
                              </TableCell>
                              <TableCell sx={{ fontSize: "0.78rem" }}>
                                {row.department || "-"}
                                {row.company && (
                                  <Typography sx={{ fontSize: "0.72rem", color: editorial.softMuted }}>
                                    {row.company}
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell sx={{ fontSize: "0.78rem" }}>{row.position || "-"}</TableCell>
                              <TableCell sx={{ fontSize: "0.78rem" }}>
                                {row.approverEmail
                                  ? (
                                    <Tooltip title={row.approverEmail}>
                                      <span>{nameByEmail.get(directoryEmailKey(row.approverEmail)) ?? row.approverEmail}</span>
                                    </Tooltip>
                                  )
                                  : <em style={{ color: editorial.softMuted }}>top of the line</em>}
                              </TableCell>
                              <TableCell align="right">
                                {isUnconfirmedRow(row) && (
                                  <Tooltip title="Confirm this row as it stands">
                                    <IconButton
                                      size="small"
                                      aria-label={`Confirm ${row.personEmail}`}
                                      onClick={() => void handleConfirm(row)}
                                      disabled={confirmingId === row.id}
                                      sx={{ color: editorial.success }}
                                    >
                                      <CheckCircleOutlineIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                                <IconButton
                                  size="small"
                                  aria-label={`Edit ${row.personEmail}`}
                                  onClick={() => { setEditing(row); setEditorOpen(true); }}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  aria-label={`Remove ${row.personEmail}`}
                                  onClick={() => setDeleteTarget(row)}
                                >
                                  <DeleteOutlinedIcon fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Box>
                  )}
                </Box>
              )}

              {tab === "trace" && (
                <Box sx={{ p: 3 }}>
                  <Typography sx={{ fontSize: "0.845rem", color: editorial.muted, mb: 2, maxWidth: 640 }}>
                    Pick somebody to see where their forms would go, before anybody submits one. A form layer set
                    to "Their direct manager, one step" sends to the second name below; two steps sends to the third.
                  </Typography>
                  <Autocomplete
                    freeSolo
                    options={rows.map((row) => row.personEmail)}
                    value={traceEmail}
                    onInputChange={(_, value) => setTraceEmail(value)}
                    sx={{ maxWidth: 420, mb: 3 }}
                    renderInput={(params) => (
                      <TextField {...params} size="small" label="Person's email" placeholder="ali@example.com" />
                    )}
                  />
                  {trace
                    ? <ChainTraceView trace={trace} />
                    : (
                      <Typography sx={{ fontSize: "0.845rem", color: editorial.softMuted }}>
                        Nobody chosen yet.
                      </Typography>
                    )}
                </Box>
              )}

              {tab === "health" && (
                <Box sx={{ p: 3 }}>
                  {problems.length === 0 ? (
                    <Box sx={{ py: 4, textAlign: "center" }}>
                      <Typography sx={{ fontWeight: 700, color: editorial.success, mb: 0.5 }}>
                        Nothing wrong with the directory
                      </Typography>
                      <Typography sx={{ fontSize: "0.845rem", color: editorial.muted }}>
                        Every reporting line ends somewhere, and every approver is listed and switched on.
                      </Typography>
                    </Box>
                  ) : (
                    <Stack sx={{ gap: 1.25 }}>
                      <Typography sx={{ fontSize: "0.845rem", color: editorial.muted, mb: 0.5 }}>
                        {blockingProblems.length > 0
                          ? `${blockingProblems.length} of these will stop an approval. The rest are worth knowing about.`
                          : "Nothing here stops an approval; these are worth knowing about."}
                      </Typography>
                      {problems.map((problem, index) => (
                        <Stack
                          key={`${problem.kind}-${problem.personEmail}-${index}`}
                          direction={{ xs: "column", sm: "row" }}
                          sx={{
                            alignItems: { sm: "center" },
                            gap: 1.5,
                            p: 1.5,
                            borderRadius: "12px",
                            border: `1px solid ${problem.blocking ? "#F0C9C9" : editorial.border}`,
                            backgroundColor: problem.blocking ? "#FDF3F3" : editorial.paperSoft,
                          }}
                        >
                          <Chip
                            size="small"
                            label={problem.blocking ? "Blocking" : "Check"}
                            sx={{
                              fontWeight: 700,
                              fontSize: "0.72rem",
                              color: problem.blocking ? editorial.error : editorial.warning,
                              backgroundColor: problem.blocking ? "#FBE9E9" : editorial.yellowSoft,
                            }}
                          />
                          <Typography sx={{ flex: 1, fontSize: "0.845rem", color: editorial.ink }}>
                            {problem.message}
                          </Typography>
                          <Button
                            size="small"
                            onClick={() => openEditorFor(problem.personEmail)}
                            sx={{ textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" }}
                          >
                            Open row
                          </Button>
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Box>
              )}
            </Paper>

            <Typography sx={{ fontSize: "0.78rem", color: editorial.softMuted, px: 0.5 }}>
              Editing this list never changes anything already submitted. A submission records its approvers when
              it is routed, so past records keep the people they were actually sent to. Submissions that could not
              be routed wait under "Needs routing" on the submissions page.
            </Typography>
          </Stack>
        )}
      </Container>

      <DirectoryPersonDialog
        open={editorOpen}
        editing={editing}
        rows={rows}
        columns={columns}
        saving={saving}
        onClose={() => setEditorOpen(false)}
        onSave={(input, id) => void handleSave(input, id)}
      />

      <DirectoryImportDialog
        open={importOpen}
        rows={rows}
        applying={importing}
        progress={importProgress}
        onClose={() => setImportOpen(false)}
        onApply={(plan) => void handleImport(plan)}
      />

      <DirectoryScanDialog
        open={scanOpen}
        plan={scanPlan}
        scanning={scanning}
        applying={scanApplying}
        progress={scanProgress}
        scanningLabel={scanLabel}
        onClose={() => setScanOpen(false)}
        onApply={(proposals) => void handleApplyScan(proposals)}
      />

      <Dialog open={!!deleteTarget} onClose={deleting ? undefined : () => setDeleteTarget(null)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Remove this person?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: "0.875rem" }}>
            {deleteTarget?.personName || deleteTarget?.personEmail} will be taken out of the directory, and
            anybody who reports to them will have no approver until you point them somewhere else.
            <br /><br />
            For somebody who has left, switching them off is usually better: their old submissions stay readable
            and nothing new routes to them.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void handleDelete()}
            disabled={deleting}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            {deleting ? "Removing..." : "Remove"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={6000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={snackbar?.severity ?? "success"} onClose={() => setSnackbar(null)} variant="filled">
          {snackbar?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

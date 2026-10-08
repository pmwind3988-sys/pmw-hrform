/**
 * AdminOrgPage.tsx — the companies and departments every form chooses from.
 * Route: /admin/org (Form Builder Superuser only)
 *
 * One list each, maintained here, instead of a copy inside every form. What
 * was there before: the company selector held a typed list per form, and a
 * department question pointed at whatever list somebody configured — so eight
 * companies on one form, four in the builder's default, and two spellings of
 * PMW Lighting between them.
 *
 * Two things worth knowing while reading the tables:
 *
 * A form stores the **code** and shows the **name**, so renaming a company
 * breaks nothing that has already been submitted. The codes started out equal
 * to the strings forms were already storing, which is why they read like full
 * company names rather than short codes.
 *
 * A department's company is **optional**. Blank means every company, which is
 * what every converted department began as. Naming a company makes that row
 * specific to it and overrides the shared one of the same code, so one
 * company's Finance can be pulled out of the pool without touching anybody
 * else's.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Menu,
  ListItemIcon,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import BusinessIcon from "@mui/icons-material/BusinessOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import MoreHorizRounded from "@mui/icons-material/MoreHorizRounded";
import PageHeader from "../components/common/PageHeader";
import PillTabs from "../components/common/PillTabs";
import Card from "../components/common/Card";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditIcon from "@mui/icons-material/Edit";
import ManageSearchIcon from "@mui/icons-material/ManageSearch";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import { acquireAccessTokenSilentOrRedirect } from "../utils/authRecovery";
import { createSpClient } from "../utils/sharepointClient";
import { SP_STATIC } from "../utils/spConfig";
import { editorial, onCanvasMuted, si, siType } from "../theme/editorial";
import {
  COMPANY_LIST,
  DEPARTMENT_LIST,
  departmentScopeLabel,
  orgKey,
  validateCompany,
  validateDepartment,
  type CompanyRow,
  type DepartmentRow,
} from "../utils/orgDirectory";
import {
  ensureOrgLists,
  loadCompanies,
  loadDepartments,
  orgListsExist,
  saveCompany,
  saveDepartment,
  deleteCompany,
  deleteDepartment,
} from "../utils/orgDirectorySP";
import OrgConversionDialog from "../components/org/OrgConversionDialog";

type OrgTab = "companies" | "departments";
type SnackbarState = { message: string; severity: "success" | "error" } | null;

const ALL_COMPANIES = "__all__";
const SHARED_ONLY = "__shared__";

function errorMessage(error: unknown, fallback: string): string {
  const detail = error instanceof Error ? error.message : "";
  return detail ? `${fallback} ${detail}` : fallback;
}

export default function AdminOrgPage() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => { document.title = "Companies and departments - PMW HR Form"; }, []);

  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [listsExist, setListsExist] = useState(true);
  const [provisioning, setProvisioning] = useState(false);

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);

  const [tab, setTab] = useState<OrgTab>("companies");
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState(ALL_COMPANIES);

  const [editingCompany, setEditingCompany] = useState<CompanyRow | null>(null);
  const [editingDepartment, setEditingDepartment] = useState<DepartmentRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<
    { kind: OrgTab; id: number; label: string } | null
  >(null);
  const [conversionOpen, setConversionOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<SnackbarState>(null);
  const [rowMenu, setRowMenu] = useState<{ anchor: HTMLElement; onEdit: () => void; onRemove?: () => void } | null>(null);

  // Access check, backing up the route guard.
  useEffect(() => {
    if (inProgress !== InteractionStatus.None || !isAuthenticated) return;

    const origin = new URL(import.meta.env.VITE_SP_SITE_URL || "https://placeholder.sharepoint.com").origin;
    createSpClient(instance, accounts)
      .isGroupMember(SP_STATIC.formBuilderSuperuserGroup)
      .then((superuser) => {
        if (!superuser) {
          setTokenError("Only the SharePoint superuser group can manage companies and departments.");
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
      // Told apart deliberately: lists that are not there yet need a setup
      // button, while lists that failed to read need a retry.
      const exists = await orgListsExist(activeToken);
      if (!exists.companies || !exists.departments) {
        setListsExist(false);
        setCompanies([]);
        setDepartments([]);
        return;
      }
      setListsExist(true);
      const [loadedCompanies, loadedDepartments] = await Promise.all([
        loadCompanies(activeToken),
        loadDepartments(activeToken),
      ]);
      setCompanies(loadedCompanies);
      setDepartments(loadedDepartments);
    } catch (error) {
      setLoadError(errorMessage(error, "Could not read the companies and departments."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) void load(token);
  }, [token, load]);

  const visibleCompanies = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return companies
      .filter((company) => !needle
        || [company.name, company.code].some((value) => value.toLowerCase().includes(needle)))
      .sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code));
  }, [companies, search]);

  const visibleDepartments = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return departments
      .filter((department) => {
        if (companyFilter === SHARED_ONLY && department.company.trim()) return false;
        if (companyFilter !== ALL_COMPANIES && companyFilter !== SHARED_ONLY
          && orgKey(department.company) !== orgKey(companyFilter)) return false;
        return !needle
          || [department.name, department.code].some((value) => value.toLowerCase().includes(needle));
      })
      .sort((a, b) =>
        (a.company || "").localeCompare(b.company || "")
        || (a.name || a.code).localeCompare(b.name || b.code));
  }, [departments, search, companyFilter]);

  const sharedCount = useMemo(
    () => departments.filter((department) => !department.company.trim()).length,
    [departments],
  );

  const handleProvision = async () => {
    if (!token) return;
    setProvisioning(true);
    try {
      await ensureOrgLists(token);
      setSnackbar({ message: `"${COMPANY_LIST}" and "${DEPARTMENT_LIST}" are ready.`, severity: "success" });
      await load(token);
    } catch (error) {
      setSnackbar({
        message: errorMessage(error, "Could not create the lists. You may not have permission to add lists to this site."),
        severity: "error",
      });
    } finally {
      setProvisioning(false);
    }
  };

  const handleSaveCompany = async () => {
    if (!token || !editingCompany) return;
    const problems = validateCompany(editingCompany, companies);
    if (problems.length > 0) {
      setSnackbar({ message: problems[0], severity: "error" });
      return;
    }
    setSaving(true);
    try {
      await saveCompany(token, editingCompany);
      setEditingCompany(null);
      setSnackbar({ message: "Company saved.", severity: "success" });
      await load(token);
    } catch (error) {
      setSnackbar({ message: errorMessage(error, "Could not save that company."), severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDepartment = async () => {
    if (!token || !editingDepartment) return;
    const problems = validateDepartment(editingDepartment, departments);
    if (problems.length > 0) {
      setSnackbar({ message: problems[0], severity: "error" });
      return;
    }
    setSaving(true);
    try {
      await saveDepartment(token, editingDepartment);
      setEditingDepartment(null);
      setSnackbar({ message: "Department saved.", severity: "success" });
      await load(token);
    } catch (error) {
      setSnackbar({ message: errorMessage(error, "Could not save that department."), severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !deleteTarget) return;
    setSaving(true);
    try {
      if (deleteTarget.kind === "companies") await deleteCompany(token, deleteTarget.id);
      else await deleteDepartment(token, deleteTarget.id);
      setDeleteTarget(null);
      setSnackbar({ message: "Removed.", severity: "success" });
      await load(token);
    } catch (error) {
      setSnackbar({ message: errorMessage(error, "Could not remove that row."), severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (tokenError) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Alert severity="warning">{tokenError}</Alert>
      </Container>
    );
  }

  const ready = !loading && !loadError && listsExist;

  const renderRow = (
    key: string | number,
    item: { name: string; code: string; isActive: boolean },
    subline: ReactNode,
    onEdit: () => void,
    onRemove: (() => void) | undefined,
  ) => {
    const label = item.name || item.code;
    return (
      <Box
        key={key}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 1.5,
          py: 1,
          borderRadius: `${si.radius}px`,
          opacity: item.isActive ? 1 : 0.6,
          "&:hover": { backgroundColor: editorial.blueSoft },
        }}
      >
        <Box
          aria-hidden
          sx={{
            width: 40,
            height: 40,
            flexShrink: 0,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            backgroundColor: editorial.blueWash,
            color: editorial.navy,
          }}
        >
          {tab === "companies" ? <BusinessIcon fontSize="small" /> : <AccountTreeOutlinedIcon fontSize="small" />}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
            <Typography sx={{ ...siType.cardTitle, color: editorial.ink, overflowWrap: "anywhere" }}>{label}</Typography>
            {!item.isActive && <Chip size="small" label="Off" />}
          </Stack>
          {subline}
        </Box>
        <IconButton
          aria-label={`Options for ${label}`}
          aria-haspopup="menu"
          onClick={(event) => setRowMenu({ anchor: event.currentTarget, onEdit, onRemove })}
        >
          <MoreHorizRounded />
        </IconButton>
      </Box>
    );
  };

  const sublineSx = { ...siType.subtext, color: editorial.muted } as const;
  const codeLine = (item: { name: string; code: string }) =>
    item.code && item.name && item.code.trim() !== item.name.trim()
      ? (
        <Tooltip title="The value forms save on each submission. Renaming never changes it.">
          <Typography sx={sublineSx}>Saved on forms as {item.code}</Typography>
        </Tooltip>
      )
      : null;

  return (
    <Box>
      <PageHeader
        title="Companies and departments"
        description="One list each, for every form to choose from."
        primary={ready
          ? {
            label: tab === "companies" ? "Add company" : "Add department",
            icon: <AddIcon />,
            onClick: () => {
              if (tab === "companies") setEditingCompany({ name: "", code: "", isActive: true });
              else setEditingDepartment({ name: "", code: "", company: "", isActive: true });
            },
          }
          : undefined}
        more={[
          { label: "Build from existing forms", icon: <ManageSearchIcon fontSize="small" />, onClick: () => setConversionOpen(true), disabled: !ready },
          { label: "Refresh", icon: <RefreshIcon fontSize="small" />, onClick: () => token && void load(token), disabled: loading || !token },
        ]}
      />

      {loading && (
        <Stack sx={{ alignItems: "center", py: 8, gap: 2 }}>
          <CircularProgress size={28} />
          <Typography sx={{ ...siType.body, ...onCanvasMuted }}>Reading the lists...</Typography>
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

      {!loading && !loadError && !listsExist && (
        <Card sx={{ textAlign: "center" }}>
          <Typography sx={{ ...siType.sectionTitle, color: editorial.ink, mb: 1 }}>
            The company and department lists have not been set up yet
          </Typography>
          <Typography sx={{ ...siType.body, color: editorial.muted, maxWidth: 640, mx: "auto", mb: 3 }}>
            Two SharePoint lists, so every form offers the same companies and departments instead of each
            keeping its own copy. Once they exist, "Build from existing forms" reads what your forms use
            today and fills them in, so nothing has to be typed twice and nothing already submitted changes.
          </Typography>
          <Button variant="contained" onClick={handleProvision} disabled={provisioning}>
            {provisioning ? "Creating..." : "Create the two lists"}
          </Button>
        </Card>
      )}

      {ready && (
        <Stack sx={{ gap: 2 }}>
          {companies.length === 0 && departments.length === 0 && (
            <Alert
              severity="info"
              action={(
                <Button size="small" onClick={() => setConversionOpen(true)}>
                  Build them
                </Button>
              )}
            >
              <AlertTitle>Both lists are empty</AlertTitle>
              Build them from what your forms already use, so the codes match what submissions have been
              storing and nothing needs migrating.
            </Alert>
          )}

          <PillTabs
            aria-label="Companies or departments"
            value={tab}
            onChange={(value) => { setTab(value); setSearch(""); }}
            tabs={[
              { value: "companies", label: "Companies", count: companies.length },
              { value: "departments", label: "Departments", count: departments.length },
            ]}
          />

          <Card pad="tight">
            <Stack direction={{ xs: "column", md: "row" }} sx={{ gap: 1.5, mb: 2 }}>
              <TextField
                size="small"
                placeholder={tab === "companies" ? "Search company or code..." : "Search department or code..."}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                sx={{
                  flex: 1,
                  minWidth: 200,
                  "& .MuiOutlinedInput-root": { borderRadius: "999px", backgroundColor: editorial.skySoft },
                  "& .MuiOutlinedInput-notchedOutline": { border: "none" },
                }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" sx={{ color: editorial.softMuted }} />
                      </InputAdornment>
                    ),
                  },
                  htmlInput: { "aria-label": tab === "companies" ? "Search companies" : "Search departments" },
                }}
              />
              {tab === "departments" && (
                <TextField
                  select
                  size="small"
                  value={companyFilter}
                  onChange={(event) => setCompanyFilter(event.target.value)}
                  sx={{
                    minWidth: 220,
                    "& .MuiOutlinedInput-root": { borderRadius: "999px", backgroundColor: editorial.skySoft },
                    "& .MuiOutlinedInput-notchedOutline": { border: "none" },
                  }}
                  slotProps={{ htmlInput: { "aria-label": "Filter by company" } }}
                >
                  <MenuItem value={ALL_COMPANIES}>All companies</MenuItem>
                  <MenuItem value={SHARED_ONLY}>Shared by all companies ({sharedCount})</MenuItem>
                  {companies.map((company) => (
                    <MenuItem key={company.code} value={company.code}>
                      {company.name || company.code}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Stack>

            {tab === "companies" && (
              <Box>
                {visibleCompanies.map((company) => renderRow(
                  company.id ?? company.code,
                  company,
                  codeLine(company),
                  () => setEditingCompany(company),
                  company.id !== undefined
                    ? () => setDeleteTarget({ kind: "companies", id: company.id as number, label: company.name || company.code })
                    : undefined,
                ))}
                {visibleCompanies.length === 0 && (
                  <Typography sx={{ ...siType.body, py: 4, textAlign: "center", color: editorial.muted }}>
                    {companies.length === 0 ? "No companies listed yet." : "Nothing matches that search."}
                  </Typography>
                )}
              </Box>
            )}

            {tab === "departments" && (
              <Box>
                {visibleDepartments.map((department) => renderRow(
                  department.id ?? `${department.company}|${department.code}`,
                  department,
                  (
                    <>
                      <Typography sx={sublineSx}>
                        {department.company.trim()
                          ? departmentScopeLabel(department, companies)
                          : "All companies"}
                      </Typography>
                      {codeLine(department)}
                    </>
                  ),
                  () => setEditingDepartment(department),
                  department.id !== undefined
                    ? () => setDeleteTarget({ kind: "departments", id: department.id as number, label: department.name || department.code })
                    : undefined,
                ))}
                {visibleDepartments.length === 0 && (
                  <Typography sx={{ ...siType.body, py: 4, textAlign: "center", color: editorial.muted }}>
                    {departments.length === 0 ? "No departments listed yet." : "Nothing matches that filter."}
                  </Typography>
                )}
              </Box>
            )}

            <Menu
              anchorEl={rowMenu?.anchor}
              open={Boolean(rowMenu)}
              onClose={() => setRowMenu(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
              <MenuItem
                onClick={() => {
                  const action = rowMenu?.onEdit;
                  setRowMenu(null);
                  action?.();
                }}
              >
                <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
                Edit
              </MenuItem>
              {rowMenu?.onRemove && (
                <MenuItem
                  onClick={() => {
                    const action = rowMenu?.onRemove;
                    setRowMenu(null);
                    action?.();
                  }}
                  sx={{ color: editorial.error }}
                >
                  <ListItemIcon sx={{ color: "inherit" }}><DeleteOutlinedIcon fontSize="small" /></ListItemIcon>
                  Remove
                </MenuItem>
              )}
            </Menu>
          </Card>

          <Typography sx={{ ...siType.subtext, ...onCanvasMuted }}>
            A form stores the code and shows the name, so renaming something here never changes what has
            already been submitted. Switch a row off rather than removing it: a submission that stored its
            code still has to resolve to a readable name.
          </Typography>
        </Stack>
      )}

      <Dialog open={!!editingCompany} onClose={saving ? undefined : () => setEditingCompany(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700 }}>
          {editingCompany?.id === undefined ? "Add a company" : "Edit this company"}
        </DialogTitle>
        <DialogContent dividers>
          <Stack sx={{ gap: 2, pt: 1 }}>
            <TextField
              label="Company name"
              size="small"
              value={editingCompany?.name ?? ""}
              onChange={(event) => setEditingCompany((current) =>
                current && { ...current, name: event.target.value })}
              helperText="What people see on the form. Safe to change at any time."
              fullWidth
            />
            <TextField
              label="Code"
              size="small"
              value={editingCompany?.code ?? ""}
              onChange={(event) => setEditingCompany((current) =>
                current && { ...current, code: event.target.value })}
              helperText={editingCompany?.id === undefined
                ? "What submissions store. Pick it once — changing it later orphans everything already submitted under it."
                : "What submissions store. Changing this orphans every submission and directory row that used the old value."}
              fullWidth
            />
            <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
              <Switch
                checked={editingCompany?.isActive ?? true}
                onChange={(event) => setEditingCompany((current) =>
                  current && { ...current, isActive: event.target.checked })}
              />
              <Typography sx={{ fontSize: "0.845rem" }}>
                Offered on forms. Switch off for a company that no longer submits; old submissions still resolve.
              </Typography>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingCompany(null)} disabled={saving} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleSaveCompany()}
            disabled={saving}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!editingDepartment} onClose={saving ? undefined : () => setEditingDepartment(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700 }}>
          {editingDepartment?.id === undefined ? "Add a department" : "Edit this department"}
        </DialogTitle>
        <DialogContent dividers>
          <Stack sx={{ gap: 2, pt: 1 }}>
            <TextField
              label="Department name"
              size="small"
              value={editingDepartment?.name ?? ""}
              onChange={(event) => setEditingDepartment((current) =>
                current && { ...current, name: event.target.value })}
              helperText="What people see on the form. Safe to change at any time."
              fullWidth
            />
            <TextField
              label="Code"
              size="small"
              value={editingDepartment?.code ?? ""}
              onChange={(event) => setEditingDepartment((current) =>
                current && { ...current, code: event.target.value })}
              helperText="What submissions store."
              fullWidth
            />
            <TextField
              select
              label="Belongs to"
              size="small"
              value={editingDepartment?.company ?? ""}
              onChange={(event) => setEditingDepartment((current) =>
                current && { ...current, company: event.target.value })}
              helperText="Left as all companies, this department is offered everywhere. Naming one company makes it that company's own, and it then overrides the shared department of the same code — for that company only."
              fullWidth
            >
              <MenuItem value="">All companies</MenuItem>
              {companies.map((company) => (
                <MenuItem key={company.code} value={company.code}>
                  {company.name || company.code}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
              <Switch
                checked={editingDepartment?.isActive ?? true}
                onChange={(event) => setEditingDepartment((current) =>
                  current && { ...current, isActive: event.target.checked })}
              />
              <Typography sx={{ fontSize: "0.845rem" }}>Offered on forms.</Typography>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingDepartment(null)} disabled={saving} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleSaveDepartment()}
            disabled={saving}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={saving ? undefined : () => setDeleteTarget(null)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Remove "{deleteTarget?.label}"?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: "0.875rem" }}>
            Any submission that stored this code will no longer resolve to a name, and any form still offering
            it will lose the option. Switching it off instead keeps old submissions readable.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={saving} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void handleDelete()}
            disabled={saving}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            {saving ? "Removing..." : "Remove"}
          </Button>
        </DialogActions>
      </Dialog>

      <OrgConversionDialog
        open={conversionOpen}
        token={token}
        onClose={() => setConversionOpen(false)}
        onDone={(message, ok) => {
          setSnackbar({ message, severity: ok ? "success" : "error" });
          if (token) void load(token);
        }}
      />

      <Snackbar
        open={!!snackbar}
        autoHideDuration={6000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={snackbar?.severity ?? "success"} onClose={() => setSnackbar(null)}>
          {snackbar?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

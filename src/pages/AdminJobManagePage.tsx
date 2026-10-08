import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  Skeleton,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Checkbox,
  FormControlLabel,
  IconButton,
  ToggleButton,
  Snackbar,
  Grid,
  Divider,
  Stack,
  Tooltip,
  CircularProgress,
  InputAdornment,
  TablePagination,
} from "@mui/material";
import {
  Add,
  Edit,
  Delete,
  DeleteForever,
  Close,
  Refresh,
  Work,
  FormatBold,
  FormatItalic,
  FormatListBulleted,
  FormatListNumbered,
  Search as SearchIcon,
  FilterList as FilterIcon,
  CheckRounded,
} from "@mui/icons-material";
import DOMPurify from "dompurify";
import { useMsal } from "@azure/msal-react";
import {
  fetchAdminJobs,
  createJobListing,
  updateJobListing,
  deleteJobListing,
  fetchColumnChoices,
} from "../utils/careersService";
import { acquireAccessTokenSilentOrRedirect } from "../utils/authRecovery";
import { CareerEmptyState, getCareerErrorMessage } from "../components/careers/careerUi";
import { FailurePanel } from "../components/common/StatusPanel";
import Card from "../components/common/Card";
import PageHeader from "../components/common/PageHeader";
import PillTabs from "../components/common/PillTabs";
import { editorial, si, siType } from "../theme/editorial";
import type { JobListing, CustomFieldDefinition } from "../types";

const EMPLOYMENT_TYPES = ["Full-Time", "Part-Time", "Contract", "Internship"];
const FIELD_TYPES: CustomFieldDefinition["type"][] = ["text", "textarea", "number", "choice", "date"];
type JobSortOption = "newest" | "title" | "department" | "applicants" | "closing";

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

const EMPTY_JOB = {
  title: "",
  company: "",
  jobDescription: "",
  department: "",
  location: "",
  employmentType: "",
  closingDate: "",
  status: "New",
};
type EditableJob = typeof EMPTY_JOB & { id?: string; customFields: CustomFieldDefinition[] };

function sharePointScope(): string {
  const spSiteUrl = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
  return `${new URL(spSiteUrl).origin}/AllSites.Manage`;
}

function MiniFormBuilder({
  fields,
  onChange,
}: {
  fields: CustomFieldDefinition[];
  onChange: (fields: CustomFieldDefinition[]) => void;
}) {
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editField, setEditField] = useState<CustomFieldDefinition>({
    name: "",
    label: "",
    type: "text",
    required: false,
  });
  const [choicesInput, setChoicesInput] = useState("");
  const [showForm, setShowForm] = useState(false);

  const resetForm = () => {
    setEditField({ name: "", label: "", type: "text", required: false });
    setChoicesInput("");
    setEditIndex(null);
    setShowForm(false);
  };

  const handleSave = () => {
    if (!editField.label.trim()) return;
    const name = editField.name || editField.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const choices = choicesInput.split(",").map((s) => s.trim()).filter(Boolean);
    const saved = { ...editField, name, choices: choices.length > 0 ? choices : undefined };
    if (editIndex !== null) {
      const next = [...fields];
      next[editIndex] = saved;
      onChange(next);
    } else {
      onChange([...fields, saved]);
    }
    resetForm();
  };

  const handleDelete = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const handleEdit = (index: number) => {
    setEditIndex(index);
    setEditField({ ...fields[index] });
    setChoicesInput((fields[index].choices || []).join(", "));
    setShowForm(true);
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: editorial.ink }}>
          Custom application questions
        </Typography>
        <Button
          size="small"
          startIcon={<Add />}
          onClick={() => { resetForm(); setShowForm(true); }}
         
        >
          Add question
        </Button>
      </Box>

      {/* Question list */}
      {fields.length === 0 && !showForm && (
        <Typography variant="body2" sx={{ color: editorial.softMuted, py: 2, textAlign: "center" }}>
          No custom questions added yet.
        </Typography>
      )}

      <Stack spacing={1} sx={{ mb: 2 }}>
        {fields.map((field, i) => (
          <Paper
            key={i}
            variant="outlined"
            sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1, borderRadius: `${si.radius}px`, borderColor: editorial.border }}
          >
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: editorial.ink, fontSize: "0.845rem" }}>
                {field.label}
              </Typography>
              <Box sx={{ display: "flex", gap: 0.5, mt: 0.25 }}>
                <Chip label={field.type} size="small" sx={{ height: 20, fontSize: "0.72rem", borderRadius: "4px", backgroundColor: editorial.skySoft, color: editorial.muted }} />
                {field.required && <Chip label="Required" size="small" sx={{ height: 20, fontSize: "0.72rem", borderRadius: "4px", backgroundColor: editorial.accentSoft, color: editorial.accentText }} />}
              </Box>
            </Box>
            <IconButton size="small" aria-label={`Edit question ${field.label}`} onClick={() => handleEdit(i)} sx={{ color: editorial.muted }}><Edit sx={{ fontSize: 16 }} /></IconButton>
            <IconButton size="small" aria-label={`Remove question ${field.label}`} onClick={() => handleDelete(i)} sx={{ color: editorial.error }}><Delete sx={{ fontSize: 16 }} /></IconButton>
          </Paper>
        ))}
      </Stack>

      {/* Add/Edit form */}
      <Dialog open={showForm} onClose={resetForm} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: `${si.radiusSheet}px` } } }}>
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: editorial.ink }}>
            {editIndex !== null ? "Edit Question" : "Add Question"}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Question Label"
              value={editField.label}
              onChange={(e) => setEditField({ ...editField, label: e.target.value, name: e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") })}
              fullWidth
              size="small"
             
            />
            <FormControl fullWidth size="small">
              <InputLabel>Type</InputLabel>
              <Select
                value={editField.type}
                label="Type"
                onChange={(e) => setEditField({ ...editField, type: e.target.value as CustomFieldDefinition["type"] })}
                
              >
                {FIELD_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControlLabel
              control={<Checkbox checked={editField.required} onChange={(e) => setEditField({ ...editField, required: e.target.checked })} />}
              label="Required"
            />
            {editField.type === "choice" && (
              <TextField
                label="Choices (separate by comma)"
                value={choicesInput}
                onChange={(e) => setChoicesInput(e.target.value)}
                fullWidth
                size="small"
               
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={resetForm} sx={{ color: editorial.muted }}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!editField.label.trim()}>
            {editIndex !== null ? "Update" : "Add"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ── Lightweight Rich Text Editor ──────────────────────────────────────────

function RichTextEditor({
  value,
  onChange,
  minHeight = 150,
}: {
  value: string;
  onChange: (html: string) => void;
  minHeight?: number;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [format, setFormat] = useState<string[]>([]);

  // Sync innerHTML when value changes externally
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = DOMPurify.sanitize(value);
    }
  }, [value]);

  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
    editorRef.current?.focus();
  };

  const handleMouseUp = () => {
    if (!editorRef.current) return;
    // Detect active formats
    const active: string[] = [];
    if (document.queryCommandState("bold")) active.push("bold");
    if (document.queryCommandState("italic")) active.push("italic");
    if (document.queryCommandState("insertUnorderedList")) active.push("ul");
    if (document.queryCommandState("insertOrderedList")) active.push("ol");
    setFormat(active);
  };

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    // Strip rich formatting on paste, keep only basic structure
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  return (
    <Box
      sx={{
        border: `1px solid ${editorial.border}`,
        borderRadius: `${si.radius}px`,
        overflow: "hidden",
        "&:focus-within": {
          borderColor: editorial.pmwBlue,
          boxShadow: `0 0 0 2px ${editorial.blueWash}`,
        },
      }}
    >
      {/* Toolbar */}
      <Box
        sx={{
          display: "flex",
          gap: 0.5,
          p: 0.5,
          borderBottom: `1px solid ${editorial.border}`,
          backgroundColor: editorial.paperSoft,
        }}
      >
        <Tooltip title="Bold">
          <ToggleButton
            value="bold"
            selected={format.includes("bold")}
            onMouseDown={(e) => { e.preventDefault(); exec("bold"); }}
            size="small"
            sx={{ border: "none", borderRadius: "999px", p: "4px 8px", minWidth: 32 }}
          >
            <FormatBold sx={{ fontSize: 18 }} />
          </ToggleButton>
        </Tooltip>
        <Tooltip title="Italic">
          <ToggleButton
            value="italic"
            selected={format.includes("italic")}
            onMouseDown={(e) => { e.preventDefault(); exec("italic"); }}
            size="small"
            sx={{ border: "none", borderRadius: "999px", p: "4px 8px", minWidth: 32 }}
          >
            <FormatItalic sx={{ fontSize: 18 }} />
          </ToggleButton>
        </Tooltip>
        <Box sx={{ width: 1, backgroundColor: editorial.border, mx: 0.5 }} />
        <Tooltip title="Bullet List">
          <ToggleButton
            value="ul"
            selected={format.includes("ul")}
            onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList"); }}
            size="small"
            sx={{ border: "none", borderRadius: "999px", p: "4px 8px", minWidth: 32 }}
          >
            <FormatListBulleted sx={{ fontSize: 18 }} />
          </ToggleButton>
        </Tooltip>
        <Tooltip title="Numbered List">
          <ToggleButton
            value="ol"
            selected={format.includes("ol")}
            onMouseDown={(e) => { e.preventDefault(); exec("insertOrderedList"); }}
            size="small"
            sx={{ border: "none", borderRadius: "999px", p: "4px 8px", minWidth: 32 }}
          >
            <FormatListNumbered sx={{ fontSize: 18 }} />
          </ToggleButton>
        </Tooltip>
      </Box>

      {/* Editor area */}
      <Box
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onMouseUp={handleMouseUp}
        onKeyUp={handleMouseUp}
        onPaste={handlePaste}
        sx={{
          minHeight,
          p: 2,
          outline: "none",
          fontSize: "0.875rem",
          lineHeight: 1.7,
          color: editorial.ink,
          "&:empty:before": {
            content: '"Describe the opportunity, responsibilities, and requirements..."',
            color: editorial.softMuted,
            pointerEvents: "none",
          },
          "& ul, & ol": { pl: 3, mb: 1 },
          "& li": { mb: 0.5 },
          "& strong": { fontWeight: 600 },
          "& p": { mb: 1 },
        }}
      />
    </Box>
  );
}

function JobFormDialog({
  open,
  onClose,
  onSave,
  initial,
  companyChoices,
  departmentChoices,
  locationChoices,
  employmentTypeChoices,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>, customFields: CustomFieldDefinition[]) => Promise<void>;
  initial: EditableJob | null;
  companyChoices: string[];
  departmentChoices: string[];
  locationChoices: string[];
  employmentTypeChoices: string[];
}) {
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [jobDescription, setJobDescription] = useState(initial?.jobDescription ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [employmentType, setEmploymentType] = useState(initial?.employmentType ?? "");
  const [closingDate, setClosingDate] = useState(initial?.closingDate ?? "");
  const [status, setStatus] = useState(initial?.status ?? "New");
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>(initial?.customFields ?? []);
  const [saving, setSaving] = useState(false);
  const companyOptions = company && !companyChoices.includes(company)
    ? [company, ...companyChoices]
    : companyChoices;
  const departmentOptions = department && !departmentChoices.includes(department)
    ? [department, ...departmentChoices]
    : departmentChoices;
  const locationOptions = location && !locationChoices.includes(location)
    ? [location, ...locationChoices]
    : locationChoices;
  const employmentTypeBaseOptions = employmentTypeChoices.length > 0 ? employmentTypeChoices : EMPLOYMENT_TYPES;
  const employmentTypeOptions = employmentType && !employmentTypeBaseOptions.includes(employmentType)
    ? [employmentType, ...employmentTypeBaseOptions]
    : employmentTypeBaseOptions;

  useEffect(() => {
    if (open && initial) {
      setTitle(initial.title);
      setCompany(initial.company);
      setJobDescription(initial.jobDescription);
      setDepartment(initial.department);
      setLocation(initial.location);
      setEmploymentType(initial.employmentType);
      setClosingDate(initial.closingDate);
      setStatus(initial.status);
      setCustomFields(initial.customFields);
    } else if (open) {
      setTitle(""); setJobDescription("");
      setCompany("");
      setDepartment("");
      setLocation("");
      setEmploymentType("");
      setClosingDate(""); setStatus("New");
      setCustomFields([]);
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open || initial) return;
    setDepartment((value) => value || departmentChoices[0] || "");
    setLocation((value) => value || locationChoices[0] || "");
    setEmploymentType((value) => value || employmentTypeBaseOptions[0] || "");
  }, [open, initial, departmentChoices, locationChoices, employmentTypeBaseOptions]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave(
        {
          title: title.trim(),
          company,
          jobDescription,
          department: department.trim(),
          location: location.trim(),
          employmentType,
          closingDate: closingDate || null,
          status,
        },
        customFields,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth slotProps={{ paper: { sx: { borderRadius: `${si.radiusSheet}px`, m: { xs: 1, sm: 2 } } } }}>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}>
        <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: editorial.ink }}>
          {isEdit ? "Edit opening" : "Create opening"}
        </Typography>
        <IconButton onClick={onClose} size="small" aria-label="Close"><Close /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Role Title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth required size="small" />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Company</InputLabel>
              <Select value={company} label="Company" onChange={(e) => setCompany(e.target.value)}>
                <MenuItem value="">Unassigned</MenuItem>
                {companyOptions.length > 0
                  ? companyOptions.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)
                  : <MenuItem value="__no_company_choices" disabled>No choices loaded</MenuItem>
                }
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Department</InputLabel>
              <Select value={department} label="Department" onChange={(e) => setDepartment(e.target.value)}>
                {departmentOptions.length > 0
                  ? departmentOptions.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)
                  : <MenuItem value="">No choices loaded</MenuItem>
                }
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Location</InputLabel>
              <Select value={location} label="Location" onChange={(e) => setLocation(e.target.value)}>
                {locationOptions.length > 0
                  ? locationOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)
                  : <MenuItem value="">No choices loaded</MenuItem>
                }
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: editorial.ink, mb: 0.5 }}>
              Opportunity Description
            </Typography>
            <RichTextEditor value={jobDescription} onChange={setJobDescription} minHeight={180} />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Employment Type</InputLabel>
              <Select value={employmentType} label="Employment Type" onChange={(e) => setEmploymentType(e.target.value)}>
                {employmentTypeOptions.map((t) => (
                  <MenuItem key={t} value={t}>{t}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <TextField label="Closing Date" type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} fullWidth size="small" slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
          {isEdit && (
            <Grid size={{ xs: 12, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select value={status} label="Status" onChange={(e) => setStatus(e.target.value)}>
                  <MenuItem value="New">New (Active)</MenuItem>
                  <MenuItem value="Closed">Closed</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          )}
        </Grid>

        <Divider sx={{ my: 2.5 }} />

        <MiniFormBuilder fields={customFields} onChange={setCustomFields} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onClose} sx={{ color: editorial.muted }}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={!title.trim() || saving}>
          {saving ? "Saving..." : isEdit ? "Update opening" : "Create opening"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function OpportunitiesLoadingSkeleton() {
  return (
    <Card pad="tight">
      {[1, 2, 3, 4, 5].map((item) => (
        <Box key={item} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1.25 }}>
          <Skeleton variant="circular" width={40} height={40} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="40%" />
            <Skeleton variant="text" width="65%" height={16} />
          </Box>
          <Skeleton variant="rounded" width={72} height={26} sx={{ borderRadius: "999px" }} />
        </Box>
      ))}
    </Card>
  );
}

export default function AdminJobManagePage() {
  const { instance, accounts } = useMsal();
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCause, setErrorCause] = useState<unknown>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editJob, setEditJob] = useState<EditableJob | null>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: "success" | "error" | "warning" } | null>(null);
  const [companyChoices, setCompanyChoices] = useState<string[]>([]);
  const [departmentChoices, setDepartmentChoices] = useState<string[]>([]);
  const [locationChoices, setLocationChoices] = useState<string[]>([]);
  const [employmentTypeChoices, setEmploymentTypeChoices] = useState<string[]>([]);
  const [closingJobId, setClosingJobId] = useState<string | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [deleteConfirmJob, setDeleteConfirmJob] = useState<JobListing | null>(null);
  const [closeConfirmJob, setCloseConfirmJob] = useState<JobListing | null>(null);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState<JobSortOption>("newest");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const getAdminAccessToken = useCallback(async () => {
    const account = instance.getActiveAccount() ?? accounts[0];
    if (!account) throw new Error("No signed-in account found.");
    return acquireAccessTokenSilentOrRedirect(instance, {
      scopes: [sharePointScope()],
      account,
    });
  }, [instance, accounts]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const accessToken = await getAdminAccessToken();
      const jobData = await fetchAdminJobs({ accessToken });
      setJobs(jobData);
    } catch (err) {
      setErrorCause(err);
      setError(getCareerErrorMessage(err, "Failed to load opportunities."));
    } finally {
      setLoading(false);
    }
  }, [getAdminAccessToken]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    async function loadChoices() {
      try {
        const accessToken = await getAdminAccessToken();
        const [company, dept, location, emp] = await Promise.all([
          fetchColumnChoices("Internal Job Listing", "Company", { accessToken }),
          fetchColumnChoices("Internal Job Listing", "Department", { accessToken }),
          fetchColumnChoices("Internal Job Listing", "Location", { accessToken }),
          fetchColumnChoices("Internal Job Listing", "Employment Type", { accessToken }),
        ]);
        setCompanyChoices(company);
        setDepartmentChoices(dept);
        setLocationChoices(location);
        setEmploymentTypeChoices(emp);
      } catch {
        setCompanyChoices([]);
        setDepartmentChoices([]);
        setLocationChoices([]);
        setEmploymentTypeChoices([]);
      }
    }
    void loadChoices();
  }, [getAdminAccessToken]);

  useEffect(() => {
    setPage(0);
  }, [searchText, statusFilter, companyFilter, typeFilter, sortBy]);

  // Everything except the Active/Closed stage, so each pill can count what it would show.
  const scopedJobs = (() => {
    const q = searchText.trim().toLowerCase();
    return jobs.filter((job) => {
      if (companyFilter && job.company !== companyFilter) return false;
      if (typeFilter && job.employmentType !== typeFilter) return false;
      if (q) {
        const haystack = [
          job.title,
          job.company ?? "",
          job.department,
          job.location,
          job.employmentType,
          job.status === "New" ? "Active" : "Closed",
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  })();

  const filteredJobs = useMemo(() => {
    const result = statusFilter
      ? scopedJobs.filter((job) => (job.status === "New" ? "Active" : "Closed") === statusFilter)
      : [...scopedJobs];

    result.sort((a, b) => {
      switch (sortBy) {
        case "title":
          return a.title.localeCompare(b.title);
        case "department":
          return a.department.localeCompare(b.department);
        case "applicants":
          return b.applicationCount - a.applicationCount;
        case "closing":
          return new Date(a.closingDate || "9999-12-31").getTime() - new Date(b.closingDate || "9999-12-31").getTime();
        default:
          return new Date(b.created).getTime() - new Date(a.created).getTime();
      }
    });

    return result;
  }, [scopedJobs, statusFilter, sortBy]);

  const pagedJobs = filteredJobs.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const jobTypeOptions = useMemo(() => {
    const options = new Set(jobs.map((job) => job.employmentType).filter(Boolean));
    return [...options].sort();
  }, [jobs]);
  const jobCompanyOptions = useMemo(() => {
    const options = new Set<string>();
    for (const job of jobs) {
      if (job.company) options.add(job.company);
    }
    return [...options].sort();
  }, [jobs]);
  const hasFilters = !!searchText.trim() || !!statusFilter || !!companyFilter || !!typeFilter;
  const hasSearchOptions = hasFilters || sortBy !== "newest";

  const handleCreate = () => {
    setEditJob(null);
    setDialogOpen(true);
  };

  const handleEdit = (job: JobListing) => {
    setEditJob({
      id: job.id,
      title: job.title,
      company: job.company ?? "",
      jobDescription: job.jobDescription,
      department: job.department,
      location: job.location,
      employmentType: job.employmentType,
      closingDate: job.closingDate ?? "",
      status: job.status,
      customFields: job.customFields ?? [],
    });
    setDialogOpen(true);
  };

  const handleSave = async (
    data: Record<string, unknown>,
    customFields: CustomFieldDefinition[],
  ) => {
    try {
      const accessToken = await getAdminAccessToken();

      if (editJob) {
        // Update existing
        const result = await updateJobListing(
          editJob.id || "",
          { ...data, customFields },
          { accessToken },
        );
        if (result.success) {
          setSnackbar({
            message: result.warning || "Opportunity updated.",
            severity: result.warning ? "warning" : "success",
          });
        }
      } else {
        const result = await createJobListing({ ...data, customFields }, { accessToken });
        if (result.success) {
          setSnackbar({
            message: (result as { warning?: string }).warning || "Opportunity created.",
            severity: (result as { warning?: string }).warning ? "warning" : "success",
          });
        }
      }
      setDialogOpen(false);
      void load();
    } catch (err) {
      setSnackbar({
        message: getCareerErrorMessage(err, "Could not save opportunity."),
        severity: "error",
      });
    }
  };

  const handleClose = async (job: JobListing) => {
    setClosingJobId(job.id);
    try {
      const accessToken = await getAdminAccessToken();
      const result = await updateJobListing(job.id, { status: "Closed" }, { accessToken });
      if (result.success) {
        setSnackbar({ message: "Opportunity closed.", severity: "success" });
        void load();
      }
    } catch (err) {
      setSnackbar({
        message: getCareerErrorMessage(err, "Failed to close opportunity."),
        severity: "error",
      });
    } finally {
      setClosingJobId(null);
    }
  };

  const handleDeleteJob = async (job: JobListing) => {
    setDeletingJobId(job.id);
    try {
      const accessToken = await getAdminAccessToken();
      const result = await deleteJobListing(job.id, { accessToken });
      if (result.success) {
        setSnackbar({ message: "Opportunity permanently deleted.", severity: "success" });
        setDeleteConfirmJob(null);
        void load();
      }
    } catch (err) {
      setSnackbar({
        message: getCareerErrorMessage(err, "Failed to delete opportunity."),
        severity: "error",
      });
    } finally {
      setDeletingJobId(null);
    }
  };

  const scopedCounts = {
    total: scopedJobs.length,
    active: scopedJobs.filter((j) => j.status === "New").length,
    closed: scopedJobs.filter((j) => j.status !== "New").length,
  };

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="Openings"
        description="Create and maintain internal advancement openings."
        primary={{ label: "Create opening", icon: <Add />, onClick: handleCreate }}
        secondary={[{ label: "Refresh", icon: <Refresh />, onClick: () => void load(), disabled: loading }]}
      />

      {/* Search and filters */}
      {!loading && !error && jobs.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <TextField
              placeholder="Search role, department, location..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              size="small"
              sx={{
                flex: "1 1 280px",
                minWidth: { xs: "100%", sm: 280 },
                "& .MuiOutlinedInput-root": { borderRadius: "999px", backgroundColor: editorial.skySoft },
                "& .MuiOutlinedInput-notchedOutline": { border: "none" },
              }}
              slotProps={{
                htmlInput: { "aria-label": "Search openings" },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: editorial.muted, fontSize: 20 }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button
              variant="text"
              startIcon={<FilterIcon />}
              onClick={() => setShowAdvancedFilters((open) => !open)}
              aria-expanded={showAdvancedFilters}
              sx={{ backgroundColor: showAdvancedFilters ? editorial.blueWash : editorial.panel, boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)", whiteSpace: "nowrap" }}
            >
              Company, type and sorting
            </Button>
            {companyFilter && (
              <Chip icon={<CheckRounded />} color="primary" label={companyFilter} onDelete={() => setCompanyFilter("")} deleteIcon={<Close aria-label={`Remove the ${companyFilter} filter`} />} />
            )}
            {typeFilter && (
              <Chip icon={<CheckRounded />} color="primary" label={typeFilter} onDelete={() => setTypeFilter("")} deleteIcon={<Close aria-label={`Remove the ${typeFilter} filter`} />} />
            )}
            {sortBy !== "newest" && (
              <Chip icon={<CheckRounded />} color="primary" label="Sorted" onDelete={() => setSortBy("newest")} deleteIcon={<Close aria-label="Go back to newest first" />} />
            )}
            {hasSearchOptions && (
              <Button
                size="small"
                startIcon={<Close />}
                onClick={() => {
                  setSearchText("");
                  setStatusFilter("");
                  setCompanyFilter("");
                  setTypeFilter("");
                  setSortBy("newest");
                }}
                sx={{ color: editorial.muted }}
              >
                Clear all
              </Button>
            )}
          </Box>

          {showAdvancedFilters && (
            <Card
              pad="tight"
              sx={{
                mt: 1.5,
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
                gap: 1.25,
              }}
            >
              <FormControl size="small" fullWidth>
                <InputLabel>Company</InputLabel>
                <Select value={companyFilter} label="Company" onChange={(e) => setCompanyFilter(e.target.value)}>
                  <MenuItem value="">All companies</MenuItem>
                  {jobCompanyOptions.map((company) => (
                    <MenuItem key={company} value={company}>{company}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel>Type</InputLabel>
                <Select value={typeFilter} label="Type" onChange={(e) => setTypeFilter(e.target.value)}>
                  <MenuItem value="">All types</MenuItem>
                  {jobTypeOptions.map((type) => (
                    <MenuItem key={type} value={type}>{type}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel>Sort</InputLabel>
                <Select value={sortBy} label="Sort" onChange={(e) => setSortBy(e.target.value as JobSortOption)}>
                  <MenuItem value="newest">Newest first</MenuItem>
                  <MenuItem value="title">Role A-Z</MenuItem>
                  <MenuItem value="department">Department A-Z</MenuItem>
                  <MenuItem value="applicants">Most applicants</MenuItem>
                  <MenuItem value="closing">Closing soon</MenuItem>
                </Select>
              </FormControl>
            </Card>
          )}
        </Box>
      )}

      {/* Active / closed: pick one to filter the list */}
      {!loading && !error && jobs.length > 0 && (
        <PillTabs
          aria-label="Opening status"
          value={statusFilter || "all"}
          onChange={(value) => setStatusFilter(value === "all" ? "" : value)}
          tabs={[
            { value: "all", label: "All", count: scopedCounts.total },
            { value: "Active", label: "Active", count: scopedCounts.active },
            { value: "Closed", label: "Closed", count: scopedCounts.closed },
          ]}
        />
      )}

      {/* Loading */}
      {loading && (
        <OpportunitiesLoadingSkeleton />
      )}

      {/* Error */}
      {!loading && error && <FailurePanel what="openings" error={errorCause} onRetry={load} />}

      {/* Empty */}
      {!loading && !error && jobs.length === 0 && (
        <CareerEmptyState
          icon={<Work />}
          title="No opportunities"
          description="Create the first internal advancement opening for PMW employees."
          action={
            <Button variant="contained" startIcon={<Add />} onClick={handleCreate}>
              Create opening
            </Button>
          }
        />
      )}
      {!loading && !error && jobs.length > 0 && filteredJobs.length === 0 && (
        <CareerEmptyState
          icon={<SearchIcon />}
          title="No results match"
          description="Try adjusting your search, status, company, type, or sort filter."
        />
      )}

      {/* List */}
      {!loading && !error && filteredJobs.length > 0 && (
        <Card pad="none" clip>
          <Box sx={{ px: 1, py: 1 }}>
            {pagedJobs.map((job) => {
              const active = job.status === "New";
              return (
                <Box
                  key={job.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 1.5,
                    px: 1,
                    py: 1.25,
                    borderRadius: `${si.radius}px`,
                    "&:hover": { backgroundColor: editorial.blueSoft },
                  }}
                >
                  <Box
                    aria-hidden
                    sx={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center", backgroundColor: editorial.blueWash, color: editorial.navyDeep }}
                  >
                    <Work sx={{ fontSize: 20 }} />
                  </Box>
                  <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
                    <Typography noWrap sx={{ ...siType.cardTitle, color: editorial.ink }}>{job.title}</Typography>
                    <Typography noWrap sx={{ ...siType.subtext, color: editorial.muted }}>
                      {[job.company || "Unassigned", job.department, job.location, job.employmentType].filter(Boolean).join(" · ")}
                    </Typography>
                  </Box>
                  <Typography sx={{ ...siType.data, color: editorial.navyDeep, minWidth: 90 }}>
                    {job.applicationCount} applicant{job.applicationCount !== 1 ? "s" : ""}
                  </Typography>
                  <Box
                    component="span"
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 0.75,
                      px: 1.25,
                      height: 26,
                      borderRadius: `${si.radiusPill}px`,
                      backgroundColor: active ? editorial.successSoft : editorial.skySoft,
                      color: active ? editorial.success : editorial.muted,
                      ...siType.subtext,
                      fontWeight: 600,
                    }}
                  >
                    <Box component="span" aria-hidden sx={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "currentColor" }} />
                    {active ? "Active" : "Closed"}
                  </Box>
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    <Tooltip title="Edit opening">
                      <IconButton size="small" aria-label={`Edit ${job.title}`} onClick={() => handleEdit(job)} sx={{ color: editorial.muted }}><Edit sx={{ fontSize: 18 }} /></IconButton>
                    </Tooltip>
                    {active && (
                      <Tooltip title="Close opening">
                        <span>
                          <IconButton
                            size="small"
                            aria-label={`Close ${job.title}`}
                            disabled={closingJobId === job.id || !!closeConfirmJob}
                            onClick={() => setCloseConfirmJob(job)}
                            sx={{ color: closingJobId === job.id || closeConfirmJob?.id === job.id ? editorial.softMuted : editorial.error }}
                          >
                            {closingJobId === job.id ? (
                              <CircularProgress size={18} sx={{ color: editorial.error }} />
                            ) : (
                              <Delete sx={{ fontSize: 18 }} />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                    <Tooltip title="Delete permanently">
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`Delete ${job.title} permanently`}
                          disabled={deletingJobId === job.id}
                          onClick={() => setDeleteConfirmJob(job)}
                          sx={{ color: deletingJobId === job.id ? editorial.softMuted : editorial.muted }}
                        >
                          {deletingJobId === job.id ? (
                            <CircularProgress size={18} sx={{ color: editorial.error }} />
                          ) : (
                            <DeleteForever sx={{ fontSize: 18 }} />
                          )}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                </Box>
              );
            })}
          </Box>
          <TablePagination
            component="div"
            count={filteredJobs.length}
            page={page}
            onPageChange={(_, nextPage) => setPage(nextPage)}
            rowsPerPage={rowsPerPage}
            labelRowsPerPage="Rows"
            sx={paginationSx}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(Number.parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[25, 50, 100]}
          />
        </Card>
      )}


      {/* Create/Edit Dialog */}
      <JobFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initial={editJob}
        companyChoices={companyChoices}
        departmentChoices={departmentChoices}
        locationChoices={locationChoices}
        employmentTypeChoices={employmentTypeChoices}
      />

      {/* Close Confirmation Dialog */}
      <Dialog open={!!closeConfirmJob} onClose={() => setCloseConfirmJob(null)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: `${si.radiusSheet}px` } } }}>
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: editorial.ink }}>
            Close opportunity?
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: editorial.muted }}>
            Are you sure you want to close <strong>{closeConfirmJob?.title}</strong>?
            This will stop new applications and mark the opening as closed.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            onClick={() => setCloseConfirmJob(null)}
            sx={{ color: editorial.muted }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              const job = closeConfirmJob;
              setCloseConfirmJob(null);
              if (job) handleClose(job);
            }}
            sx={{ backgroundColor: editorial.accent, "&:hover": { backgroundColor: editorial.accentText } }}
          >
            Close opening
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmJob} onClose={() => !deletingJobId && setDeleteConfirmJob(null)}>
        <DialogTitle>Delete opportunity?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to permanently delete <strong>{deleteConfirmJob?.title}</strong>?
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            onClick={() => setDeleteConfirmJob(null)}
            disabled={!!deletingJobId}
            sx={{ color: editorial.muted }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!!deletingJobId}
            onClick={() => deleteConfirmJob && handleDeleteJob(deleteConfirmJob)}
            sx={{ backgroundColor: editorial.error, "&:hover": { backgroundColor: editorial.error } }}
          >
            {deletingJobId ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={!!snackbar} autoHideDuration={4000} onClose={() => setSnackbar(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        {snackbar ? (
          <Alert
            severity={snackbar.severity}
            onClose={() => setSnackbar(null)}
            sx={{
              borderRadius: `${si.radius}px`,
              fontWeight: 700,
              fontSize: "0.875rem",
              boxShadow: si.shadowRaised,
              color: editorial.ink,
              "& .MuiAlert-icon": { fontSize: 22, alignSelf: "center" },
            }}
          >
            {snackbar.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  Card,
  CardContent,
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
} from "@mui/icons-material";
import DOMPurify from "dompurify";
import { useMsal } from "@azure/msal-react";
import {
  fetchAdminJobs,
  createJobListing,
  updateJobListing,
  deleteJobListing,
  fetchColumnChoices,
  fetchCareerPortalCards,
  createCareerPortalCard,
  updateCareerPortalCard,
  deleteCareerPortalCard,
} from "../utils/careersService";
import CareerPortalHeader from "../components/careers/CareerPortalHeader";
import type { JobListing, CustomFieldDefinition, CareerPortalCard } from "../types";

const EMPLOYMENT_TYPES = ["Full-Time", "Part-Time", "Contract", "Internship"];
const FIELD_TYPES: CustomFieldDefinition["type"][] = ["text", "textarea", "number", "choice", "date"];
type JobSortOption = "newest" | "title" | "department" | "applicants" | "closing";

const EMPTY_JOB = {
  title: "",
  jobDescription: "",
  department: "",
  location: "",
  employmentType: "",
  closingDate: "",
  status: "New",
};

const DEFAULT_CARD_COLORS = {
  start: "#0078D4",
  end: "#6264A7",
  accent: "#16A34A",
};

const EMPTY_PORTAL_CARD: Omit<CareerPortalCard, "id" | "created"> = {
  title: "",
  description: "",
  imageUrl: "",
  sortOrder: 0,
  status: "Active",
  targetType: "none",
  targetValue: "",
  colorStart: DEFAULT_CARD_COLORS.start,
  colorEnd: DEFAULT_CARD_COLORS.end,
  colorAccent: DEFAULT_CARD_COLORS.accent,
};

function safeCardColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function cardGradient(card: Pick<CareerPortalCard, "colorStart" | "colorEnd" | "colorAccent">): string {
  return `linear-gradient(135deg, ${safeCardColor(card.colorStart, DEFAULT_CARD_COLORS.start)} 0%, ${safeCardColor(card.colorEnd, DEFAULT_CARD_COLORS.end)} 58%, ${safeCardColor(card.colorAccent, DEFAULT_CARD_COLORS.accent)} 100%)`;
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
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: "#374151" }}>
          Custom Application Questions
        </Typography>
        <Button
          size="small"
          startIcon={<Add />}
          onClick={() => { resetForm(); setShowForm(true); }}
          sx={{ borderRadius: "8px", textTransform: "none", fontWeight: 600 }}
        >
          Add Question
        </Button>
      </Box>

      {/* Question list */}
      {fields.length === 0 && !showForm && (
        <Typography variant="body2" sx={{ color: "#9CA3AF", py: 2, textAlign: "center" }}>
          No custom questions added yet.
        </Typography>
      )}

      <Stack spacing={1} sx={{ mb: 2 }}>
        {fields.map((field, i) => (
          <Paper
            key={i}
            variant="outlined"
            sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1, borderRadius: "8px", borderColor: "#E5E7EB" }}
          >
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: "#111827", fontSize: "0.85rem" }}>
                {field.label}
              </Typography>
              <Box sx={{ display: "flex", gap: 0.5, mt: 0.25 }}>
                <Chip label={field.type} size="small" sx={{ height: 20, fontSize: "0.65rem", borderRadius: "4px", backgroundColor: "#F3F4F6", color: "#6B7280" }} />
                {field.required && <Chip label="Required" size="small" sx={{ height: 20, fontSize: "0.65rem", borderRadius: "4px", backgroundColor: "#FEF3C7", color: "#92400E" }} />}
              </Box>
            </Box>
            <IconButton size="small" onClick={() => handleEdit(i)} sx={{ color: "#6B7280" }}><Edit sx={{ fontSize: 16 }} /></IconButton>
            <IconButton size="small" onClick={() => handleDelete(i)} sx={{ color: "#DC2626" }}><Delete sx={{ fontSize: 16 }} /></IconButton>
          </Paper>
        ))}
      </Stack>

      {/* Add/Edit form */}
      <Dialog open={showForm} onClose={resetForm} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: "8px" } } }}>
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: "#111827" }}>
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
              slotProps={{ input: { sx: { borderRadius: "8px" } } }}
            />
            <FormControl fullWidth size="small">
              <InputLabel>Type</InputLabel>
              <Select
                value={editField.type}
                label="Type"
                onChange={(e) => setEditField({ ...editField, type: e.target.value as CustomFieldDefinition["type"] })}
                sx={{ borderRadius: "8px" }}
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
                slotProps={{ input: { sx: { borderRadius: "8px" } } }}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={resetForm} sx={{ borderRadius: "8px", textTransform: "none", color: "#6B7280" }}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!editField.label.trim()} sx={{ borderRadius: "8px", textTransform: "none", backgroundColor: "#0078D4" }}>
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
        border: "1px solid #D1D5DB",
        borderRadius: "8px",
        overflow: "hidden",
        "&:focus-within": {
          borderColor: "#0078D4",
          boxShadow: "0 0 0 2px rgba(0, 120, 212, 0.15)",
        },
      }}
    >
      {/* Toolbar */}
      <Box
        sx={{
          display: "flex",
          gap: 0.5,
          p: 0.5,
          borderBottom: "1px solid #E5E7EB",
          backgroundColor: "#F9FAFB",
        }}
      >
        <Tooltip title="Bold">
          <ToggleButton
            value="bold"
            selected={format.includes("bold")}
            onMouseDown={(e) => { e.preventDefault(); exec("bold"); }}
            size="small"
            sx={{ border: "none", borderRadius: "6px", p: "4px 8px", minWidth: 32 }}
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
            sx={{ border: "none", borderRadius: "6px", p: "4px 8px", minWidth: 32 }}
          >
            <FormatItalic sx={{ fontSize: 18 }} />
          </ToggleButton>
        </Tooltip>
        <Box sx={{ width: 1, backgroundColor: "#E5E7EB", mx: 0.5 }} />
        <Tooltip title="Bullet List">
          <ToggleButton
            value="ul"
            selected={format.includes("ul")}
            onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList"); }}
            size="small"
            sx={{ border: "none", borderRadius: "6px", p: "4px 8px", minWidth: 32 }}
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
            sx={{ border: "none", borderRadius: "6px", p: "4px 8px", minWidth: 32 }}
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
          fontSize: "0.9rem",
          lineHeight: 1.7,
          color: "#374151",
          "&:empty:before": {
            content: '"Describe the opportunity, responsibilities, and requirements..."',
            color: "#9CA3AF",
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
  departmentChoices,
  employmentTypeChoices,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>, customFields: CustomFieldDefinition[]) => Promise<void>;
  initial: (typeof EMPTY_JOB) & { customFields: CustomFieldDefinition[] } | null;
  departmentChoices: string[];
  employmentTypeChoices: string[];
}) {
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [jobDescription, setJobDescription] = useState(initial?.jobDescription ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [employmentType, setEmploymentType] = useState(initial?.employmentType ?? "");
  const [closingDate, setClosingDate] = useState(initial?.closingDate ?? "");
  const [status, setStatus] = useState(initial?.status ?? "New");
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>(initial?.customFields ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && initial) {
      setTitle(initial.title);
      setJobDescription(initial.jobDescription);
      setDepartment(initial.department);
      setLocation(initial.location);
      setEmploymentType(initial.employmentType);
      setClosingDate(initial.closingDate);
      setStatus(initial.status);
      setCustomFields(initial.customFields);
    } else if (open) {
      setTitle(""); setJobDescription(""); setDepartment(""); setLocation("");
      setEmploymentType(""); setClosingDate(""); setStatus("New");
      setCustomFields([]);
    }
  }, [open, initial]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave(
        {
          title: title.trim(),
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
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth slotProps={{ paper: { sx: { borderRadius: "8px", m: { xs: 1, sm: 2 } } } }}>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}>
        <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: "#111827" }}>
          {isEdit ? "Edit Opportunity" : "Create Opportunity"}
        </Typography>
        <IconButton onClick={onClose} size="small"><Close /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Role Title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth required size="small" slotProps={{ input: { sx: { borderRadius: "8px" } } }} />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Department</InputLabel>
              <Select value={department} label="Department" onChange={(e) => setDepartment(e.target.value)} sx={{ borderRadius: "8px" }}>
                {departmentChoices.length > 0
                  ? departmentChoices.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)
                  : <MenuItem value="">No choices loaded</MenuItem>
                }
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <TextField label="Location" value={location} onChange={(e) => setLocation(e.target.value)} fullWidth size="small" slotProps={{ input: { sx: { borderRadius: "8px" } } }} />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: "#374151", mb: 0.5 }}>
              Opportunity Description
            </Typography>
            <RichTextEditor value={jobDescription} onChange={setJobDescription} minHeight={180} />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Employment Type</InputLabel>
              <Select value={employmentType} label="Employment Type" onChange={(e) => setEmploymentType(e.target.value)} sx={{ borderRadius: "8px" }}>
                {(employmentTypeChoices.length > 0 ? employmentTypeChoices : EMPLOYMENT_TYPES).map((t) => (
                  <MenuItem key={t} value={t}>{t}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <TextField label="Closing Date" type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} fullWidth size="small" slotProps={{ inputLabel: { shrink: true }, input: { sx: { borderRadius: "8px" } } }} />
          </Grid>
          {isEdit && (
            <Grid size={{ xs: 12, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select value={status} label="Status" onChange={(e) => setStatus(e.target.value)} sx={{ borderRadius: "8px" }}>
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
        <Button onClick={onClose} sx={{ borderRadius: "8px", textTransform: "none", color: "#6B7280" }}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={!title.trim() || saving} sx={{ borderRadius: "8px", textTransform: "none", backgroundColor: "#0078D4" }}>
          {saving ? "Saving..." : isEdit ? "Update Opportunity" : "Create Opportunity"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function PortalCardDialog({
  open,
  onClose,
  onSave,
  initial,
  saving,
  jobs,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (card: Omit<CareerPortalCard, "id" | "created">) => void;
  initial: CareerPortalCard | null;
  saving: boolean;
  jobs: JobListing[];
}) {
  const [form, setForm] = useState<Omit<CareerPortalCard, "id" | "created">>(() =>
    initial ? {
      title: initial.title,
      description: initial.description,
      imageUrl: initial.imageUrl,
      sortOrder: initial.sortOrder,
      status: initial.status,
      targetType: initial.targetType,
      targetValue: initial.targetValue,
      colorStart: initial.colorStart || DEFAULT_CARD_COLORS.start,
      colorEnd: initial.colorEnd || DEFAULT_CARD_COLORS.end,
      colorAccent: initial.colorAccent || DEFAULT_CARD_COLORS.accent,
      isSystemDefault: initial.isSystemDefault,
      locked: initial.locked,
      source: initial.source,
    } : EMPTY_PORTAL_CARD,
  );
  const isSystemDefault = Boolean(initial?.isSystemDefault);

  const updateField = <K extends keyof Omit<CareerPortalCard, "id" | "created">>(
    key: K,
    value: Omit<CareerPortalCard, "id" | "created">[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onClose={saving ? () => {} : onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: "8px" } } }}>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: "#111827" }}>
            {initial ? "Edit Portal Card" : "Add Portal Card"}
          </Typography>
          {isSystemDefault && (
            <Chip
              label="System Default"
              size="small"
              sx={{ borderRadius: "8px", backgroundColor: "#EEF2FF", color: "#4F46E5", fontWeight: 800 }}
            />
          )}
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Title"
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
            fullWidth
            required
            size="small"
            slotProps={{ input: { sx: { borderRadius: "8px" } } }}
          />
          <TextField
            label="Description"
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            fullWidth
            multiline
            rows={3}
            size="small"
            slotProps={{ input: { sx: { borderRadius: "8px" } } }}
          />
          {!isSystemDefault && (
            <TextField
              label="Picture URL"
              value={form.imageUrl}
              onChange={(e) => updateField("imageUrl", e.target.value)}
              fullWidth
              size="small"
              placeholder="https://..."
              slotProps={{ input: { sx: { borderRadius: "8px" } } }}
            />
          )}
          {isSystemDefault && (
            <Grid container spacing={1.25}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Start color"
                  type="color"
                  value={safeCardColor(form.colorStart, DEFAULT_CARD_COLORS.start)}
                  onChange={(e) => updateField("colorStart", e.target.value)}
                  fullWidth
                  size="small"
                  slotProps={{ inputLabel: { shrink: true }, input: { sx: { borderRadius: "8px" } } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="End color"
                  type="color"
                  value={safeCardColor(form.colorEnd, DEFAULT_CARD_COLORS.end)}
                  onChange={(e) => updateField("colorEnd", e.target.value)}
                  fullWidth
                  size="small"
                  slotProps={{ inputLabel: { shrink: true }, input: { sx: { borderRadius: "8px" } } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Accent color"
                  type="color"
                  value={safeCardColor(form.colorAccent, DEFAULT_CARD_COLORS.accent)}
                  onChange={(e) => updateField("colorAccent", e.target.value)}
                  fullWidth
                  size="small"
                  slotProps={{ inputLabel: { shrink: true }, input: { sx: { borderRadius: "8px" } } }}
                />
              </Grid>
            </Grid>
          )}
          {!isSystemDefault && form.imageUrl && (
            <Box
              component="img"
              src={form.imageUrl}
              alt=""
              sx={{
                width: "100%",
                height: 160,
                objectFit: "cover",
                borderRadius: "8px",
                border: "1px solid #E5E7EB",
                backgroundColor: "#F3F4F6",
              }}
            />
          )}
          {isSystemDefault && (
            <Box
              sx={{
                width: "100%",
                height: 160,
                borderRadius: "8px",
                border: "1px solid #E5E7EB",
                background: cardGradient(form),
              }}
            />
          )}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Sort Order"
                type="number"
                value={form.sortOrder}
                onChange={(e) => updateField("sortOrder", Number(e.target.value))}
                fullWidth
                size="small"
                slotProps={{ input: { sx: { borderRadius: "8px" } } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  value={form.status}
                  label="Status"
                  onChange={(e) => updateField("status", e.target.value as CareerPortalCard["status"])}
                  sx={{ borderRadius: "8px" }}
                >
                  <MenuItem value="Active">Active</MenuItem>
                  <MenuItem value="Hidden">Hidden</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Click Target</InputLabel>
                <Select
                  value={form.targetType}
                  label="Click Target"
                  onChange={(e) => {
                    const targetType = e.target.value as CareerPortalCard["targetType"];
                    setForm((prev) => ({ ...prev, targetType, targetValue: "" }));
                  }}
                  sx={{ borderRadius: "8px" }}
                >
                  <MenuItem value="none">No target</MenuItem>
                  <MenuItem value="job">Job item</MenuItem>
                  <MenuItem value="link">Custom link</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              {form.targetType === "job" ? (
                <FormControl fullWidth size="small" required>
                  <InputLabel>Target Job</InputLabel>
                  <Select
                    value={form.targetValue}
                    label="Target Job"
                    onChange={(e) => updateField("targetValue", e.target.value)}
                    sx={{ borderRadius: "8px" }}
                  >
                    {jobs.map((job) => (
                      <MenuItem key={job.id} value={job.id}>
                        {job.title}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : form.targetType === "link" ? (
                <TextField
                  label="Target Link"
                  value={form.targetValue}
                  onChange={(e) => updateField("targetValue", e.target.value)}
                  fullWidth
                  required
                  size="small"
                  placeholder="https://... or /career-portal"
                  slotProps={{ input: { sx: { borderRadius: "8px" } } }}
                />
              ) : null}
            </Grid>
          </Grid>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={saving} sx={{ borderRadius: "8px", textTransform: "none", color: "#6B7280" }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!form.title.trim() || saving || (form.targetType !== "none" && !form.targetValue.trim())}
          onClick={() => onSave({
            ...form,
            title: form.title.trim(),
            description: form.description.trim(),
            imageUrl: isSystemDefault ? "" : form.imageUrl.trim(),
            targetValue: form.targetType === "none" ? "" : form.targetValue.trim(),
            colorStart: safeCardColor(form.colorStart, DEFAULT_CARD_COLORS.start),
            colorEnd: safeCardColor(form.colorEnd, DEFAULT_CARD_COLORS.end),
            colorAccent: safeCardColor(form.colorAccent, DEFAULT_CARD_COLORS.accent),
          })}
          sx={{ borderRadius: "8px", textTransform: "none", backgroundColor: "#0078D4" }}
        >
          {saving ? "Saving..." : initial ? "Update Card" : "Add Card"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function AdminJobManagePage() {
  const { instance, accounts } = useMsal();
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [portalCards, setPortalCards] = useState<CareerPortalCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editJob, setEditJob] = useState<(typeof EMPTY_JOB) & { customFields: CustomFieldDefinition[] } | null>(null);
  const [portalCardDialogOpen, setPortalCardDialogOpen] = useState(false);
  const [editPortalCard, setEditPortalCard] = useState<CareerPortalCard | null>(null);
  const [savingPortalCard, setSavingPortalCard] = useState(false);
  const [deletingPortalCardId, setDeletingPortalCardId] = useState<string | null>(null);
  const [deleteConfirmPortalCard, setDeleteConfirmPortalCard] = useState<CareerPortalCard | null>(null);
  const [portalCardSearch, setPortalCardSearch] = useState("");
  const [snackbar, setSnackbar] = useState<{ message: string; severity: "success" | "error" | "warning" } | null>(null);
  const [departmentChoices, setDepartmentChoices] = useState<string[]>([]);
  const [employmentTypeChoices, setEmploymentTypeChoices] = useState<string[]>([]);
  const [closingJobId, setClosingJobId] = useState<string | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [deleteConfirmJob, setDeleteConfirmJob] = useState<JobListing | null>(null);
  const [closeConfirmJob, setCloseConfirmJob] = useState<JobListing | null>(null);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState<JobSortOption>("newest");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  /** Create the CustomFields column on the job list via SharePoint REST (client-side token). */
  async function ensureCustomFieldsColumn(): Promise<boolean> {
    try {
      const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
      const tokenRes = await instance.acquireTokenSilent({
        scopes: [`${new URL(SP_SITE_URL).origin}/AllSites.Manage`],
        account: accounts[0],
      });
      const token = tokenRes.accessToken;

      // Get request digest
      const digestResp = await fetch(`${SP_SITE_URL}/_api/contextinfo`, {
        method: "POST",
        headers: { Accept: "application/json;odata=nometadata", Authorization: `Bearer ${token}` },
      });
      if (!digestResp.ok) return false;
      const digestData = await digestResp.json();
      const digest: string = digestData.FormDigestValue;

      // Try to add the CustomFields Note column — 400 likely means column already exists
      const resp = await fetch(`${SP_SITE_URL}/_api/web/lists/getbytitle('Internal Job Listing')/fields`, {
        method: "POST",
        headers: {
          Accept: "application/json;odata=nometadata",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json;odata=verbose",
          "X-RequestDigest": digest,
        },
        body: JSON.stringify({
          __metadata: { type: "SP.FieldMultiLineText" },
          FieldTypeKind: 3,
          Title: "CustomFields",
          StaticName: "CustomFields",
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        // Column already exists — not an error
        if (text.toLowerCase().includes("duplicate") || text.toLowerCase().includes("already exists")) return true;
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobData, cardData] = await Promise.all([
        fetchAdminJobs(),
        fetchCareerPortalCards(),
      ]);
      setJobs(jobData);
      setPortalCards(cardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load opportunities");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    async function loadChoices() {
      const [dept, emp] = await Promise.all([
        fetchColumnChoices("Internal Job Listing", "Department"),
        fetchColumnChoices("Internal Job Listing", "Employment Type"),
      ]);
      setDepartmentChoices(dept);
      setEmploymentTypeChoices(emp);
    }
    void loadChoices();
  }, []);

  useEffect(() => {
    setPage(0);
  }, [searchText, statusFilter, typeFilter, sortBy]);

  const filteredJobs = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const result = jobs.filter((job) => {
      if (statusFilter) {
        const normalized = job.status === "New" ? "Active" : "Closed";
        if (normalized !== statusFilter) return false;
      }
      if (typeFilter && job.employmentType !== typeFilter) return false;
      if (q) {
        const haystack = [
          job.title,
          job.department,
          job.location,
          job.employmentType,
          job.status === "New" ? "Active" : "Closed",
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

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
  }, [jobs, searchText, statusFilter, typeFilter, sortBy]);

  const pagedJobs = filteredJobs.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const jobTypeOptions = useMemo(() => {
    const options = new Set(jobs.map((job) => job.employmentType).filter(Boolean));
    return [...options].sort();
  }, [jobs]);
  const hasFilters = !!searchText.trim() || !!statusFilter || !!typeFilter;
  const filteredPortalCards = useMemo(() => {
    const q = portalCardSearch.trim().toLowerCase();
    return portalCards.filter((card) => {
      if (!q) return true;
      return [card.title, card.description, card.imageUrl, card.status, card.isSystemDefault ? "system default" : ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [portalCards, portalCardSearch]);

  const handleCreate = () => {
    setEditJob(null);
    setDialogOpen(true);
  };

  const handleEdit = (job: JobListing) => {
    setEditJob({
      title: job.title,
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

  const handleCreatePortalCard = () => {
    setEditPortalCard(null);
    setPortalCardDialogOpen(true);
  };

  const handleEditPortalCard = (card: CareerPortalCard) => {
    setEditPortalCard(card);
    setPortalCardDialogOpen(true);
  };

  const handleSavePortalCard = async (card: Omit<CareerPortalCard, "id" | "created">) => {
    setSavingPortalCard(true);
    try {
      if (editPortalCard) {
        await updateCareerPortalCard(editPortalCard.id, card);
        setSnackbar({ message: "Portal card updated", severity: "success" });
      } else {
        await createCareerPortalCard(card);
        setSnackbar({ message: "Portal card added", severity: "success" });
      }
      setPortalCardDialogOpen(false);
      setEditPortalCard(null);
      void load();
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : "Failed to save portal card",
        severity: "error",
      });
    } finally {
      setSavingPortalCard(false);
    }
  };

  const handleDeletePortalCard = async (card: CareerPortalCard) => {
    if (card.isSystemDefault) {
      setSnackbar({ message: "System default cards cannot be deleted", severity: "error" });
      setDeleteConfirmPortalCard(null);
      return;
    }
    setDeletingPortalCardId(card.id);
    try {
      await deleteCareerPortalCard(card.id);
      setSnackbar({ message: "Portal card deleted", severity: "success" });
      setDeleteConfirmPortalCard(null);
      void load();
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : "Failed to delete portal card",
        severity: "error",
      });
    } finally {
      setDeletingPortalCardId(null);
    }
  };

  const handleSave = async (
    data: Record<string, unknown>,
    customFields: CustomFieldDefinition[],
  ) => {
    try {
      // If custom fields are present, ensure the column exists first
      const hasCustom = Array.isArray(customFields) && customFields.length > 0;
      if (hasCustom) {
        await ensureCustomFieldsColumn();
      }

      if (editJob) {
        // Update existing
        const result = await updateJobListing(
          jobs.find((j) => j.title === editJob.title)?.id || "",
          { ...data, customFields },
        );
        if (result.success) {
          setSnackbar({
            message: result.warning || "Opportunity updated",
            severity: result.warning ? "warning" : "success",
          });
        }
      } else {
        const result = await createJobListing({ ...data, customFields });
        if (result.success) {
          setSnackbar({
            message: (result as { warning?: string }).warning || "Opportunity created",
            severity: (result as { warning?: string }).warning ? "warning" : "success",
          });
        }
      }
      setDialogOpen(false);
      void load();
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : "Operation failed",
        severity: "error",
      });
    }
  };

  const handleClose = async (job: JobListing) => {
    setClosingJobId(job.id);
    try {
      const result = await updateJobListing(job.id, { status: "Closed" });
      if (result.success) {
        setSnackbar({ message: "Opportunity closed", severity: "success" });
        void load();
      }
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : "Failed to close opportunity",
        severity: "error",
      });
    } finally {
      setClosingJobId(null);
    }
  };

  const handleDeleteJob = async (job: JobListing) => {
    setDeletingJobId(job.id);
    try {
      const result = await deleteJobListing(job.id);
      if (result.success) {
        setSnackbar({ message: "Opportunity permanently deleted", severity: "success" });
        setDeleteConfirmJob(null);
        void load();
      }
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : "Failed to delete opportunity",
        severity: "error",
      });
    } finally {
      setDeletingJobId(null);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", background: "var(--app-bg, #F6F8FB)" }}>
      <CareerPortalHeader
        title="Manage Opportunities"
        subtitle="Create and maintain internal advancement openings."
        activeSection="manage"
        isAdmin
        backPath="/admin/dashboard"
        backLabel="Back to forms dashboard"
        maxWidth="xl"
        actions={(
          <>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={load}
              disabled={loading}
              sx={{ whiteSpace: "nowrap", borderColor: "#D1D5DB", color: "#6B7280" }}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleCreate}
              sx={{ whiteSpace: "nowrap", backgroundColor: "#0078D4" }}
            >
              Create Opening
            </Button>
          </>
        )}
      />

      <Box sx={{ maxWidth: 1440, mx: "auto", px: { xs: 1.5, sm: 3, md: 4 }, py: { xs: 2, sm: 3 } }}>
        {/* Filters */}
        {!loading && !error && jobs.length > 0 && (
          <Paper
            sx={{
              p: 2,
              mb: 3,
              borderRadius: "8px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              display: "flex",
              flexWrap: "wrap",
              gap: 2,
              alignItems: "center",
            }}
          >
            <TextField
              placeholder="Search role, department, location..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              size="small"
              sx={{
                flex: { xs: "1 1 100%", md: "1 1 280px" },
                minWidth: { xs: "unset", md: 260 },
                "& .MuiOutlinedInput-root": {
                  borderRadius: "8px",
                  backgroundColor: "#F8F9FC",
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
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={(e) => setStatusFilter(e.target.value)}
                sx={{ borderRadius: "8px", backgroundColor: "#F8F9FC" }}
              >
                <MenuItem value="">All statuses</MenuItem>
                <MenuItem value="Active">Active</MenuItem>
                <MenuItem value="Closed">Closed</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 150 } }}>
              <InputLabel>Type</InputLabel>
              <Select
                value={typeFilter}
                label="Type"
                onChange={(e) => setTypeFilter(e.target.value)}
                sx={{ borderRadius: "8px", backgroundColor: "#F8F9FC" }}
              >
                <MenuItem value="">All types</MenuItem>
                {jobTypeOptions.map((type) => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 160 } }}>
              <InputLabel>Sort</InputLabel>
              <Select
                value={sortBy}
                label="Sort"
                onChange={(e) => setSortBy(e.target.value as JobSortOption)}
                sx={{ borderRadius: "8px", backgroundColor: "#F8F9FC" }}
              >
                <MenuItem value="newest">Newest first</MenuItem>
                <MenuItem value="title">Role A-Z</MenuItem>
                <MenuItem value="department">Department A-Z</MenuItem>
                <MenuItem value="applicants">Most applicants</MenuItem>
                <MenuItem value="closing">Closing soon</MenuItem>
              </Select>
            </FormControl>

            {hasFilters && (
              <Button
                size="small"
                onClick={() => {
                  setSearchText("");
                  setStatusFilter("");
                  setTypeFilter("");
                }}
                sx={{ borderRadius: "8px", textTransform: "none", color: "#6B7280", fontWeight: 600 }}
              >
                Clear
              </Button>
            )}

            {(hasFilters || filteredJobs.length < jobs.length) && (
              <Chip
                label={`${filteredJobs.length} of ${jobs.length} openings`}
                size="small"
                sx={{ backgroundColor: "#F0F7FF", color: "#0078D4", fontWeight: 600, fontSize: "0.75rem", borderRadius: "8px" }}
              />
            )}
          </Paper>
        )}

        {/* Stats */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: "Total Openings", value: jobs.length, color: "#0078D4", icon: <Work /> },
            { label: "Active", value: jobs.filter((j) => j.status === "New").length, color: "#34A853", icon: <Work /> },
            { label: "Closed", value: jobs.filter((j) => j.status !== "New").length, color: "#9CA3AF", icon: <Work /> },
          ].map((stat) => (
            <Grid size={{ xs: 4 }} key={stat.label}>
              <Card sx={{ borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <CardContent sx={{ p: { xs: 1.5, sm: 2.5 }, textAlign: "center" }}>
                  <Typography variant="h4" sx={{ fontWeight: 700, color: stat.color, fontSize: { xs: "1.5rem", sm: "2.125rem" } }}>{stat.value}</Typography>
                  <Typography variant="caption" sx={{ color: "#6B7280", fontWeight: 500 }}>{stat.label}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Portal welcome cards */}
        {!loading && !error && (
        <Paper
          sx={{
            p: 2.5,
            mb: 3,
            borderRadius: "8px",
            border: "1px solid rgba(17, 24, 39, 0.08)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          <Box sx={{ display: "flex", alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between", gap: 1.5, mb: 2, flexDirection: { xs: "column", sm: "row" } }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, color: "#111827", fontSize: "1rem" }}>
                Welcome Cards
              </Typography>
              <Typography variant="body2" sx={{ color: "#6B7280", fontSize: "0.82rem" }}>
                Cards shown in the portal welcome animation.
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleCreatePortalCard}
              sx={{ borderRadius: "8px", textTransform: "none", backgroundColor: "#0078D4", whiteSpace: "nowrap" }}
            >
              Add Card
            </Button>
          </Box>

          <TextField
            placeholder="Search cards..."
            value={portalCardSearch}
            onChange={(e) => setPortalCardSearch(e.target.value)}
            size="small"
            sx={{
              mb: 2,
              width: { xs: "100%", md: 360 },
              "& .MuiOutlinedInput-root": { borderRadius: "8px", backgroundColor: "#F8F9FC" },
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

          {portalCards.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4, border: "1px dashed #D1D5DB", borderRadius: "8px", backgroundColor: "#FAFBFC" }}>
              <Typography variant="body2" sx={{ color: "#6B7280", fontWeight: 600, mb: 1 }}>
                No portal cards yet.
              </Typography>
              <Button variant="outlined" startIcon={<Add />} onClick={handleCreatePortalCard} sx={{ borderRadius: "8px", textTransform: "none" }}>
                Add First Card
              </Button>
            </Box>
          ) : filteredPortalCards.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <SearchIcon sx={{ color: "#D1D5DB", fontSize: 40, mb: 1 }} />
              <Typography variant="body2" sx={{ color: "#6B7280", fontWeight: 600 }}>
                No cards match your search.
              </Typography>
            </Box>
          ) : (
            <Grid container spacing={2}>
              {filteredPortalCards.map((card) => (
                <Grid size={{ xs: 12, md: 4 }} key={card.id}>
                  <Card sx={{ height: "100%", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
                    <Box
                      sx={{
                        height: 130,
                        background: card.imageUrl
                          ? `linear-gradient(180deg, rgba(17,24,39,0.04), rgba(17,24,39,0.26)), url("${card.imageUrl}") center/cover`
                          : cardGradient(card),
                      }}
                    />
                    <CardContent sx={{ p: 2 }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mb: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>
                          {card.title}
                        </Typography>
                        <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {card.isSystemDefault && (
                            <Chip
                              label="System Default"
                              size="small"
                              sx={{
                                borderRadius: "8px",
                                fontSize: "0.68rem",
                                fontWeight: 800,
                                backgroundColor: "#EEF2FF",
                                color: "#4F46E5",
                              }}
                            />
                          )}
                          <Chip
                            label={card.status}
                            size="small"
                            sx={{
                              borderRadius: "8px",
                              fontSize: "0.68rem",
                              fontWeight: 700,
                              backgroundColor: card.status === "Active" ? "#E6F4EA" : "#F3F4F6",
                              color: card.status === "Active" ? "#2E7D32" : "#6B7280",
                            }}
                          />
                        </Stack>
                      </Box>
                      <Typography variant="body2" sx={{ color: "#6B7280", fontSize: "0.82rem", minHeight: 44, mb: 1.25 }}>
                        {card.description || "No description"}
                      </Typography>
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                        <Typography variant="caption" sx={{ color: "#9CA3AF", fontWeight: 700 }}>
                          Order {card.sortOrder}
                        </Typography>
                        <Box sx={{ display: "flex", gap: 0.5 }}>
                          <IconButton size="small" onClick={() => handleEditPortalCard(card)} sx={{ color: "#6B7280" }}>
                            <Edit sx={{ fontSize: 18 }} />
                          </IconButton>
                          {!card.isSystemDefault && (
                            <IconButton
                              size="small"
                              disabled={deletingPortalCardId === card.id}
                              onClick={() => setDeleteConfirmPortalCard(card)}
                              sx={{ color: deletingPortalCardId === card.id ? "#9CA3AF" : "#DC2626" }}
                            >
                              {deletingPortalCardId === card.id ? (
                                <CircularProgress size={18} sx={{ color: "#DC2626" }} />
                              ) : (
                                <Delete sx={{ fontSize: 18 }} />
                              )}
                            </IconButton>
                          )}
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Paper>
        )}

        {/* Loading */}
        {loading && (
          <TableContainer component={Paper} sx={{ borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: "#F9FAFB" }}>
                  {["Role", "Department", "Type", "Status", "Applicants", "Actions"].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", textTransform: "uppercase" }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {[1, 2, 3, 4].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton variant="text" width={140} /></TableCell>
                    <TableCell><Skeleton variant="rounded" width={80} height={24} sx={{ borderRadius: "8px" }} /></TableCell>
                    <TableCell><Skeleton variant="text" width={90} /></TableCell>
                    <TableCell><Skeleton variant="text" width={70} /></TableCell>
                    <TableCell><Skeleton variant="rounded" width={60} height={24} sx={{ borderRadius: "8px" }} /></TableCell>
                    <TableCell><Skeleton variant="text" width={30} /></TableCell>
                    <TableCell><Skeleton variant="text" width={60} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Error */}
        {!loading && error && <Alert severity="error" sx={{ borderRadius: "8px", mb: 3, fontWeight: 500, backgroundColor: "#FEF2F2", color: "#991B1B", "& .MuiAlert-icon": { color: "#DC2626" } }} action={<Button size="small" onClick={load} sx={{ textTransform: "none" }}>Retry</Button>}>{error}</Alert>}

        {/* Empty */}
        {!loading && !error && jobs.length === 0 && (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Work sx={{ fontSize: 48, color: "#D1D5DB", mb: 2 }} />
            <Typography variant="h6" sx={{ color: "#6B7280", fontWeight: 600 }}>No Opportunities</Typography>
            <Typography variant="body2" sx={{ color: "#9CA3AF", mb: 2 }}>Create the first internal advancement opening.</Typography>
            <Button variant="contained" startIcon={<Add />} onClick={handleCreate} sx={{ borderRadius: "8px", textTransform: "none", backgroundColor: "#0078D4" }}>Create Opening</Button>
          </Box>
        )}
        {!loading && !error && jobs.length > 0 && filteredJobs.length === 0 && (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <SearchIcon sx={{ fontSize: 48, color: "#D1D5DB", mb: 2 }} />
            <Typography variant="h6" sx={{ color: "#6B7280", fontWeight: 600 }}>No Results Match</Typography>
            <Typography variant="body2" sx={{ color: "#9CA3AF" }}>Try adjusting your search or filters.</Typography>
          </Box>
        )}

        {/* Table */}
        {!loading && !error && filteredJobs.length > 0 && (
          <TableContainer component={Paper} sx={{ borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflowX: "auto" }}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: "#F9FAFB" }}>
                  {["Role", "Department", "Type", "Status", "Applicants", "Actions"].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", textTransform: "uppercase" }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedJobs.map((job) => (
                  <TableRow key={job.id} hover sx={{ "&:hover": { backgroundColor: "#FAFBFC" } }}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: "#111827", fontSize: "0.85rem" }}>{job.title}</Typography>
                      {job.location && <Typography variant="caption" sx={{ color: "#9CA3AF" }}>{job.location}</Typography>}
                    </TableCell>
                    <TableCell><Chip label={job.department} size="small" sx={{ borderRadius: "8px", fontSize: "0.7rem", backgroundColor: "#6264A7", color: "#fff" }} /></TableCell>
                    <TableCell><Typography variant="body2" sx={{ color: "#374151", fontSize: "0.8rem" }}>{job.employmentType}</Typography></TableCell>
                    <TableCell>
                      <Chip label={job.status === "New" ? "Active" : "Closed"} size="small" sx={{ borderRadius: "8px", fontSize: "0.7rem", backgroundColor: job.status === "New" ? "#E6F4EA" : "#F3F4F6", color: job.status === "New" ? "#34A853" : "#6B7280", fontWeight: 600 }} />
                    </TableCell>
                    <TableCell><Typography variant="body2" sx={{ fontWeight: 600, color: "#0078D4", fontSize: "0.85rem" }}>{job.applicationCount}</Typography></TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        <IconButton size="small" onClick={() => handleEdit(job)} sx={{ color: "#6B7280" }}><Edit sx={{ fontSize: 18 }} /></IconButton>
                        {job.status === "New" && (
                          <IconButton
                            size="small"
                            disabled={closingJobId === job.id || !!closeConfirmJob}
                            onClick={() => setCloseConfirmJob(job)}
                            sx={{ color: closingJobId === job.id || closeConfirmJob?.id === job.id ? "#9CA3AF" : "#DC2626" }}
                          >
                            {closingJobId === job.id ? (
                              <CircularProgress size={18} sx={{ color: "#DC2626" }} />
                            ) : (
                              <Delete sx={{ fontSize: 18 }} />
                            )}
                          </IconButton>
                        )}
                        <IconButton
                          size="small"
                          disabled={deletingJobId === job.id}
                          onClick={() => setDeleteConfirmJob(job)}
                          sx={{ color: deletingJobId === job.id ? "#9CA3AF" : "#6B7280" }}
                        >
                          {deletingJobId === job.id ? (
                            <CircularProgress size={18} sx={{ color: "#DC2626" }} />
                          ) : (
                            <DeleteForever sx={{ fontSize: 18 }} />
                          )}
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              component="div"
              count={filteredJobs.length}
              page={page}
              onPageChange={(_, nextPage) => setPage(nextPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(Number.parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[25, 50, 100]}
            />
          </TableContainer>
        )}
      </Box>

      {/* Create/Edit Dialog */}
      <JobFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initial={editJob}
        departmentChoices={departmentChoices}
        employmentTypeChoices={employmentTypeChoices}
      />

      {portalCardDialogOpen && (
        <PortalCardDialog
          open
          onClose={() => {
            setPortalCardDialogOpen(false);
            setEditPortalCard(null);
          }}
          onSave={handleSavePortalCard}
          initial={editPortalCard}
          saving={savingPortalCard}
          jobs={jobs}
        />
      )}

      {/* Close Confirmation Dialog */}
      <Dialog open={!!closeConfirmJob} onClose={() => setCloseConfirmJob(null)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: "8px" } } }}>
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: "#111827" }}>
            Close opportunity?
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "#6B7280" }}>
            Are you sure you want to close <strong>{closeConfirmJob?.title}</strong>?
            This will stop new applications and mark the opening as closed.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            onClick={() => setCloseConfirmJob(null)}
            sx={{ borderRadius: "8px", textTransform: "none", color: "#6B7280" }}
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
            sx={{ borderRadius: "8px", textTransform: "none", backgroundColor: "#F59E0B", "&:hover": { backgroundColor: "#D97706" } }}
          >
            Close Opening
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
            sx={{ borderRadius: "8px", textTransform: "none", color: "#6B7280" }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!!deletingJobId}
            onClick={() => deleteConfirmJob && handleDeleteJob(deleteConfirmJob)}
            sx={{ borderRadius: "8px", textTransform: "none", backgroundColor: "#DC2626", "&:hover": { backgroundColor: "#B91C1C" } }}
          >
            {deletingJobId ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteConfirmPortalCard} onClose={() => !deletingPortalCardId && setDeleteConfirmPortalCard(null)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: "8px" } } }}>
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: "#111827" }}>
            Delete portal card?
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "#6B7280" }}>
            Are you sure you want to delete <strong>{deleteConfirmPortalCard?.title}</strong> from the welcome animation?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            onClick={() => setDeleteConfirmPortalCard(null)}
            disabled={!!deletingPortalCardId}
            sx={{ borderRadius: "8px", textTransform: "none", color: "#6B7280" }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!!deletingPortalCardId}
            onClick={() => deleteConfirmPortalCard && handleDeletePortalCard(deleteConfirmPortalCard)}
            sx={{ borderRadius: "8px", textTransform: "none", backgroundColor: "#DC2626", "&:hover": { backgroundColor: "#B91C1C" } }}
          >
            {deletingPortalCardId ? "Deleting..." : "Delete"}
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
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "0.9rem",
              boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
              color: "#111827",
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

/**
 * DirectoryPersonDialog.tsx — add or edit one person in the Approval Directory.
 *
 * Deliberately shows the resulting reporting line while it is being typed. The
 * consequence of "who approves this person" is invisible in a form field and
 * obvious in a chain, and seeing it before saving is what stops a wrong
 * approver being discovered one stuck submission at a time.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { editorial } from "../../theme/editorial";
import { traceApprovalChain } from "../../utils/approvalDirectoryHealth";
import {
  EMPTY_APPROVAL_DIRECTORY_INPUT,
  dependentsOf,
  validateApprovalDirectoryInput,
  type ApprovalDirectoryInput,
} from "../../utils/approvalDirectory";
import { isUnconfirmedRow } from "../../utils/directoryHarvestWrite";
import {
  directoryEmailKey,
  type ApprovalDirectoryRow,
  type DirectoryColumnMap,
} from "../../utils/approvalDirectorySchema";
import ChainTraceView from "./ChainTraceView";

interface DirectoryPersonDialogProps {
  open: boolean;
  /** The row being edited, or null when adding somebody new. */
  editing: ApprovalDirectoryRow | null;
  rows: ApprovalDirectoryRow[];
  /**
   * Which fields the list can actually hold. A field with no column is hidden
   * rather than shown and silently dropped on save. Null before the first read,
   * which shows everything.
   */
  columns: DirectoryColumnMap | null;
  /**
   * The names admin/org holds. Offered alongside the names already in use so
   * a department or company added there can be picked immediately, rather
   * than only appearing once somebody has been filed under it.
   */
  orgDepartments?: string[];
  orgCompanies?: string[];
  saving: boolean;
  onClose: () => void;
  /**
   * `confirm` is the admin's own tick, not an inference from having saved.
   * Correcting an address is one pass and agreeing the reporting line is
   * another, and a hundred guessed rows make running them together a good way
   * to declare the second pass done without having made it.
   */
  onSave: (input: ApprovalDirectoryInput, id?: number, confirm?: boolean) => void;
}

const HELP: Record<string, string> = {
  personEmail: "Their work email. This is what a submission is matched on, so it has to be exact.",
  approverEmail: "Who signs off this person's forms. Leave empty if nobody is above them.",
  department: "Used when a form routes to a whole department's head rather than to this person's own approver.",
  company: "Which company they belong to. Two companies can have a department of the same name, so this is what tells them apart.",
  position: "Their job title. A form set to 'Whoever holds a role' looks for the title you type here, such as HOD.",
  employeeId: "Their ID in whichever system HR keys off. Free text; nothing routes on it.",
};

/**
 * The org list first, then any name already in use that it does not cover.
 *
 * Kept rather than dropped: a person filed under a department that admin/org
 * no longer lists must not silently lose it just by having their row opened.
 */
function mergeChoices(used: string[], configured: string[]): string[] {
  const byKey = new Map<string, string>();
  const key = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  for (const value of [...configured, ...used]) {
    const label = (value || "").trim();
    if (label && !byKey.has(key(label))) byKey.set(key(label), label);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

export default function DirectoryPersonDialog({
  open,
  editing,
  rows,
  columns,
  orgDepartments = [],
  orgCompanies = [],
  saving,
  onClose,
  onSave,
}: DirectoryPersonDialogProps) {
  const [input, setInput] = useState<ApprovalDirectoryInput>(EMPTY_APPROVAL_DIRECTORY_INPUT);
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState(false);

  /** Whether this row is a form's guess that nobody has checked yet. */
  const needsReview = !!editing && isUnconfirmedRow(editing);

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setConfirm(false);
    setInput(editing
      ? {
        personEmail: editing.personEmail,
        personName: editing.personName,
        department: editing.department,
        company: editing.company,
        position: editing.position,
        employeeId: editing.employeeId,
        approverEmail: editing.approverEmail,
        isActive: editing.isActive,
      }
      : EMPTY_APPROVAL_DIRECTORY_INPUT);
  }, [open, editing]);

  const problems = useMemo(
    () => validateApprovalDirectoryInput(input, rows, editing?.id),
    [input, rows, editing],
  );

  /** Every address already known, so an approver can be picked not typed. */
  const knownPeople = useMemo(
    () => rows
      .filter((row) => row.personEmail && directoryEmailKey(row.personEmail) !== directoryEmailKey(input.personEmail))
      .map((row) => row.personEmail),
    [rows, input.personEmail],
  );

  const departments = useMemo(
    () => mergeChoices(rows.map((row) => row.department), orgDepartments),
    [rows, orgDepartments],
  );

  /**
   * Who would be left pointing at the old address, so the consequence is on
   * screen before the save rather than in a stuck submission afterwards.
   */
  const emailChanged = !!editing
    && directoryEmailKey(input.personEmail) !== directoryEmailKey(editing.personEmail);
  const dependents = useMemo(
    () => (emailChanged && editing ? dependentsOf(rows, editing.personEmail, editing.id) : []),
    [emailChanged, editing, rows],
  );

  const companies = useMemo(
    () => mergeChoices(rows.map((row) => row.company), orgCompanies),
    [rows, orgCompanies],
  );

  /**
   * The line as it would be after saving — the edited row substituted in, so
   * the preview reflects what is on screen rather than what is stored.
   */
  const preview = useMemo(() => {
    if (!input.personEmail.trim()) return null;
    // Shown as it would be stored, including whether routing may act on it —
    // an unreviewed row parks a submission rather than routing it, and the
    // preview would be a lie if it pretended otherwise.
    const pending: ApprovalDirectoryRow = {
      ...input,
      id: editing?.id,
      source: editing?.source ?? "manual",
      confirmed: !needsReview || confirm,
    };
    const merged = [
      pending,
      ...rows.filter((row) => directoryEmailKey(row.personEmail) !== directoryEmailKey(input.personEmail)),
    ];
    return traceApprovalChain(merged, input.personEmail);
  }, [input, rows, editing, needsReview, confirm]);

  /** Whether the list has somewhere to put this field at all. */
  const has = (key: keyof DirectoryColumnMap): boolean => !columns || !!columns[key];

  const field = (
    label: string,
    key: keyof ApprovalDirectoryInput,
    options?: { required?: boolean },
  ) => (
    <TextField
      label={label}
      required={options?.required}
      value={String(input[key])}
      onChange={(event) => setInput((prev) => ({ ...prev, [key]: event.target.value }))}
      helperText={HELP[key]}
      size="small"
      fullWidth
    />
  );

  const handleSave = () => {
    setTouched(true);
    if (problems.length > 0) return;
    onSave(input, editing?.id, confirm);
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, color: editorial.ink }}>
        {editing ? "Edit person" : "Add a person"}
      </DialogTitle>
      <DialogContent dividers>
        <Stack sx={{ gap: 2, pt: 0.5 }}>
          <TextField
            label="Person's email"
            required
            value={input.personEmail}
            onChange={(event) => setInput((prev) => ({ ...prev, personEmail: event.target.value }))}
            helperText={dependents.length > 0
              ? `${dependents.length} ${dependents.length === 1 ? "person reports" : "people report"} to the old address; they will be moved across with it.`
              : HELP.personEmail}
            size="small"
            fullWidth
          />
          {has("personName") && field("Full name", "personName")}

          {(has("department") || has("position")) && (
            <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2 }}>
              {has("department") && (
                <Autocomplete
                  freeSolo
                  options={departments}
                  value={input.department}
                  onInputChange={(_, value) => setInput((prev) => ({ ...prev, department: value }))}
                  fullWidth
                  renderInput={(params) => (
                    <TextField {...params} label="Department" size="small" helperText={HELP.department} />
                  )}
                />
              )}
              {has("position") && field("Position", "position")}
            </Stack>
          )}

          {has("company") && (
            <Autocomplete
              freeSolo
              options={companies}
              value={input.company}
              onInputChange={(_, value) => setInput((prev) => ({ ...prev, company: value }))}
              fullWidth
              renderInput={(params) => (
                <TextField {...params} label="Company" size="small" helperText={HELP.company} />
              )}
            />
          )}

          {has("employeeId") && field("Employee ID", "employeeId")}

          <Autocomplete
            freeSolo
            options={knownPeople}
            value={input.approverEmail}
            onInputChange={(_, value) => setInput((prev) => ({ ...prev, approverEmail: value }))}
            fullWidth
            renderInput={(params) => (
              <TextField {...params} label="Approved by" size="small" helperText={HELP.approverEmail} />
            )}
          />

          {has("isActive") && (
            <FormControlLabel
              control={(
                <Switch
                  checked={input.isActive}
                  onChange={(event) => setInput((prev) => ({ ...prev, isActive: event.target.checked }))}
                />
              )}
              label={(
                <Typography sx={{ fontSize: "0.845rem" }}>
                  {input.isActive
                    ? "Active — submissions can route to and from this person"
                    : "Switched off — kept for history, but nothing new routes here"}
                </Typography>
              )}
            />
          )}

          {needsReview && (
            <FormControlLabel
              control={<Checkbox checked={confirm} onChange={(event) => setConfirm(event.target.checked)} />}
              label={(
                <Typography sx={{ fontSize: "0.845rem" }}>
                  {confirm
                    ? "Reviewed — this row is correct, and submissions may route through it"
                    : "Still needs review — fixes are saved, but nothing routes here until it is confirmed"}
                </Typography>
              )}
            />
          )}

          {preview && (
            <Box sx={{ p: 1.5, borderRadius: "12px", border: `1px solid ${editorial.border}`, backgroundColor: editorial.paperSoft }}>
              <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: editorial.softMuted, mb: 1 }}>
                Where their forms would go
              </Typography>
              <ChainTraceView trace={preview} />
            </Box>
          )}

          {touched && problems.length > 0 && (
            <Alert severity="error">
              <Stack component="ul" sx={{ m: 0, pl: 2, gap: 0.5 }}>
                {problems.map((problem) => <li key={problem}>{problem}</li>)}
              </Stack>
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={saving}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          {saving ? "Saving..." : editing ? "Save changes" : "Add person"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

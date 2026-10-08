/**
 * SubmissionFilterPanel.tsx - the submission filter bar for the admin pages.
 *
 * Same model and same engine as the dashboard's `Toolbar`; only the skin
 * differs. The controls are the rounded system's own: a pill search, pill
 * selects with a soft fill, and chips for the on/off filters.
 *
 * One slim row holds the universal facets (they apply to every submission,
 * whatever form it came from). The form > version > questions chain lives
 * behind a "More filters" chip so the page stays one screen tall; it is drawn
 * left to right, and a step only appears once the step before it is chosen, so
 * there is never a greyed-out control to puzzle over.
 */
import { useState } from "react";
import {
  Box,
  Chip,
  InputAdornment,
  ListSubheader,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { CheckRounded, CloseRounded, ExpandLessRounded, ExpandMoreRounded, SearchRounded } from "@mui/icons-material";
import Card from "../common/Card";
import { editorial, si, siType } from "../../theme/editorial";
import {
  OPS_BY_KIND,
  groupFieldsBySection,
  opArity,
  opLabel,
  type FieldFilterOp,
  type FilterFieldKind,
  type FilterableField,
} from "../../utils/formFieldCatalog";
import {
  applyFormTypeChange,
  applyFormVersionChange,
  applyPublishProfileChange,
  createFieldFilter,
  describeFieldFilter,
  type FieldFilter,
  type FormTypeOption,
  type FormVersionOption,
  type SubmissionFilterState,
} from "../../utils/submissionFilters";
import { LIFECYCLE_STAGES, lifecycleLabel } from "../../utils/submissionLifecycle";

/** A MUI Select drawn as a soft-filled pill. Shared with the pages around it. */
export const pillSelectSx = {
  borderRadius: `${si.radiusPill}px`,
  backgroundColor: editorial.skySoft,
  ...siType.subtext,
  color: editorial.ink,
  minWidth: 0,
  "& .MuiOutlinedInput-notchedOutline": { border: "none" },
  "& .MuiSelect-select": { py: 0.9, pl: 2, minHeight: "unset" },
  "&:hover": { backgroundColor: editorial.blueWash },
} as const;

/** A TextField drawn as a soft-filled pill. */
export const pillFieldSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: `${si.radiusPill}px`,
    backgroundColor: editorial.skySoft,
    ...siType.subtext,
    color: editorial.ink,
  },
  "& .MuiOutlinedInput-notchedOutline": { border: "none" },
  "& .MuiOutlinedInput-input": { py: 0.9 },
} as const;

interface SubmissionFilterPanelProps {
  filters: SubmissionFilterState;
  setFilters: (filters: SubmissionFilterState) => void;
  /** Omit on a single-form page - there is nothing to scope. */
  formTypeOptions?: FormTypeOption[];
  publishProfileOptions?: string[];
  /** Versions of the form (and profile) in scope. */
  formVersionOptions?: FormVersionOption[];
  /** Questions of the form, profile and version in scope. */
  fieldCatalog: FilterableField[];
  /** Off where the page already has its own lifecycle tabs. */
  showStage?: boolean;
  /** True while this form's answers are still being fetched. */
  fieldDataLoading?: boolean;
  total: number;
  filtered: number;
}

function inputTypeFor(kind: FilterFieldKind): string {
  switch (kind) {
    case "date":
    case "datetime":
      return "date";
    case "time":
      return "time";
    case "number":
      return "number";
    default:
      return "text";
  }
}

export default function SubmissionFilterPanel({
  filters,
  setFilters,
  formTypeOptions,
  publishProfileOptions = [],
  formVersionOptions = [],
  fieldCatalog,
  showStage = true,
  fieldDataLoading = false,
  total,
  filtered,
}: SubmissionFilterPanelProps) {
  const patch = (next: Partial<SubmissionFilterState>) => setFilters({ ...filters, ...next });
  const fieldByKey = new Map(fieldCatalog.map((field) => [field.key, field]));
  const groups = groupFieldsBySection(fieldCatalog);

  // A page scoped to one form (the response viewer) has no form picker, so every
  // level below the form is immediately in scope.
  const formChosen = !formTypeOptions || !!filters.formType;
  // A single profile is not a choice, so that step is dropped.
  const showProfileStep = publishProfileOptions.length > 1;
  const [open, setOpen] = useState(false);

  const labelSx = { ...siType.subtext, color: editorial.softMuted, whiteSpace: "nowrap" } as const;
  const stepLabelSx = { ...siType.subtext, fontWeight: 600, color: editorial.muted } as const;
  const stepSx = { display: "flex", gap: 0.75, alignItems: "center", flex: "0 1 auto", minWidth: 0 } as const;

  const updateFieldFilter = (next: FieldFilter) => {
    patch({ fieldFilters: filters.fieldFilters.map((entry) => (entry.id === next.id ? next : entry)) });
  };
  const removeFieldFilter = (id: string) => {
    patch({ fieldFilters: filters.fieldFilters.filter((entry) => entry.id !== id) });
  };

  const valueEditor = (filter: FieldFilter) => {
    const arity = opArity(filter.op);
    if (arity === "none") return <Typography sx={{ ...labelSx, fontStyle: "italic" }}>no value needed</Typography>;

    const choices = fieldByKey.get(filter.key)?.choices ?? [];
    const inputType = inputTypeFor(filter.kind);

    if (arity === "many") {
      if (!choices.length) {
        return (
          <TextField
            size="small"
            placeholder="Value"
            value={filter.values[0] ?? ""}
            onChange={(e) => updateFieldFilter({ ...filter, values: e.target.value ? [e.target.value] : [] })}
            sx={{ ...pillFieldSx, flex: "1 1 160px" }}
            slotProps={{ htmlInput: { "aria-label": "Value" } }}
          />
        );
      }
      return (
        <Select
          multiple
          size="small"
          displayEmpty
          value={filter.values}
          onChange={(e) => {
            const next = e.target.value;
            updateFieldFilter({ ...filter, values: typeof next === "string" ? next.split(",") : next });
          }}
          renderValue={(selected) => {
            const labels = selected.map((value) => choices.find((choice) => choice.value === value)?.label ?? value);
            return labels.length ? labels.join(", ") : "Choose values";
          }}
          sx={{ ...pillSelectSx, flex: "1 1 180px" }}
          SelectDisplayProps={{ "aria-label": "Values" }}
        >
          {choices.map((choice) => (
            <MenuItem key={choice.value} value={choice.value}>
              {choice.label}
            </MenuItem>
          ))}
        </Select>
      );
    }

    if (arity === "two") {
      return (
        <Box sx={{ display: "flex", gap: 0.75, alignItems: "center", flex: "1 1 200px" }}>
          <TextField
            size="small"
            type={inputType}
            placeholder="From"
            value={filter.value}
            onChange={(e) => updateFieldFilter({ ...filter, value: e.target.value })}
            sx={{ ...pillFieldSx, flex: 1 }}
            slotProps={{ htmlInput: { "aria-label": "From" } }}
          />
          <Typography sx={labelSx}>to</Typography>
          <TextField
            size="small"
            type={inputType}
            placeholder="To"
            value={filter.value2}
            onChange={(e) => updateFieldFilter({ ...filter, value2: e.target.value })}
            sx={{ ...pillFieldSx, flex: 1 }}
            slotProps={{ htmlInput: { "aria-label": "To" } }}
          />
        </Box>
      );
    }

    return (
      <TextField
        size="small"
        type={inputType}
        placeholder="Value"
        value={filter.value}
        onChange={(e) => updateFieldFilter({ ...filter, value: e.target.value })}
        sx={{ ...pillFieldSx, flex: "1 1 160px" }}
        slotProps={{ htmlInput: { "aria-label": "Value" } }}
      />
    );
  };

  const activeChips: { key: string; label: string; onClear: () => void }[] = [];
  if (filters.formType && formTypeOptions) {
    activeChips.push({
      key: "formType",
      label: `Form: ${filters.formType}`,
      onClear: () => setFilters(applyFormTypeChange(filters, "")),
    });
  }
  if (filters.publishProfile) {
    activeChips.push({
      key: "profile",
      label: `Profile: ${filters.publishProfile}`,
      onClear: () => setFilters(applyPublishProfileChange(filters, "")),
    });
  }
  if (filters.formVersion) {
    activeChips.push({
      key: "version",
      label: `Version: ${filters.formVersion}`,
      onClear: () => setFilters(applyFormVersionChange(filters, "")),
    });
  }
  if (filters.submitter) {
    activeChips.push({ key: "submitter", label: `Submitter: ${filters.submitter}`, onClear: () => patch({ submitter: "" }) });
  }
  if (filters.dateFrom || filters.dateTo) {
    activeChips.push({
      key: "dates",
      label: `Submitted ${filters.dateFrom || "…"} – ${filters.dateTo || "…"}`,
      onClear: () => patch({ dateFrom: "", dateTo: "" }),
    });
  }
  for (const fieldFilter of filters.fieldFilters) {
    activeChips.push({
      key: fieldFilter.id,
      label: describeFieldFilter(fieldFilter, fieldByKey.get(fieldFilter.key)),
      onClear: () => removeFieldFilter(fieldFilter.id),
    });
  }

  // Everything inside the "More filters" drawer, counted so a closed drawer still
  // says it is doing something.
  const scopeCount =
    (formTypeOptions && filters.formType ? 1 : 0) +
    (filters.publishProfile ? 1 : 0) +
    (filters.formVersion ? 1 : 0) +
    filters.fieldFilters.length;
  const hasScopeStep = !!formTypeOptions || showProfileStep || formVersionOptions.length > 0 || fieldCatalog.length > 0;
  const arrow = (
    <Box component="span" aria-hidden sx={{ color: editorial.softMuted, fontSize: 14 }}>
      ›
    </Box>
  );
  const fieldPickerReady = fieldCatalog.length > 0 && !fieldDataLoading;

  return (
    <Card pad="tight" sx={{ mb: 2, display: "flex", flexDirection: "column", gap: 1.25 }}>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          size="small"
          placeholder="Search reference no, form or ID"
          value={filters.search}
          onChange={(e) => patch({ search: e.target.value })}
          sx={{ ...pillFieldSx, flex: "2 1 220px" }}
          slotProps={{
            htmlInput: { "aria-label": "Search submissions" },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRounded fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />

        {showStage && (
          <Select
            size="small"
            value={filters.stage}
            onChange={(e) => patch({ stage: e.target.value })}
            sx={{ ...pillSelectSx, flex: "0 0 auto" }}
            SelectDisplayProps={{ "aria-label": "Status" }}
          >
            <MenuItem value="all">All statuses</MenuItem>
            {LIFECYCLE_STAGES.map((stage) => (
              <MenuItem key={stage} value={stage}>
                {lifecycleLabel(stage)}
              </MenuItem>
            ))}
          </Select>
        )}

        <TextField
          size="small"
          placeholder="Submitter email"
          value={filters.submitter}
          onChange={(e) => patch({ submitter: e.target.value })}
          sx={{ ...pillFieldSx, flex: "1 1 180px" }}
          slotProps={{ htmlInput: { "aria-label": "Filter by submitter email" } }}
        />

        <Box sx={{ display: "flex", gap: 0.75, alignItems: "center", flex: "0 0 auto" }}>
          <Typography sx={labelSx}>From</Typography>
          <TextField
            size="small"
            type="date"
            value={filters.dateFrom}
            onChange={(e) => patch({ dateFrom: e.target.value })}
            sx={pillFieldSx}
            slotProps={{ htmlInput: { "aria-label": "Submitted from" } }}
          />
          <Typography sx={labelSx}>to</Typography>
          <TextField
            size="small"
            type="date"
            value={filters.dateTo}
            onChange={(e) => patch({ dateTo: e.target.value })}
            sx={pillFieldSx}
            slotProps={{ htmlInput: { "aria-label": "Submitted to" } }}
          />
        </Box>

        {/* Universal, not part of the form > version chain: a test run belongs
            to no particular form and stays hidden until asked for. */}
        <Chip
          clickable
          label="Show test runs"
          icon={filters.includeTestRuns ? <CheckRounded /> : undefined}
          onClick={() => patch({ includeTestRuns: !filters.includeTestRuns })}
          aria-pressed={filters.includeTestRuns}
          sx={{
            flex: "0 0 auto",
            backgroundColor: filters.includeTestRuns ? editorial.sky : editorial.skySoft,
            color: filters.includeTestRuns ? editorial.navyDeep : editorial.muted,
            fontWeight: 600,
          }}
        />

        {hasScopeStep && (
          <Chip
            clickable
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            icon={open ? <ExpandLessRounded /> : <ExpandMoreRounded />}
            label={scopeCount > 0 ? `More filters · ${scopeCount}` : "More filters"}
            sx={{
              flex: "0 0 auto",
              fontWeight: 600,
              backgroundColor: open || scopeCount ? editorial.sky : editorial.skySoft,
              color: open || scopeCount ? editorial.navyDeep : editorial.muted,
            }}
          />
        )}
      </Box>

      {/* The scope chain, left to right: each step narrows what the next can offer. */}
      {open && hasScopeStep && (
        <Box sx={{ pt: 1.25, display: "flex", flexDirection: "column", gap: 1 }}>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            {formTypeOptions && (
              <Box sx={stepSx}>
                <Typography sx={stepLabelSx}>Form</Typography>
                <Select
                  size="small"
                  displayEmpty
                  value={filters.formType}
                  onChange={(e) => setFilters(applyFormTypeChange(filters, e.target.value))}
                  sx={{ ...pillSelectSx, minWidth: 160, maxWidth: 260 }}
                  SelectDisplayProps={{ "aria-label": "Form" }}
                >
                  <MenuItem value="">All forms</MenuItem>
                  {formTypeOptions.map((option) => (
                    <MenuItem key={option.title} value={option.title}>
                      {option.title}
                      {option.count > 0 ? ` (${option.count})` : ""}
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            )}

            {!formChosen && (
              <Typography sx={{ ...siType.subtext, color: editorial.softMuted }}>
                Pick a form to narrow by profile, version or its own questions.
              </Typography>
            )}

            {formChosen && showProfileStep && (
              <>
                {formTypeOptions && arrow}
                <Box sx={stepSx}>
                  <Typography sx={stepLabelSx}>Profile</Typography>
                  <Select
                    size="small"
                    displayEmpty
                    value={filters.publishProfile}
                    onChange={(e) => setFilters(applyPublishProfileChange(filters, e.target.value))}
                    sx={{ ...pillSelectSx, minWidth: 130, maxWidth: 220 }}
                    SelectDisplayProps={{ "aria-label": "Profile" }}
                    title="The published profile a submission was sent under"
                  >
                    <MenuItem value="">All profiles</MenuItem>
                    {publishProfileOptions.map((profile) => (
                      <MenuItem key={profile} value={profile}>
                        {profile}
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
              </>
            )}

            {formChosen && formVersionOptions.length > 0 && (
              <>
                {(formTypeOptions || showProfileStep) && arrow}
                <Box sx={stepSx}>
                  <Typography sx={stepLabelSx}>Version</Typography>
                  <Select
                    size="small"
                    displayEmpty
                    value={filters.formVersion}
                    onChange={(e) => setFilters(applyFormVersionChange(filters, e.target.value))}
                    sx={{ ...pillSelectSx, minWidth: 120, maxWidth: 200 }}
                    SelectDisplayProps={{ "aria-label": "Version" }}
                    title="Conditions cover the questions the chosen version asked."
                  >
                    <MenuItem value="">All versions</MenuItem>
                    {formVersionOptions.map((option) => (
                      <MenuItem key={option.version} value={option.version}>
                        v{option.version}
                        {option.count > 0 ? ` (${option.count})` : ""}
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
              </>
            )}

            {formChosen && (
              <>
                {(formTypeOptions || showProfileStep || formVersionOptions.length > 0) && arrow}
                <Select
                  size="small"
                  displayEmpty
                  value=""
                  disabled={!fieldPickerReady}
                  onChange={(e) => {
                    const field = fieldByKey.get(e.target.value);
                    if (field) patch({ fieldFilters: [...filters.fieldFilters, createFieldFilter(field)] });
                  }}
                  renderValue={() =>
                    fieldDataLoading
                      ? "Loading this form's answers…"
                      : fieldCatalog.length
                        ? "Add a condition on a question"
                        : "No filterable questions found"
                  }
                  sx={{ ...pillSelectSx, color: fieldPickerReady ? editorial.navy : editorial.softMuted, fontWeight: 600 }}
                  SelectDisplayProps={{ "aria-label": "Add a condition on a question" }}
                >
                  {groups.flatMap((group) => [
                    <ListSubheader key={`h-${group.section}`}>{group.section}</ListSubheader>,
                    ...group.fields.map((field) => (
                      <MenuItem key={field.key} value={field.key}>
                        {field.label}
                      </MenuItem>
                    )),
                  ])}
                </Select>
              </>
            )}
          </Box>

          {formChosen &&
            filters.fieldFilters.map((fieldFilter) => (
              <Box
                key={fieldFilter.id}
                sx={{
                  display: "flex",
                  gap: 1,
                  alignItems: "center",
                  flexWrap: "wrap",
                  backgroundColor: editorial.blueSoft,
                  borderRadius: `${si.radiusSm}px`,
                  p: 1,
                }}
              >
                <Typography
                  sx={{
                    ...siType.subtext,
                    fontWeight: 700,
                    color: editorial.ink,
                    flex: "0 1 160px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={fieldByKey.get(fieldFilter.key)?.label ?? fieldFilter.key}
                >
                  {fieldByKey.get(fieldFilter.key)?.label ?? fieldFilter.key}
                </Typography>

                <Select
                  size="small"
                  value={fieldFilter.op}
                  onChange={(e) =>
                    updateFieldFilter({
                      ...fieldFilter,
                      op: e.target.value as FieldFilterOp,
                      value: "",
                      value2: "",
                      values: [],
                    })
                  }
                  sx={{ ...pillSelectSx, backgroundColor: editorial.panel, flex: "0 0 auto" }}
                  SelectDisplayProps={{ "aria-label": "Condition" }}
                >
                  {(OPS_BY_KIND[fieldFilter.kind] ?? OPS_BY_KIND.text).map((op) => (
                    <MenuItem key={op} value={op}>
                      {opLabel(op)}
                    </MenuItem>
                  ))}
                </Select>

                {valueEditor(fieldFilter)}

                <Chip
                  clickable
                  size="small"
                  label="Remove"
                  icon={<CloseRounded />}
                  onClick={() => removeFieldFilter(fieldFilter.id)}
                  aria-label="Remove condition"
                  sx={{ ml: "auto", backgroundColor: editorial.panel, color: editorial.muted }}
                />
              </Box>
            ))}
        </Box>
      )}

      {activeChips.length > 0 && (
        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "center" }}>
          <Typography sx={{ ...labelSx, fontVariantNumeric: "tabular-nums" }}>
            Showing {filtered} of {total}
          </Typography>
          {activeChips.map((chip) => (
            <Chip
              key={chip.key}
              size="small"
              label={chip.label}
              onDelete={chip.onClear}
              title="Remove this filter"
              sx={{ maxWidth: 280, backgroundColor: editorial.sky, color: editorial.navyDeep, fontWeight: 600 }}
            />
          ))}
        </Box>
      )}
    </Card>
  );
}

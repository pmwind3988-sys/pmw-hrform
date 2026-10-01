/**
 * SubmissionFilterPanel.tsx — the builder workspace's submission filter bar.
 *
 * Same model and same engine as the dashboard's `Toolbar`; only the skin differs,
 * because the builder pages are styled with their own inline `C` palette rather
 * than MUI. Each page passes the handful of tokens it uses, so the panel inherits
 * that page's look instead of importing a second one.
 *
 * One slim row holds the universal facets (they apply to every submission,
 * whatever form it came from). The form → profile → version → questions chain
 * lives behind a "More filters" button so the page stays one screen tall; it is
 * drawn left to right, and a step only appears once the step before it is
 * chosen, so there is never a greyed-out control to puzzle over.
 */
import { useState, type CSSProperties } from "react";
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

export interface FilterPanelPalette {
  border: string;
  cardBg: string;
  panelBg: string;
  textPrimary: string;
  textSecond: string;
  textMuted: string;
  accent: string;
  accentPale: string;
}

interface SubmissionFilterPanelProps {
  filters: SubmissionFilterState;
  setFilters: (filters: SubmissionFilterState) => void;
  /** Omit on a single-form page — there is nothing to scope. */
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
  palette: FilterPanelPalette;
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
  palette,
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

  const controlStyle: CSSProperties = {
    padding: "7px 10px",
    borderRadius: 8,
    border: `1px solid ${palette.border}`,
    fontSize: 12.5,
    color: palette.textPrimary,
    outline: "none",
    background: palette.cardBg,
    minWidth: 0,
  };
  const disabledControlStyle: CSSProperties = {
    ...controlStyle,
    color: palette.textMuted,
    background: palette.panelBg,
    cursor: "not-allowed",
  };
  const labelStyle: CSSProperties = { fontSize: 12.5, color: palette.textMuted, whiteSpace: "nowrap" };
  const stepLabelStyle: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: palette.textSecond };
  const stepStyle: CSSProperties = { display: "flex", gap: 6, alignItems: "center", flex: "0 1 auto", minWidth: 0 };

  const updateFieldFilter = (next: FieldFilter) => {
    patch({ fieldFilters: filters.fieldFilters.map((entry) => (entry.id === next.id ? next : entry)) });
  };
  const removeFieldFilter = (id: string) => {
    patch({ fieldFilters: filters.fieldFilters.filter((entry) => entry.id !== id) });
  };

  const valueEditor = (filter: FieldFilter) => {
    const arity = opArity(filter.op);
    if (arity === "none") return <span style={{ ...labelStyle, fontStyle: "italic" }}>no value needed</span>;

    const choices = fieldByKey.get(filter.key)?.choices ?? [];
    const inputType = inputTypeFor(filter.kind);

    if (arity === "many") {
      if (!choices.length) {
        return (
          <input
            type="text"
            placeholder="Value"
            value={filter.values[0] ?? ""}
            onChange={(e) => updateFieldFilter({ ...filter, values: e.target.value ? [e.target.value] : [] })}
            style={{ ...controlStyle, flex: "1 1 160px" }}
          />
        );
      }
      return (
        <select
          multiple
          value={filter.values}
          onChange={(e) =>
            updateFieldFilter({
              ...filter,
              values: Array.from(e.target.selectedOptions, (option) => option.value),
            })
          }
          style={{ ...controlStyle, flex: "1 1 180px", minHeight: 64 }}
        >
          {choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      );
    }

    if (arity === "two") {
      return (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flex: "1 1 200px" }}>
          <input
            type={inputType}
            placeholder="From"
            value={filter.value}
            onChange={(e) => updateFieldFilter({ ...filter, value: e.target.value })}
            style={{ ...controlStyle, flex: 1 }}
          />
          <span style={labelStyle}>–</span>
          <input
            type={inputType}
            placeholder="To"
            value={filter.value2}
            onChange={(e) => updateFieldFilter({ ...filter, value2: e.target.value })}
            style={{ ...controlStyle, flex: 1 }}
          />
        </div>
      );
    }

    return (
      <input
        type={inputType}
        placeholder="Value"
        value={filter.value}
        onChange={(e) => updateFieldFilter({ ...filter, value: e.target.value })}
        style={{ ...controlStyle, flex: "1 1 160px" }}
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
    <span aria-hidden style={{ color: palette.textMuted, fontSize: 14 }}>
      ›
    </span>
  );
  const fieldPickerReady = fieldCatalog.length > 0 && !fieldDataLoading;

  return (
    <div
      style={{
        background: palette.panelBg,
        border: `1px solid ${palette.border}`,
        borderRadius: 12,
        padding: "10px 12px",
        marginBottom: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search reference no, form or ID..."
          value={filters.search}
          onChange={(e) => patch({ search: e.target.value })}
          style={{ ...controlStyle, flex: "2 1 220px" }}
        />

        {showStage && (
          <label style={{ display: "flex", gap: 6, alignItems: "center", flex: "0 0 auto" }}>
            <span style={labelStyle}>Status</span>
            <select value={filters.stage} onChange={(e) => patch({ stage: e.target.value })} style={controlStyle}>
              <option value="all">All statuses</option>
              {LIFECYCLE_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {lifecycleLabel(stage)}
                </option>
              ))}
            </select>
          </label>
        )}

        <input
          type="text"
          placeholder="Filter by submitter email..."
          value={filters.submitter}
          onChange={(e) => patch({ submitter: e.target.value })}
          style={{ ...controlStyle, flex: "1 1 180px" }}
        />

        <div style={{ display: "flex", gap: 6, alignItems: "center", flex: "0 0 auto" }}>
          <span style={labelStyle}>From</span>
          <input type="date" value={filters.dateFrom} onChange={(e) => patch({ dateFrom: e.target.value })} style={controlStyle} />
          <span style={labelStyle}>To</span>
          <input type="date" value={filters.dateTo} onChange={(e) => patch({ dateTo: e.target.value })} style={controlStyle} />
        </div>

        {/* Universal, not part of the form → profile → version chain: a test run
            belongs to no particular form and stays hidden until asked for. */}
        <label style={{ display: "flex", gap: 6, alignItems: "center", flex: "0 0 auto", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={filters.includeTestRuns}
            onChange={(e) => patch({ includeTestRuns: e.target.checked })}
          />
          <span style={labelStyle}>Show test runs</span>
        </label>

        {hasScopeStep && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            style={{
              ...controlStyle,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              flex: "0 0 auto",
              fontWeight: 600,
              cursor: "pointer",
              color: open || scopeCount ? palette.accent : palette.textSecond,
              background: open ? palette.accentPale : palette.cardBg,
            }}
          >
            More filters
            {scopeCount > 0 && (
              <span
                style={{
                  background: palette.accent,
                  color: "#fff",
                  borderRadius: 999,
                  minWidth: 18,
                  padding: "0 5px",
                  fontSize: 11,
                  lineHeight: "18px",
                  textAlign: "center",
                }}
              >
                {scopeCount}
              </span>
            )}
            <span aria-hidden style={{ fontSize: 10 }}>
              {open ? "▲" : "▼"}
            </span>
          </button>
        )}
      </div>

      {/* The scope chain, left to right: each step narrows what the next can offer. */}
      {open && hasScopeStep && (
        <div
          style={{
            borderTop: `1px dashed ${palette.border}`,
            paddingTop: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {formTypeOptions && (
              <label style={stepStyle}>
                <span style={stepLabelStyle}>Form</span>
                <select
                  value={filters.formType}
                  onChange={(e) => setFilters(applyFormTypeChange(filters, e.target.value))}
                  style={{ ...controlStyle, minWidth: 160, maxWidth: 260 }}
                >
                  <option value="">All forms</option>
                  {formTypeOptions.map((option) => (
                    <option key={option.title} value={option.title}>
                      {option.title}
                      {option.count > 0 ? ` (${option.count})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {!formChosen && (
              <span style={{ fontSize: 12, color: palette.textMuted }}>
                Pick a form to narrow by profile, version or its own questions.
              </span>
            )}

            {formChosen && showProfileStep && (
              <>
                {formTypeOptions && arrow}
                <label style={stepStyle}>
                  <span style={stepLabelStyle}>Profile</span>
                  <select
                    value={filters.publishProfile}
                    onChange={(e) => setFilters(applyPublishProfileChange(filters, e.target.value))}
                    style={{ ...controlStyle, minWidth: 130, maxWidth: 220 }}
                    title="The published profile a submission was sent under"
                  >
                    <option value="">All profiles</option>
                    {publishProfileOptions.map((profile) => (
                      <option key={profile} value={profile}>
                        {profile}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            {formChosen && formVersionOptions.length > 0 && (
              <>
                {(formTypeOptions || showProfileStep) && arrow}
                <label style={stepStyle}>
                  <span style={stepLabelStyle}>Version</span>
                  <select
                    value={filters.formVersion}
                    onChange={(e) => setFilters(applyFormVersionChange(filters, e.target.value))}
                    style={{ ...controlStyle, minWidth: 120, maxWidth: 200 }}
                    title="Conditions cover the questions the chosen version asked."
                  >
                    <option value="">All versions</option>
                    {formVersionOptions.map((option) => (
                      <option key={option.version} value={option.version}>
                        v{option.version}
                        {option.count > 0 ? ` (${option.count})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            {formChosen && (
              <>
                {(formTypeOptions || showProfileStep || formVersionOptions.length > 0) && arrow}
                <select
                  value=""
                  aria-label="Add a condition on a field"
                  disabled={!fieldPickerReady}
                  onChange={(e) => {
                    const field = fieldByKey.get(e.target.value);
                    if (field) patch({ fieldFilters: [...filters.fieldFilters, createFieldFilter(field)] });
                  }}
                  style={{
                    ...(fieldPickerReady ? controlStyle : disabledControlStyle),
                    borderStyle: "dashed",
                    color: fieldPickerReady ? palette.accent : palette.textMuted,
                    fontWeight: 600,
                    cursor: fieldPickerReady ? "pointer" : "not-allowed",
                  }}
                >
                  <option value="">
                    {fieldDataLoading
                      ? "Loading this form's answers…"
                      : fieldCatalog.length
                        ? "+ Add a condition on a field"
                        : "No filterable questions found"}
                  </option>
                  {groups.map((group) => (
                    <optgroup key={group.section} label={group.section}>
                      {group.fields.map((field) => (
                        <option key={field.key} value={field.key}>
                          {field.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </>
            )}
          </div>

          {formChosen &&
            filters.fieldFilters.map((fieldFilter) => (
              <div
                key={fieldFilter.id}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                  background: palette.cardBg,
                  border: `1px solid ${palette.border}`,
                  borderRadius: 8,
                  padding: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: palette.textPrimary,
                    flex: "0 1 160px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={fieldByKey.get(fieldFilter.key)?.label ?? fieldFilter.key}
                >
                  {fieldByKey.get(fieldFilter.key)?.label ?? fieldFilter.key}
                </span>

                <select
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
                  style={{ ...controlStyle, flex: "0 0 auto" }}
                >
                  {(OPS_BY_KIND[fieldFilter.kind] ?? OPS_BY_KIND.text).map((op) => (
                    <option key={op} value={op}>
                      {opLabel(op)}
                    </option>
                  ))}
                </select>

                {valueEditor(fieldFilter)}

                <button
                  type="button"
                  onClick={() => removeFieldFilter(fieldFilter.id)}
                  title="Remove condition"
                  style={{
                    marginLeft: "auto",
                    border: `1px solid ${palette.border}`,
                    background: "transparent",
                    color: palette.textMuted,
                    borderRadius: 8,
                    padding: "4px 9px",
                    fontSize: 12.5,
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
        </div>
      )}

      {activeChips.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ ...labelStyle, fontVariantNumeric: "tabular-nums" }}>
            Showing {filtered} of {total}
          </span>
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onClear}
              title="Remove this filter"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                maxWidth: 280,
                background: palette.accentPale,
                border: `1px solid ${palette.border}`,
                borderRadius: 999,
                padding: "2px 9px",
                fontSize: 12,
                fontWeight: 600,
                color: palette.textPrimary,
                cursor: "pointer",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chip.label}</span>
              <span style={{ color: palette.textMuted }}>✕</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * SubmissionFilterPanel.tsx — the builder workspace's submission filter bar.
 *
 * Same model and same engine as the dashboard's `Toolbar`; only the skin differs,
 * because the builder pages are styled with their own inline `C` palette rather
 * than MUI. Each page passes the handful of tokens it uses, so the panel inherits
 * that page's look instead of importing a second one.
 *
 * Layout follows the same scope-then-refine order: form type first, then the
 * facets every submission has, then the chosen form type's own questions.
 */
import type { CSSProperties } from "react";
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
  createFieldFilter,
  describeFieldFilter,
  type FieldFilter,
  type FormTypeOption,
  type SubmissionFilterState,
} from "../../utils/submissionFilters";
import { applyFormTypeChange } from "../../utils/submissionFilters";
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
  /** Questions of the form type in scope. */
  fieldCatalog: FilterableField[];
  /** Off where the page already has its own lifecycle tabs. */
  showStage?: boolean;
  /** True while this form type's answers are still being fetched. */
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

  const controlStyle: CSSProperties = {
    padding: "7px 10px",
    borderRadius: 8,
    border: `1px solid ${palette.border}`,
    fontSize: 12,
    color: palette.textPrimary,
    outline: "none",
    background: palette.cardBg,
    minWidth: 0,
  };
  const labelStyle: CSSProperties = { fontSize: 12, color: palette.textMuted, whiteSpace: "nowrap" };
  const sectionLabelStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: palette.textMuted,
  };

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
  if (filters.publishProfile) {
    activeChips.push({
      key: "profile",
      label: `Profile: ${filters.publishProfile}`,
      onClear: () => patch({ publishProfile: "" }),
    });
  }
  for (const fieldFilter of filters.fieldFilters) {
    activeChips.push({
      key: fieldFilter.id,
      label: describeFieldFilter(fieldFilter, fieldByKey.get(fieldFilter.key)),
      onClear: () => removeFieldFilter(fieldFilter.id),
    });
  }

  return (
    <div
      style={{
        background: palette.panelBg,
        border: `1px solid ${palette.border}`,
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search reference no, form or ID..."
          value={filters.search}
          onChange={(e) => patch({ search: e.target.value })}
          style={{ ...controlStyle, flex: "1 1 220px", fontSize: 13, padding: "8px 12px" }}
        />

        {formTypeOptions && (
          <label style={{ display: "flex", gap: 6, alignItems: "center", flex: "0 0 auto" }}>
            <span style={labelStyle}>Form type</span>
            <select
              value={filters.formType}
              onChange={(e) => setFilters(applyFormTypeChange(filters, e.target.value))}
              style={{ ...controlStyle, maxWidth: 240 }}
            >
              <option value="">All form types</option>
              {formTypeOptions.map((option) => (
                <option key={option.title} value={option.title}>
                  {option.title}
                  {option.count > 0 ? ` (${option.count})` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

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
      </div>

      {/* Everything below belongs to the selected form type. */}
      <div style={{ borderTop: `1px dashed ${palette.border}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={sectionLabelStyle}>
            {formTypeOptions && !filters.formType ? "This form type's own fields" : "Fields in this form"}
          </span>

          {publishProfileOptions.length > 1 && (!formTypeOptions || filters.formType) && (
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={labelStyle} title="The published profile a submission was sent under">
                Profile
              </span>
              <select
                value={filters.publishProfile}
                onChange={(e) => patch({ publishProfile: e.target.value })}
                style={{ ...controlStyle, maxWidth: 200 }}
              >
                <option value="">All profiles</option>
                {publishProfileOptions.map((profile) => (
                  <option key={profile} value={profile}>
                    {profile}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {formTypeOptions && !filters.formType ? (
          <div style={{ fontSize: 12, color: palette.textSecond }}>
            Pick a form type to filter by its own questions — dates, titles, times, choices — and by the profile it
            was published under.
          </div>
        ) : (
          <>
            {filters.fieldFilters.map((fieldFilter) => (
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
                    fontSize: 12,
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
                    borderRadius: 6,
                    padding: "4px 9px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
            ))}

            {fieldDataLoading && (
              <div style={{ fontSize: 12, color: palette.textSecond }}>Loading this form's answers…</div>
            )}

            <select
              value=""
              disabled={!fieldCatalog.length || fieldDataLoading}
              onChange={(e) => {
                const field = fieldByKey.get(e.target.value);
                if (field) patch({ fieldFilters: [...filters.fieldFilters, createFieldFilter(field)] });
              }}
              style={{
                ...controlStyle,
                alignSelf: "flex-start",
                borderStyle: "dashed",
                color: palette.accent,
                fontWeight: 600,
                cursor: fieldCatalog.length ? "pointer" : "not-allowed",
              }}
            >
              <option value="">
                {fieldCatalog.length ? "+ Add field condition" : "No filterable questions found"}
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

      {activeChips.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: `1px solid ${palette.border}`, paddingTop: 10 }}>
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
                padding: "4px 10px",
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

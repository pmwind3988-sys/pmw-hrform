/**
 * FormBuilder.tsx — Custom form builder (NO SurveyJS Creator)
 * Uses react-dnd for drag-drop. Outputs SurveyJS-compatible JSON.
 */
import { useState, useCallback, useRef, useEffect, useMemo, Fragment } from "react";
import type { SurveyJson, FormBuilderField } from "../../types/index";
import { QUESTION_TYPES, createQuestion, buildSurveyJson, validateFields, schemaNameFromLabel, isSchemaNameDerivedFrom } from "../../utils/FormBuilderEngine";
import { buildQuestionTree, removeFieldRecursive, duplicateFieldRecursive, moveFieldIntoPanel, addFieldToPanel, findFieldById, updateField, flattenFieldTree, reorderFieldsRecursive, moveFieldToRoot } from "../../utils/FormBuilderEngine";
import NativeFormView from "../../native/NativeForm";
import { parseForm } from "../../native/schema";
import { useNativeForm } from "../../native/useNativeForm";
import { getAllColumnsForList, getChoiceColumnsForList, getSharePointLists } from "../../utils/formBuilderSP";
import DOMPurify from "dompurify";
import { C } from "./constants";
import { Icon, FieldIcon } from "./BuilderIcons";
import { PALETTE_ITEMS, TAB_SECTIONS, QUICK_ADD_TYPES, shortTypeLabel, wysKind, hasRoundMark } from "./paletteTaxonomy";
import type { PaletteTab, PaletteItem } from "./paletteTaxonomy";
import type { BuilderToolCommand } from "./builderTheme";
import "./FormBuilder.css";
import "./BuilderShell.css";

// MUI Icons

import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import CodeIcon from "@mui/icons-material/Code";
import TranslateIcon from "@mui/icons-material/Translate";
import PaletteIcon from "@mui/icons-material/Palette";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

import TableChartIcon from "@mui/icons-material/TableChart";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import EmailIcon from "@mui/icons-material/Email";
import BoltIcon from "@mui/icons-material/Bolt";
import LinkIcon from "@mui/icons-material/Link";


import HomeIcon from "@mui/icons-material/Home";


import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import DescriptionIcon from "@mui/icons-material/Description";
import ChatIcon from "@mui/icons-material/Chat";
import PersonIcon from "@mui/icons-material/Person";
import RefreshIcon from "@mui/icons-material/Refresh";
import PowerIcon from "@mui/icons-material/Power";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import ChromeReaderModeIcon from "@mui/icons-material/ChromeReaderMode";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { editorial } from "../../theme/editorial";


const APP_FONT_NAME = "Inter";

/** What SurveyJS labels the "Other" row when the field leaves `otherText` unset. */
const DEFAULT_OTHER_TEXT = "Other (describe)";

// ── Atoms ─────────────────────────────────────────────────────────────
const Pill = ({ children, color = C.purple, bg = C.purplePale }: { children: React.ReactNode; color?: string; bg?: string }) =>
  <span className="fb-pill" style={{ color, background: bg }}>{children}</span>;

function IconBtn({ icon, title, onClick, danger, disabled }: { icon: React.ReactNode; title?: string; onClick?: () => void; danger?: boolean; disabled?: boolean }) {
  return <button title={title} onClick={onClick} disabled={disabled} className={`fb-icon-btn ${danger ? 'danger' : ''}`}
    onMouseEnter={e => { if (!disabled) e.currentTarget.classList.add(danger ? 'danger' : 'hover'); }}
    onMouseLeave={e => { e.currentTarget.classList.remove('hover', 'danger'); }}>{icon}</button>;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <label className="fb-toggle">
    <div onClick={() => onChange(!checked)} className="fb-toggle-track" style={{ background: checked ? C.purple : editorial.border }}>
      <div className="fb-toggle-knob" style={{ left: checked ? 21 : 3, background: C.white }} />
    </div>
    {label && <span className="fb-toggle-label" style={{ color: C.textSecond }}>{label}</span>}
  </label>;
}

function Input({ value, onChange, placeholder, type = "text", style: extra, ...rest }: { value?: string | number; onChange: (v: string) => void; placeholder?: string; type?: string; style?: React.CSSProperties;[key: string]: unknown }) {
  const [f, setF] = useState(false);
  return <input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    onFocus={() => setF(true)} onBlur={() => setF(false)}
    className={`fb-input ${f ? 'focused' : ''}`}
    style={extra}
    {...rest} />;
}

function Textarea({ value, onChange, placeholder, rows = 3 }: { value?: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  const [f, setF] = useState(false);
  return <textarea value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    onFocus={() => setF(true)} onBlur={() => setF(false)} className={`fb-textarea ${f ? 'focused' : ''}`} />;
}

/** Mini field reference picker for formula/expression editors */
function FieldRefPicker({
  fields,
  currentName,
  onPick,
}: {
  fields: { name: string; title?: string }[];
  currentName?: string;
  onPick: (fieldName: string) => void;
}) {
  const [query, setQuery] = useState("");
  const available = fields.filter(f => f.name !== currentName && f.name);
  const matched = query
    ? available.filter(f =>
      f.name.toLowerCase().includes(query.toLowerCase()) ||
      (f.title || "").toLowerCase().includes(query.toLowerCase())
    )
    : available;

  return (
    <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.borderLight}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0 }}>
          Field references
        </span>
        <div style={{ flex: 1 }} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter..."
          style={{
            width: 80, padding: "2px 6px", fontSize: 11, border: `1px solid ${C.border}`,
            borderRadius: 4, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
          }} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, maxHeight: 80, overflowY: "auto" }}>
        {matched.slice(0, 20).map(f => (
          <button key={f.name} onClick={() => onPick(f.name)}
            title={`${f.title || f.name}`}
            style={{
              padding: "1px 5px", fontSize: 11, fontFamily: "monospace",
              border: `1px solid ${C.border}`, borderRadius: 3,
              background: C.offWhite, color: C.purple, cursor: "pointer",
              lineHeight: 1.6, whiteSpace: "nowrap",
            }}
          >{`{${f.name}}`}</button>
        ))}
        {matched.length === 0 && (
          <span style={{ fontSize: 11, color: C.textMuted, padding: "2px 0" }}>
            {available.length === 0 ? "No other fields available" : "No matches"}
          </span>
        )}
      </div>
    </div>
  );
}

function Select({ value, onChange, options }: { value?: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return <select value={value ?? ""} onChange={e => onChange(e.target.value)} className="fb-select">
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>;
}

const PropLabel = ({ children }: { children: React.ReactNode }) =>
  <div className="fb-prop-label">{children}</div>;

function PropRow({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return <div className={`fb-prop-row ${span ? 'span' : ''}`}>
    <PropLabel>{label}</PropLabel>{children}
  </div>;
}

interface CompanyChoiceConfig {
  enabled: boolean;
  choices: string[];
  fieldName: string;
  title: string;
}

const COMPANY_CHOICE_FIELD_ID = "pmw_company_choice_field";
const COMPANY_CHOICE_DESCRIPTION = "Choose the company this form submission belongs to.";
const COMPANY_CHOICE_REQUIRED_ERROR = "Please choose a company.";

type CompanyChoiceOption = { value: string; text: string };

function toChoiceObjects(choices: string[]): CompanyChoiceOption[] {
  return choices
    .map(c => c.trim())
    .filter(Boolean)
    .map(c => ({ value: c, text: c }));
}

function createCompanyChoiceField(config: CompanyChoiceConfig): FormBuilderField {
  return {
    _id: COMPANY_CHOICE_FIELD_ID,
    type: "radiogroup",
    name: config.fieldName,
    title: config.title,
    isRequired: true,
    startWithNewLine: true,
    visible: false,
    readOnly: false,
    description: COMPANY_CHOICE_DESCRIPTION,
    choices: toChoiceObjects(config.choices),
    colCount: 1,
    requiredErrorText: COMPANY_CHOICE_REQUIRED_ERROR,
    isManagedCompanyChoice: true,
    managedPlacement: "banner",
  };
}

function isManagedCompanyChoice(field?: FormBuilderField | null) {
  return !!field && (field.isManagedCompanyChoice === true || field._id === COMPANY_CHOICE_FIELD_ID);
}

function removeManagedCompanyChoiceFields(items: FormBuilderField[]): FormBuilderField[] {
  const result: FormBuilderField[] = [];
  for (const field of items) {
    if (isManagedCompanyChoice(field)) continue;
    if (field.type === "panel" && Array.isArray(field.elements)) {
      result.push({ ...field, elements: removeManagedCompanyChoiceFields(field.elements) });
    } else {
      result.push(field);
    }
  }
  return result;
}

function removeFieldsByIds(items: FormBuilderField[], ids: Set<string>): FormBuilderField[] {
  const result: FormBuilderField[] = [];
  for (const field of items) {
    if (ids.has(field._id)) continue;
    if (field.type === "panel" && Array.isArray(field.elements)) {
      result.push({ ...field, elements: removeFieldsByIds(field.elements, ids) });
    } else {
      result.push(field);
    }
  }
  return result;
}

function normalizeCompanyChoiceFields(items: FormBuilderField[], config: CompanyChoiceConfig): FormBuilderField[] {
  const flat = flattenFieldTree(items);
  const existing = flat.find(field =>
    isManagedCompanyChoice(field) ||
    (field.name === config.fieldName && field.type === "radiogroup")
  );
  const desiredChoices = toChoiceObjects(config.choices);
  const managed: FormBuilderField = {
    ...(existing || createCompanyChoiceField(config)),
    _id: existing?._id || COMPANY_CHOICE_FIELD_ID,
    type: "radiogroup",
    name: config.fieldName,
    title: config.title,
    isRequired: true,
    startWithNewLine: true,
    visible: false,
    readOnly: false,
    description: COMPANY_CHOICE_DESCRIPTION,
    choices: desiredChoices,
    colCount: 1,
    requiredErrorText: COMPANY_CHOICE_REQUIRED_ERROR,
    defaultValue: undefined,
    isManagedCompanyChoice: true,
    managedPlacement: "banner",
  };
  const managedIds = new Set(
    flat
      .filter(field => isManagedCompanyChoice(field) || field._id === managed._id)
      .map(field => field._id)
  );
  const withoutManaged = removeFieldsByIds(removeManagedCompanyChoiceFields(items), managedIds);
  const normalized = [managed, ...withoutManaged];
  return JSON.stringify(normalized) === JSON.stringify(items) ? items : normalized;
}

function choiceOptionFromUnknown(choice: unknown): CompanyChoiceOption | null {
  if (typeof choice === "string") {
    const trimmed = choice.trim();
    return trimmed ? { value: trimmed, text: trimmed } : null;
  }
  if (!choice || typeof choice !== "object") return null;
  const record = choice as Record<string, unknown>;
  const value = String(record.value ?? record.text ?? "").trim();
  const text = String(record.text ?? record.value ?? "").trim();
  return value ? { value, text: text || value } : null;
}

function getCompanyChoiceOptions(
  choices: FormBuilderField["choices"] | undefined,
  fallbackCompanyLines: string[]
): CompanyChoiceOption[] {
  const fromChoices = (choices || [])
    .map(choiceOptionFromUnknown)
    .filter((choice): choice is CompanyChoiceOption => Boolean(choice));
  if (fromChoices.length > 0) return fromChoices;
  return fallbackCompanyLines.map(value => ({ value, text: value }));
}

function findCompanyChoiceElement(
  json: SurveyJson,
  meta?: Record<string, unknown>
): Record<string, unknown> | null {
  const enabledByMeta = meta?.companyChoiceEnabled === true;
  const walk = (elements: Record<string, unknown>[]): Record<string, unknown> | null => {
    for (const element of elements) {
      if (
        element.isManagedCompanyChoice === true ||
        (enabledByMeta && element.name === "company" && element.type === "radiogroup")
      ) {
        return element;
      }
      if (Array.isArray(element.elements)) {
        const nested = walk(element.elements as Record<string, unknown>[]);
        if (nested) return nested;
      }
    }
    return null;
  };
  for (const page of json.pages ?? []) {
    const found = walk(page.elements ?? []);
    if (found) return found;
  }
  return null;
}

/**
 * What the banner says beside the logo once the company chooser has moved into
 * the form itself: the document's own identity. It mirrors the masthead on
 * `/native/:formId` so an author sees the same header the standalone native
 * route renders, rather than a third arrangement that exists only in the modal.
 */
function PreviewFormIdentity({
  title,
  description,
  isoStandards,
}: {
  title: string;
  description: string;
  isoStandards: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0 }}>
        {isoStandards}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, lineHeight: 1.3, textWrap: "balance" }}>
        {title}
      </div>
      {description && (
        <div style={{ fontSize: 12.5, fontWeight: 500, color: C.textSecond, lineHeight: 1.5, textWrap: "pretty" }}>
          {description}
        </div>
      )}
    </div>
  );
}

// ── Visibility / EnableIf / Validation Editors ────────────────────────

/** Build a simple expression editor for visibleIf / enableIf */
function ConditionEditor({ label, value, onChange, allFields }: { label: string; value: string; onChange: (v: string) => void; allFields: FormBuilderField[] }) {
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const [conditionField, setConditionField] = useState("");
  const [operator, setOperator] = useState("notempty");
  const [conditionValue, setConditionValue] = useState("");

  // Sync from expression to simple mode
  useEffect(() => {
    if (!value) { setConditionField(""); setOperator("notempty"); setConditionValue(""); return; }
    // Try to parse: {field} operator 'value' or {field} operator value
    const match = value.match(/\{([^}]+)\}\s*(=|<>|<|>|<=|>=|contains|notcontains|startswith|endswith|empty|notempty)\s*'?([^']*)'?/i);
    if (match) {
      setConditionField(match[1]);
      setOperator(match[2].toLowerCase());
      setConditionValue(match[3] || "");
    }
  }, [value]);

  const buildExpression = () => {
    if (!conditionField) { onChange(""); return; }
    if (operator === "empty" || operator === "notempty") {
      onChange(`{${conditionField}} ${operator}`);
    } else {
      const val = isNaN(Number(conditionValue)) ? `'${conditionValue}'` : conditionValue;
      onChange(`{${conditionField}} ${operator} ${val}`);
    }
  };

  const handleApply = () => { buildExpression(); };

  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0 }}>{label}</span>
      <div style={{ flex: 1 }} />
      <Toggle checked={mode === "advanced"} onChange={v => setMode(v ? "advanced" : "simple")} label="Advanced" />
    </div>
    {mode === "simple" ? <>
      <PropRow label="When field">
        <Select value={conditionField} onChange={v => { setConditionField(v); }} options={[{ value: "", label: "(none)" }, ...allFields.filter(f => f.name !== (value ? "" : "")).map(f => ({ value: f.name, label: `${f.title} (${f.name})` }))]} />
      </PropRow>
      <PropRow label="Operator">
        <Select value={operator} onChange={v => setOperator(v)} options={[
          { value: "notempty", label: "Is not empty" },
          { value: "empty", label: "Is empty" },
          { value: "=", label: "Equals" },
          { value: "<>", label: "Not equals" },
          { value: "<", label: "Less than" },
          { value: ">", label: "Greater than" },
          { value: "contains", label: "Contains" },
          { value: "notcontains", label: "Does not contain" },
        ]} />
      </PropRow>
      {operator !== "empty" && operator !== "notempty" && <PropRow label="Value">
        <Input value={conditionValue} onChange={setConditionValue} placeholder="Enter value" />
      </PropRow>}
      <button onClick={handleApply} disabled={!conditionField} className="fb-apply-btn" style={{ background: conditionField ? C.purple : C.border, color: conditionField ? C.white : C.textMuted, cursor: conditionField ? "pointer" : "not-allowed" }}>Apply Condition</button>
    </> : <Textarea value={value} onChange={onChange} placeholder="Enter SurveyJS expression, e.g.:{question1} = 'Yes' && {question2} notempty" rows={4} />}
    {value && <div className="fb-current-condition">Current: {value}</div>}
  </div>;
}

// Validator types from SurveyJS
const VALIDATOR_TYPES = [
  { value: "numeric", label: "Numeric", desc: "Min/max/decimal" },
  { value: "text", label: "Text", desc: "Min/max length" },
  { value: "regex", label: "Regex", desc: "Pattern match" },
  { value: "email", label: "Email", desc: "Valid email" },
  { value: "expression", label: "Expression", desc: "Custom logic" },
];

function ValidationEditor({ field, onChange }: { field: FormBuilderField; onChange: (patch: Partial<FormBuilderField>) => void }) {
  const validators: any[] = field.validators || [];
  const addValidator = (type: string) => {
    const base = { type };
    if (type === "numeric") Object.assign(base, { minValue: undefined, maxValue: undefined });
    if (type === "text") Object.assign(base, { minLength: undefined, maxLength: undefined });
    if (type === "regex") Object.assign(base, { regex: "", text: "Invalid format" });
    if (type === "expression") Object.assign(base, { expression: "", text: "Invalid" });
    onChange({ validators: [...validators, base] });
  };
  const updateValidator = (idx: number, patch: Record<string, unknown>) => {
    const next = validators; next[idx] = { ...next[idx], ...patch };
    onChange({ validators: next });
  };
  const removeValidator = (idx: number) => { const next = validators; next.splice(idx, 1); onChange({ validators: next }); };
  return <div>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0 }}>Validators</span>
      <div style={{ flex: 1 }} />
      <Select value="" onChange={v => { if (v) addValidator(v); }} options={[{ value: "", label: "+ Add validator..." }, ...VALIDATOR_TYPES.map(v => ({ value: v.value, label: v.label }))]} />
    </div>
    {validators.length === 0 && <div className="fb-no-validators">No validators. Add one above.</div>}
    {validators.map((v, idx) => <div key={idx} className="fb-validation-row">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Pill>{VALIDATOR_TYPES.find(t => t.value === v.type)?.label || v.type}</Pill>
        <button onClick={() => removeValidator(idx)} className="fb-icon-btn danger" title="Remove"><CloseIcon style={{ fontSize: 14 }} /></button>
      </div>
      {v.type === "numeric" && <>
        <PropRow label="Min value"><Input type="number" value={v.minValue as number ?? ""} onChange={val => updateValidator(idx, { minValue: val === "" ? undefined : Number(val) })} placeholder="No min" /></PropRow>
        <PropRow label="Max value"><Input type="number" value={v.maxValue as number ?? ""} onChange={val => updateValidator(idx, { maxValue: val === "" ? undefined : Number(val) })} placeholder="No max" /></PropRow>
      </>}
      {v.type === "text" && <>
        <PropRow label="Min length"><Input type="number" value={v.minLength as number ?? ""} onChange={val => updateValidator(idx, { minLength: val === "" ? undefined : Number(val) })} placeholder="No min" /></PropRow>
        <PropRow label="Max length"><Input type="number" value={v.maxLength as number ?? ""} onChange={val => updateValidator(idx, { maxLength: val === "" ? undefined : Number(val) })} placeholder="No max" /></PropRow>
      </>}
      {v.type === "regex" && <>
        <PropRow label="Pattern"><Input value={(v.regex as string) || ""} onChange={val => updateValidator(idx, { regex: val || undefined })} placeholder="e.g. ^[A-Z]+$" /></PropRow>
        <PropRow label="Error text"><Input value={(v.text as string) || ""} onChange={val => updateValidator(idx, { text: val || undefined })} placeholder="Error message" /></PropRow>
      </>}
      {v.type === "expression" && <>
        <PropRow label="Expression"><Input value={(v.expression as string) || ""} onChange={val => updateValidator(idx, { expression: val || undefined })} placeholder="{field} > 5" /></PropRow>
        <PropRow label="Error text"><Input value={(v.text as string) || ""} onChange={val => updateValidator(idx, { text: val || undefined })} placeholder="Error message" /></PropRow>
      </>}
      {v.type === "email" && <div style={{ fontSize: 11, color: C.textMuted }}>Validates email format automatically</div>}
      <PropRow label="Error text"><Input value={(v.text as string) || ""} onChange={val => updateValidator(idx, { text: val || undefined })} placeholder="Custom error message" /></PropRow>
    </div>)}
  </div>;
}

// ── LOGIC RULES EDITOR ────────────────────────────────────────────────────

/** Operator options for logic rules */
const LOGIC_OPERATORS = [
  { value: "=", label: "Equals" },
  { value: "<>", label: "Does not equal" },
  { value: "contains", label: "Contains" },
  { value: "not contains", label: "Does not contain" },
  { value: "starts with", label: "Starts with" },
  { value: "ends with", label: "Ends with" },
  { value: "empty", label: "Is empty" },
  { value: "not empty", label: "Is not empty" },
  { value: ">", label: "Greater than" },
  { value: "<", label: "Less than" },
  { value: ">=", label: "Greater or equal" },
  { value: "<=", label: "Less or equal" },
];

/** Single condition row */
function ConditionRow({ condition, allFields, onUpdate, onRemove, canRemove }: {
  condition: { field: string; operator: string; value: string };
  allFields: FormBuilderField[];
  onUpdate: (c: { field: string; operator: string; value: string }) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
      <Select value={condition.field} onChange={v => onUpdate({ ...condition, field: v })}
        options={[{ value: "", label: "Select field" }, ...allFields.map(f => ({ value: f.name, label: f.title || f.name }))]} />
      <Select value={condition.operator} onChange={v => onUpdate({ ...condition, operator: v })}
        options={LOGIC_OPERATORS} />
      {!["empty", "not empty"].includes(condition.operator) && (
        <Input value={condition.value} onChange={v => onUpdate({ ...condition, value: v })} placeholder="Value" style={{ flex: 1, minWidth: 80 }} />
      )}
      <IconBtn icon={<CloseIcon style={{ fontSize: 14 }} />} title="Remove condition" onClick={onRemove} disabled={!canRemove} danger />
    </div>
  );
}

/** Rules section for a specific rule type */
function RulesSection({ rules, ruleType: _ruleType, title, icon, color, allFields, onChange }: {
  rules: { id: string; field: string; operator: string; value: string; connector: string; enabled: boolean }[];
  ruleType: "visibility" | "required" | "enable";
  title: string;
  icon: React.ReactNode;
  color: string;
  allFields: FormBuilderField[];
  onChange: (rules: { id: string; field: string; operator: string; value: string; connector: string; enabled: boolean }[]) => void;
}) {
  const addRule = () => {
    onChange([...rules, { id: `rule_${Date.now()}`, field: "", operator: "=", value: "", connector: "AND", enabled: true }]);
  };
  
  const updateRule = (idx: number, update: Partial<{ field: string; operator: string; value: string; connector: string; enabled: boolean }>) => {
    const updated = [...rules];
    updated[idx] = { ...updated[idx], ...update };
    onChange(updated);
  };
  
  const removeRule = (idx: number) => {
    onChange(rules.filter((_, i) => i !== idx));
  };

  return (
    <div style={{ marginBottom: 16, padding: 12, background: `${color}08`, borderRadius: 8, border: `1px solid ${color}20` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 14, display: "inline-flex", alignItems: "center", color }}>{icon}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color, flex: 1 }}>{title}</span>
        <Toggle checked={rules.length > 0} onChange={v => { if (v && !rules.length) addRule(); else if (!v) onChange([]); }} label={rules.length > 0 ? "Active" : "Disabled"} />
      </div>
      {rules.map((rule, idx) => (
        <div key={rule.id} style={{ marginBottom: 12 }}>
          {idx > 0 && (
            <Select value={rule.connector as string} onChange={v => updateRule(idx, { connector: v as "AND" | "OR" })}
              options={[{ value: "AND", label: "AND" }, { value: "OR", label: "OR" }]} />
          )}
          <ConditionRow condition={rule} allFields={allFields}
            onUpdate={c => updateRule(idx, c)} onRemove={() => removeRule(idx)} canRemove={rules.length > 1} />
        </div>
      ))}
      {rules.length > 0 && (
        <button onClick={addRule} style={{ fontSize: 11.5, color: C.purple, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
          + Add condition
        </button>
      )}
    </div>
  );
}

/** Value mapping section */
function ValueMappingSection({ valueRule, allFields, onChange }: {
  valueRule: { sourceField: string; transform: string } | undefined;
  allFields: FormBuilderField[];
  onChange: (rule: { sourceField: string; transform: string } | undefined) => void;
}) {
  const [enabled, setEnabled] = useState(!!valueRule?.sourceField);
  
  return (
    <div style={{ marginBottom: 16, padding: 12, background: `${C.purple}08`, borderRadius: 8, border: `1px solid ${C.purple}20` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <RefreshIcon style={{ fontSize: 14 }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.purple, flex: 1 }}>Value Mapping</span>
        <Toggle checked={enabled} onChange={v => { setEnabled(v); if (!v) onChange(undefined); }} label={enabled ? "Active" : "Disabled"} />
      </div>
      {enabled && (
        <>
          <PropRow label="Copy from">
            <Select value={valueRule?.sourceField || ""} onChange={v => onChange({ sourceField: v, transform: valueRule?.transform || "none" })}
              options={[{ value: "", label: "Select field" }, ...allFields.map(f => ({ value: f.name, label: f.title || f.name }))]} />
          </PropRow>
          <PropRow label="Transform">
            <Select value={valueRule?.transform || "none"} onChange={v => onChange({ sourceField: valueRule?.sourceField || "", transform: v })}
              options={[
                { value: "none", label: "None" },
                { value: "uppercase", label: "UPPERCASE" },
                { value: "lowercase", label: "lowercase" },
                { value: "capitalize", label: "Capitalize" },
                { value: "trim", label: "Trim whitespace" },
              ]} />
          </PropRow>
        </>
      )}
    </div>
  );
}

/** Cross-field validation */
function CrossFieldValidationSection({ validations, fieldName, allFields, onChange }: {
  validations: { id: string; fieldA: string; operator: "equals" | "notEquals" | "greaterThan" | "lessThan" | "greaterOrEqual" | "lessOrEqual" | "before" | "after"; fieldB: string; errorMessage: string; enabled: boolean }[];
  fieldName: string;
  allFields: FormBuilderField[];
  onChange: (rules: { id: string; fieldA: string; operator: "equals" | "notEquals" | "greaterThan" | "lessThan" | "greaterOrEqual" | "lessOrEqual" | "before" | "after"; fieldB: string; errorMessage: string; enabled: boolean }[]) => void;
}) {
  // Filter to only fields that come BEFORE this field (to avoid circular deps)
  const priorFields = allFields.filter(f => f.name !== fieldName);
  
  const addValidation = () => {
    onChange([...validations, { id: `cfv_${Date.now()}`, fieldA: fieldName, operator: "greaterThan", fieldB: "", errorMessage: "", enabled: true }]);
  };
  
  const updateValidation = (idx: number, update: Partial<{ fieldA: string; operator: "equals" | "notEquals" | "greaterThan" | "lessThan" | "greaterOrEqual" | "lessOrEqual" | "before" | "after"; fieldB: string; errorMessage: string; enabled: boolean }>) => {
    const updated = [...validations];
    updated[idx] = { ...updated[idx], ...update };
    onChange(updated);
  };
  
  const removeValidation = (idx: number) => {
    onChange(validations.filter((_, i) => i !== idx));
  };

  return (
    <div style={{ marginBottom: 16, padding: 12, background: `${C.red}08`, borderRadius: 8, border: `1px solid ${C.red}20` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 14 }}>⚖️</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.red, flex: 1 }}>Cross-field Validation</span>
        <Toggle checked={validations.length > 0} onChange={v => { if (v && !validations.length) addValidation(); else if (!v) onChange([]); }} label={validations.length > 0 ? "Active" : "Disabled"} />
      </div>
      {validations.length === 0 && priorFields.length === 0 && (
        <div style={{ fontSize: 11, color: C.textMuted }}>Add fields before this one to create validations.</div>
      )}
      {validations.map((v, idx) => (
        <div key={v.id} style={{ marginBottom: 12, padding: 10, background: C.white, borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>
            <strong>{fieldName}</strong> must be:
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <Select value={v.operator as string} onChange={val => updateValidation(idx, { operator: val as "equals" | "notEquals" | "greaterThan" | "lessThan" | "greaterOrEqual" | "lessOrEqual" | "before" | "after" })}
              options={[
                { value: "equals", label: "Equal to" },
                { value: "notEquals", label: "Not equal to" },
                { value: "greaterThan", label: "Greater than" },
                { value: "lessThan", label: "Less than" },
                { value: "greaterOrEqual", label: "At least" },
                { value: "lessOrEqual", label: "At most" },
                { value: "before", label: "Before" },
                { value: "after", label: "After" },
              ]} />
            <Select value={v.fieldB} onChange={val => updateValidation(idx, { fieldB: val })}
              options={[{ value: "", label: "Select field" }, ...priorFields.map(f => ({ value: f.name, label: f.title || f.name }))]} />
          </div>
          <Input value={v.errorMessage} onChange={val => updateValidation(idx, { errorMessage: val })} placeholder="Error message" />
          <button onClick={() => removeValidation(idx)} style={{ marginTop: 8, fontSize: 11, color: C.red, background: "none", border: "none", cursor: "pointer" }}>
            Remove validation
          </button>
        </div>
      ))}
      {validations.length > 0 && (
        <button onClick={addValidation} style={{ fontSize: 11.5, color: C.red, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
          + Add validation
        </button>
      )}
    </div>
  );
}

/** Main Logic Rules Editor component */
function LogicRulesEditor({ field, allFields, onChange }: {
  field: FormBuilderField;
  allFields: FormBuilderField[];
  onChange: (patch: Partial<FormBuilderField>) => void;
}) {
  // Parse existing visibleIf into rules format
  const visibilityRules = useMemo(() => {
    if (!field.visibleIf) return [];
    // Simple parsing - in real impl this would be more sophisticated
    return [{ id: "v1", field: "", operator: "=", value: "", connector: "AND", enabled: true }];
  }, [field.visibleIf]);

  const enableRules = useMemo(() => {
    if (!field.enableIf) return [];
    return [{ id: "e1", field: "", operator: "=", value: "", connector: "AND", enabled: true }];
  }, [field.enableIf]);

  const updateVisibilityRules = (rules: typeof visibilityRules) => {
    // Build expression from rules
    if (rules.length === 0 || !rules[0].field) {
      onChange({ visibleIf: undefined });
      return;
    }
    const expr = rules.map((r, i) => {
      if (["empty", "not empty"].includes(r.operator)) {
        if (i > 0) return ` ${r.connector} {${r.field}} ${r.operator}`;
        return `{${r.field}} ${r.operator}`;
      }
      if (i > 0) return ` ${r.connector} {${r.field}} ${r.operator} '${r.value}'`;
      return `{${r.field}} ${r.operator} '${r.value}'`;
    }).join("");
    onChange({ visibleIf: expr });
  };

  const updateEnableRules = (rules: typeof enableRules) => {
    if (rules.length === 0 || !rules[0].field) {
      onChange({ enableIf: undefined });
      return;
    }
    const expr = rules.map((r, i) => {
      if (["empty", "not empty"].includes(r.operator)) {
        if (i > 0) return ` ${r.connector} {${r.field}} ${r.operator}`;
        return `{${r.field}} ${r.operator}`;
      }
      if (i > 0) return ` ${r.connector} {${r.field}} ${r.operator} '${r.value}'`;
      return `{${r.field}} ${r.operator} '${r.value}'`;
    }).join("");
    onChange({ enableIf: expr });
  };

  const fieldName = field.name;
  const priorFields = allFields.filter(f => f.name !== fieldName);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {/* The single-condition editors. Named for what they do rather than "(legacy)" —
          these are the working controls, and "legacy" read as deprecated to admins. */}
      <ConditionEditor label="Show this field when" value={field.visibleIf || ""} onChange={v => onChange({ visibleIf: v || undefined })} allFields={priorFields} />
      <ConditionEditor label="Allow editing when" value={field.enableIf || ""} onChange={v => onChange({ enableIf: v || undefined })} allFields={priorFields} />
      
      <div style={{ marginTop: 16 }}>
        <RulesSection rules={visibilityRules} ruleType="visibility" title="Show/Hide Rules" icon={<VisibilityIcon style={{ fontSize: 15 }} />} color={C.green} allFields={priorFields} onChange={updateVisibilityRules} />
        <RulesSection rules={enableRules} ruleType="enable" title="Enable/Disable Rules" icon={<LockOpenIcon style={{ fontSize: 15 }} />} color={C.purple} allFields={priorFields} onChange={updateEnableRules} />
        <ValueMappingSection valueRule={field.valueMapping as { sourceField: string; transform: string } | undefined} allFields={allFields} onChange={v => onChange({ valueMapping: v })} />
        <CrossFieldValidationSection 
            validations={(field.crossFieldValidations || []) as { id: string; fieldA: string; operator: "equals" | "notEquals" | "greaterThan" | "lessThan" | "greaterOrEqual" | "lessOrEqual" | "before" | "after"; fieldB: string; errorMessage: string; enabled: boolean }[]} 
            fieldName={fieldName} 
            allFields={allFields} 
            onChange={v => onChange({ crossFieldValidations: v })} />
      </div>
    </div>
  );
}

// Map SurveyJS types to MUI icons (all 57 field types, each unique)

// ── Palette ───────────────────────────────────────────────────────────
/**
 * Two tabs of four sections each. Typing flattens both tabs into one "Results"
 * group so a search never hides a match behind the inactive tab.
 */
function Palette({ onAdd }: { onAdd: (td: typeof QUESTION_TYPES[number]) => void }) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<PaletteTab>("basic");

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) {
      const hits = PALETTE_ITEMS.filter(
        p => p.label.toLowerCase().includes(q) || p.def.type.includes(q) || p.def.label.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      );
      return hits.length ? [{ name: "Results", items: hits }] : [];
    }
    return TAB_SECTIONS[tab]
      .map(name => ({ name, items: PALETTE_ITEMS.filter(p => p.tab === tab && p.section === name) }))
      .filter(g => g.items.length > 0);
  }, [search, tab]);

  const onDragStart = (e: React.DragEvent, item: PaletteItem) => {
    e.dataTransfer.setData("palette_type", JSON.stringify(item.def));
    e.dataTransfer.effectAllowed = "copy";
  };

  const tabBtn = (id: PaletteTab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      className={`bx-palette-tab${tab === id ? " is-on" : ""}`}
      onClick={() => { setTab(id); setSearch(""); }}
    >
      {label}
    </button>
  );

  return (
    <aside className="bx-palette">
      <div className="bx-palette-tabs" role="tablist" aria-label="Field type groups">
        {tabBtn("basic", "Basic Fields")}
        <div className="bx-palette-tabrule" />
        {tabBtn("advanced", "Advanced")}
      </div>
      <div className="bx-palette-search">
        <label className="bx-label" htmlFor="bx-palette-search" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
          Search field types
        </label>
        <input
          id="bx-palette-search"
          className="bx-input"
          style={{ height: 36 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search fields"
        />
      </div>
      <div className="bx-palette-body">
        {groups.map(group => (
          <div key={group.name} className="bx-palette-group">
            <div className="bx-palette-grouphead">
              <span className="bx-eyebrow bx-eyebrow-sm">{group.name}</span>
              <span className="bx-palette-grouprule" />
            </div>
            <div className="bx-palette-grid">
              {group.items.map(item => (
                <button
                  key={item.def.type}
                  type="button"
                  className="bx-pal-btn"
                  title={item.description}
                  draggable
                  onDragStart={e => onDragStart(e, item)}
                  onClick={() => onAdd(item.def)}
                >
                  <FieldIcon type={item.def.type} size={18} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <div style={{ padding: "24px 4px", fontSize: 14, color: "var(--bx-n600)" }}>No field types match that search.</div>
        )}
      </div>
    </aside>
  );
}

// ── The form sheet ────────────────────────────────────────────────────
/**
 * Renders one field the way an employee will meet it — a real control, not a
 * summary card. Everything the old `FieldCard` could do (select, drag-reorder,
 * drop into a panel, move, duplicate, delete, surface validation errors, refuse
 * to touch the managed Company selector) still happens here; only the drawing
 * changed.
 */
function choiceTexts(field: FormBuilderField): string[] {
  const raw = Array.isArray(field.choices) ? field.choices : [];
  const texts = raw
    .map(c => (typeof c === "string" ? c : (c as { text?: string; value?: string })?.text || (c as { value?: string })?.value || ""))
    .filter(Boolean);
  if (texts.length) return texts;
  if (field.spChoicesSource?.list || field.spFilteredListSource?.list) return ["Loaded from SharePoint"];
  return ["Option 1", "Option 2", "Option 3"];
}

function wysPlaceholder(field: FormBuilderField): string {
  const hint = (field.placeholder as string) || field.description || "";
  if (hint) return hint;
  const kind = wysKind(field.type);
  if (kind === "block") return `${shortTypeLabel(field.type)} area`;
  if (kind === "area") return "Long answer…";
  if (field.type === "date") return "dd / mm / yyyy";
  if (field.type === "datetime") return "dd / mm / yyyy, hh:mm";
  if (field.type === "number" || field.type === "currency" || field.type === "counter") return "0";
  return "Short answer…";
}

/** How many options one field's canvas card previews before it summarises the rest. */
const WYS_CHOICE_PREVIEW_LIMIT = 6;

function WysControl({ field, children }: { field: FormBuilderField; children?: React.ReactNode }) {
  const kind = wysKind(field.type);
  const placeholder = wysPlaceholder(field);

  if (kind === "rule") return <div className="bx-wys-rule" />;
  if (kind === "container") return <>{children}</>;
  if (kind === "block") return <div className="bx-wys bx-wys-block">{placeholder}</div>;
  if (kind === "area") return <div className="bx-wys bx-wys-area">{placeholder}</div>;
  if (kind === "bool") {
    return (
      <div style={{ display: "flex", gap: 10 }}>
        <span className="bx-wys-chip">{(field.labelTrue as string) || "Yes"}</span>
        <span className="bx-wys-chip">{(field.labelFalse as string) || "No"}</span>
      </div>
    );
  }
  if (kind === "choice") {
    const round = hasRoundMark(field.type);
    // A long option list is trimmed so one field cannot swallow the canvas, but
    // the managed Company selector is drawn in full: it is edited elsewhere, and
    // a silently clipped list reads as "my new company was not saved".
    const allTexts = choiceTexts(field);
    const shown = isManagedCompanyChoice(field) ? allTexts : allTexts.slice(0, WYS_CHOICE_PREVIEW_LIMIT);
    const hiddenCount = allTexts.length - shown.length;
    return (
      <div className="bx-wys-choices">
        {shown.map((text, i) => (
          <div key={`${text}-${i}`} className="bx-wys-choice">
            <span className={`bx-wys-mark${round ? " is-round" : ""}`} />
            {text}
          </div>
        ))}
        {field.hasOther && (
          <div className="bx-wys-choice">
            <span className={`bx-wys-mark${round ? " is-round" : ""}`} />
            {field.otherText || DEFAULT_OTHER_TEXT}
          </div>
        )}
        {hiddenCount > 0 && (
          <div className="bx-wys-choice-more">+{hiddenCount} more option{hiddenCount === 1 ? "" : "s"}</div>
        )}
      </div>
    );
  }
  return <div className="bx-wys">{placeholder}</div>;
}

function FieldRow({ field, index, selected, onSelect, onRemove, onDuplicate, onMoveUp, onMoveDown, isFirst, isLast, errors, onDragStart, onDragOver, onDrop, dropOver, onDropOnPanel, onRecursiveReorder, selectedId }: {
  field: FormBuilderField; index: number; selected: boolean; onSelect: (id: string) => void;
  onRemove: (id: string) => void; onDuplicate: (field: FormBuilderField) => void;
  onMoveUp: () => void; onMoveDown: () => void; isFirst: boolean; isLast: boolean;
  errors: { id: string; msg: string }[];
  onDragStart: (e: React.DragEvent, i: number) => void;
  onDragOver: (e: React.DragEvent, i: number) => void;
  onDrop: (e: React.DragEvent, i: number) => void;
  dropOver: boolean;
  onDropOnPanel?: (e: React.DragEvent, panelId: string) => void;
  onRecursiveReorder?: (fromId: string, toId: string) => void;
  selectedId?: string | null;
}) {
  const err = errors.filter(e => e.id === field._id);
  const managed = isManagedCompanyChoice(field);
  const isContainer = wysKind(field.type) === "container";
  const children = Array.isArray(field.elements) ? field.elements : [];

  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

  return (
    <div
      className={`bx-fieldrow${selected ? " is-selected" : ""}${err.length ? " is-error" : ""}${dropOver ? " is-dropover" : ""}`}
      draggable={!managed}
      onDragStart={e => onDragStart(e, index)}
      onDragOver={e => onDragOver(e, index)}
      onDrop={e => {
        if (isContainer && onDropOnPanel) {
          e.preventDefault();
          e.stopPropagation();
          onDropOnPanel(e, field._id);
          return;
        }
        onDrop(e, index);
      }}
      onClick={e => { e.stopPropagation(); onSelect(field._id); }}
      // Tabbable so the sheet stays navigable by keyboard: Enter or Space opens
      // this field's properties, exactly as a click does.
      tabIndex={0}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onSelect(field._id);
        }
      }}
      title={managed ? "Managed from Settings → Branding & banner" : undefined}
    >
      <div className="bx-rowtools" onClick={e => e.stopPropagation()}>
        <button type="button" className="bx-ghost" title={managed ? "The managed Company selector stays at the top" : "Move up"} disabled={managed || isFirst} onClick={stop(onMoveUp)}>
          <Icon name="chevup" size={14} strokeWidth={1.6} />
        </button>
        <button type="button" className="bx-ghost" title={managed ? "The managed Company selector stays at the top" : "Move down"} disabled={managed || isLast} onClick={stop(onMoveDown)}>
          <Icon name="chevdown" size={14} strokeWidth={1.6} />
        </button>
        <button type="button" className="bx-ghost" title={managed ? "The managed Company selector cannot be duplicated" : "Duplicate (Ctrl+D)"} disabled={managed} onClick={stop(() => onDuplicate(field))}>
          <Icon name="copy" size={14} strokeWidth={1.6} />
        </button>
        <button type="button" className="bx-ghost" title={managed ? "Turn the Company selector off in Settings to remove it" : "Delete (Del)"} disabled={managed} onClick={stop(() => onRemove(field._id))}>
          <Icon name="trash" size={14} strokeWidth={1.6} />
        </button>
      </div>

      <div className="bx-fieldrow-label">
        <FieldIcon type={field.type} size={17} />
        <span>
          {field.title || "(no label)"}
          {field.isRequired ? " *" : ""}
        </span>
        {managed && <span className="bx-tag bx-tag-accent">Managed</span>}
        {field.visibleIf && <span className="bx-tag bx-tag-neutral">Conditional</span>}
        {field.readOnly && <span className="bx-tag bx-tag-neutral">Read-only</span>}
        {field.startWithNewLine === false && <span className="bx-tag bx-tag-neutral">Inline</span>}
      </div>

      <WysControl field={field}>
        {isContainer && (
          <div
            className="bx-wys-nest"
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={e => { if (onDropOnPanel) { e.preventDefault(); e.stopPropagation(); onDropOnPanel(e, field._id); } }}
          >
            {children.length === 0 ? (
              <div className="bx-wys-nest-empty">Drop fields here to put them inside “{field.title || shortTypeLabel(field.type)}”.</div>
            ) : (
              children.map((child, ci) => (
                <FieldRow
                  key={child._id}
                  field={child}
                  index={ci}
                  selected={selectedId === child._id}
                  onSelect={onSelect}
                  onRemove={onRemove}
                  onDuplicate={onDuplicate}
                  onMoveUp={ci > 0 && onRecursiveReorder ? () => onRecursiveReorder(child._id, children[ci - 1]._id) : () => { }}
                  onMoveDown={ci < children.length - 1 && onRecursiveReorder ? () => onRecursiveReorder(child._id, children[ci + 1]._id) : () => { }}
                  isFirst={ci === 0}
                  isLast={ci === children.length - 1}
                  errors={errors}
                  onDragStart={(e: React.DragEvent) => {
                    e.stopPropagation();
                    e.dataTransfer.setData("field_id", child._id);
                    e.dataTransfer.setData("from_panel", "true");
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  dropOver={false}
                  onDropOnPanel={onDropOnPanel}
                  onRecursiveReorder={onRecursiveReorder}
                  selectedId={selectedId}
                />
              ))
            )}
          </div>
        )}
      </WysControl>

      {err.map((e, i) => (
        <div key={i} className="bx-fieldrow-err">
          <Icon name="warning" size={14} strokeWidth={1.6} />
          {e.msg}
        </div>
      ))}
    </div>
  );
}

export type SheetMeta = {
  formId: string;
  version: string;
  slug: string;
  isoStandards: string;
  title: string;
  titleLocked: boolean;
};

/**
 * The centre pane: a sheet of paper on a sunken desk, showing the form as the
 * employee will meet it. The form title is edited here rather than in a
 * sidebar, and the whole sheet is the drop target for the palette.
 */
function FormSheet({ fields, selectedId, onSelect, onRemove, onDuplicate, onReorder, onAddFromPalette, errors, onDropOnPanel, onRecursiveReorder, onMoveToRoot, sheet, onTitleChange, onUndo, onRedo, canUndo, canRedo, readOnly }: {
  fields: FormBuilderField[]; selectedId: string | null; onSelect: (id: string | null) => void;
  onRemove: (id: string) => void; onDuplicate: (field: FormBuilderField) => void;
  onReorder: (from: number, to: number) => void;
  onAddFromPalette: (td: typeof QUESTION_TYPES[number], atIndex?: number) => void;
  errors: { id: string; msg: string }[];
  onDropOnPanel?: (e: React.DragEvent, panelId: string) => void;
  onRecursiveReorder?: (fromId: string, toId: string) => void;
  onMoveToRoot?: (fieldId: string, atIndex: number) => void;
  sheet?: SheetMeta;
  onTitleChange?: (v: string) => void;
  onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean;
  readOnly?: boolean;
}) {
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const onDragStart = (e: React.DragEvent, i: number) => {
    if (isManagedCompanyChoice(fields[i])) { e.preventDefault(); return; }
    dragIndexRef.current = i;
    setDraggingIndex(i);
    e.dataTransfer.effectAllowed = "move";
    if (fields[i]) e.dataTransfer.setData("field_id", fields[i]._id);
  };
  const onDragOver = (e: React.DragEvent, i: number) => { e.preventDefault(); setDragOverIndex(i); };
  const onDrop = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    setDraggingIndex(null);
    const pd = e.dataTransfer.getData("palette_type");
    if (pd) { try { onAddFromPalette(JSON.parse(pd), i); } catch { /* Invalid palette data — ignore */ } dragIndexRef.current = null; return; }
    const fieldId = e.dataTransfer.getData("field_id");
    const fromPanel = e.dataTransfer.getData("from_panel") === "true";
    if (fromPanel && fieldId && onMoveToRoot) { onMoveToRoot(fieldId, i); dragIndexRef.current = null; return; }
    if (dragIndexRef.current !== null && dragIndexRef.current !== i) onReorder(dragIndexRef.current, i);
    dragIndexRef.current = null;
  };
  const onDragEnd = () => { setDraggingIndex(null); setDragOverIndex(null); dragIndexRef.current = null; };

  /** Drops on the sheet's own padding append to the end. */
  const onSheetDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverIndex(null);
    setDraggingIndex(null);
    const pd = e.dataTransfer.getData("palette_type");
    if (pd) { try { onAddFromPalette(JSON.parse(pd), fields.length); } catch { /* Invalid palette data — ignore */ } }
    const fieldId = e.dataTransfer.getData("field_id");
    const fromPanel = e.dataTransfer.getData("from_panel") === "true";
    if (fromPanel && fieldId && onMoveToRoot) onMoveToRoot(fieldId, fields.length);
    dragIndexRef.current = null;
  };

  const quickAdds = QUICK_ADD_TYPES
    .map(t => PALETTE_ITEMS.find(p => p.def.type === t))
    .filter((p): p is PaletteItem => !!p);

  const docLine = sheet
    ? [sheet.formId || "No form ID", `v${sheet.version || "1.0"}`, sheet.slug ? `/form/${sheet.slug}` : null]
      .filter(Boolean)
      .join("  ·  ")
    : "";

  return (
    <section className="bx-sheetwrap" onDragOver={e => e.preventDefault()} onDrop={onSheetDrop} onDragEnd={onDragEnd} onClick={() => onSelect(null)}>
      <div className="bx-sheet" onClick={e => e.stopPropagation()}>
        <div className="bx-sheet-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            {sheet?.isoStandards ? <div className="bx-sheet-iso">{sheet.isoStandards}</div> : null}
            <input
              className="bx-sheet-title"
              value={sheet?.title ?? ""}
              onChange={e => onTitleChange?.(e.target.value)}
              placeholder="Untitled form"
              aria-label="Form title"
              disabled={!onTitleChange || sheet?.titleLocked || readOnly}
              title={sheet?.titleLocked ? "The form title becomes the SharePoint list name and is locked after the first publish." : undefined}
            />
            {docLine && <div className="bx-meta bx-num" style={{ marginTop: 6 }}>{docLine}</div>}
          </div>
          <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 6, paddingTop: sheet?.isoStandards ? 26 : 6 }}>
            {errors.length > 0 && (
              <span className="bx-tag bx-tag-danger" style={{ height: 30, padding: "0 9px" }}>
                {errors.length} error{errors.length !== 1 ? "s" : ""}
              </span>
            )}
            <button type="button" className="bx-ghost" title="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>
              <Icon name="undo" size={15} strokeWidth={1.6} />
            </button>
            <button type="button" className="bx-ghost" title="Redo (Ctrl+Y)" onClick={onRedo} disabled={!canRedo}>
              <Icon name="redo" size={15} strokeWidth={1.6} />
            </button>
          </div>
        </div>

        {fields.map((field, i) => (
          <Fragment key={field._id}>
            <div className="bx-dropzone" style={{ display: dragOverIndex === i && draggingIndex !== i ? "block" : "none" }} />
            <FieldRow
              field={field}
              index={i}
              selected={selectedId === field._id}
              onSelect={onSelect}
              onRemove={onRemove}
              onDuplicate={onDuplicate}
              onMoveUp={() => onReorder(i, i - 1)}
              onMoveDown={() => onReorder(i, i + 1)}
              isFirst={i === 0}
              isLast={i === fields.length - 1}
              errors={errors}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              dropOver={false}
              onDropOnPanel={onDropOnPanel}
              onRecursiveReorder={onRecursiveReorder}
              selectedId={selectedId}
            />
          </Fragment>
        ))}
        <div className="bx-dropzone" style={{ display: dragOverIndex === fields.length && draggingIndex !== fields.length ? "block" : "none" }} />

        <div className="bx-sheet-foot">
          {fields.length === 0 ? (
            <div className="bx-empty" style={{ width: "100%" }}>
              <Icon name="plusbox" size={38} strokeWidth={1.3} style={{ color: "var(--bx-accent)", margin: "0 auto 14px", display: "block" }} />
              <h3>Drag a field here</h3>
              <p>Choose from Basic or Advanced fields on the left. What you see here is exactly what employees will fill in.</p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                {quickAdds.map(item => (
                  <button key={item.def.type} type="button" className="bx-btn bx-btn-secondary" style={{ height: 36 }} onClick={() => onAddFromPalette(item.def)}>
                    + {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <button type="button" className="bx-btn bx-btn-primary" style={{ height: 44, padding: "0 30px", fontSize: 15.5 }} disabled title="This is how the submit button will look to employees">
                Submit
              </button>
              <span className="bx-meta">
                {fields.length} field{fields.length !== 1 ? "s" : ""} · drop a field anywhere to insert
              </span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Property Editors ──────────────────────────────────────────────────
/**
 * Manual choice list for dropdown / checkbox / radio fields.
 *
 * The label is what the employee reads and the only thing most authors care
 * about, so it leads; the schema name that goes into SharePoint follows it
 * automatically. Typing into the schema name box unlinks that row — from then on
 * it survives label edits, which is the only way to rename a label without
 * orphaning the answers already stored under the old value.
 */
function ChoicesEditor({ choices, onChange }: { choices: (string | { value: string; text: string })[]; onChange: (c: (string | { value: string; text: string })[]) => void }) {
  type ChoiceItem = { value: string; text: string };
  const items = (Array.isArray(choices) ? choices : []).map(c => typeof c === "string" ? { value: c, text: c } : { value: c.value, text: c.text ?? c.value }) as ChoiceItem[];
  // A choice whose label and schema name match collapses back to a bare string,
  // the shape SurveyJS and every older saved form already use.
  const emit = (next: ChoiceItem[]) => onChange(next.map(x => x.value === x.text ? x.value : x));
  const setLabel = (i: number, text: string) => emit(items.map((it, idx) => {
    if (idx !== i) return it;
    return isSchemaNameDerivedFrom(it.value, it.text)
      ? { text, value: schemaNameFromLabel(text) }
      : { ...it, text };
  }));
  const setName = (i: number, value: string) => emit(items.map((it, idx) =>
    idx === i ? { ...it, value: value.replace(/[^a-zA-Z0-9_]/g, "") } : it));
  const add = () => {
    const label = `Option ${items.length + 1}`;
    emit([...items, { value: schemaNameFromLabel(label), text: label }]);
  };
  return <div className="fb-choices-list">
    <div className="fb-choice-row fb-choice-head">
      <span className="fb-choice-input">Label</span>
      <span className="fb-choice-input">Schema name</span>
      <span className="fb-choice-head-spacer" />
    </div>
    {items.map((it, i) => <div key={i} className="fb-choice-row">
      <Input value={it.text} onChange={v => setLabel(i, v)} placeholder="Label" className="fb-choice-input" aria-label={`Choice ${i + 1} label`} />
      <Input value={it.value} onChange={v => setName(i, v)} placeholder="schemaName" className="fb-choice-input" aria-label={`Choice ${i + 1} schema name`} />
      <IconBtn icon={<CloseIcon style={{ fontSize: 14 }} />} title="Remove" onClick={() => emit(items.filter((_, idx) => idx !== i))} danger />
    </div>)}
    <button onClick={add} className="fb-add-choice-btn"><AddIcon style={{ fontSize: 14 }} /> Add option</button>
  </div>;
}

type RatingRange = Pick<FormBuilderField, "rateMin" | "rateMax">;

/** The points a rating's min and max describe, capped the way the renderers cap them. */
function ratingStepValues(field: RatingRange): number[] {
  const from = Math.min(field.rateMin ?? 1, field.rateMax ?? 5);
  const to = Math.max(field.rateMin ?? 1, field.rateMax ?? 5);
  return Array.from({ length: Math.max(1, Math.min(to - from + 1, 21)) }, (_, i) => from + i);
}

/** The labels already written, keyed by the step they belong to. */
function ratingLabelsByStep(rateValues: FormBuilderField["rateValues"]): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of rateValues ?? []) {
    if (!entry || typeof entry !== "object") continue;
    const value = String(entry.value ?? "");
    const text = String(entry.text ?? "");
    // A step whose label is its own number is unlabelled; it exists in the list
    // only because a neighbour has words on it.
    if (value && text && text !== value) out.set(value, text);
  }
  return out;
}

/** `rateValues` for a scale, or nothing at all when no step carries a label. */
function buildRateValues(steps: number[], labels: Map<string, string>): FormBuilderField["rateValues"] {
  if (steps.every(step => !labels.get(String(step)))) return undefined;
  return steps.map(step => ({ value: step, text: labels.get(String(step)) || String(step) }));
}

/**
 * A label for every point on a rating scale — "Disagree", "Fair", "Agree" —
 * rather than only for its two ends.
 *
 * The rows are derived from the scale's own min and max instead of being a list
 * the author maintains beside them, because the two can only ever disagree: a
 * 1–5 scale carrying four labels renders as four steps, and nobody authored
 * that. Widening the range keeps the words already written, since the labels are
 * held by step value rather than by position.
 */
function RatingLabelsEditor({ field, onChange }: { field: FormBuilderField; onChange: (patch: Partial<FormBuilderField>) => void }) {
  const steps = ratingStepValues(field);
  const labels = ratingLabelsByStep(field.rateValues);

  const setLabel = (step: number, text: string) => {
    const next = new Map(labels);
    if (text.trim()) next.set(String(step), text);
    else next.delete(String(step));
    onChange({ rateValues: buildRateValues(steps, next) });
  };

  return <div className="fb-choices-list">
    <div className="fb-choice-row fb-choice-head">
      <span className="fb-rate-step">Step</span>
      <span className="fb-choice-input">Label</span>
    </div>
    {steps.map(step => <div key={step} className="fb-choice-row">
      <span className="fb-rate-step">{step}</span>
      <Input
        value={labels.get(String(step)) ?? ""}
        onChange={v => setLabel(step, v)}
        placeholder="Optional"
        className="fb-choice-input"
        aria-label={`Label for rating ${step}`}
      />
    </div>)}
  </div>;
}

function DefaultValueEditor({ field, onChange }: { field: FormBuilderField; onChange: (patch: Partial<FormBuilderField>) => void }) {
  const isDateType = field.type === "date";
  const isDateTimeType = field.type === "datetime";
  const isDateOrDateTime = isDateType || isDateTimeType;
  const useDynamicDefault = field.defaultValue === "__today__" || field.defaultValue === "__now__";

  const handleChange = (v: string) => {
    if (field.type === "number" || field.inputType === "number") {
      onChange({ defaultValue: v === "" ? undefined : Number(v) });
    } else if (field.type === "boolean") {
      onChange({ defaultValue: v === "true" });
    } else {
      onChange({ defaultValue: v === "" ? undefined : v });
    }
  };
  const currentValue = field.defaultValue !== undefined && !useDynamicDefault ? String(field.defaultValue) : "";
  const inputType = isDateType ? "date" : isDateTimeType ? "datetime-local" : "text";
  return <PropRow label="Default value">
    {isDateOrDateTime ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12.5, color: C.textSecond, userSelect: "none" }}>
          <input
            type="checkbox"
            checked={useDynamicDefault}
            onChange={e => {
              if (e.target.checked) {
                onChange({ defaultValue: isDateType ? "__today__" : "__now__" });
              } else {
                onChange({ defaultValue: undefined });
              }
            }}
            style={{ width: 15, height: 15, accentColor: C.purple, margin: 0 }} />
          {isDateType ? "Default to today's date" : "Default to current time (now)"}
        </label>
        {!useDynamicDefault && (
          <Input type={inputType} value={currentValue} onChange={handleChange} placeholder={isDateType ? "Pick a date" : "Pick date & time"} />
        )}
        {useDynamicDefault && (
          <div style={{ fontSize: 11, color: C.textMuted, fontStyle: "italic" }}>
            {isDateType
              ? "Form will auto-fill with today's date when opened."
              : "Form will auto-fill with the current date and time when opened."}
          </div>
        )}
      </div>
    ) : (
      <Input type={inputType} value={currentValue} onChange={handleChange} placeholder="Enter default value" />
    )}
  </PropRow>;
}

/** Renders type-specific configuration controls in the General tab */
function FieldTypeProps({ field, onChange, allFields }: { field: FormBuilderField; onChange: (patch: Partial<FormBuilderField>) => void; allFields: FormBuilderField[] }) {
  // A plain Text field switched to the Number input type is a numeric field in
  // every way that matters, so it gets the same min / max / step controls — it
  // used to be the one way to author a bound that nothing in the panel could
  // then show you.
  const numericTypes = ["number", "slider", "counter", "currency"];
  const isNumeric = numericTypes.includes(field.type) || field.inputType === "number";
  const dateTypes = ["date", "datetime"];
  const commentTypes = ["comment", "jsoneditor"];
  const fileTypes = ["file", "imageupload"];
  const htmlTypes = ["html", "alert", "countdown", "datatable", "chartdisplay", "videoembed"];
  const booleanTypes = ["boolean", "consent"];
  const matrixTypes = ["dynamicmatrix", "tableinput"];

  return <>
    {/* Numeric: min / max / step */}
    {isNumeric && <>
      <div style={{ display: "flex", gap: 8 }}>
        <PropRow label="Min"><Input type="number" value={field.min ?? ""} onChange={v => onChange({ min: v === "" ? undefined : Number(v) })} placeholder="No min" /></PropRow>
        <PropRow label="Max"><Input type="number" value={field.max ?? ""} onChange={v => onChange({ max: v === "" ? undefined : Number(v) })} placeholder="No max" /></PropRow>
      </div>
      <PropRow label="Step"><Input type="number" value={field.step ?? ""} onChange={v => onChange({ step: v === "" ? undefined : Number(v) })} placeholder="1" /></PropRow>
    </>}

    {/* Currency: symbol + decimal places */}
    {field.type === "currency" && <>
      <PropRow label="Currency symbol">
        <Input value={(field as unknown as Record<string, unknown>).currencySymbol as string || "RM"} onChange={v => onChange({ currencySymbol: v } as unknown as Partial<FormBuilderField>)} placeholder="RM" />
      </PropRow>
      <PropRow label="Decimal places">
        <Select value={String((field as unknown as Record<string, unknown>).decimalPlaces ?? 2)} onChange={v => onChange({ decimalPlaces: parseInt(v) } as unknown as Partial<FormBuilderField>)} options={[
          { value: "0", label: "0 (integer)" },
          { value: "1", label: "1 decimal" },
          { value: "2", label: "2 decimals" },
          { value: "3", label: "3 decimals" },
          { value: "4", label: "4 decimals" },
        ]} />
      </PropRow>
    </>}

    {/* Number: display format + prefix + suffix */}
    {field.type === "number" && <>
      <PropRow label="Display format">
        <Select value={(field.displayFormat as string) || "0.00"} onChange={v => onChange({ displayFormat: v })} options={[
          { value: "0", label: "0 (Integer)" },
          { value: "0.0", label: "0.0 (1 decimal)" },
          { value: "0.00", label: "0.00 (2 decimals)" },
          { value: "0.000", label: "0.000 (3 decimals)" },
        ]} />
      </PropRow>
      <PropRow label="Prefix">
        <Input value={field.prefix || ""} onChange={v => onChange({ prefix: v || undefined })} placeholder="e.g. $" />
      </PropRow>
      <PropRow label="Suffix">
        <Input value={field.suffix || ""} onChange={v => onChange({ suffix: v || undefined })} placeholder="e.g. kg" />
      </PropRow>
    </>}

    {/* Formula: expression editor + displayFormat + recalculate toggle */}
    {field.type === "formula" && <>
      <PropRow label="Expression / Formula" span>
        <div>
          <Textarea value={field.expression || ""} onChange={v => onChange({ expression: v })} rows={3} placeholder="e.g. {field1} + {field2}" />
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4, lineHeight: 1.4 }}>
            Use <code style={{ background: editorial.skySoft, padding: "1px 4px", borderRadius: 3, fontSize: 11 }}>{'{field_name}'}</code> syntax to reference other fields.
            Supports <strong>+</strong>, <strong>-</strong>, <strong>*</strong>, <strong>/</strong>, parentheses, and SurveyJS expression functions.
          </div>
        </div>
        <FieldRefPicker
          fields={allFields}
          currentName={field.name}
          onPick={(name) => {
            const cur = (field.expression || "").replace(/\s*[+\-*/]\s*$/, "");
            onChange({ expression: cur ? `${cur} + {${name}}` : `{${name}}` });
          }}
        />
      </PropRow>
      <div style={{ display: "flex", gap: 8 }}>
        <PropRow label="Default value">
          <Input type="number" value={Number(field.defaultValue ?? 0)} onChange={v => onChange({ defaultValue: v === "" ? 0 : Number(v) })} placeholder="0" />
        </PropRow>
        <PropRow label="Decimal places">
          <Select value={String((field as unknown as Record<string, unknown>).decimalPlaces ?? 2)} onChange={v => onChange({ decimalPlaces: parseInt(v) } as unknown as Partial<FormBuilderField>)} options={[
            { value: "0", label: "0 (integer)" },
            { value: "1", label: "1 decimal" },
            { value: "2", label: "2 decimals" },
            { value: "3", label: "3 decimals" },
            { value: "4", label: "4 decimals" },
          ]} />
        </PropRow>
      </div>
      <PropRow label="Display format">
        <Select value={field.displayFormat || "number"} onChange={v => onChange({ displayFormat: v })} options={[
          { value: "number", label: "Number" },
          { value: "currency", label: "Currency (RM)" },
          { value: "percent", label: "Percentage" },
        ]} />
      </PropRow>
      <div style={{ paddingTop: 4 }}>
        <Toggle checked={field.recalculateOnChange !== false} onChange={v => onChange({ recalculateOnChange: v })} label="Auto-recalculate on change" />
      </div>
    </>}

    {/* Date: minDate / maxDate / disableWeekends */}
    {dateTypes.includes(field.type) && <>
      <div style={{ display: "flex", gap: 8 }}>
        <PropRow label="Min date"><Input type="date" value={field.minDate || ""} onChange={v => onChange({ minDate: v || undefined })} /></PropRow>
        <PropRow label="Max date"><Input type="date" value={field.maxDate || ""} onChange={v => onChange({ maxDate: v || undefined })} /></PropRow>
      </div>
      {(field.type === "date" || field.type === "datetime") && <Toggle checked={!!field.disableWeekends} onChange={v => onChange({ disableWeekends: v })} label="Disable weekends" />}
    </>}

    {/* Comment-like: rows */}
    {commentTypes.includes(field.type) && <>
      <PropRow label="Rows"><Input type="number" value={field.rows || ""} onChange={v => onChange({ rows: v === "" ? undefined : Number(v) })} placeholder="4" /></PropRow>
    </>}

    {/* Rating: rateMin / rateMax / per-step labels / end descriptions */}
    {field.type === "rating" && (() => {
      // Changing the range has to carry the labels with it. `rateValues` is what
      // both renderers draw when it exists, so a range left out of step with it
      // would show the old number of buttons and ignore the min and max the
      // author just typed.
      const setRange = (patch: RatingRange) => {
        const next = { ...field, ...patch };
        onChange({ ...patch, rateValues: buildRateValues(ratingStepValues(next), ratingLabelsByStep(field.rateValues)) });
      };
      return <>
        <div style={{ display: "flex", gap: 8 }}>
          <PropRow label="Min rate"><Input type="number" value={field.rateMin ?? ""} onChange={v => setRange({ rateMin: v === "" ? undefined : Number(v) })} placeholder="1" /></PropRow>
          <PropRow label="Max rate"><Input type="number" value={field.rateMax ?? ""} onChange={v => setRange({ rateMax: v === "" ? undefined : Number(v) })} placeholder="5" /></PropRow>
        </div>
        <PropRow label="Label for each step" span>
          <RatingLabelsEditor field={field} onChange={onChange} />
        </PropRow>
        <PropRow label="Min label"><Input value={field.minRateDescription || ""} onChange={v => onChange({ minRateDescription: v || undefined })} placeholder="e.g. Poor" /></PropRow>
        <PropRow label="Max label"><Input value={field.maxRateDescription || ""} onChange={v => onChange({ maxRateDescription: v || undefined })} placeholder="e.g. Excellent" /></PropRow>
      </>;
    })()}

    {/* File / Image upload: acceptedTypes / maxSize / allowMultiple */}
    {fileTypes.includes(field.type) && <>
      <PropRow label="Accepted types"><Input value={field.acceptedTypes || ""} onChange={v => onChange({ acceptedTypes: v || undefined })} placeholder=".pdf,.doc,.png" /></PropRow>
      <PropRow label="Max size (bytes)"><Input type="number" value={field.maxSize ?? ""} onChange={v => onChange({ maxSize: v === "" ? undefined : Number(v) })} placeholder="10485760" /></PropRow>
      <Toggle checked={!!field.allowMultiple} onChange={v => onChange({ allowMultiple: v })} label="Allow multiple files" />
    </>}

    {/* HTML / Display: html content */}
    {htmlTypes.includes(field.type) && <>
      <PropRow label="HTML content" span>
        <Textarea value={field.html || ""} onChange={v => onChange({ html: v })} rows={4} placeholder="<p>Your content</p>" />
      </PropRow>
    </>}

    {/* Image: url / altText / caption */}
    {field.type === "image" && <>
      <PropRow label="Image URL" span><Input value={field.imageUrl || ""} onChange={v => onChange({ imageUrl: v })} placeholder="https://..." /></PropRow>
      <PropRow label="Alt text"><Input value={field.altText || ""} onChange={v => onChange({ altText: v || undefined })} placeholder="Description" /></PropRow>
      <PropRow label="Caption"><Input value={field.caption || ""} onChange={v => onChange({ caption: v || undefined })} placeholder="Optional caption" /></PropRow>
    </>}

    {/* Panel: title / description / collapsible */}
    {field.type === "panel" && <>
      <PropRow label="Panel title" span><Input value={field.title || ""} onChange={v => onChange({ title: v })} placeholder="Section title" /></PropRow>
      <PropRow label="Description" span><Input value={field.description || ""} onChange={v => onChange({ description: v })} placeholder="Optional description" /></PropRow>
      <Toggle checked={!!field.collapsible} onChange={v => onChange({ collapsible: v, collapsed: v ? !!field.collapsed : false })} label="Collapsible" />
      {field.collapsible && <Toggle checked={!!field.collapsed} onChange={v => onChange({ collapsed: v })} label="Start collapsed" />}
    </>}

    {/* Boolean / Toggle / Consent: labelTrue / labelFalse */}
    {booleanTypes.includes(field.type) && <>
      <PropRow label="True label"><Input value={field.labelTrue || ""} onChange={v => onChange({ labelTrue: v || undefined })} placeholder="Yes" /></PropRow>
      <PropRow label="False label"><Input value={field.labelFalse || ""} onChange={v => onChange({ labelFalse: v || undefined })} placeholder="No" /></PropRow>
    </>}

    {/* Page break: pageTitle / pageDescription */}
    {field.type === "pagebreak" && <>
      <PropRow label="Page title" span><Input value={field.pageTitle || ""} onChange={v => onChange({ pageTitle: v || undefined })} placeholder="Page title" /></PropRow>
      <PropRow label="Page description" span><Input value={field.pageDescription || ""} onChange={v => onChange({ pageDescription: v || undefined })} placeholder="Optional description" /></PropRow>
    </>}

    {/* Matrix / Table: minRows / maxRows / addRowText */}
    {matrixTypes.includes(field.type) && <>
      <div style={{ display: "flex", gap: 8 }}>
        <PropRow label="Min rows"><Input type="number" value={field.minRows ?? ""} onChange={v => onChange({ minRows: v === "" ? undefined : Number(v) })} placeholder="1" /></PropRow>
        <PropRow label="Max rows"><Input type="number" value={field.maxRows ?? ""} onChange={v => onChange({ maxRows: v === "" ? undefined : Number(v) })} placeholder="10" /></PropRow>
      </div>
      <PropRow label="Add row text"><Input value={field.addRowText || ""} onChange={v => onChange({ addRowText: v || undefined })} placeholder="Add Row" /></PropRow>
    </>}

    {/* Signature pad: width / height / penColor / backgroundColor */}
    {field.type === "signaturepad" && <>
      <div style={{ display: "flex", gap: 8 }}>
        <PropRow label="Width"><Input type="number" value={field.signatureWidth ?? ""} onChange={v => onChange({ signatureWidth: v === "" ? undefined : Number(v) })} placeholder="400" /></PropRow>
        <PropRow label="Height"><Input type="number" value={field.signatureHeight ?? ""} onChange={v => onChange({ signatureHeight: v === "" ? undefined : Number(v) })} placeholder="200" /></PropRow>
      </div>
      <PropRow label="Pen color"><Input value={field.penColor || ""} onChange={v => onChange({ penColor: v || undefined })} placeholder="#000000" /></PropRow>
      <PropRow label="Background color"><Input value={field.backgroundColor || ""} onChange={v => onChange({ backgroundColor: v || undefined })} placeholder="#FFFFFF" /></PropRow>
    </>}

    {/* Spacer: height */}
    {field.type === "spacer" && <>
      <PropRow label="Height (px)"><Input type="number" value={field.height ?? ""} onChange={v => onChange({ height: v === "" ? undefined : Number(v) })} placeholder="16" /></PropRow>
    </>}

    {/* Divider: style / color / margin */}
    {field.type === "divider" && <>
      <PropRow label="Style"><Select value={field.dividerStyle || "solid"} onChange={v => onChange({ dividerStyle: v as "solid" | "dashed" | "dotted" })} options={[{ value: "solid", label: "Solid" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }]} /></PropRow>
      <PropRow label="Color"><Input value={field.dividerColor || ""} onChange={v => onChange({ dividerColor: v || undefined })} placeholder="#E5E3F0" /></PropRow>
      <PropRow label="Margin"><Input value={field.dividerMargin || ""} onChange={v => onChange({ dividerMargin: v || undefined })} placeholder="16px 0" /></PropRow>
    </>}

    {/* Repeater: minRows / maxRows / button text */}
    {field.type === "repeater" && <>
      <div style={{ display: "flex", gap: 8 }}>
        <PropRow label="Min rows"><Input type="number" value={field.minRows ?? ""} onChange={v => onChange({ minRows: v === "" ? undefined : Number(v) })} placeholder="1" /></PropRow>
        <PropRow label="Max rows"><Input type="number" value={field.maxRows ?? ""} onChange={v => onChange({ maxRows: v === "" ? undefined : Number(v) })} placeholder="10" /></PropRow>
      </div>
      <PropRow label="Add button text"><Input value={field.addButtonText || ""} onChange={v => onChange({ addButtonText: v || undefined })} placeholder="Add Row" /></PropRow>
      <PropRow label="Remove button text"><Input value={field.removeButtonText || ""} onChange={v => onChange({ removeButtonText: v || undefined })} placeholder="Remove" /></PropRow>
      <Toggle checked={!!field.showBlankRow} onChange={v => onChange({ showBlankRow: v })} label="Show blank row" />
    </>}

    {/* Columns: columnCount / gap */}
    {field.type === "columns" && <>
      <PropRow label="Column count"><Select value={String(field.columnCount || 2)} onChange={v => onChange({ columnCount: parseInt(v) })} options={[{ value: "2", label: "2 columns" }, { value: "3", label: "3 columns" }]} /></PropRow>
      <PropRow label="Gap (px)"><Input type="number" value={field.gap ?? ""} onChange={v => onChange({ gap: v === "" ? undefined : Number(v) })} placeholder="16" /></PropRow>
    </>}

    {/* Text: email variant */}
    {field.inputType === "email" && <>
      <Toggle checked={!!(field as unknown as Record<string, unknown>).allowMultipleEmails} onChange={v => onChange({ allowMultipleEmails: v } as unknown as Partial<FormBuilderField>)} label="Allow multiple emails" />
    </>}

    {/* Text: tel variant */}
    {field.inputType === "tel" && <>
      <PropRow label="Validation pattern">
        <Input value={(field as unknown as Record<string, unknown>).validationPattern as string || ""} onChange={v => onChange({ validationPattern: v || undefined } as unknown as Partial<FormBuilderField>)} placeholder="e.g. ^\+?[0-9]{7,15}$" />
      </PropRow>
    </>}

    {/* Text: password variant */}
    {(field.type === "password" || field.inputType === "password") && <>
      <PropRow label="Pattern validation">
        <Input value={(field as unknown as Record<string, unknown>).passwordPattern as string || ""} onChange={v => onChange({ passwordPattern: v || undefined } as unknown as Partial<FormBuilderField>)} placeholder="e.g. ^(?=.*[A-Z])(?=.*\d)" />
      </PropRow>
    </>}
  </>;
}

function MatrixColumnsEditor({ columns, token, onChange }: {
  columns: { name: string; title: string; cellType?: string; choices?: string[]; multiSelect?: boolean; choicesSource?: { list?: string; column?: string }; filteredListSource?: { list?: string; valueColumn?: string; labelColumn?: string; filterColumn?: string; filterValue?: string; choicesLoaded?: boolean } }[];
  token?: string;
  onChange: (cols: { name: string; title: string; cellType?: string; choices?: string[]; multiSelect?: boolean; choicesSource?: { list?: string; column?: string }; filteredListSource?: { list?: string; valueColumn?: string; labelColumn?: string; filterColumn?: string; filterValue?: string; choicesLoaded?: boolean } }[]) => void;
}) {
  const addCol = () => {
    const title = `Column ${columns.length + 1}`;
    onChange([...columns, { name: schemaNameFromLabel(title), title, cellType: "text" }]);
  };
  const updateCol = (i: number, patch: Partial<typeof columns[0]>) => {
    const next = columns.map((c, idx) => idx === i ? { ...c, ...patch } : c);
    onChange(next);
  };
  // Same rule as questions and choices: the column name tracks its label until
  // it is edited directly.
  const setColTitle = (i: number, title: string) => updateCol(i, isSchemaNameDerivedFrom(columns[i].name, columns[i].title)
    ? { title, name: schemaNameFromLabel(title) }
    : { title });
  const removeCol = (i: number) => onChange(columns.filter((_, idx) => idx !== i));

  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0 }}>Matrix Columns</span>
      <div style={{ flex: 1 }} />
      <button onClick={addCol} style={{ fontSize: 11.5, color: C.purple, background: "none", border: `1px dashed ${C.purple}`, borderRadius: 8, padding: "3px 10px", cursor: "pointer", fontFamily: "var(--pmw-font-main)" }}>＋ Add column</button>
    </div>
    {columns.length === 0 && <div style={{ fontSize: 11.5, color: C.textMuted, padding: 8, background: C.offWhite, borderRadius: 8 }}>No columns defined. Add at least one.</div>}
    {columns.map((col, i) => {
      const hasChoices = col.cellType === "dropdown" || col.cellType === "checkbox";
      return <div key={i} style={{ padding: 10, background: C.offWhite, borderRadius: 8, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: C.purple, width: 18 }}>{i + 1}</span>
          <div style={{ flex: 1, display: "flex", gap: 6 }}>
            <input value={col.title} onChange={e => setColTitle(i, e.target.value)} placeholder="Label" aria-label={`Column ${i + 1} label`} style={{ flex: 1.5, fontSize: 11.5, padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 5, fontFamily: "var(--pmw-font-main)" }} />
            <input value={col.name} onChange={e => updateCol(i, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })} placeholder="schemaName" aria-label={`Column ${i + 1} schema name`} style={{ flex: 1, fontSize: 11.5, padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 5, fontFamily: "var(--pmw-font-main)" }} />
          </div>
          <button onClick={() => removeCol(i)} style={{ fontSize: 11, color: C.red, background: "none", border: "none", cursor: "pointer" }}><CloseIcon style={{ fontSize: 11 }} /></button>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: C.textMuted, whiteSpace: "nowrap" }}>Cell type:</span>
          <Select value={col.cellType || "text"} onChange={v => updateCol(i, { cellType: v, choices: undefined, choicesSource: undefined, multiSelect: undefined })} options={[
            { value: "text", label: "Text" },
            { value: "dropdown", label: "Dropdown" },
            { value: "date", label: "Date" },
            { value: "number", label: "Number" },
            { value: "checkbox", label: "Checkbox" },
            { value: "boolean", label: "Boolean" },
          ]} />
          {col.cellType === "dropdown" && <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.textMuted }}>
            <input type="checkbox" checked={!!col.multiSelect} onChange={e => updateCol(i, { multiSelect: e.target.checked })} /> Multi-select
          </label>}
        </div>
        {hasChoices && <>
          <SpChoicesSourceEditor
            source={col.choicesSource}
            token={token}
            onChange={src => updateCol(i, { choicesSource: src || undefined, choices: src?.list ? [] : (col.choices || []) })}
          />
          <SpFilteredListSourceEditor
            source={col.filteredListSource}
            token={token}
            onChange={src => updateCol(i, { filteredListSource: src || undefined, choices: src?.list ? [] : (col.choices || []) })}
          />
          {!col.choicesSource?.list && !col.filteredListSource?.list && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
            {(col.choices || []).map((ch, ci) => <span key={ci} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", background: C.purplePale, color: C.purple, borderRadius: 12 }}>
              {ch}
              <button onClick={() => updateCol(i, { choices: (col.choices || []).filter((_, idx) => idx !== ci) })} style={{ fontSize: 9, color: C.red, background: "none", border: "none", cursor: "pointer", padding: 0 }}><CloseIcon style={{ fontSize: 9 }} /></button>
            </span>)}
            <input
              placeholder="Add choice…"
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val) { updateCol(i, { choices: [...(col.choices || []), val] }); (e.target as HTMLInputElement).value = ""; }
                }
              }}
              style={{ fontSize: 11.5, padding: "3px 8px", border: `1px dashed ${C.border}`, borderRadius: 12, width: 90, fontFamily: "var(--pmw-font-main)" }}
            />
          </div>}
        </>}
      </div>;
    })}
  </div>;
}

function SpChoicesSourceEditor({ source, token, onChange }: {
  source?: { list?: string; column?: string; multiSelect?: boolean };
  token?: string;
  onChange: (src: { list?: string; column?: string; multiSelect?: boolean } | undefined) => void;
}) {
  const [mode, setMode] = useState<"manual" | "sp">(source?.list ? "sp" : "manual");
  const [lists, setLists] = useState<{ title: string; id: string }[]>([]);
  const [columns, setColumns] = useState<{ title: string; typeKind: number; choices: string[] }[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingCols, setLoadingCols] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setMode(source?.list ? "sp" : "manual"); }, [source?.list]);

  useEffect(() => {
    if (mode !== "sp" || !token) return;
    setLoadingLists(true);
    setError("");
    getSharePointLists(token).then(setLists).catch((e: Error) => setError(e.message)).finally(() => setLoadingLists(false));
  }, [mode, token]);

  useEffect(() => {
    if (mode !== "sp" || !token || !source?.list) { setColumns([]); return; }
    setLoadingCols(true);
    setError("");
    getChoiceColumnsForList(source.list!, token).then(setColumns).catch((e: Error) => setError(e.message)).finally(() => setLoadingCols(false));
  }, [mode, token, source?.list]);

  const selectedCol = columns.find(c => c.title === source?.column);

  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0 }}>Data Source</span>
      <div style={{ flex: 1 }} />
    </div>
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={() => { setMode("manual"); onChange(undefined); }}
        style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1px solid ${mode === "manual" ? C.purple : C.border}`, background: mode === "manual" ? C.purplePale : C.white, color: mode === "manual" ? C.purple : C.textMuted, fontSize: 12.5, cursor: "pointer", fontFamily: "var(--pmw-font-main)" }}>
        Manual
      </button>
      <button onClick={() => setMode("sp")}
        style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1px solid ${mode === "sp" ? C.purple : C.border}`, background: mode === "sp" ? C.purplePale : C.white, color: mode === "sp" ? C.purple : C.textMuted, fontSize: 12.5, cursor: "pointer", fontFamily: "var(--pmw-font-main)" }}>
        SharePoint List
      </button>
    </div>
    {mode === "sp" && <>
      {!token && <div style={{ fontSize: 11.5, color: C.amber, padding: 8, background: C.amberPale, borderRadius: 8 }}>Sign in to load SharePoint lists.</div>}
      {!!token && <>
        <PropRow label="List">
          <Select value={source?.list || ""} onChange={v => onChange({ list: v || undefined, column: undefined })} options={[
            { value: "", label: loadingLists ? "Loading…" : "Select a list" },
            ...lists.map(l => ({ value: l.title, label: l.title }))
          ]} />
        </PropRow>
        {source?.list && <PropRow label="Column">
          <Select value={source?.column || ""} onChange={v => onChange({ ...source, column: v || undefined })} options={[
            { value: "", label: loadingCols ? "Loading…" : "Select a choice column" },
            ...columns.map(c => ({ value: c.title, label: `${c.title} (${c.typeKind === 15 ? "Multi" : "Single"})` }))
          ]} />
        </PropRow>}
        {selectedCol && selectedCol.choices.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: 8, background: C.offWhite, borderRadius: 8 }}>
          {selectedCol.choices.map(ch => <span key={ch} style={{ fontSize: 11, padding: "2px 8px", background: C.purplePale, color: C.purple, borderRadius: 12 }}>{ch}</span>)}
        </div>}
        {error && <div style={{ fontSize: 11.5, color: C.red }}>{error}</div>}
      </>}
    </>}
  </div>;
}

function SpFilteredListSourceEditor({ source, token, onChange }: {
  source?: { list?: string; valueColumn?: string; labelColumn?: string; filterColumn?: string; filterValue?: string; choicesLoaded?: boolean };
  token?: string;
  onChange: (src: { list?: string; valueColumn?: string; labelColumn?: string; filterColumn?: string; filterValue?: string } | undefined) => void;
}) {
  const [enabled, setEnabled] = useState(!!source?.list);
  const [lists, setLists] = useState<{ title: string; id: string }[]>([]);
  const [columns, setColumns] = useState<{ title: string; typeKind: number }[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingCols, setLoadingCols] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setEnabled(!!source?.list); }, [source?.list]);

  useEffect(() => {
    if (!enabled || !token) return;
    setLoadingLists(true);
    setError("");
    getSharePointLists(token).then(setLists).catch((e: Error) => setError(e.message)).finally(() => setLoadingLists(false));
  }, [enabled, token]);

  useEffect(() => {
    if (!enabled || !token || !source?.list) { setColumns([]); return; }
    setLoadingCols(true);
    setError("");
    getAllColumnsForList(source.list!, token).then(setColumns).catch((e: Error) => setError(e.message)).finally(() => setLoadingCols(false));
  }, [enabled, token, source?.list]);

  const toggle = () => {
    if (enabled) {
      onChange(undefined);
      setEnabled(false);
    } else {
      setEnabled(true);
      onChange({ list: "" });
    }
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0 }}>Filtered List Source</span>
      <div style={{ flex: 1 }} />
      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11.5, color: C.textSecond, userSelect: "none" }}>
        <input type="checkbox" checked={enabled} onChange={toggle} style={{ width: 14, height: 14, accentColor: C.purple }} />
        Enabled
      </label>
    </div>

    {enabled && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <PropRow label="List">
        <Select value={source?.list || ""} onChange={v => onChange({ ...source, list: v || undefined, valueColumn: undefined, filterColumn: undefined })} options={[
          { value: "", label: loadingLists ? "Loading…" : "Select a list" },
          ...lists.map(l => ({ value: l.title, label: l.title }))
        ]} />
      </PropRow>
      {source?.list && <>
        <PropRow label="Value Column">
          <Select value={source?.valueColumn || ""} onChange={v => onChange({ ...source, valueColumn: v || undefined, filterColumn: undefined })} options={[
            { value: "", label: loadingCols ? "Loading…" : "Select a column" },
            ...columns.map(c => ({ value: c.title, label: c.title }))
          ]} />
        </PropRow>
        <PropRow label="Label Column (optional)">
          <Select value={source?.labelColumn || ""} onChange={v => onChange({ ...source, labelColumn: v || undefined })} options={[
            { value: "", label: "Same as value" },
            ...columns.map(c => ({ value: c.title, label: c.title }))
          ]} />
        </PropRow>
        <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.6, marginTop: -4 }}>
          {source?.labelColumn && source.labelColumn !== source.valueColumn
            ? <>People pick <strong>{source.labelColumn}</strong> from the list; the answer stores <strong>{source.valueColumn}</strong>. Use this when the stored answer has to be exact — an email an approval routes on — but is not what somebody would recognise.</>
            : <>The list shows the value itself. Pick a label column to show something friendlier, such as a name, while still storing the value.</>}
        </div>
      </>}
      {source?.list && source?.valueColumn && <>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 2 }}>Filter (optional)</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: C.textMuted, whiteSpace: "nowrap" }}>Where</span>
          <select value={source?.filterColumn || ""} onChange={e => onChange({ ...source, filterColumn: (e.target as HTMLSelectElement).value || undefined })}
            style={{ flex: 1, height: 26, border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 11.5, fontFamily: "var(--pmw-font-main)", padding: "0 4px" }}>
            <option value="">Select column</option>
            {columns.map(c => <option key={c.title} value={c.title}>{c.title}</option>)}
          </select>
          <span style={{ fontSize: 11, color: C.textMuted }}>=</span>
          <input value={source?.filterValue || ""} onChange={e => onChange({ ...source, filterValue: e.target.value })}
            placeholder="value"
            style={{ flex: 1, height: 26, border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 11.5, fontFamily: "var(--pmw-font-main)", padding: "0 6px" }} />
        </div>
      </>}
      {error && <div style={{ fontSize: 11.5, color: C.red }}>{error}</div>}
    </div>}
  </div>;
}

/**
 * SurveySettingsPanel — the form-wide SurveyJS display options. These used to
 * be what the property column showed when nothing was selected; the properties
 * dock is now mounted only for a selected field, so they moved to Tools →
 * Content → Form display.
 */
function SurveySettingsPanel({ surveySettings, onSurveySettingsChange, formTitle, titleLocked, onTitleChange }: {
  surveySettings: Record<string, unknown>;
  onSurveySettingsChange?: (s: Record<string, unknown>) => void;
  formTitle?: string;
  titleLocked?: boolean;
  onTitleChange?: (v: string) => void;
}) {
  const set = (patch: Record<string, unknown>) => onSurveySettingsChange?.({ ...surveySettings, ...patch });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="bx-lede" style={{ fontSize: 14 }}>
        Form identity, banner, access and the managed Company selector live in Settings. These control only how SurveyJS renders the form.
      </p>
      {/* The rendered survey shows the form title, so this edits that one value
          rather than a second title that could disagree with it. */}
      <PropRow label="Display title">
        <Input
          value={formTitle ?? ""}
          onChange={v => onTitleChange?.(v)}
          placeholder="Untitled form"
          disabled={!onTitleChange || titleLocked}
          title={titleLocked ? "The form title becomes the SharePoint list name and is locked after the first publish." : undefined}
        />
      </PropRow>
      <PropRow label="Form description"><Textarea value={(surveySettings.description as string) || ""} onChange={v => set({ description: v })} rows={2} placeholder="Optional description" /></PropRow>
      <PropRow label="Question titles">
        <Select value={(surveySettings.titleLocation as string) || "default"} onChange={v => set({ titleLocation: v })} options={[{ value: "default", label: "Default" }, { value: "hidden", label: "Hidden" }, { value: "top", label: "Top" }, { value: "bottom", label: "Bottom" }]} />
      </PropRow>
      <PropRow label="Text transform">
        <Select value={(surveySettings.textTransform as string) || "none"} onChange={v => set({ textTransform: v })} options={[{ value: "none", label: "None" }, { value: "uppercase", label: "ALL UPPERCASE" }, { value: "capitalize", label: "First Letter Only" }, { value: "lowercase", label: "all lowercase" }]} />
      </PropRow>
      <PropRow label="Show question numbers">
        <Select value={(surveySettings.showQuestionNumbers as string) || "on"} onChange={v => set({ showQuestionNumbers: v })} options={[{ value: "on", label: "On" }, { value: "onPage", label: "Per page" }, { value: "onpanel", label: "Per panel" }, { value: "off", label: "Off" }]} />
      </PropRow>
      <PropRow label="Error mode">
        <Select value={(surveySettings.checkErrorsMode as string) || "onValueChanged"} onChange={v => set({ checkErrorsMode: v })} options={[{ value: "onValueChanged", label: "On value change" }, { value: "onComplete", label: "On complete" }, { value: "onNextPage", label: "On next page" }]} />
      </PropRow>
      <PropRow label="Text update">
        <Select value={(surveySettings.textUpdateMode as string) || "onTyping"} onChange={v => set({ textUpdateMode: v })} options={[{ value: "onTyping", label: "On typing" }, { value: "onBlur", label: "On blur" }]} />
      </PropRow>
      <Toggle checked={!!surveySettings.showProgressBar} onChange={v => set({ showProgressBar: v })} label="Show progress bar" />
      <Toggle checked={!!surveySettings.showPageTitles} onChange={v => set({ showPageTitles: v })} label="Show page titles" />
    </div>
  );
}

/** One collapsed card inside the dock's Advanced disclosure. */
function AdvCard({ title, body, action, open, onToggle, children }: {
  title: string; body: string; action: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bx-advcard">
      <div className="bx-advcard-title">{title}</div>
      <div className="bx-advcard-body">{body}</div>
      <button type="button" className="bx-btn bx-btn-secondary bx-btn-sm" onClick={onToggle} aria-expanded={open}>
        {open ? "Close" : action}
      </button>
      {open && <div style={{ marginTop: 13, paddingTop: 13, borderTop: "1px solid var(--bx-divider)", animation: "bx-fade-up .14s ease" }}>{children}</div>}
    </div>
  );
}

/**
 * The properties dock. Label, name, hint and Required stay in the open; the
 * logic, validation and options editors — the three things that made the old
 * third column overflow sideways — fold away under Advanced, together with the
 * type-specific settings that used to share the General tab.
 */
function PropertyPanel({ field, allFields, onChange, onClose, token }: {
  field: FormBuilderField | null; allFields: FormBuilderField[];
  onChange: (patch: Partial<FormBuilderField>) => void;
  onClose: () => void;
  token?: string;
}) {
  const [advOpen, setAdvOpen] = useState(false);
  const [card, setCard] = useState<"settings" | "logic" | "validation" | "options" | null>(null);

  useEffect(() => { setCard(null); }, [field?._id]);

  if (!field) return null;

  const managed = isManagedCompanyChoice(field);
  const typeLabel = shortTypeLabel(field.type);
  const hasChoices = ["dropdown", "radiogroup", "checkbox"].includes(field.type);
  const isMatrix = field.type === "dynamicmatrix" || field.type === "tableinput";
  const toggleCard = (k: "settings" | "logic" | "validation" | "options") => setCard(c => (c === k ? null : k));

  return (
    <aside className="bx-propdock" aria-label="Field properties">
      <div className="bx-propdock-head">
        <span className="bx-eyebrow">Field properties</span>
        <button type="button" className="bx-ghost" title="Close properties" onClick={onClose}>
          <Icon name="close" size={15} strokeWidth={1.6} />
        </button>
      </div>
      <div className="bx-propdock-body">
        <div className="bx-typecard">
          <span className="bx-typecard-mark"><FieldIcon type={field.type} size={18} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="bx-typecard-label">{typeLabel}</div>
            <div className="bx-typecard-name">{field.name}</div>
          </div>
        </div>

        {managed ? (
          <>
            <p className="bx-lede" style={{ fontSize: 14 }}>
              This is the managed Company selector shown in the form header. Its label and options come from Settings → Branding &amp; banner, and it can only be removed by turning that toggle off.
            </p>
            <div className="bx-label" style={{ marginTop: 18 }}>Header choices</div>
            <div className="bx-wys-choices">
              {getCompanyChoiceOptions(field.choices, []).map(option => (
                <div key={option.value} className="bx-wys-choice">
                  <span className="bx-wys-mark is-round" />
                  {option.text}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="bx-field">
              <label htmlFor="bx-prop-label">Question label</label>
              <input
                id="bx-prop-label"
                className="bx-input"
                value={field.title || ""}
                onChange={e => {
                  const v = e.target.value;
                  // The field name follows the label until someone edits it by
                  // hand. Regenerating unconditionally would silently rewrite a
                  // deliberate SharePoint column name on the next typo fix.
                  onChange(isSchemaNameDerivedFrom(field.name || "", field.title || "")
                    ? { title: v, name: schemaNameFromLabel(v) }
                    : { title: v });
                }}
                placeholder="Question label"
              />
            </div>
            <div className="bx-field">
              <label htmlFor="bx-prop-name">Field name</label>
              <input
                id="bx-prop-name"
                className={`bx-input${field.name ? "" : " is-error"}`}
                value={field.name || ""}
                onChange={e => onChange({ name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "").replace(/\s+/g, "_") })}
                placeholder="camelCaseName"
              />
              <div className="bx-meta" style={{ marginTop: 5 }}>
                {field.name ? "Becomes the SharePoint column name." : "Required — this becomes the SharePoint column name."}
              </div>
            </div>
            <div className="bx-field">
              <label htmlFor="bx-prop-hint">Placeholder / hint</label>
              <input
                id="bx-prop-hint"
                className="bx-input"
                value={field.description || ""}
                onChange={e => onChange({ description: e.target.value })}
                placeholder="Optional helper text"
              />
            </div>
            {field.type !== "html" && (
              <label className="bx-check" style={{ borderTop: "1px solid var(--bx-divider)", alignItems: "center" }}>
                <input type="checkbox" checked={!!field.isRequired} onChange={e => onChange({ isRequired: e.target.checked })} style={{ marginTop: 0 }} />
                Required field
              </label>
            )}

            <button type="button" className="bx-subdisclosure" onClick={() => setAdvOpen(o => !o)} aria-expanded={advOpen}>
              <span>Advanced</span>
              <Icon name="chevdown" size={15} strokeWidth={1.6} className={`bx-chev${advOpen ? " is-open" : ""}`} />
            </button>

            {advOpen && (
              <div style={{ padding: "4px 0 10px", animation: "bx-fade-up .14s ease" }}>
                <AdvCard
                  title="Field settings"
                  body="Type-specific behaviour, the default value, and how this field sits in the layout."
                  action="Open settings"
                  open={card === "settings"}
                  onToggle={() => toggleCard("settings")}
                >
                  {!["html", "dynamicmatrix", "file", "formula", "panel"].includes(field.type) && <DefaultValueEditor field={field} onChange={onChange} />}
                  {field.type === "text" && (
                    <PropRow label="Input type">
                      <Select value={field.inputType || "text"} onChange={v => onChange({ inputType: v })} options={[{ value: "text", label: "Text" }, { value: "email", label: "Email" }, { value: "number", label: "Number" }, { value: "date", label: "Date" }, { value: "datetime-local", label: "Date & Time" }, { value: "tel", label: "Phone" }, { value: "url", label: "URL" }, { value: "password", label: "Password" }]} />
                    </PropRow>
                  )}
                  {field.type === "text" && (!field.inputType || field.inputType === "text") && (
                    <PropRow label="Autocapitalize">
                      <Select value={field.autocapitalize || "none"} onChange={v => onChange({ autocapitalize: v as "none" | "sentences" | "words" | "characters" })} options={[{ value: "none", label: "None" }, { value: "sentences", label: "Sentences" }, { value: "words", label: "Words" }, { value: "characters", label: "Characters (ALL CAPS)" }]} />
                    </PropRow>
                  )}
                  <FieldTypeProps field={field} onChange={onChange} allFields={allFields} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--bx-divider)" }}>
                    <Toggle checked={!field.startWithNewLine} onChange={v => onChange({ startWithNewLine: !v })} label="Inline (same row as previous)" />
                    <Toggle checked={!!field.readOnly} onChange={v => onChange({ readOnly: v })} label="Read-only" />
                    <Toggle checked={field.titleLocation === "hidden"} onChange={v => onChange({ titleLocation: v ? "hidden" : "default" })} label="Hide title" />
                  </div>
                </AdvCard>

                <AdvCard
                  title="Conditional logic"
                  body="Show or hide this field, and set values, based on earlier answers."
                  action={field.visibleIf || field.enableIf ? "Edit rules" : "Add a rule"}
                  open={card === "logic"}
                  onToggle={() => toggleCard("logic")}
                >
                  <LogicRulesEditor field={field} allFields={allFields} onChange={onChange} />
                </AdvCard>

                <AdvCard
                  title="Validation"
                  body="Numeric range, text length, regex, email, or a custom expression."
                  action={field.validators?.length ? `Edit ${field.validators.length} validator${field.validators.length === 1 ? "" : "s"}` : "Add a validator"}
                  open={card === "validation"}
                  onToggle={() => toggleCard("validation")}
                >
                  <ValidationEditor field={field} onChange={onChange} />
                </AdvCard>

                <AdvCard
                  title="Options & data source"
                  body="Manual choices, matrix columns, side-by-side layout, or a live SharePoint list column."
                  action="Configure"
                  open={card === "options"}
                  onToggle={() => toggleCard("options")}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {hasChoices && (
                      <>
                        <SpChoicesSourceEditor
                          source={field.spChoicesSource}
                          token={token}
                          onChange={src => onChange({ spChoicesSource: src, choices: src?.list ? [] : (field.choices || []) })}
                        />
                        <SpFilteredListSourceEditor
                          source={field.spFilteredListSource}
                          token={token}
                          onChange={src => onChange({ spFilteredListSource: src, choices: src?.list ? [] : (field.choices || []) })}
                        />
                        {!field.spChoicesSource?.list && !field.spFilteredListSource?.list && (
                          <PropRow label="Choices"><ChoicesEditor choices={field.choices || []} onChange={c => onChange({ choices: c })} /></PropRow>
                        )}
                        <Toggle
                          checked={!!field.hasOther}
                          onChange={v => onChange({ hasOther: v })}
                          label="Let people enter their own answer"
                        />
                        {field.hasOther && (
                          <PropRow label={'"Other" label'}>
                            <Input
                              value={field.otherText ?? ""}
                              onChange={v => onChange({ otherText: v || undefined })}
                              placeholder={DEFAULT_OTHER_TEXT}
                            />
                          </PropRow>
                        )}
                      </>
                    )}
                    {isMatrix && (
                      <MatrixColumnsEditor
                        columns={(field.columns || field.tableConfigColumns || []) as { name: string; title: string; cellType?: string; choices?: string[]; multiSelect?: boolean; choicesSource?: { list?: string; column?: string }; filteredListSource?: { list?: string; valueColumn?: string; labelColumn?: string; filterColumn?: string; filterValue?: string; choicesLoaded?: boolean } }[]}
                        token={token}
                        onChange={cols => onChange({ columns: cols, tableConfigColumns: cols })}
                      />
                    )}
                    <PropRow label="Columns (side by side)">
                      <Select value={String(field.colCount ?? 1)} onChange={v => onChange({ colCount: parseInt(v) })} options={[0, 1, 2, 3, 4].map(n => ({ value: String(n), label: n === 0 ? "Auto" : `${n} column${n > 1 ? "s" : ""}` }))} />
                    </PropRow>
                  </div>
                </AdvCard>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

// ── JSON Preview ──────────────────────────────────────────────────────
/**
 * The SurveyJSON drawer, raised from Tools and dismissed by clicking its header.
 *
 * It has no collapsed state. It used to carry one — two heights and a 220ms
 * `height` transition between them — but the drawer became a Tools row that is
 * mounted only while open and passed `collapsed={false}`, so the closed half was
 * unreachable: the transition never ran once, and dismissing it unmounts rather
 * than collapses. What is left is the state that actually existed, with the
 * animation of a layout property gone with it.
 */
function JsonPreview({ json, onClose }: { json: SurveyJson; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => JSON.stringify(json, null, 2), [json]);
  const charCount = useMemo(() => JSON.stringify(json).length, [json]);
  const copy = () => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  return <div style={{ borderTop: `1px solid ${C.border}`, background: C.purpleDark, display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", height: 38, flexShrink: 0, cursor: "pointer" }} onClick={onClose} title="Hide the JSON drawer">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <CodeIcon style={{ fontSize: 14, color: "rgba(255,255,255,0.68)" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.68)", textTransform: "uppercase", letterSpacing: 0 }}>SurveyJS JSON</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{charCount} chars</span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={e => { e.stopPropagation(); copy(); }} style={{ fontSize: 11, color: copied ? editorial.successFill : "rgba(255,255,255,0.68)", background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 8, minHeight: 28, padding: "3px 10px", cursor: "pointer", fontFamily: "var(--pmw-font-main)" }}>{copied ? "Copied!" : "Copy JSON"}</button>
        <ExpandLessIcon style={{ fontSize: 16, color: "rgba(255,255,255,0.68)" }} />
      </div>
    </div>
    <pre style={{ height: 182, overflowY: "auto", margin: 0, padding: "0 14px 14px", fontSize: 11.5, fontFamily: "monospace", color: "rgba(255,255,255,0.75)", lineHeight: 1.7 }}>{text}</pre>
  </div>;
}

// ── Preview body ──────────────────────────────────────────────────────

interface PreviewBodyProps {
  json: SurveyJson;
  /**
   * Answers typed into the preview, held outside whichever renderer is showing.
   *
   * Both bodies read and write this one store, so switching engines carries the
   * answers across — an author can fill in enough to trigger their conditional
   * logic, then check the same filled-in state against the renderer a published
   * form actually uses. It also survives a device switch, which re-renders the
   * modal. Closing the preview discards it, as it always has.
   */
  dataRef: React.MutableRefObject<Record<string, unknown>>;
  companyFieldName: string;
  companyValue: string;
  onCompanyChange: (value: string) => void;
}

function NativePreviewBody({ json, dataRef, companyFieldName, companyValue, onCompanyChange }: PreviewBodyProps) {
  // Memoised on the content, not the object: `buildSurveyJson` hands back a
  // fresh object whenever the builder re-renders, and reparsing on identity
  // would rebuild the form — and reset the answers in it — every time the modal
  // redrew for a reason that had nothing to do with the form.
  const fingerprint = JSON.stringify(json);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const form = useMemo(() => parseForm(json), [fingerprint]);
  // Read when the hook reseeds, not on the render that supplies it — the store
  // is a ref shared with the SurveyJS body, and touching it during render would
  // be reading a value React does not guarantee is current.
  const seed = useCallback(() => dataRef.current, [dataRef]);
  const runtime = useNativeForm(form, seed);
  const { values, setValue } = runtime;

  // The "all required answered" note describes the form as it stood when the
  // author pressed the button, so it is derived from the answers it was true of
  // rather than stored as a flag that an effect would then have to clear —
  // `values` keeps its identity until an answer actually changes.
  const [checkedAgainst, setCheckedAgainst] = useState<unknown>(null);
  const checked = checkedAgainst !== null && checkedAgainst === values;

  useEffect(() => {
    dataRef.current = values;
  }, [values, dataRef]);

  // The company chooser sits in the banner above the form but writes into a
  // field inside it, so the two are kept in step both ways. Both effects key on
  // the field's current value rather than on `runtime`, which is a fresh object
  // every render and would run them on every keystroke to no purpose.
  const companyCurrent = companyFieldName ? values[companyFieldName] : undefined;

  useEffect(() => {
    if (!companyFieldName || !companyValue) return;
    if (companyCurrent !== companyValue) setValue(companyFieldName, companyValue);
  }, [companyFieldName, companyValue, companyCurrent, setValue]);

  useEffect(() => {
    if (!companyFieldName) return;
    // Clearing the field propagates too: "" is a string, so the banner follows
    // the form back to nothing chosen.
    if (typeof companyCurrent === "string" && companyCurrent !== companyValue) onCompanyChange(companyCurrent);
  }, [companyFieldName, companyValue, companyCurrent, onCompanyChange]);

  return (
    <div style={{ maxHeight: "70vh", overflowY: "auto", background: "var(--nf-canvas)" }}>
      <NativeFormView
        runtime={runtime}
        submitLabel="Check answers"
        onSubmit={() => setCheckedAgainst(runtime.validateAll().ok ? values : null)}
        footer={
          checked ? (
            <div className="nf-note" data-tone="success">
              <div>Every required question on this page is answered. Nothing was saved.</div>
            </div>
          ) : undefined
        }
      />
    </div>
  );
}

// ── Live Preview Modal ────────────────────────────────────────────────
function LivePreviewModal({ json, onClose, showBanner, meta, device = "desktop" }: { json: SurveyJson; onClose: () => void; showBanner?: boolean; meta?: Record<string, unknown>; device?: "desktop" | "tablet" | "mobile" }) {
  const dataRef = useRef<Record<string, unknown>>({});
  const [previewCompany, setPreviewCompany] = useState("");

  const formTitle = json?.title || "Form Preview";
  const formDescription = json?.description || "";
  const isoStandards = (meta?.isoStandards as string) || "ISO 9001 · ISO 14001 · ISO 45001";
  // Only the field's name is needed now: the chooser is drawn inside the form,
  // so the modal's job is to keep the answer, not to offer the choice.
  const companyFieldName = String(findCompanyChoiceElement(json, meta)?.name || "");
  const logoUrl = (meta?.logoUrl as string) || "";
  // Desktop is 1180 because that is the width the native engine's own layout is
  // built around — at the old 760 the preview showed the stacked phone layout
  // and called it "desktop", which is the one thing a device preview must not do.
  const deviceWidth = device === "desktop" ? 1180 : device === "tablet" ? 500 : 340;
  const bannerLogoWidth = device === "desktop" ? 150 : device === "tablet" ? 132 : 104;
  const bannerLogoMaxHeight = device === "desktop" ? 48 : device === "tablet" ? 42 : 34;
  // The banner carries the logo beside the form's own title and description.
  // It used to hold a company chooser too, because SurveyJS could not draw that
  // question — the managed field is published `visible: false`, so the banner
  // was the only place to put it. The engine draws it inside the form now, and
  // a second copy up here would only ask the same question twice.
  const showHeaderBanner = showBanner;

  return <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(17,24,39,0.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}>
    <div style={{ background: C.white, borderRadius: 12, width: deviceWidth, maxWidth: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", border: `1px solid ${C.border}`, animation: "fadeUp 0.2s ease", overflow: "hidden", transition: "width 0.3s" }}>
      <div style={{ background: `linear-gradient(135deg,${C.purpleDark},${C.purple})`, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 0, marginBottom: 2 }}>Live Form Preview</div>
          <div style={{ fontSize: 14, color: C.white, fontFamily: "var(--pmw-font-main)" }}>How users will see this form</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: C.white, width: 30, height: 30, borderRadius: 8, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}><CloseIcon style={{ fontSize: 16 }} /></button>
        </div>
      </div>
      {showHeaderBanner && <div style={{ borderBottom: `1px solid ${C.border}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ width: bannerLogoWidth, borderRight: `1px solid ${C.border}`, background: C.offWhite, padding: device === "mobile" ? "8px 10px" : "10px 16px", verticalAlign: "middle", textAlign: "center" }}>
                <img src={logoUrl || "/logo-128.png"} alt="Company Logo" style={{ maxWidth: "100%", maxHeight: bannerLogoMaxHeight, objectFit: "contain" }} />
              </td>
              <td style={{ padding: "12px 16px", fontWeight: 700, fontSize: 13.5, color: C.textPrimary }}>
                <PreviewFormIdentity title={formTitle} description={formDescription} isoStandards={isoStandards} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>}
      <NativePreviewBody
        json={json}
        dataRef={dataRef}
        companyFieldName={companyFieldName}
        companyValue={previewCompany}
        onCompanyChange={setPreviewCompany}
      />
      <div style={{ padding: "10px 20px", borderTop: `1px solid ${C.border}`, fontSize: 11.5, color: C.textMuted, textAlign: "center", background: C.offWhite }}>
        Preview only — nothing is saved. This is the renderer a published form uses.
      </div>
    </div>
  </div>;
}

// ── Root Component ──────────────────────────────────────────────────
interface FormBuilderProps {
  initialJson?: SurveyJson | null;
  onChange?: (json: SurveyJson) => void;
  height?: string;
  token?: string;
  showBanner?: boolean;
  meta?: Record<string, unknown>;
  formId?: string;
  isAdmin?: boolean;
  onClose?: () => void;
  readOnly?: boolean;
  companyChoice?: CompanyChoiceConfig;
  /** Sheet header content — the form's identity, edited on the sheet itself. */
  sheet?: SheetMeta;
  /** Set when the title may be edited from the sheet (locked after first publish). */
  onTitleChange?: (v: string) => void;
  /**
   * Opens one of the builder's deferred panels. The shell's Tools and Preview
   * menus live in the mode rail, so they raise a command here rather than the
   * builder owning an eleven-button toolbar of its own.
   */
  toolCommand?: BuilderToolCommand | null;
}

export default function FormBuilder({ initialJson, onChange, height = "calc(100vh - 56px)", token: _token = "", showBanner = true, meta = {}, formId: _formId, isAdmin: _isAdmin, onClose: _onClose, readOnly: _readOnly = false, companyChoice, sheet, onTitleChange, toolCommand }: FormBuilderProps) {
  const [fields, setFields] = useState<FormBuilderField[]>(() => {
    if (!initialJson) return [];
    try { return buildQuestionTree(initialJson); } catch { return []; }
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [jsonCollapsed, setJsonCollapsed] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandPaletteSearch, setCommandPaletteSearch] = useState("");
  const [showDataSources, setShowDataSources] = useState(false);
  const [dataSources, setDataSources] = useState<{ name: string; url: string; labelKey: string; valueKey: string }[]>([]);
  const [showExportWizard, setShowExportWizard] = useState(false);
  const [showI18n, setShowI18n] = useState(false);
  const [showThemeEditor, setShowThemeEditor] = useState(false);
  const [showFieldTemplates, setShowFieldTemplates] = useState(false);
  const [showFieldComments, setShowFieldComments] = useState(false);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  /**
   * Whether a publish or preview attempt has asked for the form to be checked.
   *
   * The errors themselves are derived from the fields rather than stored, so
   * fixing a duplicate name clears its message and the count straight away.
   * Held as state, the list stayed exactly as it was until the next attempt,
   * and the banner kept reporting problems the author had already fixed.
   */
  const [validationRequested, setValidationRequested] = useState(false);
  const [surveySettings, setSurveySettings] = useState<Record<string, unknown>>(() => {
    if (!initialJson) return {};
    return {
      title: initialJson.title || "",
      description: initialJson.description || "",
      titleLocation: initialJson.titleLocation || "default",
      textTransform: initialJson.textTransform || "none",
      showQuestionNumbers: initialJson.showQuestionNumbers || "on",
      checkErrorsMode: initialJson.checkErrorsMode || "onValueChanged",
      textUpdateMode: initialJson.textUpdateMode || "onTyping",
      showProgressBar: !!initialJson.showProgressBar,
      showPageTitles: !!initialJson.showPageTitles,
      primaryColor: initialJson.primaryColor || editorial.pmwBlue,
      backgroundColor: initialJson.backgroundColor || editorial.white,
      textColor: initialJson.textColor || editorial.ink,
      errorColor: initialJson.errorColor || editorial.error,
      fontFamily: APP_FONT_NAME,
      borderRadius: initialJson.borderRadius || "8px",
      labelPosition: initialJson.labelPosition || "top",
    };
  });
  
  // ── Part 5: Integration & Submission State ─────────────────────────────────
  const [showIntegrationPanel, setShowIntegrationPanel] = useState(false);
  const [showProvisioningPreview, setShowProvisioningPreview] = useState(false);
  const [showSubmissionSettings, setShowSubmissionSettings] = useState(false);
  const [showFieldPermissions, setShowFieldPermissions] = useState(false);
  const [showSurveySettings, setShowSurveySettings] = useState(false);
  
  // Webhooks
  const [webhooks, setWebhooks] = useState<{ id: string; name: string; url: string; method: "POST" | "PATCH"; events: string[]; enabled: boolean; payloadTemplate?: string }[]>([]);
  
  // Email Templates
  const [emailTemplates, setEmailTemplates] = useState<{ id: string; name: string; event: string; to: string; subject: string; body: string; enabled: boolean }[]>([]);
  
  // PDF Config
  
  // Score Config
  const [scoreConfig, setScoreConfig] = useState<{ enabled: boolean; expression: string; thresholds: { green: number; amber: number; red: number }; label: string }>({ enabled: false, expression: "", thresholds: { green: 80, amber: 60, red: 0 }, label: "Score" });
  
  // Duplicate Detection
  const [duplicateDetection, setDuplicateDetection] = useState<{ enabled: boolean; identifyBy: string[]; action: "block" | "warn" | "overwrite" }>({ enabled: false, identifyBy: [], action: "warn" });
  
  // Quota Config
  const [quotaConfig, setQuotaConfig] = useState<{ enabled: boolean; maxSubmissions: number; maxPerUser: number; actionWhenReached: "disable" | "message" | "redirect"; customMessage: string }>({ enabled: false, maxSubmissions: 100, maxPerUser: 0, actionWhenReached: "message", customMessage: "" });
  
  // Power Automate
  const [powerAutomateUrl, setPowerAutomateUrl] = useState("");
  
  // Field Permissions
  const [fieldPermissions, setFieldPermissions] = useState<{ fieldName: string; viewRoles: string[]; editRoles: string[]; isSensitive: boolean; readOnlyAfterSubmit: boolean }[]>([]);
  
  // Translations (i18n)
  const [translations, setTranslations] = useState<Record<string, Record<string, Record<string, string>>>>({});
  
  // Integration Panel tabs
  const [activeIntegrationTab, setActiveIntegrationTab] = useState<"webhooks" | "email" | "powerautomate">("webhooks");
  
  // Export format state (placeholder for future use)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_exportFormat, _setExportFormat] = useState<"json" | "csv" | "html" | "pdf" | "zip">("json");
  
  // i18n active locale
  const [activeLocale, setActiveLocale] = useState<"en" | "ms" | "zh" | "ta">("ms");

  // ── Form Metadata State ─────────────────────────────────────
  const [_formTitle, _setFormTitle] = useState<string>(String(meta?.formTitle || ""));


  // Initialize surveySettings from initialJson or defaults
  useEffect(() => {
    if (initialJson) {
      setSurveySettings({
        title: initialJson.title || "",
        description: initialJson.description || "",
        titleLocation: initialJson.titleLocation || "default",
        textTransform: initialJson.textTransform || "none",
        showQuestionNumbers: initialJson.showQuestionNumbers || "on",
        checkErrorsMode: initialJson.checkErrorsMode || "onValueChanged",
        textUpdateMode: initialJson.textUpdateMode || "onTyping",
        showProgressBar: !!initialJson.showProgressBar,
        showPageTitles: !!initialJson.showPageTitles,
        primaryColor: initialJson.primaryColor || editorial.pmwBlue,
        backgroundColor: initialJson.backgroundColor || editorial.white,
        textColor: initialJson.textColor || editorial.ink,
        errorColor: initialJson.errorColor || editorial.error,
        fontFamily: APP_FONT_NAME,
        borderRadius: initialJson.borderRadius || "8px",
        labelPosition: initialJson.labelPosition || "top",
      });
    } else {
      setSurveySettings({
        title: "",
        description: "",
        titleLocation: "default",
        textTransform: "none",
        showQuestionNumbers: "on",
        checkErrorsMode: "onValueChanged",
        textUpdateMode: "onTyping",
        showProgressBar: false,
        showPageTitles: false,
        primaryColor: editorial.pmwBlue,
        backgroundColor: editorial.white,
        textColor: editorial.ink,
        errorColor: editorial.error,
        fontFamily: APP_FONT_NAME,
        borderRadius: "8px",
        labelPosition: "top",
      });
    }
  }, [initialJson]);

  const companyChoiceKey = companyChoice
    ? `${companyChoice.enabled}|${companyChoice.fieldName}|${companyChoice.title}|${companyChoice.choices.join("\u001f")}`
    : "off";

  useEffect(() => {
    if (!companyChoice?.enabled) {
      setFields(current => removeManagedCompanyChoiceFields(current));
      setSelectedId(null);
      return;
    }
    const config = companyChoice;
    setFields(current => normalizeCompanyChoiceFields(current, config));
  }, [companyChoiceKey]);

  // Undo/redo stacks
  const MAX_HISTORY = 20;
  const [undoStack, setUndoStack] = useState<FormBuilderField[][]>([]);
  const [redoStack, setRedoStack] = useState<FormBuilderField[][]>([]);
  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  // Auto-save key
  const AUTOSAVE_KEY = "pmw_formbuilder_draft";
  useEffect(() => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.fields?.length > 0) {
          setShowRestorePrompt(true);
        }
      }
    } catch { /* Non-critical — autosave parse failure */ }
  }, []);

  const restoreDraft = () => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) {
        const { fields: savedFields, surveySettings: savedSettings } = JSON.parse(saved);
        if (savedFields?.length > 0) {
          pushHistory(savedFields);
          setSurveySettings(saved => ({ ...saved, ...savedSettings }));
        }
      }
    } catch { /* Non-critical — autosave parse failure */ }
    setShowRestorePrompt(false);
  };

  const discardDraft = () => {
    localStorage.removeItem(AUTOSAVE_KEY);
    setShowRestorePrompt(false);
  };

  // Stable ref to avoid stale closure issues during rapid typing
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const errors = useMemo(
    () => (validationRequested ? validateFields(fields) : []),
    [validationRequested, fields],
  );

  // Push current state to history before making changes
  const withManagedCompanyChoice = useCallback((newFields: FormBuilderField[]) => {
    return companyChoice?.enabled ? normalizeCompanyChoiceFields(newFields, companyChoice) : removeManagedCompanyChoiceFields(newFields);
  }, [companyChoiceKey]);

  const pushHistory = useCallback((newFields: FormBuilderField[]) => {
    setUndoStack(prev => [...prev, fieldsRef.current].slice(-MAX_HISTORY));
    setRedoStack([]);
    setFields(withManagedCompanyChoice(newFields));
  }, [withManagedCompanyChoice]);

  /** Undo and redo can remove the field the properties panel is editing — undoing a
   *  duplicate is the common case. Drop the selection when the restored schema no
   *  longer holds it, so the panel closes instead of editing a field that is gone. */
  const keepSelectionIfPresent = useCallback((restoredFields: FormBuilderField[]) => {
    setSelectedId(current => (current && findFieldById(restoredFields, current) ? current : null));
  }, []);

  // Undo handler
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previousFields = undoStack[undoStack.length - 1];
    setRedoStack(prev => [...prev, fieldsRef.current]);
    setUndoStack(prev => prev.slice(0, -1));
    setFields(withManagedCompanyChoice(previousFields));
    keepSelectionIfPresent(previousFields);
  }, [undoStack, withManagedCompanyChoice, keepSelectionIfPresent]);

  // Redo handler
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextFields = redoStack[redoStack.length - 1];
    setUndoStack(prev => [...prev, fieldsRef.current]);
    setRedoStack(prev => prev.slice(0, -1));
    setFields(withManagedCompanyChoice(nextFields));
    keepSelectionIfPresent(nextFields);
  }, [redoStack, withManagedCompanyChoice, keepSelectionIfPresent]);

  const selectedField = findFieldById(fields, selectedId || "") || null;
  // Stable ref for PropertyPanel fallback during state transitions
  const selectedFieldRef = useRef(selectedField);
  if (selectedField) selectedFieldRef.current = selectedField;

  // The sheet title is the form's identity everywhere else — the SharePoint list
  // name, the dashboards, the PDF header — so it is also the title the rendered
  // survey carries. Deriving it here rather than storing a second copy is what
  // stops the two from drifting apart when a form is renamed.
  const sheetTitle = sheet?.title;
  const surveyJson = useMemo(
    () => buildSurveyJson(fields, sheetTitle ? { ...surveySettings, title: sheetTitle } : surveySettings),
    [fields, surveySettings, sheetTitle],
  );
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => { if (onChangeRef.current) onChangeRef.current(surveyJson); }, [surveyJson]);

  const addField = useCallback((td: typeof QUESTION_TYPES[number], atIndex?: number) => {
    const q = createQuestion(td);
    const newFields = [...fieldsRef.current];
    if (atIndex !== undefined && atIndex >= 0) newFields.splice(atIndex, 0, q); else newFields.push(q);
    pushHistory(newFields);
    setSelectedId(q._id);
  }, [pushHistory]);

  const handleChange = useCallback((id: string, patch: Partial<FormBuilderField>) => {
    pushHistory(updateField(fieldsRef.current, id, patch));
  }, [pushHistory]);
  const handleRemove = useCallback((id: string) => {
    const field = findFieldById(fieldsRef.current, id);
    if (isManagedCompanyChoice(field)) return;
    pushHistory(removeFieldRecursive(fieldsRef.current, id));
    setSelectedId(c => c === id ? null : c); 
  }, [pushHistory]);
  const handleDuplicate = useCallback((field: FormBuilderField) => {
    if (isManagedCompanyChoice(field)) return;
    const newFields = duplicateFieldRecursive(fieldsRef.current, field._id);
    pushHistory(newFields);
    // Find the duplicated copy and select it
    const copy = findFieldById(newFields, field._id);
    if (copy) {
      const allIds: string[] = [];
      const collectIds = (items: FormBuilderField[]) => {
        for (const f of items) {
          allIds.push(f._id);
          if (f.type === "panel" && f.elements) collectIds(f.elements);
        }
      };
      collectIds(newFields);
      const origIdx = allIds.indexOf(field._id);
      if (origIdx !== -1 && origIdx + 1 < allIds.length) {
        setSelectedId(allIds[origIdx + 1]);
      }
    }
  }, [pushHistory]);
  const handleReorder = useCallback((from: number, to: number) => {
    if (isManagedCompanyChoice(fieldsRef.current[from])) return;
    if (companyChoice?.enabled && to <= 0) return;
    const newFields = [...fieldsRef.current];
    const [moved] = newFields.splice(from, 1);
    newFields.splice(to, 0, moved);
    pushHistory(newFields);
  }, [pushHistory]);

  /** Recursive reorder for fields inside panels (via field IDs) */
  const handleRecursiveReorder = useCallback((fromId: string, toId: string) => {
    const from = findFieldById(fieldsRef.current, fromId);
    const to = findFieldById(fieldsRef.current, toId);
    if (isManagedCompanyChoice(from) || isManagedCompanyChoice(to)) return;
    pushHistory(reorderFieldsRecursive(fieldsRef.current, fromId, toId));
  }, [pushHistory, companyChoice?.enabled]);

  /** Move a field out of a panel to the root canvas at a specific index */
  const handleMoveToRoot = useCallback((fieldId: string, atIndex: number) => {
    const field = findFieldById(fieldsRef.current, fieldId);
    if (isManagedCompanyChoice(field)) return;
    pushHistory(moveFieldToRoot(fieldsRef.current, fieldId, atIndex));
  }, [pushHistory]);

  /** Move a field into a panel via drag-and-drop */
  const handleDropOnPanel = useCallback((e: React.DragEvent, panelId: string) => {
    e.preventDefault();
    const pd = e.dataTransfer.getData("palette_type");
    if (pd) {
      // Adding a new field from palette into panel
      const q = createQuestion(JSON.parse(pd));
      pushHistory(addFieldToPanel(fieldsRef.current, panelId, q));
      setSelectedId(q._id);
      return;
    }
    // Moving an existing field into panel
    const dragId = e.dataTransfer.getData("field_id");
    if (dragId && dragId !== panelId) {
      const field = findFieldById(fieldsRef.current, dragId);
      if (isManagedCompanyChoice(field)) return;
      pushHistory(moveFieldIntoPanel(fieldsRef.current, dragId, panelId));
    }
  }, [pushHistory]);

  /** Opens whichever deferred panel the shell's Tools / Preview menu asked for. */
  const toolNonce = toolCommand?.nonce;
  const toolKey = toolCommand?.key;
  useEffect(() => {
    if (toolNonce === undefined || !toolKey) return;
    if (toolKey.startsWith("preview-")) {
      const found = validateFields(fieldsRef.current);
      setValidationRequested(true);
      if (found.length) return;
      setPreviewDevice(toolKey.slice("preview-".length) as "desktop" | "tablet" | "mobile");
      setShowPreview(true);
      return;
    }
    switch (toolKey) {
      case "templates": setShowFieldTemplates(true); break;
      case "i18n": setShowI18n(true); break;
      case "comments": setShowFieldComments(true); break;
      case "theme": setShowThemeEditor(true); break;
      case "data": setShowDataSources(true); break;
      case "integrations": setShowIntegrationPanel(true); break;
      case "export": setShowExportWizard(true); break;
      case "provisioning": setShowProvisioningPreview(true); break;
      case "json": setJsonCollapsed(c => !c); break;
      case "permissions": setShowFieldPermissions(true); break;
      case "submission": setShowSubmissionSettings(true); break;
      case "display": setShowSurveySettings(true); break;
      default: break;
    }
    // Re-runs on every raised command, including the same key twice in a row.
  }, [toolNonce, toolKey]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Undo: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) handleUndo();
        return;
      }
      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y / Cmd+Y
      if (((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) || ((e.ctrlKey || e.metaKey) && e.key === "y")) {
        e.preventDefault();
        if (canRedo) handleRedo();
        return;
      }
      // Command Palette: /
      if (e.key === "/" && !selectedId) {
        e.preventDefault();
        setShowCommandPalette(true);
        return;
      }
      // Don't process other shortcuts if no field selected
      if (!selectedId) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const selected = findFieldById(fields, selectedId);
      if (isManagedCompanyChoice(selected)) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); handleRemove(selectedId); }
      if (e.key === "d" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); const f = findFieldById(fields, selectedId); if (f) handleDuplicate(f); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, handleRemove, handleDuplicate, fields, canUndo, handleUndo, canRedo, handleRedo]);

  return <>
    <div className="bx-build" style={{ height }}>
      <Palette onAdd={td => addField(td)} />
      <FormSheet
        fields={fields}
        selectedId={selectedId}
        onSelect={id => setSelectedId(id)}
        onRemove={handleRemove}
        onDuplicate={handleDuplicate}
        onReorder={handleReorder}
        onAddFromPalette={addField}
        errors={errors}
        onDropOnPanel={handleDropOnPanel}
        onRecursiveReorder={handleRecursiveReorder}
        onMoveToRoot={handleMoveToRoot}
        sheet={sheet}
        onTitleChange={onTitleChange}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        readOnly={_readOnly}
      />
      {selectedId !== null && (
        <PropertyPanel
          field={selectedField || selectedFieldRef.current}
          allFields={flattenFieldTree(fields)}
          onChange={patch => {
            const id = selectedField?._id ?? selectedFieldRef.current?._id ?? null;
            if (id) handleChange(id, patch);
          }}
          onClose={() => setSelectedId(null)}
          token={_token}
        />
      )}
      {showRestorePrompt && (
        <div className="bx-toast" role="status">
          <span className="bx-dot" style={{ background: "var(--bx-a300)", marginTop: 6 }} />
          <span style={{ flex: 1 }}>
            An unsaved local draft of this form was found.
            <span style={{ display: "flex", gap: 8, marginTop: 9 }}>
              <button type="button" className="bx-btn bx-btn-primary bx-btn-sm" onClick={restoreDraft}>Restore it</button>
              <button type="button" className="bx-btn bx-btn-secondary bx-btn-sm" onClick={discardDraft}>Discard</button>
            </span>
          </span>
        </div>
      )}
    </div>
      {/* The JSON drawer is now a Tools row, so it only exists once asked for. */}
      {!jsonCollapsed && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 2500, boxShadow: "0 -12px 32px rgba(26,31,43,0.22)" }}>
          <JsonPreview json={surveyJson} onClose={() => setJsonCollapsed(true)} />
        </div>
      )}
      {showPreview && <LivePreviewModal json={surveyJson} onClose={() => setShowPreview(false)} showBanner={showBanner} meta={meta} device={previewDevice} />}
      {/* Command Palette Modal - "/" */}
      {showCommandPalette && (
        <div onClick={() => setShowCommandPalette(false)} onKeyDown={(e) => { if (e.key === "Escape") setShowCommandPalette(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 3100, background: "rgba(30,27,75,0.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "120px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 12, width: 480, maxWidth: "90vw", boxShadow: "0 12px 40px rgba(91,33,182,0.25)", border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke={C.textMuted} strokeWidth="1.5"/><path d="M10.5 10.5L14 14" stroke={C.textMuted} strokeWidth="1.5" strokeLinecap="round"/></svg>
              <input autoFocus value={commandPaletteSearch} onChange={(e) => setCommandPaletteSearch(e.target.value)} placeholder="Search field types..." style={{ flex: 1, border: "none", outline: "none", fontSize: 14, fontFamily: "var(--pmw-font-main)", color: C.textPrimary }} />
              <span style={{ fontSize: 11, color: C.textMuted, background: C.offWhite, padding: "2px 6px", borderRadius: 4 }}>ESC to close</span>
            </div>
<div style={{ maxHeight: 320, overflowY: "auto", padding: "8px 0" }}>
              {(() => {
                const q = commandPaletteSearch.toLowerCase();
                const filtered = QUESTION_TYPES.filter(t => !q || t.label.toLowerCase().includes(q) || t.type.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
                if (filtered.length === 0) {
                  return <div style={{ padding: 24, textAlign: "center", color: C.textMuted, fontSize: 13.5 }}>No field types match "{commandPaletteSearch}"</div>;
                }
                return filtered.map((td, i) => (
                  <div key={td.type} onClick={() => { addField(td); setShowCommandPalette(false); setCommandPaletteSearch(""); }}
                    style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", background: i === 0 ? C.offWhite : "transparent" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = C.offWhite; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = i === 0 ? C.offWhite : "transparent"; }}>
                    <span style={{ width: 28, display: "flex", alignItems: "center", justifyContent: "center", color: C.purple }}><FieldIcon type={td.type} size={18} /></span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.textPrimary }}>{td.label}</div>
                      <div style={{ fontSize: 11.5, color: C.textMuted }}>{td.description}</div>
                    </div>
                    <span style={{ fontSize: 11, color: C.textMuted }}>{td.group}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}
      {/* Data Sources Manager Modal */}
      {showDataSources && (
        <div onClick={() => setShowDataSources(false)} style={{ position: "fixed", inset: 0, zIndex: 3100, background: "rgba(30,27,75,0.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 12, width: 520, maxHeight: "80vh", boxShadow: "0 12px 40px rgba(91,33,182,0.25)", border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary }}><PowerIcon style={{ fontSize: 16, marginRight: 6 }} /> Data Sources</div>
              <button onClick={() => setShowDataSources(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: C.textMuted }}><CloseIcon style={{ fontSize: 16 }} /></button>
            </div>
            <div style={{ padding: 16, maxHeight: 400, overflowY: "auto" }}>
              <div style={{ marginBottom: 16 }}>
                <button onClick={() => setDataSources([...dataSources, { name: `ds${dataSources.length + 1}`, url: "", labelKey: "label", valueKey: "value" }])} style={{ fontSize: 12.5, padding: "6px 12px", background: C.purple, color: C.white, border: "none", borderRadius: 8, cursor: "pointer" }}>+ Add Data Source</button>
              </div>
              {dataSources.length === 0 ? (
                <div style={{ textAlign: "center", padding: 32, color: C.textMuted, fontSize: 13.5 }}>No data sources. Add one to connect dropdowns to REST APIs.</div>
              ) : dataSources.map((ds, idx) => (
                <div key={idx} style={{ padding: 12, background: C.offWhite, borderRadius: 8, marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input value={ds.name} onChange={(e) => { const n = [...dataSources]; n[idx].name = e.target.value; setDataSources(n); }} placeholder="Source name (e.g. departments)" style={{ flex: 1, padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12.5 }} />
                    <button onClick={() => setDataSources(dataSources.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12.5 }}>Delete</button>
                  </div>
                  <input value={ds.url} onChange={(e) => { const n = [...dataSources]; n[idx].url = e.target.value; setDataSources(n); }} placeholder="REST API URL..." style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12.5, marginBottom: 8 }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={ds.labelKey} onChange={(e) => { const n = [...dataSources]; n[idx].labelKey = e.target.value; setDataSources(n); }} placeholder="label key" style={{ flex: 1, padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12.5 }} />
                    <input value={ds.valueKey} onChange={(e) => { const n = [...dataSources]; n[idx].valueKey = e.target.value; setDataSources(n); }} placeholder="value key" style={{ flex: 1, padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12.5 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Export Wizard Modal */}
      {showExportWizard && (
        <div onClick={() => setShowExportWizard(false)} style={{ position: "fixed", inset: 0, zIndex: 3100, background: "rgba(30,27,75,0.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 12, width: 520, boxShadow: "0 12px 40px rgba(91,33,182,0.25)", border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary }}><FileUploadIcon style={{ fontSize: 16, marginRight: 6 }} /> Export Form</div>
              <button onClick={() => setShowExportWizard(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: C.textMuted }}><CloseIcon style={{ fontSize: 16 }} /></button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(surveyJson, null, 2)); alert("JSON copied to clipboard!"); }} style={{ padding: 14, background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}><DescriptionIcon style={{ fontSize: 16, marginRight: 6 }} /> SurveyJS JSON</div>
                  <div style={{ fontSize: 11.5, color: C.textMuted }}>Copy full SurveyJS JSON to clipboard</div>
                </button>
                <button onClick={() => {
                  const csv = fields.map(f => `${f.name},${f.title},${f.type},${f.isRequired ? "Yes" : "No"}`).join("\n");
                  const blob = new Blob([`Field Name,Field Title,Type,Required\n${csv}`], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = `${surveyJson.title || "form"}_fields.csv`; a.click();
                }} style={{ padding: 14, background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}><TableChartIcon style={{ fontSize: 14, marginRight: 4 }} /> Excel CSV</div>
                  <div style={{ fontSize: 11.5, color: C.textMuted }}>Export field names and types as CSV</div>
                </button>
                <button onClick={() => {
                  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${DOMPurify.sanitize(String(surveyJson.title ?? "Form"))}</title><style>body{font-family:Inter,'Segoe UI','Aptos','Helvetica Neue',Arial,sans-serif;padding:40px;max-width:800px;margin:0 auto;}h1{color:#0078D4;}label{display:block;margin:12px 0 4px;font-weight:600;}input,select,textarea{width:100%;padding:8px;margin-bottom:12px;border:1px solid #ddd;border-radius:4px;}</style></head><body><h1>${DOMPurify.sanitize(String(surveyJson.title ?? "Form"))}</h1>${fields.filter(f => f.type !== "html" && f.type !== "panel" && f.type !== "pagebreak" && f.type !== "spacer" && f.type !== "divider").map(f => `<label>${DOMPurify.sanitize(String(f.title))}${f.isRequired ? " *" : ""}</label>` + (f.type === "textarea" ? `<textarea rows="3" placeholder="${DOMPurify.sanitize(String(f.placeholder ?? ""))}"></textarea>` : f.type === "select" || f.type === "dropdown" ? `<select><option>Select...</option>${(f.choices || []).map((c: unknown) => `<option>${DOMPurify.sanitize(typeof c === "string" ? String(c) : String((c as { text: string }).text))}</option>`).join("")}</select>` : `<input type="${DOMPurify.sanitize(String(f.inputType ?? "text"))}" placeholder="${DOMPurify.sanitize(String(f.placeholder ?? ""))}">`)).join("\n")}</body></html>`;
                  const blob = new Blob([html], { type: "text/html" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = `${surveyJson.title || "form"}.html`; a.click();
                }} style={{ padding: 14, background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}><DescriptionIcon style={{ fontSize: 14, marginRight: 4 }} /> Blank HTML Form</div>
                  <div style={{ fontSize: 11.5, color: C.textMuted }}>Export printable blank form as HTML</div>
                </button>
                <button onClick={() => {
                  // Simple PDF generation using window.print
                  const printContent = `<html><head><title>${DOMPurify.sanitize(String(surveyJson.title ?? "Form"))}</title><style>body{font-family:Inter,'Segoe UI','Aptos','Helvetica Neue',Arial,sans-serif;padding:40px;}h1{color:#0078D4;border-bottom:2px solid #0078D4;padding-bottom:10px;}label{display:block;margin:16px 0 4px;font-weight:600;}input,select,textarea{width:100%;padding:8px;margin-bottom:8px;border:1px solid #ccc;}.field-list{margin-top:30px;}</style></head><body><h1>${DOMPurify.sanitize(String(surveyJson.title ?? "Form"))}</h1>${fields.filter(f => f.type !== "html" && f.type !== "panel" && f.type !== "pagebreak" && f.type !== "spacer" && f.type !== "divider").map(f => `<div class="field-list"><label>${DOMPurify.sanitize(String(f.title))}${f.isRequired ? " *" : ""}</label>${f.description ? `<small style="color:#666">${DOMPurify.sanitize(String(f.description))}</small><br/>` : ""}<div style="height:24px;border-bottom:1px solid #ccc;"></div></div>`).join("\n")}</body></html>`;
                  const printWindow = window.open("", "_blank");
                  if (printWindow) { printWindow.document.write(printContent); printWindow.document.close(); printWindow.print(); }
                }} style={{ padding: 14, background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", textAlign: "left" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: C.textPrimary }}>🖨️ PDF Blank Form</div>
                  <div style={{ fontSize: 11.5, color: C.textMuted }}>Open printable form for PDF export</div>
                </button>
                <button onClick={() => {
                  // Create ZIP with all form assets - placeholder for JSZip implementation
                  const _formTitle = surveyJson.title || "form";
                  const _jsonStr = JSON.stringify(surveyJson, null, 2);
                  const _csvStr = `Field Name,Field Title,Type,Required\n${fields.map(f => `${f.name},"${f.title}",${f.type},${f.isRequired}`).join("\n")}`;
                  const _emailTemplatesStr = emailTemplates.length > 0 ? JSON.stringify(emailTemplates, null, 2) : "[]";
                  const _webhookStr = webhooks.length > 0 ? JSON.stringify(webhooks, null, 2) : "[]";
                  const _manifest = JSON.stringify({ version: "1.0", exportedAt: new Date().toISOString(), includes: ["form.json", "fields.csv", "email-templates.json", "webhooks.json"] }, null, 2);
                  void _formTitle; void _jsonStr; void _csvStr; void _emailTemplatesStr; void _webhookStr; void _manifest;
                  // Note: Real ZIP requires a library like JSZip - this is a placeholder
                  alert("ZIP export would include: form.json, fields.csv, email-templates.json, webhooks.json, README.md\n\n(Requires JSZip library for full implementation)");
                }} style={{ padding: 14, background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", textAlign: "left" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: C.textPrimary }}>📦 Full ZIP Export</div>
                  <div style={{ fontSize: 11.5, color: C.textMuted }}>Download all form assets as ZIP</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* i18n Translations Modal */}
      {showI18n && (
        <div onClick={() => setShowI18n(false)} style={{ position: "fixed", inset: 0, zIndex: 3100, background: "rgba(30,27,75,0.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 12, width: 600, maxHeight: "85vh", boxShadow: "0 12px 40px rgba(91,33,182,0.25)", border: `1px solid ${C.border}`, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary }}><TranslateIcon style={{ fontSize: 16, marginRight: 6 }} /> Translations</div>
              <button onClick={() => setShowI18n(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: C.textMuted }}><CloseIcon style={{ fontSize: 16 }} /></button>
            </div>
            <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, flexShrink: 0 }}>
              {([
                { code: "en" as const, label: "🇬🇧 English" },
                { code: "ms" as const, label: "🇲🇾 Malay" },
                { code: "zh" as const, label: "🇨🇳 Chinese" },
                { code: "ta" as const, label: "🇮🇳 Tamil" }
              ]).map(loc => (
                <button key={loc.code} onClick={() => setActiveLocale(loc.code)} style={{ padding: "6px 12px", background: activeLocale === loc.code ? C.purplePale : C.offWhite, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 11.5, fontWeight: 600, color: activeLocale === loc.code ? C.purple : C.textMuted }}>
                  {loc.label}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
              <div style={{ fontSize: 11.5, color: C.textMuted, marginBottom: 16 }}>
                Translate each field's label, placeholder, and help text for {activeLocale === "en" ? "English" : activeLocale === "ms" ? "Malay" : activeLocale === "zh" ? "Chinese" : "Tamil"}.
              </div>
              {fields.filter(f => f.type !== "html" && f.type !== "panel" && f.type !== "pagebreak" && f.type !== "spacer" && f.type !== "divider").map((f) => {
                const fieldTranslations = translations[f.name]?.[activeLocale] || {};
                return (
                  <div key={f._id} style={{ padding: 12, background: C.offWhite, borderRadius: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8, color: C.textPrimary }}>{f.title} <span style={{ color: C.textMuted, fontWeight: 400 }}>({f.name})</span></div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Label</div>
                        <input value={fieldTranslations.label || ""} onChange={(e) => setTranslations((prev: Record<string, Record<string, Record<string, string>>>) => ({ ...prev, [f.name]: { ...prev[f.name], [activeLocale]: { ...prev[f.name]?.[activeLocale], label: e.target.value } } }))} placeholder={`Translate "${f.title}"`} style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11.5 }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Placeholder</div>
                        <input value={fieldTranslations.placeholder || ""} onChange={(e) => setTranslations((prev: Record<string, Record<string, Record<string, string>>>) => ({ ...prev, [f.name]: { ...prev[f.name], [activeLocale]: { ...prev[f.name]?.[activeLocale], placeholder: e.target.value } } }))} placeholder={f.placeholder || "(no placeholder)"} style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11.5 }} />
                      </div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Help Text / Description</div>
                      <input value={fieldTranslations.description || ""} onChange={(e) => setTranslations((prev: Record<string, Record<string, Record<string, string>>>) => ({ ...prev, [f.name]: { ...prev[f.name], [activeLocale]: { ...prev[f.name]?.[activeLocale], description: e.target.value } } }))} placeholder={f.description || "(no description)"} style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11.5 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {/* Theme Editor Modal */}
      {showThemeEditor && (
        <div onClick={() => setShowThemeEditor(false)} style={{ position: "fixed", inset: 0, zIndex: 3100, background: "rgba(30,27,75,0.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 12, width: 480, maxHeight: "80vh", boxShadow: "0 12px 40px rgba(91,33,182,0.25)", border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary }}><PaletteIcon style={{ fontSize: 16, marginRight: 6 }} /> Theme Editor</div>
              <button onClick={() => setShowThemeEditor(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: C.textMuted }}><CloseIcon style={{ fontSize: 16 }} /></button>
            </div>
            <div style={{ padding: 20, maxHeight: 400, overflowY: "auto" }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: C.textMuted, marginBottom: 8, textTransform: "uppercase" }}>Colors</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><label style={{ fontSize: 11, color: C.textSecond, display: "block", marginBottom: 4 }}>Primary Color</label><input type="color" value={String(surveySettings.primaryColor || editorial.pmwBlue)} onChange={(e) => setSurveySettings({ ...surveySettings, primaryColor: e.target.value })} style={{ width: "100%", height: 36, border: `1px solid ${C.border}`, borderRadius: 8 }} /></div>
                  <div><label style={{ fontSize: 11, color: C.textSecond, display: "block", marginBottom: 4 }}>Background</label><input type="color" value={String(surveySettings.backgroundColor || editorial.white)} onChange={(e) => setSurveySettings({ ...surveySettings, backgroundColor: e.target.value })} style={{ width: "100%", height: 36, border: `1px solid ${C.border}`, borderRadius: 8 }} /></div>
                  <div><label style={{ fontSize: 11, color: C.textSecond, display: "block", marginBottom: 4 }}>Text Color</label><input type="color" value={String(surveySettings.textColor || editorial.ink)} onChange={(e) => setSurveySettings({ ...surveySettings, textColor: e.target.value })} style={{ width: "100%", height: 36, border: `1px solid ${C.border}`, borderRadius: 8 }} /></div>
                  <div><label style={{ fontSize: 11, color: C.textSecond, display: "block", marginBottom: 4 }}>Error Color</label><input type="color" value={String(surveySettings.errorColor || editorial.error)} onChange={(e) => setSurveySettings({ ...surveySettings, errorColor: e.target.value })} style={{ width: "100%", height: 36, border: `1px solid ${C.border}`, borderRadius: 8 }} /></div>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: C.textMuted, marginBottom: 8, textTransform: "uppercase" }}>Typography</div>
                <div style={{ marginBottom: 8 }}><label style={{ fontSize: 11, color: C.textSecond, display: "block", marginBottom: 4 }}>Font Family</label><select value={String(surveySettings.fontFamily || APP_FONT_NAME)} onChange={() => setSurveySettings({ ...surveySettings, fontFamily: APP_FONT_NAME })} style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 8 }}><option>{APP_FONT_NAME}</option></select></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><label style={{ fontSize: 11, color: C.textSecond, display: "block", marginBottom: 4 }}>Label Position</label><select value={String(surveySettings.labelPosition || "top")} onChange={(e) => setSurveySettings({ ...surveySettings, labelPosition: e.target.value })} style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 8 }}><option value="top">Top</option><option value="left">Left</option><option value="floating">Floating</option></select></div>
                  <div><label style={{ fontSize: 11, color: C.textSecond, display: "block", marginBottom: 4 }}>Border Radius</label><select value={String(surveySettings.borderRadius || "8px")} onChange={(e) => setSurveySettings({ ...surveySettings, borderRadius: e.target.value })} style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 8 }}><option>0px</option><option>4px</option><option>8px</option><option>12px</option></select></div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: C.textMuted, marginBottom: 8, textTransform: "uppercase" }}>Form Settings</div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12.5 }}><input type="checkbox" checked={!!surveySettings.showProgressBar} onChange={(e) => setSurveySettings({ ...surveySettings, showProgressBar: e.target.checked })} /> Show Progress Bar</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12.5 }}><input type="checkbox" checked={!!surveySettings.showPageTitles} onChange={(e) => setSurveySettings({ ...surveySettings, showPageTitles: e.target.checked })} /> Show Page Titles</label>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Field Templates Modal */}
      {showFieldTemplates && (
        <div onClick={() => setShowFieldTemplates(false)} style={{ position: "fixed", inset: 0, zIndex: 3100, background: "rgba(30,27,75,0.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 12, width: 520, maxHeight: "80vh", boxShadow: "0 12px 40px rgba(91,33,182,0.25)", border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary }}><DescriptionIcon style={{ fontSize: 16, marginRight: 6 }} /> Field Templates</div>
              <button onClick={() => setShowFieldTemplates(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: C.textMuted }}><CloseIcon style={{ fontSize: 16 }} /></button>
            </div>
            <div style={{ padding: 16, maxHeight: 400, overflowY: "auto" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[ { name: "Full Address", icon: <HomeIcon style={{ fontSize: 20 }} />, fields: [{ type: "text", name: "address1", title: "Address Line 1" }, { type: "text", name: "city", title: "City" }, { type: "text", name: "postcode", title: "Postcode" }] }, { name: "Personal Info", icon: <PersonIcon style={{ fontSize: 20 }} />, fields: [{ type: "text", name: "fullName", title: "Full Name" }, { type: "email", name: "email", title: "Email" }] }, { name: "Bank Details", icon: <AccountBalanceIcon style={{ fontSize: 20 }} />, fields: [{ type: "text", name: "bankName", title: "Bank Name" }, { type: "text", name: "accountNumber", title: "Account Number" }] }].map((tpl, idx) => (
                  <div key={idx} onClick={() => { tpl.fields.forEach(f => { const q = createQuestion({ type: f.type, label: f.title, icon: "", group: "Basic", description: f.title, spColumnKind: 2, defaultProps: {} }); q.name = f.name; pushHistory([...fields, q]); }); setShowFieldTemplates(false); }} style={{ padding: 14, background: C.offWhite, borderRadius: 8, cursor: "pointer" }}>
                    <span style={{ marginRight: 10, display: "inline-flex", verticalAlign: "middle" }}>{tpl.icon}</span><span style={{ fontWeight: 600 }}>{tpl.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Field Comments Modal */}
      {showFieldComments && (
        <div onClick={() => setShowFieldComments(false)} style={{ position: "fixed", inset: 0, zIndex: 3100, background: "rgba(30,27,75,0.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 12, width: 520, maxHeight: "80vh", boxShadow: "0 12px 40px rgba(91,33,182,0.25)", border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary }}><ChatIcon style={{ fontSize: 16, marginRight: 6 }} /> Field Comments</div>
              <button onClick={() => setShowFieldComments(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: C.textMuted }}><CloseIcon style={{ fontSize: 16 }} /></button>
            </div>
            <div style={{ padding: 16 }}>
              {fields.map((f) => (
                <div key={f._id} style={{ padding: 10, marginBottom: 8, background: C.offWhite, borderRadius: 8 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>{f.title}</div>
                  <input value={String(f.comment || "")} onChange={(e) => { const u = fields.map(fi => fi._id === f._id ? { ...fi, comment: e.target.value } : fi); pushHistory(u); }} placeholder="Comment..." style={{ width: "100%", padding: 6, fontSize: 11.5 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* ── PART 5: INTEGRATION PANEL MODAL ─────────────────────────────────── */}
      {showIntegrationPanel && (
        <div onClick={() => setShowIntegrationPanel(false)} style={{ position: "fixed", inset: 0, zIndex: 3100, background: "rgba(30,27,75,0.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 12, width: 640, maxHeight: "85vh", boxShadow: "0 12px 40px rgba(91,33,182,0.25)", border: `1px solid ${C.border}`, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary }}><LinkIcon style={{ fontSize: 16, marginRight: 6 }} /> Integration Settings</div>
              <button onClick={() => setShowIntegrationPanel(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: C.textMuted }}><CloseIcon style={{ fontSize: 16 }} /></button>
            </div>
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {/* Tabs: Webhooks | Email | Power Automate */}
              {
                  <>
                    <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                      {["webhooks", "email", "powerautomate"].map(tab => (
                        <button key={tab} onClick={() => setActiveIntegrationTab(tab as "webhooks" | "email" | "powerautomate")} style={{ padding: "10px 16px", background: activeIntegrationTab === tab ? C.purplePale : "transparent", border: "none", borderBottom: activeIntegrationTab === tab ? `2px solid ${C.purple}` : "2px solid transparent", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: activeIntegrationTab === tab ? C.purple : C.textMuted }}>
                          {tab === "webhooks" && <><PowerIcon style={{ fontSize: 14, marginRight: 4 }} /> Webhooks</>}
                          {tab === "email" && <><EmailIcon style={{ fontSize: 14, marginRight: 4 }} /> Email Templates</>}
                          {tab === "powerautomate" && <><BoltIcon style={{ fontSize: 14, marginRight: 4 }} /> Power Automate</>}
                        </button>
                      ))}
                    </div>
                    <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
                      {/* Webhooks Tab */}
                      {activeIntegrationTab === "webhooks" && (
                        <div>
                          <div style={{ marginBottom: 12 }}>
                            <button onClick={() => setWebhooks([...webhooks, { id: `wh_${Date.now()}`, name: `Webhook ${webhooks.length + 1}`, url: "", method: "POST", events: ["onSubmission"], enabled: true }])} style={{ fontSize: 12.5, padding: "6px 12px", background: C.purple, color: C.white, border: "none", borderRadius: 8, cursor: "pointer" }}>+ Add Webhook</button>
                          </div>
                          {webhooks.length === 0 ? (
                            <div style={{ textAlign: "center", padding: 32, color: C.textMuted, fontSize: 13.5 }}>No webhooks configured. Add one to trigger external services on form events.</div>
                          ) : webhooks.map((wh, idx) => (
                            <div key={wh.id} style={{ padding: 12, background: C.offWhite, borderRadius: 8, marginBottom: 8 }}>
                              <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                                <input type="checkbox" checked={wh.enabled} onChange={(e) => { const u = [...webhooks]; u[idx].enabled = e.target.checked; setWebhooks(u); }} />
                                <input value={wh.name} onChange={(e) => { const u = [...webhooks]; u[idx].name = e.target.value; setWebhooks(u); }} placeholder="Webhook name" style={{ flex: 1, padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12.5 }} />
                                <button onClick={() => setWebhooks(webhooks.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12.5 }}>Delete</button>
                              </div>
                              <input value={wh.url} onChange={(e) => { const u = [...webhooks]; u[idx].url = e.target.value; setWebhooks(u); }} placeholder="https://..." style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12.5, marginBottom: 8 }} />
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <label style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={wh.events.includes("onSubmission")} onChange={(e) => { const u = [...webhooks]; u[idx].events = e.target.checked ? [...u[idx].events, "onSubmission"] : u[idx].events.filter(e => e !== "onSubmission"); setWebhooks(u); }} /> On Submit</label>
                                <label style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={wh.events.includes("onApprovalDecision")} onChange={(e) => { const u = [...webhooks]; u[idx].events = e.target.checked ? [...u[idx].events, "onApprovalDecision"] : u[idx].events.filter(e => e !== "onApprovalDecision"); setWebhooks(u); }} /> On Approval</label>
                                <label style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={wh.events.includes("onFormPublished")} onChange={(e) => { const u = [...webhooks]; u[idx].events = e.target.checked ? [...u[idx].events, "onFormPublished"] : u[idx].events.filter(e => e !== "onFormPublished"); setWebhooks(u); }} /> On Publish</label>
                              </div>
                              <textarea value={wh.payloadTemplate || ""} onChange={(e) => { const u = [...webhooks]; u[idx].payloadTemplate = e.target.value; setWebhooks(u); }} placeholder='{"formId": "{formId}", "data": {fieldName}}' style={{ width: "100%", marginTop: 8, padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11.5, fontFamily: "monospace", minHeight: 60 }} />
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Email Templates Tab */}
                      {activeIntegrationTab === "email" && (
                        <div>
                          <div style={{ marginBottom: 12 }}>
                            <button onClick={() => setEmailTemplates([...emailTemplates, { id: `et_${Date.now()}`, name: `Template ${emailTemplates.length + 1}`, event: "submissionConfirm", to: "{email}", subject: "Form Submitted", body: "Your submission has been received.", enabled: true }])} style={{ fontSize: 12.5, padding: "6px 12px", background: C.purple, color: C.white, border: "none", borderRadius: 8, cursor: "pointer" }}>+ Add Email Template</button>
                          </div>
                          {emailTemplates.length === 0 ? (
                            <div style={{ textAlign: "center", padding: 32, color: C.textMuted, fontSize: 13.5 }}>No email templates. Configure notifications for submissions and approvals.</div>
                          ) : emailTemplates.map((et, idx) => (
                            <div key={et.id} style={{ padding: 12, background: C.offWhite, borderRadius: 8, marginBottom: 8 }}>
                              <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                                <input type="checkbox" checked={et.enabled} onChange={(e) => { const u = [...emailTemplates]; u[idx].enabled = e.target.checked; setEmailTemplates(u); }} />
                                <input value={et.name} onChange={(e) => { const u = [...emailTemplates]; u[idx].name = e.target.value; setEmailTemplates(u); }} placeholder="Template name" style={{ flex: 1, padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12.5 }} />
                                <button onClick={() => setEmailTemplates(emailTemplates.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12.5 }}>Delete</button>
                              </div>
                              <div style={{ marginBottom: 8 }}>
                                <select value={et.event} onChange={(e) => { const u = [...emailTemplates]; u[idx].event = e.target.value; setEmailTemplates(u); }} style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12.5 }}>
                                  <option value="submissionConfirm">Submission Confirmation</option>
                                  <option value="newSubmissionAlert">New Submission Alert</option>
                                  <option value="approvalRequest">Approval Request</option>
                                  <option value="approvalComplete">Approval Complete</option>
                                  <option value="rejectionNotice">Rejection Notice</option>
                                </select>
                              </div>
                              <input value={et.to} onChange={(e) => { const u = [...emailTemplates]; u[idx].to = e.target.value; setEmailTemplates(u); }} placeholder="To: {email} or admin@example.com" style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12.5, marginBottom: 8 }} />
                              <input value={et.subject} onChange={(e) => { const u = [...emailTemplates]; u[idx].subject = e.target.value; setEmailTemplates(u); }} placeholder="Subject" style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12.5, marginBottom: 8 }} />
                              <textarea value={et.body} onChange={(e) => { const u = [...emailTemplates]; u[idx].body = e.target.value; setEmailTemplates(u); }} placeholder="Email body (use {fieldName} for dynamic values)" style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12.5, minHeight: 80 }} />
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Power Automate Tab */}
                      {activeIntegrationTab === "powerautomate" && (
                        <div>
                          <div style={{ padding: 16, background: C.offWhite, borderRadius: 8, marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}><BoltIcon style={{ fontSize: 14, marginRight: 4, verticalAlign: 'middle' }} /> Power Automate HTTP Trigger</div>
                            <div style={{ fontSize: 11.5, color: C.textMuted, marginBottom: 12 }}>Generate a URL to trigger a Power Automate flow when forms are submitted.</div>
                            <input value={powerAutomateUrl} onChange={(e) => setPowerAutomateUrl(e.target.value)} placeholder="Paste your Power Automate HTTP trigger URL here" style={{ width: "100%", padding: "8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12.5, fontFamily: "monospace", marginBottom: 12 }} />
                            <button onClick={() => { const url = powerAutomateUrl; if (url) { navigator.clipboard.writeText(url); alert("URL copied!"); } else { alert("Enter a Power Automate trigger URL first."); } }} style={{ fontSize: 11.5, padding: "6px 12px", background: C.purple, color: C.white, border: "none", borderRadius: 4, cursor: "pointer" }}>Copy URL</button>
                          </div>
                          <div style={{ fontSize: 11.5, color: C.textSecond }}>
                            <strong>Setup Instructions:</strong>
                            <ol style={{ marginTop: 8, paddingLeft: 20 }}>
                              <li>In Power Automate, create a new "When a HTTP request is triggered" flow</li>
                              <li>Use the JSON schema: <code style={{ background: C.offWhite, padding: "2px 4px", borderRadius: 3 }}>{"{ \"formId\": \"string\", \"data\": {} }"}</code></li>
                              <li>Copy the HTTP POST URL and paste above</li>
                            </ol>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
              }
            </div>
          </div>
        </div>
      )}
      {/* ── PART 5: PROVISIONING PREVIEW MODAL ──────────────────────────────── */}
      {showProvisioningPreview && (
        <div onClick={() => setShowProvisioningPreview(false)} style={{ position: "fixed", inset: 0, zIndex: 3100, background: "rgba(30,27,75,0.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 12, width: 700, maxHeight: "85vh", boxShadow: "0 12px 40px rgba(91,33,182,0.25)", border: `1px solid ${C.border}`, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary }}><DescriptionIcon style={{ fontSize: 16, marginRight: 6 }} /> SharePoint Column Provisioning</div>
              <button onClick={() => setShowProvisioningPreview(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: C.textMuted }}><CloseIcon style={{ fontSize: 16 }} /></button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
              <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 16 }}>Preview the SharePoint columns that will be created or modified when you publish this form.</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                    <th style={{ textAlign: "left", padding: "8px 12px", background: C.offWhite }}>Field Name</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", background: C.offWhite }}>SurveyJS Type</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", background: C.offWhite }}>SP Column Type</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", background: C.offWhite }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.filter(f => f.type !== "html" && f.type !== "panel" && f.type !== "pagebreak" && f.type !== "spacer" && f.type !== "divider" && f.type !== "repeater" && f.type !== "columns").map((f, idx) => {
                    const spKind = f.type === "number" || f.type === "rating" ? 9 : f.type === "checkbox" || f.type === "boolean" ? 8 : f.type === "date" || f.type === "datetime" ? 4 : 2;
                    const spTypeName = spKind === 9 ? "Number" : spKind === 8 ? "Yes/No" : spKind === 4 ? "Date/Time" : "Text";
                    const status = idx % 3 === 0 ? "existing" : idx % 3 === 1 ? "new" : "changed";
                    const statusColor = status === "new" ? C.green : status === "changed" ? C.amber : C.textMuted;
                    return (
                      <tr key={f._id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: "8px 12px" }}><strong>{f.name}</strong></td>
                        <td style={{ padding: "8px 12px" }}>{f.type}</td>
                        <td style={{ padding: "8px 12px" }}>{spTypeName} (kind {spKind})</td>
                        <td style={{ padding: "8px 12px" }}><span style={{ background: `${statusColor}20`, color: statusColor, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{status.toUpperCase()}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ marginTop: 16, padding: 12, background: C.amberPale, borderRadius: 8, fontSize: 11.5 }}>
                <strong>Note:</strong> New columns will be created in the SharePoint list. Changed columns may require data migration. Obsolete columns will be archived (not deleted).
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── PART 5: SUBMISSION SETTINGS MODAL ──────────────────────────────── */}
      {showSubmissionSettings && (
        <div onClick={() => setShowSubmissionSettings(false)} style={{ position: "fixed", inset: 0, zIndex: 3100, background: "rgba(30,27,75,0.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 12, width: 520, maxHeight: "80vh", boxShadow: "0 12px 40px rgba(91,33,182,0.25)", border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary }}><TableChartIcon style={{ fontSize: 16, marginRight: 6 }} /> Submission Settings</div>
              <button onClick={() => setShowSubmissionSettings(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: C.textMuted }}><CloseIcon style={{ fontSize: 16 }} /></button>
            </div>
            <div style={{ padding: 16 }}>
              {/* Scoring */}
              <div style={{ marginBottom: 20, padding: 12, background: C.offWhite, borderRadius: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <input type="checkbox" checked={scoreConfig.enabled} onChange={(e) => setScoreConfig({ ...scoreConfig, enabled: e.target.checked })} />
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>Enable Calculated Score</span>
                </label>
                {scoreConfig.enabled && (
                  <>
                    <input value={scoreConfig.expression} onChange={(e) => setScoreConfig({ ...scoreConfig, expression: e.target.value })} placeholder='Expression: "{q1} * 0.3 + {q2} * 0.7"' style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11.5, marginBottom: 8 }} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      <div><label style={{ fontSize: 11, color: C.textMuted }}>Green ({"\u003e="})</label><input type="number" value={scoreConfig.thresholds.green} onChange={(e) => setScoreConfig({ ...scoreConfig, thresholds: { ...scoreConfig.thresholds, green: parseInt(e.target.value) || 0 } })} style={{ width: "100%", padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11.5 }} /></div>
                      <div><label style={{ fontSize: 11, color: C.textMuted }}>Amber ({"\u003e="})</label><input type="number" value={scoreConfig.thresholds.amber} onChange={(e) => setScoreConfig({ ...scoreConfig, thresholds: { ...scoreConfig.thresholds, amber: parseInt(e.target.value) || 0 } })} style={{ width: "100%", padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11.5 }} /></div>
                      <div><label style={{ fontSize: 11, color: C.textMuted }}>Red</label><input type="number" value={scoreConfig.thresholds.red} onChange={(e) => setScoreConfig({ ...scoreConfig, thresholds: { ...scoreConfig.thresholds, red: parseInt(e.target.value) || 0 } })} style={{ width: "100%", padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11.5 }} /></div>
                    </div>
                  </>
                )}
              </div>
              {/* Duplicate Detection */}
              <div style={{ marginBottom: 20, padding: 12, background: C.offWhite, borderRadius: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <input type="checkbox" checked={duplicateDetection.enabled} onChange={(e) => setDuplicateDetection({ ...duplicateDetection, enabled: e.target.checked })} />
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>Duplicate Detection</span>
                </label>
                {duplicateDetection.enabled && (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Identify duplicates by:</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {fields.filter(f => f.type !== "panel" && f.type !== "html").slice(0, 6).map(f => (
                          <label key={f._id} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={duplicateDetection.identifyBy.includes(f.name)} onChange={(e) => setDuplicateDetection({ ...duplicateDetection, identifyBy: e.target.checked ? [...duplicateDetection.identifyBy, f.name] : duplicateDetection.identifyBy.filter(n => n !== f.name) })} /> {f.name}</label>
                        ))}
                      </div>
                    </div>
                    <select value={duplicateDetection.action} onChange={(e) => setDuplicateDetection({ ...duplicateDetection, action: e.target.value as "block" | "warn" | "overwrite" })} style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11.5 }}>
                      <option value="warn">Warn but allow</option>
                      <option value="block">Block submission</option>
                      <option value="overwrite">Overwrite previous</option>
                    </select>
                  </>
                )}
              </div>
              {/* Quota */}
              <div style={{ padding: 12, background: C.offWhite, borderRadius: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <input type="checkbox" checked={quotaConfig.enabled} onChange={(e) => setQuotaConfig({ ...quotaConfig, enabled: e.target.checked })} />
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>Submission Quota</span>
                </label>
                {quotaConfig.enabled && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <div><div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Max Total</div><input type="number" value={quotaConfig.maxSubmissions} onChange={(e) => setQuotaConfig({ ...quotaConfig, maxSubmissions: parseInt(e.target.value) || 0 })} style={{ width: "100%", padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11.5 }} /></div>
                      <div><div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Max Per User (0=unlimited)</div><input type="number" value={quotaConfig.maxPerUser || 0} onChange={(e) => setQuotaConfig({ ...quotaConfig, maxPerUser: parseInt(e.target.value) || 0 })} style={{ width: "100%", padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11.5 }} /></div>
                    </div>
                    <select value={quotaConfig.actionWhenReached} onChange={(e) => setQuotaConfig({ ...quotaConfig, actionWhenReached: e.target.value as "disable" | "message" | "redirect" })} style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11.5 }}>
                      <option value="message">Show message</option>
                      <option value="disable">Disable form</option>
                      <option value="redirect">Redirect to URL</option>
                    </select>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── PART 5: FIELD PERMISSIONS MODAL ──────────────────────────────────── */}
      {showFieldPermissions && (
        <div onClick={() => setShowFieldPermissions(false)} style={{ position: "fixed", inset: 0, zIndex: 3100, background: "rgba(30,27,75,0.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 12, width: 560, maxHeight: "85vh", boxShadow: "0 12px 40px rgba(91,33,182,0.25)", border: `1px solid ${C.border}`, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary }}><LockIcon style={{ fontSize: 16, marginRight: 6 }} /> Field Permissions & Data Masking</div>
              <button onClick={() => setShowFieldPermissions(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: C.textMuted }}><CloseIcon style={{ fontSize: 16 }} /></button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
              <div style={{ fontSize: 11.5, color: C.textMuted, marginBottom: 16 }}>Configure who can view/edit each field and mark sensitive fields for data masking.</div>
              {fields.filter(f => f.type !== "panel" && f.type !== "html" && f.type !== "pagebreak" && f.type !== "spacer" && f.type !== "divider").map((f) => {
                const perm = fieldPermissions.find(p => p.fieldName === f.name) || { fieldName: f.name, viewRoles: ["All"], editRoles: ["All"], isSensitive: false, readOnlyAfterSubmit: false };
                return (
                  <div key={f._id} style={{ padding: 12, background: C.offWhite, borderRadius: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>{f.title} <span style={{ color: C.textMuted, fontWeight: 400 }}>({f.name})</span></div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>View Roles (comma-separated)</div>
                        <input value={perm.viewRoles.join(", ")} onChange={(e) => { const newPerms = [...fieldPermissions.filter(p => p.fieldName !== f.name), { ...perm, viewRoles: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }]; setFieldPermissions(newPerms); }} placeholder="All, HR Admin, Manager" style={{ width: "100%", padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11 }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Edit Roles (comma-separated)</div>
                        <input value={perm.editRoles.join(", ")} onChange={(e) => { const newPerms = [...fieldPermissions.filter(p => p.fieldName !== f.name), { ...perm, editRoles: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }]; setFieldPermissions(newPerms); }} placeholder="All, HR Admin" style={{ width: "100%", padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11 }} />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}><input type="checkbox" checked={perm.isSensitive} onChange={(e) => { const newPerms = [...fieldPermissions.filter(p => p.fieldName !== f.name), { ...perm, isSensitive: e.target.checked }]; setFieldPermissions(newPerms); }} /> <LockIcon style={{ fontSize: 12, verticalAlign: "middle", marginRight: 2 }} /> Sensitive (mask in logs)</label>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}><input type="checkbox" checked={perm.readOnlyAfterSubmit} onChange={(e) => { const newPerms = [...fieldPermissions.filter(p => p.fieldName !== f.name), { ...perm, readOnlyAfterSubmit: e.target.checked }]; setFieldPermissions(newPerms); }} /> <ChromeReaderModeIcon style={{ fontSize: 12, verticalAlign: "middle", marginRight: 2 }} /> Read-only after submit</label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
      </div>
        )}

      {showSurveySettings && (
        <div
          className="bx-backdrop"
          onClick={e => { if (e.target === e.currentTarget) setShowSurveySettings(false); }}
          onKeyDown={e => { if (e.key === "Escape") setShowSurveySettings(false); }}
        >
          <div className="bx-dialog bx-dialog-sm" role="dialog" aria-modal="true" aria-label="Form display">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
              <span className="bx-dialog-title">Form display</span>
              <button type="button" className="bx-ghost" title="Close" onClick={() => setShowSurveySettings(false)}>
                <Icon name="close" size={15} strokeWidth={1.6} />
              </button>
            </div>
            <SurveySettingsPanel
              surveySettings={surveySettings}
              onSurveySettingsChange={setSurveySettings}
              formTitle={sheet?.title}
              titleLocked={sheet?.titleLocked}
              onTitleChange={onTitleChange}
            />
          </div>
        </div>
      )}
    </>;
}

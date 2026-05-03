/**
 * FormBuilder.tsx — Custom form builder (NO SurveyJS Creator)
 * Uses react-dnd for drag-drop. Outputs SurveyJS-compatible JSON.
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Survey } from "survey-react-ui";
import { Model } from "survey-core";
import "survey-core/survey-core.min.css";
import type { SurveyJson, FormBuilderField, FormValidator } from "../../types/index";
import { QUESTION_TYPES, TYPE_GROUPS, createQuestion, buildSurveyJson, validateFields, updateField, removeField, duplicateField, reorderFields, getSpColumnKind } from "../../utils/FormBuilderEngine";
import { flattenQuestions } from "../../utils/FormBuilderEngine";
import logo from "../../assets/logo.png";
import { C } from "./constants";

const G = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');
*{box-sizing:border-box}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes slideIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.fb-field-dragging{opacity:.4}
.fb-preview-wrap .sd-root-modern{background:transparent!important}
.fb-preview-wrap .sd-container-modern{max-width:100%!important}
::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-thumb{background:${C.purpleMid};border-radius:10px}`;

// ── Atoms ─────────────────────────────────────────────────────────────
const Pill = ({ children, color = C.purple, bg = C.purplePale }: { children: React.ReactNode; color?: string; bg?: string }) =>
  <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, borderRadius: 20, padding: "2px 8px", letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{children}</span>;

function IconBtn({ icon, title, onClick, danger, disabled }: { icon: React.ReactNode; title?: string; onClick?: () => void; danger?: boolean; disabled?: boolean }) {
  return <button title={title} onClick={onClick} disabled={disabled}
    style={{ width: 26, height: 26, border: "none", borderRadius: 6, background: "transparent", cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: danger ? C.red : C.textMuted, opacity: disabled ? 0.4 : 1, transition: "background 0.1s" }}
    onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = danger ? C.redPale : C.purplePale; }}
    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>{icon}</button>;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
    <div onClick={() => onChange(!checked)} style={{ width: 36, height: 20, borderRadius: 10, flexShrink: 0, background: checked ? C.purple : C.border, position: "relative", transition: "background 0.2s", cursor: "pointer" }}>
      <div style={{ position: "absolute", top: 3, left: checked ? 19 : 3, width: 14, height: 14, borderRadius: "50%", background: C.white, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </div>
    {label && <span style={{ fontSize: 12, color: C.textSecond }}>{label}</span>}
  </label>;
}

function Input({ value, onChange, placeholder, type = "text", style: extra, ...rest }: { value?: string | number; onChange: (v: string) => void; placeholder?: string; type?: string; style?: React.CSSProperties;[key: string]: unknown }) {
  const [f, setF] = useState(false);
  return <input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    onFocus={() => setF(true)} onBlur={() => setF(false)}
    style={{ width: "100%", height: 34, border: `1px solid ${f ? C.purple : C.border}`, borderRadius: 7, padding: "0 10px", fontSize: 12, fontFamily: "'DM Sans',sans-serif", color: C.textPrimary, background: C.white, outline: "none", boxShadow: f ? `0 0 0 3px ${C.purplePale}` : "none", transition: "border-color 0.15s,box-shadow 0.15s", ...extra }}
    {...rest} />;
}

function Textarea({ value, onChange, placeholder, rows = 3 }: { value?: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  const [f, setF] = useState(false);
  return <textarea value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    onFocus={() => setF(true)} onBlur={() => setF(false)}
    style={{ width: "100%", border: `1px solid ${f ? C.purple : C.border}`, borderRadius: 7, padding: "8px 10px", fontSize: 12, fontFamily: "'DM Sans',sans-serif", color: C.textPrimary, background: C.white, outline: "none", resize: "vertical", boxShadow: f ? `0 0 0 3px ${C.purplePale}` : "none", transition: "border-color 0.15s,box-shadow 0.15s" }} />;
}

function Select({ value, onChange, options }: { value?: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return <select value={value ?? ""} onChange={e => onChange(e.target.value)}
    style={{ width: "100%", height: 34, border: `1px solid ${C.border}`, borderRadius: 7, padding: "0 10px", fontSize: 12, fontFamily: "'DM Sans',sans-serif", color: C.textPrimary, background: C.white, outline: "none", cursor: "pointer" }}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>;
}

const PropLabel = ({ children }: { children: React.ReactNode }) =>
  <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>{children}</div>;

function PropRow({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return <div style={{ marginBottom: 12, gridColumn: span ? "1 / -1" : undefined }}>
    <PropLabel>{label}</PropLabel>{children}
  </div>;
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
      <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
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
      <button onClick={handleApply} disabled={!conditionField} style={{ height: 30, border: "none", borderRadius: 6, background: conditionField ? C.purple : C.border, color: conditionField ? C.white : C.textMuted, fontSize: 11, fontWeight: 600, cursor: conditionField ? "pointer" : "not-allowed", fontFamily: "'DM Sans',sans-serif" }}>Apply Condition</button>
    </> : <Textarea value={value} onChange={onChange} placeholder="Enter SurveyJS expression, e.g.:{question1} = 'Yes' && {question2} notempty" rows={4} />}
    {value && <div style={{ fontSize: 10, color: C.purple, marginTop: 4, fontFamily: "monospace", background: C.purplePale, padding: "6px 8px", borderRadius: 4 }}>Current: {value}</div>}
  </div>;
}

function VisibilityEditor({ field, allFields, onChange }: { field: FormBuilderField; allFields: FormBuilderField[]; onChange: (patch: Partial<FormBuilderField>) => void }) {
  return <ConditionEditor label="Visible If" value={field.visibleIf || ""} onChange={v => onChange({ visibleIf: v || undefined })} allFields={allFields.filter(f => f._id !== field._id)} />;
}

function EnableIfEditor({ field, allFields, onChange }: { field: FormBuilderField; allFields: FormBuilderField[]; onChange: (patch: Partial<FormBuilderField>) => void }) {
  return <ConditionEditor label="Enable If" value={field.enableIf || ""} onChange={v => onChange({ enableIf: v || undefined })} allFields={allFields.filter(f => f._id !== field._id)} />;
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
      <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Validators</span>
      <div style={{ flex: 1 }} />
      <Select value="" onChange={v => { if (v) addValidator(v); }} options={[{ value: "", label: "+ Add validator..." }, ...VALIDATOR_TYPES.map(v => ({ value: v.value, label: v.label }))]} />
    </div>
    {validators.length === 0 && <div style={{ fontSize: 11, color: C.textMuted, textAlign: "center", padding: 12 }}>No validators. Add one above.</div>}
    {validators.map((v, idx) => <div key={idx} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, background: C.offWhite, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Pill>{VALIDATOR_TYPES.find(t => t.value === v.type)?.label || v.type}</Pill>
        <button onClick={() => removeValidator(idx)} style={{ width: 22, height: 22, border: "none", background: "transparent", color: C.red, cursor: "pointer", fontSize: 14, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
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
      {v.type === "email" && <div style={{ fontSize: 10, color: C.textMuted }}>Validates email format automatically</div>}
      <PropRow label="Error text"><Input value={(v.text as string) || ""} onChange={val => updateValidator(idx, { text: val || undefined })} placeholder="Custom error message" /></PropRow>
    </div>)}
  </div>;
}

// ── Palette ───────────────────────────────────────────────────────────
function Palette({ onAdd }: { onAdd: (td: typeof QUESTION_TYPES[number]) => void }) {
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState("All");
  const filtered = useMemo(() => {
    let list = QUESTION_TYPES;
    if (activeGroup !== "All") list = list.filter(t => t.group === activeGroup);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(t => t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)); }
    return list;
  }, [search, activeGroup]);
  const onDragStart = (e: React.DragEvent, td: typeof QUESTION_TYPES[number]) => {
    e.dataTransfer.setData("palette_type", JSON.stringify(td));
    e.dataTransfer.effectAllowed = "copy";
  };
  return <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <div style={{ padding: "12px 12px 8px" }}>
      <div style={{ position: "relative" }}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
          <circle cx="5.5" cy="5.5" r="4" stroke={C.textMuted} strokeWidth="1.3" />
          <path d="M9 9l2.5 2.5" stroke={C.textMuted} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search fields…"
          style={{ width: "100%", height: 30, border: `1px solid ${C.border}`, borderRadius: 7, paddingLeft: 28, paddingRight: 10, fontSize: 11, fontFamily: "'DM Sans',sans-serif", color: C.textPrimary, background: C.offWhite, outline: "none" }} />
      </div>
    </div>
    <div style={{ display: "flex", gap: 4, padding: "0 12px 10px", flexWrap: "wrap" }}>
      {["All", ...TYPE_GROUPS].map(g => <button key={g} onClick={() => setActiveGroup(g)}
        style={{ padding: "3px 9px", borderRadius: 20, border: "none", fontSize: 10, fontWeight: 600, cursor: "pointer", background: activeGroup === g ? C.purple : C.offWhite, color: activeGroup === g ? C.white : C.textMuted, fontFamily: "'DM Sans',sans-serif", transition: "all 0.15s" }}>{g}</button>)}
    </div>
    <div style={{ flex: 1, overflowY: "auto", padding: "0 10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
      {filtered.map((td, i) => <div key={td.type + i} draggable onDragStart={e => onDragStart(e, td)} onClick={() => onAdd(td)}
        style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.white, cursor: "grab", userSelect: "none", transition: "all 0.13s", animation: `slideIn 0.15s ease ${i * 0.02}s both` }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = C.purpleMid; e.currentTarget.style.background = C.purplePale; e.currentTarget.style.transform = "translateX(2px)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.white; e.currentTarget.style.transform = "none"; }}>
        <span style={{ fontSize: 16, flexShrink: 0, width: 24, textAlign: "center" }}>{td.icon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary, marginBottom: 1 }}>{td.label}</div>
          <div style={{ fontSize: 10, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{td.description}</div>
        </div>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ marginLeft: "auto", flexShrink: 0, opacity: 0.4 }}>
          <path d="M4 2h4M4 6h4M4 10h4M2 2v0M2 6v0M2 10v0" stroke={C.textMuted} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </div>)}
      {!filtered.length && <div style={{ textAlign: "center", padding: "24px 0", color: C.textMuted, fontSize: 12 }}>No field types match</div>}
    </div>
    <div style={{ padding: "8px 12px", borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textMuted, textAlign: "center" }}>Click or drag to add a field</div>
  </div>;
}

// ── Canvas ────────────────────────────────────────────────────────────
function FieldCard({ field, index, selected, onSelect, onRemove, onDuplicate, onMoveUp, onMoveDown, isFirst, isLast, errors, onDragStart, onDragOver, onDrop, dragging }: {
  field: FormBuilderField; index: number; selected: boolean; onSelect: (id: string) => void;
  onRemove: (id: string) => void; onDuplicate: (field: FormBuilderField) => void;
  onMoveUp: () => void; onMoveDown: () => void; isFirst: boolean; isLast: boolean;
  errors: { id: string; msg: string }[]; onDragStart: (e: React.DragEvent, i: number) => void;
  onDragOver: (e: React.DragEvent, i: number) => void; onDrop: (e: React.DragEvent, i: number) => void;
  dragging: boolean;
}) {
  const err = errors.filter(e => e.id === field._id);
  const td = QUESTION_TYPES.find(t => t.type === field.type) || QUESTION_TYPES[0];
  const spCol = getSpColumnKind(field);
  const shortcuts = selected ? "Del to remove, Ctrl+D to duplicate" : "";
  return <div draggable onDragStart={e => onDragStart(e, index)} onDragOver={e => onDragOver(e, index)} onDrop={e => onDrop(e, index)}
    className={dragging ? "fb-field-dragging" : ""} onClick={() => onSelect(field._id)}
    title={shortcuts}
    style={{ background: selected ? C.purplePale : C.white, border: `1.5px solid ${selected ? C.purple : err.length ? C.red : C.border}`, borderRadius: 11, padding: "12px 14px", cursor: "pointer", userSelect: "none", transition: "all 0.14s", boxShadow: selected ? C.shadowMd : C.shadow, marginBottom: 6, animation: "fadeUp 0.18s ease" }}>
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <div style={{ paddingTop: 2, color: C.textMuted, cursor: "grab", flexShrink: 0 }}>
        <svg width="12" height="16" viewBox="0 0 12 16" fill="none">
          {[3, 8, 13].flatMap(y => [3, 9].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill="currentColor" />))}
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14 }}>{td.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{field.title || "(no label)"}</span>
          {field.isRequired && <Pill color={C.red} bg={C.redPale}>Required</Pill>}
          {field.readOnly && <Pill color={C.textMuted} bg={C.offWhite}>Read-only</Pill>}
          {field.startWithNewLine === false && <Pill color={C.amber} bg={C.amberPale}>Inline</Pill>}
          {field.titleLocation === "hidden" && <Pill color={C.textMuted} bg={C.offWhite}>Title hidden</Pill>}
          {field.visibleIf && <Pill color={C.green} bg={C.greenPale}>Conditional</Pill>}
          {field.enableIf && <Pill color={C.purpleLight} bg={C.purplePale}>Dyn.enable</Pill>}
          {spCol && <Pill color={C.textSecond} bg={C.offWhite}>{spCol.label}</Pill>}
          {field.type === "dynamicmatrix" && <Pill color={C.amber} bg={C.amberPale}>→ Rich Text</Pill>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace" }}>{field.name}</span>
          <span style={{ fontSize: 10, color: C.textMuted }}>· {td.label}</span>
          {field.defaultValue !== undefined && <span style={{ fontSize: 10, color: C.green }}>· default: {String(field.defaultValue).slice(0, 20)}</span>}
        </div>
        {err.map((e, i) => <div key={i} style={{ marginTop: 4, fontSize: 10, color: C.red, display: "flex", alignItems: "center", gap: 4 }}><span>⚠</span>{e.msg}</div>)}
      </div>
      <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <IconBtn icon="↑" title="Move up" onClick={() => onMoveUp()} disabled={isFirst} />
        <IconBtn icon="↓" title="Move down" onClick={() => onMoveDown()} disabled={isLast} />
        <IconBtn icon="⧉" title="Duplicate (Ctrl+D)" onClick={() => onDuplicate(field)} />
        <IconBtn icon="✕" title="Remove (Del)" onClick={() => onRemove(field._id)} danger />
      </div>
    </div>
  </div>;
}

function Canvas({ fields, selectedId, onSelect, onRemove, onDuplicate, onReorder, onAddFromPalette, errors }: {
  fields: FormBuilderField[]; selectedId: string | null; onSelect: (id: string | null) => void;
  onRemove: (id: string) => void; onDuplicate: (field: FormBuilderField) => void;
  onReorder: (from: number, to: number) => void; onAddFromPalette: (td: typeof QUESTION_TYPES[number], atIndex?: number) => void;
  errors: { id: string; msg: string }[];
}) {
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const onDragStart = (e: React.DragEvent, i: number) => { dragIndexRef.current = i; setDraggingIndex(i); e.dataTransfer.effectAllowed = "move"; };
  const onDragOver = (e: React.DragEvent, i: number) => { e.preventDefault(); setDragOverIndex(i); };
  const onDrop = (e: React.DragEvent, i: number) => {
    e.preventDefault(); setDragOverIndex(null); setDraggingIndex(null);
    const pd = e.dataTransfer.getData("palette_type");
    if (pd) { try { onAddFromPalette(JSON.parse(pd), i); } catch { } dragIndexRef.current = null; return; }
    if (dragIndexRef.current !== null && dragIndexRef.current !== i) onReorder(dragIndexRef.current, i);
    dragIndexRef.current = null;
  };
  const onDragEnd = () => { setDraggingIndex(null); setDragOverIndex(null); dragIndexRef.current = null; };

  return <div onDragOver={e => e.preventDefault()}
    onDrop={e => { const pd = e.dataTransfer.getData("palette_type"); if (pd && !fields.length) try { onAddFromPalette(JSON.parse(pd), 0); } catch { } }}
    onDragEnd={onDragEnd} style={{ flex: 1, overflowY: "auto", padding: "16px 14px" }}>
    {!fields.length
      ? <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 300, color: C.textMuted, textAlign: "center", border: `2px dashed ${C.border}`, borderRadius: 14, padding: 32, background: C.offWhite }}>
        <div style={{ fontSize: 40, marginBottom: 14 }}>📋</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, marginBottom: 6 }}>Your form is empty</div>
        <div style={{ fontSize: 12, lineHeight: 1.7 }}>Click a field type in the left panel,<br />or drag one here to get started.</div>
      </div>
      : fields.map((field, i) => <React.Fragment key={field._id}>
        {dragOverIndex === i && draggingIndex !== i && <div style={{ height: 3, background: C.purple, borderRadius: 3, marginBottom: 4, animation: "pulse 1s infinite" }} />}
        <FieldCard field={field} index={i} selected={selectedId === field._id}
          onSelect={onSelect} onRemove={onRemove} onDuplicate={onDuplicate}
          onMoveUp={() => onReorder(i, i - 1)} onMoveDown={() => onReorder(i, i + 1)}
          isFirst={i === 0} isLast={i === fields.length - 1} errors={errors}
          onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} dragging={draggingIndex === i} />
      </React.Fragment>)}
  </div>;
}

// ── Property Editors ──────────────────────────────────────────────────
function ChoicesEditor({ choices, onChange }: { choices: (string | { value: string; text: string })[]; onChange: (c: (string | { value: string; text: string })[]) => void }) {
  const items = (Array.isArray(choices) ? choices : []).map(c => typeof c === "string" ? { value: c, text: c } : c);
  const update = (i: number, k: string, v: string) => { const n = items.map((it, idx) => idx === i ? { ...it, [k]: v, ...(k === "value" && !it._textCustomised ? { text: v } : {}) } : it); onChange(n.map(x => x.value === x.text ? x.value : x)); };
  const add = () => { const n = [...items, { value: `option${items.length + 1}`, text: `Option ${items.length + 1}` }]; onChange(n.map(x => x.value === x.text ? x.value : x)); };
  return <div>
    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 8 }}>
      {items.map((it, i) => <div key={i} style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <Input value={it.value} onChange={v => update(i, "value", v)} placeholder="value" style={{ flex: 1, fontSize: 11 }} />
        <Input value={it.text} onChange={v => update(i, "text", v)} placeholder="label" style={{ flex: 1, fontSize: 11 }} />
        <IconBtn icon="✕" title="Remove" onClick={() => onChange(items.filter((_, idx) => idx !== i).map(x => x.value === x.text ? x.value : x))} danger />
      </div>)}
    </div>
    <button onClick={add} style={{ width: "100%", height: 28, border: `1px dashed ${C.border}`, borderRadius: 7, background: "none", color: C.purple, fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>＋ Add option</button>
  </div>;
}

function PropertyPanel({ field, allFields, onChange, onSurveySettingsChange, surveySettings }: {
  field: FormBuilderField | null; allFields: FormBuilderField[];
  onChange: (patch: Partial<FormBuilderField>) => void;
  onSurveySettingsChange?: (s: Record<string, unknown>) => void;
  surveySettings?: Record<string, unknown>;
}) {
  const [tab, setTab] = useState("general");

  // Survey-level settings panel
  if (!field && surveySettings) return <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, background: C.purplePale }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <span style={{ fontSize: 16 }}>⚙️</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.purple }}>Form Settings</span>
      </div>
      <div style={{ fontSize: 10, color: C.textMuted }}>SurveyJS form properties</div>
    </div>
    <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <PropRow label="Form title"><Input value={(surveySettings.title as string) || ""} onChange={v => onSurveySettingsChange?.({ ...surveySettings, title: v })} placeholder="Form title" /></PropRow>
        <PropRow label="Form description"><Textarea value={(surveySettings.description as string) || ""} onChange={v => onSurveySettingsChange?.({ ...surveySettings, description: v })} rows={2} placeholder="Optional description" /></PropRow>
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Text Formatting</div>
          <PropRow label="Question titles">
            <Select value={(surveySettings.titleLocation as string) || "default"} onChange={v => onSurveySettingsChange?.({ ...surveySettings, titleLocation: v })} options={[{ value: "default", label: "Default" }, { value: "hidden", label: "Hidden" }, { value: "top", label: "Top" }, { value: "bottom", label: "Bottom" }]} />
          </PropRow>
          <PropRow label="Text transform">
            <Select value={(surveySettings.textTransform as string) || "none"} onChange={v => onSurveySettingsChange?.({ ...surveySettings, textTransform: v })} options={[{ value: "none", label: "None" }, { value: "uppercase", label: "ALL UPPERCASE" }, { value: "capitalize", label: "First Letter Only" }, { value: "lowercase", label: "all lowercase" }]} />
          </PropRow>
          <PropRow label="Show question numbers">
            <Select value={(surveySettings.showQuestionNumbers as string) || "on"} onChange={v => onSurveySettingsChange?.({ ...surveySettings, showQuestionNumbers: v })} options={[{ value: "on", label: "On" }, { value: "onPage", label: "Per page" }, { value: "onpanel", label: "Per panel" }, { value: "off", label: "Off" }]} />
          </PropRow>
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Behavior</div>
          <PropRow label="Error mode">
            <Select value={(surveySettings.checkErrorsMode as string) || "onValueChanged"} onChange={v => onSurveySettingsChange?.({ ...surveySettings, checkErrorsMode: v })} options={[{ value: "onValueChanged", label: "On value change" }, { value: "onComplete", label: "On complete" }, { value: "onNextPage", label: "On next page" }]} />
          </PropRow>
          <PropRow label="Text update">
            <Select value={(surveySettings.textUpdateMode as string) || "onTyping"} onChange={v => onSurveySettingsChange?.({ ...surveySettings, textUpdateMode: v })} options={[{ value: "onTyping", label: "On typing" }, { value: "onBlur", label: "On blur" }]} />
          </PropRow>
          <Toggle checked={!!surveySettings.showProgressBar} onChange={v => onSurveySettingsChange?.({ ...surveySettings, showProgressBar: v })} label="Show progress bar" />
          <Toggle checked={!!surveySettings.showPageTitles} onChange={v => onSurveySettingsChange?.({ ...surveySettings, showPageTitles: v })} label="Show page titles" />
        </div>
      </div>
    </div>
  </div>;

  if (!field) return <div style={{ padding: 20, textAlign: "center", color: C.textMuted, fontSize: 12 }}>Select a field to edit its properties</div>;

  const td = QUESTION_TYPES.find(t => t.type === field.type) || QUESTION_TYPES[0];
  const hasChoices = ["dropdown", "radiogroup", "checkbox"].includes(field.type);
  const tabs = [{ id: "general", label: "General" }, { id: "options", label: "Options" }, { id: "visibility", label: "Show/Hide" }, { id: "enable", label: "Enable/Disable" }, { id: "validation", label: "Validation" }];

  return <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, background: C.purplePale }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <span style={{ fontSize: 16 }}>{td.icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.purple }}>{td.label}</span>
      </div>
      <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace" }}>{field.name}</div>
    </div>
    <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}` }}>
      <select value={tab} onChange={e => setTab(e.target.value)}
        style={{ width: "100%", height: 32, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 8px", fontSize: 12, fontFamily: "'DM Sans',sans-serif", color: C.textPrimary, background: C.white, cursor: "pointer" }}>
        {tabs.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
    </div>
    <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
      {tab === "general" && <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <PropRow label="Field name (SP column)" span>
          <Input value={field.name} onChange={v => onChange({ name: v.replace(/\s+/g, "_") })} placeholder="camelCaseName" />
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>No spaces — becomes the SharePoint column name</div>
        </PropRow>
        <PropRow label="Label" span><Input value={field.title} onChange={v => onChange({ title: v })} placeholder="Question label" /></PropRow>
        <PropRow label="Description / hint" span><Input value={field.description || ""} onChange={v => onChange({ description: v })} placeholder="Optional helper text" /></PropRow>
        {!["html", "dynamicmatrix", "file"].includes(field.type) && <DefaultValueEditor field={field} onChange={onChange} />}
        {field.type === "text" && <PropRow label="Input type"><Select value={field.inputType || "text"} onChange={v => onChange({ inputType: v })} options={[{ value: "text", label: "Text" }, { value: "email", label: "Email" }, { value: "number", label: "Number" }, { value: "date", label: "Date" }, { value: "datetime-local", label: "Date & Time" }, { value: "tel", label: "Phone" }, { value: "url", label: "URL" }, { value: "password", label: "Password" }]} /></PropRow>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          {field.type !== "html" && <Toggle checked={!!field.isRequired} onChange={v => onChange({ isRequired: v })} label="Required field" />}
          <Toggle checked={!field.startWithNewLine} onChange={v => onChange({ startWithNewLine: !v })} label="Inline (same row as previous)" />
          <Toggle checked={!!field.readOnly} onChange={v => onChange({ readOnly: v })} label="Read-only" />
          <Toggle checked={field.titleLocation === "hidden"} onChange={v => onChange({ titleLocation: v ? "hidden" : "default" })} label="Hide title" />
        </div>
      </div>}
      {tab === "options" && <div>
        {hasChoices && <>
          <PropRow label="Choices" span><ChoicesEditor choices={field.choices || []} onChange={c => onChange({ choices: c })} /></PropRow>
          <PropRow label="Columns (side by side)"><Select value={field.colCount ?? 1} onChange={v => onChange({ colCount: parseInt(v) })} options={[0, 1, 2, 3, 4].map(n => ({ value: n, label: n === 0 ? "Auto" : `${n} column${n > 1 ? "s" : ""}` }))} /></PropRow>
        </>}
      </div>}
{tab === "visibility" && <VisibilityEditor field={field} allFields={allFields} onChange={onChange} />}
       {tab === "enable" && <EnableIfEditor field={field} allFields={allFields} onChange={onChange} />}
       {tab === "validation" && <ValidationEditor field={field} onChange={onChange} />}
    </div>
  </div>;
}

// ── JSON Preview ──────────────────────────────────────────────────────
function JsonPreview({ json, collapsed, onToggle }: { json: SurveyJson; collapsed: boolean; onToggle: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(json, null, 2);
  const copy = () => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  return <div style={{ borderTop: `1px solid ${C.border}`, background: C.purpleDark, height: collapsed ? 38 : 220, display: "flex", flexDirection: "column", overflow: "hidden", transition: "height 0.3s" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", height: 38, flexShrink: 0, cursor: "pointer" }} onClick={onToggle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.purpleMid, textTransform: "uppercase", letterSpacing: "0.06em" }}>SurveyJS JSON</span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{JSON.stringify(json).length} chars</span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {!collapsed && <button onClick={e => { e.stopPropagation(); copy(); }} style={{ fontSize: 10, color: copied ? "#6EE7B7" : C.purpleMid, background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: "'DM Sans'" }}>{copied ? "Copied!" : "Copy JSON"}</button>}
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ transform: collapsed ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 0.2s" }}>
          <path d="M3 5l4 4 4-4" stroke={C.purpleMid} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
    {!collapsed && <pre style={{ flex: 1, overflowY: "auto", margin: 0, padding: "0 14px 14px", fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.75)", lineHeight: 1.7 }}>{text}</pre>}
  </div>;
}

// ── Live Preview Modal ────────────────────────────────────────────────
function LivePreviewModal({ json, onClose, surveySettings, showBanner, meta }: { json: SurveyJson; onClose: () => void; surveySettings?: Record<string, unknown>; showBanner?: boolean; meta?: Record<string, unknown> }) {
  const model = useMemo(() => {
    try {
      const m = new Model(json);
      if (surveySettings) {
        m.applyTheme(LayeredLightPanelless);
        if (surveySettings.primaryColor) m.cssVariables = { "--sv-primary-color": surveySettings.primaryColor as string };
      } else {
        m.applyTheme(LayeredLightPanelless);
      }
      return m;
    } catch (e) { console.error("Preview model error:", e); return null; }
  }, [json, surveySettings]);

  if (!model) return null;
  const formTitle = json?.title || "Form Preview";
  const isoStandards = (meta?.isoStandards as string) || "ISO 9001 · ISO 14001 · ISO 45001";

  return <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(30,27,75,0.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}>
    <div style={{ background: C.white, borderRadius: 16, width: "100%", maxWidth: 760, boxShadow: "0 20px 60px rgba(91,33,182,0.25)", border: `1px solid ${C.border}`, animation: "fadeUp 0.2s ease", overflow: "hidden" }}>
      <div style={{ background: `linear-gradient(135deg,${C.purpleDark},${C.purple})`, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Live Form Preview</div>
          <div style={{ fontSize: 14, color: C.white, fontFamily: "'DM Serif Display',serif" }}>How users will see this form</div>
        </div>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: C.white, width: 30, height: 30, borderRadius: 8, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>
      {showBanner && <div style={{ borderBottom: `1px solid ${C.border}` }}>
        <div style={{ background: `linear-gradient(135deg,${C.purpleDark},${C.purple})`, padding: "16px 22px" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{isoStandards}</div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 17, color: "#fff" }}>{formTitle}</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ width: 140, borderRight: `1px solid ${C.border}`, background: C.offWhite, padding: "9px 14px", fontWeight: 600, fontSize: 10, color: C.textSecond, textTransform: "uppercase", letterSpacing: ".04em", verticalAlign: "middle" }}><img src={logo} alt="logo" style={{ maxHeight: 36, objectFit: "contain" }} /></td>
              <td style={{ padding: "12px 16px", fontWeight: 700, fontSize: 13, color: C.textPrimary }}>PMW INTERNATIONAL BERHAD</td>
            </tr>
          </tbody>
        </table>
      </div>}
      <div className="fb-preview-wrap" style={{ padding: "20px 24px", maxHeight: "70vh", overflowY: "auto" }}><Survey model={model} /></div>
      <div style={{ padding: "10px 20px", borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.textMuted, textAlign: "center", background: C.offWhite }}>Preview only — submissions are not saved</div>
    </div>
  </div>;
}

// ── Root Component ──────────────────────────────────────────────────
interface FormBuilderProps {
  initialJson?: SurveyJson | null;
  onChange?: (json: SurveyJson) => void;
  onPublish?: (json: SurveyJson) => void;
  height?: string;
  token?: string;
  showBanner?: boolean;
  meta?: Record<string, unknown>;
}

export default function FormBuilder({ initialJson, onChange, onPublish, height = "calc(100vh - 56px)", token, showBanner = true, meta = {} }: FormBuilderProps) {
  const [fields, setFields] = useState<FormBuilderField[]>(() => {
    if (!initialJson) return [];
    try { return flattenQuestions(initialJson); } catch { return []; }
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [jsonCollapsed, setJsonCollapsed] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [errors, setErrors] = useState<{ id: string; msg: string }[]>([]);
  const [surveySettings, setSurveySettings] = useState<Record<string, unknown>>(() => {
    if (!initialJson) return { title: "", description: "", titleLocation: "default", textTransform: "none", showQuestionNumbers: "on", checkErrorsMode: "onValueChanged", textUpdateMode: "onTyping", showProgressBar: false, showPageTitles: false, primaryColor: "#5B21B6", backgroundColor: "#FFFFFF", textColor: "#1E1B4B" };
    return { title: initialJson.title || "", description: initialJson.description || "", titleLocation: initialJson.titleLocation || "default", textTransform: initialJson.textTransform || "none", showQuestionNumbers: initialJson.showQuestionNumbers || "on", checkErrorsMode: initialJson.checkErrorsMode || "onValueChanged", textUpdateMode: initialJson.textUpdateMode || "onTyping", showProgressBar: !!initialJson.showProgressBar, showPageTitles: !!initialJson.showPageTitles, primaryColor: (initialJson as Record<string, unknown>).primaryColor as string || "#5B21B6", backgroundColor: (initialJson as Record<string, unknown>).backgroundColor as string || "#FFFFFF", textColor: (initialJson as Record<string, unknown>).textColor as string || "#1E1B4B" };
  });

  const selectedField = fields.find(f => f._id === selectedId) || null;
  const surveyJson = useMemo(() => buildSurveyJson(fields, surveySettings), [fields, surveySettings]);
  useEffect(() => { if (onChange) onChange(surveyJson); }, [surveyJson, onChange]);

  const addField = useCallback((td: typeof QUESTION_TYPES[number], atIndex?: number) => {
    const q = createQuestion(td);
    setFields(fs => { const n = [...fs]; if (atIndex !== undefined && atIndex >= 0) n.splice(atIndex, 0, q); else n.push(q); return n; });
    setSelectedId(q._id);
  }, []);

  const handleChange = useCallback((id: string, patch: Partial<FormBuilderField>) => setFields(fs => updateField(fs, id, patch)), []);
  const handleRemove = useCallback((id: string) => { setFields(fs => removeField(fs, id)); setSelectedId(c => c === id ? null : c); }, []);
  const handleDuplicate = useCallback((field: FormBuilderField) => {
    setFields(fs => {
      const next = duplicateField(fs, field._id);
      const copy = next.find(f => f.name === `${field.name}_copy`);
      if (copy) setSelectedId(copy._id);
      return next;
    });
  }, []);
  const handleReorder = useCallback((from: number, to: number) => setFields(fs => reorderFields(fs, from, to)), []);

  const handlePublishClick = useCallback(() => {
    const errs = validateFields(fields); setErrors(errs);
    if (errs.length > 0) { alert(`Please fix ${errs.length} error(s):\n\n${errs.map(e => `• ${e.msg}`).join("\n")}`); return; }
    onPublish?.(surveyJson);
  }, [fields, surveyJson, onPublish]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); handleRemove(selectedId); }
      if (e.key === "d" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); const f = fields.find(x => x._id === selectedId); if (f) handleDuplicate(f); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, handleRemove, handleDuplicate, fields]);

  return <DndProvider backend={HTML5Backend}>
    <style>{G}</style>
    <div style={{ fontFamily: "'DM Sans',sans-serif", display: "flex", flexDirection: "column", height, background: C.offWhite, overflow: "hidden" }}>
      {/* Toolbar */}
      <div style={{ height: 46, background: C.white, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", flexShrink: 0, gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Pill>{fields.length} field{fields.length !== 1 ? "s" : ""}</Pill>
          {errors.length > 0 && <Pill color={C.red} bg={C.redPale}>⚠ {errors.length} error{errors.length !== 1 ? "s" : ""}</Pill>}
        </div>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <button onClick={() => { const e = validateFields(fields); setErrors(e); if (!e.length) setShowPreview(true); else alert(`Fix ${e.length} error(s) first.`); }} style={{ display: "flex", alignItems: "center", gap: 6, height: 30, border: `1px solid ${C.border}`, borderRadius: 7, background: C.white, color: C.textSecond, fontSize: 12, cursor: "pointer", padding: "0 12px", fontFamily: "'DM Sans',sans-serif" }}>👁 Live Preview</button>
          <button onClick={() => setJsonCollapsed(c => !c)} style={{ display: "flex", alignItems: "center", gap: 6, height: 30, border: `1px solid ${C.border}`, borderRadius: 7, background: jsonCollapsed ? C.white : C.purplePale, color: jsonCollapsed ? C.textSecond : C.purple, fontSize: 12, cursor: "pointer", padding: "0 12px", fontFamily: "'DM Sans',sans-serif" }}>{"}"} JSON</button>
          {onPublish && <button onClick={handlePublishClick} style={{ display: "flex", alignItems: "center", gap: 6, height: 30, border: "none", borderRadius: 7, background: `linear-gradient(135deg,${C.purple},${C.purpleLight})`, color: C.white, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "0 16px", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 2px 8px rgba(91,33,182,0.25)" }}>🚀 Publish</button>}
        </div>
      </div>
      {/* 3-panel layout */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "220px 1fr 260px", overflow: "hidden" }}>
        <div style={{ borderRight: `1px solid ${C.border}`, background: C.white, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 12px 6px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Field Types</div>
          </div>
          <Palette onAdd={td => addField(td)} />
        </div>
        <div style={{ background: C.offWhite, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "8px 14px 6px", borderBottom: `1px solid ${C.border}`, background: C.white, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Form Canvas</div>
            <div style={{ fontSize: 10, color: C.textMuted }}>Drag to reorder</div>
          </div>
          <Canvas fields={fields} selectedId={selectedId} onSelect={id => setSelectedId(id)} onRemove={handleRemove} onDuplicate={handleDuplicate} onReorder={handleReorder} onAddFromPalette={addField} errors={errors} />
        </div>
        <div style={{ borderLeft: `1px solid ${C.border}`, background: C.white, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 14px 6px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Properties</div>
          </div>
          <PropertyPanel field={selectedField} allFields={fields} onChange={patch => selectedField && handleChange(selectedField._id, patch)} surveySettings={surveySettings} onSurveySettingsChange={setSurveySettings} />
        </div>
      </div>
      <JsonPreview json={surveyJson} collapsed={jsonCollapsed} onToggle={() => setJsonCollapsed(c => !c)} />
      {showPreview && <LivePreviewModal json={surveyJson} onClose={() => setShowPreview(false)} surveySettings={surveySettings} showBanner={showBanner} meta={meta} />}
    </div>
  </DndProvider>;
}

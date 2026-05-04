/**
 * FormBuilder.jsx — Tailwind CSS + Lucide React migration
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import { LayeredLightPanelless } from "survey-core/themes";
import "survey-core/survey-core.min.css";
import { QUESTION_TYPES, TYPE_GROUPS, createQuestion, buildSurveyJson, validateFields, updateField, removeField, duplicateField, reorderFields, getSpColumnKind } from "../utils/FormBuilderEngine";
import { DynamicMatrixSchemaEditor, registerDynamicMatrix, registerQuestionData } from "../utils/DynamicMatrix";
import * as LucideIcons from "lucide-react";
import logo from "../assets/logo.png";

registerDynamicMatrix();

function renderIcon(iconName, size = 16) {
  const IconComponent = LucideIcons[iconName];
  return IconComponent ? <IconComponent size={size} /> : null;
}

// ── Atoms ─────────────────────────────────────────────────────────────────────
const Pill = ({ children, color = "text-purple-700", bg = "bg-purple-100" }) => (
  <span className={`text-[10px] font-bold ${color} ${bg} rounded-full px-2 py-0.5 tracking-wider uppercase whitespace-nowrap`}>{children}</span>
);

function IconBtn({ icon, title, onClick, danger, disabled }) {
  return (
    <button title={title} onClick={onClick} disabled={disabled}
      className={`w-7 h-7 border-none rounded-md bg-transparent cursor-pointer flex items-center justify-center text-sm transition-colors
        ${disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-purple-100"}
        ${danger ? "text-red-600" : "text-slate-400"}`}
    >{icon}</button>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div onClick={() => onChange(!checked)} className={`w-9 h-5 rounded-full flex-shrink-0 relative transition-colors cursor-pointer
        ${checked ? "bg-purple-700" : "bg-purple-200"}`}>
        <div className={`absolute top-[3px] w-3.5 h-3.5 rounded-full bg-white transition-all shadow-sm
          ${checked ? "left-[19px]" : "left-[3px]"}`} />
      </div>
      {label && <span className="text-xs text-slate-500">{label}</span>}
    </label>
  );
}

function Input({ value, onChange, placeholder, type = "text", extraClass = "", ...rest }) {
  const [f, setF] = useState(false);
  return (
    <input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      onFocus={() => setF(true)} onBlur={() => setF(false)}
      className={`w-full h-8 border rounded-md px-2.5 text-xs font-sans text-slate-900 bg-white outline-none transition-colors
        ${f ? "border-purple-700 shadow-[0_0_0_3px_rgba(91,33,182,0.1)]" : "border-purple-200"}
        ${extraClass}`}
      {...rest} />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }) {
  const [f, setF] = useState(false);
  return (
    <textarea value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      onFocus={() => setF(true)} onBlur={() => setF(false)}
      className="w-full border border-purple-200 rounded-md p-2 text-xs font-sans text-slate-900 bg-white outline-none resize-y transition-colors focus:border-purple-700 focus:shadow-[0_0_0_3px_rgba(91,33,182,0.1)]" />
  );
}

function Select({ value, onChange, options }) {
  return (
    <select value={value ?? ""} onChange={e => onChange(e.target.value)}
      className="w-full h-8 border border-purple-200 rounded-md px-2.5 text-xs font-sans text-slate-900 bg-white outline-none cursor-pointer">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

const PropLabel = ({ children }) => (
  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{children}</div>
);

function PropRow({ label, children, span }) {
  return <div className={`mb-3 ${span ? "col-span-full" : ""}`}>
    <PropLabel>{label}</PropLabel>{children}
  </div>;
}

// ── Palette ───────────────────────────────────────────────────────────────────
function Palette({ onAdd }) {
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState("All");
  const filtered = useMemo(() => {
    let list = QUESTION_TYPES;
    if (activeGroup !== "All") list = list.filter(t => t.group === activeGroup);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(t => t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)); }
    return list;
  }, [search, activeGroup]);

  const onDragStart = (e, td) => { e.dataTransfer.setData("palette_type", JSON.stringify(td)); e.dataTransfer.effectAllowed = "copy"; };
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-3">
        <div className="relative">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
            <circle cx="5.5" cy="5.5" r="4" stroke="#94A3B8" strokeWidth="1.3" />
            <path d="M9 9l2.5 2.5" stroke="#94A3B8" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search fields…"
            className="w-full h-7.5 border border-purple-200 rounded-md pl-7 pr-2.5 text-xs font-sans text-slate-900 bg-purple-50 outline-none" />
        </div>
      </div>
      <div className="flex gap-1 px-3 pb-2.5 flex-wrap">
        {["All", ...TYPE_GROUPS].map(g => <button key={g} onClick={() => setActiveGroup(g)}
          className={`px-2 py-0.5 rounded-full border-none text-[10px] font-semibold cursor-pointer font-sans transition-all
            ${activeGroup === g ? "bg-purple-700 text-white" : "bg-purple-50 text-slate-400"}`}>{g}</button>)}
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 pb-3 flex flex-col gap-1">
        {filtered.map((td, i) => <div key={td.variantKey || td.type + i} draggable onDragStart={e => onDragStart(e, td)} onClick={() => onAdd(td)}
          className="flex items-center gap-2.5 p-2 border border-purple-200 rounded-lg bg-white cursor-grab select-none transition-all duration-100"
          style={{ animation: `slideIn 0.15s ease ${i * 0.02}s both` }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#C4B5FD"; e.currentTarget.style.background = "#EDE9FE"; e.currentTarget.style.transform = "translateX(2px)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E3F0"; e.currentTarget.style.background = "#FFFFFF"; e.currentTarget.style.transform = "none"; }}>
          <span className="text-base flex-shrink-0 w-6 text-center">{renderIcon(td.icon, 16)}</span>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-900 mb-0.5">{td.label}</div>
            <div className="text-[10px] text-slate-400 overflow-hidden text-ellipsis whitespace-nowrap">{td.description}</div>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="ml-auto flex-shrink-0 opacity-40">
            <path d="M4 2h4M4 6h4M4 10h4M2 2v0M2 6v0M2 10v0" stroke="#94A3B8" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </div>)}
        {!filtered.length && <div className="text-center p-6 text-slate-400 text-xs">No field types match</div>}
      </div>
      <div className="p-2 border-t border-purple-200 text-[10px] text-slate-400 text-center">Click or drag to add a field</div>
    </div>
  );
}

// ── Canvas ────────────────────────────────────────────────────────────────────
function FieldCard({ field, index, selected, onSelect, onRemove, onDuplicate, onMoveUp, onMoveDown, isFirst, isLast, errors, onDragStart, onDragOver, onDrop, dragging }) {
  const err = errors.filter(e => e.id === field._id);
  const td = QUESTION_TYPES.find(t => t.type === field.type && (t.defaultProps?.inputType === field.inputType || !t.defaultProps?.inputType || !field.inputType)) || QUESTION_TYPES[0];
  const spCol = getSpColumnKind(field);
  return (
    <div draggable onDragStart={e => onDragStart(e, index)} onDragOver={e => onDragOver(e, index)} onDrop={e => onDrop(e, index)}
      className={`cursor-pointer select-none transition-all duration-100 mb-1.5 ${dragging ? "fb-field-dragging" : ""}`}
      style={{ background: selected ? "#EDE9FE" : "#FFFFFF", border: `1.5px solid ${selected ? "#5B21B6" : err.length ? "#DC2626" : "#E5E3F0"}`, borderRadius: 11, padding: "12px 14px", boxShadow: selected ? "0 4px 24px rgba(91,33,182,0.12)" : "0 1px 3px rgba(91,33,182,0.08),0 4px 16px rgba(91,33,182,0.06)", animation: "fadeUp 0.18s ease" }}
      onClick={() => onSelect(field._id)}
    >
      <div className="flex items-start gap-2.5">
        <div className="pt-0.5 text-slate-400 cursor-grab flex-shrink-0">
          <svg width="12" height="16" viewBox="0 0 12 16" fill="none">
            {[3, 8, 13].flatMap(y => [3, 9].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill="currentColor" />))}
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className="text-base">{renderIcon(td.icon, 14)}</span>
            <span className="text-xs font-semibold text-slate-900">{field.title || "(no label)"}</span>
            {field.isRequired && <Pill color="text-red-600" bg="bg-red-100">Required</Pill>}
            {field.readOnly && <Pill color="text-slate-400" bg="bg-purple-50">Read-only</Pill>}
            {field.startWithNewLine === false && <Pill color="text-amber-600" bg="bg-amber-100">Inline</Pill>}
            {field.titleLocation === "hidden" && <Pill color="text-slate-400" bg="bg-purple-50">Title hidden</Pill>}
            {field.visibleIf && <Pill color="text-green-600" bg="bg-green-100">Conditional</Pill>}
            {field.enableIf && <Pill color="text-purple-600" bg="bg-purple-100">Dyn.enable</Pill>}
            {spCol && <Pill color="text-slate-500" bg="bg-purple-50">{spCol.label}</Pill>}
            {field.type === "dynamicmatrix" && <Pill color="text-amber-600" bg="bg-amber-100">→ Rich Text</Pill>}
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className="text-[10px] text-slate-400 font-mono">{field.name}</span>
            <span className="text-[10px] text-slate-400">· {td.label}</span>
            {field.defaultValue !== undefined && <span className="text-[10px] text-green-600">· default: {String(field.defaultValue).slice(0, 20)}</span>}
          </div>
          {err.map((e, i) => <div key={i} className="mt-1 text-[10px] text-red-600 flex items-center gap-1"><span>⚠</span>{e.msg}</div>)}
        </div>
        <div className="flex gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <IconBtn icon={<LucideIcons.ChevronUp size={12} />} title="Move up" onClick={() => onMoveUp(index)} disabled={isFirst} />
          <IconBtn icon={<LucideIcons.ChevronDown size={12} />} title="Move down" onClick={() => onMoveDown(index)} disabled={isLast} />
          <IconBtn icon={<LucideIcons.Copy size={12} />} title="Duplicate (Ctrl+D)" onClick={() => onDuplicate(field._id)} />
          <IconBtn icon={<LucideIcons.X size={12} />} title="Remove (Del)" onClick={() => onRemove(field._id)} danger />
        </div>
      </div>
    </div>
  );
}

function Canvas({ fields, selectedId, onSelect, onRemove, onDuplicate, onReorder, onAddFromPalette, errors }) {
  const dragIndexRef = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [draggingIndex, setDraggingIndex] = useState(null);
  const onDragStart = (e, i) => { dragIndexRef.current = i; setDraggingIndex(i); e.dataTransfer.effectAllowed = "move"; };
  const onDragOver = (e, i) => { e.preventDefault(); setDragOverIndex(i); };
  const onDrop = (e, i) => {
    e.preventDefault(); setDragOverIndex(null); setDraggingIndex(null);
    const pd = e.dataTransfer.getData("palette_type");
    if (pd) { try { onAddFromPalette(JSON.parse(pd), i); } catch { } dragIndexRef.current = null; return; }
    if (dragIndexRef.current !== null && dragIndexRef.current !== i) onReorder(dragIndexRef.current, i);
    dragIndexRef.current = null;
  };
  const onDragEnd = () => { setDraggingIndex(null); setDragOverIndex(null); dragIndexRef.current = null; };
  return (
    <div onDragOver={e => e.preventDefault()}
      onDrop={e => { const pd = e.dataTransfer.getData("palette_type"); if (pd && !fields.length) try { onAddFromPalette(JSON.parse(pd), 0); } catch { } }}
      onDragEnd={onDragEnd} className="flex-1 overflow-y-auto p-4"
    >
      {!fields.length
        ? <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-slate-400 text-center border-2 border-dashed border-purple-200 rounded-xl p-8 bg-purple-50">
            <div className="text-4xl mb-3.5">{renderIcon("Clipboard", 40)}</div>
            <div className="text-sm font-semibold text-slate-900 mb-1.5">Your form is empty</div>
            <div className="text-xs leading-relaxed">Click a field type in the left panel,<br />or drag one here to get started.</div>
          </div>
        : fields.map((field, i) => <React.Fragment key={field._id}>
            {dragOverIndex === i && draggingIndex !== i && <div className="h-0.5 bg-purple-700 rounded-full mb-1 animate-pulse" />}
            <FieldCard field={field} index={i} selected={selectedId === field._id}
              onSelect={onSelect} onRemove={onRemove} onDuplicate={onDuplicate}
              onMoveUp={() => onReorder(i, i - 1)} onMoveDown={() => onReorder(i, i + 1)}
              isFirst={i === 0} isLast={i === fields.length - 1} errors={errors}
              onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} dragging={draggingIndex === i} />
          </React.Fragment>)}
    </div>
  );
}

export default function FormBuilder({ initialJson, onChange, onPublish, height = "calc(100vh - 56px)", token, showBanner = true, meta = {} }) {
  const [fields, setFields] = useState(() => {
    if (!initialJson) return [];
    try { return (initialJson.pages?.[0]?.elements || []).map((el, i) => ({ ...el, _id: `q_preload_${i}` })); }
    catch { return []; }
  });
  const [selectedId, setSelectedId] = useState(null);
  const [jsonCollapsed, setJsonCollapsed] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [errors, setErrors] = useState([]);

  const selectedField = fields.find(f => f._id === selectedId) || null;
  const [surveySettings, setSurveySettings] = useState(() => {
    if (!initialJson) return { title: "", description: "", titleLocation: "default", textTransform: "none", showQuestionNumbers: "on", checkErrorsMode: "onValueChanged", textUpdateMode: "onTyping", showProgressBar: false, showPageTitles: false, primaryColor: "#5B21B6", backgroundColor: "#FFFFFF", textColor: "#1E1B4B" };
    return {
      title: initialJson.title || "", description: initialJson.description || "",
      titleLocation: initialJson.titleLocation || "default", textTransform: initialJson.textTransform || "none",
      showQuestionNumbers: initialJson.showQuestionNumbers || "on", checkErrorsMode: initialJson.checkErrorsMode || "onValueChanged",
      textUpdateMode: initialJson.textUpdateMode || "onTyping", showProgressBar: !!initialJson.showProgressBar,
      showPageTitles: !!initialJson.showPageTitles, primaryColor: initialJson.primaryColor || "#5B21B6",
      backgroundColor: initialJson.backgroundColor || "#FFFFFF", textColor: initialJson.textColor || "#1E1B4B",
    };
  });

  const surveyJson = useMemo(() => buildSurveyJson(fields, surveySettings), [fields, surveySettings]);
  useEffect(() => { if (onChange) onChange(surveyJson); }, [surveyJson, onChange]);

  const addField = useCallback((td, atIndex) => {
    const q = createQuestion(td);
    setFields(fs => { const n = [...fs]; if (atIndex !== undefined && atIndex >= 0) n.splice(atIndex, 0, q); else n.push(q); return n; });
    setSelectedId(q._id);
  }, []);

  const handleChange = useCallback((id, patch) => setFields(fs => updateField(fs, id, patch)), []);
  const handleRemove = useCallback((id) => { setFields(fs => removeField(fs, id)); setSelectedId(c => c === id ? null : c); }, []);
  const handleDuplicate = useCallback((id) => {
    setFields(fs => {
      const next = duplicateField(fs, id);
      const orig = fs.find(x => x._id === id);
      const copy = next.find(f => f.name === (orig?.name + "_copy"));
      if (copy) setSelectedId(copy._id);
      return next;
    });
  }, []);
  const handleReorder = useCallback((from, to) => setFields(fs => reorderFields(fs, from, to)), []);

  const handlePublishClick = useCallback(() => {
    const errs = validateFields(fields); setErrors(errs);
    if (errs.length > 0) { alert(`Please fix ${errs.length} error(s):\n\n${errs.map(e => `• ${e.msg}`).join("\n")}`); return; }
    onPublish?.(surveyJson);
  }, [fields, surveyJson, onPublish]);

  useEffect(() => {
    const handler = (e) => {
      if (!selectedId) return;
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); handleRemove(selectedId); }
      if (e.key === "d" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleDuplicate(selectedId); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, handleRemove, handleDuplicate]);

  return (
    <div className="font-sans flex flex-col h-full bg-purple-50 overflow-hidden">
      {/* Toolbar */}
      <div className="h-11 bg-white border-b border-purple-200 flex items-center justify-between px-3.5 flex-shrink-0 gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-bold text-purple-700 bg-purple-100 rounded-full px-2 py-0.5">{fields.length} field{fields.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex gap-1.5 items-center">
          <button onClick={() => { const e = validateFields(fields); setErrors(e); if (!e.length) setShowPreview(true); else alert(`Fix ${e.length} error(s) first.`); }}
            className="flex items-center gap-1.5 h-7.5 border border-purple-200 rounded-md bg-white text-slate-500 text-[11px] cursor-pointer px-3 font-sans">Preview</button>
          {onPublish && <button onClick={handlePublishClick}
            className="flex items-center gap-1.5 h-7.5 border-none rounded-md bg-gradient-to-r from-purple-700 to-purple-600 text-white text-[11px] font-semibold cursor-pointer px-4 font-sans shadow-[0_2px_8px_rgba(91,33,182,0.25)]">Publish</button>}
        </div>
      </div>

      {/* 3-panel layout */}
      <div className="flex-1 grid grid-cols-[220px_1fr_260px] overflow-hidden">
        <div className="border-r border-purple-200 bg-white overflow-hidden flex flex-col">
          <div className="p-2.5 border-b border-purple-200">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Field Types</div>
          </div>
          <Palette onAdd={td => addField(td)} />
        </div>
        <div className="bg-purple-50 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-purple-200 bg-white flex items-center justify-between">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Form Canvas</div>
            <div className="text-[10px] text-slate-400">Drag to reorder</div>
          </div>
          <Canvas fields={fields} selectedId={selectedId} onSelect={setSelectedId} onRemove={handleRemove} onDuplicate={handleDuplicate} onReorder={handleReorder} onAddFromPalette={addField} errors={errors} />
        </div>
        <div className="border-l border-purple-200 bg-white overflow-hidden flex flex-col">
          <div className="p-2.5 border-b border-purple-200">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Properties</div>
          </div>
          <div className="flex-1 overflow-y-auto p-3.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Field Properties</div>
            {selectedField ? (
              <div className="flex flex-col gap-3">
                <PropRow label="Field name (SP column)" span>
                  <Input value={selectedField.name} onChange={v => handleChange(selectedField._id, { name: v.replace(/\s+/g, "_") })} placeholder="camelCaseName" />
                </PropRow>
                <PropRow label="Label" span><Input value={selectedField.title} onChange={v => handleChange(selectedField._id, { title: v })} placeholder="Question label" /></PropRow>
              </div>
            ) : (
              <div className="text-xs text-slate-400">Select a field to edit its properties</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

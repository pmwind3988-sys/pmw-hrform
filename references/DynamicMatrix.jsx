/**
 * DynamicMatrix.jsx
 * ─────────────────────────────────────────────────────────────────────
 * A respondent-facing dynamic matrix where users can add/remove rows at
 * runtime. Each column has an admin-configured data type.
 *
 * Used in two contexts:
 *   1. FormBuilder (admin) — column schema editor in the Properties panel
 *   2. DynamicFormPage / SurveyJS (respondent) — as a custom question renderer
 *
 * SP Storage:
 *   Two columns per matrix field in the submission list:
 *     {name}_Html  — rendered HTML table string (MultiLine rich text)
 *     {name}_Json  — JSON string of row data (MultiLine text for querying)
 *
 * Usage as SurveyJS custom question:
 *   Register in your form page:
 *     import { registerDynamicMatrix } from "./DynamicMatrix";
 *     registerDynamicMatrix(); // call once before Survey renders
 *
 * Admin schema shape (stored in surveyJson element):
 *   {
 *     type: "dynamicmatrix",
 *     name: "trainingNeeds",
 *     title: "Training Needs",
 *     columns: [
 *       { name: "programme",  title: "Programme Name", cellType: "text" },
 *       { name: "provider",   title: "Provider",       cellType: "text" },
 *       { name: "cost",       title: "Cost (RM)",      cellType: "number" },
 *       { name: "startDate",  title: "Start Date",     cellType: "date" },
 *       { name: "status",     title: "Status",
 *         cellType: "dropdown", choices: ["Planned","In Progress","Completed"] },
 *     ],
 *     minRows: 1,
 *     maxRows: 20,
 *     addRowText: "Add Row",
 *   }
 */




import React, { useState, useCallback, useEffect, useRef } from "react";
import { ElementFactory, Question, Serializer } from "survey-core";
import { ReactQuestionFactory } from "survey-react-ui";

const C = {
    purple: "#5B21B6",
    purpleLight: "#7C3AED",
    purplePale: "#EDE9FE",
    purpleMid: "#DDD6FE",
    white: "#FFFFFF",
    offWhite: "#F8F7FF",
    border: "#E5E3F0",
    textPrimary: "#1E1B4B",
    textSecond: "#6B7280",
    textMuted: "#9CA3AF",
    red: "#DC2626",
    redPale: "#FEE2E2",
    green: "#059669",
    greenPale: "#D1FAE5",
};

// Module-level store — surveyJson keyed by a unique survey+question id
const _questionDataRegistry = new Map();

export function registerQuestionData(surveyJson) {
    const elements = (surveyJson?.pages ?? []).flatMap(p => p.elements ?? []);
    for (const el of elements) {
        if (el.type === "dynamicmatrix" && el.name) {
            _questionDataRegistry.set(el.name, el);
        }
    }
}

export function getQuestionData(name) {
    return _questionDataRegistry.get(name) ?? null;
}
// ─────────────────────────────────────────────────────────────────────
//  Convert row data → HTML table string (for SP rich-text column)
// ─────────────────────────────────────────────────────────────────────
export function rowsToHtml(columns, rows) {
    const headers = columns.map(c => `<th style="border:1px solid #c4b5fd;padding:6px 10px;background:#ede9fe;font-size:11px;font-weight:600;color:#5b21b6;text-align:left">${c.title}</th>`).join("");
    const bodyRows = rows.map(row => {
        const cells = columns.map(c => {
            const val = row[c.name];
            const display = Array.isArray(val) ? val.join(", ") : (val ?? "");
            return `<td style="border:1px solid #e5e3f0;padding:6px 10px;font-size:12px;color:#1e1b4b">${display}</td>`;
        }).join("");
        return `<tr>${cells}</tr>`;
    }).join("");
    return `<table style="border-collapse:collapse;width:100%;font-family:sans-serif"><thead><tr>${headers}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

// ─────────────────────────────────────────────────────────────────────
//  Cell renderer (single cell in a row)
// ─────────────────────────────────────────────────────────────────────
function Cell({ col, value, onChange, readOnly }) {
    const base = {
        width: "100%", border: "none", background: "transparent",
        fontSize: 12, fontFamily: "'DM Sans', sans-serif", color: C.textPrimary,
        outline: "none", padding: "0 4px",
    };

    if (readOnly) {
        // Display array values as comma-separated
        const display = Array.isArray(value) ? value.join(", ") : (value ?? "");
        return <span style={{ fontSize: 12, color: C.textPrimary }}>{display}</span>;
    }

    // Multi-select dropdown
    if (col.cellType === "dropdown" && col.multiSelect) {
        const values = Array.isArray(value) ? value : [];
        return (
            <select multiple value={values} onChange={e => {
                const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                onChange(selected);
            }} style={{ ...base, cursor: "pointer", minHeight: 28 }}>
                {(col.choices || []).map(ch => (
                    <option key={ch} value={ch}>{ch}</option>
                ))}
            </select>
        );
    }

    if (col.cellType === "dropdown") {
        return (
            <select value={value ?? ""} onChange={e => onChange(e.target.value)}
                style={{ ...base, cursor: "pointer" }}>
                <option value="">—</option>
                {(col.choices || []).map(ch => (
                    <option key={ch} value={ch}>{ch}</option>
                ))}
            </select>
        );
    }

    if (col.cellType === "date") {
        return <input type="date" value={value ?? ""} onChange={e => onChange(e.target.value)} style={base} />;
    }

    if (col.cellType === "number") {
        return <input type="number" value={value ?? ""} onChange={e => onChange(e.target.value)} step="any" style={base} />;
    }

    // Checkbox with choices (multi-checkbox)
    if (col.cellType === "checkbox" && col.choices) {
        const values = Array.isArray(value) ? value : [];
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {(col.choices || []).map(ch => (
                    <label key={ch} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                        <input
                            type="checkbox"
                            checked={values.includes(ch)}
                            onChange={e => {
                                const next = e.target.checked
                                    ? [...values, ch]
                                    : values.filter(v => v !== ch);
                                onChange(next);
                            }}
                            style={{ accentColor: C.purple }}
                        />
                        {ch}
                    </label>
                ))}
            </div>
        );
    }

    // Single checkbox (boolean-like)
    if (col.cellType === "checkbox") {
        return (
            <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)}
                style={{ width: 16, height: 16, cursor: "pointer", accentColor: C.purple }} />
        );
    }

    if (col.cellType === "boolean") {
        return (
            <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)}
                style={{ width: 16, height: 16, cursor: "pointer", accentColor: C.purple }} />
        );
    }

    // Default: text
    return <input type="text" value={value ?? ""} onChange={e => onChange(e.target.value)} style={base} />;
}

// ─────────────────────────────────────────────────────────────────────
//  DynamicMatrixInput — the respondent-facing interactive table
// ─────────────────────────────────────────────────────────────────────
export function DynamicMatrixInput({ columns = [], minRows = 1, maxRows = 20, addRowText = "Add Row", value, onChange, readOnly }) {

    const makeRow = useCallback(() =>
        Object.fromEntries((columns || []).map(c => [c.name, ""])),
        [columns]
    );

    const [rows, setRows] = useState(() => {
        if (value?.rows?.length) return value.rows;
        const count = Math.max(minRows, 1);
        return Array.from({ length: count }, () =>
            Object.fromEntries((columns || []).map(c => [c.name, ""]))
        );
    });

    // Reset rows when columns change (e.g. after hydration)
    const prevColKey = useRef("");
    useEffect(() => {
        const key = (columns || []).map(c => c.name).join(",");
        if (key && key !== prevColKey.current) {
            prevColKey.current = key;
            setRows(prev => {
                // Keep existing values where column names match
                const count = Math.max(prev.length, minRows);
                return Array.from({ length: count }, (_, i) =>
                    Object.fromEntries((columns || []).map(c => [c.name, prev[i]?.[c.name] ?? ""]))
                );
            });
        }
    }, [columns, minRows]);

    const push = (newRows) => {
        setRows(newRows);
        if (columns.length > 0) {
            const html = rowsToHtml(columns, newRows);
            onChange?.({ rows: newRows, html, json: JSON.stringify(newRows) });
        }
    };

    const addRow = () => {
        if (rows.length >= maxRows) return;
        push([...rows, makeRow()]);
    };

    const removeRow = (i) => {
        if (rows.length <= minRows) return;
        push(rows.filter((_, idx) => idx !== i));
    };

    const updateCell = (rowIdx, colName, val) => {
        push(rows.map((r, i) => i === rowIdx ? { ...r, [colName]: val } : r));
    };

    // Guard: if no columns yet, show a placeholder
    if (!columns || columns.length === 0) {
        return (
            <div style={{ padding: "12px 16px", border: `1px dashed ${C.border}`, borderRadius: 8, color: C.textMuted, fontSize: 12 }}>
                No columns defined. Add columns in the Options tab.
            </div>
        );
    }

    const colWidth = `${Math.floor(100 / (columns.length + (readOnly ? 0 : 1)))}%`;

    return (
        <div style={{ width: "100%", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: columns.length * 120 }}>
                <thead>
                    <tr>
                        {columns.map(col => (
                            <th key={col.name} style={{
                                padding: "8px 10px", background: C.purplePale,
                                border: `1px solid ${C.purpleMid}`,
                                fontSize: 11, fontWeight: 700, color: C.purple,
                                textAlign: "left", width: colWidth, whiteSpace: "nowrap",
                            }}>
                                {col.title || col.name}
                                {col.cellType && col.cellType !== "text" && (
                                    <span style={{ marginLeft: 4, fontSize: 9, color: C.textMuted, textTransform: "uppercase" }}>
                                        ({col.cellType})
                                    </span>
                                )}
                            </th>
                        ))}
                        {!readOnly && (
                            <th style={{ width: 36, background: C.purplePale, border: `1px solid ${C.purpleMid}` }} />
                        )}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, rIdx) => (
                        <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? C.white : C.offWhite }}>
                            {columns.map(col => (
                                <td key={col.name} style={{
                                    border: `1px solid ${C.border}`, padding: "6px 8px", verticalAlign: "middle",
                                }}>
                                    <Cell
                                        col={col}
                                        value={row[col.name]}
                                        onChange={val => updateCell(rIdx, col.name, val)}
                                        readOnly={readOnly}
                                    />
                                </td>
                            ))}
                            {!readOnly && (
                                <td style={{ border: `1px solid ${C.border}`, padding: "4px", textAlign: "center", verticalAlign: "middle" }}>
                                    <button
                                        onClick={() => removeRow(rIdx)}
                                        disabled={rows.length <= minRows}
                                        style={{
                                            width: 22, height: 22, border: "none", borderRadius: 5,
                                            background: rows.length <= minRows ? C.border : C.redPale,
                                            color: rows.length <= minRows ? C.textMuted : C.red,
                                            cursor: rows.length <= minRows ? "not-allowed" : "pointer",
                                            fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center",
                                        }}
                                    >✕</button>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>

            {!readOnly && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                    <button
                        onClick={addRow}
                        disabled={rows.length >= maxRows}
                        style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "6px 14px", border: `1px dashed ${rows.length >= maxRows ? C.border : C.purple}`,
                            borderRadius: 8, background: "none",
                            color: rows.length >= maxRows ? C.textMuted : C.purple,
                            fontSize: 12, cursor: rows.length >= maxRows ? "not-allowed" : "pointer",
                            fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
                        }}
                    >
                        <span>＋</span> {addRowText}
                    </button>
                    <span style={{ fontSize: 10, color: C.textMuted }}>
                        {rows.length} / {maxRows} rows
                    </span>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────
//  SurveyJS custom question registration
//  Call registerDynamicMatrix() once in your app entry point or form page.
// ─────────────────────────────────────────────────────────────────────
let _registered = false;

export function registerDynamicMatrix() {
    if (_registered) return;
    _registered = true;

    class QuestionDynamicMatrixModel extends Question {
        getType() { return "dynamicmatrix"; }
        get columns() { return this.getPropertyValue("columns") ?? []; }
        set columns(v) { this.setPropertyValue("columns", v); }
        get minRows() { return this.getPropertyValue("minRows") ?? 1; }
        set minRows(v) { this.setPropertyValue("minRows", v); }
        get maxRows() { return this.getPropertyValue("maxRows") ?? 20; }
        set maxRows(v) { this.setPropertyValue("maxRows", v); }
        get addRowText() { return this.getPropertyValue("addRowText") ?? "Add Row"; }
        set addRowText(v) { this.setPropertyValue("addRowText", v); }
    }

    Serializer.addClass(
        "dynamicmatrix",
        [
            { name: "columns", default: [] },
            { name: "minRows:number", default: 1 },
            { name: "maxRows:number", default: 20 },
            { name: "addRowText", default: "Add Row" },
        ],
        () => new QuestionDynamicMatrixModel(""),
        "question"
    );

    ElementFactory.Instance.registerElement(
        "dynamicmatrix",
        (name) => new QuestionDynamicMatrixModel(name)
    );

    // ── Proper named React component — hooks are legal here ──
    function DynamicMatrixQuestion({ question }) {
        const [cols, setCols] = useState([]);
        const [minRows, setMinRows] = useState(1);
        const [maxRows, setMaxRows] = useState(20);
        const [addRowText, setAddRowText] = useState("Add Row");

        useEffect(() => {
            // Registry is the most reliable source — set before Model() was called
            const raw = getQuestionData(question.name);

            const resolvedColumns = raw?.columns
                ?? question.getPropertyValue("columns")
                ?? [];

            setCols(resolvedColumns);
            setMinRows(raw?.minRows ?? question.getPropertyValue("minRows") ?? 1);
            setMaxRows(raw?.maxRows ?? question.getPropertyValue("maxRows") ?? 20);
            setAddRowText(raw?.addRowText ?? question.getPropertyValue("addRowText") ?? "Add Row");
        }, [question.name, question.getPropertyValue]);

        return (
            <DynamicMatrixInput
                key={JSON.stringify(cols)}
                columns={cols}
                minRows={minRows}
                maxRows={maxRows}
                addRowText={addRowText}
                value={question.value}
                onChange={val => { question.value = val; }}
                readOnly={question.isReadOnly}
            />
        );
    }

    // ReactQuestionFactory expects a factory function that receives props
    // and returns a React element — so we wrap the component properly
    ReactQuestionFactory.Instance.registerQuestion(
        "dynamicmatrix",
        (props) => React.createElement(DynamicMatrixQuestion, { question: props.question })
    );
}

// ─────────────────────────────────────────────────────────────────────
//  Admin: Column schema builder (used inside FormBuilder's Properties panel)
// ─────────────────────────────────────────────────────────────────────
const CELL_TYPES = [
    { value: "text", label: "Text" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date" },
    { value: "dropdown", label: "Dropdown" },
    { value: "checkbox", label: "Checkbox" },
    { value: "boolean", label: "Yes/No" },
];

export function DynamicMatrixSchemaEditor({ field, onChange, token }) {
    // Read directly from field prop every render — no local state for columns
    const columns = field.columns || [];
    const minRows = field.minRows || 1;
    const maxRows = field.maxRows || 20;
    const addRowText = field.addRowText || "Add Row";

    // SharePoint lists for choices source
    const [spLists, setSpLists] = useState([]);
    const [spChoiceFields, setSpChoiceFields] = useState([]);
    const [spLoading, setSpLoading] = useState(false);
    const SP = (process.env.REACT_APP_SP_SITE_URL || "").replace(/\/$/, "");

    useEffect(() => {
        if (!token) return;
        setSpLoading(true);
        fetch(`${SP}/_api/web/lists?$filter=Hidden eq false and BaseTemplate eq 100&$select=Title&$orderby=Title asc&$top=200`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata" }
        }).then(r => r.json())
            .then(d => setSpLists(d.value || []))
            .catch(() => setSpLists([]))
            .finally(() => setSpLoading(false));
    }, [token]);

    // Always derive from field.columns to avoid stale closure
    const updateCol = (i, patch) => {
        const next = (field.columns || []).map((c, idx) =>
            idx === i ? { ...c, ...patch } : c
        );
        onChange({ columns: next });
    };

    const addCol = () => {
        const current = field.columns || [];
        onChange({
            columns: [
                ...current,
                {
                    name: `col${current.length + 1}`,
                    title: `Column ${current.length + 1}`,
                    cellType: "text",
                },
            ],
        });
    };

    const removeCol = (i) =>
        onChange({ columns: (field.columns || []).filter((_, idx) => idx !== i) });

    const moveCol = (i, dir) => {
        const next = [...(field.columns || [])];
        const to = i + dir;
        if (to < 0 || to >= next.length) return;
        [next[i], next[to]] = [next[to], next[i]];
        onChange({ columns: next });
    };

    // Preview SP choices from field definition - now loaded directly in column selector
    // Track which column index we're loading choices for
    const [loadingChoicesForCol, setLoadingChoicesForCol] = useState(null);

    return (
        <div>
            {/* Column list */}
            <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
                    Columns ({columns.length})
                </div>
                {columns.length === 0 && (
                    <div style={{ fontSize: 11, color: C.textMuted, fontStyle: "italic", marginBottom: 8 }}>No columns yet.</div>
                )}
                {columns.map((col, i) => (
                    <div key={i} style={{
                        background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 8,
                        padding: "10px 11px", marginBottom: 6,
                    }}>
                        <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                            <input
                                value={col.name}
                                onChange={e => updateCol(i, { name: e.target.value.replace(/\s+/g, "_") })}
                                placeholder="colName"
                                style={{ flex: 1, height: 28, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 8px", fontSize: 11, fontFamily: "'DM Sans'", color: C.textPrimary, background: C.white }}
                            />
                            <input
                                value={col.title}
                                onChange={e => updateCol(i, { title: e.target.value })}
                                placeholder="Label"
                                style={{ flex: 1.5, height: 28, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 8px", fontSize: 11, fontFamily: "'DM Sans'", color: C.textPrimary, background: C.white }}
                            />
                            {/* ── THIS IS THE KEY FIX: value bound to col.cellType, not local state ── */}
                            <select
                                value={col.cellType || "text"}
                                onChange={e => updateCol(i, { cellType: e.target.value })}
                                style={{ height: 28, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 6px", fontSize: 11, fontFamily: "'DM Sans'", color: C.textPrimary, background: C.white }}
                            >
                                {CELL_TYPES.map(t => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                            <button onClick={() => moveCol(i, -1)} disabled={i === 0}
                                style={{ width: 22, height: 22, border: "none", background: C.border, borderRadius: 4, cursor: i === 0 ? "not-allowed" : "pointer", fontSize: 11, opacity: i === 0 ? .4 : 1 }}>↑</button>
                            <button onClick={() => moveCol(i, 1)} disabled={i === columns.length - 1}
                                style={{ width: 22, height: 22, border: "none", background: C.border, borderRadius: 4, cursor: i === columns.length - 1 ? "not-allowed" : "pointer", fontSize: 11, opacity: i === columns.length - 1 ? .4 : 1 }}>↓</button>
                            <button onClick={() => removeCol(i)}
                                style={{ width: 22, height: 22, border: "none", background: C.redPale, color: C.red, borderRadius: 4, cursor: "pointer", fontSize: 12 }}>✕</button>
                        </div>

                        {/* Multi-select toggle for dropdown/checkbox */}
                        {(col.cellType === "dropdown" || col.cellType === "checkbox") && (
                            <div style={{ marginTop: 4, marginBottom: 4 }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer" }}>
                                    <input
                                        type="checkbox"
                                        checked={!!col.multiSelect}
                                        onChange={e => updateCol(i, { multiSelect: e.target.checked, cellType: e.target.checked && col.cellType === "dropdown" ? "checkbox" : col.cellType })}
                                        style={{ accentColor: C.purple }}
                                    />
                                    Allow multiple selections
                                </label>
                            </div>
                        )}

                        {/* Choices for dropdown/checkbox */}
                        {col.cellType === "dropdown" && !col.spChoicesSource && (
                            <div style={{ marginTop: 4 }}>
                                <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>Choices (one per line):</div>
                                <textarea
                                    value={(col.choices || []).join("\n")}
                                    onChange={e => updateCol(i, { choices: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })}
                                    rows={3}
                                    placeholder={"Option A\nOption B\nOption C"}
                                    style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 11, fontFamily: "'DM Sans'", resize: "vertical" }}
                                />
                            </div>
                        )}

                        {/* Checkbox choices */}
                        {col.cellType === "checkbox" && col.choices && (
                            <div style={{ marginTop: 4 }}>
                                <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>Choices (one per line):</div>
                                <textarea
                                    value={(col.choices || []).join("\n")}
                                    onChange={e => updateCol(i, { choices: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })}
                                    rows={3}
                                    placeholder={"Option A\nOption B\nOption C"}
                                    style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 11, fontFamily: "'DM Sans'", resize: "vertical" }}
                                />
                            </div>
                        )}

                        {/* SharePoint choices source for dropdown/checkbox */}
                        {(col.cellType === "dropdown" || col.cellType === "checkbox") && (
                            <div style={{ marginTop: 8, padding: "8px 10px", background: C.purplePale, border: `1px solid ${C.purpleMid}`, borderRadius: 8 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: C.purple, textTransform: "uppercase", marginBottom: 6 }}>
                                    SharePoint Choices Source
                                </div>
                                {/* List selector */}
                                <select
                                    value={col.spChoicesSource?.list || ""}
                                    onChange={async (e) => {
                                        updateCol(i, { ...col, spChoicesSource: { ...col.spChoicesSource, list: e.target.value, column: "" } });
                                        // Load Choice fields for this list
                                        if (e.target.value) {
                                            try {
                                                const data = await fetch(
                                                    `${SP}/_api/web/lists/getbytitle('${encodeURIComponent(e.target.value)}')/fields?$filter=Hidden eq false and ReadOnlyField eq false and (TypeAsString eq 'Choice' or TypeAsString eq 'MultiChoice')&$select=Title,InternalName,TypeAsString&$orderby=Title asc&$top=200`,
                                                    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata" } }
                                                ).then(r => r.json());
                                                setSpChoiceFields((data.value || []).filter(c => !["Attachments","ContentType","Edit","DocIcon","LinkTitleNoMenu","LinkTitle","ItemChildCount","FolderChildCount"].includes(c.InternalName)));
                                            } catch {
                                                setSpChoiceFields([]);
                                            }
                                        } else {
                                            setSpChoiceFields([]);
                                        }
                                    }}
                                    style={{ width: "100%", height: 26, fontSize: 11, marginBottom: 4, border: `1px solid ${C.border}`, borderRadius: 4 }}
                                >
                                    <option value="">{spLoading ? "Loading..." : "Select list..."}</option>
                                    {spLists.map(l => <option key={l.Title} value={l.Title}>{l.Title}</option>)}
                                </select>
                                {/* Column selector - only show Choice/MultiChoice fields */}
                                {col.spChoicesSource?.list && (
                                    <div>
                                        <select
                                            value={col.spChoicesSource?.column || ""}
                                            onChange={async (e) => {
                                                updateCol(i, { ...col, spChoicesSource: { ...col.spChoicesSource, column: e.target.value } });
                                                // Load choices from the selected field
                                                if (e.target.value) {
                                                    setLoadingChoicesForCol(i);
                                                    try {
                                                        const data = await fetch(
                                                            `${SP}/_api/web/lists/getbytitle('${encodeURIComponent(col.spChoicesSource.list)}')/fields/getbytitle('${encodeURIComponent(e.target.value)}')`,
                                                            { headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata" } }
                                                        ).then(r => r.json());
                                                        if (data.Choices && Array.isArray(data.Choices)) {
                                                            updateCol(i, { choices: data.Choices, spChoicesSource: { ...col.spChoicesSource, column: e.target.value, choicesLoaded: true } });
                                                        }
                                                    } catch (err) {
                                                        console.error("Failed to load field choices:", err);
                                                    } finally {
                                                        setLoadingChoicesForCol(null);
                                                    }
                                                }
                                            }}
                                            style={{ width: "100%", height: 26, fontSize: 11, marginBottom: 4, border: `1px solid ${C.border}`, borderRadius: 4 }}
                                        >
                                            <option value="">Select Choice field...</option>
                                            {spChoiceFields.map(c => <option key={c.InternalName} value={c.InternalName}>{c.Title} ({c.TypeAsString})</option>)}
                                        </select>
                                        {loadingChoicesForCol === i && <div style={{ fontSize: 10, color: C.textMuted }}>Loading choices...</div>}
                                    </div>
                                )}
                                {/* Show loaded choices directly from column data */}
                                {col.spChoicesSource?.list && col.spChoicesSource?.column && col.choices && col.choices.length > 0 && (
                                    <div style={{ marginTop: 6 }}>
                                        <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>Loaded choices:</div>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                            {col.choices.map((v, idx) => (
                                                <span key={idx} style={{ fontSize: 10, background: C.white, border: `1px solid ${C.purpleMid}`, borderRadius: 4, padding: "2px 7px", color: C.purple }}>{v}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}

                <button onClick={addCol} style={{
                    width: "100%", height: 28, border: `1px dashed ${C.border}`, borderRadius: 7,
                    background: "none", color: C.purple, fontSize: 11, cursor: "pointer",
                    fontFamily: "'DM Sans'", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                }}>
                    ＋ Add column
                </button>
            </div>

            {/* Row settings */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                    <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Min rows</div>
                    <input type="number" min={0} value={minRows}
                        onChange={e => onChange({ minRows: parseInt(e.target.value) || 1 })}
                        style={{ width: "100%", height: 28, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 8px", fontSize: 12, fontFamily: "'DM Sans'" }} />
                </div>
                <div>
                    <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Max rows</div>
                    <input type="number" min={1} value={maxRows}
                        onChange={e => onChange({ maxRows: parseInt(e.target.value) || 20 })}
                        style={{ width: "100%", height: 28, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 8px", fontSize: 12, fontFamily: "'DM Sans'" }} />
                </div>
            </div>

            <div>
                <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Add row button text</div>
                <input value={addRowText}
                    onChange={e => onChange({ addRowText: e.target.value })}
                    style={{ width: "100%", height: 28, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 8px", fontSize: 12, fontFamily: "'DM Sans'" }} />
            </div>

            {/* Live preview — key forces full remount when column names change */}
            {columns.length > 0 && (
                <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Preview</div>
                    <DynamicMatrixInput
                        key={columns.map(c => c.name).join(",")}
                        columns={columns}
                        minRows={1}
                        maxRows={3}
                        addRowText={addRowText}
                    />
                </div>
            )}

            <div style={{ marginTop: 10, background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 10px", fontSize: 10, color: "#92400E", lineHeight: 1.6 }}>
                SP Storage: two columns will be created — <code>{field.name}_Html</code> (rich text) and <code>{field.name}_Json</code> (multi-line text).
            </div>
        </div>
    );
}

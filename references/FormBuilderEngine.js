/**
 * FormBuilderEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure data logic for the custom SurveyJS-compatible form builder.
 * Zero UI — import this into FormBuilder.jsx.
 *
 * Outputs 100% valid SurveyJS JSON (survey-core / survey-react-ui compatible).
 * No survey-creator-react dependency — MIT-safe.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Question type definitions
//  Each entry describes how the type appears in the palette and what default
//  props a new question of that type gets.
// ─────────────────────────────────────────────────────────────────────────────
export const QUESTION_TYPES = [
    {
        type: "text",
        label: "Short Text",
        icon: "Pencil",
        group: "Basic",
        description: "Single-line text input",
        spColumnKind: 2,
        defaultProps: { inputType: "text", placeholder: "" },
    },
    {
        type: "comment",
        label: "Long Text",
        icon: "AlignLeft",
        group: "Basic",
        description: "Multi-line textarea",
        spColumnKind: 3,
        defaultProps: { rows: 4, placeholder: "" },
    },
    {
        type: "dropdown",
        label: "Dropdown",
        icon: "ChevronDown",
        group: "Choice",
        description: "Select one from a list",
        spColumnKind: 2,
        defaultProps: { choices: ["Option 1", "Option 2", "Option 3"], placeholder: "Select an option..." },
    },
    {
        type: "radiogroup",
        label: "Radio Group",
        icon: "Circle",
        group: "Choice",
        description: "Pick one option",
        spColumnKind: 2,
        defaultProps: { choices: ["Option 1", "Option 2", "Option 3"], colCount: 1 },
    },
    {
        type: "checkbox",
        label: "Checkboxes",
        icon: "CheckSquare",
        group: "Choice",
        description: "Pick multiple options",
        spColumnKind: 3,
        defaultProps: { choices: ["Option 1", "Option 2", "Option 3"], colCount: 1 },
    },
    {
        type: "boolean",
        label: "Yes / No",
        icon: "Repeat",
        group: "Basic",
        description: "True/False toggle",
        spColumnKind: 8,
        defaultProps: { labelTrue: "Yes", labelFalse: "No" },
    },
    {
        type: "rating",
        label: "Rating",
        icon: "Star",
        group: "Scale",
        description: "Star / numeric rating",
        spColumnKind: 9,
        defaultProps: { rateMin: 1, rateMax: 5, minRateDescription: "Poor", maxRateDescription: "Excellent" },
    },
    {
        type: "text",
        label: "Number",
        icon: "Hash",
        group: "Basic",
        description: "Numeric input",
        spColumnKind: 9,
        defaultProps: { inputType: "number" },
        variantKey: "number", // disambiguate from plain text in palette
    },
    {
        type: "text",
        label: "Date",
        icon: "Calendar",
        group: "Basic",
        description: "Date / datetime picker",
        spColumnKind: 4,
        defaultProps: { inputType: "date" },
        variantKey: "date",
    },
    {
        type: "text",
        label: "Email",
        icon: "Mail",
        group: "Basic",
        description: "Email address field",
        spColumnKind: 2,
        defaultProps: { inputType: "email" },
        variantKey: "email",
    },
    {
        type: "signaturepad",
        label: "Signature",
        icon: "PenTool",
        group: "Advanced",
        description: "Draw signature",
        spColumnKind: 3,
        defaultProps: { signatureWidth: 400, signatureHeight: 200, penColor: "#000000" },
    },
    {
        type: "file",
        label: "File Upload",
        icon: "Paperclip",
        group: "Advanced",
        description: "Upload attachment",
        spColumnKind: 3,
        defaultProps: { allowMultiple: false, storeDataAsText: true },
    },
    {
        type: "matrix",
        label: "Matrix",
        icon: "Square",
        group: "Advanced",
        description: "Row × Column grid",
        spColumnKind: 3,
        defaultProps: {
            columns: ["Column 1", "Column 2", "Column 3"],
            rows: ["Row 1", "Row 2"],
        },
    },
    {
        type: "multipletext",
        label: "Multiple Fields",
        icon: "Clipboard",
        group: "Advanced",
        description: "Grouped sub-fields",
        spColumnKind: 3,
        defaultProps: {
            items: [
                { name: "field1", title: "Field 1" },
                { name: "field2", title: "Field 2" },
            ],
        },
    },
    {
        type: "expression",
        label: "Calculated",
        icon: "Calculator",
        group: "Advanced",
        description: "Auto-computed value",
        spColumnKind: 9,
        defaultProps: { expression: "", displayStyle: "decimal" },
    },
    {
        type: "html",
        label: "HTML / Label",
        icon: "Tag",
        group: "Layout",
        description: "Static text or markup",
        spColumnKind: null, // not stored in SP
        defaultProps: { html: "<p>Enter your text here</p>" },
    },
    {
        type: "panel",
        label: "Section Panel",
        icon: "FolderOpen",
        group: "Layout",
        description: "Group fields in a panel",
        spColumnKind: null,
        defaultProps: { state: "expanded", elements: [] },
    },
    {
        type: "dynamicmatrix",
        label: "Dynamic Matrix",
        icon: "BarChart2",
        group: "Advanced",
        description: "Add/remove rows at runtime",
        spColumnKind: null, // handled specially (_Html + _Json)
        defaultProps: {
            columns: [
                { name: "col1", title: "Column 1", cellType: "text" },
            ],
            minRows: 1,
            maxRows: 20,
            addRowText: "Add Row",
        },
    },
    {
        type: "hidden",
        label: "Hidden Field",
        icon: "Lock",
        group: "Advanced",
        description: "SP column, not shown to user, editable by admin",
        spColumnKind: 2,
        defaultProps: {
            defaultValue: "",
            adminOnly: true,
        },
    },
];

export const TYPE_GROUPS = ["Basic", "Choice", "Scale", "Advanced", "Layout"];

// ─────────────────────────────────────────────────────────────────────────────
//  ID generator
// ─────────────────────────────────────────────────────────────────────────────
let _seq = 1;
export function genId() {
    return `q_${Date.now()}_${_seq++}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Create a new question object from a palette type definition
// ─────────────────────────────────────────────────────────────────────────────
export function createQuestion(typeDef) {
    const id = genId();
    const base = {
        _id: id,           // internal builder key (not in output JSON)
        type: typeDef.type,
        name: `question_${_seq - 1}`,
        title: typeDef.label,
        isRequired: false,
        startWithNewLine: true,
        visible: true,
        readOnly: false,
        description: "",
        // Spread type-specific defaults
        ...typeDef.defaultProps,
    };
    return base;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Convert internal builder state → SurveyJS JSON
// ─────────────────────────────────────────────────────────────────────────────
const INTERNAL_PREFIXES = ["_visIf", "_enabIf", "_"];
function stripInternal(q) {
    const out = {};
    for (const [k, v] of Object.entries(q)) {
        // Skip internal builder fields (prefixed with _)
        if (k === "_id") continue;
        if (INTERNAL_PREFIXES.some(p => k.startsWith(p) && k !== "_id")) continue;
        if (v === undefined) continue;
        if (v === "" && k === "description") continue;
        // ← DO NOT skip arrays, objects, or 0-values
        out[k] = v;
    }
    return out;
}

export function buildSurveyJson(fields, meta = {}) {
    return {
        title: meta.title || "",
        description: meta.description || "",
        checkErrorsMode: meta.checkErrorsMode || "onValueChanged",
        textUpdateMode: meta.textUpdateMode || "onTyping",
        showQuestionNumbers: meta.showQuestionNumbers ?? "on",
        ...(meta.titleLocation && { titleLocation: meta.titleLocation }),
        ...(meta.textTransform && meta.textTransform !== "none" && { textTransform: meta.textTransform }),
        showProgressBar: !!meta.showProgressBar,
        showPageTitles: !!meta.showPageTitles,
        ...(meta.primaryColor && { primaryColor: meta.primaryColor }),
        ...(meta.backgroundColor && { backgroundColor: meta.backgroundColor }),
        ...(meta.textColor && { textColor: meta.textColor }),
        pages: [
            {
                name: "page1",
                elements: fields.map(stripInternal),
            },
        ],
    };
}

// ─────────────────────────────────────────────────────────────────────────────
//  SP column type map (for the provisioning summary)
// ─────────────────────────────────────────────────────────────────────────────
export function getSpColumnKind(question) {
    // dynamicmatrix is provisioned separately as _Html + _Json
    if (question.type === "dynamicmatrix") return null;

    const def = QUESTION_TYPES.find(t =>
        t.type === question.type &&
        (t.defaultProps?.inputType === question.inputType || !t.defaultProps?.inputType || !question.inputType)
    );
    if (!def) return { FieldTypeKind: 2, label: "Text" };
    const kind = def.spColumnKind;
    if (kind === null) return null;
    const labels = { 2: "Text", 3: "Multi-line", 4: "DateTime", 8: "Yes/No", 9: "Number" };
    return { FieldTypeKind: kind, label: labels[kind] || "Text" };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Drag-and-drop reorder helper
// ─────────────────────────────────────────────────────────────────────────────
export function reorderFields(fields, fromIndex, toIndex) {
    const result = [...fields];
    const [removed] = result.splice(fromIndex, 1);
    result.splice(toIndex, 0, removed);
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Field update helpers
// ─────────────────────────────────────────────────────────────────────────────
export function updateField(fields, id, patch) {
    return fields.map(f => f._id === id ? { ...f, ...patch } : f);
}

export function removeField(fields, id) {
    return fields.filter(f => f._id !== id);
}

export function duplicateField(fields, id) {
    const idx = fields.findIndex(f => f._id === id);
    if (idx === -1) return fields;
    const orig = fields[idx];
    const copy = { ...orig, _id: genId(), name: orig.name + "_copy" };
    const result = [...fields];
    result.splice(idx + 1, 0, copy);
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Validation: check for duplicate names, empty names, invalid chars
// ─────────────────────────────────────────────────────────────────────────────
export function validateFields(fields) {
    const errors = [];
    const names = new Set();
    for (const f of fields) {
        if (!f.name || !f.name.trim()) {
            errors.push({ id: f._id, field: "name", msg: "Field name is required" });
        } else if (/\s/.test(f.name)) {
            errors.push({ id: f._id, field: "name", msg: "No spaces in name (use camelCase)" });
        } else if (names.has(f.name)) {
            errors.push({ id: f._id, field: "name", msg: `Duplicate name: "${f.name}"` });
        } else {
            names.add(f.name);
        }
        if (!f.title || !f.title.trim()) {
            errors.push({ id: f._id, field: "title", msg: "Label is required" });
        }
    }
    return errors;
}

export function flattenQuestions(surveyJson) {
    if (!surveyJson?.pages) return [];

    const result = [];

    function walk(elements) {
        for (const el of elements || []) {
            // Panels (nested elements)
            if (el.type === "panel" && el.elements) {
                walk(el.elements);
                continue;
            }

            // Matrix / complex types still treated as one field
            result.push(el);
        }
    }

    for (const page of surveyJson.pages) {
        walk(page.elements);
    }

    return result;
}
import type {
  FormBuilderField,
  SurveyJson,
  QuestionTypeDefinition,
} from "../types";

// ── Type Groups ────────────────────────────────────────────────────────────────

export const TYPE_GROUPS = ["Basic", "Choice", "Advanced", "Layout"] as const;

// ── Question Type Definitions ──────────────────────────────────────────────────

export const QUESTION_TYPES: QuestionTypeDefinition[] = [
  // Basic group
  {
    type: "text",
    label: "Text Input",
    icon: "📝",
    group: "Basic",
    description: "Single-line text input",
    spColumnKind: 2,
    defaultProps: { inputType: "text", placeholder: "" },
  },
  {
    type: "number",
    label: "Number",
    icon: "🔢",
    group: "Basic",
    description: "Numeric input field",
    spColumnKind: 9,
    defaultProps: { inputType: "number", placeholder: "" },
  },
  {
    type: "email",
    label: "Email",
    icon: "📧",
    group: "Basic",
    description: "Email address input with validation",
    spColumnKind: 2,
    defaultProps: { inputType: "email", placeholder: "" },
  },
  {
    type: "url",
    label: "URL",
    icon: "🔗",
    group: "Basic",
    description: "Web address input with validation",
    spColumnKind: 2,
    defaultProps: { inputType: "url", placeholder: "" },
  },
  {
    type: "tel",
    label: "Phone",
    icon: "📱",
    group: "Basic",
    description: "Phone number input",
    spColumnKind: 2,
    defaultProps: { inputType: "tel", placeholder: "" },
  },
  {
    type: "date",
    label: "Date",
    icon: "📅",
    group: "Basic",
    description: "Date picker input",
    spColumnKind: 4,
    defaultProps: { inputType: "date" },
  },
  {
    type: "datetime",
    label: "Date & Time",
    icon: "🕐",
    group: "Basic",
    description: "Date and time picker input",
    spColumnKind: 4,
    defaultProps: { inputType: "datetime" },
  },
  {
    type: "boolean",
    label: "Yes/No",
    icon: "✅",
    group: "Basic",
    description: "Boolean yes/no toggle",
    spColumnKind: 8,
    defaultProps: { labelTrue: "Yes", labelFalse: "No" },
  },
  {
    type: "comment",
    label: "Long Text",
    icon: "📄",
    group: "Basic",
    description: "Multi-line text area",
    spColumnKind: 3,
    defaultProps: { inputType: "comment", rows: 4, placeholder: "" },
  },
  // Choice group
  {
    type: "dropdown",
    label: "Dropdown",
    icon: "📋",
    group: "Choice",
    description: "Single-select dropdown list",
    spColumnKind: 2,
    defaultProps: {
      choices: ["Option 1", "Option 2"],
      colCount: 1,
      hasOther: false,
      hasNone: false,
    },
  },
  {
    type: "radiogroup",
    label: "Radio Group",
    icon: "🔘",
    group: "Choice",
    description: "Single-select radio buttons",
    spColumnKind: 2,
    defaultProps: {
      choices: ["Option 1", "Option 2"],
      colCount: 1,
      hasOther: false,
      hasNone: false,
    },
  },
  {
    type: "checkbox",
    label: "Checkbox Group",
    icon: "☑️",
    group: "Choice",
    description: "Multi-select checkboxes",
    spColumnKind: 2,
    defaultProps: {
      choices: ["Option 1", "Option 2"],
      colCount: 1,
      hasOther: false,
    },
  },
  // Advanced group
  {
    type: "rating",
    label: "Rating",
    icon: "⭐",
    group: "Advanced",
    description: "Star rating input",
    spColumnKind: null,
    defaultProps: {
      rateMin: 1,
      rateMax: 5,
      minRateDescription: "Poor",
      maxRateDescription: "Excellent",
    },
  },
  {
    type: "file",
    label: "File Upload",
    icon: "📎",
    group: "Advanced",
    description: "File upload field",
    spColumnKind: null,
    defaultProps: {
      acceptedTypes: ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg",
      maxSize: 10485760,
      allowMultiple: false,
    },
  },
  {
    type: "signaturepad",
    label: "Signature",
    icon: "✍️",
    group: "Advanced",
    description: "Digital signature pad",
    spColumnKind: null,
    defaultProps: {
      signatureWidth: 400,
      signatureHeight: 200,
      penColor: "#000000",
    },
  },
  {
    type: "dynamicmatrix",
    label: "Dynamic Matrix",
    icon: "📊",
    group: "Advanced",
    description: "Dynamic table with configurable rows and columns",
    spColumnKind: null,
    defaultProps: {
      columns: ["Column 1", "Column 2"],
      minRows: 1,
      maxRows: 10,
      addRowText: "Add Row",
    },
  },
  {
    type: "html",
    label: "HTML Block",
    icon: "🌐",
    group: "Advanced",
    description: "Rich HTML content block",
    spColumnKind: null,
    defaultProps: { html: "<p>Enter your content here</p>" },
  },
];

// ── ID Generation ──────────────────────────────────────────────────────────────

export function generateFieldId(prefix = "field"): string {
  const rand = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${rand}`;
}

// ── Question Factory ───────────────────────────────────────────────────────────

function toCamelCase(label: string): string {
  return label
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(" ")
    .map((word, i) => {
      const lower = word.toLowerCase();
      return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

export function createQuestion(td: QuestionTypeDefinition): FormBuilderField {
  const _id = generateFieldId();
  const name = toCamelCase(td.label);
  const base: FormBuilderField = {
    _id,
    type: td.type,
    name,
    title: td.label,
    isRequired: false,
    startWithNewLine: true,
    visible: true,
    readOnly: false,
    description: "",
    ...td.defaultProps,
  };
  return base;
}

// ── Survey JSON Builder ────────────────────────────────────────────────────────

const INTERNAL_FIELDS = [
  "_id",
  "_visIfField",
  "_visIfOp",
  "_visIfVal",
  "_enabIfField",
  "_enabIfOp",
  "_enabIfVal",
  "_textCustomised",
  "spChoicesSource",
  "variantKey",
];

export function buildSurveyJson(
  fields: FormBuilderField[],
  surveySettings: Record<string, unknown> = {}
): SurveyJson {
  const elements = fields.map((f) => {
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(f)) {
      if (INTERNAL_FIELDS.includes(key)) continue;
      if (val !== undefined) cleaned[key] = val;
    }
    return cleaned;
  });

  const json: SurveyJson = {
    title: (surveySettings.title as string) ?? "New Form",
    description: (surveySettings.description as string) ?? "",
    pages: [{ name: "page1", elements }],
  };

  const settingKeys = [
    "titleLocation",
    "textTransform",
    "showQuestionNumbers",
    "checkErrorsMode",
    "textUpdateMode",
    "showProgressBar",
    "showPageTitles",
  ] as const;

  for (const key of settingKeys) {
    if (surveySettings[key] !== undefined) {
      (json as unknown as Record<string, unknown>)[key] = surveySettings[key];
    }
  }

  return json;
}

// ── Validation ─────────────────────────────────────────────────────────────────

export function validateFields(
  fields: FormBuilderField[]
): { id: string; msg: string }[] {
  const errors: { id: string; msg: string }[] = [];
  const nameCount: Record<string, number> = {};

  for (const f of fields) {
    if (!f.name?.trim()) {
      errors.push({ id: f._id, msg: "Field name is required" });
    }
    if (!f.title?.trim()) {
      errors.push({ id: f._id, msg: "Field title is required" });
    }
    if (f.name?.trim()) {
      nameCount[f.name] = (nameCount[f.name] ?? 0) + 1;
    }
  }

  for (const f of fields) {
    if (f.name && nameCount[f.name] > 1) {
      errors.push({ id: f._id, msg: `Duplicate field name: ${f.name}` });
    }
  }

  for (const f of fields) {
    const choiceTypes = ["dropdown", "radiogroup", "checkbox"];
    if (choiceTypes.includes(f.type)) {
      const choices = f.choices ?? [];
      if (choices.length < 2) {
        errors.push({
          id: f._id,
          msg: "Choice fields must have at least 2 options",
        });
      }
    }

    if (f.type === "rating") {
      const min = f.rateMin ?? 1;
      const max = f.rateMax ?? 5;
      if (min >= max) {
        errors.push({
          id: f._id,
          msg: "Rating min must be less than max",
        });
      }
    }
  }

  return errors;
}

// ── Field Operations ───────────────────────────────────────────────────────────

export function updateField(
  fields: FormBuilderField[],
  id: string,
  patch: Partial<FormBuilderField>
): FormBuilderField[] {
  return fields.map((f) => (f._id === id ? { ...f, ...patch } : f));
}

export function removeField(
  fields: FormBuilderField[],
  id: string
): FormBuilderField[] {
  return fields.filter((f) => f._id !== id);
}

export function duplicateField(
  fields: FormBuilderField[],
  id: string
): FormBuilderField[] {
  const idx = fields.findIndex((f) => f._id === id);
  if (idx === -1) return fields;
  const original = fields[idx];
  const copy: FormBuilderField = {
    ...original,
    _id: generateFieldId(),
    name: `${original.name}_copy`,
    title: `${original.title} (Copy)`,
  };
  return [...fields.slice(0, idx + 1), copy, ...fields.slice(idx + 1)];
}

export function reorderFields(
  fields: FormBuilderField[],
  fromIndex: number,
  toIndex: number
): FormBuilderField[] {
  const result = [...fields];
  const [moved] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, moved);
  return result;
}

// ── Flatten Questions ──────────────────────────────────────────────────────────

export function flattenQuestions(json: SurveyJson): FormBuilderField[] {
  const result: FormBuilderField[] = [];

  function walk(elements: Record<string, unknown>[]): void {
    for (const el of elements) {
      if (el.type === "panel" && Array.isArray(el.elements)) {
        walk(el.elements as Record<string, unknown>[]);
      } else {
        result.push(el as unknown as FormBuilderField);
      }
    }
  }

  for (const page of json.pages ?? []) {
    if (Array.isArray(page.elements)) {
      walk(page.elements);
    }
  }

  return result;
}

// ── SharePoint Column Kind ─────────────────────────────────────────────────────

export function getSpColumnKind(fieldType: string): number | null {
  const typeDef = QUESTION_TYPES.find((t) => t.type === fieldType);
  return typeDef?.spColumnKind ?? null;
}

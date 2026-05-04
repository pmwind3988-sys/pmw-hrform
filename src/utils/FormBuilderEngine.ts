import type {
  FormBuilderField,
  SurveyJson,
  QuestionTypeDefinition,
} from "../types";

// ── Type Groups ────────────────────────────────────────────────────────────────

export const TYPE_GROUPS = ["Layout", "Text", "Selection", "Date/Time", "Numeric", "Advanced", "Display", "Basic", "Choice"] as const;

// ── Question Type Definitions ──────────────────────────────────────────────────

export const QUESTION_TYPES: QuestionTypeDefinition[] = [
  // ========== LAYOUT GROUP ==========
  {
    type: "pagebreak",
    label: "Page Break",
    icon: "📄",
    group: "Layout",
    description: "Insert a page break for multi-page forms",
    spColumnKind: null,
    defaultProps: { pageTitle: "", pageDescription: "", showPageNumber: true },
  },
  {
    type: "panel",
    label: "Section / Panel",
    icon: "📦",
    group: "Layout",
    description: "Collapsible card container for grouping fields",
    spColumnKind: null,
    defaultProps: { title: "Section", description: "", collapsible: true, startWithNewLine: true },
  },
  {
    type: "repeater",
    label: "Repeater Panel",
    icon: "🔁",
    group: "Layout",
    description: "Repeating group of fields (dynamic rows)",
    spColumnKind: null,
    defaultProps: { minRows: 1, maxRows: 10, addButtonText: "Add Row", removeButtonText: "Remove", showBlankRow: true },
  },
  {
    type: "columns",
    label: "Column Layout",
    icon: "📊",
    group: "Layout",
    description: "Arrange fields in 2 or 3 columns",
    spColumnKind: null,
    defaultProps: { columnCount: 2, gap: 16, responsiveBreakpoint: 768 },
  },
  {
    type: "spacer",
    label: "Spacer",
    icon: "↕️",
    group: "Layout",
    description: "Vertical whitespace block",
    spColumnKind: null,
    defaultProps: { height: 16 },
  },
  {
    type: "divider",
    label: "Divider",
    icon: "━",
    group: "Layout",
    description: "Horizontal rule separator",
    spColumnKind: null,
    defaultProps: { style: "solid", color: "#E5E3F0", margin: "16px 0" },
  },
  // ========== TEXT GROUP ==========
  {
    type: "text",
    label: "Text Input",
    icon: "📝",
    group: "Basic",
    description: "Single-line text input",
    spColumnKind: 2,
    defaultProps: { inputType: "text", placeholder: "", maxLength: 0 },
  },
  {
    type: "richtext",
    label: "Rich Text Editor",
    icon: "📃",
    group: "Text",
    description: "WYSIWYG rich text editor",
    spColumnKind: 3,
    defaultProps: { placeholder: "Enter text...", maxLength: 0, toolbarOptions: ["bold", "italic", "underline", "lists", "links"], stripHtmlOnExport: false },
  },
  {
    type: "password",
    label: "Password",
    icon: "🔒",
    group: "Text",
    description: "Secure password input with strength indicator",
    spColumnKind: 2,
    defaultProps: { placeholder: "Enter password", showToggle: true, strengthIndicator: true, minLength: 8 },
  },
  {
    type: "masked",
    label: "Masked Input",
    icon: "🎭",
    group: "Text",
    description: "Input with format mask (phone, IC, etc.)",
    spColumnKind: 2,
    defaultProps: { mask: "phone", placeholder: "###-###-####", guideMode: true },
  },
  {
    type: "autocomplete",
    label: "Auto-complete",
    icon: "🔍",
    group: "Text",
    description: "Text input with dropdown suggestions",
    spColumnKind: 2,
    defaultProps: { placeholder: "Type to search...", dataSource: [], minChars: 2, maxResults: 10, allowFreeText: true },
  },
  {
    type: "taginput",
    label: "Tag Input",
    icon: "🏷️",
    group: "Text",
    description: "Multi-value chips input",
    spColumnKind: 2,
    defaultProps: { delimiter: "enter", maxTags: 10, suggestions: [], allowDuplicates: false },
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
    defaultProps: { inputType: "tel", placeholder: "", defaultCountry: "MY" },
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
  // ========== DATE/TIME GROUP ==========
  {
    type: "date",
    label: "Date",
    icon: "📅",
    group: "Basic",
    description: "Date picker input",
    spColumnKind: 4,
    defaultProps: { inputType: "date", minDate: "", maxDate: "", disableWeekends: false },
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
    type: "daterange",
    label: "Date Range",
    icon: "📆",
    group: "Date/Time",
    description: "Select start and end date",
    spColumnKind: 4,
    defaultProps: { minDate: "", maxDate: "", maxRangeDuration: 30, showNightsCount: false, presets: ["Today", "This Week", "This Month"] },
  },
  {
    type: "time",
    label: "Time Picker",
    icon: "⏰",
    group: "Date/Time",
    description: "Time selector (HH:MM)",
    spColumnKind: 2,
    defaultProps: { hour12Format: true, stepMinutes: 5, minTime: "", maxTime: "" },
  },
  {
    type: "duration",
    label: "Duration",
    icon: "⏱️",
    group: "Date/Time",
    description: "Hours and minutes picker",
    spColumnKind: 9,
    defaultProps: { maxHours: 24, stepMinutes: 15 },
  },
  // ========== SELECTION GROUP ==========
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
      searchable: false,
      clearable: false,
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
      displayAs: "vertical",
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
      selectAll: false,
      maxSelections: 0,
    },
  },
  {
    type: "toggleswitch",
    label: "Toggle Switch",
    icon: "🔃",
    group: "Selection",
    description: "On/Off toggle switch",
    spColumnKind: 8,
    defaultProps: { labelOn: "Yes", labelOff: "No", colorOn: "#5B21B6", size: "md" },
  },
  {
    type: "buttongroup",
    label: "Button Group",
    icon: "🔲",
    group: "Selection",
    description: "Horizontal button row, single or multi select",
    spColumnKind: 2,
    defaultProps: { choices: ["Option 1", "Option 2"], minSelect: 1, maxSelect: 1 },
  },
  {
    type: "slider",
    label: "Slider",
    icon: "🎚️",
    group: "Selection",
    description: "Numeric range slider",
    spColumnKind: 9,
    defaultProps: { min: 0, max: 100, step: 1, showTooltip: true, showMinMax: true, prefix: "", suffix: "" },
  },
  {
    type: "rangeslider",
    label: "Range Slider",
    icon: "🎚️",
    group: "Selection",
    description: "Dual-handle min/max range",
    spColumnKind: null,
    defaultProps: { min: 0, max: 100, step: 1, formatValue: "{min} - {max}" },
  },
  {
    type: "starrating",
    label: "Star Rating",
    icon: "⭐",
    group: "Selection",
    description: "1-5+ star rating input",
    spColumnKind: 9,
    defaultProps: { maxStars: 5, allowHalfStars: false, icon: "star", color: "#F59E0B" },
  },
  {
    type: "nps",
    label: "NPS Score",
    icon: "📈",
    group: "Selection",
    description: "Net Promoter Score 0-10 widget",
    spColumnKind: 9,
    defaultProps: { lowLabel: "Not likely", highLabel: "Very likely", showEmojiFaces: true },
  },
  {
    type: "colorpicker",
    label: "Color Picker",
    icon: "🎨",
    group: "Selection",
    description: "Color selection returning hex",
    spColumnKind: 2,
    defaultProps: { presetPalette: ["#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF", "#FFFF00"], allowCustomHex: true },
  },
  // ========== NUMERIC GROUP ==========
  {
    type: "currency",
    label: "Currency",
    icon: "💰",
    group: "Numeric",
    description: "Monetary input with currency formatting",
    spColumnKind: 9,
    defaultProps: { currency: "MYR", locale: "en-MY", min: 0, max: 0, step: 0.01 },
  },
  {
    type: "formula",
    label: "Formula / Calculated",
    icon: "🔢",
    group: "Numeric",
    description: "Read-only computed value",
    spColumnKind: 9,
    defaultProps: { expression: "", displayFormat: "number", recalculateOnChange: true },
  },
  {
    type: "unitconverter",
    label: "Unit Converter",
    icon: "🔄",
    group: "Numeric",
    description: "Enter value, auto-convert units",
    spColumnKind: 9,
    defaultProps: { unitPairs: ["kg↔lb", "km↔mi", "°C↔°F"], defaultUnit: "kg", showBothValues: true },
  },
  {
    type: "counter",
    label: "Counter / Stepper",
    icon: "➕",
    group: "Numeric",
    description: "Plus/minus buttons with count",
    spColumnKind: 9,
    defaultProps: { min: 0, max: 100, step: 1, initialValue: 0 },
  },
  // ========== ADVANCED GROUP ==========
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
    type: "rating",
    label: "Rating",
    icon: "⭐",
    group: "Advanced",
    description: "Star rating input",
    spColumnKind: 9,
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
      showThumbnails: true,
    },
  },
  {
    type: "imageupload",
    label: "Image Upload",
    icon: "🖼️",
    group: "Advanced",
    description: "Image upload with crop preview",
    spColumnKind: null,
    defaultProps: { aspectRatio: "free", maxWidth: 1920, maxHeight: 1080, allowWebcam: true },
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
      backgroundColor: "#FFFFFF",
      exportFormat: "PNG",
    },
  },
  {
    type: "audiorecorder",
    label: "Audio Recorder",
    icon: "🎤",
    group: "Advanced",
    description: "In-browser microphone recording",
    spColumnKind: null,
    defaultProps: { maxDuration: 60, showWaveform: true },
  },
  {
    type: "addressblock",
    label: "Address Block",
    icon: "🏠",
    group: "Advanced",
    description: "Multi-field address input",
    spColumnKind: 3,
    defaultProps: { showLine2: true, showCity: true, showState: true, showPostcode: true, showCountry: true, countryFilter: ["MY"] },
  },
  {
    type: "locationpicker",
    label: "Location Picker",
    icon: "📍",
    group: "Advanced",
    description: "Map click or geolocation",
    spColumnKind: 3,
    defaultProps: { defaultCenter: "3.1390,101.6869", defaultZoom: 12, mapProvider: "OSM", showCurrentLocation: true },
  },
  {
    type: "nric",
    label: "NRIC / IC",
    icon: "🪪",
    group: "Advanced",
    description: "Malaysian IC with validation",
    spColumnKind: 2,
    defaultProps: { extractDOB: true, extractGender: true, extractState: true, showExtractedInfo: true },
  },
  {
    type: "otp",
    label: "OTP Input",
    icon: "🔐",
    group: "Advanced",
    description: "4 or 6 digit OTP boxes",
    spColumnKind: 2,
    defaultProps: { digitCount: 6, autoAdvance: true, maskMode: false },
  },
  {
    type: "consent",
    label: "Consent / Terms",
    icon: "📜",
    group: "Advanced",
    description: "Checkbox with scrollable terms",
    spColumnKind: 8,
    defaultProps: { termsContent: "", mustScrollToBottom: true },
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
    type: "tableinput",
    label: "Table Input",
    icon: "🗃️",
    group: "Advanced",
    description: "User fills in rows of a table",
    spColumnKind: null,
    defaultProps: { columns: [{ name: "col1", title: "Column 1" }], minRows: 1, maxRows: 50 },
  },
  {
    type: "ranking",
    label: "Ranking",
    icon: "🏆",
    group: "Advanced",
    description: "Drag to rank items",
    spColumnKind: null,
    defaultProps: { items: ["Item 1", "Item 2", "Item 3"], minItems: 1, maxItems: 10 },
  },
  {
    type: "budgetallocator",
    label: "Budget Allocator",
    icon: "💵",
    group: "Advanced",
    description: "Allocate budget across items with sliders",
    spColumnKind: null,
    defaultProps: { totalAmount: 1000, lineItems: ["Item 1", "Item 2"], enforceTotal: true },
  },
  {
    type: "hierarchy",
    label: "Hierarchy Selector",
    icon: "🌳",
    group: "Advanced",
    description: "Cascading dropdowns (Country → State → City)",
    spColumnKind: 2,
    defaultProps: { levels: ["Country", "State", "City"], dataSource: [] },
  },
  {
    type: "jsonditor",
    label: "JSON Editor",
    icon: "{ }",
    group: "Advanced",
    description: "Raw JSON input with syntax highlighting",
    spColumnKind: 3,
    defaultProps: { schema: "", initialValue: "{}" },
  },
  // ========== DISPLAY GROUP ==========
  {
    type: "html",
    label: "HTML Block",
    icon: "🌐",
    group: "Display",
    description: "Rich HTML content block",
    spColumnKind: null,
    defaultProps: { html: "<p>Enter your content here</p>", backgroundColor: "", padding: "12px" },
  },
  {
    type: "image",
    label: "Image",
    icon: "🖼️",
    group: "Display",
    description: "Display an image",
    spColumnKind: null,
    defaultProps: { url: "", altText: "", maxWidth: "100%", caption: "", linkOnClick: "" },
  },
  {
    type: "videoembed",
    label: "Video Embed",
    icon: "🎬",
    group: "Display",
    description: "Embed YouTube/Vimeo or MP4",
    spColumnKind: null,
    defaultProps: { url: "", autoplay: false, showControls: true, caption: "" },
  },
  {
    type: "alert",
    label: "Alert / Notice",
    icon: "⚠️",
    group: "Display",
    description: "Styled info/warning/error/success box",
    spColumnKind: null,
    defaultProps: { type: "info", icon: true, title: "", body: "", dismissible: false },
  },
  {
    type: "progress",
    label: "Progress Indicator",
    icon: "📶",
    group: "Display",
    description: "Visual progress bar or step tracker",
    spColumnKind: null,
    defaultProps: { type: "bar", currentStep: 1, totalSteps: 5, showPercentage: true },
  },
  {
    type: "countdown",
    label: "Countdown Timer",
    icon: "⏳",
    group: "Display",
    description: "Countdown to a datetime",
    spColumnKind: null,
    defaultProps: { endDateTime: "", onExpireAction: "disable", onExpireMessage: "Time expired" },
  },
  {
    type: "datatable",
    label: "Data Table",
    icon: "📋",
    group: "Display",
    description: "Read-only table from API",
    spColumnKind: null,
    defaultProps: { endpointUrl: "", columns: [], pagination: true, sortable: true },
  },
  {
    type: "chartdisplay",
    label: "Chart Display",
    icon: "📈",
    group: "Display",
    description: "Render chart inline",
    spColumnKind: null,
    defaultProps: { chartType: "bar", dataSource: "static", colors: ["#5B21B6", "#7C3AED"] },
  },
  {
    type: "scorecard",
    label: "Scorecard",
    icon: "🎯",
    group: "Display",
    description: "Computed score badge",
    spColumnKind: 9,
    defaultProps: { expression: "", thresholds: { green: 80, amber: 60, red: 0 }, label: "Score" },
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
    "primaryColor",
    "backgroundColor",
    "textColor",
    "errorColor",
    "fontFamily",
    "borderRadius",
    "labelPosition",
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

export interface SpColumnInfo {
  FieldTypeKind: number;
  label: string;
}

export function getSpColumnKind(
  field: Pick<FormBuilderField, 'type' | 'inputType' | 'maxSelect' | 'choices'>
): SpColumnInfo | null {
  // dynamicmatrix and tableinput are provisioned separately as _Html + _Json
  if (field.type === 'dynamicmatrix' || field.type === 'tableinput') return null;

  // Choice fields: map to SharePoint Choice (6) or MultiChoice (15)
  if (field.type === 'dropdown' || field.type === 'radiogroup') {
    return { FieldTypeKind: 6, label: 'Choice' };
  }
  if (field.type === 'checkbox') {
    return { FieldTypeKind: 15, label: 'MultiChoice' };
  }
  if (field.type === 'buttongroup') {
    // Single-select (maxSelect === 1 or undefined) → Choice; multi-select → MultiChoice
    const isMulti = typeof field.maxSelect === 'number' && field.maxSelect > 1;
    return { FieldTypeKind: isMulti ? 15 : 6, label: isMulti ? 'MultiChoice' : 'Choice' };
  }

  // Complex types that produce arrays/objects → store as JSON in multi-line text
  if (field.type === 'ranking' || field.type === 'budgetallocator' || field.type === 'rangeslider') {
    return { FieldTypeKind: 3, label: 'Multi-line' };
  }

  // Date range stores two values → multi-line text (JSON)
  if (field.type === 'daterange') {
    return { FieldTypeKind: 3, label: 'Multi-line' };
  }

  const def = QUESTION_TYPES.find(
    (t) =>
      t.type === field.type &&
      (t.defaultProps?.inputType === field.inputType ||
        !t.defaultProps?.inputType ||
        !field.inputType)
  );
  if (!def) return { FieldTypeKind: 2, label: 'Text' };

  const kind = def.spColumnKind;
  if (kind === null) return null;

  const labels: Record<number, string> = {
    2: 'Text',
    3: 'Multi-line',
    4: 'DateTime',
    6: 'Choice',
    8: 'Yes/No',
    9: 'Number',
    15: 'MultiChoice',
  };
  return { FieldTypeKind: kind, label: labels[kind] || 'Text' };
}

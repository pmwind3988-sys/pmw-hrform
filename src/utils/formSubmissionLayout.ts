import { isManagedCompanyQuestion } from "./companySelection";

type SurveyElement = Record<string, unknown>;

export interface FormSubmissionField {
  key: string;
  label: string;
  type: string;
  value: unknown;
  kind: "field" | "matrix";
  matrixColumns?: { name: string; title: string }[];
  matrixRows?: Record<string, unknown>[];
}

export interface FormSubmissionSection {
  id: string;
  title: string;
  fields: FormSubmissionField[];
}

interface BuildFormSubmissionSectionsOptions {
  fallbackSectionTitle?: string;
  formatFallbackLabel?: (key: string) => string;
  includeAdditionalFields?: boolean;
  shouldIncludeField?: (key: string, value: unknown, element?: SurveyElement) => boolean;
}

const LAYOUT_TYPES = new Set([
  "html",
  "image",
  "spacer",
  "divider",
  "pagebreak",
  "videeembed",
  "videoembed",
  "alert",
  "countdown",
  "datatable",
  "chartdisplay",
]);

const MATRIX_TYPES = new Set(["dynamicmatrix", "matrixdynamic", "tableinput"]);

const CHILD_ELEMENT_KEYS = ["elements", "templateElements", "questions"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasDisplayValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function elementLabel(element: SurveyElement, fallback: string): string {
  return textValue(element.title) || textValue(element.name) || fallback;
}

function pageTitle(page: SurveyElement, fallback: string): string {
  return textValue(page.title) || textValue(page.name) || fallback;
}

function getChildElements(element: SurveyElement): SurveyElement[] {
  const children: SurveyElement[] = [];
  for (const key of CHILD_ELEMENT_KEYS) {
    const value = element[key];
    if (Array.isArray(value)) {
      children.push(...value.filter(isRecord));
    }
  }

  const columns = element.columns;
  if (Array.isArray(columns) && !MATRIX_TYPES.has(textValue(element.type).toLowerCase())) {
    for (const column of columns) {
      if (isRecord(column) && Array.isArray(column.elements)) {
        children.push(...column.elements.filter(isRecord));
      }
    }
  }

  return children;
}

function matrixColumns(element: SurveyElement): { name: string; title: string }[] {
  const columns = element.columns;
  if (!Array.isArray(columns)) return [];
  return columns.filter(isRecord).map((column) => {
    const name = textValue(column.name);
    return {
      name,
      title: textValue(column.title) || name,
    };
  }).filter((column) => column.name);
}

function matrixRows(key: string, responseData: Record<string, unknown>): Record<string, unknown>[] {
  const childRows = responseData[`${key}_childRows`];
  if (isRecord(childRows) && Array.isArray(childRows.rows)) {
    return childRows.rows.filter(isRecord);
  }

  const directValue = responseData[key];
  if (Array.isArray(directValue)) {
    return directValue.filter(isRecord);
  }

  return [];
}

function responseValueForElement(element: SurveyElement, responseData: Record<string, unknown>): unknown {
  const key = textValue(element.name);
  const type = textValue(element.type).toLowerCase();
  if (!key) return undefined;

  if (MATRIX_TYPES.has(type)) {
    const childRows = responseData[`${key}_childRows`];
    if (hasDisplayValue(childRows)) return childRows;
    if (hasDisplayValue(responseData[`${key}_Response`])) return responseData[`${key}_Response`];
    if (hasDisplayValue(responseData[`${key}_Html`])) return responseData[`${key}_Html`];
  }

  return responseData[key];
}

function addFieldToSection(
  sections: Map<string, FormSubmissionSection>,
  sectionTitle: string,
  field: FormSubmissionField,
): void {
  const sectionId = sectionTitle || "Submitted answers";
  const current = sections.get(sectionId) ?? { id: sectionId, title: sectionId, fields: [] };
  current.fields.push(field);
  sections.set(sectionId, current);
}

function shouldSkipAdditionalKey(key: string): boolean {
  return key.endsWith("_Json") || key.endsWith("_RowIds") || key.endsWith("_childRows");
}

export function buildFormSubmissionSections(
  surveyJson: unknown,
  responseData: Record<string, unknown>,
  options: BuildFormSubmissionSectionsOptions = {},
): FormSubmissionSection[] {
  const sections = new Map<string, FormSubmissionSection>();
  const usedKeys = new Set<string>();
  const fallbackSectionTitle = options.fallbackSectionTitle ?? "Submitted answers";
  const includeAdditionalFields = options.includeAdditionalFields ?? true;
  const formatFallbackLabel = options.formatFallbackLabel ?? ((key: string) => key);

  const root = isRecord(surveyJson) && isRecord(surveyJson.surveyJson) ? surveyJson.surveyJson : surveyJson;
  const pages = isRecord(root) && Array.isArray(root.pages) ? root.pages.filter(isRecord) : [];

  const visitElement = (element: SurveyElement, currentSectionTitle: string) => {
    const type = textValue(element.type).toLowerCase();
    const key = textValue(element.name);
    const children = getChildElements(element);

    if (type === "panel" || type === "paneldynamic") {
      const nextSectionTitle = elementLabel(element, currentSectionTitle || fallbackSectionTitle);
      for (const child of children) visitElement(child, nextSectionTitle);
      return;
    }

    if (children.length > 0 && (type === "columns" || !key)) {
      for (const child of children) visitElement(child, currentSectionTitle);
      return;
    }

    if (!key || LAYOUT_TYPES.has(type) || isManagedCompanyQuestion(element)) return;

    const value = responseValueForElement(element, responseData);
    if (!hasDisplayValue(value)) return;
    if (options.shouldIncludeField && !options.shouldIncludeField(key, value, element)) return;

    usedKeys.add(key);
    usedKeys.add(`${key}_Response`);
    usedKeys.add(`${key}_Html`);
    usedKeys.add(`${key}_Json`);
    usedKeys.add(`${key}_RowIds`);
    usedKeys.add(`${key}_childRows`);

    const rows = MATRIX_TYPES.has(type) ? matrixRows(key, responseData) : [];
    addFieldToSection(sections, currentSectionTitle || fallbackSectionTitle, {
      key,
      label: elementLabel(element, formatFallbackLabel(key)),
      type,
      value,
      kind: MATRIX_TYPES.has(type) && rows.length > 0 ? "matrix" : "field",
      matrixColumns: MATRIX_TYPES.has(type) ? matrixColumns(element) : undefined,
      matrixRows: rows.length > 0 ? rows : undefined,
    });
  };

  pages.forEach((page, pageIndex) => {
    const title = pageTitle(page, pages.length > 1 ? `Page ${pageIndex + 1}` : fallbackSectionTitle);
    const elements = Array.isArray(page.elements) ? page.elements.filter(isRecord) : [];
    for (const element of elements) visitElement(element, title);
  });

  if (includeAdditionalFields) {
    for (const [key, value] of Object.entries(responseData)) {
      if (usedKeys.has(key) || shouldSkipAdditionalKey(key) || !hasDisplayValue(value)) continue;
      if (options.shouldIncludeField && !options.shouldIncludeField(key, value)) continue;
      addFieldToSection(sections, "Additional data", {
        key,
        label: formatFallbackLabel(key),
        type: "",
        value,
        kind: "field",
      });
    }
  }

  return [...sections.values()].filter((section) => section.fields.length > 0);
}

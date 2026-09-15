/** helpers.tsx — Formatting and probing helpers shared by every PDF section. */
import { View, Text, Image } from "@react-pdf/renderer";
import { buildFormSubmissionSections, type FormSubmissionField } from "../formSubmissionLayout";
import { formatPdfDateTimeValue, formatPdfFieldValue, getPdfMeasureContext } from "../pdfFieldFormatting";
import type { DocumentControlHeader } from "../../types";
import type { PdfLayerResult } from "../FormPdfDocument";
import { C, S } from "./styles";
import { groupColumnHeaders, guideToLines } from "../matrixData";

export function fmtDate(d: string | undefined | null): string {
  if (!d) return "—";
  const formatted = formatPdfDateTimeValue(d, true);
  return formatted === d ? "N/A" : formatted;
}

export function fmtVal(v: unknown, field: Partial<FormSubmissionField> = {}): string {
  return formatPdfFieldValue(v, field);
}

export function isEmptyPdfValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function fallbackPdfLabel(key: string): string {
  const decoded = key.replace(/_x([0-9a-fA-F]{4})_/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return decoded
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim() || key;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseMaybeJson(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

export function isImageSource(value: string): boolean {
  const trimmed = value.trim();
  return /^data:image\//i.test(trimmed) || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(trimmed);
}

export function isSharePointImageCandidate(value: string): boolean {
  const trimmed = value.trim();
  return /^(https?:\/\/|\/)/i.test(trimmed) && /(\/sites\/|\/teams\/|\/Signature%20Images\/|\/Signature Images\/|\/Form%20PDFs\/|\/Lists\/)/i.test(trimmed);
}

export function extractImageSrcFromHtml(value: string): string {
  const match = value.match(/<img\b[^>]*\bsrc=(["'])(.*?)\1/i);
  return match?.[2]?.trim() ?? "";
}

export function splitSharePointUrlFieldValue(value: string): string {
  const trimmed = value.trim();
  const separatorIndex = trimmed.search(/,\s+/);
  if (separatorIndex === -1) return trimmed;
  return trimmed.slice(0, separatorIndex).trim();
}

export function collectImageSources(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(collectImageSources);

  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsed = parseMaybeJson(trimmed);
    if (parsed !== null) return collectImageSources(parsed);
    const htmlSrc = extractImageSrcFromHtml(trimmed);
    const candidate = splitSharePointUrlFieldValue(htmlSrc || trimmed);
    return isImageSource(candidate) || isSharePointImageCandidate(candidate) ? [candidate] : [];
  }

  if (!isRecord(value)) return [];

  const directKeys = ["Url", "url", "webUrl", "WebUrl", "LinkingUrl", "linkingUrl", "ServerRelativeUrl", "serverRelativeUrl"];
  for (const key of directKeys) {
    const next = value[key];
    if (typeof next === "string") {
      const candidate = splitSharePointUrlFieldValue(next);
      if (isImageSource(candidate) || isSharePointImageCandidate(candidate)) return [candidate];
    }
  }

  const serverUrl = value.serverUrl || value.ServerUrl;
  const relativeUrl = value.serverRelativeUrl || value.ServerRelativeUrl;
  if (typeof serverUrl === "string" && typeof relativeUrl === "string") {
    const url = `${serverUrl.replace(/\/$/, "")}${relativeUrl}`;
    return isImageSource(url) || isSharePointImageCandidate(url) ? [url] : [];
  }

  return [];
}

export function docControlCells(
  header: DocumentControlHeader | undefined,
  formVersion: string,
): { label: string; value: string }[] {
  if (!header) return [];
  const pairs: { label: string; value: string }[] = [
    { label: "Document No.", value: (header.documentNumber ?? "").trim() },
    { label: "Issue No.", value: (header.issueNumber ?? "").trim() },
    { label: "Effective Date", value: formatPdfDateTimeValue((header.effectiveDate ?? "").trim(), false) },
    { label: "Revision No.", value: (header.revisionNumber ?? "").trim() || formVersion },
    { label: "Revision Date", value: formatPdfDateTimeValue((header.revisionDate ?? "").trim(), false) },
  ];
  return pairs.filter((pair) => pair.value && pair.value !== "—");
}

export function badgeStyle(status?: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("reject")) return { bg: C.redBg, text: C.redText, border: C.redBorder, label: "REJECTED" };
  if (s.includes("approved") || s.includes("completed")) return { bg: C.greenBg, text: C.greenText, border: C.greenBorder, label: "APPROVED" };
  if (s.includes("confirm")) return { bg: C.greenBg, text: C.greenText, border: C.greenBorder, label: "CONFIRMED" };
  if (s.includes("submit")) return { bg: C.blueBg, text: C.blueText, border: C.blueBorder, label: "SUBMITTED" };
  return { bg: C.grayBg, text: C.grayText, border: C.borderLight, label: (status || "SUBMITTED").toUpperCase() };
}

// ── Layer row component ───────────────────────────────────────────────────

export function LayerRow({ layer }: { layer: PdfLayerResult; isLast: boolean }) {
  const badge = badgeStyle(layer.status);
  const isManualPaper = layer.status.trim().toLowerCase().startsWith("manual ");
  const rejectedAtLayer = layer.status.toLowerCase().includes("rejected at layer") ? layer.status : "";
  const remarks = isManualPaper ? "" : layer.rejection || rejectedAtLayer || (layer.type === "evaluation" ? "Confirmed" : "");
  return (
    <View style={S.layerRow} wrap={false}>
      <Text style={[S.layerCell, S.colNum]}>{layer.layerNumber}</Text>
      <Text style={[S.layerCell, S.colType]}>{layer.type === "evaluation" ? "Eval" : "Approval"}</Text>
      <Text style={[S.layerCell, S.colStatus, { color: badge.text }]}>{badge.label}</Text>
      <Text style={[S.layerCell, S.colEmail]}>{isManualPaper ? "" : layer.email || ""}</Text>
      <Text style={[S.layerCell, S.colTime]}>{isManualPaper ? "" : fmtDate(layer.signedAt)}</Text>
      <Text style={[S.layerCell, S.colReason]}>{remarks}</Text>
    </View>
  );
}

export function renderMatrixField(field: FormSubmissionField) {
  const rows = field.matrixRows ?? [];
  const columns: NonNullable<FormSubmissionField["matrixColumns"]> = field.matrixColumns?.length
    ? field.matrixColumns
    : Object.keys(rows[0] ?? {}).map((key) => ({ name: key, title: key }));
  if (rows.length === 0 || columns.length === 0) return null;

  const pct = Math.max(10, Math.floor(100 / columns.length));
  const colPct = `${pct}%`;
  // Banner row above the column titles, when the author grouped anything.
  // react-pdf has no colspan, so a group cell is simply as wide as the columns
  // it covers; an ungrouped column gets a blank cell and keeps its title below.
  const banner = groupColumnHeaders(columns);
  // The legend travels with the table it explains; react-pdf cannot draw the
  // author's HTML, so it arrives as lines.
  const guideLines = guideToLines(field.matrixGuide ?? "");
  return (
    <View style={S.matrixSection} wrap={false}>
      <Text style={S.matrixFieldLabel}>{field.label}</Text>
      <View style={S.matrixTable}>
        {banner.length > 0 && (
          <View style={S.matrixGroupRow}>
            {banner.map((span, index) => (
              <View
                key={`${field.key}-group-${index}`}
                style={[S.matrixHeaderCell, { width: `${pct * span.span}%` }, index === banner.length - 1 ? { borderRightWidth: 0 } : {}]}
              >
                <Text style={S.matrixGroupText}>{span.title}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={S.matrixHeaderRow}>
          {columns.map((column, index) => (
            <View key={column.name} style={[S.matrixHeaderCell, { width: colPct }, index === columns.length - 1 ? { borderRightWidth: 0 } : {}]}>
              <Text style={S.matrixHeaderText}>{column.title || column.name}</Text>
            </View>
          ))}
        </View>
        {rows.map((row, rowIndex) => (
          <View key={`${field.key}-${rowIndex}`} style={[S.matrixDataRow, rowIndex % 2 === 1 ? S.matrixDataRowAlt : {}]}>
            {columns.map((column, columnIndex) => (
              <View key={`${field.key}-${rowIndex}-${column.name}`} style={[S.matrixDataCell, { width: colPct }, columnIndex === columns.length - 1 ? { borderRightWidth: 0 } : {}]}>
                <Text style={S.matrixDataText}>{fmtVal(row[column.name], { type: column.cellType, inputType: column.cellType, choices: column.choices })}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      {guideLines.length > 0 && (
        <View style={S.matrixGuideBlock}>
          <Text style={S.matrixGuideTitle}>Guide</Text>
          {guideLines.map((line, index) => (
            <Text key={`${field.key}-guide-${index}`} style={S.matrixGuideLine}>
              {line}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

export function shouldRenderMeasure(field: FormSubmissionField): boolean {
  if (field.type === "rating") return true;
  if (field.inputType !== "number") return false;
  return typeof field.min === "number" && typeof field.max === "number" && field.max > field.min;
}

export function renderMeasureValue(field: FormSubmissionField) {
  const measure = getPdfMeasureContext(field, field.value);
  if (!measure) return null;
  return (
    <View style={S.measureBox}>
      <Text style={S.measureValue}>{measure.valueLabel}</Text>
      <View style={S.measureTrack}>
        <View style={[S.measureFill, { width: `${measure.percent}%` }]} />
      </View>
      <View style={S.measureScale}>
        <Text style={S.measureScaleText}>{measure.minLabel}</Text>
        <Text style={S.measureScaleText}>{measure.maxLabel}</Text>
      </View>
    </View>
  );
}

export function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function optionText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function choiceOption(choice: unknown): { value: string; label: string } | null {
  if (typeof choice === "string" || typeof choice === "number" || typeof choice === "boolean") {
    const value = String(choice);
    return { value, label: value };
  }
  if (!isRecord(choice)) return null;
  const rawValue = choice.value ?? choice.itemValue ?? choice.id ?? choice.name;
  const value = optionText(rawValue);
  if (!value) return null;
  const label = optionText(choice.text) || optionText(choice.title) || optionText(choice.label) || value;
  return { value, label };
}

export function normalizedSelectedValues(value: unknown): Set<string> {
  if (isEmptyPdfValue(value)) return new Set();
  const parsed = typeof value === "string" ? parseMaybeJson(value) ?? value : value;
  const values = Array.isArray(parsed) ? parsed : [parsed];
  return new Set(values.map((entry) => String(entry)));
}

export function choiceOptionsForField(field: FormSubmissionField): { value: string; label: string }[] {
  const type = field.type.toLowerCase();
  if (type === "boolean" || type === "consent") {
    return [
      { value: "true", label: field.labelTrue || "Yes" },
      { value: "false", label: field.labelFalse || "No" },
    ];
  }
  return (field.choices ?? []).map(choiceOption).filter((option): option is { value: string; label: string } => option !== null);
}

export function shouldRenderTickboxes(field: FormSubmissionField): boolean {
  const type = field.type.toLowerCase();
  return ["boolean", "consent", "dropdown", "radiogroup", "checkbox", "tagbox", "buttongroup"].includes(type)
    || ((field.choices?.length ?? 0) > 0 && ["", "text"].includes(type));
}

export function isLongTextField(field: FormSubmissionField): boolean {
  const type = field.type.toLowerCase();
  const inputType = field.inputType?.toLowerCase() ?? "";
  return type === "comment" || type === "richedit" || type === "html" || inputType === "comment" || (field.rows ?? 0) > 1;
}

export function lineCountForField(field: FormSubmissionField): number {
  if (isLongTextField(field)) return Math.max(4, Math.min(10, Math.trunc(field.rows ?? 5)));
  return 2;
}

export function renderPaperLines(field: FormSubmissionField) {
  const lines = Array.from({ length: lineCountForField(field) });
  return (
    <View style={S.paperFieldBox}>
      {lines.map((_, index) => (
        <View key={`${field.key}-line-${index}`} style={S.paperLine} />
      ))}
    </View>
  );
}

export function renderTickboxOptions(field: FormSubmissionField) {
  const options = choiceOptionsForField(field);
  if (options.length === 0) return renderPaperLines(field);
  const selected = normalizedSelectedValues(field.value);
  if (field.type.toLowerCase() === "boolean" || field.type.toLowerCase() === "consent") {
    const boolValue = typeof field.value === "boolean" ? String(field.value) : String(field.value).toLowerCase();
    if (boolValue === "yes") selected.add("true");
    if (boolValue === "no") selected.add("false");
  }
  return (
    <View style={S.paperOptionGroup}>
      {options.map((option) => (
        <View key={`${field.key}-${option.value}`} style={S.paperOption}>
          <View style={S.paperOptionBox}>
            {selected.has(option.value) ? <Text style={S.paperOptionMark}>X</Text> : null}
          </View>
          <Text style={S.paperOptionLabel}>{option.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function renderPaperFieldValue(field: FormSubmissionField) {
  if (shouldRenderTickboxes(field)) return renderTickboxOptions(field);
  return renderPaperLines(field);
}

const NON_INPUT_EVALUATION_TYPES = new Set([
  "html",
  "image",
  "spacer",
  "divider",
  "pagebreak",
  "alert",
  "countdown",
  "datatable",
  "chartdisplay",
]);

export function evaluationChildElements(element: Record<string, unknown>): Record<string, unknown>[] {
  const children: Record<string, unknown>[] = [];
  for (const key of ["elements", "templateElements", "questions"]) {
    const value = element[key];
    if (Array.isArray(value)) children.push(...value.filter(isRecord));
  }
  const columns = element.columns;
  if (Array.isArray(columns)) {
    for (const column of columns) {
      if (isRecord(column) && Array.isArray(column.elements)) {
        children.push(...column.elements.filter(isRecord));
      }
    }
  }
  return children;
}

export function emptyEvaluationFields(elements: Record<string, unknown>[]): FormSubmissionField[] {
  const fields: FormSubmissionField[] = [];
  const visit = (element: Record<string, unknown>): void => {
    const type = textValue(element.type).toLowerCase();
    const key = textValue(element.name);
    const children = evaluationChildElements(element);
    if (type === "panel" || type === "paneldynamic" || (!key && children.length > 0)) {
      for (const child of children) visit(child);
      return;
    }
    if (!key || NON_INPUT_EVALUATION_TYPES.has(type)) return;
    fields.push({
      key,
      label: textValue(element.title) || fallbackPdfLabel(key),
      type: textValue(element.type),
      inputType: textValue(element.inputType) || undefined,
      choices: Array.isArray(element.choices) ? element.choices : undefined,
      rateValues: Array.isArray(element.rateValues) ? element.rateValues : undefined,
      rateMin: numberValue(element.rateMin),
      rateMax: numberValue(element.rateMax),
      minRateDescription: textValue(element.minRateDescription) || undefined,
      maxRateDescription: textValue(element.maxRateDescription) || undefined,
      rows: numberValue(element.rows),
      labelTrue: textValue(element.labelTrue) || undefined,
      labelFalse: textValue(element.labelFalse) || undefined,
      value: "",
      kind: "field",
    });
  };
  for (const element of elements) visit(element);
  return fields;
}

export function evaluationFieldsForLayer(layer: PdfLayerResult, includeEmpty: boolean): FormSubmissionField[] {
  const fields = layer.evaluationFields;
  const elements = layer.evaluationSurveyElements ?? [];
  if ((!fields || Object.keys(fields).length === 0) && includeEmpty) return emptyEvaluationFields(elements);
  if (!fields || Object.keys(fields).length === 0) return [];
  if (elements.length > 0) {
    return buildFormSubmissionSections({ pages: [{ name: "Evaluation", elements }] }, fields, {
      fallbackSectionTitle: "Evaluation",
      formatFallbackLabel: fallbackPdfLabel,
      includeAdditionalFields: true,
    }).flatMap((section) => section.fields);
  }

  return Object.entries(fields).map(([key, value]) => ({
    key,
    label: fallbackPdfLabel(key),
    type: "",
    value,
    kind: "field",
  }));
}

export function renderImageSources(sources: string[]) {
  if (sources.length === 0) return null;
  return (
    <View style={S.imageGrid}>
      {sources.map((src, index) => (
        <View key={`${src}-${index}`} style={S.imageTile} wrap={false}>
          <Image style={S.imagePreview} src={src} />
        </View>
      ))}
    </View>
  );
}

/**
 * EvaluationSummary.tsx — Read-only display of evaluation layer results.
 * Shows evaluator name, date, and field values.
 */
import type { EvaluationLayerResult } from "../../types";
import { ratingStepLabel } from "../../utils/ratingLabels";
import { editorial } from "../../theme/editorial";

interface EvaluationSummaryProps {
  result: EvaluationLayerResult;
  layerTitle?: string;
  layerDescription?: string;
  surveyElements?: Record<string, unknown>[];
}

interface EvaluationFieldDefinition {
  name: string;
  title: string;
  type: string;
  rateMin?: number;
  rateMax?: number;
  rateValues?: unknown[];
  minRateDescription?: string;
  maxRateDescription?: string;
  currency?: string;
  currencySymbol?: string;
  locale?: string;
  decimalPlaces?: number;
  displayFormat?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatFieldName(key: string): string {
  return key
    .replace(/_x0020_/gi, " ")
    .replace(/_x002f_/gi, "/")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase()) || key;
}

function numberFromValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateTime(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).replace(",", "");
}

function fieldLooksCurrencyLike(field: EvaluationFieldDefinition, value: unknown): boolean {
  if (numberFromValue(value) === null) return false;
  if (field.type === "currency" || field.currency || field.currencySymbol) return true;
  if (field.displayFormat?.toLowerCase() === "currency") return true;
  return /\b(cost|amount|price|fee|claim|expense|budget|total|subtotal)\b/.test(`${field.name} ${field.title}`.toLowerCase());
}

function formatCurrency(value: unknown, field: EvaluationFieldDefinition): string {
  const numericValue = numberFromValue(value);
  if (numericValue === null) return formatValue(value, { ...field, type: "text", currency: undefined, currencySymbol: undefined });
  const symbol = field.currencySymbol?.trim() || (field.currency === "MYR" || !field.currency ? "RM" : field.currency);
  const decimals = field.decimalPlaces ?? 2;
  return `${symbol} ${new Intl.NumberFormat(field.locale || "en-MY", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numericValue)}`;
}

function formatValue(value: unknown, field?: EvaluationFieldDefinition): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map((entry) => formatValue(entry, field)).join(", ");
  if (field && fieldLooksCurrencyLike(field, value)) return formatCurrency(value, field);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function collectFieldDefinitions(elements: Record<string, unknown>[] | undefined): Map<string, EvaluationFieldDefinition> {
  const definitions = new Map<string, EvaluationFieldDefinition>();
  const visit = (element: Record<string, unknown>) => {
    const name = typeof element.name === "string" ? element.name : "";
    if (name) {
      definitions.set(name, {
        name,
        title: typeof element.title === "string" && element.title.trim() ? element.title.trim() : formatFieldName(name),
        type: typeof element.type === "string" ? element.type : "text",
        rateMin: typeof element.rateMin === "number" ? element.rateMin : undefined,
        rateMax: typeof element.rateMax === "number" ? element.rateMax : undefined,
        rateValues: Array.isArray(element.rateValues) ? element.rateValues : undefined,
        minRateDescription: typeof element.minRateDescription === "string" ? element.minRateDescription : undefined,
        maxRateDescription: typeof element.maxRateDescription === "string" ? element.maxRateDescription : undefined,
        currency: typeof element.currency === "string" ? element.currency : undefined,
        currencySymbol: typeof element.currencySymbol === "string" ? element.currencySymbol : undefined,
        locale: typeof element.locale === "string" ? element.locale : undefined,
        decimalPlaces: typeof element.decimalPlaces === "number" ? element.decimalPlaces : undefined,
        displayFormat: typeof element.displayFormat === "string" ? element.displayFormat : undefined,
      });
    }
    for (const key of ["elements", "templateElements", "questions"]) {
      const children = element[key];
      if (Array.isArray(children)) children.filter(isRecord).forEach(visit);
    }
  };
  elements?.filter(isRecord).forEach(visit);
  return definitions;
}

function RatingDisplay({ field, value }: { field: EvaluationFieldDefinition; value: unknown }) {
  const rating = numberFromValue(value);
  if (rating === null) return <span>{formatValue(value, field)}</span>;
  const min = field.rateMin ?? 1;
  const max = field.rateMax ?? 5;
  const percent = max > min ? ((Math.min(max, Math.max(min, rating)) - min) / (max - min)) * 100 : 100;
  const chosen = ratingStepLabel(field.rateValues, rating);

  return (
    <div style={{ display: "grid", gap: 6, minWidth: 150 }}>
      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {chosen && <span style={{ marginRight: 6, fontWeight: 700 }}>{chosen}</span>}
        {rating} / {max}
      </div>
      <div style={{ height: 7, borderRadius: 999, background: editorial.border, overflow: "hidden" }}>
        <div style={{ width: `${percent}%`, height: "100%", background: "linear-gradient(90deg, #F7C948, #6264A7)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: editorial.muted }}>
        <span>{field.minRateDescription || min}</span>
        <span>{field.maxRateDescription || max}</span>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: editorial.blueSoft,
  boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.08), 0 8px 20px rgba(26, 31, 43, 0.06)",
  borderRadius: 12,
  padding: "16px 18px",
  marginBottom: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: editorial.muted,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  marginBottom: 4,
};

const valueStyle: React.CSSProperties = {
  fontSize: 13.5,
  color: editorial.navyDeep,
  fontWeight: 500,
  fontVariantNumeric: "tabular-nums",
};

const fieldRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "8px 0",
  borderBottom: "1px solid #F0EEF8",
};

export default function EvaluationSummary({ result, layerTitle, layerDescription, surveyElements }: EvaluationSummaryProps) {
  if (!result || result.status !== "confirmed") {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 12.5, color: editorial.softMuted, fontStyle: "italic" }}>
          {layerTitle ? `${layerTitle}: ` : ""}Not yet evaluated
        </div>
      </div>
    );
  }

  const fieldEntries = Object.entries(result.fields || {});
  const fieldDefinitions = collectFieldDefinitions(surveyElements);

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: editorial.pmwBlue }}>
          {layerTitle || `Evaluation Layer ${result.layerNumber}`}
        </div>
        {layerDescription && (
          <div style={{ fontSize: 11.5, color: editorial.muted, marginTop: 2 }}>{layerDescription}</div>
        )}
      </div>

      {/* Evaluator info */}
      <div style={{ display: "flex", gap: 24, marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #E5E3F0" }}>
        <div>
          <div style={labelStyle}>Evaluator</div>
          <div style={valueStyle}>{result.email || "Unknown"}</div>
        </div>
        <div>
          <div style={labelStyle}>Date</div>
          <div style={valueStyle}>
            {result.confirmedAt
              ? formatDateTime(result.confirmedAt)
              : "—"}
          </div>
        </div>
        <div>
          <div style={labelStyle}>Status</div>
          <div style={{ ...valueStyle, color: editorial.success }}>Confirmed</div>
        </div>
      </div>

      {/* Evaluation fields */}
      {fieldEntries.length > 0 && (
        <div>
          <div style={{ ...labelStyle, marginBottom: 8 }}>Evaluation Details</div>
          {fieldEntries.map(([key, value]) => {
            const field: EvaluationFieldDefinition = fieldDefinitions.get(key) ?? { name: key, title: formatFieldName(key), type: "text" };
            return (
              <div key={key} style={fieldRowStyle}>
                <div style={{ fontSize: 12.5, color: editorial.muted, flex: 1 }}>{field.title}</div>
                <div style={{ fontSize: 13.5, color: editorial.navyDeep, fontWeight: 500, flex: 1, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {field.type === "rating" ? <RatingDisplay field={field} value={value} /> : formatValue(value, field)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Notes */}
      {result.notes && (
        <div style={{ marginTop: 12, padding: 10, background: editorial.accentSoft, borderRadius: 8, fontSize: 12.5 }}>
          <div style={{ fontWeight: 600, color: editorial.accentText, marginBottom: 4 }}>Notes</div>
          <div style={{ color: editorial.accentText }}>{result.notes}</div>
        </div>
      )}
    </div>
  );
}

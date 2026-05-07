/**
 * EvaluationSummary.tsx — Read-only display of evaluation layer results.
 * Shows evaluator name, date, and field values.
 */
import type { EvaluationLayerResult } from "../../types";

interface EvaluationSummaryProps {
  result: EvaluationLayerResult;
  layerTitle?: string;
  layerDescription?: string;
}

// Simple field display helper
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const cardStyle: React.CSSProperties = {
  background: "#F8F7FF",
  border: "1px solid #E5E3F0",
  borderRadius: 12,
  padding: "16px 18px",
  marginBottom: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#6B7280",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 4,
};

const valueStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#1E1B4B",
  fontWeight: 500,
};

const fieldRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "8px 0",
  borderBottom: "1px solid #F0EEF8",
};

export default function EvaluationSummary({ result, layerTitle, layerDescription }: EvaluationSummaryProps) {
  if (!result || result.status !== "confirmed") {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 12, color: "#9CA3AF", fontStyle: "italic" }}>
          {layerTitle ? `${layerTitle}: ` : ""}Not yet evaluated
        </div>
      </div>
    );
  }

  const fieldEntries = Object.entries(result.fields || {});

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#5B21B6" }}>
          {layerTitle || `Evaluation Layer ${result.layerNumber}`}
        </div>
        {layerDescription && (
          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{layerDescription}</div>
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
              ? new Date(result.confirmedAt).toLocaleDateString("en-MY", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </div>
        </div>
        <div>
          <div style={labelStyle}>Status</div>
          <div style={{ ...valueStyle, color: "#059669" }}>Confirmed</div>
        </div>
      </div>

      {/* Evaluation fields */}
      {fieldEntries.length > 0 && (
        <div>
          <div style={{ ...labelStyle, marginBottom: 8 }}>Evaluation Details</div>
          {fieldEntries.map(([key, value]) => (
            <div key={key} style={fieldRowStyle}>
              <div style={{ fontSize: 12, color: "#6B7280", flex: 1 }}>{key}</div>
              <div style={{ fontSize: 13, color: "#1E1B4B", fontWeight: 500, flex: 1, textAlign: "right" }}>
                {formatValue(value)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {result.notes && (
        <div style={{ marginTop: 12, padding: 10, background: "#FFF8E7", borderRadius: 8, fontSize: 12 }}>
          <div style={{ fontWeight: 600, color: "#92400E", marginBottom: 4 }}>Notes</div>
          <div style={{ color: "#78350F" }}>{result.notes}</div>
        </div>
      )}
    </div>
  );
}
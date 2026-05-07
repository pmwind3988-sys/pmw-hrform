/**
 * EvalElementPicker.tsx - Simplified element selector for evaluation form fields
 */
import { useState } from "react";
import { C } from "./constants";
import { QUESTION_TYPES } from "../../utils/FormBuilderEngine";

interface EvalElementPickerProps {
  elements: Record<string, unknown>[];
  onChange: (elements: Record<string, unknown>[]) => void;
}

const inp = {
  width: "100%",
  height: 30,
  border: `1px solid ${C.border}`,
  borderRadius: 7,
  padding: "0 9px",
  fontSize: 12,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  color: C.textPrimary,
  background: C.white,
  outline: "none",
};

// Filter to input-capable types (exclude layout/display)
const EVALUABLE_TYPES = QUESTION_TYPES.filter(
  t => t.spColumnKind !== null && !["spacer", "divider", "pagebreak", "panel", "columns", "repeater", "html", "image", "alert", "videoembed", "countdown", "scorecard", "datatable", "chartdisplay"].includes(t.type)
);

export default function EvalElementPicker({ elements, onChange }: EvalElementPickerProps) {
  const [showGrid, setShowGrid] = useState(false);

  const addElement = (typeDef: typeof QUESTION_TYPES[number]) => {
    const name = `eval_${typeDef.type}_${elements.length + 1}`;
    const el: Record<string, unknown> = {
      type: typeDef.type,
      name,
      title: typeDef.label,
      isRequired: false,
      ...typeDef.defaultProps,
    };
    onChange([...elements, el]);
  };

  const removeElement = (idx: number) => {
    onChange(elements.filter((_, i) => i !== idx));
  };

  const updateElement = (idx: number, key: string, value: unknown) => {
    onChange(elements.map((el, i) => (i === idx ? { ...el, [key]: value } : el)));
  };

  return (
    <div>
      {/* Selected elements list */}
      {elements.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: C.textMuted,
              textTransform: "uppercase",
              letterSpacing: ".05em",
              marginBottom: 6,
            }}
          >
            Evaluation Fields ({elements.length})
          </div>
          {elements.map((el, i) => (
            <div
              key={i}
              style={{
                background: C.offWhite,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "8px 10px",
                marginBottom: 6,
              }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.textPrimary, flex: 1 }}>
                  {(el.title as string) || (el.type as string)}
                </span>
                <span style={{ fontSize: 9, color: C.textMuted }}>{el.type as string}</span>
                <button
                  onClick={() => removeElement(i)}
                  style={{
                    width: 20,
                    height: 20,
                    border: "none",
                    background: C.redPale,
                    color: C.red,
                    borderRadius: 5,
                    cursor: "pointer",
                    fontSize: 10,
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={(el.name as string) || ""}
                  onChange={e => updateElement(i, "name", e.target.value)}
                  placeholder="Field name"
                  style={{ ...inp, flex: 1, height: 26, fontSize: 11 }}
                />
                <input
                  value={(el.title as string) || ""}
                  onChange={e => updateElement(i, "title", e.target.value)}
                  placeholder="Display title"
                  style={{ ...inp, flex: 1.5, height: 26, fontSize: 11 }}
                />
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    fontSize: 10,
                    color: C.textSecond,
                    flexShrink: 0,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={(el.isRequired as boolean) || false}
                    onChange={e => updateElement(i, "isRequired", e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: C.purple }}
                  />
                  Req
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add field button / grid */}
      {!showGrid ? (
        <button
          onClick={() => setShowGrid(true)}
          style={{
            width: "100%",
            height: 30,
            border: `1px dashed ${C.purpleMid}`,
            borderRadius: 7,
            background: "none",
            color: C.purple,
            fontSize: 11,
            cursor: "pointer",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          }}
        >
          + Add evaluation field
        </button>
      ) : (
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: C.textMuted,
              textTransform: "uppercase",
              letterSpacing: ".05em",
              marginBottom: 6,
            }}
          >
            Select field type
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 4,
              marginBottom: 8,
            }}
          >
            {EVALUABLE_TYPES.map(td => (
              <button
                key={td.type}
                onClick={() => {
                  addElement(td);
                  setShowGrid(false);
                }}
                style={{
                  padding: "5px 4px",
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  background: C.white,
                  cursor: "pointer",
                  fontSize: 10,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                  color: C.textSecond,
                  textAlign: "center" as const,
                  transition: "all .1s",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = C.purpleMid;
                  e.currentTarget.style.background = C.purplePale;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = C.border;
                  e.currentTarget.style.background = C.white;
                }}
              >
                <div style={{ fontSize: 13 }}>{td.icon}</div>
                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{td.label}</div>
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowGrid(false)}
            style={{
              fontSize: 10,
              color: C.textMuted,
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

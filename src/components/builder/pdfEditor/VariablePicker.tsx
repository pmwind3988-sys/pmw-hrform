/** VariablePicker.tsx — Grouped, searchable variable list that inserts a token. */
import { useState } from "react";
import SearchIcon from "@mui/icons-material/Search";
import { C } from "../constants";
import type { PdfVariable } from "../../../utils/pdfTemplate/variables";

export function groupVariables(catalogue: PdfVariable[]): { group: string; items: PdfVariable[] }[] {
  const groups: { group: string; items: PdfVariable[] }[] = [];
  for (const variable of catalogue) {
    const existing = groups.find((g) => g.group === variable.group);
    if (existing) existing.items.push(variable);
    else groups.push({ group: variable.group, items: [variable] });
  }
  return groups;
}

export function filterVariables(catalogue: PdfVariable[], query: string): PdfVariable[] {
  const q = query.trim().toLowerCase();
  if (!q) return catalogue;
  return catalogue.filter((v) => v.label.toLowerCase().includes(q) || v.token.toLowerCase().includes(q));
}

export interface VariablePickerProps {
  catalogue: PdfVariable[];
  onPick: (token: string) => void;
  onClose: () => void;
}

export default function VariablePicker({ catalogue, onPick, onClose }: VariablePickerProps) {
  const [query, setQuery] = useState("");
  const groups = groupVariables(filterVariables(catalogue, query));

  return (
    <div
      className="bx-backdrop"
      role="presentation"
      onClick={onClose}
      style={{ zIndex: 9500 }}
    >
      <div
        className="bx-dialog bx-dialog-sm"
        role="dialog"
        aria-label="Insert variable"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bx-dialog-title" style={{ marginBottom: 12 }}>Insert variable</div>
        <div style={{ position: "relative", marginBottom: 12 }}>
          <SearchIcon
            sx={{ fontSize: 18, position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.textMuted }}
          />
          <input
            className="bx-input"
            style={{ paddingLeft: 34 }}
            placeholder="Search variables"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <div style={{ maxHeight: 360, overflow: "auto" }}>
          {groups.length === 0 && (
            <div style={{ fontSize: 13, color: C.textMuted, padding: "8px 2px" }}>No variables match your search.</div>
          )}
          {groups.map((g) => (
            <div key={g.group} style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: C.textMuted,
                  marginBottom: 6,
                }}
              >
                {g.group}
              </div>
              {g.items.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  className="bx-btn"
                  style={{
                    width: "100%",
                    justifyContent: "flex-start",
                    marginBottom: 4,
                    background: C.white,
                    border: `1px solid ${C.border}`,
                    color: C.textPrimary,
                  }}
                  onClick={() => onPick(v.token)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button type="button" className="bx-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

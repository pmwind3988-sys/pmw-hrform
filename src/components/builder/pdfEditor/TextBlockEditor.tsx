/** TextBlockEditor.tsx — Formatting toolbar and paragraph/span editing for a text block. */
import { useState } from "react";
import type { CSSProperties } from "react";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlined";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";
import FormatAlignJustifyIcon from "@mui/icons-material/FormatAlignJustify";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DataObjectIcon from "@mui/icons-material/DataObject";
import { C } from "../constants";
import VariablePicker from "./VariablePicker";
import type { RichParagraph, RichText, TextBlock } from "../../../utils/pdfTemplate/types";
import type { PdfVariable } from "../../../utils/pdfTemplate/variables";

export interface TextBlockEditorProps {
  block: TextBlock;
  catalogue: PdfVariable[];
  onChange: (content: RichText) => void;
}

const ALIGNS: { value: NonNullable<RichParagraph["align"]>; icon: typeof FormatAlignLeftIcon; label: string }[] = [
  { value: "left", icon: FormatAlignLeftIcon, label: "Align left" },
  { value: "center", icon: FormatAlignCenterIcon, label: "Align center" },
  { value: "right", icon: FormatAlignRightIcon, label: "Align right" },
  { value: "justify", icon: FormatAlignJustifyIcon, label: "Justify" },
];

const toggleBtn = (active: boolean): CSSProperties => ({
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
  borderRadius: 6,
  border: `1px solid ${active ? C.purple : C.border}`,
  background: active ? C.purplePale : C.white,
  color: active ? C.purple : C.textPrimary,
  cursor: "pointer",
});

export default function TextBlockEditor({ block, catalogue, onChange }: TextBlockEditorProps) {
  const [active, setActive] = useState<{ p: number; s: number }>({ p: 0, s: 0 });
  const [pickerOpen, setPickerOpen] = useState(false);

  const content = block.content.length > 0 ? block.content : [{ spans: [{ text: "" }] }];
  const p = Math.min(active.p, content.length - 1);
  const activeParagraph = content[p];
  const s = Math.min(active.s, Math.max(activeParagraph.spans.length - 1, 0));
  const activeSpan = activeParagraph.spans[s];

  const updateSpan = (patch: Partial<RichText[number]["spans"][number]>) => {
    const next = content.map((para, pi) =>
      pi !== p ? para : { ...para, spans: para.spans.map((sp, si) => (si !== s ? sp : { ...sp, ...patch })) },
    );
    onChange(next);
  };

  const updateParagraph = (patch: Partial<RichParagraph>) => {
    const next = content.map((para, pi) => (pi !== p ? para : { ...para, ...patch }));
    onChange(next);
  };

  const updateSpanText = (pi: number, si: number, text: string) => {
    const next = content.map((para, pidx) =>
      pidx !== pi ? para : { ...para, spans: para.spans.map((sp, sidx) => (sidx !== si ? sp : { ...sp, text })) },
    );
    onChange(next);
  };

  const addParagraph = () => {
    onChange([...content, { spans: [{ text: "" }] }]);
    setActive({ p: content.length, s: 0 });
  };

  const removeParagraph = (pi: number) => {
    if (content.length <= 1) return;
    onChange(content.filter((_, i) => i !== pi));
    setActive({ p: 0, s: 0 });
  };

  const removeSpan = (pi: number, si: number) => {
    const para = content[pi];
    if (para.spans.length <= 1) return;
    onChange(content.map((pp, pidx) => (pidx !== pi ? pp : { ...pp, spans: pp.spans.filter((_, sidx) => sidx !== si) })));
  };

  const insertVariable = (token: string) => {
    onChange(content.map((para, pi) => (pi !== p ? para : { ...para, spans: [...para.spans, { variable: token }] })));
    setPickerOpen(false);
  };

  const variableLabel = (token?: string) => catalogue.find((v) => v.token === token)?.label ?? token ?? "";

  return (
    <div style={{ border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: 10, background: C.offWhite }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <button
          type="button"
          style={toggleBtn(!!activeSpan?.bold)}
          aria-label="Bold"
          aria-pressed={!!activeSpan?.bold}
          onClick={() => updateSpan({ bold: !activeSpan?.bold })}
        >
          <FormatBoldIcon sx={{ fontSize: 16 }} />
        </button>
        <button
          type="button"
          style={toggleBtn(!!activeSpan?.italic)}
          aria-label="Italic"
          aria-pressed={!!activeSpan?.italic}
          onClick={() => updateSpan({ italic: !activeSpan?.italic })}
        >
          <FormatItalicIcon sx={{ fontSize: 16 }} />
        </button>
        <button
          type="button"
          style={toggleBtn(!!activeSpan?.underline)}
          aria-label="Underline"
          aria-pressed={!!activeSpan?.underline}
          onClick={() => updateSpan({ underline: !activeSpan?.underline })}
        >
          <FormatUnderlinedIcon sx={{ fontSize: 16 }} />
        </button>

        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.textMuted }}>
          Size
          <input
            type="number"
            aria-label="Font size"
            className="bx-input"
            style={{ width: 56, height: 28, padding: "0 6px" }}
            value={activeSpan?.fontSize ?? ""}
            placeholder="—"
            onChange={(e) => updateSpan({ fontSize: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.textMuted }}>
          Color
          <input
            type="color"
            aria-label="Text color"
            style={{ width: 28, height: 28, border: `1px solid ${C.border}`, borderRadius: 6, padding: 0 }}
            value={activeSpan?.color ?? "#1a1f2b"}
            onChange={(e) => updateSpan({ color: e.target.value })}
          />
        </label>

        <span style={{ width: 1, height: 20, background: C.border }} />

        {ALIGNS.map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            type="button"
            style={toggleBtn(activeParagraph.align === value)}
            aria-label={label}
            aria-pressed={activeParagraph.align === value}
            onClick={() => updateParagraph({ align: value })}
          >
            <Icon sx={{ fontSize: 16 }} />
          </button>
        ))}

        <button
          type="button"
          style={toggleBtn(activeParagraph.list === "bullet")}
          aria-label="Bulleted list"
          aria-pressed={activeParagraph.list === "bullet"}
          onClick={() => updateParagraph({ list: activeParagraph.list === "bullet" ? undefined : "bullet" })}
        >
          <FormatListBulletedIcon sx={{ fontSize: 16 }} />
        </button>
        <button
          type="button"
          style={toggleBtn(activeParagraph.list === "number")}
          aria-label="Numbered list"
          aria-pressed={activeParagraph.list === "number"}
          onClick={() => updateParagraph({ list: activeParagraph.list === "number" ? undefined : "number" })}
        >
          <FormatListNumberedIcon sx={{ fontSize: 16 }} />
        </button>

        <span style={{ width: 1, height: 20, background: C.border }} />

        <button
          type="button"
          className="bx-btn bx-btn-sm bx-btn-secondary"
          onClick={() => setPickerOpen(true)}
        >
          <DataObjectIcon sx={{ fontSize: 16 }} /> Insert variable
        </button>
      </div>

      {content.map((para, pi) => (
        <div key={pi} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 8 }}>
          <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {para.spans.map((span, si) =>
              span.variable ? (
                <span
                  key={si}
                  onClick={() => setActive({ p: pi, s: si })}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    background: C.purplePale,
                    color: C.purple,
                    border: `1px solid ${p === pi && s === si ? C.purple : "transparent"}`,
                    borderRadius: 12,
                    padding: "2px 8px",
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {variableLabel(span.variable)}
                  <button
                    type="button"
                    aria-label={`Remove ${variableLabel(span.variable)} variable`}
                    style={{ display: "flex", background: "none", border: "none", cursor: "pointer", padding: 0, color: C.purple }}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSpan(pi, si);
                    }}
                  >
                    <CloseIcon sx={{ fontSize: 13 }} />
                  </button>
                </span>
              ) : (
                <input
                  key={si}
                  className="bx-input"
                  style={{
                    flex: 1,
                    minWidth: 120,
                    height: 30,
                    border: p === pi && s === si ? `1px solid ${C.purple}` : undefined,
                  }}
                  value={span.text ?? ""}
                  placeholder="Text…"
                  onFocus={() => setActive({ p: pi, s: si })}
                  onChange={(e) => updateSpanText(pi, si, e.target.value)}
                />
              ),
            )}
          </div>
          <button
            type="button"
            className="bx-ghost"
            aria-label="Remove paragraph"
            disabled={content.length <= 1}
            onClick={() => removeParagraph(pi)}
          >
            <CloseIcon sx={{ fontSize: 16 }} />
          </button>
        </div>
      ))}

      <button type="button" className="bx-btn bx-btn-sm bx-btn-secondary" onClick={addParagraph}>
        <AddIcon sx={{ fontSize: 16 }} /> Add paragraph
      </button>

      {pickerOpen && <VariablePicker catalogue={catalogue} onPick={insertVariable} onClose={() => setPickerOpen(false)} />}
    </div>
  );
}

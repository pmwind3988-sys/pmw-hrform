/** BlockSettings.tsx — The rail: style controls for the selected block, or the document-level footer panel when nothing is selected. */
import { useState } from "react";
import type { CSSProperties, Dispatch } from "react";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DataObjectIcon from "@mui/icons-material/DataObject";
import { C } from "../constants";
import { blockDisplayName, SMART_CONFIG_SWITCH } from "./blockNames";
import VariablePicker from "./VariablePicker";
import type { EditorAction } from "./editorState";
import type { BlockStyle, PdfBlock, RichText, TemplateFooter, TemplateFooterPage } from "../../../utils/pdfTemplate/types";
import type { PdfVariable } from "../../../utils/pdfTemplate/variables";

export interface BlockSettingsProps {
  block: PdfBlock | null;
  footer?: TemplateFooter;
  catalogue: PdfVariable[];
  dispatch: Dispatch<EditorAction>;
}

const EMPTY_CONTENT: RichText = [{ spans: [{ text: "" }] }];

/** Plain-text-plus-variables content editor: the footer renders through a
 *  callback that must return a string, so unlike a text block it has no
 *  per-span bold, italic or colour. */
function FooterContentEditor({
  content,
  catalogue,
  onChange,
}: {
  content: RichText;
  catalogue: PdfVariable[];
  onChange: (content: RichText) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const spans = content[0]?.spans ?? [{ text: "" }];
  const variableLabel = (token?: string) => catalogue.find((v) => v.token === token)?.label ?? token ?? "";

  const setSpans = (next: RichText[number]["spans"]) => onChange([{ spans: next }]);

  return (
    <div style={{ border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: 8, background: C.offWhite }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 8 }}>
        {spans.map((span, si) =>
          span.variable ? (
            <span
              key={si}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: C.purplePale,
                color: C.purple,
                borderRadius: 12,
                padding: "2px 8px",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              {variableLabel(span.variable)}
              <button
                type="button"
                aria-label={`Remove ${variableLabel(span.variable)} variable`}
                style={{ display: "flex", background: "none", border: "none", cursor: "pointer", padding: 0, color: C.purple }}
                onClick={() => setSpans(spans.filter((_, i) => i !== si))}
              >
                <CloseIcon sx={{ fontSize: 13 }} />
              </button>
            </span>
          ) : (
            <input
              key={si}
              className="bx-input"
              style={{ flex: 1, minWidth: 120, height: 30 }}
              value={span.text ?? ""}
              placeholder="Footer text…"
              onChange={(e) => setSpans(spans.map((sp, i) => (i === si ? { ...sp, text: e.target.value } : sp)))}
            />
          ),
        )}
      </div>
      <button type="button" className="bx-btn bx-btn-sm bx-btn-secondary" onClick={() => setPickerOpen(true)}>
        <DataObjectIcon sx={{ fontSize: 16 }} /> Insert variable
      </button>
      {pickerOpen && (
        <VariablePicker
          catalogue={catalogue}
          onPick={(token) => {
            setSpans([...spans, { variable: token }]);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function FooterPanel({
  footer,
  catalogue,
  dispatch,
}: {
  footer: TemplateFooter | undefined;
  catalogue: PdfVariable[];
  dispatch: Dispatch<EditorAction>;
}) {
  const mode = footer?.mode ?? "all";
  const content = footer?.content ?? EMPTY_CONTENT;
  const pages = footer?.pages ?? [];

  const setFooter = (next: TemplateFooter) => dispatch({ type: "setFooter", footer: next });

  const updatePage = (index: number, patch: Partial<TemplateFooterPage>) =>
    setFooter({ ...footer, mode, content, pages: pages.map((p, i) => (i === index ? { ...p, ...patch } : p)) });

  const removePage = (index: number) => setFooter({ ...footer, mode, content, pages: pages.filter((_, i) => i !== index) });

  const addPage = () =>
    setFooter({ ...footer, mode, content, pages: [...pages, { page: pages.length + 1, content: EMPTY_CONTENT }] });

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>Footer</div>
      <div
        style={{
          fontSize: 12,
          color: C.textMuted,
          background: C.lightGray,
          border: `1px solid ${C.borderLight}`,
          borderRadius: 8,
          padding: "8px 10px",
          marginBottom: 14,
        }}
      >
        The footer repeats on every sheet, so its text is plain text and variables only — no bold, italic or colour.
      </div>

      <div style={row}>
        <label style={label} htmlFor="bs-footer-mode">Repeat</label>
        <select
          id="bs-footer-mode"
          className="bx-input"
          value={mode}
          onChange={(e) => setFooter({ mode: e.target.value as TemplateFooter["mode"], content, pages, hideOnFirstPage: footer?.hideOnFirstPage })}
        >
          <option value="all">Same on every sheet</option>
          <option value="perPage">Different on some sheets</option>
        </select>
      </div>

      <div style={row}>
        <label style={label}>Default text</label>
        <FooterContentEditor
          content={content}
          catalogue={catalogue}
          onChange={(next) => setFooter({ mode, content: next, pages, hideOnFirstPage: footer?.hideOnFirstPage })}
        />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.textPrimary, marginBottom: 14 }}>
        <input
          type="checkbox"
          checked={!!footer?.hideOnFirstPage}
          onChange={(e) => setFooter({ mode, content, pages, hideOnFirstPage: e.target.checked || undefined })}
        />
        Hide on the first sheet
      </label>

      {mode === "perPage" && (
        <div style={row}>
          <label style={label}>Page overrides</label>
          {pages.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 8 }}>
              <input
                type="number"
                className="bx-input"
                aria-label="Page number"
                style={{ width: 64, height: 30 }}
                min={1}
                value={p.page}
                onChange={(e) => updatePage(i, { page: Number(e.target.value) || 1 })}
              />
              <div style={{ flex: 1 }}>
                <FooterContentEditor
                  content={p.content}
                  catalogue={catalogue}
                  onChange={(next) => updatePage(i, { content: next })}
                />
              </div>
              <button type="button" className="bx-ghost" aria-label="Remove page override" onClick={() => removePage(i)}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </button>
            </div>
          ))}
          <button type="button" className="bx-btn bx-btn-sm bx-btn-secondary" onClick={addPage}>
            <AddIcon sx={{ fontSize: 16 }} /> Add page override
          </button>
        </div>
      )}
    </div>
  );
}

const ALIGN_OPTIONS: NonNullable<BlockStyle["align"]>[] = ["left", "center", "right", "justify"];
const FONT_OPTIONS: NonNullable<BlockStyle["fontFamily"]>[] = ["Helvetica", "Times-Roman", "Courier"];

const row: CSSProperties = { marginBottom: 12 };
const label: CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  color: C.textMuted,
  marginBottom: 5,
};

export default function BlockSettings({ block, footer, catalogue, dispatch }: BlockSettingsProps) {
  if (!block) {
    return <FooterPanel footer={footer} catalogue={catalogue} dispatch={dispatch} />;
  }

  const style = block.style ?? {};
  const patch = (next: Partial<BlockStyle>) =>
    dispatch({ type: "update", id: block.id, patch: { style: { ...style, ...next } } });

  const configSwitch = block.kind === "smart" ? SMART_CONFIG_SWITCH[block.smart] : undefined;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>
        {blockDisplayName(block)}
      </div>

      {configSwitch && (
        <div
          style={{
            fontSize: 12,
            color: C.textMuted,
            background: C.lightGray,
            border: `1px solid ${C.borderLight}`,
            borderRadius: 8,
            padding: "8px 10px",
            marginBottom: 14,
          }}
        >
          Visibility is controlled by the <strong>{configSwitch}</strong> setting in PDF settings.
        </div>
      )}

      <div style={row}>
        <label style={label} htmlFor="bs-font-family">Font family</label>
        <select
          id="bs-font-family"
          className="bx-input"
          value={style.fontFamily ?? ""}
          onChange={(e) => patch({ fontFamily: (e.target.value || undefined) as BlockStyle["fontFamily"] })}
        >
          <option value="">Default</option>
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      <div style={row}>
        <label style={label} htmlFor="bs-font-size">Font size</label>
        <input
          id="bs-font-size"
          type="number"
          className="bx-input"
          value={style.fontSize ?? ""}
          placeholder="Default"
          onChange={(e) => patch({ fontSize: e.target.value === "" ? undefined : Number(e.target.value) })}
        />
      </div>

      <div style={{ ...row, display: "flex", gap: 8 }}>
        <button
          type="button"
          className={`bx-btn bx-btn-sm ${style.bold ? "bx-btn-primary" : "bx-btn-secondary"}`}
          aria-pressed={!!style.bold}
          onClick={() => patch({ bold: !style.bold })}
        >
          Bold
        </button>
        <button
          type="button"
          className={`bx-btn bx-btn-sm ${style.italic ? "bx-btn-primary" : "bx-btn-secondary"}`}
          aria-pressed={!!style.italic}
          onClick={() => patch({ italic: !style.italic })}
        >
          Italic
        </button>
      </div>

      <div style={row}>
        <label style={label} htmlFor="bs-align">Alignment</label>
        <select
          id="bs-align"
          className="bx-input"
          value={style.align ?? ""}
          onChange={(e) => patch({ align: (e.target.value || undefined) as BlockStyle["align"] })}
        >
          <option value="">Default</option>
          {ALIGN_OPTIONS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <div style={{ ...row, display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={label} htmlFor="bs-color">Text color</label>
          <input
            id="bs-color"
            type="color"
            style={{ width: "100%", height: 34, border: `1px solid ${C.border}`, borderRadius: 7, padding: 0 }}
            value={style.color ?? "#1a1f2b"}
            onChange={(e) => patch({ color: e.target.value })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={label} htmlFor="bs-background">Background</label>
          <input
            id="bs-background"
            type="color"
            style={{ width: "100%", height: 34, border: `1px solid ${C.border}`, borderRadius: 7, padding: 0 }}
            value={style.background ?? "#ffffff"}
            onChange={(e) => patch({ background: e.target.value })}
          />
        </div>
      </div>

      <div style={{ ...row, display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={label} htmlFor="bs-margin-top">Margin top</label>
          <input
            id="bs-margin-top"
            type="number"
            className="bx-input"
            value={style.marginTop ?? ""}
            onChange={(e) => patch({ marginTop: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={label} htmlFor="bs-margin-bottom">Margin bottom</label>
          <input
            id="bs-margin-bottom"
            type="number"
            className="bx-input"
            value={style.marginBottom ?? ""}
            onChange={(e) => patch({ marginBottom: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
        </div>
      </div>

      <div style={{ ...row, display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={label} htmlFor="bs-padding-x">Padding X</label>
          <input
            id="bs-padding-x"
            type="number"
            className="bx-input"
            value={style.paddingX ?? ""}
            onChange={(e) => patch({ paddingX: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={label} htmlFor="bs-padding-y">Padding Y</label>
          <input
            id="bs-padding-y"
            type="number"
            className="bx-input"
            value={style.paddingY ?? ""}
            onChange={(e) => patch({ paddingY: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
        </div>
      </div>

      <div style={{ ...row, display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={label} htmlFor="bs-border-width">Border width</label>
          <input
            id="bs-border-width"
            type="number"
            className="bx-input"
            value={style.borderWidth ?? ""}
            onChange={(e) => patch({ borderWidth: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={label} htmlFor="bs-border-color">Border color</label>
          <input
            id="bs-border-color"
            type="color"
            style={{ width: "100%", height: 34, border: `1px solid ${C.border}`, borderRadius: 7, padding: 0 }}
            value={style.borderColor ?? "#e3e8ef"}
            onChange={(e) => patch({ borderColor: e.target.value })}
          />
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.textPrimary }}>
        <input
          type="checkbox"
          checked={!!style.breakBefore}
          onChange={(e) => patch({ breakBefore: e.target.checked || undefined })}
        />
        Start on a new page
      </label>
    </div>
  );
}

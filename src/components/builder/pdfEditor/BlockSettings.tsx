/** BlockSettings.tsx — The rail: style controls for the selected block. */
import type { CSSProperties, Dispatch } from "react";
import { C } from "../constants";
import { blockDisplayName, SMART_CONFIG_SWITCH } from "./blockNames";
import type { EditorAction } from "./editorState";
import type { BlockStyle, PdfBlock } from "../../../utils/pdfTemplate/types";

export interface BlockSettingsProps {
  block: PdfBlock | null;
  dispatch: Dispatch<EditorAction>;
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

export default function BlockSettings({ block, dispatch }: BlockSettingsProps) {
  if (!block) {
    return (
      <div style={{ padding: 16, fontSize: 13, color: C.textMuted }}>
        Select a block to edit its style.
      </div>
    );
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

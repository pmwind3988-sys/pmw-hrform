/** PdfTemplateEditor.tsx — Full-screen dialog: block list, style rail and live preview. */
import { useMemo, useReducer } from "react";
import UndoIcon from "@mui/icons-material/Undo";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import CloseIcon from "@mui/icons-material/Close";
import SaveIcon from "@mui/icons-material/Save";
import { C } from "../constants";
import { editorReducer, initialEditorState } from "./editorState";
import { buildDefaultTemplate } from "../../../utils/pdfTemplate/defaultTemplate";
import { buildVariableCatalogue } from "../../../utils/pdfTemplate/variables";
import { buildPdfSectionContext } from "../../../utils/pdfSections/context";
import BlockList from "./BlockList";
import BlockSettings from "./BlockSettings";
import TemplatePreview from "./TemplatePreview";
import type { PdfTemplate } from "../../../utils/pdfTemplate/types";
import type { PdfFormData } from "../../../utils/FormPdfDocument";
import type { PdfConfig } from "../../../types";

export interface PdfTemplateEditorProps {
  open: boolean;
  template?: PdfTemplate;
  surveyJson: unknown;
  layerCount: number;
  pdfConfig: PdfConfig;
  sampleData: PdfFormData;
  onSave: (template: PdfTemplate) => void;
  onClose: () => void;
}

export default function PdfTemplateEditor({
  open,
  template,
  surveyJson,
  layerCount,
  pdfConfig,
  sampleData,
  onSave,
  onClose,
}: PdfTemplateEditorProps) {
  const [state, dispatch] = useReducer(editorReducer, template, initialEditorState);
  const catalogue = useMemo(() => buildVariableCatalogue(surveyJson, layerCount), [surveyJson, layerCount]);
  const ctx = useMemo(() => buildPdfSectionContext({ ...sampleData, pdfConfig }), [sampleData, pdfConfig]);

  if (!open) return null;

  const selectedBlock = state.template.blocks.find((b) => b.id === state.selectedId) ?? null;

  const handleResetToDefault = () => {
    const ok = window.confirm("Reset the document to the built-in layout? Your current blocks will be replaced.");
    if (!ok) return;
    dispatch({ type: "reset", template: buildDefaultTemplate() });
  };

  return (
    <div className="bx-backdrop" role="presentation" style={{ padding: 0 }}>
      <div
        role="dialog"
        aria-label="PDF document editor"
        style={{
          width: "100%",
          height: "100%",
          maxWidth: "100%",
          maxHeight: "100%",
          background: C.offWhite,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 18px",
            borderBottom: `1px solid ${C.border}`,
            background: C.white,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: C.textPrimary, flex: 1 }}>Edit document</div>

          <button
            type="button"
            className="bx-btn bx-btn-sm bx-btn-secondary"
            disabled={state.past.length === 0}
            onClick={() => dispatch({ type: "undo" })}
          >
            <UndoIcon sx={{ fontSize: 16 }} /> Undo
          </button>
          <button type="button" className="bx-btn bx-btn-sm bx-btn-secondary" onClick={handleResetToDefault}>
            <RestartAltIcon sx={{ fontSize: 16 }} /> Reset to default
          </button>
          <button type="button" className="bx-btn bx-btn-sm bx-btn-secondary" onClick={onClose}>
            <CloseIcon sx={{ fontSize: 16 }} /> Cancel
          </button>
          <button
            type="button"
            className="bx-btn bx-btn-sm bx-btn-primary"
            onClick={() => onSave(state.template)}
          >
            <SaveIcon sx={{ fontSize: 16 }} /> Save
          </button>
        </header>

        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <div style={{ flex: "1 1 40%", minWidth: 0, overflow: "auto", padding: "12px 16px", borderRight: `1px solid ${C.border}` }}>
            <BlockList
              blocks={state.template.blocks}
              selectedId={state.selectedId}
              dispatch={dispatch}
              ctx={ctx}
              catalogue={catalogue}
            />
          </div>

          <div style={{ flex: "0 0 300px", minWidth: 260, overflow: "auto", borderRight: `1px solid ${C.border}`, background: C.white }}>
            <BlockSettings block={selectedBlock} dispatch={dispatch} />
          </div>

          <div style={{ flex: "1 1 40%", minWidth: 0, padding: 16, display: "flex", flexDirection: "column" }}>
            <TemplatePreview template={state.template} sampleData={{ ...sampleData, pdfConfig }} catalogue={catalogue} />
          </div>
        </div>
      </div>
    </div>
  );
}

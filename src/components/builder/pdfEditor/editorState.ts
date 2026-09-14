/** editorState.ts — Reducer for the block editor: template, selection and undo history.
 *
 * Deliberately separated from the visual editor so reorder/add/delete/unlock/undo
 * are testable without a DOM. `select` is the one non-mutating action: it never
 * touches the undo history. Every other action pushes the pre-change template
 * onto `past` (capped at 50 entries) before applying itself.
 */

import type { PdfBlock, PdfTemplate, TemplateFooter } from "../../../utils/pdfTemplate/types";
import { buildDefaultTemplate } from "../../../utils/pdfTemplate/defaultTemplate";

export interface EditorState {
  template: PdfTemplate;
  selectedId: string | null;
  past: PdfTemplate[];
}

export type EditorAction =
  | { type: "select"; id: string | null }
  | { type: "move"; id: string; to: number }
  | { type: "insert"; block: PdfBlock; after: string | null }
  | { type: "delete"; id: string }
  | { type: "update"; id: string; patch: Partial<PdfBlock> }
  | { type: "replace"; id: string; blocks: PdfBlock[] }
  | { type: "reset"; template: PdfTemplate }
  | { type: "setFooter"; footer: TemplateFooter | undefined }
  | { type: "undo" };

const HISTORY_LIMIT = 50;

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export function initialEditorState(stored: PdfTemplate | undefined): EditorState {
  const template = stored ? structuredClone(stored) : buildDefaultTemplate();
  return { template, selectedId: null, past: [] };
}

function pushHistory(state: EditorState): PdfTemplate[] {
  const past = [...state.past, state.template];
  return past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "select":
      return { ...state, selectedId: action.id };

    case "move": {
      const blocks = state.template.blocks;
      const index = blocks.findIndex((b) => b.id === action.id);
      if (index === -1 || action.to < 0 || action.to > blocks.length - 1) return state;
      const next = [...blocks];
      const [moved] = next.splice(index, 1);
      next.splice(action.to, 0, moved);
      return { ...state, past: pushHistory(state), template: { ...state.template, blocks: next } };
    }

    case "insert": {
      const blocks = state.template.blocks;
      const index = action.after === null ? blocks.length : blocks.findIndex((b) => b.id === action.after) + 1;
      const next = [...blocks.slice(0, index), action.block, ...blocks.slice(index)];
      return { ...state, past: pushHistory(state), template: { ...state.template, blocks: next } };
    }

    case "delete": {
      const next = state.template.blocks.filter((b) => b.id !== action.id);
      return {
        ...state,
        past: pushHistory(state),
        template: { ...state.template, blocks: next },
        selectedId: state.selectedId === action.id ? null : state.selectedId,
      };
    }

    case "update": {
      const next = state.template.blocks.map((b) => (b.id === action.id ? ({ ...b, ...action.patch } as PdfBlock) : b));
      return { ...state, past: pushHistory(state), template: { ...state.template, blocks: next } };
    }

    case "replace": {
      const blocks = state.template.blocks;
      const index = blocks.findIndex((b) => b.id === action.id);
      if (index === -1) return state;
      const next = [...blocks.slice(0, index), ...action.blocks, ...blocks.slice(index + 1)];
      return { ...state, past: pushHistory(state), template: { ...state.template, blocks: next } };
    }

    case "reset":
      return { ...state, past: pushHistory(state), template: action.template, selectedId: null };

    case "setFooter":
      return { ...state, past: pushHistory(state), template: { ...state.template, footer: action.footer } };

    case "undo": {
      if (state.past.length === 0) return state;
      const template = state.past[state.past.length - 1];
      return { ...state, template, past: state.past.slice(0, -1) };
    }

    default:
      return state;
  }
}

export function newBlock(kind: PdfBlock["kind"]): PdfBlock {
  const id = nextId(kind);
  switch (kind) {
    case "text":
      return { id, kind: "text", content: [{ spans: [{ text: "" }] }] };
    case "table":
      return {
        id,
        kind: "table",
        widths: [50, 50],
        hasHeader: true,
        rows: [
          [
            [{ spans: [{ text: "" }] }],
            [{ spans: [{ text: "" }] }],
          ],
          [
            [{ spans: [{ text: "" }] }],
            [{ spans: [{ text: "" }] }],
          ],
        ],
      };
    case "image":
      return { id, kind: "image", src: "" };
    case "spacer":
      return { id, kind: "spacer", height: 12 };
    case "divider":
      return { id, kind: "divider" };
    case "pageBreak":
      return { id, kind: "pageBreak" };
    default:
      return { id, kind: "smart", smart: "header" };
  }
}

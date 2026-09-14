/** BlockList.tsx — The document column: block cards, reorder, add, delete, unlock. */
import { useState } from "react";
import type { Dispatch } from "react";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import AddIcon from "@mui/icons-material/Add";
import { C } from "../constants";
import { blockDisplayName } from "./blockNames";
import TextBlockEditor from "./TextBlockEditor";
import { UNLOCKABLE } from "../../../utils/pdfTemplate/unlock";
import { newBlock } from "./editorState";
import type { EditorAction } from "./editorState";
import type { PdfBlock } from "../../../utils/pdfTemplate/types";
import type { PdfSectionContext } from "../../../utils/pdfSections/context";
import type { PdfVariable } from "../../../utils/pdfTemplate/variables";
import { unlockBlock } from "../../../utils/pdfTemplate/unlock";

const ADDABLE: { kind: PdfBlock["kind"]; label: string }[] = [
  { kind: "text", label: "Text" },
  { kind: "table", label: "Table" },
  { kind: "image", label: "Image" },
  { kind: "divider", label: "Divider" },
  { kind: "spacer", label: "Spacer" },
  { kind: "pageBreak", label: "Page break" },
];

export interface BlockListProps {
  blocks: PdfBlock[];
  selectedId: string | null;
  dispatch: Dispatch<EditorAction>;
  ctx: PdfSectionContext;
  catalogue: PdfVariable[];
}

function AddBlockRow({ onAdd }: { onAdd: (kind: PdfBlock["kind"]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "center", margin: "4px 0" }}>
      <button
        type="button"
        className="bx-btn bx-btn-sm bx-btn-secondary"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Add block"
      >
        <AddIcon sx={{ fontSize: 16 }} /> Add
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            zIndex: 20,
            background: C.white,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            boxShadow: C.shadowMd,
            padding: 6,
            display: "flex",
            flexDirection: "column",
            minWidth: 160,
          }}
        >
          {ADDABLE.map((item) => (
            <button
              key={item.kind}
              type="button"
              role="menuitem"
              className="bx-btn bx-btn-sm"
              style={{ justifyContent: "flex-start", background: "transparent", border: "none", color: C.textPrimary }}
              onClick={() => {
                onAdd(item.kind);
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BlockList({ blocks, selectedId, dispatch, ctx, catalogue }: BlockListProps) {
  const [dragId, setDragId] = useState<string | null>(null);

  const moveBy = (id: string, delta: number) => {
    const index = blocks.findIndex((b) => b.id === id);
    if (index === -1) return;
    dispatch({ type: "move", id, to: index + delta });
  };

  const handleUnlock = (block: PdfBlock) => {
    if (block.kind !== "smart") return;
    const ok = window.confirm(
      "Unlocking lets you edit every word of this section, but it will stop following the form. A question added later will not appear here.",
    );
    if (!ok) return;
    dispatch({ type: "replace", id: block.id, blocks: unlockBlock(block, ctx) });
  };

  const insertAfter = (afterId: string | null, kind: PdfBlock["kind"]) => {
    dispatch({ type: "insert", block: newBlock(kind), after: afterId });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", padding: "4px 2px" }}>
      <AddBlockRow onAdd={(kind) => insertAfter(null, kind)} />
      {blocks.map((block, index) => {
        const selected = block.id === selectedId;
        const name = blockDisplayName(block);
        const unlockable = block.kind === "smart" && UNLOCKABLE.includes(block.smart);
        return (
          <div key={block.id}>
            <div
              draggable
              onDragStart={() => setDragId(block.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId && dragId !== block.id) {
                  const to = blocks.findIndex((b) => b.id === block.id);
                  dispatch({ type: "move", id: dragId, to });
                }
                setDragId(null);
              }}
              onClick={() => dispatch({ type: "select", id: block.id })}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") dispatch({ type: "select", id: block.id });
              }}
              style={{
                border: `1px solid ${selected ? C.purple : C.border}`,
                background: selected ? C.purplePale : C.white,
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 8,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  aria-hidden="true"
                  style={{ color: C.textMuted, cursor: "grab", display: "flex" }}
                  title="Drag to reorder"
                >
                  <DragIndicatorIcon sx={{ fontSize: 18 }} />
                </span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.textPrimary }}>{name}</span>

                <button
                  type="button"
                  className="bx-ghost"
                  aria-label={`Move ${name} block up`}
                  disabled={index === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    moveBy(block.id, -1);
                  }}
                >
                  <KeyboardArrowUpIcon sx={{ fontSize: 18 }} />
                </button>
                <button
                  type="button"
                  className="bx-ghost"
                  aria-label={`Move ${name} block down`}
                  disabled={index === blocks.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    moveBy(block.id, 1);
                  }}
                >
                  <KeyboardArrowDownIcon sx={{ fontSize: 18 }} />
                </button>

                {unlockable && (
                  <button
                    type="button"
                    className="bx-btn bx-btn-sm bx-btn-secondary"
                    aria-label={`Unlock ${name} block for editing`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnlock(block);
                    }}
                  >
                    <LockOpenIcon sx={{ fontSize: 16 }} /> Unlock
                  </button>
                )}

                <button
                  type="button"
                  className="bx-ghost"
                  aria-label={`Delete ${name} block`}
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: "delete", id: block.id });
                  }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                </button>
              </div>

              {selected && block.kind === "text" && (
                <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
                  <TextBlockEditor
                    block={block}
                    catalogue={catalogue}
                    onChange={(content) => dispatch({ type: "update", id: block.id, patch: { content } })}
                  />
                </div>
              )}
            </div>
            <AddBlockRow onAdd={(kind) => insertAfter(block.id, kind)} />
          </div>
        );
      })}
    </div>
  );
}

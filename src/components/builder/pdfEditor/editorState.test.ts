import { describe, expect, it } from "vitest";
import { editorReducer, initialEditorState, newBlock } from "./editorState";

const kinds = (state: { template: { blocks: { kind: string }[] } }) => state.template.blocks.map((b) => b.kind);

describe("initialEditorState", () => {
  it("starts from the built-in layout when the form has no template", () => {
    expect(initialEditorState(undefined).template.blocks).toHaveLength(9);
  });

  it("starts from the stored template when there is one", () => {
    const stored = { version: 1 as const, blocks: [newBlock("text")] };
    expect(initialEditorState(stored).template.blocks).toHaveLength(1);
  });

  it("does not share state with the stored template", () => {
    const stored = { version: 1 as const, blocks: [newBlock("text")] };
    initialEditorState(stored).template.blocks.pop();
    expect(stored.blocks).toHaveLength(1);
  });
});

describe("editorReducer", () => {
  it("moves a block to a new position", () => {
    const state = initialEditorState(undefined);
    const id = state.template.blocks[0].id;
    const moved = editorReducer(state, { type: "move", id, to: 2 });
    expect(moved.template.blocks[2].id).toBe(id);
    expect(moved.template.blocks).toHaveLength(9);
  });

  it("ignores a move to an out-of-range position", () => {
    const state = initialEditorState(undefined);
    const id = state.template.blocks[0].id;
    expect(editorReducer(state, { type: "move", id, to: 99 }).template.blocks[0].id).toBe(id);
  });

  it("inserts a block after the named one", () => {
    const state = initialEditorState(undefined);
    const after = state.template.blocks[0].id;
    const next = editorReducer(state, { type: "insert", block: newBlock("text"), after });
    expect(kinds(next)[1]).toBe("text");
  });

  it("inserts at the end when after is null", () => {
    const next = editorReducer(initialEditorState(undefined), { type: "insert", block: newBlock("divider"), after: null });
    expect(kinds(next).at(-1)).toBe("divider");
  });

  it("deletes a block", () => {
    const state = initialEditorState(undefined);
    const id = state.template.blocks[3].id;
    const next = editorReducer(state, { type: "delete", id });
    expect(next.template.blocks.map((b) => b.id)).not.toContain(id);
  });

  it("clears the selection when the selected block is deleted", () => {
    const state = initialEditorState(undefined);
    const id = state.template.blocks[0].id;
    const selected = editorReducer(state, { type: "select", id });
    expect(editorReducer(selected, { type: "delete", id }).selectedId).toBeNull();
  });

  it("patches a block's style without touching its neighbours", () => {
    const state = initialEditorState(undefined);
    const id = state.template.blocks[0].id;
    const next = editorReducer(state, { type: "update", id, patch: { style: { fontSize: 14 } } });
    expect(next.template.blocks[0].style).toEqual({ fontSize: 14 });
    expect(next.template.blocks[1].style).toBeUndefined();
  });

  it("replaces one block with several", () => {
    const state = initialEditorState(undefined);
    const id = state.template.blocks[0].id;
    const next = editorReducer(state, { type: "replace", id, blocks: [newBlock("text"), newBlock("divider")] });
    expect(next.template.blocks).toHaveLength(10);
    expect(kinds(next).slice(0, 2)).toEqual(["text", "divider"]);
  });

  it("undoes the last change", () => {
    const state = initialEditorState(undefined);
    const id = state.template.blocks[0].id;
    const deleted = editorReducer(state, { type: "delete", id });
    expect(editorReducer(deleted, { type: "undo" }).template.blocks).toHaveLength(9);
  });

  it("undo on a fresh state is a no-op", () => {
    const state = initialEditorState(undefined);
    expect(editorReducer(state, { type: "undo" }).template.blocks).toHaveLength(9);
  });

  it("does not record selection changes in history", () => {
    const state = initialEditorState(undefined);
    const selected = editorReducer(state, { type: "select", id: state.template.blocks[0].id });
    expect(selected.past).toHaveLength(0);
  });
});

describe("newBlock", () => {
  it("gives each new block a distinct id", () => {
    expect(newBlock("text").id).not.toBe(newBlock("text").id);
  });

  it("creates a text block with one empty paragraph ready to type into", () => {
    const block = newBlock("text");
    expect(block).toMatchObject({ kind: "text", content: [{ spans: [{ text: "" }] }] });
  });

  it("creates a table with a header row", () => {
    const block = newBlock("table") as { rows: unknown[][]; hasHeader: boolean };
    expect(block.hasHeader).toBe(true);
    expect(block.rows).toHaveLength(2);
  });
});

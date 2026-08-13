/**
 * A chain layer set to "whoever approved the previous step" fails silently
 * when either of its two inputs is guessed wrong: it routes to a real person
 * who simply is not the right one, gets approved, and nobody finds out. These
 * tests pin both inputs.
 */
import { describe, it, expect } from "vitest";
import {
  getPreviousWorkflowLayer,
  previousStepFor,
  resolutionContextFromItem,
  valueToText,
} from "./workflowChainContext";

const layers = (...numbers: number[]) => numbers.map((layerNumber) => ({ layerNumber }));

describe("getPreviousWorkflowLayer", () => {
  it("has no answer for the first layer", () => {
    expect(getPreviousWorkflowLayer(layers(1, 2, 3), 1)).toBeUndefined();
  });

  it("steps back one place in a plain workflow", () => {
    expect(getPreviousWorkflowLayer(layers(1, 2, 3), 2)).toEqual({ layerNumber: 1 });
  });

  it("skips the numbers a branch left out", () => {
    // A manual branch runs layers 1 and 3; layer 2 belongs to the other branch
    // and never ran, so "n - 1" would start the chain from an empty slot.
    expect(getPreviousWorkflowLayer(layers(1, 3), 3)).toEqual({ layerNumber: 1 });
  });

  it("orders by layer number, not by array order", () => {
    expect(getPreviousWorkflowLayer(layers(3, 1, 5), 5)).toEqual({ layerNumber: 3 });
  });

  it("falls back to the nearest earlier layer when this one is not in the list", () => {
    expect(getPreviousWorkflowLayer(layers(1, 3), 4)).toEqual({ layerNumber: 3 });
  });

  it("has no answer without a workflow", () => {
    expect(getPreviousWorkflowLayer([], 2)).toBeUndefined();
    expect(getPreviousWorkflowLayer(null, 2)).toBeUndefined();
    expect(getPreviousWorkflowLayer(undefined, 2)).toBeUndefined();
  });
});

describe("previousStepFor", () => {
  it("names the layer that ran and carries the actor through", () => {
    expect(previousStepFor(layers(1, 3), 3, "b@example.com"))
      .toEqual({ layerNumber: 1, actedBy: "b@example.com" });
  });

  it("says nothing for a first layer, leaving the caller's default in place", () => {
    expect(previousStepFor(layers(1, 2), 1, "b@example.com")).toBeUndefined();
  });
});

describe("resolutionContextFromItem", () => {
  const item = {
    SubmittedBy: "a@example.com",
    L1_Email: "primary@example.com",
    L1_ActedBy: "deputy@example.com",
    L2_Email: "never-ran@example.com",
  };

  it("reads the submitter", () => {
    expect(resolutionContextFromItem(item, 2).submitterEmail).toBe("a@example.com");
  });

  it("prefers who actually acted over who the layer was assigned to", () => {
    expect(resolutionContextFromItem(item, 2).previousActorEmail).toBe("deputy@example.com");
  });

  it("falls back to the assigned address when no actor was recorded", () => {
    // Public-token and paper layers close without naming anybody.
    const { L1_ActedBy: _ignored, ...noActor } = item;
    expect(resolutionContextFromItem(noActor, 2).previousActorEmail).toBe("primary@example.com");
  });

  it("uses the actor passed in over anything stored on the item", () => {
    // The approve path resolves the next layer before patching L1_ActedBy, and
    // from a copy of the item read before that — so the stored value is stale.
    const context = resolutionContextFromItem(item, 2, { layerNumber: 1, actedBy: "acting@example.com" });
    expect(context.previousActorEmail).toBe("acting@example.com");
  });

  it("ignores a blank passed-in actor rather than blanking the chain", () => {
    const context = resolutionContextFromItem(item, 2, { layerNumber: 1, actedBy: "   " });
    expect(context.previousActorEmail).toBe("deputy@example.com");
  });

  it("reads the named layer, not the one before by number", () => {
    // Advancing 1 → 3 across a branch. Without the hint this reads L2, which
    // never ran, and the chain starts from a layer nobody touched.
    expect(resolutionContextFromItem(item, 3).previousActorEmail).toBe("never-ran@example.com");
    expect(resolutionContextFromItem(item, 3, { layerNumber: 1 }).previousActorEmail)
      .toBe("deputy@example.com");
  });

  it("has no previous actor on the first layer", () => {
    expect(resolutionContextFromItem(item, 1).previousActorEmail).toBe("");
  });

  it("unwraps the shapes SharePoint returns a person in", () => {
    const wrapped = { SubmittedBy: { Email: "a@example.com" }, L1_ActedBy: { value: "b@example.com" } };
    const context = resolutionContextFromItem(wrapped, 2);
    expect(context.submitterEmail).toBe("a@example.com");
    expect(context.previousActorEmail).toBe("b@example.com");
  });
});

describe("valueToText", () => {
  it("reads plain values", () => {
    expect(valueToText(" a@example.com ")).toBe("a@example.com");
    expect(valueToText(42)).toBe("42");
    expect(valueToText(true)).toBe("true");
  });

  it("is empty for nothing usable", () => {
    expect(valueToText(null)).toBe("");
    expect(valueToText(undefined)).toBe("");
    expect(valueToText([])).toBe("");
    expect(valueToText({ unrelated: "x" })).toBe("");
  });
});

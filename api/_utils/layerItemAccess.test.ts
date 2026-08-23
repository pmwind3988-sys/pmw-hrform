import { describe, expect, it } from "vitest";

import { denyLayerItemAccess, isTerminalFormStatus, isTerminalLayerStatus } from "./layerItemAccess";

/**
 * A public approval link identifies a *layer*, not a submission — the item id
 * rides along in the query string. Nothing used to check that the two belonged
 * together, so anyone holding one link could walk the id and read every other
 * submission to the same form.
 */
describe("denyLayerItemAccess", () => {
  it("allows the submission the layer is currently waiting on", () => {
    expect(
      denyLayerItemAccess({ layerNumber: 2, currentLayer: 2, layerStatus: "Pending", formStatus: "Submitted" }),
    ).toBeNull();
  });

  it("refuses a submission parked at another layer", () => {
    expect(
      denyLayerItemAccess({ layerNumber: 2, currentLayer: 3, layerStatus: "Pending", formStatus: "Submitted" }),
    ).toBe("not-current-layer");
  });

  it("reads the current layer from a SharePoint text column", () => {
    expect(
      denyLayerItemAccess({ layerNumber: 2, currentLayer: "2", layerStatus: "Pending", formStatus: "Submitted" }),
    ).toBeNull();
    expect(
      denyLayerItemAccess({ layerNumber: 2, currentLayer: "7", layerStatus: "Pending", formStatus: "Submitted" }),
    ).toBe("not-current-layer");
  });

  it("refuses a layer that has already been actioned", () => {
    expect(
      denyLayerItemAccess({ layerNumber: 2, currentLayer: 2, layerStatus: "Approved", formStatus: "Submitted" }),
    ).toBe("already-completed");
  });

  it("refuses a submission whose form is closed", () => {
    expect(
      denyLayerItemAccess({ layerNumber: 2, currentLayer: 2, layerStatus: "Pending", formStatus: "Fully Approved" }),
    ).toBe("already-completed");
  });

  it("allows a legacy row that carries no current-layer marker", () => {
    // Mirrors the act path, which has always treated a missing/zero marker as
    // "no opinion" rather than a refusal. Tightening only the read would leave
    // a row that can be approved but not viewed.
    expect(
      denyLayerItemAccess({ layerNumber: 1, currentLayer: 0, layerStatus: "", formStatus: "Submitted" }),
    ).toBeNull();
    expect(
      denyLayerItemAccess({ layerNumber: 1, currentLayer: undefined, layerStatus: "", formStatus: "" }),
    ).toBeNull();
  });
});

describe("terminal status predicates", () => {
  it("treats the recorded layer outcomes as terminal, however they are spaced", () => {
    expect(isTerminalLayerStatus("Approved")).toBe(true);
    expect(isTerminalLayerStatus("  con-firmed ")).toBe(true);
    expect(isTerminalLayerStatus("Rejected at Layer 2")).toBe(true);
    expect(isTerminalLayerStatus("Pending")).toBe(false);
    expect(isTerminalLayerStatus("")).toBe(false);
  });

  it("treats the closed form states as terminal", () => {
    expect(isTerminalFormStatus("Fully Approved")).toBe(true);
    expect(isTerminalFormStatus("Cancelled")).toBe(true);
    expect(isTerminalFormStatus("Submitted")).toBe(false);
    expect(isTerminalFormStatus("")).toBe(false);
  });
});

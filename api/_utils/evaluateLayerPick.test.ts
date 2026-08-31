import { describe, expect, it } from "vitest";

import { pickLayerByNumber } from "../evaluate.js";

const approval = (layerNumber: number, extra: Record<string, unknown> = {}) =>
  ({ layerNumber, type: "approval", authMode: "365", ...extra });
const evaluation = (layerNumber: number, extra: Record<string, unknown> = {}) =>
  ({ layerNumber, type: "evaluation", authMode: "365", ...extra });

describe("pickLayerByNumber", () => {
  it("finds the layer by number on an unbranched form", () => {
    const picked = pickLayerByNumber({ layers: [approval(1), evaluation(2)] }, "", 2);
    expect(picked?.type).toBe("evaluation");
  });

  it("prefers the branch the submission was routed down", () => {
    const config = {
      layers: [approval(1)],
      manualBranches: [
        { name: "short", label: "Short", layers: [approval(1), approval(2)] },
        { name: "long", label: "Long", layers: [approval(1), evaluation(2, { title: "Long review" })] },
      ],
    };
    expect(pickLayerByNumber(config, "long", 2)?.title).toBe("Long review");
    expect(pickLayerByNumber(config, "short", 2)?.type).toBe("approval");
  });

  it("matches a branch by label as well as by name, and ignores casing", () => {
    const config = {
      layers: [],
      manualBranches: [{ name: "long", label: "Long Route", layers: [evaluation(2)] }],
    };
    expect(pickLayerByNumber(config, "  LONG ROUTE ", 2)?.type).toBe("evaluation");
    expect(pickLayerByNumber(config, "LONG", 2)?.type).toBe("evaluation");
  });

  it("falls back to the top-level layers when the branch is unknown", () => {
    const config = {
      layers: [approval(2, { title: "Default" })],
      manualBranches: [{ name: "other", label: "Other", layers: [evaluation(2)] }],
    };
    expect(pickLayerByNumber(config, "no-such-branch", 2)?.title).toBe("Default");
    expect(pickLayerByNumber(config, "", 2)?.title).toBe("Default");
  });

  it("has no answer without a usable config or layer number", () => {
    expect(pickLayerByNumber(null, "", 2)).toBeNull();
    expect(pickLayerByNumber({ layers: [approval(1)] }, "", 0)).toBeNull();
    expect(pickLayerByNumber({ layers: [approval(1)] }, "", 5)).toBeNull();
  });
});

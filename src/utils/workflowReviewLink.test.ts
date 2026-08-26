import { describe, it, expect } from "vitest";

import { parseLayerConfig, selectWorkflowLayer } from "./workflowReviewLink";
import { buildWorkflowReviewLink } from "./workflowLink";

const approval = (layerNumber: number, extra: Record<string, unknown> = {}) => ({
  layerNumber,
  type: "approval",
  authMode: "365",
  confirmationType: "checkbox",
  allowRejectionReason: true,
  ...extra,
});

const evaluation = (layerNumber: number, extra: Record<string, unknown> = {}) => ({
  layerNumber,
  type: "evaluation",
  authMode: "365",
  surveyElements: [],
  ...extra,
});

describe("parseLayerConfig", () => {
  it("reads the JSON string SharePoint stores", () => {
    const parsed = parseLayerConfig(JSON.stringify({ layers: [approval(1)] }));
    expect(parsed?.layers).toHaveLength(1);
  });

  it("returns null for anything that names no layers", () => {
    expect(parseLayerConfig("")).toBeNull();
    expect(parseLayerConfig("not json")).toBeNull();
    expect(parseLayerConfig(null)).toBeNull();
    expect(parseLayerConfig({ layers: [] })).toBeNull();
  });
});

describe("selectWorkflowLayer", () => {
  it("finds the layer by number", () => {
    const layer = selectWorkflowLayer({ layers: [approval(1), evaluation(2)] }, "", 2);
    expect(layer?.type).toBe("evaluation");
  });

  it("prefers the branch the submission was routed down", () => {
    const config = {
      layers: [approval(1)],
      manualBranches: [
        { name: "short", label: "Short", layers: [approval(1), approval(2)] },
        { name: "long", label: "Long", layers: [approval(1), evaluation(2, { title: "Long review" })] },
      ],
    };
    expect(selectWorkflowLayer(config, "long", 2)?.title).toBe("Long review");
    expect(selectWorkflowLayer(config, "short", 2)?.type).toBe("approval");
  });

  it("falls back to a branch layer when no branch has been recorded yet", () => {
    const config = {
      layers: [],
      manualBranches: [{ name: "only", label: "Only", layers: [evaluation(2)] }],
    };
    expect(selectWorkflowLayer(config, "", 2)?.type).toBe("evaluation");
  });

  it("agreeing branches still answer, because the link would be the same either way", () => {
    const config = {
      layers: [],
      manualBranches: [
        { name: "a", label: "A", layers: [evaluation(2)] },
        { name: "b", label: "B", layers: [evaluation(2, { title: "Other" })] },
      ],
    };
    expect(selectWorkflowLayer(config, "", 2)?.type).toBe("evaluation");
  });

  it("refuses to guess when the branches disagree about what the link should be", () => {
    const config = {
      layers: [],
      manualBranches: [
        { name: "a", label: "A", layers: [evaluation(2)] },
        { name: "b", label: "B", layers: [approval(2)] },
      ],
    };
    expect(selectWorkflowLayer(config, "", 2)).toBeUndefined();
  });

  it("refuses a public layer whose branches carry different tokens", () => {
    const config = {
      layers: [],
      manualBranches: [
        { name: "a", label: "A", layers: [evaluation(2, { authMode: "public", publicToken: "tok-a" })] },
        { name: "b", label: "B", layers: [evaluation(2, { authMode: "public", publicToken: "tok-b" })] },
      ],
    };
    expect(selectWorkflowLayer(config, "", 2)).toBeUndefined();
  });

  it("has no answer for a layer number the form does not define", () => {
    expect(selectWorkflowLayer({ layers: [approval(1)] }, "", 5)).toBeUndefined();
    expect(selectWorkflowLayer({ layers: [approval(1)] }, "", 0)).toBeUndefined();
  });
});

describe("the link a resolved layer produces", () => {
  it("sends an evaluation layer to /eval, never to the admin workspace", () => {
    const layer = selectWorkflowLayer({ layers: [approval(1), evaluation(2)] }, "", 2)!;
    const link = buildWorkflowReviewLink({
      baseUrl: "https://forms.example.com",
      layerType: layer.type,
      authMode: layer.authMode,
      publicToken: layer.publicToken,
      formSlug: "zz-test-run",
      responseItemId: 1,
      layerNumber: 2,
    });
    expect(link).toBe("https://forms.example.com/eval/zz-test-run/1/2");
    expect(link).not.toContain("/admin/");
  });

  it("binds a public evaluation layer's link to the one submission it was issued for", () => {
    const layer = selectWorkflowLayer(
      { layers: [evaluation(2, { authMode: "public", publicToken: "layer-token" })] },
      "",
      2,
    )!;
    const link = buildWorkflowReviewLink({
      baseUrl: "https://forms.example.com",
      layerType: layer.type,
      authMode: layer.authMode,
      publicToken: layer.publicToken,
      formSlug: "zz-test-run",
      responseItemId: 1,
      layerNumber: 2,
      linkToken: "item-binding",
    });
    expect(link).toBe("https://forms.example.com/eval/layer-token?item=1&k=item-binding");
  });
});

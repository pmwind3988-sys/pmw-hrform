import { describe, it, expect } from "vitest";

import {
  denySignedInLayerLink,
  LEGACY_EVAL_PREFIX_GRACE_UNTIL,
  parseLayerConfig,
  routePrefixAllowsLayerType,
  selectWorkflowLayer,
} from "./workflowReviewLink";
import { buildWorkflowReviewLink, withWorkflowRoutePrefix } from "./workflowLink";

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

describe("routePrefixAllowsLayerType", () => {
  const duringGrace = new Date(LEGACY_EVAL_PREFIX_GRACE_UNTIL.getTime() - 86_400_000);
  const afterGrace = new Date(LEGACY_EVAL_PREFIX_GRACE_UNTIL.getTime() + 86_400_000);

  it("lets each prefix open its own kind of layer", () => {
    expect(routePrefixAllowsLayerType("approval", "approval", duringGrace)).toBe(true);
    expect(routePrefixAllowsLayerType("eval", "evaluation", duringGrace)).toBe(true);
    expect(routePrefixAllowsLayerType("eval", "evaluation", afterGrace)).toBe(true);
  });

  it("never lets an approval link open an evaluation layer", () => {
    // The shape the reviewer reached by editing /approval/<slug>/2/1 to .../2/2.
    expect(routePrefixAllowsLayerType("approval", "evaluation", duringGrace)).toBe(false);
    expect(routePrefixAllowsLayerType("approval", "evaluation", afterGrace)).toBe(false);
  });

  it("keeps pre-split /eval approval links working until their window drains", () => {
    expect(routePrefixAllowsLayerType("eval", "approval", duringGrace)).toBe(true);
    expect(routePrefixAllowsLayerType("eval", "approval", afterGrace)).toBe(false);
  });

  it("defers to the other checks when the layer type is unknown", () => {
    expect(routePrefixAllowsLayerType("approval", undefined, afterGrace)).toBe(true);
    expect(routePrefixAllowsLayerType("eval", "", afterGrace)).toBe(true);
  });
});

describe("withWorkflowRoutePrefix", () => {
  it("moves a stored evaluation link onto /eval", () => {
    expect(withWorkflowRoutePrefix("https://forms.example.com/approval/slug/2/2", "evaluation"))
      .toBe("https://forms.example.com/eval/slug/2/2");
  });

  it("moves a pre-split approval link off /eval", () => {
    expect(withWorkflowRoutePrefix("https://forms.example.com/eval/slug/2/1", "approval"))
      .toBe("https://forms.example.com/approval/slug/2/1");
  });

  it("keeps the query a public link carries", () => {
    expect(withWorkflowRoutePrefix("https://forms.example.com/eval/tok?item=2&k=bind", "approval"))
      .toBe("https://forms.example.com/approval/tok?item=2&k=bind");
  });

  it("leaves a link it does not recognise exactly as stored", () => {
    const stored = "https://forms.example.com/admin/submissions?form=ZZ&item=1";
    expect(withWorkflowRoutePrefix(stored, "evaluation")).toBe(stored);
  });

  it("is idempotent, so re-sending a corrected link changes nothing", () => {
    const once = withWorkflowRoutePrefix("https://forms.example.com/eval/slug/2/1", "approval");
    expect(withWorkflowRoutePrefix(once, "approval")).toBe(once);
  });
});

describe("denySignedInLayerLink", () => {
  const base = {
    routePrefix: "eval" as const,
    layerType: "evaluation",
    layerAuthMode: "365",
    signedInEmail: "reviewer@example.com",
    layerEmails: "reviewer@example.com; deputy@example.com",
    layerEmail: "reviewer@example.com",
  };

  it("lets the assigned reviewer through", () => {
    expect(denySignedInLayerLink(base)).toBeNull();
  });

  it("lets any of a fan-out layer's reviewers through", () => {
    expect(denySignedInLayerLink({ ...base, signedInEmail: "deputy@example.com" })).toBeNull();
  });

  it("refuses an account the layer does not name", () => {
    // Editing the id onto a neighbouring submission lands here.
    expect(denySignedInLayerLink({ ...base, signedInEmail: "someone.else@example.com" }))
      .toBe("not-assigned");
  });

  it("refuses an approval link pointed at an evaluation step", () => {
    expect(denySignedInLayerLink({ ...base, routePrefix: "approval" })).toBe("wrong-shape");
  });

  it("refuses the sign-in shape for a public layer, even to its own reviewer", () => {
    expect(denySignedInLayerLink({ ...base, layerAuthMode: "public" })).toBe("public-shape");
  });

  it("settles the link shape before the assignee, so neither answer leaks the other", () => {
    expect(denySignedInLayerLink({
      ...base,
      layerAuthMode: "public",
      signedInEmail: "someone.else@example.com",
    })).toBe("public-shape");
  });

  it("refuses an unassigned account whatever the layer type", () => {
    expect(denySignedInLayerLink({
      ...base,
      routePrefix: "approval",
      layerType: "approval",
      signedInEmail: "someone.else@example.com",
    })).toBe("not-assigned");
  });
});

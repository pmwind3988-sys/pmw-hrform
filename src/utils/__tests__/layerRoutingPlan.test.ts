import { describe, it, expect } from "vitest";
import { planLayerRouting } from "../layerRoutingPlan";
import { redactLayerConfigForPublic } from "../../../api/_utils/publicLayerConfig";
import type { LayerConfig } from "../../types";

// The shape an HR admin actually saves: the layer IS assigned.
const SAVED_CONFIG = {
  version: "1.0",
  layers: [
    {
      layerNumber: 1,
      type: "evaluation",
      title: "Evaluator",
      assignee: { type: "fixed-user", value: "hod@pmw-group.com" },
      publicToken: "secret-token",
      notifyEmails: ["hr@pmw-group.com"],
    },
  ],
};

describe("planLayerRouting", () => {
  it("defers routing to the API for a public respondent, whose config has no assignee", () => {
    // What /api/form-config actually serves to a public browser.
    const publicConfig = JSON.parse(
      redactLayerConfigForPublic(JSON.stringify(SAVED_CONFIG)) as string,
    ) as LayerConfig;
    expect(publicConfig.layers?.[0]).not.toHaveProperty("assignee");

    const plan = planLayerRouting(publicConfig, { hasToken: false });

    expect(plan.deferToApi).toBe(true);
    expect(plan.hasManualBranches).toBe(false);
  });

  it("resolves layers in the browser for signed-in staff, who read the unredacted config", () => {
    const plan = planLayerRouting(SAVED_CONFIG as unknown as LayerConfig, { hasToken: true });

    expect(plan.deferToApi).toBe(false);
  });

  it("reports manual branches so a branch-only workflow starts unrouted", () => {
    const plan = planLayerRouting(
      { version: "1.0", layers: [], manualBranches: [{ layers: [] }] } as unknown as LayerConfig,
      { hasToken: true },
    );

    expect(plan.hasManualBranches).toBe(true);
  });

  it("treats a form with no workflow as nothing to route", () => {
    const plan = planLayerRouting(null, { hasToken: false });

    expect(plan.deferToApi).toBe(false);
    expect(plan.hasManualBranches).toBe(false);
  });
});

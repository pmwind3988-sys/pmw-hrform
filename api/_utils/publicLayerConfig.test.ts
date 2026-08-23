import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { redactLayerConfigForPublic } from "./publicLayerConfig";

/** Shaped like a real two-layer form with a manual branch hanging off it. */
function fullConfig() {
  return {
    layers: [
      {
        layerNumber: 1,
        type: "approval",
        authMode: "public",
        title: "Head of Department",
        description: "Confirm the request",
        confirmationType: "signature",
        surveyElements: [{ name: "remarks", type: "comment" }],
        publicToken: "1f2e3d4c-5b6a-7988-9a0b-1c2d3e4f5a6b",
        tokenExpiresAt: "2027-01-01T00:00:00.000Z",
        assignee: { type: "user", value: "hod@pmw-group.com" },
        notifyEmails: ["hr-team@pmw-group.com"],
        submitterRoutingRules: [
          { id: "r1", label: "Ipoh", emailValue: "ipoh.manager@pmw-group.com" },
        ],
      },
      {
        layerNumber: 2,
        type: "evaluation",
        authMode: "365",
        title: "HR Review",
        assignee: { type: "department-approver", role: "HOD" },
      },
    ],
    manualBranches: [
      {
        name: "paper",
        layers: [
          {
            layerNumber: 1,
            type: "approval",
            authMode: "public",
            publicToken: "aaaabbbb-cccc-dddd-eeee-ffff00001111",
            assignee: { type: "user", value: "records@pmw-group.com" },
          },
        ],
      },
    ],
  };
}

function parse(raw: string | undefined) {
  return JSON.parse(String(raw)) as ReturnType<typeof fullConfig>;
}

describe("redactLayerConfigForPublic", () => {
  it("strips the public token that opens the approval link", () => {
    const layer = parse(redactLayerConfigForPublic(fullConfig())).layers[0] as Record<string, unknown>;
    expect(layer.publicToken).toBeUndefined();
    expect(layer.tokenExpiresAt).toBeUndefined();
  });

  it("strips the approver and notification addresses", () => {
    const layer = parse(redactLayerConfigForPublic(fullConfig())).layers[0] as Record<string, unknown>;
    expect(layer.assignee).toBeUndefined();
    expect(layer.notifyEmails).toBeUndefined();
    expect(layer.submitterRoutingRules).toBeUndefined();
  });

  it("strips the layers nested inside a manual branch too", () => {
    const branchLayer = parse(redactLayerConfigForPublic(fullConfig())).manualBranches[0].layers[0] as Record<string, unknown>;
    expect(branchLayer.publicToken).toBeUndefined();
    expect(branchLayer.assignee).toBeUndefined();
    expect(branchLayer.layerNumber).toBe(1);
  });

  it("keeps what the form page renders", () => {
    const layer = parse(redactLayerConfigForPublic(fullConfig())).layers[0] as Record<string, unknown>;
    expect(layer.layerNumber).toBe(1);
    expect(layer.type).toBe("approval");
    expect(layer.title).toBe("Head of Department");
    expect(layer.confirmationType).toBe("signature");
    expect(layer.surveyElements).toEqual([{ name: "remarks", type: "comment" }]);
  });

  it("leaves no address anywhere in what it hands out", () => {
    // The blunt check: a field added later that happens to carry a mailbox
    // fails here rather than shipping to every visitor.
    expect(String(redactLayerConfigForPublic(fullConfig()))).not.toContain("@");
  });

  it("accepts the stored JSON string as readily as the parsed object", () => {
    const fromString = redactLayerConfigForPublic(JSON.stringify(fullConfig()));
    expect(parse(fromString).layers[0]).not.toHaveProperty("publicToken");
  });

  it("answers nothing for a config it cannot read", () => {
    expect(redactLayerConfigForPublic(undefined)).toBeUndefined();
    expect(redactLayerConfigForPublic("")).toBeUndefined();
    expect(redactLayerConfigForPublic("{not json")).toBeUndefined();
  });
});

/**
 * The whole repair is one line in the endpoint. A revert there would not fail
 * any behavioural test — it would just quietly start serving the approval
 * tokens again — so the wiring is guarded here as well as the function.
 */
describe("form-config wiring", () => {
  it("serves the layer config through the redactor", () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "..", "form-config.ts"),
      "utf8",
    );

    expect(source).toContain("redactLayerConfigForPublic(");
    // The shape it used to have: the stored config, stringified and served whole.
    expect(source).not.toMatch(/LayerConfig:s*versionLayerConfig ?/);
  });
});

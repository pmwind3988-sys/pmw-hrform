import { describe, it, expect } from "vitest";
import { validateLayerConfig } from "./layerValidation";
import type { LayerConfig, LayerConfigItem } from "../../types";

function approvalLayer(overrides: Partial<LayerConfigItem> = {}): LayerConfigItem {
  return {
    layerNumber: 1,
    type: "approval",
    authMode: "365",
    assignee: { type: "user", value: "a@x.com" },
    confirmationType: "signature",
    allowRejectionReason: true,
    ...overrides,
  } as LayerConfigItem;
}

function config(layer: LayerConfigItem): LayerConfig {
  return { version: "1.0", layers: [layer] };
}

describe("validateLayerConfig — several assignees", () => {
  it("accepts a list of valid addresses", () => {
    const result = validateLayerConfig(
      config(approvalLayer({ assignee: { type: "users", value: "a@x.com; b@x.com" } })),
      [],
    );
    expect(result.errors).toEqual([]);
  });

  it("names the addresses that are not valid emails", () => {
    const result = validateLayerConfig(
      config(approvalLayer({ assignee: { type: "users", value: "a@x.com; nope" } })),
      [],
    );
    expect(result.errors.join(" ")).toContain("nope");
  });

  it("rejects an empty list on a 365 layer", () => {
    const result = validateLayerConfig(
      config(approvalLayer({ assignee: { type: "users", value: "   " } })),
      [],
    );
    expect(result.errors).toHaveLength(1);
  });
});

describe("validateLayerConfig — distribution list", () => {
  it("accepts a valid group address and warns about the Graph permission", () => {
    const result = validateLayerConfig(
      config(approvalLayer({ assignee: { type: "distribution-list", value: "team@x.com" } })),
      [],
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings.join(" ")).toContain("Group.Read.All");
  });

  it("rejects a malformed group address", () => {
    const result = validateLayerConfig(
      config(approvalLayer({ assignee: { type: "distribution-list", value: "team" } })),
      [],
    );
    expect(result.errors).toHaveLength(1);
  });
});

describe("validateLayerConfig — notification recipients", () => {
  it("accepts a shared mailbox alongside the assignee", () => {
    const result = validateLayerConfig(
      config(approvalLayer({ notifyEmails: ["shared@x.com"] })),
      [],
    );
    expect(result.errors).toEqual([]);
  });

  it("rejects a malformed notification address", () => {
    const result = validateLayerConfig(
      config(approvalLayer({ notifyEmails: ["shared"] })),
      [],
    );
    expect(result.errors.join(" ")).toContain("shared");
  });

  it("rejects notify-only delivery with nowhere to deliver", () => {
    const result = validateLayerConfig(
      config(approvalLayer({ notifyRecipientMode: "notify-only" })),
      [],
    );
    expect(result.errors.join(" ")).toContain("notify-only");
  });

  it("warns that a notify-only assignee is never emailed directly", () => {
    const result = validateLayerConfig(
      config(approvalLayer({ notifyEmails: ["shared@x.com"], notifyRecipientMode: "notify-only" })),
      [],
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings.join(" ")).toContain("shared@x.com");
  });
});

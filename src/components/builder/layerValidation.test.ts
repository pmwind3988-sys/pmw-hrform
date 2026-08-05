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

describe("validateLayerConfig — public link layers", () => {
  const publicLayer = (publicAccess?: Record<string, unknown>) =>
    config(approvalLayer({ authMode: "public", publicAccess } as Partial<LayerConfigItem>));

  it("accepts a public layer left on the defaults", () => {
    expect(validateLayerConfig(publicLayer(), []).errors).toEqual([]);
  });

  // The link is emailed, never displayed, so a layer with nobody to address it
  // to produces a submission that silently stalls.
  it("rejects a public layer with nobody to send the link to", () => {
    const result = validateLayerConfig(
      config(approvalLayer({ authMode: "public", assignee: { type: "user", value: "" } })),
      [],
    );
    expect(result.errors.join(" ")).toContain("someone to send the link to");
  });

  it("rejects a link validity outside the supported range", () => {
    expect(validateLayerConfig(publicLayer({ linkTtlHours: 0 }), []).errors).toHaveLength(1);
    expect(validateLayerConfig(publicLayer({ linkTtlHours: 99_999 }), []).errors).toHaveLength(1);
  });

  it("warns about a link that stays valid for months", () => {
    const result = validateLayerConfig(publicLayer({ linkTtlHours: 2160 }), []);
    expect(result.errors).toEqual([]);
    expect(result.warnings.join(" ")).toContain("long-lived credential");
  });

  it("rejects requiring a declaration with nothing to declare", () => {
    const result = validateLayerConfig(
      publicLayer({ requireIdentity: true, identityFields: [{ key: "fullName", label: "Name", type: "text", required: true, enabled: false }] }),
      [],
    );
    expect(result.errors.join(" ")).toContain("at least one detail");
  });

  it("warns that skipping the declaration leaves the decision unattributed", () => {
    const result = validateLayerConfig(publicLayer({ requireIdentity: false }), []);
    expect(result.warnings.join(" ")).toContain("SYSTEM");
  });

  it("rejects a malformed allowed domain", () => {
    const result = validateLayerConfig(publicLayer({ allowedEmailDomains: ["company"] }), []);
    expect(result.errors.join(" ")).toContain("company");
  });

  it("rejects assignee-matching when no email is collected", () => {
    const result = validateLayerConfig(
      publicLayer({
        requireAssigneeEmailMatch: true,
        identityFields: [{ key: "fullName", label: "Name", type: "text", required: true, enabled: true }],
      }),
      [],
    );
    expect(result.errors.join(" ")).toContain("email detail turned on");
  });

  it("warns that assignee-matching varies when the assignee is resolved per submission", () => {
    const result = validateLayerConfig(
      config(approvalLayer({
        authMode: "public",
        assignee: { type: "field-reference", value: "managerEmail" },
        publicAccess: { requireAssigneeEmailMatch: true },
      } as Partial<LayerConfigItem>)),
      [{ name: "managerEmail", type: "text", inputType: "email" }],
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings.join(" ")).toContain("varies by submission");
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

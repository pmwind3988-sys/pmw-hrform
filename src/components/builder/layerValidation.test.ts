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

describe("validateLayerConfig — reporting line", () => {
  it("publishes a line starting at the submitter, which names nobody", () => {
    // The whole point of the mode: no address is configured here, so the
    // generic "assign somebody" check must not fire.
    const result = validateLayerConfig(
      config(approvalLayer({ assignee: { type: "chain", startFrom: "submitter", value: "", hops: 1 } })),
      [],
    );
    expect(result.errors).toEqual([]);
  });

  it("warns that unlisted people park rather than fail", () => {
    const result = validateLayerConfig(
      config(approvalLayer({ assignee: { type: "chain", startFrom: "submitter", value: "", hops: 1 } })),
      [],
    );
    expect(result.warnings.join(" ")).toContain("Approval Directory");
  });

  it("refuses a previous-approver line on the first step, where there is none", () => {
    const result = validateLayerConfig(
      config(approvalLayer({ assignee: { type: "chain", startFrom: "previous-actor", value: "", hops: 1 } })),
      [],
    );
    expect(result.errors.join(" ")).toContain("no previous approver");
  });

  it("allows a previous-approver line on a later step", () => {
    const result = validateLayerConfig(
      {
        version: "1.0",
        layers: [
          approvalLayer(),
          approvalLayer({
            layerNumber: 2,
            assignee: { type: "chain", startFrom: "previous-actor", value: "", hops: 1 },
          }),
        ],
      },
      [],
    );
    expect(result.errors).toEqual([]);
  });

  it("requires a real field when the line starts from one", () => {
    const missing = validateLayerConfig(
      config(approvalLayer({ assignee: { type: "chain", startFrom: "field", value: "ghost", hops: 1 } })),
      [],
    );
    expect(missing.errors.join(" ")).toContain("does not exist");

    const blank = validateLayerConfig(
      config(approvalLayer({ assignee: { type: "chain", startFrom: "field", value: "", hops: 1 } })),
      [],
    );
    expect(blank.errors.join(" ")).toContain("choose the field");
  });

  it("rejects a line that goes up no steps", () => {
    const result = validateLayerConfig(
      config(approvalLayer({ assignee: { type: "chain", startFrom: "submitter", value: "", hops: 0 } })),
      [],
    );
    expect(result.errors.join(" ")).toContain("at least one step");
  });
});

describe("validateLayerConfig — head of department", () => {
  it("publishes a fixed department with a role", () => {
    const result = validateLayerConfig(
      config(approvalLayer({ assignee: { type: "role-holder", department: "fixed", value: "Safety", role: "HOD" } })),
      [],
    );
    expect(result.errors).toEqual([]);
  });

  it("requires the department name when it is fixed", () => {
    const result = validateLayerConfig(
      config(approvalLayer({ assignee: { type: "role-holder", department: "fixed", value: "", role: "HOD" } })),
      [],
    );
    expect(result.errors.join(" ")).toContain("name the department");
  });

  it("requires a role to look for", () => {
    const result = validateLayerConfig(
      config(approvalLayer({ assignee: { type: "role-holder", department: "fixed", value: "Safety", role: "" } })),
      [],
    );
    expect(result.errors.join(" ")).toContain("name the role");
  });

  it("needs no department name when read from the submitter", () => {
    const result = validateLayerConfig(
      config(approvalLayer({ assignee: { type: "role-holder", department: "from-submitter", value: "", role: "HOD" } })),
      [],
    );
    expect(result.errors).toEqual([]);
  });
});

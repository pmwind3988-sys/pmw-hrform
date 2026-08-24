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

describe("validateLayerConfig — public link expiry from a form answer", () => {
  const FORM_FIELDS = [
    { name: "requesterName", title: "Requester", type: "text" },
    { name: "permitEnd", title: "Permit End Date", type: "date" },
  ];

  function publicLayer(layerNumber: number, overrides: Partial<LayerConfigItem> = {}): LayerConfigItem {
    return approvalLayer({
      layerNumber,
      authMode: "public",
      publicToken: `token-${layerNumber}`,
      tokenExpiresAt: "2099-09-01T00:00:00Z",
      ...overrides,
    });
  }

  function evaluationLayer(layerNumber: number, surveyElements: Record<string, unknown>[]): LayerConfigItem {
    return {
      layerNumber,
      type: "evaluation",
      authMode: "365",
      assignee: { type: "user", value: "e@x.com" },
      title: "Site inspection",
      surveyElements,
    } as LayerConfigItem;
  }

  function sequence(layers: LayerConfigItem[]): LayerConfig {
    return { version: "1.0", layers };
  }

  it("accepts a date question on the submitted form", () => {
    const result = validateLayerConfig(
      sequence([publicLayer(1, { tokenExpiry: { mode: "field", field: "permitEnd", offsetDays: 3 } })]),
      FORM_FIELDS,
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("accepts a date question from an earlier layer's own form", () => {
    const result = validateLayerConfig(
      sequence([
        evaluationLayer(1, [{ name: "eval_date_1", title: "Inspected On", type: "date" }]),
        publicLayer(2, { tokenExpiry: { mode: "field", sourceLayer: 1, field: "eval_date_1" } }),
      ]),
      FORM_FIELDS,
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("refuses a question the named layer does not ask", () => {
    const result = validateLayerConfig(
      sequence([
        evaluationLayer(1, [{ name: "eval_date_1", type: "date" }]),
        publicLayer(2, { tokenExpiry: { mode: "field", sourceLayer: 1, field: "permitEnd" } }),
      ]),
      FORM_FIELDS,
    );
    expect(result.errors).toEqual([
      'Main sequence layer 2: public link expiry field "permitEnd" does not exist in layer 1\'s form.',
    ]);
  });

  it("refuses a date read from this layer or a later one", () => {
    const result = validateLayerConfig(
      sequence([
        publicLayer(1, { tokenExpiry: { mode: "field", sourceLayer: 2, field: "eval_date_2" } }),
        evaluationLayer(2, [{ name: "eval_date_2", type: "date" }]),
      ]),
      FORM_FIELDS,
    );
    expect(result.errors).toEqual([
      "Main sequence layer 1: public link expiry reads from layer 2, which is not an earlier layer that collects answers.",
    ]);
  });

  it("keeps the old wording when the submitted form lacks the question", () => {
    const result = validateLayerConfig(
      sequence([publicLayer(1, { tokenExpiry: { mode: "field", field: "nosuch" } })]),
      FORM_FIELDS,
    );
    expect(result.errors).toEqual([
      'Main sequence layer 1: public link expiry field "nosuch" does not exist in the form.',
    ]);
  });

  it("still refuses field mode with no question chosen", () => {
    const result = validateLayerConfig(
      sequence([publicLayer(1, { tokenExpiry: { mode: "field" } })]),
      FORM_FIELDS,
    );
    expect(result.errors).toEqual([
      "Main sequence layer 1: public link expiry reads a form field, but no field is chosen.",
    ]);
  });

  it("warns about an earlier layer's question that is not a date", () => {
    const result = validateLayerConfig(
      sequence([
        evaluationLayer(1, [{ name: "eval_notes", title: "Notes", type: "comment" }]),
        publicLayer(2, { tokenExpiry: { mode: "field", sourceLayer: 1, field: "eval_notes" } }),
      ]),
      FORM_FIELDS,
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings.join(" ")).toContain("is not a date question");
  });

  it("refuses grace that is not a whole number of days", () => {
    const result = validateLayerConfig(
      sequence([publicLayer(1, { tokenExpiry: { mode: "field", field: "permitEnd", offsetDays: -2 } })]),
      FORM_FIELDS,
    );
    expect(result.errors).toEqual([
      "Main sequence layer 1: public link expiry grace must be a whole number of days, or zero.",
    ]);
  });

  it("resolves a branch layer against its own branch, not the main sequence", () => {
    const result = validateLayerConfig(
      {
        version: "1.0",
        layers: [evaluationLayer(1, [{ name: "main_date", type: "date" }])],
        manualBranches: [
          {
            name: "urgent",
            label: "Urgent",
            layers: [
              evaluationLayer(1, [{ name: "branch_date", type: "date" }]),
              publicLayer(2, { tokenExpiry: { mode: "field", sourceLayer: 1, field: "main_date" } }),
            ],
          },
        ],
      },
      FORM_FIELDS,
    );
    expect(result.errors).toEqual([
      'Urgent layer 2: public link expiry field "main_date" does not exist in layer 1\'s form.',
    ]);
  });

  it("leaves a plain fixed-date public layer alone", () => {
    expect(validateLayerConfig(sequence([publicLayer(1)]), FORM_FIELDS).errors).toEqual([]);
    expect(validateLayerConfig(sequence([publicLayer(1, { tokenExpiresAt: "" })]), FORM_FIELDS).errors).toEqual([
      "Main sequence layer 1: public layers need an expiry date.",
    ]);
  });
});

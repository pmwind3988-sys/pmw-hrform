import { describe, expect, it } from "vitest";

import { TYPED_ADDRESS_REASON, typedAddressAssignment } from "../typedAddressAssignment";
import { getWorkflowAssignment, readRoutingChecks } from "../workflowAssignmentData";

const CHECKS = {
  version: 1,
  layers: {},
  checks: [{ at: "2026-11-14T00:00:00.000Z", layer: 2, trigger: "daily-run", outcome: "match", saved: ["hod@pmw.com"], routed: ["hod@pmw.com"] }],
};

const row = (extra: Record<string, unknown> = {}) => ({
  L2_Email: "hod@pmw.com",
  WorkflowAssignmentData: JSON.stringify(CHECKS),
  ...extra,
});

const input = { layer: 2, updatedBy: "admin@pmw.com", updatedAt: "2026-11-16T03:00:00.000Z", submittedAt: "2026-08-12T02:14:00.000Z" };

describe("typedAddressAssignment", () => {
  it("marks the step set by hand when the admin types a different address, keeping the check log", () => {
    const written = typedAddressAssignment(row(), { ...input, email: "Other@pmw.com" });
    expect(written).not.toBeNull();
    expect(getWorkflowAssignment(written, 2)).toMatchObject({
      email: "Other@pmw.com",
      source: "manual-override",
      reason: TYPED_ADDRESS_REASON,
      updatedBy: "admin@pmw.com",
      updatedAt: input.updatedAt,
      history: [{ email: "hod@pmw.com", source: "resolved", updatedBy: "SYSTEM", updatedAt: input.submittedAt }],
    });
    expect(readRoutingChecks(written)).toEqual(CHECKS.checks);
  });

  it("writes nothing when the typed address is the one already saved, in any case", () => {
    expect(typedAddressAssignment(row(), { ...input, email: " HOD@pmw.com " })).toBeNull();
  });

  it("writes nothing when no address was typed", () => {
    expect(typedAddressAssignment(row(), { ...input, email: "" })).toBeNull();
  });

  it("marks a step that had nobody saved", () => {
    const written = typedAddressAssignment(row({ L2_Email: "" }), { ...input, email: "other@pmw.com" });
    expect(getWorkflowAssignment(written, 2)).toMatchObject({ email: "other@pmw.com", source: "manual-override" });
  });
});

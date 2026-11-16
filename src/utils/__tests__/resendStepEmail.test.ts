import { beforeEach, describe, expect, it, vi } from "vitest";

const sp = vi.hoisted(() => ({
  spGet: vi.fn(),
  spPatch: vi.fn(),
  ensureWorkflowColumns: vi.fn(),
  getFormConfigByTitle: vi.fn(),
  triggerApprovalNotification: vi.fn(),
}));
vi.mock("../formBuilderSP", () => sp);

import { resendStepEmail } from "../resendStepEmail";
import type { LayerConfig } from "../../types";

const CONFIG = {
  version: "1.0",
  layers: [
    { layerNumber: 1, type: "evaluation", title: "Evaluator", authMode: "signed-in", assignee: { type: "user", value: "hod@pmw-group.com" } },
  ],
} as unknown as LayerConfig;

const PARAMS = { listTitle: "Training Evaluation Form", itemId: 56, layer: 1, submittedBy: "t56@pmw-group.com", layerConfig: CONFIG };

function row(extra: Record<string, unknown> = {}) {
  return {
    CurrentLayer: 1,
    FormStatus: "In Review",
    L1_Status: "Pending",
    L1_Email: "hod@pmw-group.com",
    L1_Emails: "hod@pmw-group.com; pa@pmw-group.com",
    WorkflowEmailLog: "{}",
    ...extra,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("window", { location: { origin: "https://pmw-hrform.vercel.app" } });
  sp.getFormConfigByTitle.mockResolvedValue({ Slug: "training-evaluation-form" });
  sp.triggerApprovalNotification.mockResolvedValue({});
});

describe("resendStepEmail", () => {
  it("sends the same step again to the same people, with the signed-in link", async () => {
    sp.spGet.mockResolvedValueOnce(row()).mockResolvedValueOnce({ WorkflowEmailLog: "{\"1\":{\"status\":\"sent\"}}" });
    const result = await resendStepEmail("token", PARAMS);
    const sent = sp.triggerApprovalNotification.mock.calls[0][1];
    expect(sent).toMatchObject({
      formTitle: "Training Evaluation Form",
      responseItemId: 56,
      layer: 1,
      nextApproverEmail: "hod@pmw-group.com",
      nextRecipients: ["hod@pmw-group.com", "pa@pmw-group.com"],
      nextLayerType: "evaluation",
      throwOnEmailError: true,
    });
    expect(sent.reviewLink).toMatch(/\/eval\/training-evaluation-form\/56\/1$/);
    expect(result.recipients).toEqual(["hod@pmw-group.com", "pa@pmw-group.com"]);
    expect(result.workflowEmailLog).toContain("sent");
  });

  it("sends nothing once the reviewer has acted or the submission moved on", async () => {
    for (const extra of [{ L1_Status: "Confirmed" }, { FormStatus: "Completed" }, { CurrentLayer: 2 }]) {
      sp.spGet.mockResolvedValueOnce(row(extra));
      await expect(resendStepEmail("token", PARAMS)).rejects.toThrow(/already been acted on|moved on/);
    }
    expect(sp.spPatch).not.toHaveBeenCalled();
    expect(sp.triggerApprovalNotification).not.toHaveBeenCalled();
  });

  it("points parked steps and steps with nobody named to All submissions", async () => {
    sp.spGet.mockResolvedValueOnce(row({ L1_Status: "Needs Routing" }));
    await expect(resendStepEmail("token", PARAMS)).rejects.toThrow(/All submissions/);
    sp.spGet.mockResolvedValueOnce(row({ L1_Email: "" }));
    await expect(resendStepEmail("token", PARAMS)).rejects.toThrow(/nobody named/);
    expect(sp.triggerApprovalNotification).not.toHaveBeenCalled();
  });

  it("reports a routing-check hold as a failure, not a send", async () => {
    sp.spGet.mockResolvedValueOnce(row());
    sp.triggerApprovalNotification.mockResolvedValueOnce({ held: { reason: "Routing has no answer", checkFailed: false } });
    await expect(resendStepEmail("token", PARAMS)).rejects.toThrow();
  });
});

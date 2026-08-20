/**
 * Delivery-ordering tests for `scheduleOrDeliverWorkflowEmail`.
 *
 * Separate from `workflowEmail.test.ts` because these need the Graph list
 * helpers mocked, and that mock would otherwise apply to the pure
 * subject/schedule tests in that file too.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

vi.mock("./graphClient.js", () => ({
  ensureListColumns: vi.fn(async () => { calls.push("ensureListColumns"); return { created: [], existing: [] }; }),
  queryListItemById: vi.fn(async () => { calls.push("queryListItemById"); return { id: "7", fields: {} }; }),
  updateListItemFields: vi.fn(async () => { calls.push("updateListItemFields"); return {}; }),
}));

const { scheduleOrDeliverWorkflowEmail, WorkflowEmailRecordError } = await import("./workflowEmail.js");

const MESSAGE = { to: ["a@example.com", "b@example.com"], subject: "s", body: "b" };
const CONTEXT = { listTitle: "Incident Report", responseItemId: "7", layer: 1 };
const DETAILS = {
  layer: 1,
  layerType: "approval" as const,
  totalLayers: 2,
  reviewLink: "https://example.com/1",
  submittedBy: "submitter@example.com",
};

function stubSendMail(ok: boolean) {
  vi.stubGlobal("fetch", vi.fn(async () => {
    calls.push("sendMail");
    return ok
      ? { ok: true, status: 202, json: async () => ({}) }
      : { ok: false, status: 503, json: async () => ({}) };
  }));
}

beforeEach(() => {
  calls.length = 0;
  process.env.HR_FORM_EMAIL_FROM_ADDRESS = "noreply@example.com";
  vi.unstubAllGlobals();
});

describe("an immediate notification", () => {
  it("sends the mail before touching the response list", async () => {
    stubSendMail(true);
    await scheduleOrDeliverWorkflowEmail("tok", MESSAGE, CONTEXT, { mode: "immediate" }, DETAILS);
    expect(calls[0]).toBe("sendMail");
  });

  it("does not write a schedule row it would immediately overwrite", async () => {
    stubSendMail(true);
    await scheduleOrDeliverWorkflowEmail("tok", MESSAGE, CONTEXT, undefined, DETAILS);
    // One bookkeeping write for the delivery log; the old code wrote the
    // schedule row first and then wrote again to mark it sent.
    expect(calls.filter((call) => call === "updateListItemFields")).toHaveLength(1);
  });

  it("leaves a retryable row behind when the send itself fails", async () => {
    stubSendMail(false);
    await expect(
      scheduleOrDeliverWorkflowEmail("tok", MESSAGE, CONTEXT, { mode: "immediate" }, DETAILS),
    ).rejects.toThrow();
    // The delivery-log write, then the schedule row the cron will retry from.
    expect(calls.filter((call) => call === "updateListItemFields").length).toBeGreaterThanOrEqual(2);
  });

  it("does not queue a retry when the mail went out and only the bookkeeping failed", async () => {
    stubSendMail(true);
    const { updateListItemFields } = await import("./graphClient.js");
    vi.mocked(updateListItemFields).mockRejectedValueOnce(new Error("list write refused"));
    await expect(
      scheduleOrDeliverWorkflowEmail("tok", MESSAGE, CONTEXT, { mode: "immediate" }, DETAILS),
    ).rejects.toThrow(WorkflowEmailRecordError);
  });
});

describe("a deferred notification", () => {
  it("writes the row and sends nothing yet", async () => {
    stubSendMail(true);
    const entry = await scheduleOrDeliverWorkflowEmail(
      "tok", MESSAGE, CONTEXT, { mode: "three_months" }, DETAILS,
    );
    expect(calls).not.toContain("sendMail");
    expect(entry.status).toBe("scheduled");
  });

  it("records the whole fan-out list so the cron can address it later", async () => {
    stubSendMail(true);
    const entry = await scheduleOrDeliverWorkflowEmail(
      "tok", MESSAGE, CONTEXT, { mode: "custom_days", customDays: 7 }, DETAILS,
    );
    expect(entry.recipient).toBe("a@example.com, b@example.com");
  });
});

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

const { scheduleOrDeliverWorkflowEmail, deliverWorkflowEmail, WorkflowEmailRecordError } = await import("./workflowEmail.js");

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

describe("test-run delivery", () => {
  function stubSendMailCapture() {
    const sent: { to: string; subject: string; body: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      calls.push("sendMail");
      const payload = JSON.parse(String(init.body));
      sent.push({
        to: payload.message.toRecipients.map((r: { emailAddress: { address: string } }) => r.emailAddress.address).join(", "),
        subject: payload.message.subject,
        body: payload.message.body.content,
      });
      return { ok: true, status: 202, json: async () => ({}) };
    }));
    return sent;
  }

  it("sends a test run's layer email to the test address, not the assignee", async () => {
    const sent = stubSendMailCapture();
    await deliverWorkflowEmail(
      "token",
      { to: "hod-finance@pmw-group.com", subject: "Approval needed", body: "<p>x</p>" },
      { listTitle: "Leave Application", responseItemId: "42", layer: 2, testRun: { testEmail: "tester@pmw-group.com" } },
    );
    expect(sent[0].to).toBe("tester@pmw-group.com");
    expect(sent[0].subject).toContain("[TEST]");
    expect(sent[0].body).toContain("hod-finance@pmw-group.com");
  });

  it("records the delivery against the test address that actually received it", async () => {
    stubSendMailCapture();
    const { updateListItemFields } = await import("./graphClient.js");
    vi.mocked(updateListItemFields).mockClear();
    await deliverWorkflowEmail(
      "token",
      { to: "hod-finance@pmw-group.com", subject: "s", body: "b" },
      { listTitle: "Leave Application", responseItemId: "42", layer: 2, testRun: { testEmail: "tester@pmw-group.com" } },
    );
    const fields = vi.mocked(updateListItemFields).mock.calls[0][3] as Record<string, unknown>;
    const log = JSON.parse(String(fields.WorkflowEmailLog));
    expect(log["2"].recipient).toBe("tester@pmw-group.com");
  });

  it("leaves a production delivery exactly as it was", async () => {
    const sent = stubSendMailCapture();
    await deliverWorkflowEmail(
      "token",
      { to: "hod-finance@pmw-group.com", subject: "Approval needed", body: "<p>x</p>" },
      { listTitle: "Leave Application", responseItemId: "42", layer: 2 },
    );
    expect(sent[0].to).toBe("hod-finance@pmw-group.com");
    expect(sent[0].subject).toBe("Approval needed");
    expect(sent[0].body).toBe("<p>x</p>");
  });
});

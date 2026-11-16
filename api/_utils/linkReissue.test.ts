import { beforeEach, describe, expect, it, vi } from "vitest";

import { planLinkReissue, reissueReviewLink } from "./linkReissue.js";
import { LINK_REISSUE_LOG_FIELD, recordReissue } from "./linkToken.js";

vi.mock("./graphClient.js", () => ({
  updateListItemFields: vi.fn(async () => ({})),
}));
vi.mock("./provisioning.js", () => ({
  ensureWorkflowColumns: vi.fn(async () => {}),
}));

const gate = vi.hoisted(() => ({ decideBeforeSend: vi.fn() }));
vi.mock("./preSendGate.js", () => ({ decideBeforeSend: gate.decideBeforeSend }));
vi.mock("./preSendRoutingCheck.js", () => ({ createPreSendCheckCache: () => ({}) }));

/**
 * A link issued before review links were bound to their submission carries no
 * `k` and cannot be given one. Clicking one mails a fresh link to the address
 * the layer was sent to — never to whoever clicked, and never revealing whether
 * the id they arrived with was real.
 */
const NOW = new Date("2026-09-01T12:00:00Z");

const activated = {
  L2_NotifyEmails: "reviewer@contractor.example; safety@contractor.example",
  L2_Email: "reviewer@contractor.example",
};

describe("planLinkReissue", () => {
  it("mails the address the layer was actually sent to", () => {
    const plan = planLinkReissue(activated, 2, NOW);
    expect(plan?.recipients).toEqual([
      "reviewer@contractor.example",
      "safety@contractor.example",
    ]);
  });

  it("mints a binding for a submission that predates them", () => {
    const plan = planLinkReissue(activated, 2, NOW);
    expect(plan?.linkToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(plan?.updates.L2_LinkToken).toBe(plan?.linkToken);
  });

  it("keeps a binding the submission already has", () => {
    // Rotating it would kill the link a reviewer is already holding.
    const plan = planLinkReissue({ ...activated, L2_LinkToken: "tok-existing" }, 2, NOW);
    expect(plan?.linkToken).toBe("tok-existing");
    expect(plan?.updates.L2_LinkToken).toBeUndefined();
  });

  it("does nothing for a layer this submission never reached", () => {
    // No recipients were ever written against it, so the link was never real
    // for this record — which is how a counted-up id is turned away.
    expect(planLinkReissue({ L2_NotifyEmails: "" }, 2, NOW)).toBeNull();
    expect(planLinkReissue({}, 2, NOW)).toBeNull();
    expect(planLinkReissue(undefined, 2, NOW)).toBeNull();
  });

  it("falls back through the recipient columns", () => {
    expect(planLinkReissue({ L2_Emails: "a@b.example" }, 2, NOW)?.recipients).toEqual(["a@b.example"]);
    expect(planLinkReissue({ L2_Email: "c@d.example" }, 2, NOW)?.recipients).toEqual(["c@d.example"]);
  });

  it("refuses a second replacement inside the cooldown", () => {
    // Otherwise an old link is a button for mailing a reviewer repeatedly.
    const fields = {
      ...activated,
      [LINK_REISSUE_LOG_FIELD]: recordReissue("", 2, new Date("2026-09-01T11:58:00Z")),
    };
    expect(planLinkReissue(fields, 2, NOW)).toBeNull();
  });

  it("allows one again once the cooldown has passed", () => {
    const fields = {
      ...activated,
      [LINK_REISSUE_LOG_FIELD]: recordReissue("", 2, new Date("2026-09-01T11:40:00Z")),
    };
    expect(planLinkReissue(fields, 2, NOW)).not.toBeNull();
  });

  it("records the send so the next click is throttled", () => {
    const plan = planLinkReissue(activated, 2, NOW);
    const log = JSON.parse(String(plan?.updates[LINK_REISSUE_LOG_FIELD])) as Record<string, string>;
    expect(log["2"]).toBe(NOW.toISOString());
  });
});

describe("reissueReviewLink and test runs", () => {
  function baseParams(fields: Record<string, unknown>) {
    return {
      graphToken: "tok",
      responseListName: "Incident Report",
      responseItemId: "7",
      fields,
      layerNumber: 2,
      layer: { type: "approval", authMode: "public", publicToken: "pub-tok" },
      formTitle: "Incident Report",
      formSlug: "incident-report",
      totalLayers: 3,
      baseUrl: "https://example.com",
      now: NOW,
    };
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    gate.decideBeforeSend.mockReset();
    gate.decideBeforeSend.mockResolvedValue({ action: "as-before" });
  });

  it("sends a reissued link on a test-flagged row to the test address instead", async () => {
    const sendMail = vi.fn(async (_url: string, _init: { body: string }) => ({ ok: true, status: 202, json: async () => ({}) }));
    vi.stubGlobal("fetch", sendMail);
    vi.stubEnv("HR_FORM_EMAIL_FROM_ADDRESS", "noreply@example.com");

    await reissueReviewLink(baseParams({
      ...activated,
      IsTest: "true",
      TestEmail: "tester@pmw-group.com",
    }));

    expect(sendMail).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(sendMail.mock.calls[0][1].body));
    expect(body.message.toRecipients).toEqual([{ emailAddress: { address: "tester@pmw-group.com" } }]);
    expect(body.message.subject).toContain("TEST – ");
  });

  it("leaves an ordinary row's reissued link completely unchanged", async () => {
    const sendMail = vi.fn(async (_url: string, _init: { body: string }) => ({ ok: true, status: 202, json: async () => ({}) }));
    vi.stubGlobal("fetch", sendMail);
    vi.stubEnv("HR_FORM_EMAIL_FROM_ADDRESS", "noreply@example.com");

    await reissueReviewLink(baseParams({ ...activated }));

    expect(sendMail).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(sendMail.mock.calls[0][1].body));
    expect(body.message.toRecipients).toEqual([
      { emailAddress: { address: "reviewer@contractor.example" } },
      { emailAddress: { address: "safety@contractor.example" } },
    ]);
    expect(body.message.subject).not.toContain("TEST – ");
  });

  it("sends no email at all for a test-flagged row with no usable redirect address", async () => {
    const sendMail = vi.fn(async (_url: string, _init: { body: string }) => ({ ok: true, status: 202, json: async () => ({}) }));
    vi.stubGlobal("fetch", sendMail);
    vi.stubEnv("HR_FORM_EMAIL_FROM_ADDRESS", "noreply@example.com");

    await reissueReviewLink(baseParams({
      ...activated,
      IsTest: "true",
      TestEmail: "not-an-email",
    }));

    expect(sendMail).not.toHaveBeenCalled();
  });

  it("asks the routing check first, as a reissued link", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 202, json: async () => ({}) })));
    vi.stubEnv("HR_FORM_EMAIL_FROM_ADDRESS", "noreply@example.com");

    await reissueReviewLink(baseParams({ ...activated }));

    expect(gate.decideBeforeSend).toHaveBeenCalledWith(
      "tok",
      expect.anything(),
      { formTitle: "Incident Report", itemId: "7", layer: 2, trigger: "link-reissue", listTitle: "Incident Report" },
      expect.objectContaining(activated),
      "api:evaluate:reissue",
    );
  });

  it("sends nothing and writes nothing when the check holds the step, and answers as before", async () => {
    const sendMail = vi.fn(async () => ({ ok: true, status: 202, json: async () => ({}) }));
    vi.stubGlobal("fetch", sendMail);
    vi.stubEnv("HR_FORM_EMAIL_FROM_ADDRESS", "noreply@example.com");
    const { updateListItemFields } = await import("./graphClient.js");
    vi.mocked(updateListItemFields).mockClear();
    gate.decideBeforeSend.mockResolvedValue({ action: "hold", reason: "No HOD on the Routing page", checkFailed: false });

    await expect(reissueReviewLink(baseParams({ ...activated }))).resolves.toBeUndefined();

    expect(sendMail).not.toHaveBeenCalled();
    expect(updateListItemFields).not.toHaveBeenCalled();
  });

  it("sends nothing when the check itself throws", async () => {
    const sendMail = vi.fn(async () => ({ ok: true, status: 202, json: async () => ({}) }));
    vi.stubGlobal("fetch", sendMail);
    vi.stubEnv("HR_FORM_EMAIL_FROM_ADDRESS", "noreply@example.com");
    gate.decideBeforeSend.mockRejectedValue(new Error("boom"));

    await expect(reissueReviewLink(baseParams({ ...activated }))).resolves.toBeUndefined();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends nothing to a step the check found parked", async () => {
    const sendMail = vi.fn(async () => ({ ok: true, status: 202, json: async () => ({}) }));
    vi.stubGlobal("fetch", sendMail);
    vi.stubEnv("HR_FORM_EMAIL_FROM_ADDRESS", "noreply@example.com");
    gate.decideBeforeSend.mockResolvedValue({
      action: "as-before",
      notCheckable: { fields: { ...activated, L2_Status: "Needs Routing" } },
    });

    await reissueReviewLink(baseParams({ ...activated }));
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("mails the people routing corrected the step to", async () => {
    const sendMail = vi.fn(async (_url: string, _init: { body: string }) => ({ ok: true, status: 202, json: async () => ({}) }));
    vi.stubGlobal("fetch", sendMail);
    vi.stubEnv("HR_FORM_EMAIL_FROM_ADDRESS", "noreply@example.com");
    gate.decideBeforeSend.mockResolvedValue({
      action: "send",
      recipients: ["routed@contractor.example"],
      primary: "routed@contractor.example",
      fields: { ...activated, L2_Email: "routed@contractor.example", L2_NotifyEmails: "routed@contractor.example" },
      corrected: true,
    });

    await reissueReviewLink(baseParams({ ...activated }));

    expect(sendMail).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(sendMail.mock.calls[0][1].body));
    expect(body.message.toRecipients).toEqual([{ emailAddress: { address: "routed@contractor.example" } }]);
  });
});

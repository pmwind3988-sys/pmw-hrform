/**
 * sendEmailWorkflowRedirect.test.ts — the row-lookup degrade path in
 * `api/send-email.ts`.
 *
 * Lives in `_utils` rather than beside `send-email.ts` itself: only files
 * directly in `api/` count against the 12-function Vercel cap (see
 * `deploymentLimits.test.ts`), and this imports the handler by relative path.
 *
 * `queryListItemById` itself already degrades a missing ITEM to `null`, but
 * `getListId` underneath it throws for a list name that does not resolve.
 * Before the server-side redirect existed, that kind of mismatch only broke
 * the post-send log write — the mail still went out. This test locks in that
 * an unresolvable list still results in an ordinary send, not a lost
 * notification.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

/** What the row read answers for a list other than "Ghost List": a row, or a failure. */
let rowAnswer: { id: string; fields: Record<string, unknown> } | Error | null = null;

vi.mock("./graphClient.js", () => ({
  getGraphToken: vi.fn(async () => "tok"),
  queryListItemById: vi.fn(async (_token: string, listTitle: string) => {
    calls.push(`queryListItemById:${listTitle}`);
    if (listTitle === "Ghost List") {
      throw new Error("List 'Ghost List' not found");
    }
    if (rowAnswer instanceof Error) throw rowAnswer;
    return rowAnswer;
  }),
  queryMasterFormByTitle: vi.fn(async () => null),
}));

const gate = vi.hoisted(() => ({ decideBeforeSend: vi.fn() }));
vi.mock("./preSendGate.js", () => ({ decideBeforeSend: gate.decideBeforeSend }));
vi.mock("./preSendRoutingCheck.js", () => ({ createPreSendCheckCache: () => ({}) }));
vi.mock("./approvalDirectory.js", () => ({
  createApprovalDirectoryReader: () => ({ lookupPerson: async () => null }),
}));

/** Every workflow message that reached delivery, with its recipients. */
const delivered: { to: string | string[]; subject: string; body: string }[] = [];
vi.mock("./workflowEmail.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./workflowEmail.js")>();
  return {
    ...actual,
    deliverWorkflowEmail: vi.fn(async (_token: string, message: { to: string | string[]; subject: string; body: string }) => {
      calls.push("deliver");
      delivered.push(message);
      return {};
    }),
  };
});

/**
 * The endpoint refuses to send for a caller it cannot name, so every test here
 * has to arrive as somebody. `viewer` is reassigned per test to cover the
 * refusals; it is a signed-in staff account by default.
 */
let viewer: { kind: string; id: string; displayName: string } | null = null;

vi.mock("./viewerIdentity.js", () => ({
  requireSignedInViewer: vi.fn(async () => viewer),
}));

const { default: handler } = await import("../send-email.js");
const { resetRateLimits } = await import("./rateLimit.js");

function req(body: Record<string, unknown>) {
  return { body, method: "POST", headers: {} };
}

function res() {
  const state: {
    status: number;
    json: Record<string, unknown>;
    headers: Record<string, string>;
  } = { status: 0, json: {}, headers: {} };
  return {
    status(code: number) { state.status = code; return this; },
    json(data: Record<string, unknown>) { state.json = data; return this; },
    setHeader(name: string, value: string) { state.headers[name] = value; },
    end() {},
    state,
  };
}

beforeEach(() => {
  calls.length = 0;
  delivered.length = 0;
  rowAnswer = null;
  gate.decideBeforeSend.mockReset();
  gate.decideBeforeSend.mockResolvedValue({ action: "as-before" });
  resetRateLimits();
  viewer = { kind: "m365", id: "approver@pmw-group.com", displayName: "" };
  delete process.env.API_SECRET_KEY;
  process.env.HR_FORM_EMAIL_FROM_ADDRESS = "noreply@example.com";
  vi.stubGlobal("fetch", vi.fn(async () => {
    calls.push("sendMail");
    return { ok: true, status: 202, json: async () => ({}) };
  }));
});

describe("send-email's workflow row lookup", () => {
  it("sends an ordinary message to its original recipient when the workflow list cannot be resolved", async () => {
    const response = res();
    await handler(
      req({
        to: "approver@example.com",
        subject: "Action required",
        body: "<p>Please review</p>",
        workflow: { listTitle: "Ghost List", responseItemId: "42", layer: 2 },
      }),
      response,
    );
    expect(response.state.status).toBe(200);
    expect(response.state.json).toMatchObject({ ok: true });
    expect(calls).toContain("sendMail");
  });
});

/**
 * The guard that closed the open relay. Before it, the API key alone was
 * enough — and that key ships inside the browser bundle, so anyone at all
 * could send mail from the company's own mailbox to any address they liked.
 */
describe("send-email's sender check", () => {
  const plainMessage = {
    to: "someone@example.com",
    subject: "Hello",
    body: "<p>Hi</p>",
  };

  it("sends for a signed-in staff account", async () => {
    const response = res();
    await handler(req(plainMessage), response);
    expect(response.state.status).toBe(200);
    expect(calls).toContain("sendMail");
  });

  it("refuses a caller it cannot name, however valid the message looks", async () => {
    viewer = null;
    const response = res();
    await handler(req(plainMessage), response);
    expect(response.state.status).toBe(401);
    expect(calls).not.toContain("sendMail");
  });

  it("refuses a guest member, because signing in with Google is open to anybody", async () => {
    viewer = { kind: "guest", id: "stranger@gmail.com", displayName: "Stranger" };
    const response = res();
    await handler(req(plainMessage), response);
    expect(response.state.status).toBe(403);
    expect(calls).not.toContain("sendMail");
  });

  it("decides who is calling before it reads the message, so an unnamed caller learns nothing about validation", async () => {
    viewer = null;
    const response = res();
    await handler(req({ subject: "", body: "" }), response);
    expect(response.state.status).toBe(401);
  });
});

describe("send-email's rate limit", () => {
  const plainMessage = { to: "someone@example.com", subject: "Hello", body: "<p>Hi</p>" };

  async function send() {
    const response = res();
    await handler(req(plainMessage), response);
    return response.state;
  }

  it("stops a sender who is far past what any workflow needs, and says when to retry", async () => {
    for (let i = 0; i < 60; i += 1) {
      expect((await send()).status).toBe(200);
    }
    const refused = await send();
    expect(refused.status).toBe(429);
    expect(Number(refused.headers["Retry-After"])).toBeGreaterThan(0);
  });

  it("counts each sender separately, so one runaway account cannot mute everyone else", async () => {
    for (let i = 0; i < 60; i += 1) await send();
    expect((await send()).status).toBe(429);

    viewer = { kind: "m365", id: "someone.else@pmw-group.com", displayName: "" };
    expect((await send()).status).toBe(200);
  });
});

/**
 * The routing check before a "please act" email the browser asks to send — a
 * signed-in submission, an approval made in the browser, or an admin's "Send
 * now or resend". Only forms switched on for the check are affected.
 */
describe("send-email's routing check", () => {
  const CHECKED = "Training Evaluation Form";
  const actionRequest = (listTitle: string, extra: Record<string, unknown> = {}) => ({
    to: "old.hod@pmw-group.com",
    subject: "Action Required: Training Evaluation Form",
    body: "<p>Please evaluate</p>",
    followUp: true,
    workflow: { listTitle, responseItemId: 42, layer: 2 },
    ...extra,
  });
  const scheduledRow = {
    id: "42",
    fields: {
      SubmittedBy: "trainee@pmw-group.com",
      L2_Email: "new.hod@pmw-group.com",
      WorkflowEmailSchedule: JSON.stringify({
        "2": {
          layer: 2,
          recipient: "old.hod@pmw-group.com",
          dueAt: "2026-11-16T00:00:00.000Z",
          status: "scheduled",
          updatedAt: "2026-11-16T00:00:00.000Z",
          layerType: "evaluation",
          totalLayers: 3,
          reviewLink: "https://pmw-hrform.vercel.app/eval/training-evaluation/42/2",
          submittedBy: "trainee@pmw-group.com",
        },
      }),
    },
  };

  it("still sends a request for an unchecked form whose row cannot be read, and never asks the check", async () => {
    const response = res();
    await handler(req(actionRequest("Ghost List")), response);
    expect(response.state.json).toEqual({ ok: true });
    expect(calls).toContain("sendMail");
    expect(gate.decideBeforeSend).not.toHaveBeenCalled();
  });

  it("holds a request for a checked form whose row cannot be read", async () => {
    rowAnswer = new Error("Graph is down");
    const response = res();
    await handler(req(actionRequest(CHECKED)), response);
    expect(response.state.status).toBe(200);
    expect(response.state.json).toMatchObject({ ok: true, held: "check-failed" });
    expect(calls).not.toContain("sendMail");
    expect(calls).not.toContain("deliver");
  });

  it("holds a checked form's request when its answers list carries the Responses suffix", async () => {
    rowAnswer = new Error("Graph is down");
    const response = res();
    await handler(req(actionRequest(`${CHECKED} Responses`)), response);
    expect(response.state.json).toMatchObject({ ok: true, held: "check-failed" });
    expect(calls).not.toContain("sendMail");
  });

  it("holds a checked form's request when its row has gone", async () => {
    rowAnswer = null;
    const response = res();
    await handler(req(actionRequest(CHECKED)), response);
    expect(response.state.json).toMatchObject({ ok: true, held: "check-failed" });
    expect(calls).not.toContain("sendMail");
    expect(calls).not.toContain("deliver");
  });

  it("still sends a checked form's notice that asks nobody to act when its row cannot be read", async () => {
    rowAnswer = new Error("Graph is down");
    const response = res();
    await handler(req(actionRequest(CHECKED, { followUp: undefined, subject: "Completed: Training Evaluation Form" })), response);
    expect(response.state.json).toEqual({ ok: true });
    expect(calls).toContain("sendMail");
  });

  it("does not ask the check for an unchecked form, and delivers the browser's message as before", async () => {
    rowAnswer = { id: "42", fields: { SubmittedBy: "a@pmw-group.com" } };
    const response = res();
    await handler(req(actionRequest("Incident Report")), response);
    expect(gate.decideBeforeSend).not.toHaveBeenCalled();
    expect(delivered).toHaveLength(1);
    expect(delivered[0].to).toEqual(["old.hod@pmw-group.com"]);
  });

  it("answers with the hold and its reason, and sends nothing, when routing has no answer", async () => {
    rowAnswer = scheduledRow;
    gate.decideBeforeSend.mockResolvedValue({
      action: "hold",
      reason: "No HOD is set for Finance on the Routing page",
      checkFailed: false,
    });
    const response = res();
    await handler(req(actionRequest(CHECKED)), response);
    expect(gate.decideBeforeSend).toHaveBeenCalledWith(
      "tok",
      expect.anything(),
      { formTitle: CHECKED, itemId: "42", layer: 2, trigger: "send-now", listTitle: CHECKED },
      scheduledRow.fields,
      "api:send-email",
    );
    expect(response.state.json).toEqual({
      ok: true,
      held: "held-no-routing",
      reason: "No HOD is set for Finance on the Routing page",
    });
    expect(calls).not.toContain("deliver");
    expect(calls).not.toContain("sendMail");
  });

  it("answers held-check-failed when the check itself could not run", async () => {
    rowAnswer = scheduledRow;
    gate.decideBeforeSend.mockResolvedValue({ action: "hold", reason: "Directory unreadable", checkFailed: true });
    const response = res();
    await handler(req(actionRequest(CHECKED)), response);
    expect(response.state.json).toMatchObject({ ok: true, held: "held-check-failed" });
    expect(calls).not.toContain("deliver");
  });

  it("rebuilds the request for the routed people when the check corrected the step", async () => {
    rowAnswer = scheduledRow;
    gate.decideBeforeSend.mockResolvedValue({
      action: "send",
      recipients: ["new.hod@pmw-group.com"],
      primary: "new.hod@pmw-group.com",
      fields: scheduledRow.fields,
      corrected: true,
    });
    const response = res();
    await handler(req(actionRequest(CHECKED)), response);
    expect(response.state.json).toEqual({ ok: true });
    expect(delivered).toHaveLength(1);
    expect(delivered[0].to).toBe("new.hod@pmw-group.com");
    expect(delivered[0].subject).toContain("Action Required");
    expect(delivered[0].body).toContain("/eval/training-evaluation/42/2");
    expect(delivered[0].body).not.toContain("Please evaluate");
  });

  it("holds rather than re-addressing the browser's text when a corrected step cannot be described", async () => {
    const bare = { id: "42", fields: { SubmittedBy: "trainee@pmw-group.com" } };
    rowAnswer = bare;
    gate.decideBeforeSend.mockResolvedValue({
      action: "send",
      recipients: ["new.hod@pmw-group.com"],
      primary: "new.hod@pmw-group.com",
      fields: bare.fields,
      corrected: true,
    });
    const response = res();
    await handler(req(actionRequest(CHECKED)), response);
    expect(response.state.json).toMatchObject({ ok: true, held: "held-check-failed" });
    expect(calls).not.toContain("deliver");
  });

  it("sends the browser's own message when the check confirmed the step", async () => {
    rowAnswer = scheduledRow;
    gate.decideBeforeSend.mockResolvedValue({
      action: "send",
      recipients: ["old.hod@pmw-group.com"],
      primary: "old.hod@pmw-group.com",
      fields: scheduledRow.fields,
      corrected: false,
    });
    const response = res();
    await handler(req(actionRequest(CHECKED)), response);
    expect(delivered).toHaveLength(1);
    expect(delivered[0].body).toBe("<p>Please evaluate</p>");
  });

  it("does not send a request to a step the check found parked", async () => {
    rowAnswer = scheduledRow;
    gate.decideBeforeSend.mockResolvedValue({
      action: "as-before",
      notCheckable: { fields: { ...scheduledRow.fields, L2_Status: "Needs Routing" } },
    });
    const response = res();
    await handler(req(actionRequest(CHECKED)), response);
    expect(response.state.json).toMatchObject({ ok: true, held: "held-no-routing" });
    expect(calls).not.toContain("deliver");
  });
});

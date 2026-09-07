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

vi.mock("./graphClient.js", () => ({
  getGraphToken: vi.fn(async () => "tok"),
  queryListItemById: vi.fn(async (_token: string, listTitle: string) => {
    calls.push(`queryListItemById:${listTitle}`);
    if (listTitle === "Ghost List") {
      throw new Error("List 'Ghost List' not found");
    }
    return null;
  }),
}));

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

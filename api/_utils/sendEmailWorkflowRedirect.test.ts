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

const { default: handler } = await import("../send-email.js");

function req(body: Record<string, unknown>) {
  return { body, method: "POST", headers: {} };
}

function res() {
  const state: { status: number; json: Record<string, unknown> } = { status: 0, json: {} };
  return {
    status(code: number) { state.status = code; return this; },
    json(data: Record<string, unknown>) { state.json = data; return this; },
    setHeader() {},
    end() {},
    state,
  };
}

beforeEach(() => {
  calls.length = 0;
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

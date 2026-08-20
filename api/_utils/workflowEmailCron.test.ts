/**
 * Cron scan behaviour: what it reaches, what it claims, and when it stops.
 *
 * These are the failure modes that made scheduled notifications go missing
 * rather than merely late - a response list past its first page was never read
 * at all, and a run that ran out of time left no trace of what it had skipped.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const graph = vi.hoisted(() => ({
  queryAllListItems: vi.fn(),
  queryListItems: vi.fn(),
  updateListItemFields: vi.fn(
    async (_token: string, _list: string, _id: string, _fields: Record<string, unknown>) => ({}),
  ),
  getGraphToken: vi.fn(async () => "tok"),
}));
const mail = vi.hoisted(() => ({ deliverWorkflowEmail: vi.fn(async () => ({})) }));

vi.mock("./graphClient.js", () => graph);
vi.mock("./auth.js", () => ({
  setCorsHeaders: vi.fn(),
  validateApiKey: vi.fn(() => ({ valid: true })),
}));
vi.mock("./logger.js", () => ({ logError: vi.fn(), logWarn: vi.fn() }));

const actualMail = await vi.importActual<typeof import("./workflowEmail.js")>("./workflowEmail.js");
vi.mock("./workflowEmail.js", () => ({ ...actualMail, ...mail }));

// The handler lives one level up; `api/` files are deployed functions, so its
// test cannot live beside it without counting against the Hobby function cap.
const handler = (await import("../workflow-email-cron.js")).default;

function dueItem(id: string) {
  return {
    id,
    fields: {
      CurrentLayer: 1,
      WorkflowEmailSchedule: JSON.stringify({
        "1": {
          layer: 1, recipient: `person${id}@example.com`,
          dueAt: "2020-01-01T00:00:00.000Z", status: "scheduled",
          updatedAt: "2020-01-01T00:00:00.000Z", layerType: "evaluation",
          totalLayers: 1, reviewLink: "https://example.com/1", submittedBy: "s@example.com",
        },
      }),
    },
  };
}

function res() {
  const out: { code?: number; body?: Record<string, unknown> } = {};
  const self = {
    status(code: number) { out.code = code; return self; },
    json(body: Record<string, unknown>) { out.body = body; },
    setHeader() {}, end() {},
    result: out,
  };
  return self;
}

const REQ = { method: "GET", headers: {} as Record<string, string> };

beforeEach(() => {
  vi.clearAllMocks();
  graph.updateListItemFields.mockResolvedValue({});
  mail.deliverWorkflowEmail.mockResolvedValue({});
  graph.getGraphToken.mockResolvedValue("tok");
});

describe("the cron scan", () => {
  it("reads past the first page of a busy response list", async () => {
    const items = Array.from({ length: 600 }, (_, i) => dueItem(String(i + 1)));
    graph.queryAllListItems.mockImplementation(async (_t: string, list: string) =>
      list === "Master Form" ? [{ id: "f1", fields: { Title: "Incident Report" } }] : items);
    graph.queryListItems.mockResolvedValue([]);

    const r = res();
    await handler(REQ, r);

    expect(mail.deliverWorkflowEmail).toHaveBeenCalledTimes(600);
    expect(graph.queryListItems).not.toHaveBeenCalled();
  });

  it("counts the attempt on the row it claims, so retries stay bounded", async () => {
    graph.queryAllListItems.mockImplementation(async (_t: string, list: string) =>
      list === "Master Form" ? [{ id: "f1", fields: { Title: "Incident Report" } }] : [dueItem("1")]);

    await handler(REQ, res());

    const claim = graph.updateListItemFields.mock.calls[0];
    const written = JSON.parse(String(claim[3].WorkflowEmailSchedule));
    expect(written["1"].status).toBe("sending");
    expect(written["1"].attempts).toBe(1);
  });

  it("reports the work it did not reach instead of dying silently", async () => {
    const forms = Array.from({ length: 40 }, (_, i) => ({ id: `f${i}`, fields: { Title: `Form ${i}` } }));
    graph.queryAllListItems.mockImplementation(async (_t: string, list: string) =>
      list === "Master Form" ? forms : [dueItem("1")]);
    // Every send burns the whole budget, so only the first form can be handled.
    mail.deliverWorkflowEmail.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 60_000);
      return {};
    });
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date("2026-08-20T00:00:00.000Z"));

    const r = res();
    await handler(REQ, r);
    vi.useRealTimers();

    expect(r.result.body?.remainingForms).toBeGreaterThan(0);
  });
});

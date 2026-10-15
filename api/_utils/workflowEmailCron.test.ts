/**
 * Cron scan behaviour: what it reaches, what it claims, and when it stops.
 *
 * These are the failure modes that made scheduled notifications go missing
 * rather than merely late - a response list past its first page was never read
 * at all, and a run that ran out of time left no trace of what it had skipped.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirectTestMessage } from "./testRun.js";
import type { WorkflowEmailContext, WorkflowEmailMessage } from "./workflowEmail.js";

const graph = vi.hoisted(() => ({
  queryAllListItems: vi.fn(),
  queryListItems: vi.fn(),
  queryListItemById: vi.fn(),
  updateListItemFields: vi.fn(
    async (_token: string, _list: string, _id: string, _fields: Record<string, unknown>) => ({}),
  ),
  getGraphToken: vi.fn(async () => "tok"),
}));
const mail = vi.hoisted(() => ({
  deliverWorkflowEmail: vi.fn(async () => ({})),
  sendGraphEmail: vi.fn(async () => undefined),
  persistWorkflowEmailAttempt: vi.fn(async () => ({})),
}));

vi.mock("./graphClient.js", () => graph);
vi.mock("./auth.js", () => ({
  setCorsHeaders: vi.fn(),
  validateApiKey: vi.fn(() => ({ valid: true })),
}));
vi.mock("./logger.js", () => ({ logError: vi.fn(), logWarn: vi.fn() }));
const owner = vi.hoisted(() => ({ isFormBuilderSuperuser: vi.fn(async () => true) }));
vi.mock("./hrFormsOwner.js", async (importOriginal) => ({ ...(await importOriginal<object>()), ...owner }));

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

/**
 * Drives the handler with one due schedule entry on one response item, and
 * returns what actually went out — applying the same redirect
 * `deliverWorkflowEmail` would, since that function is mocked here.
 */
async function runCronWith(options: {
  fields: Record<string, unknown>;
  schedule: Record<string, unknown>;
}): Promise<{ to: string }[]> {
  const sent: { to: string }[] = [];
  (mail.deliverWorkflowEmail as unknown as {
    mockImplementation(fn: (token: string, message: WorkflowEmailMessage, context: WorkflowEmailContext) => Promise<Record<string, never>>): void;
  }).mockImplementation(async (_token, message, context) => {
    const outgoing = context.testRun ? redirectTestMessage(message, context.testRun) : message;
    sent.push({ to: Array.isArray(outgoing.to) ? outgoing.to.join(", ") : outgoing.to });
    return {};
  });
  graph.queryAllListItems.mockImplementation(async (_t: string, list: string) =>
    list === "Master Form"
      ? [{ id: "f1", fields: { Title: "Incident Report" } }]
      : [{
        id: "1",
        fields: {
          ...options.fields,
          WorkflowEmailSchedule: JSON.stringify(options.schedule),
        },
      }]);

  await handler(REQ, res());
  return sent;
}

beforeEach(() => {
  vi.clearAllMocks();
  graph.updateListItemFields.mockResolvedValue({});
  mail.deliverWorkflowEmail.mockResolvedValue({});
  mail.sendGraphEmail.mockResolvedValue(undefined);
  mail.persistWorkflowEmailAttempt.mockResolvedValue({});
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

  it("still redirects a deferred test-run email, long after the ticket expired", async () => {
    // A row flagged as a test, with a schedule entry due now and no ticket anywhere.
    const sent = await runCronWith({
      fields: { IsTest: "true", TestEmail: "tester@pmw-group.com" },
      schedule: {
        "2": {
          layer: 2, recipient: "hod@pmw-group.com",
          dueAt: "2020-01-01T00:00:00.000Z", status: "scheduled",
          updatedAt: "2020-01-01T00:00:00.000Z", layerType: "evaluation",
          totalLayers: 2, reviewLink: "https://example.com/2", submittedBy: "s@example.com",
        },
      },
    });
    expect(sent[0].to).toBe("tester@pmw-group.com");
  });

  it("leaves a production deferred email addressed to its real recipient", async () => {
    const sent = await runCronWith({
      fields: {},
      schedule: {
        "2": {
          layer: 2, recipient: "hod@pmw-group.com",
          dueAt: "2020-01-01T00:00:00.000Z", status: "scheduled",
          updatedAt: "2020-01-01T00:00:00.000Z", layerType: "evaluation",
          totalLayers: 2, reviewLink: "https://example.com/2", submittedBy: "s@example.com",
        },
      },
    });
    expect(sent[0].to).toBe("hod@pmw-group.com");
  });

  it("refuses to deliver a deferred test-run email once its redirect address has gone stale", async () => {
    // IsTest survived, but TestEmail was cleared or corrupted sometime during
    // the months the entry sat waiting - exactly the staleness a ticket-based
    // redirect cannot outlive.
    const sent = await runCronWith({
      fields: { IsTest: "true", TestEmail: "not-an-email" },
      schedule: {
        "2": {
          layer: 2, recipient: "hod@pmw-group.com",
          dueAt: "2020-01-01T00:00:00.000Z", status: "scheduled",
          updatedAt: "2020-01-01T00:00:00.000Z", layerType: "evaluation",
          totalLayers: 2, reviewLink: "https://example.com/2", submittedBy: "s@example.com",
        },
      },
    });
    expect(sent).toHaveLength(0);
    expect(mail.deliverWorkflowEmail).not.toHaveBeenCalled();
  });

  it("bundles several signed-in steps due to one person into one summary", async () => {
    const signedIn = (id: string, recipient: string) => ({
      id,
      fields: {
        CurrentLayer: 2,
        WorkflowEmailSchedule: JSON.stringify({
          "2": {
            layer: 2, recipient, dueAt: "2020-01-01T00:00:00.000Z", status: "scheduled",
            updatedAt: "2020-01-01T00:00:00.000Z", layerType: "evaluation", totalLayers: 2,
            reviewLink: `https://pmw-hrform.vercel.app/eval/training-evaluation/${id}/2`, submittedBy: "s@example.com",
          },
        }),
      },
    });
    graph.queryAllListItems.mockImplementation(async (_t: string, list: string) =>
      list === "Master Form"
        ? [{ id: "f1", fields: { Title: "Training Evaluation" } }]
        : [signedIn("1", "hod@pmw-group.com"), signedIn("2", "HOD@pmw-group.com"), signedIn("3", "other@pmw-group.com")]);

    const r = res();
    await handler(REQ, r);

    // One summary for the HOD's two, and the usual single email for the third.
    expect(mail.sendGraphEmail).toHaveBeenCalledTimes(1);
    expect(mail.deliverWorkflowEmail).toHaveBeenCalledTimes(1);
    expect(mail.persistWorkflowEmailAttempt).toHaveBeenCalledTimes(2);
    const recorded = mail.persistWorkflowEmailAttempt.mock.calls.map((call) => (call as unknown[])[2] as { status: string });
    expect(recorded.every((attempt) => attempt.status === "sent")).toBe(true);
    expect(r.result.body).toMatchObject({ sent: 3, digests: 1 });
  });

  it("records a failed summary on every row it covered, so tomorrow retries them", async () => {
    mail.sendGraphEmail.mockRejectedValue(new Error("Graph sendMail failed with status 503."));
    const item = (id: string) => ({
      id,
      fields: {
        CurrentLayer: 1,
        WorkflowEmailSchedule: JSON.stringify({
          "1": {
            layer: 1, recipient: "hod@pmw-group.com", dueAt: "2020-01-01T00:00:00.000Z", status: "scheduled",
            updatedAt: "2020-01-01T00:00:00.000Z", layerType: "evaluation", totalLayers: 1,
            reviewLink: `/eval/training-evaluation/${id}/1`, submittedBy: "s@example.com",
          },
        }),
      },
    });
    graph.queryAllListItems.mockImplementation(async (_t: string, list: string) =>
      list === "Master Form" ? [{ id: "f1", fields: { Title: "Training Evaluation" } }] : [item("1"), item("2")]);

    const r = res();
    await handler(REQ, r);

    const recorded = mail.persistWorkflowEmailAttempt.mock.calls.map((call) => (call as unknown[])[2] as { status: string });
    expect(recorded).toHaveLength(2);
    expect(recorded.every((attempt) => attempt.status === "failed")).toBe(true);
    expect(r.result.body).toMatchObject({ failed: 2, digests: 0 });
  });

  describe("send selected now", () => {
    const row = (id: string, recipient: string, extra: Record<string, unknown> = {}) => ({
      id,
      fields: {
        CurrentLayer: 2,
        WorkflowEmailSchedule: JSON.stringify({
          "2": {
            layer: 2, recipient, dueAt: "2099-01-01T00:00:00.000Z", status: "scheduled",
            updatedAt: "2026-10-01T00:00:00.000Z", layerType: "evaluation", totalLayers: 2,
            reviewLink: `https://pmw-hrform.vercel.app/eval/training-evaluation/${id}/2`, submittedBy: "s@example.com",
          },
        }),
        ...extra,
      },
    });
    const post = (items: unknown[], headers: Record<string, string> = { "x-sharepoint-token": "sp" }) =>
      ({ method: "POST", headers, body: { action: "send-selected", items } });

    it("refuses anyone who is not a Form Builder superuser", async () => {
      owner.isFormBuilderSuperuser.mockResolvedValueOnce(false);
      const r = res();
      await handler(post([{ formTitle: "Training Evaluation", itemId: 1, layer: 2 }]), r);
      expect(r.result.code).toBe(403);
      expect(mail.sendGraphEmail).not.toHaveBeenCalled();
      expect(mail.deliverWorkflowEmail).not.toHaveBeenCalled();
    });

    it("refuses a call with no SharePoint token at all", async () => {
      const r = res();
      await handler(post([{ formTitle: "Training Evaluation", itemId: 1, layer: 2 }], {}), r);
      expect(r.result.code).toBe(403);
    });

    it("sends picked items now, one person's as one summary, even before their date", async () => {
      const rows: Record<string, ReturnType<typeof row>> = {
        "1": row("1", "hod@pmw-group.com"),
        "2": row("2", "hod@pmw-group.com"),
        "3": row("3", "other@pmw-group.com"),
        "4": row("4", "hod@pmw-group.com", { WorkflowEmailSchedule: JSON.stringify({ "2": { layer: 2, status: "sent", recipient: "hod@pmw-group.com", dueAt: "2020-01-01T00:00:00.000Z", updatedAt: "", layerType: "evaluation", totalLayers: 2, reviewLink: "/eval/t/4/2", submittedBy: "" } }) }),
      };
      graph.queryListItemById.mockImplementation(async (_t: string, _l: string, id: string) => rows[id] ?? null);

      const r = res();
      await handler(post([1, 2, 3, 4].map((id) => ({ formTitle: "Training Evaluation", itemId: id, layer: 2 }))), r);

      expect(r.result.code).toBe(200);
      expect(mail.sendGraphEmail).toHaveBeenCalledTimes(1);
      expect(mail.deliverWorkflowEmail).toHaveBeenCalledTimes(1);
      expect(r.result.body).toMatchObject({ sent: 3, summaries: 1, failed: 0 });
      expect((r.result.body?.skipped as string[])[0]).toContain("already sent");
    });
  });
});

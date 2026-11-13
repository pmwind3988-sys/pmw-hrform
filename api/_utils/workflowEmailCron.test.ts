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

// The routing check has its own tests; here it is a stand-in whose answers
// each test chooses. By default it answers as for a form that is not checked.
const routing = vi.hoisted(() => ({
  checkBeforeSend: vi.fn(),
  createPreSendCheckCache: vi.fn(() => ({ shared: "one per run" })),
}));
vi.mock("./preSendRoutingCheck.js", () => routing);
const SKIPPED = { outcome: "skipped", hold: false, recipients: [], primary: "", fields: {} };

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
  routing.checkBeforeSend.mockResolvedValue(SKIPPED);
  routing.createPreSendCheckCache.mockImplementation(() => ({ shared: "one per run" }));
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

describe("the routing check before a checked form's email goes out", () => {
  const FORM = "Training Evaluation Form";
  const A = "hod@pmw-group.com";
  const B = "newhod@pmw-group.com";

  const scheduled = (id: string, recipient: string) => ({
    "2": {
      layer: 2, recipient, dueAt: "2020-01-01T00:00:00.000Z", status: "scheduled",
      updatedAt: "2020-01-01T00:00:00.000Z", layerType: "evaluation", totalLayers: 2,
      reviewLink: `https://pmw-hrform.vercel.app/eval/training-evaluation-form/${id}/2`, submittedBy: "s@example.com",
    },
  });
  const dueRow = (id: string, recipient: string, extra: Record<string, unknown> = {}) => ({
    id,
    fields: {
      CurrentLayer: 2,
      L2_Email: recipient,
      L2_Status: "Pending",
      WorkflowEmailSchedule: JSON.stringify(scheduled(id, recipient)),
      ...extra,
    },
  });
  type Row = ReturnType<typeof dueRow>;

  function serveRows(rows: Row[], formFields: Record<string, unknown> = {}) {
    graph.queryAllListItems.mockImplementation(async (_t: string, list: string) =>
      list === "Master Form" ? [{ id: "f1", fields: { Title: FORM, ...formFields } }] : list === FORM ? rows : []);
    graph.queryListItemById.mockImplementation(async (_t: string, _l: string, id: string) =>
      rows.find((row) => row.id === id) ?? null);
  }

  /** Answers per item id; anything not named matches with the row's own people. */
  function answer(byId: Record<string, (row: Row) => Record<string, unknown>>, rows: Row[]) {
    routing.checkBeforeSend.mockImplementation(async (_t: string, params: { itemId: string; layer: number }) => {
      const row = rows.find((candidate) => candidate.id === params.itemId)!;
      const custom = byId[params.itemId];
      if (custom) return custom(row);
      return { outcome: "match", hold: false, recipients: [String(row.fields.L2_Email)], primary: String(row.fields.L2_Email), fields: row.fields };
    });
  }

  const correctedTo = (address: string) => (row: Row) => ({
    outcome: "corrected", hold: false, recipients: [address], primary: address,
    fields: { ...row.fields, L2_Email: address, L2_NotifyEmails: address },
  });
  const heldNoRouting = (row: Row) => ({
    outcome: "held-no-routing", hold: true, recipients: [], primary: "",
    fields: { ...row.fields, L2_Status: "Needs Routing" }, reason: "No routing answer",
  });

  const deliveredTo = () => mail.deliverWorkflowEmail.mock.calls
    .map((call) => (call as unknown[])[1] as WorkflowEmailMessage)
    .map((message) => (Array.isArray(message.to) ? message.to.join(", ") : message.to));
  const scheduleWritesFor = (id: string) => graph.updateListItemFields.mock.calls
    .filter((call) => call[2] === id && call[3].WorkflowEmailSchedule !== undefined);

  it("checks each due step once, sharing one set of directory reads across the run", async () => {
    const rows = [dueRow("1", A), dueRow("2", A), dueRow("3", A)];
    serveRows(rows);
    answer({}, rows);

    await handler(REQ, res());

    expect(routing.createPreSendCheckCache).toHaveBeenCalledTimes(1);
    expect(routing.checkBeforeSend).toHaveBeenCalledTimes(3);
    const caches = routing.checkBeforeSend.mock.calls.map((call) => (call as unknown[])[1] as { cache: unknown; trigger: string; formTitle: string; layer: number });
    expect(new Set(caches.map((params) => params.cache)).size).toBe(1);
    expect(caches[0].cache).toBe(routing.createPreSendCheckCache.mock.results[0].value);
    expect(caches.every((params) => params.trigger === "daily-run" && params.formTitle === FORM && params.layer === 2)).toBe(true);
    // Three matching steps for one person still go as one summary.
    expect(mail.sendGraphEmail).toHaveBeenCalledTimes(1);
  });

  it("groups by the corrected people: A and B each get a single email, no summary", async () => {
    const rows = [dueRow("1", A), dueRow("2", A)];
    serveRows(rows);
    answer({ "2": correctedTo(B) }, rows);

    const r = res();
    await handler(REQ, r);

    expect(mail.sendGraphEmail).not.toHaveBeenCalled();
    expect(deliveredTo().sort()).toEqual([B, A].sort());
    const claim = JSON.parse(String(scheduleWritesFor("2")[0][3].WorkflowEmailSchedule));
    expect(claim["2"].recipient).toBe(B);
    expect(r.result.body).toMatchObject({ sent: 2, digests: 0 });
  });

  it("leaves a held step scheduled and sends it nothing", async () => {
    const rows = [dueRow("1", A), dueRow("2", "other@pmw-group.com")];
    serveRows(rows);
    answer({ "1": heldNoRouting }, rows);

    const r = res();
    await handler(REQ, r);

    expect(deliveredTo()).toEqual(["other@pmw-group.com"]);
    expect(scheduleWritesFor("1")).toHaveLength(0);
    expect(r.result.body).toMatchObject({ sent: 1, held: 1 });
  });

  it("holds when the check itself throws", async () => {
    const rows = [dueRow("1", A)];
    serveRows(rows);
    routing.checkBeforeSend.mockRejectedValue(new Error("boom"));

    await handler(REQ, res());

    expect(mail.deliverWorkflowEmail).not.toHaveBeenCalled();
    expect(scheduleWritesFor("1")).toHaveLength(0);
  });

  it("sends no request to a step that is parked or on paper", async () => {
    const rows = [dueRow("1", A), dueRow("2", A)];
    serveRows(rows);
    const parked = (status: string) => (row: Row) => ({
      outcome: "not-checkable", hold: false, recipients: [A], primary: A,
      fields: { ...row.fields, L2_Status: status },
    });
    answer({ "1": parked("Needs Routing"), "2": parked("Manual Evaluation Required") }, rows);

    await handler(REQ, res());

    expect(mail.deliverWorkflowEmail).not.toHaveBeenCalled();
    expect(mail.sendGraphEmail).not.toHaveBeenCalled();
    expect(scheduleWritesFor("1")).toHaveLength(0);
    expect(scheduleWritesFor("2")).toHaveLength(0);
  });

  it("does not check a test run, even on a checked form", async () => {
    const rows = [dueRow("1", A, { IsTest: "true", TestEmail: "tester@pmw-group.com" })];
    serveRows(rows);

    await handler(REQ, res());

    expect(routing.checkBeforeSend).not.toHaveBeenCalled();
    expect(mail.deliverWorkflowEmail).toHaveBeenCalledTimes(1);
  });

  it("does not check a form that is not switched on", async () => {
    graph.queryAllListItems.mockImplementation(async (_t: string, list: string) =>
      list === "Master Form" ? [{ id: "f1", fields: { Title: "Training Evaluation" } }] : [dueRow("1", A)]);

    await handler(REQ, res());

    expect(routing.checkBeforeSend).not.toHaveBeenCalled();
    expect(deliveredTo()).toEqual([A]);
  });

  describe("reminders", () => {
    // 09:30 in Malaysia on Monday 2 November; the run three mornings later.
    const SENT = "2026-11-02T01:30:00.000Z";
    const RUN = new Date(Date.UTC(2026, 10, 5, 0, 0, 0));
    const reminderForm = {
      Slug: "training-evaluation-form",
      LayerConfig: JSON.stringify({
        layers: [
          { layerNumber: 1, type: "approval", authMode: "365", title: "Supervisor" },
          { layerNumber: 2, type: "evaluation", authMode: "365", title: "HOD evaluation" },
        ],
      }),
    };
    const waitingRow = (id: string) => ({
      id,
      fields: {
        CurrentLayer: 2,
        L1_Status: "Approved",
        L1_SignedAt: "2026-11-01T00:00:00.000Z",
        L2_Status: "Pending",
        L2_Email: A,
        SubmittedBy: "trainee@pmw-group.com",
        WorkflowEmailLog: JSON.stringify({ 2: { layer: 2, recipient: A, status: "sent", attempts: 1, lastAttemptAt: SENT, sentAt: SENT } }),
      },
    }) as unknown as Row;

    async function runAt() {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(RUN);
      try {
        await handler(REQ, res());
      } finally {
        vi.useRealTimers();
      }
    }
    const reminderCounted = () => graph.updateListItemFields.mock.calls
      .some((call) => call[3].WorkflowEmailLog !== undefined && String(call[3].WorkflowEmailLog).includes("reminders"));

    it("checks before a reminder and reminds the same person on a match", async () => {
      const rows = [waitingRow("7")];
      serveRows(rows, reminderForm);
      answer({}, rows);

      await runAt();

      const params = (routing.checkBeforeSend.mock.calls[0] as unknown[])[1] as { trigger: string; layer: number; itemId: string };
      expect(params).toMatchObject({ trigger: "reminder", layer: 2, itemId: "7" });
      expect(mail.sendGraphEmail).toHaveBeenCalledTimes(1);
      expect(((mail.sendGraphEmail.mock.calls[0] as unknown[])[1] as WorkflowEmailMessage).subject).toMatch(/^Reminder/);
      expect(reminderCounted()).toBe(true);
    });

    it("sends no reminder for a held step", async () => {
      const rows = [waitingRow("7")];
      serveRows(rows, reminderForm);
      answer({ "7": heldNoRouting }, rows);

      await runAt();

      expect(mail.sendGraphEmail).not.toHaveBeenCalled();
      expect(mail.deliverWorkflowEmail).not.toHaveBeenCalled();
      expect(reminderCounted()).toBe(false);
    });

    it("sends the corrected people the request itself, not a reminder for something they never got", async () => {
      const rows = [waitingRow("7")];
      serveRows(rows, reminderForm);
      answer({ "7": correctedTo(B) }, rows);

      await runAt();

      expect(reminderCounted()).toBe(false);
      expect(mail.sendGraphEmail).not.toHaveBeenCalled();
      expect(deliveredTo()).toEqual([B]);
      const message = (mail.deliverWorkflowEmail.mock.calls[0] as unknown[])[1] as WorkflowEmailMessage;
      expect(message.subject).not.toMatch(/^Reminder/);
      const claim = JSON.parse(String(scheduleWritesFor("7")[0][3].WorkflowEmailSchedule));
      expect(claim["2"]).toMatchObject({ recipient: B, status: "sending", layerType: "evaluation" });
      expect(claim["2"].reviewLink).toContain("/eval/training-evaluation-form/7/2");
    });
  });

  describe("send selected now", () => {
    const post = (ids: string[]) => ({
      method: "POST",
      headers: { "x-sharepoint-token": "sp" } as Record<string, string>,
      body: { action: "send-selected", items: ids.map((id) => ({ formTitle: FORM, itemId: id, layer: 2 })) },
    });

    it("skips a held step with its reason and sends the rest to the routed people", async () => {
      const rows = [dueRow("1", A), dueRow("2", A), dueRow("3", A)];
      serveRows(rows);
      answer({ "1": heldNoRouting, "2": correctedTo(B) }, rows);

      const r = res();
      await handler(post(["1", "2", "3"]), r);

      expect(routing.createPreSendCheckCache).toHaveBeenCalledTimes(1);
      const triggers = routing.checkBeforeSend.mock.calls.map((call) => ((call as unknown[])[1] as { trigger: string }).trigger);
      expect(triggers).toEqual(["send-selected", "send-selected", "send-selected"]);
      expect(r.result.body?.skipped).toEqual([`${FORM} #1: on hold - No routing answer`]);
      expect(mail.sendGraphEmail).not.toHaveBeenCalled();
      expect(deliveredTo().sort()).toEqual([A, B].sort());
      expect(r.result.body).toMatchObject({ sent: 2, summaries: 0, failed: 0 });
    });
  });
});

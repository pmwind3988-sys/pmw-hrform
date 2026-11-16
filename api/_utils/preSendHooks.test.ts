/**
 * The routing check on the email a step gets the moment it opens: a new
 * submission's first step, and the next step after an approval or evaluation.
 *
 * The step advance is driven through the real `api/evaluate.ts` handler (the
 * public-link path, which needs the fewest stand-ins), with Graph, mail and the
 * check itself stubbed. Whatever the check answers, the approver's decision is
 * already recorded and they get the same success response.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowEmailContext, WorkflowEmailMessage, WorkflowEmailScheduleEntry } from "./workflowEmail.js";
import { nextDigestRunAt } from "./workflowSummaryHold.js";

const graph = vi.hoisted(() => ({
  getGraphToken: vi.fn(async () => "tok"),
  queryListItems: vi.fn(async () => []),
  queryListItemById: vi.fn(),
  queryMasterFormByTitle: vi.fn(),
  updateListItemFields: vi.fn(async () => ({})),
}));
vi.mock("./graphClient.js", async (importOriginal) => ({ ...(await importOriginal<object>()), ...graph }));
vi.mock("./auth.js", () => ({ setCorsHeaders: vi.fn(), validateApiKey: vi.fn(() => ({ valid: true })) }));
vi.mock("./logger.js", () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));

const workflow = vi.hoisted(() => ({ loadSubmissionLayerConfig: vi.fn() }));
vi.mock("./submissionLayerConfig.js", async (importOriginal) => ({ ...(await importOriginal<object>()), ...workflow }));

vi.mock("./approvalDirectory.js", () => ({
  createApprovalDirectoryReader: () => ({
    lookupPerson: async () => null,
    lookupRoleHolder: async () => null,
    lookupSubject: async () => null,
    routableRows: async () => [],
  }),
}));

const mail = vi.hoisted(() => ({
  scheduleOrDeliverWorkflowEmail: vi.fn(async (
    _token: string, _message: WorkflowEmailMessage, _context: WorkflowEmailContext,
  ) => ({})),
  persistWorkflowEmailSchedule: vi.fn(async (
    _token: string, _context: WorkflowEmailContext, entry: WorkflowEmailScheduleEntry,
  ) => entry),
}));
vi.mock("./workflowEmail.js", async (importOriginal) => ({ ...(await importOriginal<object>()), ...mail }));

// The check has its own tests; here each test chooses its answer.
const routing = vi.hoisted(() => ({
  checkBeforeSend: vi.fn(),
  createPreSendCheckCache: vi.fn(() => ({ shared: "one per request" })),
}));
vi.mock("./preSendRoutingCheck.js", () => routing);

const handler = (await import("../evaluate.js")).default;
const { gateFirstRequestEmail } = await import("./preSendGate.js");

const CHECKED_FORM = "Training Evaluation Form";

function layerConfig() {
  return {
    layers: [
      {
        layerNumber: 1, type: "approval", authMode: "public", publicToken: "pt1",
        assignee: { type: "user", value: "first@example.com" },
      },
      {
        layerNumber: 2, type: "approval", authMode: "365",
        assignee: { type: "user", value: "saved@example.com" },
      },
    ],
  };
}

function item() {
  return {
    id: "7",
    fields: {
      SubmittedBy: "submitter@example.com",
      FormStatus: "In Review",
      CurrentLayer: 1,
      L1_Status: "Pending",
      L1_Email: "first@example.com",
      L1_LinkToken: "k1",
      L2_Status: "Pending",
      L2_Email: "saved@example.com",
      L2_Emails: "saved@example.com",
      L2_NotifyEmails: "saved@example.com",
    },
  };
}

function approve(formTitle = CHECKED_FORM) {
  return {
    method: "POST",
    headers: {} as Record<string, string>,
    query: {},
    body: { token: "pt1", formTitle, layerNumber: 1, responseItemId: 7, action: "approve", linkToken: "k1" },
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

const SUCCESS = { success: true, formStatus: "In Review", advancedToLayer: 2 };

function sentTo(): unknown[] {
  return mail.scheduleOrDeliverWorkflowEmail.mock.calls.map(([, message]) => message.to);
}

beforeEach(() => {
  vi.clearAllMocks();
  graph.queryListItemById.mockImplementation(async () => item());
  graph.queryMasterFormByTitle.mockImplementation(async (_token: string, title: string) => ({
    id: "1", fields: { Title: title, Slug: "training-evaluation" },
  }));
  workflow.loadSubmissionLayerConfig.mockResolvedValue({ layerConfig: layerConfig(), surveyJson: null });
});

describe("the next step's email after an approval", () => {
  it("is checked for the next step, on the answers list the form really uses", async () => {
    routing.checkBeforeSend.mockResolvedValue({
      outcome: "match", hold: false, recipients: ["saved@example.com"], primary: "saved@example.com",
      fields: { ...item().fields, CurrentLayer: 2 },
    });
    const out = res();
    await handler(approve() as never, out as never);

    expect(routing.checkBeforeSend).toHaveBeenCalledTimes(1);
    expect(routing.checkBeforeSend.mock.calls[0][1]).toMatchObject({
      formTitle: CHECKED_FORM,
      itemId: "7",
      layer: 2,
      trigger: "step-advanced",
      listTitle: `${CHECKED_FORM} Responses`,
    });
    expect(sentTo()).toEqual(["saved@example.com"]);
    expect(out.result).toEqual({ code: 200, body: SUCCESS });
  });

  it("goes to the routed person when the saved one no longer matches", async () => {
    routing.checkBeforeSend.mockResolvedValue({
      outcome: "corrected", hold: false, recipients: ["routed@example.com"], primary: "routed@example.com",
      fields: { ...item().fields, CurrentLayer: 2, L2_Email: "routed@example.com", L2_NotifyEmails: "routed@example.com" },
    });
    const out = res();
    await handler(approve() as never, out as never);

    expect(sentTo()).toEqual(["routed@example.com"]);
    expect(mail.persistWorkflowEmailSchedule).not.toHaveBeenCalled();
    expect(out.result).toEqual({ code: 200, body: SUCCESS });
  });

  it("mails no reviewer when routing has no answer, and the approver still succeeds", async () => {
    routing.checkBeforeSend.mockResolvedValue({
      outcome: "held-no-routing", hold: true, recipients: [], primary: "", reason: "nobody",
      fields: { ...item().fields, CurrentLayer: 2, L2_Status: "Needs Routing", L2_Email: "" },
    });
    const out = res();
    await handler(approve() as never, out as never);

    expect(mail.scheduleOrDeliverWorkflowEmail).not.toHaveBeenCalled();
    expect(mail.persistWorkflowEmailSchedule).not.toHaveBeenCalled();
    expect(out.result).toEqual({ code: 200, body: SUCCESS });
  });

  it("leaves the email for the next daily run when the check fails, and the approver still succeeds", async () => {
    routing.checkBeforeSend.mockResolvedValue({
      outcome: "held-check-failed", hold: true, recipients: [], primary: "saved@example.com", reason: "read failed",
      fields: { ...item().fields, CurrentLayer: 2 },
    });
    const before = Date.now();
    const out = res();
    await handler(approve() as never, out as never);

    expect(mail.scheduleOrDeliverWorkflowEmail).not.toHaveBeenCalled();
    expect(mail.persistWorkflowEmailSchedule).toHaveBeenCalledTimes(1);
    const [, context, entry] = mail.persistWorkflowEmailSchedule.mock.calls[0];
    expect(context).toMatchObject({ listTitle: `${CHECKED_FORM} Responses`, responseItemId: "7", layer: 2 });
    expect(entry).toMatchObject({
      layer: 2,
      recipient: "saved@example.com",
      status: "scheduled",
      layerType: "approval",
      totalLayers: 2,
      submittedBy: "submitter@example.com",
      dueAt: nextDigestRunAt(new Date(before)).toISOString(),
    });
    expect(entry.reviewLink).toContain("/7/2");
    expect(out.result).toEqual({ code: 200, body: SUCCESS });
  });

  it("holds and still succeeds when the check itself throws", async () => {
    routing.checkBeforeSend.mockRejectedValue(new Error("boom"));
    const out = res();
    await handler(approve() as never, out as never);

    expect(mail.scheduleOrDeliverWorkflowEmail).not.toHaveBeenCalled();
    expect(mail.persistWorkflowEmailSchedule).toHaveBeenCalledTimes(1);
    expect(out.result).toEqual({ code: 200, body: SUCCESS });
  });

  it("is not checked on a form that is not switched on, and mails the saved person as before", async () => {
    const out = res();
    await handler(approve("Leave Form") as never, out as never);

    expect(routing.checkBeforeSend).not.toHaveBeenCalled();
    expect(sentTo()).toEqual(["saved@example.com"]);
    expect(out.result).toEqual({ code: 200, body: SUCCESS });
  });
});

describe("gateFirstRequestEmail", () => {
  const retry = {
    context: { listTitle: CHECKED_FORM, responseItemId: "9", layer: 1 },
    details: { layerType: "evaluation" as const, totalLayers: 1, reviewLink: "https://x/eval/f/9/1", submittedBy: "s@example.com" },
  };
  const input = (overrides: Record<string, unknown> = {}) => ({
    params: { formTitle: CHECKED_FORM, itemId: "9", layer: 1, trigger: "submission" as const },
    cache: routing.createPreSendCheckCache(),
    rowFields: { L1_Status: "Pending", L1_Email: "saved@example.com" } as Record<string, unknown>,
    recipients: ["saved@example.com"],
    primary: "saved@example.com",
    deferred: false,
    retry,
    logScope: "test",
    ...overrides,
  });

  it("lets an evaluation's later schedule be written as before even when the check holds", async () => {
    routing.checkBeforeSend.mockResolvedValue({
      outcome: "held-check-failed", hold: true, recipients: [], primary: "", fields: {}, reason: "x",
    });
    const gate = await gateFirstRequestEmail("tok", input({ deferred: true }) as never);

    expect(gate).toMatchObject({ send: true, recipients: ["saved@example.com"] });
    expect(mail.persistWorkflowEmailSchedule).not.toHaveBeenCalled();
  });

  it("keeps a parked step's own notice when the check cannot read anything", async () => {
    routing.checkBeforeSend.mockResolvedValue({
      outcome: "held-check-failed", hold: true, recipients: [], primary: "", fields: {}, reason: "x",
    });
    const rowFields = { L1_Status: "Needs Routing", L1_Email: "" };
    const gate = await gateFirstRequestEmail("tok", input({ rowFields }) as never);

    expect(gate).toMatchObject({ send: true, fields: rowFields });
    expect(mail.persistWorkflowEmailSchedule).not.toHaveBeenCalled();
  });

  it("hands back the row as read now when the check cannot judge the step", async () => {
    const reread = { L1_Status: "Manual Paper Required", L1_Email: "saved@example.com" };
    routing.checkBeforeSend.mockResolvedValue({
      outcome: "not-checkable", hold: false, recipients: ["saved@example.com"], primary: "saved@example.com", fields: reread,
    });
    const gate = await gateFirstRequestEmail("tok", input() as never);

    expect(gate).toEqual({ send: true, recipients: ["saved@example.com"], primary: "saved@example.com", fields: reread });
  });

  it("does not check a test run", async () => {
    const gate = await gateFirstRequestEmail("tok", input({ rowFields: { IsTest: "true", L1_Status: "Pending" } }) as never);

    expect(routing.checkBeforeSend).not.toHaveBeenCalled();
    expect(gate).toMatchObject({ send: true, recipients: ["saved@example.com"] });
  });

  it("never throws when the retry entry cannot be written", async () => {
    routing.checkBeforeSend.mockResolvedValue({
      outcome: "held-check-failed", hold: true, recipients: [], primary: "", fields: {}, reason: "x",
    });
    mail.persistWorkflowEmailSchedule.mockRejectedValueOnce(new Error("list down"));

    await expect(gateFirstRequestEmail("tok", input() as never)).resolves.toEqual({ send: false });
  });
});

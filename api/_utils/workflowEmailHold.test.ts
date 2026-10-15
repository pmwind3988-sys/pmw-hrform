/**
 * The hold decision inside `scheduleOrDeliverWorkflowEmail`: an instant notice
 * waits for the morning summary only when one is due, and only when asked to.
 * No mail leaves: Graph's sendMail is a stubbed fetch.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const graph = vi.hoisted(() => ({
  ensureListColumns: vi.fn(async () => undefined),
  queryListItemById: vi.fn(async () => ({ id: "7", fields: {} })),
  updateListItemFields: vi.fn(async () => ({})),
}));
const hold = vi.hoisted(() => ({ summaryHoldUntil: vi.fn(async (): Promise<string | null> => null) }));

vi.mock("./graphClient.js", () => graph);
vi.mock("./workflowSummaryHold.js", () => hold);
vi.mock("./logger.js", () => ({ logWarn: vi.fn(), logError: vi.fn() }));

const { scheduleOrDeliverWorkflowEmail } = await import("./workflowEmail.js");

const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
vi.stubGlobal("fetch", fetchMock);
process.env.HR_FORM_EMAIL_FROM_ADDRESS = "pmw.hrform@pmw-group.com";

const message = { to: "hod@pmw-group.com", subject: "s", body: "b" };
const context = { listTitle: "Training Evaluation", responseItemId: 7, layer: 2 };
const details = {
  layer: 2, layerType: "evaluation" as const, totalLayers: 2, submittedBy: "s@pmw-group.com",
  reviewLink: "https://pmw-hrform.vercel.app/eval/training-evaluation/7/2",
};

function lastWrittenSchedule(): Record<string, Record<string, unknown>> {
  const call = graph.updateListItemFields.mock.calls.at(-1) as unknown as [string, string, string, Record<string, unknown>];
  return JSON.parse(String(call[3].WorkflowEmailSchedule));
}

beforeEach(() => {
  vi.clearAllMocks();
  hold.summaryHoldUntil.mockResolvedValue(null);
});

describe("holding an instant email for the morning summary", () => {
  it("holds it when the same person already has a summary due", async () => {
    hold.summaryHoldUntil.mockResolvedValue("2026-10-16T00:00:00.000Z");
    const result = await scheduleOrDeliverWorkflowEmail("tok", message, context, undefined, details, { mayHoldForSummary: true });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "scheduled", heldForSummary: true, dueAt: "2026-10-16T00:00:00.000Z" });
    expect(lastWrittenSchedule()["2"]).toMatchObject({ status: "scheduled", heldForSummary: true });
  });

  it("sends at once when nothing else is due for that person", async () => {
    const result = await scheduleOrDeliverWorkflowEmail("tok", message, context, undefined, details, { mayHoldForSummary: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("sent");
  });

  it("sends at once if the check itself fails", async () => {
    hold.summaryHoldUntil.mockRejectedValue(new Error("Graph 503"));
    await scheduleOrDeliverWorkflowEmail("tok", message, context, undefined, details, { mayHoldForSummary: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never holds unless the caller asks, nor for a public link or a test run", async () => {
    hold.summaryHoldUntil.mockResolvedValue("2026-10-16T00:00:00.000Z");
    await scheduleOrDeliverWorkflowEmail("tok", message, context, undefined, details);
    await scheduleOrDeliverWorkflowEmail("tok", message, context, undefined,
      { ...details, reviewLink: "https://pmw-hrform.vercel.app/eval/tok?item=7&k=x" }, { mayHoldForSummary: true });
    await scheduleOrDeliverWorkflowEmail("tok", message,
      { ...context, testRun: { testEmail: "tester@pmw-group.com" } }, undefined, details, { mayHoldForSummary: true });
    expect(hold.summaryHoldUntil).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

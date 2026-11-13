/**
 * The check a "please act" email goes through before it is sent: what it does
 * to the row for each outcome, what it hands back to the sender, and that it
 * never lets an email out when it could not check. Graph is a fake directory
 * and a fake list; no mail leaves.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const graph = vi.hoisted(() => ({
  queryListItemById: vi.fn(),
  updateListItemFields: vi.fn(async (_token: string, _list: string, _id: string, _fields: Record<string, unknown>) => ({})),
  queryMasterFormByTitle: vi.fn(),
  queryWebFormVersion: vi.fn(),
  queryListItems: vi.fn(),
  getListColumns: vi.fn(),
  graphFieldEquals: (column: string, value: string) => `fields/${column} eq '${value}'`,
}));
const mail = vi.hoisted(() => ({ sendGraphEmail: vi.fn(async () => undefined) }));

vi.mock("./graphClient.js", async (importOriginal) => ({ ...(await importOriginal<object>()), ...graph }));
vi.mock("./logger.js", () => ({ logInfo: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock("./workflowEmail.js", async (importOriginal) => ({ ...(await importOriginal<object>()), ...mail }));

const { checkBeforeSend, createPreSendCheckCache, FAILED_CHECKS_BEFORE_ATTENTION } = await import("./preSendRoutingCheck.js");
const { readRoutingChecks, getWorkflowAssignment } = await import("./workflowAssignmentData.js");

const FORM = "Training Evaluation Form";
const HR = "pmw.hrform@pmw-group.com";

const LAYERS = [
  { layerNumber: 1, type: "approval", title: "Superior", authMode: "365", assignee: { type: "user", value: "sup@pmw.com" } },
  {
    layerNumber: 2, type: "evaluation", title: "HOD Evaluation", authMode: "365",
    assignee: { type: "chain", startFrom: "submitter", value: "", hops: 1, fallback: { mode: "park" } },
  },
];

/** Approval Directory rows by person: who approves them, and their stand-ins. */
let directory: Record<string, { approver: string; delegates?: string }>;
let directoryFails = false;

function directoryItems(filter: string | undefined) {
  if (directoryFails) throw new Error("Graph GET 503: unavailable");
  const wanted = filter?.match(/'([^']+)'/)?.[1] ?? "";
  const rows = Object.entries(directory)
    .filter(([email]) => !wanted || email === wanted)
    .map(([email, row], index) => ({
      id: String(index + 1),
      fields: { PersonEmail: email, PersonName: email.split("@")[0], ApproverEmail: row.approver, DelegateEmails: row.delegates ?? "" },
    }));
  return rows;
}

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    SubmittedBy: "staff@pmw.com",
    SubmittedAt: "2026-08-12T02:14:00.000Z",
    FormVersion: "1.0",
    PublishKey: "production",
    CurrentLayer: 2,
    L1_Status: "Approved",
    L2_Status: "Pending",
    L2_Email: "hod@pmw.com",
    L2_Emails: "hod@pmw.com",
    L2_NotifyEmails: "hod@pmw.com",
    ...overrides,
  };
}

let stored: Record<string, unknown>;

function patches(): Record<string, unknown>[] {
  return graph.updateListItemFields.mock.calls.map((call) => call[3]);
}

function lastAssignmentData(): unknown {
  const withData = patches().filter((patch) => "WorkflowAssignmentData" in patch);
  return withData.at(-1)?.WorkflowAssignmentData;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.HR_FORM_EMAIL_FROM_ADDRESS = HR;
  directoryFails = false;
  directory = {
    "staff@pmw.com": { approver: "hod@pmw.com" },
    "hod@pmw.com": { approver: "ceo@pmw.com" },
  };
  stored = row();
  graph.queryListItemById.mockImplementation(async () => ({ id: "7", fields: stored }));
  graph.updateListItemFields.mockImplementation(async (_t, _l, _i, fields) => {
    stored = { ...stored, ...fields };
    return {};
  });
  graph.queryMasterFormByTitle.mockResolvedValue({ id: "1", fields: { Title: FORM, CurrentVersion: "1.0", CurrentPublishKey: "production" } });
  graph.queryWebFormVersion.mockResolvedValue({
    id: "2",
    fields: { SurveyJSON: JSON.stringify({ surveyJson: { pages: [{ elements: [{ type: "text", name: "employeeName", title: "Employee name" }] }] }, layerConfig: { layers: LAYERS } }) },
  });
  graph.getListColumns.mockImplementation(async () => {
    if (directoryFails) throw new Error("Graph GET 503: unavailable");
    return ["PersonEmail", "PersonName", "ApproverEmail", "DelegateEmails"].map((name) => ({ name, displayName: name }));
  });
  graph.queryListItems.mockImplementation(async (_t: string, _list: string, options?: { filter?: string }) => directoryItems(options?.filter));
});

const check = (overrides: Partial<Parameters<typeof checkBeforeSend>[1]> = {}) =>
  checkBeforeSend("tok", { formTitle: FORM, itemId: "7", layer: 2, trigger: "daily-run", ...overrides });

describe("checkBeforeSend", () => {
  it("sends as planned when the saved people match routing, and logs the match", async () => {
    const result = await check();
    expect(result).toMatchObject({ outcome: "match", hold: false, recipients: ["hod@pmw.com"], primary: "hod@pmw.com" });
    expect(patches()).toHaveLength(1);
    expect(readRoutingChecks(lastAssignmentData())).toMatchObject([{ layer: 2, outcome: "match", trigger: "daily-run" }]);
    expect(mail.sendGraphEmail).not.toHaveBeenCalled();
  });

  it("corrects a step saved to the wrong person, in one patch, and sends to the routed person", async () => {
    stored = row({ L2_Email: "old.hod@pmw.com", L2_Emails: "old.hod@pmw.com", L2_NotifyEmails: "old.hod@pmw.com" });
    const result = await check();

    expect(result).toMatchObject({ outcome: "corrected", hold: false, recipients: ["hod@pmw.com"], primary: "hod@pmw.com" });
    expect(patches()).toHaveLength(1);
    const [patch] = patches();
    expect(patch).toMatchObject({ L2_Email: "hod@pmw.com", L2_Emails: "hod@pmw.com", L2_NotifyEmails: "hod@pmw.com" });
    const assignment = getWorkflowAssignment(patch.WorkflowAssignmentData, 2);
    expect(assignment).toMatchObject({
      email: "hod@pmw.com", source: "resolved", updatedBy: "SYSTEM", reason: "Corrected automatically to match routing",
    });
    expect(assignment?.history[0]?.email).toBe("old.hod@pmw.com");
    expect(readRoutingChecks(patch.WorkflowAssignmentData)).toMatchObject([
      { outcome: "corrected", saved: ["old.hod@pmw.com"], routed: ["hod@pmw.com"] },
    ]);
    expect(result.fields.L2_Email).toBe("hod@pmw.com");
  });

  it("includes the routed person's stand-in in the correction", async () => {
    directory["hod@pmw.com"] = { approver: "ceo@pmw.com", delegates: "pa@pmw.com" };
    stored = row({ L2_Email: "old.hod@pmw.com", L2_Emails: "old.hod@pmw.com", L2_NotifyEmails: "old.hod@pmw.com" });
    const result = await check();
    expect(result.recipients).toEqual(["hod@pmw.com", "pa@pmw.com"]);
    expect(patches()[0]).toMatchObject({ L2_Email: "hod@pmw.com", L2_Emails: "hod@pmw.com; pa@pmw.com" });
  });

  it("redirects a scheduled email on correction and keeps its date", async () => {
    const schedule = {
      "2": {
        layer: 2, recipient: "old.hod@pmw.com", dueAt: "2026-11-14T00:00:00.000Z", status: "scheduled",
        updatedAt: "2026-08-12T02:14:00.000Z", layerType: "evaluation", totalLayers: 2,
        reviewLink: "https://pmw-hrform.vercel.app/eval/training-evaluation-form/7/2", submittedBy: "staff@pmw.com",
      },
    };
    stored = row({
      L2_Email: "old.hod@pmw.com", L2_Emails: "old.hod@pmw.com", L2_NotifyEmails: "old.hod@pmw.com",
      WorkflowEmailSchedule: JSON.stringify(schedule),
    });
    await check();
    const written = JSON.parse(String(patches()[0].WorkflowEmailSchedule)) as typeof schedule;
    expect(written["2"]).toMatchObject({ recipient: "hod@pmw.com", dueAt: "2026-11-14T00:00:00.000Z", status: "scheduled" });
  });

  it("holds the email when the correction cannot be saved", async () => {
    stored = row({ L2_Email: "old.hod@pmw.com", L2_Emails: "old.hod@pmw.com", L2_NotifyEmails: "old.hod@pmw.com" });
    graph.updateListItemFields.mockRejectedValueOnce(new Error("Graph PATCH 400: WorkflowAssignmentData does not exist"));
    const result = await check();
    expect(result).toMatchObject({ outcome: "held-check-failed", hold: true, recipients: [] });
    expect(stored.L2_Email).toBe("old.hod@pmw.com");
  });

  it("parks the step when routing has no answer, clears its people and tells HR once", async () => {
    delete directory["staff@pmw.com"];
    stored = row({ RoutingNotes: "Layer 1: earlier note" });
    const result = await check();

    expect(result).toMatchObject({ outcome: "held-no-routing", hold: true, recipients: [], primary: "" });
    expect(patches()[0]).toEqual({ L2_Status: "Needs Routing", L2_Email: "", L2_Emails: "", L2_NotifyEmails: "" });
    expect(String(stored.RoutingNotes).split("\n")[0]).toBe("Layer 1: earlier note");
    expect(String(stored.RoutingNotes).split("\n")[1]).toMatch(/^Layer 2: /);
    expect(readRoutingChecks(stored.WorkflowAssignmentData)).toMatchObject([{ outcome: "held-no-routing", routed: [] }]);
    expect(mail.sendGraphEmail).toHaveBeenCalledTimes(1);
    const notice = mail.sendGraphEmail.mock.calls[0] as unknown as [string, { to: string[]; subject: string; body: string; followUp?: boolean }];
    expect(notice[1].to).toEqual([HR]);
    expect(notice[1].followUp).toBeUndefined();
    expect(notice[1].body).toContain("Reconfigure this submission");
  });

  it("does not tell HR again when the same hold is found on a later run", async () => {
    delete directory["staff@pmw.com"];
    await check();
    // The same people saved, the same answer from routing: only the log's count moves.
    stored = row({ WorkflowAssignmentData: stored.WorkflowAssignmentData });
    await check();
    expect(mail.sendGraphEmail).toHaveBeenCalledTimes(1);
    expect(readRoutingChecks(stored.WorkflowAssignmentData)).toMatchObject([{ outcome: "held-no-routing", count: 2 }]);
  });

  it("keeps the hold when no HR mailbox is configured", async () => {
    delete directory["staff@pmw.com"];
    delete process.env.HR_FORM_EMAIL_FROM_ADDRESS;
    delete process.env.EMAIL_FROM_ADDRESS;
    delete process.env.VITE_HR_FORM_EMAIL_FROM_ADDRESS;
    delete process.env.VITE_EMAIL_FROM_ADDRESS;
    const result = await check();
    expect(result).toMatchObject({ outcome: "held-no-routing", hold: true });
    expect(mail.sendGraphEmail).not.toHaveBeenCalled();
  });

  it("keeps the hold when the notice itself fails", async () => {
    delete directory["staff@pmw.com"];
    mail.sendGraphEmail.mockRejectedValueOnce(new Error("Graph sendMail failed with status 500."));
    await expect(check()).resolves.toMatchObject({ outcome: "held-no-routing", hold: true });
  });

  it("holds without changing anything when the directory cannot be read", async () => {
    directoryFails = true;
    const result = await check();
    expect(result).toMatchObject({ outcome: "held-check-failed", hold: true, recipients: [], primary: "hod@pmw.com" });
    expect(patches().every((patch) => Object.keys(patch).join() === "WorkflowAssignmentData")).toBe(true);
    expect(stored.L2_Email).toBe("hod@pmw.com");
    expect(readRoutingChecks(stored.WorkflowAssignmentData)).toMatchObject([{ outcome: "held-check-failed", routed: [] }]);
    expect(mail.sendGraphEmail).not.toHaveBeenCalled();
  });

  it("holds when a stand-in could not be read, rather than dropping the stand-in", async () => {
    graph.queryListItems.mockImplementation(async (_t: string, _l: string, options?: { filter?: string }) => {
      if (options?.filter?.includes("hod@pmw.com")) throw new Error("Graph GET 503");
      return directoryItems(options?.filter);
    });
    const result = await check();
    expect(result).toMatchObject({ outcome: "held-check-failed", hold: true });
    expect(stored.L2_Email).toBe("hod@pmw.com");
  });

  it("tells HR once, on the fifth failed check in a row", async () => {
    directoryFails = true;
    for (let run = 1; run <= FAILED_CHECKS_BEFORE_ATTENTION + 1; run += 1) {
      await check();
      expect(mail.sendGraphEmail).toHaveBeenCalledTimes(run >= FAILED_CHECKS_BEFORE_ATTENTION ? 1 : 0);
    }
    const notice = mail.sendGraphEmail.mock.calls[0] as unknown as [string, { to: string[]; body: string }];
    expect(notice[1].body).toContain("failed five mornings in a row");
  });

  it("holds when the submission cannot be read", async () => {
    graph.queryListItemById.mockResolvedValue(null);
    await expect(check()).resolves.toMatchObject({ outcome: "held-check-failed", hold: true, recipients: [] });
    expect(graph.updateListItemFields).not.toHaveBeenCalled();
  });

  it("never touches a step reassigned by hand", async () => {
    stored = row({
      L2_Email: "picked@pmw.com", L2_Emails: "picked@pmw.com", L2_NotifyEmails: "picked@pmw.com",
      WorkflowAssignmentData: JSON.stringify({
        version: 1,
        layers: { 2: { layer: 2, email: "picked@pmw.com", source: "manual-override", updatedBy: "admin@pmw.com", updatedAt: "2026-09-01T00:00:00.000Z", history: [] } },
      }),
    });
    const result = await check();
    expect(result).toMatchObject({ outcome: "left-alone", hold: false, recipients: ["picked@pmw.com"], primary: "picked@pmw.com" });
    expect(patches()).toHaveLength(1);
    expect(Object.keys(patches()[0])).toEqual(["WorkflowAssignmentData"]);
    expect(getWorkflowAssignment(stored.WorkflowAssignmentData, 2)?.source).toBe("manual-override");
    expect(readRoutingChecks(stored.WorkflowAssignmentData)).toMatchObject([{ outcome: "left-alone" }]);
  });

  it("leaves a step already parked alone and sends nothing new", async () => {
    stored = row({ L2_Status: "Needs Routing", L2_Email: "", L2_Emails: "", L2_NotifyEmails: "" });
    const result = await check();
    expect(result).toMatchObject({ outcome: "not-checkable", hold: false, recipients: [] });
    expect(stored.L2_Status).toBe("Needs Routing");
    expect(mail.sendGraphEmail).not.toHaveBeenCalled();
  });

  it("skips a form that is not switched on, without reading anything", async () => {
    const result = await check({ formTitle: "Leave Application", fields: row() });
    expect(result).toMatchObject({ outcome: "skipped", hold: false, recipients: ["hod@pmw.com"] });
    for (const fn of [graph.queryListItemById, graph.queryListItems, graph.getListColumns, graph.queryMasterFormByTitle, graph.queryWebFormVersion, graph.updateListItemFields]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it("skips a test run", async () => {
    stored = row({ IsTest: true, TestEmail: "tester@pmw.com", L2_Email: "old.hod@pmw.com", L2_Emails: "old.hod@pmw.com", L2_NotifyEmails: "old.hod@pmw.com" });
    const result = await check();
    expect(result).toMatchObject({ outcome: "skipped", hold: false, recipients: ["old.hod@pmw.com"] });
    expect(graph.updateListItemFields).not.toHaveBeenCalled();
    expect(graph.queryMasterFormByTitle).not.toHaveBeenCalled();
  });

  it("reads the directory, Master Form and version once across checks sharing a cache", async () => {
    const cache = createPreSendCheckCache("tok");
    await check({ cache });
    await check({ cache, itemId: "8" });
    expect(graph.getListColumns).toHaveBeenCalledTimes(1);
    expect(graph.queryMasterFormByTitle).toHaveBeenCalledTimes(1);
    expect(graph.queryWebFormVersion).toHaveBeenCalledTimes(1);
    const personReads = graph.queryListItems.mock.calls.filter((call) => String(call[2]?.filter ?? "").includes("staff@pmw.com"));
    expect(personReads).toHaveLength(1);
  });

  it("does not keep a failed read in the cache", async () => {
    const cache = createPreSendCheckCache("tok");
    directoryFails = true;
    await expect(check({ cache })).resolves.toMatchObject({ outcome: "held-check-failed" });
    directoryFails = false;
    await expect(check({ cache })).resolves.toMatchObject({ outcome: "match" });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleMintTestTicket, recordTestRunStep, recordTestRunSteps, TEST_RUN_COLUMNS } from "./testRunActions.js";
import { verifyTestTicket } from "./testRun.js";
import { parseTestRunTrail } from "./testRunTrail.js";

function deps(owner: string | null = "hr@pmw-group.com") {
  return {
    resolveOwner: vi.fn(async () => owner),
    ensureColumn: vi.fn(async () => {}),
  };
}

const BODY = {
  action: "mint-test-ticket",
  slug: "leave-application",
  listTitle: "Leave Application",
  testEmail: "tester@pmw-group.com",
  delegatedToken: "delegated",
};

describe("minting a test ticket", () => {
  beforeEach(() => {
    process.env.API_SECRET_KEY = "secret-for-tests";
  });

  it("hands a superuser a ticket for the form they asked about", async () => {
    const result = await handleMintTestTicket(BODY, deps());
    expect(result.status).toBe(200);
    expect(verifyTestTicket(result.payload.ticket, "leave-application")).toMatchObject({
      testEmail: "tester@pmw-group.com",
      issuedBy: "hr@pmw-group.com",
    });
  });

  it("refuses anyone who is not an HR Forms Owner", async () => {
    const result = await handleMintTestTicket(BODY, deps(null));
    expect(result.status).toBe(403);
    expect(result.payload.ticket).toBeUndefined();
  });

  it("refuses a request with no delegated token to identify the caller", async () => {
    const result = await handleMintTestTicket({ ...BODY, delegatedToken: "" }, deps());
    expect(result.status).toBe(401);
  });

  it("refuses an address it could not redirect mail to", async () => {
    const result = await handleMintTestTicket({ ...BODY, testEmail: "nope" }, deps());
    expect(result.status).toBe(400);
    expect(String(result.payload.error)).toContain("email");
  });

  it("provisions the test columns with the caller's own token, not an app-only one", async () => {
    const d = deps();
    await handleMintTestTicket(BODY, d);
    for (const column of TEST_RUN_COLUMNS) {
      expect(d.ensureColumn).toHaveBeenCalledWith("delegated", "Leave Application", column);
    }
  });

  it("does not hand out a ticket when the columns could not be created", async () => {
    const d = deps();
    d.ensureColumn.mockRejectedValueOnce(new Error("403 accessDenied"));
    const result = await handleMintTestTicket(BODY, d);
    expect(result.status).toBe(500);
    expect(result.payload.ticket).toBeUndefined();
  });
});

describe("recording a step on a run", () => {
  function trailDeps(existing = "") {
    const written: Record<string, unknown>[] = [];
    return {
      written,
      readItem: vi.fn(async () => ({ fields: { TestRunLog: existing } })),
      updateFields: vi.fn(async (_t: string, _l: string, _i: string, fields: Record<string, unknown>) => {
        written.push(fields);
      }),
    };
  }

  it("adds the step to the run's trail", async () => {
    const d = trailDeps();
    await recordTestRunStep("token", "Leave Application", "42", { step: "row", label: "Response row created", status: "pass", order: 4 }, d);
    expect(parseTestRunTrail(d.written[0].TestRunLog).row.status).toBe("pass");
  });

  it("keeps the steps already recorded", async () => {
    const d = trailDeps(JSON.stringify({ ticket: { step: "ticket", label: "Ticket validated", status: "pass", at: "", order: 1 } }));
    await recordTestRunStep("token", "Leave Application", "42", { step: "row", label: "Response row created", status: "pass", order: 4 }, d);
    expect(Object.keys(parseTestRunTrail(d.written[0].TestRunLog)).sort()).toEqual(["row", "ticket"]);
  });

  it("never fails the submission it is only reporting on", async () => {
    const d = trailDeps();
    d.updateFields.mockRejectedValueOnce(new Error("SharePoint said no"));
    await expect(
      recordTestRunStep("token", "Leave Application", "42", { step: "row", label: "l", status: "pass", order: 4 }, d),
    ).resolves.toBeUndefined();
  });
});

describe("recording several steps on a run at once", () => {
  function trailDeps(existing = "") {
    const written: Record<string, unknown>[] = [];
    return {
      written,
      readItem: vi.fn(async () => ({ fields: { TestRunLog: existing } })),
      updateFields: vi.fn(async (_t: string, _l: string, _i: string, fields: Record<string, unknown>) => {
        written.push(fields);
      }),
    };
  }

  it("folds every step into a single write", async () => {
    const d = trailDeps();
    await recordTestRunSteps(
      "token",
      "Leave Application",
      "42",
      [
        { step: "ticket", label: "Test ticket validated", status: "pass", order: 1 },
        { step: "answers", label: "Answers accepted", status: "pass", order: 2 },
        { step: "reference", label: "Reference number allocated", status: "pass", order: 3 },
        { step: "row", label: "Response row created", status: "pass", order: 4 },
        { step: "fields", label: "All answers stored", status: "pass", order: 5 },
      ],
      d,
    );
    expect(d.readItem).toHaveBeenCalledTimes(1);
    expect(d.updateFields).toHaveBeenCalledTimes(1);
    const trail = parseTestRunTrail(d.written[0].TestRunLog);
    expect(Object.keys(trail).sort()).toEqual(["answers", "fields", "reference", "row", "ticket"]);
  });

  it("keeps each step's own order value so the checklist still reads in run order", async () => {
    const d = trailDeps();
    await recordTestRunSteps(
      "token",
      "Leave Application",
      "42",
      [
        { step: "row", label: "Response row created", status: "pass", order: 4 },
        { step: "ticket", label: "Test ticket validated", status: "pass", order: 1 },
      ],
      d,
    );
    const trail = parseTestRunTrail(d.written[0].TestRunLog);
    expect(trail.row.order).toBe(4);
    expect(trail.ticket.order).toBe(1);
  });

  it("never fails the submission it is only reporting on", async () => {
    const d = trailDeps();
    d.updateFields.mockRejectedValueOnce(new Error("SharePoint said no"));
    await expect(
      recordTestRunSteps(
        "token",
        "Leave Application",
        "42",
        [{ step: "row", label: "l", status: "pass", order: 4 }],
        d,
      ),
    ).resolves.toBeUndefined();
  });

  it("does nothing for an empty batch", async () => {
    const d = trailDeps();
    await recordTestRunSteps("token", "Leave Application", "42", [], d);
    expect(d.readItem).not.toHaveBeenCalled();
    expect(d.updateFields).not.toHaveBeenCalled();
  });
});

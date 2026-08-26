import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleMintTestTicket, handleStampTestRun, handleDeleteTestRuns, recordTestRunStep, recordTestRunSteps, TEST_RUN_COLUMNS } from "./testRunActions.js";
import { mintTestTicket, verifyTestTicket } from "./testRun.js";
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

describe("stamping a row the signed-in path already wrote", () => {
  beforeEach(() => {
    process.env.API_SECRET_KEY = "secret-for-tests";
  });

  // A slug -> list-title registry standing in for `queryMasterFormBySlug`:
  // the same lookup `handleStampTestRun` uses to derive the list to write to
  // from the ticket's own slug, so the caller's `body.listTitle` is never
  // the thing that decides which row gets stamped.
  function stampDeps(registry: Record<string, string> = { "leave-application": "Leave Application", "travel-claim": "Travel Claim" }) {
    const written: { listTitle: string; itemId: string; fields: Record<string, unknown> }[] = [];
    return {
      written,
      resolveListTitleForSlug: vi.fn(async (slug: string) => registry[slug] ?? null),
      updateFields: vi.fn(async (_t: string, listTitle: string, itemId: string, fields: Record<string, unknown>) => {
        written.push({ listTitle, itemId, fields });
      }),
    };
  }

  it("stamps both IsTest and TestEmail on the named row for a valid ticket", async () => {
    const ticket = mintTestTicket({ slug: "leave-application", testEmail: "tester@pmw-group.com", issuedBy: "hr@pmw-group.com" });
    const d = stampDeps();
    const result = await handleStampTestRun(
      "token",
      { listTitle: "Leave Application", itemId: "42", slug: "leave-application", testTicket: ticket },
      d,
    );
    expect(result.status).toBe(200);
    expect(d.written).toEqual([
      { listTitle: "Leave Application", itemId: "42", fields: { IsTest: "true", TestEmail: "tester@pmw-group.com" } },
    ]);
  });

  it("stamps nothing for a ticket that was never signed", async () => {
    const d = stampDeps();
    const result = await handleStampTestRun(
      "token",
      { listTitle: "Leave Application", itemId: "42", slug: "leave-application", testTicket: "not-a-ticket" },
      d,
    );
    expect(result.status).toBe(400);
    expect(d.updateFields).not.toHaveBeenCalled();
  });

  it("stamps nothing for a ticket that has been tampered with", async () => {
    const ticket = mintTestTicket({ slug: "leave-application", testEmail: "tester@pmw-group.com", issuedBy: "hr@pmw-group.com" });
    const [body, signature] = ticket.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ slug: "leave-application", testEmail: "attacker@evil.com", issuedBy: "hr@pmw-group.com", expiresAt: Date.now() + 1e9 }),
    ).toString("base64url");
    const tampered = `${forgedBody}.${signature}`;
    void body;
    const d = stampDeps();
    const result = await handleStampTestRun(
      "token",
      { listTitle: "Leave Application", itemId: "42", slug: "leave-application", testTicket: tampered },
      d,
    );
    expect(result.status).toBe(400);
    expect(d.updateFields).not.toHaveBeenCalled();
  });

  it("stamps nothing for a ticket that has expired", async () => {
    // mintTestTicket sets expiresAt = now + TTL (4h), so minting as of five
    // hours ago yields a ticket that is already expired relative to the real
    // "now" verifyTestTicket checks against below.
    const ticket = mintTestTicket(
      { slug: "leave-application", testEmail: "tester@pmw-group.com", issuedBy: "hr@pmw-group.com" },
      new Date(Date.now() - 5 * 60 * 60 * 1000),
    );
    const d = stampDeps();
    const result = await handleStampTestRun(
      "token",
      { listTitle: "Leave Application", itemId: "42", slug: "leave-application", testTicket: ticket },
      d,
    );
    expect(result.status).toBe(400);
    expect(d.updateFields).not.toHaveBeenCalled();
  });

  it("stamps nothing when the ticket was minted for a different form", async () => {
    const ticket = mintTestTicket({ slug: "leave-application", testEmail: "tester@pmw-group.com", issuedBy: "hr@pmw-group.com" });
    const d = stampDeps();
    const result = await handleStampTestRun(
      "token",
      { listTitle: "Travel Claim", itemId: "42", slug: "travel-claim", testTicket: ticket },
      d,
    );
    expect(result.status).toBe(400);
    expect(d.updateFields).not.toHaveBeenCalled();
  });

  it("refuses without touching the row when the row identity is incomplete", async () => {
    const d = stampDeps();
    const result = await handleStampTestRun("token", { listTitle: "Leave Application", slug: "leave-application" }, d);
    expect(result.status).toBe(400);
    expect(d.updateFields).not.toHaveBeenCalled();
  });

  it("ignores a caller-supplied listTitle for a form other than the ticket's own", async () => {
    // A ticket minted for "leave-application" is a capability over that form
    // alone. If `body.listTitle` were trusted, this call would stamp a row
    // in Travel Claim's list — someone else's real submission — using a
    // ticket that was never issued for that form. The list the row is
    // written to must come only from the ticket's own (verified) slug.
    const ticket = mintTestTicket({ slug: "leave-application", testEmail: "tester@pmw-group.com", issuedBy: "hr@pmw-group.com" });
    const d = stampDeps();
    const result = await handleStampTestRun(
      "token",
      { listTitle: "Travel Claim", itemId: "99", slug: "leave-application", testTicket: ticket },
      d,
    );
    expect(result.status).toBe(200);
    expect(d.written).toEqual([
      { listTitle: "Leave Application", itemId: "99", fields: { IsTest: "true", TestEmail: "tester@pmw-group.com" } },
    ]);
  });

  it("still stamps a row in the ticket's own form when no listTitle is spoofed", async () => {
    const ticket = mintTestTicket({ slug: "travel-claim", testEmail: "tester@pmw-group.com", issuedBy: "hr@pmw-group.com" });
    const d = stampDeps();
    const result = await handleStampTestRun(
      "token",
      { itemId: "7", slug: "travel-claim", testTicket: ticket },
      d,
    );
    expect(result.status).toBe(200);
    expect(d.written).toEqual([
      { listTitle: "Travel Claim", itemId: "7", fields: { IsTest: "true", TestEmail: "tester@pmw-group.com" } },
    ]);
  });

  it("refuses when the ticket's own slug names no form", async () => {
    const ticket = mintTestTicket({ slug: "ghost-form", testEmail: "tester@pmw-group.com", issuedBy: "hr@pmw-group.com" });
    const d = stampDeps();
    const result = await handleStampTestRun(
      "token",
      { itemId: "1", slug: "ghost-form", testTicket: ticket },
      d,
    );
    expect(result.status).toBe(400);
    expect(d.updateFields).not.toHaveBeenCalled();
  });
});

function deleteDeps(rows: { id: string; fields: Record<string, unknown> }[], owner: string | null = "hr@pmw-group.com") {
  const deleted: string[] = [];
  return {
    deleted,
    resolveOwner: vi.fn(async () => owner),
    listRows: vi.fn(async () => rows),
    deleteRow: vi.fn(async (_t: string, _l: string, id: string) => { deleted.push(id); }),
  };
}

describe("deleting test runs", () => {
  const rows = [
    { id: "1", fields: { IsTest: "true" } },
    { id: "2", fields: {} },
    { id: "3", fields: { IsTest: "true" } },
  ];

  it("deletes only the runs that are flagged as tests", async () => {
    const d = deleteDeps(rows);
    const result = await handleDeleteTestRuns({ listTitle: "Leave Application", delegatedToken: "t" }, d);
    expect(result.status).toBe(200);
    expect(d.deleted.sort()).toEqual(["1", "3"]);
  });

  it("deletes one named run when asked for one", async () => {
    const d = deleteDeps(rows);
    await handleDeleteTestRuns({ listTitle: "Leave Application", delegatedToken: "t", itemId: "3" }, d);
    expect(d.deleted).toEqual(["3"]);
  });

  it("refuses to delete a production submission even when named directly", async () => {
    const d = deleteDeps(rows);
    const result = await handleDeleteTestRuns({ listTitle: "Leave Application", delegatedToken: "t", itemId: "2" }, d);
    expect(result.status).toBe(400);
    expect(d.deleted).toEqual([]);
  });

  it("refuses anyone who is not an HR Forms Owner", async () => {
    const d = deleteDeps(rows, null);
    const result = await handleDeleteTestRuns({ listTitle: "Leave Application", delegatedToken: "t" }, d);
    expect(result.status).toBe(403);
    expect(d.deleted).toEqual([]);
  });
});

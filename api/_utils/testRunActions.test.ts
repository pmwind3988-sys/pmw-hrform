import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleMintTestTicket, TEST_RUN_COLUMNS } from "./testRunActions.js";
import { verifyTestTicket } from "./testRun.js";

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

import { beforeEach, describe, expect, it } from "vitest";

import { mintTestTicket, verifyTestTicket, TEST_TICKET_TTL_MS } from "./testRun.js";

const NOW = new Date("2026-08-26T09:00:00Z");

function ticket(overrides: Partial<{ slug: string; testEmail: string; issuedBy: string }> = {}) {
  return mintTestTicket(
    { slug: "leave-application", testEmail: "tester@pmw-group.com", issuedBy: "hr@pmw-group.com", ...overrides },
    NOW,
  );
}

describe("test ticket", () => {
  beforeEach(() => {
    process.env.API_SECRET_KEY = "secret-for-tests";
  });

  it("round-trips the run's details", () => {
    const payload = verifyTestTicket(ticket(), "leave-application", NOW);
    expect(payload).toMatchObject({
      slug: "leave-application",
      testEmail: "tester@pmw-group.com",
      issuedBy: "hr@pmw-group.com",
    });
  });

  it("refuses a ticket minted for a different form", () => {
    expect(verifyTestTicket(ticket(), "expense-claim", NOW)).toBeNull();
  });

  it("refuses a ticket whose payload was edited", () => {
    const [body, signature] = ticket().split(".");
    const tampered = Buffer.from(
      JSON.stringify({ slug: "leave-application", testEmail: "attacker@example.com", issuedBy: "x", expiresAt: 9e15 }),
    ).toString("base64url");
    expect(body).not.toBe(tampered);
    expect(verifyTestTicket(`${tampered}.${signature}`, "leave-application", NOW)).toBeNull();
  });

  it("refuses a ticket signed with a different secret", () => {
    const minted = ticket();
    process.env.API_SECRET_KEY = "a-different-secret";
    expect(verifyTestTicket(minted, "leave-application", NOW)).toBeNull();
  });

  it("refuses a ticket once it has expired", () => {
    const later = new Date(NOW.getTime() + TEST_TICKET_TTL_MS + 1000);
    expect(verifyTestTicket(ticket(), "leave-application", later)).toBeNull();
  });

  it("treats junk as no ticket at all rather than throwing", () => {
    expect(verifyTestTicket(undefined, "leave-application", NOW)).toBeNull();
    expect(verifyTestTicket("", "leave-application", NOW)).toBeNull();
    expect(verifyTestTicket("not-a-ticket", "leave-application", NOW)).toBeNull();
    expect(verifyTestTicket({ slug: "leave-application" }, "leave-application", NOW)).toBeNull();
  });

  it("refuses to mint without an address to redirect to", () => {
    expect(() => mintTestTicket({ slug: "x", testEmail: "not-an-email", issuedBy: "hr@pmw-group.com" }, NOW)).toThrow();
  });
});

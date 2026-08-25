import { beforeEach, describe, expect, it } from "vitest";

import { applySendEmailTestRun } from "./sendEmailTestRun.js";
import { mintTestTicket, TEST_TICKET_TTL_MS } from "./testRun.js";

const NOW = new Date("2026-08-26T09:00:00Z");
const MESSAGE = { to: "submitter@pmw-group.com", subject: "Your submission", body: "<p>Hi</p>" };

function ticket() {
  return mintTestTicket(
    { slug: "leave-application", testEmail: "tester@pmw-group.com", issuedBy: "hr@pmw-group.com" },
    NOW,
  );
}

describe("applySendEmailTestRun", () => {
  beforeEach(() => {
    process.env.API_SECRET_KEY = "secret-for-tests";
  });

  it("redirects to the test address when the ticket is valid for this form", () => {
    const out = applySendEmailTestRun(MESSAGE, ticket(), "leave-application", NOW);
    expect(out.to).toBe("tester@pmw-group.com");
    expect(out.subject).toContain("[TEST]");
  });

  it("sends normally when no ticket is provided", () => {
    const out = applySendEmailTestRun(MESSAGE, undefined, undefined, NOW);
    expect(out).toEqual(MESSAGE);
  });

  it("sends normally when the ticket is malformed", () => {
    const out = applySendEmailTestRun(MESSAGE, "not-a-ticket", "leave-application", NOW);
    expect(out).toEqual(MESSAGE);
  });

  it("sends normally when the ticket has expired", () => {
    const later = new Date(NOW.getTime() + TEST_TICKET_TTL_MS + 1000);
    const out = applySendEmailTestRun(MESSAGE, ticket(), "leave-application", later);
    expect(out).toEqual(MESSAGE);
  });

  it("sends normally when the ticket was minted for a different form", () => {
    const out = applySendEmailTestRun(MESSAGE, ticket(), "expense-claim", NOW);
    expect(out).toEqual(MESSAGE);
  });

  it("sends normally when no slug is provided", () => {
    const out = applySendEmailTestRun(MESSAGE, ticket(), undefined, NOW);
    expect(out).toEqual(MESSAGE);
  });
});

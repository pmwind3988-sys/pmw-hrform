import { beforeEach, describe, expect, it } from "vitest";

import { mintTestTicket, verifyTestTicket, TEST_TICKET_TTL_MS, redirectTestMessage, TEST_SUBJECT_PREFIX } from "./testRun.js";
import { isTestRow, readTestRunRedirect, testRunFieldsFor, testRunLayerFields } from "./testRun.js";
import { testRunStandInPrincipals, withTestRunStandInFor } from "./testRun.js";
import { standInEmailNote, standInPrincipal } from "./resolveAssignee.js";

const NOW = new Date("2026-08-26T09:00:00Z");

function ticket(overrides: Partial<{ slug: string; testEmail: string; issuedBy: string; onBehalfOf: string }> = {}) {
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

describe("test-run redirect", () => {
  const redirect = { testEmail: "tester@pmw-group.com" };

  it("sends a message addressed to one person to the test address instead", () => {
    const out = redirectTestMessage(
      { to: "hod-finance@pmw-group.com", subject: "Approval needed", body: "<p>Hi</p>" },
      redirect,
    );
    expect(out.to).toBe("tester@pmw-group.com");
  });

  it("collapses a fan-out to the single test address", () => {
    const out = redirectTestMessage(
      { to: ["siti@pmw-group.com", "hr-inbox@pmw-group.com"], subject: "s", body: "b" },
      redirect,
    );
    expect(out.to).toBe("tester@pmw-group.com");
  });

  it("marks the subject so a test mail is never mistaken for a real one", () => {
    const out = redirectTestMessage({ to: "a@b.com", subject: "Approval needed", body: "b" }, redirect);
    expect(out.subject).toBe(`${TEST_SUBJECT_PREFIX}Approval needed`);
  });

  it("does not double-prefix a subject that is already marked", () => {
    const once = redirectTestMessage({ to: "a@b.com", subject: "s", body: "b" }, redirect);
    const twice = redirectTestMessage(once, redirect);
    expect(twice.subject).toBe(`${TEST_SUBJECT_PREFIX}s`);
  });

  it("names in the body who the mail was diverted from", () => {
    const out = redirectTestMessage(
      { to: ["siti@pmw-group.com", "hod@pmw-group.com"], subject: "s", body: "<p>Body</p>" },
      redirect,
    );
    expect(out.body).toContain("siti@pmw-group.com");
    expect(out.body).toContain("hod@pmw-group.com");
    expect(out.body).toContain("Body");
  });

  it("escapes the diverted addresses rather than trusting them as markup", () => {
    const out = redirectTestMessage(
      { to: '<img src=x onerror=alert(1)>@b.com', subject: "s", body: "b" },
      redirect,
    );
    expect(out.body).not.toContain("<img");
    expect(out.body).toContain("&lt;img");
  });

  it("leaves every other property of the message alone", () => {
    const out = redirectTestMessage(
      { to: "a@b.com", subject: "s", body: "b", attachments: [{ name: "form.pdf" }] },
      redirect,
    );
    expect(out.attachments).toEqual([{ name: "form.pdf" }]);
  });
});

describe("reading a test run back off its row", () => {
  it("stamps the flag and the address the run redirects to", () => {
    expect(testRunFieldsFor({
      slug: "leave-application",
      testEmail: "tester@pmw-group.com",
      issuedBy: "hr@pmw-group.com",
      expiresAt: 0,
    })).toEqual({ IsTest: "true", TestEmail: "tester@pmw-group.com" });
  });

  it("recovers the redirect from a stored row long after the ticket expired", () => {
    expect(readTestRunRedirect({ IsTest: "true", TestEmail: "tester@pmw-group.com" }))
      .toEqual({ testEmail: "tester@pmw-group.com" });
  });

  it("treats an ordinary submission as no redirect at all", () => {
    expect(readTestRunRedirect({})).toBeUndefined();
    expect(readTestRunRedirect(undefined)).toBeUndefined();
    expect(isTestRow({})).toBe(false);
  });

  it("refuses to redirect a flagged row with no usable address, rather than guessing", () => {
    expect(readTestRunRedirect({ IsTest: "true", TestEmail: "" })).toBeUndefined();
    expect(readTestRunRedirect({ IsTest: "true", TestEmail: "not-an-email" })).toBeUndefined();
    expect(readTestRunRedirect({ IsTest: "true" })).toBeUndefined();
  });

  it("still knows such a row is a test one, so it stays out of production views", () => {
    expect(isTestRow({ IsTest: "true" })).toBe(true);
    expect(isTestRow({ IsTest: "TRUE" })).toBe(true);
    expect(isTestRow({ IsTest: true })).toBe(true);
  });
});

describe("testRunLayerFields", () => {
  it("puts every step on the tester, primary, actors and delivery alike", () => {
    expect(testRunLayerFields([1, 2, 3], "tester@pmw-group.com", "Pending")).toEqual({
      L1_Status: "Pending", L1_Email: "tester@pmw-group.com", L1_Emails: "tester@pmw-group.com", L1_NotifyEmails: "tester@pmw-group.com",
      L2_Status: "Pending", L2_Email: "tester@pmw-group.com", L2_Emails: "tester@pmw-group.com", L2_NotifyEmails: "tester@pmw-group.com",
      L3_Status: "Pending", L3_Email: "tester@pmw-group.com", L3_Emails: "tester@pmw-group.com", L3_NotifyEmails: "tester@pmw-group.com",
    });
  });
});

describe("rehearsing a stand-in", () => {
  beforeEach(() => {
    process.env.API_SECRET_KEY = "secret-for-tests";
  });

  const row: Record<string, string> = {
    IsTest: "true",
    TestEmail: "tester@pmw-group.com",
    ...testRunLayerFields([1, 2], "tester@pmw-group.com", "Pending", "b@example.com"),
  };
  const emptyDirectory = { lookupPerson: async () => null };

  it("carries the person stood in for on the ticket", () => {
    const payload = verifyTestTicket(ticket({ onBehalfOf: "B@example.com" }), "leave-application", NOW);
    expect(payload?.onBehalfOf).toBe("b@example.com");
  });

  it("refuses to stand the tester in for themselves", () => {
    expect(() => ticket({ onBehalfOf: "tester@pmw-group.com" })).toThrow();
  });

  it("assigns each step to that person with the tester alongside", () => {
    expect(row).toMatchObject({
      L1_Email: "b@example.com",
      L1_Emails: "b@example.com; tester@pmw-group.com",
      L2_NotifyEmails: "b@example.com; tester@pmw-group.com",
    });
  });

  it("reads who the tester stands in for off the row", () => {
    expect(testRunStandInPrincipals(row)).toEqual(["b@example.com"]);
    expect(testRunStandInPrincipals({ ...row, IsTest: "" })).toEqual([]);
    const plain = { IsTest: "true", TestEmail: "tester@pmw-group.com", ...testRunLayerFields([1], "tester@pmw-group.com", "Pending") };
    expect(testRunStandInPrincipals(plain)).toEqual([]);
  });

  it("writes the request email as for a real PA", async () => {
    const note = await standInEmailNote(
      withTestRunStandInFor(emptyDirectory, row),
      "b@example.com",
      ["b@example.com", "tester@pmw-group.com"],
      "evaluation",
    );
    expect(note).toContain("Sent to b@example.com and to tester@pmw-group.com");
    expect(note).toContain("Either of you can evaluate");
  });

  it("records the tester's decision as made on that person's behalf", async () => {
    const record = await standInPrincipal(withTestRunStandInFor(emptyDirectory, row), "tester@pmw-group.com", "b@example.com");
    expect(record).toEqual({ email: "b@example.com", name: "b@example.com", position: "" });
  });

  it("uses the directory's name and post when the person is real", async () => {
    const directory = {
      lookupPerson: async (email: string) => email === "b@example.com"
        ? { email, name: "Datuk B", department: "Board", position: "CEO", approverEmail: "" }
        : null,
    };
    const record = await standInPrincipal(withTestRunStandInFor(directory, row), "tester@pmw-group.com", "b@example.com");
    expect(record).toEqual({ email: "b@example.com", name: "Datuk B", position: "CEO" });
  });
});

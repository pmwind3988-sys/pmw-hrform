import { describe, expect, it } from "vitest";

import { testRunAssignee, testRunFromTicket, withTestRunStandIn } from "./testRun";

function ticketFor(payload: unknown): string {
  return `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

describe("testRunFromTicket", () => {
  it("reads the tester's address off a ticket", () => {
    expect(testRunFromTicket(ticketFor({ slug: "leave", testEmail: "A@Example.com" })))
      .toEqual({ testEmail: "a@example.com", onBehalfOf: "" });
  });

  it("reads who the tester stands in for", () => {
    expect(testRunFromTicket(ticketFor({ testEmail: "a@example.com", onBehalfOf: "B@example.com" })))
      .toEqual({ testEmail: "a@example.com", onBehalfOf: "b@example.com" });
  });

  it("answers empty for anything that is not a readable ticket", () => {
    expect(testRunFromTicket("").testEmail).toBe("");
    expect(testRunFromTicket("not-base64!.sig").testEmail).toBe("");
    expect(testRunFromTicket(ticketFor({ testEmail: "nobody" })).testEmail).toBe("");
  });
});

describe("withTestRunStandIn", () => {
  const directory = { lookupPerson: async () => null };

  it("makes an unknown principal name the tester as their stand-in", async () => {
    const person = await withTestRunStandIn(directory, "a@example.com", "b@example.com").lookupPerson("b@example.com");
    expect(person).toMatchObject({ email: "b@example.com", name: "b@example.com", delegateEmails: ["a@example.com"] });
  });

  it("leaves everyone else as the directory has them", async () => {
    expect(await withTestRunStandIn(directory, "a@example.com", "b@example.com").lookupPerson("c@example.com")).toBeNull();
  });
});

describe("testRunAssignee", () => {
  it("is the test address on a test-run row", () => {
    expect(testRunAssignee({ IsTest: "true", TestEmail: "a@example.com" })).toBe("a@example.com");
  });

  it("is empty for a real submission, even one carrying a TestEmail", () => {
    expect(testRunAssignee({ TestEmail: "a@example.com" })).toBe("");
    expect(testRunAssignee({ IsTest: "false", TestEmail: "a@example.com" })).toBe("");
  });

  it("is empty for a test run without a usable address", () => {
    expect(testRunAssignee({ IsTest: true, TestEmail: "" })).toBe("");
  });
});

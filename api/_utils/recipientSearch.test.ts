/**
 * Directory search behind the builder's recipient picker.
 *
 * The picker previously read SharePoint `siteusers` filtered to
 * `PrincipalType eq 1` - users only - so distribution lists, the thing an author
 * most needs to find when routing a layer, were the one kind it could never
 * offer. This searches the tenant directory instead.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchRecipients } from "./recipientSearch.js";

interface Call { url: string; headers: Record<string, string> }
let calls: Call[] = [];

function respond(users: unknown, groups: unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
    const target = String(url);
    calls.push({ url: decodeURIComponent(target), headers: init?.headers ?? {} });
    const body = target.includes("/groups") ? groups : users;
    if (body instanceof Error) {
      return { ok: false, status: Number(body.message) || 500, text: async () => "{}" };
    }
    return { ok: true, status: 200, json: async () => body };
  }));
}

const NONE = { value: [] };

beforeEach(() => {
  calls = [];
  vi.unstubAllGlobals();
});

describe("what the picker offers", () => {
  it("offers a person who can sign in as a user", async () => {
    respond({ value: [{ displayName: "Ali Bakar", mail: "ali@pmw.com", accountEnabled: true }] }, NONE);
    expect(await searchRecipients("tok", "ali")).toEqual([
      { email: "ali@pmw.com", name: "Ali Bakar", kind: "user" },
    ]);
  });

  it("marks a mailbox nobody can sign in as, so the builder can warn about it", async () => {
    respond({ value: [{ displayName: "Safety Inbox", mail: "safety@pmw.com", accountEnabled: false }] }, NONE);
    const [found] = await searchRecipients("tok", "safety");
    expect(found.kind).toBe("shared");
  });

  it("offers a distribution list, which the old picker filtered out entirely", async () => {
    respond(NONE, { value: [{ displayName: "OSHES Committee", mail: "oshes@pmw.com", mailEnabled: true }] });
    expect(await searchRecipients("tok", "oshes")).toEqual([
      { email: "oshes@pmw.com", name: "OSHES Committee", kind: "group" },
    ]);
  });

  it("leaves out a group that cannot receive mail", async () => {
    respond(NONE, { value: [{ displayName: "Security Only", mailEnabled: false }] });
    expect(await searchRecipients("tok", "security")).toEqual([]);
  });

  it("lists each address once even when it matches on both sides", async () => {
    respond(
      { value: [{ displayName: "Shared", mail: "dup@pmw.com", accountEnabled: true }] },
      { value: [{ displayName: "Shared", mail: "dup@pmw.com", mailEnabled: true }] },
    );
    expect(await searchRecipients("tok", "dup")).toHaveLength(1);
  });
});

describe("how it asks", () => {
  it("opts in to the advanced query that directory search requires", async () => {
    respond(NONE, NONE);
    await searchRecipients("tok", "team");
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.headers.ConsistencyLevel).toBe("eventual");
    }
  });

  it("will not dump the directory for a one-character query", async () => {
    respond(NONE, NONE);
    expect(await searchRecipients("tok", "a")).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("escapes a query that would otherwise break out of the search string", async () => {
    respond(NONE, NONE);
    await searchRecipients("tok", 'te"am');
    expect(calls[0].url).not.toContain('te"am');
  });

  it("still returns people when group search is refused", async () => {
    respond({ value: [{ displayName: "Ali", mail: "ali@pmw.com", accountEnabled: true }] }, new Error("403"));
    expect(await searchRecipients("tok", "ali")).toHaveLength(1);
  });
});

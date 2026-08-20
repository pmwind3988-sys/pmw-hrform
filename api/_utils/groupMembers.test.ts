/**
 * Distribution-list expansion, at the Graph-query level.
 *
 * The queries themselves are the thing worth pinning down here: the original
 * lookup OR-ed a `proxyAddresses/any(...)` lambda into the filter, which Graph
 * only accepts as an advanced query, so every list expansion failed with a 400
 * before it ever reached a member.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expandDistributionList } from "./groupMembers.js";

interface Call { url: string; headers: Record<string, string> }
let calls: Call[] = [];

function respond(handler: (url: string) => unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url: decodeURIComponent(String(url)), headers: init?.headers ?? {} });
    const body = handler(String(url));
    if (body instanceof Error) {
      const status = Number(body.message) || 500;
      return { ok: false, status, text: async () => `{"error":{"code":"x"}}` };
    }
    return { ok: true, status: 200, json: async () => body };
  }));
}

const GROUP = { value: [{ id: "grp-1", mail: "team@example.com" }] };
const NO_MATCH = { value: [] };

beforeEach(() => {
  calls = [];
  vi.unstubAllGlobals();
});

describe("finding the group", () => {
  it("asks with a plain mail filter that needs no advanced query support", async () => {
    respond((url) => url.includes("transitiveMembers") ? { value: [] } : GROUP);
    await expandDistributionList("tok", "team@example.com");

    expect(calls[0].url).toContain("$filter=mail eq 'team@example.com'");
    expect(calls[0].url).not.toContain("proxyAddresses");
    expect(calls[0].headers.ConsistencyLevel).toBeUndefined();
  });

  it("only tries the alias lookup when the mail filter misses, and asks for it properly", async () => {
    respond((url) => {
      if (url.includes("transitiveMembers")) return { value: [] };
      if (url.includes("proxyAddresses")) return GROUP;
      return NO_MATCH;
    });
    await expandDistributionList("tok", "alias@example.com");

    const alias = calls.find((call) => call.url.includes("proxyAddresses"));
    expect(alias).toBeDefined();
    expect(alias!.headers.ConsistencyLevel).toBe("eventual");
    expect(alias!.url).toContain("$count=true");
  });

  it("says which permission is missing when Graph refuses the lookup", async () => {
    respond(() => new Error("403"));
    await expect(expandDistributionList("tok", "team@example.com"))
      .rejects.toThrow(/Group\.Read\.All/);
  });

  it("names the address when the lookup fails for any other reason", async () => {
    respond(() => new Error("400"));
    await expect(expandDistributionList("tok", "team@example.com"))
      .rejects.toThrow(/team@example\.com/);
  });

  it("does not fail the whole expansion when only the alias lookup is unsupported", async () => {
    respond((url) => url.includes("proxyAddresses") ? new Error("400") : NO_MATCH);
    // A miss is a legitimate answer - the caller decides what to do about it.
    await expect(expandDistributionList("tok", "notagroup@example.com")).resolves.toEqual([]);
  });
});

describe("reading the members", () => {
  it("follows Graph's paging rather than stopping at the first page", async () => {
    respond((url) => {
      if (!url.includes("transitiveMembers")) return GROUP;
      return url.includes("skiptoken")
        ? { value: [{ mail: "second@example.com", accountEnabled: true }] }
        : {
            value: [{ mail: "first@example.com", accountEnabled: true }],
            "@odata.nextLink": "https://graph.microsoft.com/v1.0/groups/grp-1/transitiveMembers?$skiptoken=abc",
          };
    });
    expect(await expandDistributionList("tok", "team@example.com"))
      .toEqual(["first@example.com", "second@example.com"]);
  });

  it("leaves out members whose account is disabled", async () => {
    respond((url) => url.includes("transitiveMembers")
      ? { value: [
          { mail: "active@example.com", accountEnabled: true },
          { mail: "gone@example.com", accountEnabled: false },
        ] }
      : GROUP);
    expect(await expandDistributionList("tok", "team@example.com")).toEqual(["active@example.com"]);
  });
});

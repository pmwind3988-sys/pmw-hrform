import { describe, expect, it } from "vitest";
import { careerPortalAccessValue, parseCareerPortalAccessValue, readTokenTenantId } from "./careerPortalAccess";

function fakeJwt(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `header.${encoded}.signature`;
}

describe("readTokenTenantId", () => {
  it("reads the tid claim from a token payload", () => {
    expect(readTokenTenantId(fakeJwt({ tid: "abc-123", oid: "user" }))).toBe("abc-123");
  });

  it("handles base64url payloads containing - and _", () => {
    // A raw base64 decode would mangle these; the claim still has to come out intact.
    const payload = { tid: "11111111-2222-3333-4444-555555555555", name: "a?b>c~d" };
    expect(readTokenTenantId(fakeJwt(payload))).toBe(payload.tid);
  });

  it("returns empty for anything that is not a readable token", () => {
    expect(readTokenTenantId("")).toBe("");
    expect(readTokenTenantId("not-a-jwt")).toBe("");
    expect(readTokenTenantId("header..signature")).toBe("");
    expect(readTokenTenantId("header.{not-base64}.signature")).toBe("");
    expect(readTokenTenantId(fakeJwt({ oid: "user" }))).toBe("");
  });
});

describe("parseCareerPortalAccessValue", () => {
  it("treats the stored closed values as internal-only", () => {
    expect(parseCareerPortalAccessValue("internal")).toBe(false);
    expect(parseCareerPortalAccessValue("private")).toBe(false);
    expect(parseCareerPortalAccessValue("false")).toBe(false);
    expect(parseCareerPortalAccessValue(" INTERNAL ")).toBe(false);
  });

  it("treats the stored open value as public", () => {
    expect(parseCareerPortalAccessValue("public")).toBe(true);
    expect(parseCareerPortalAccessValue("Public")).toBe(true);
  });

  it("keeps the portal public for a blank or unrecognised value", () => {
    // Pre-dates the setting, or was written by something that did not know it.
    expect(parseCareerPortalAccessValue("")).toBe(true);
    expect(parseCareerPortalAccessValue(null)).toBe(true);
    expect(parseCareerPortalAccessValue(undefined)).toBe(true);
    expect(parseCareerPortalAccessValue("whatever")).toBe(true);
  });

  it("round-trips what it writes", () => {
    expect(parseCareerPortalAccessValue(careerPortalAccessValue(true))).toBe(true);
    expect(parseCareerPortalAccessValue(careerPortalAccessValue(false))).toBe(false);
  });
});

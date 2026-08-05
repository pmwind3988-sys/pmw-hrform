import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bumpGrantSerial,
  currentGrantSerial,
  grantExpiryFromTtl,
  isPublicGrantConfigured,
  issueLayerLinkToken,
  looksLikePublicGrant,
  mintPublicGrant,
  parseGrantSerials,
  PublicGrantSecretMissingError,
  verifyPublicGrant,
} from "./publicGrant.js";

const SECRET = "test-public-link-secret";

const target = { formTitle: "Leave Application", responseItemId: 42, layerNumber: 2 };

beforeEach(() => {
  process.env.PUBLIC_LINK_SECRET = SECRET;
  delete process.env.CRON_SECRET;
});

afterEach(() => {
  delete process.env.PUBLIC_LINK_SECRET;
  delete process.env.CRON_SECRET;
});

/** Swaps the payload of a token while leaving the signature untouched. */
function repayload(token: string, mutate: (payload: Record<string, unknown>) => void): string {
  const [version, encoded, signature] = token.split(".");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>;
  mutate(payload);
  const next = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${version}.${next}.${signature}`;
}

describe("mint/verify round trip", () => {
  it("returns exactly what was signed", () => {
    const token = mintPublicGrant({ ...target, serial: 3, linkTtlHours: 24 });
    const result = verifyPublicGrant(token);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.grant.formTitle).toBe("Leave Application");
    expect(result.grant.responseItemId).toBe(42);
    expect(result.grant.layerNumber).toBe(2);
    expect(result.grant.serial).toBe(3);
  });

  it("is recognisable as a grant before it is verified", () => {
    expect(looksLikePublicGrant(mintPublicGrant(target))).toBe(true);
    // The legacy form-wide token was a plain UUID.
    expect(looksLikePublicGrant("3f2b9e5c-1a44-4f0e-9c7d-2b8f6d1e0a33")).toBe(false);
    expect(looksLikePublicGrant("")).toBe(false);
  });
});

describe("tampering", () => {
  // This is the whole point of signing: the old scheme took the target
  // submission from an unsigned ?item= query param.
  it("rejects a token repointed at another submission", () => {
    const token = mintPublicGrant(target);
    const result = verifyPublicGrant(repayload(token, (payload) => { payload.i = 43; }));
    expect(result).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a token repointed at another layer", () => {
    const token = mintPublicGrant(target);
    const result = verifyPublicGrant(repayload(token, (payload) => { payload.l = 1; }));
    expect(result).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects an extended expiry", () => {
    const token = mintPublicGrant({ ...target, linkTtlHours: 1 });
    const result = verifyPublicGrant(repayload(token, (payload) => { payload.e = Number(payload.e) + 86_400; }));
    expect(result).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a token signed with a different secret", () => {
    const token = mintPublicGrant(target);
    process.env.PUBLIC_LINK_SECRET = "rotated-secret";
    expect(verifyPublicGrant(token)).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects anything that is not a grant", () => {
    for (const value of ["", "not-a-token", "v1.only-two-parts", null, 42]) {
      expect(verifyPublicGrant(value)).toEqual({ ok: false, reason: "malformed" });
    }
  });
});

describe("expiry", () => {
  it("accepts a link inside its window", () => {
    const now = new Date("2026-08-05T00:00:00Z");
    const token = mintPublicGrant({ ...target, linkTtlHours: 24, now });
    expect(verifyPublicGrant(token, new Date("2026-08-05T23:00:00Z")).ok).toBe(true);
  });

  it("rejects a link past its window", () => {
    const now = new Date("2026-08-05T00:00:00Z");
    const token = mintPublicGrant({ ...target, linkTtlHours: 24, now });
    expect(verifyPublicGrant(token, new Date("2026-08-06T00:00:01Z"))).toEqual({ ok: false, reason: "expired" });
  });

  it("clamps an out-of-range TTL rather than issuing a forever link", () => {
    const now = new Date("2026-08-05T00:00:00Z");
    expect(grantExpiryFromTtl(0, now).getTime()).toBe(grantExpiryFromTtl(168, now).getTime());
    expect(grantExpiryFromTtl(999_999, now).getTime()).toBe(grantExpiryFromTtl(8760, now).getTime());
  });
});

describe("signing secret", () => {
  it("falls back to CRON_SECRET but never to the browser-visible API key", () => {
    delete process.env.PUBLIC_LINK_SECRET;
    process.env.API_SECRET_KEY = "browser-visible";
    expect(isPublicGrantConfigured()).toBe(false);

    process.env.CRON_SECRET = "server-only";
    expect(isPublicGrantConfigured()).toBe(true);
    expect(verifyPublicGrant(mintPublicGrant(target)).ok).toBe(true);
    delete process.env.API_SECRET_KEY;
  });

  it("throws rather than minting an unsigned link", () => {
    delete process.env.PUBLIC_LINK_SECRET;
    expect(() => mintPublicGrant(target)).toThrow(PublicGrantSecretMissingError);
    expect(verifyPublicGrant("v1.abc.def")).toEqual({ ok: false, reason: "unconfigured" });
  });
});

describe("revocation serials", () => {
  it("treats a missing entry as serial 0, so nothing needs backfilling", () => {
    expect(currentGrantSerial(undefined, 2)).toBe(0);
    expect(currentGrantSerial("{}", 2)).toBe(0);
    expect(currentGrantSerial('{"3":5}', 2)).toBe(0);
  });

  it("reads a stored serial from either JSON text or a parsed object", () => {
    expect(currentGrantSerial('{"2":7}', 2)).toBe(7);
    expect(currentGrantSerial({ "2": 7 }, 2)).toBe(7);
  });

  it("ignores malformed entries instead of throwing", () => {
    expect(parseGrantSerials("not json")).toEqual({});
    expect(parseGrantSerials('{"2":"x","abc":1,"3":-1,"4":2}')).toEqual({ "4": 2 });
  });

  it("bumping one layer leaves the others alone", () => {
    const { serials, serial } = bumpGrantSerial('{"1":4,"2":0}', 2);
    expect(serial).toBe(1);
    expect(serials).toEqual({ "1": 4, "2": 1 });
  });
});

describe("issueLayerLinkToken", () => {
  it("returns nothing for a 365 layer, so the link stays the signed-in route", () => {
    expect(issueLayerLinkToken({ authMode: "365" }, target)).toBe("");
    expect(issueLayerLinkToken(undefined, target)).toBe("");
  });

  it("mints a grant carrying the layer's own TTL", () => {
    const now = new Date("2026-08-05T00:00:00Z");
    const token = issueLayerLinkToken(
      { authMode: "public", publicAccess: { linkTtlHours: 24 } },
      { ...target, now },
    );
    expect(verifyPublicGrant(token, new Date("2026-08-05T23:00:00Z")).ok).toBe(true);
    expect(verifyPublicGrant(token, new Date("2026-08-06T01:00:00Z")).ok).toBe(false);
  });

  // A deployment that has not set the secret should keep mailing the link it
  // used to mail, not a dead one.
  it("falls back to the legacy token when no secret is configured", () => {
    delete process.env.PUBLIC_LINK_SECRET;
    const layer = { authMode: "public", publicToken: "legacy-uuid" };
    expect(issueLayerLinkToken(layer, target)).toBe("legacy-uuid");
  });
});

import { beforeAll, describe, expect, it } from "vitest";

/**
 * The secret has to be in place before the module is imported — it is read once
 * at module scope, exactly as it is in a deployed function.
 */
process.env.INTERNAL_SESSION_SECRET = "a".repeat(48);

const {
  signGuestSession,
  verifyGuestSession,
  looksLikeGuestToken,
  guestSessionsEnabled,
} = await import("./guestSession.js");

const claims = { email: "someone@gmail.com", fullName: "Nurul Aisyah", tokenVersion: 3 };

describe("guest sessions", () => {
  beforeAll(() => {
    expect(guestSessionsEnabled()).toBe(true);
  });

  it("round-trips the claims it was given", () => {
    const { token, expiresAt } = signGuestSession(claims);
    const verified = verifyGuestSession(token);

    expect(verified?.email).toBe("someone@gmail.com");
    expect(verified?.fullName).toBe("Nurul Aisyah");
    expect(verified?.tokenVersion).toBe(3);
    expect(verified?.expiresAt).toBe(expiresAt);
  });

  it("carries its own prefix, so a portal token can never verify as a guest", () => {
    const { token } = signGuestSession(claims);
    expect(looksLikeGuestToken(token)).toBe(true);
    expect(token.startsWith("pmwg1.")).toBe(true);

    // A `pmwp1` token is what the deleted password system issued. One left in a
    // browser must fail at the door rather than resolve to a person.
    expect(verifyGuestSession(token.replace("pmwg1.", "pmwp1."))).toBeNull();
  });

  it("refuses a payload edited after signing", () => {
    const { token } = signGuestSession(claims);
    const [prefix, payload, signature] = token.split(".");

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    // The interesting forgery: claim to be somebody else while keeping a
    // signature that was genuinely issued.
    decoded.email = "ceo@pmwgroup.com";
    const forged = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");

    expect(verifyGuestSession(`${prefix}.${forged}.${signature}`)).toBeNull();
  });

  it("refuses a bumped token version being forged back down", () => {
    const { token } = signGuestSession(claims);
    const [prefix, payload, signature] = token.split(".");

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    decoded.tokenVersion = 1;
    const forged = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");

    expect(verifyGuestSession(`${prefix}.${forged}.${signature}`)).toBeNull();
  });

  it("refuses an expired token", () => {
    const { token } = signGuestSession(claims, -1);
    expect(verifyGuestSession(token)).toBeNull();
  });

  it("refuses malformed input without throwing", () => {
    expect(verifyGuestSession("")).toBeNull();
    expect(verifyGuestSession("pmwg1.only-two-parts")).toBeNull();
    expect(verifyGuestSession("pmwg1...")).toBeNull();
    expect(verifyGuestSession("pmwg1.!!!not-base64!!!.sig")).toBeNull();
  });
});

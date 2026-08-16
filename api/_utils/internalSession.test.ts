import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

// The module reads its secret once, at import time, so it has to be present
// before the import rather than inside a hook.
process.env.INTERNAL_SESSION_SECRET = "test-secret-that-is-long-enough-to-be-accepted";

const {
  signPortalSession,
  verifyPortalSession,
  looksLikePortalToken,
  portalSessionsEnabled,
} = await import("./internalSession.js");

const claims = { loginId: "trainee.ali", fullName: "Ali bin Ahmad", tokenVersion: 3 };

describe("portal session tokens", () => {
  it("is enabled once a long enough secret is configured", () => {
    expect(portalSessionsEnabled()).toBe(true);
  });

  it("round-trips the claims it was given", () => {
    const { token, expiresAt } = signPortalSession(claims);
    const verified = verifyPortalSession(token);

    expect(verified?.loginId).toBe("trainee.ali");
    expect(verified?.fullName).toBe("Ali bin Ahmad");
    expect(verified?.tokenVersion).toBe(3);
    expect(verified?.expiresAt).toBe(expiresAt);
  });

  it("is recognisable without verifying it, so an M365 token is not run through the wrong check", () => {
    const { token } = signPortalSession(claims);
    expect(looksLikePortalToken(token)).toBe(true);
    // A real Graph token is a JWT — three dot-separated parts, same as ours.
    expect(looksLikePortalToken("eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJ4In0.sig")).toBe(false);
  });

  it("refuses a payload edited after signing", () => {
    const { token } = signPortalSession(claims);
    const [prefix, , signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...claims, loginId: "admin", expiresAt: new Date(Date.now() + 60000).toISOString() }),
      "utf8",
    ).toString("base64url");

    expect(verifyPortalSession(`${prefix}.${forged}.${signature}`)).toBeNull();
  });

  it("refuses a token forged with the public frontend API key", () => {
    // The attack this design exists to stop. `VITE_API_SECRET_KEY` ships inside
    // the browser bundle, so an attacker has it; signing sessions with that
    // value would let them mint a token for any login ID they like. Here they
    // build a correctly-shaped token with a correctly-computed HMAC — and it
    // still does not verify, because the signing secret is a different, private
    // one.
    const publicApiKey = "the-value-shipped-in-the-frontend-bundle";
    const payload = Buffer.from(
      JSON.stringify({
        loginId: "attacker",
        fullName: "Attacker",
        tokenVersion: 1,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      }),
      "utf8",
    ).toString("base64url");
    const forgedSignature = createHmac("sha256", publicApiKey).update(`pmwp1.${payload}`).digest("base64url");

    expect(verifyPortalSession(`pmwp1.${payload}.${forgedSignature}`)).toBeNull();
  });

  it("refuses a token whose version was edited to survive a password reset", () => {
    const { token } = signPortalSession(claims);
    const [prefix, payload, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    const bumped = Buffer.from(JSON.stringify({ ...decoded, tokenVersion: 99 }), "utf8").toString("base64url");

    expect(verifyPortalSession(`${prefix}.${bumped}.${signature}`)).toBeNull();
  });

  it("refuses an expired token", () => {
    const { token } = signPortalSession(claims, -1);
    expect(verifyPortalSession(token)).toBeNull();
  });

  it("refuses malformed input without throwing", () => {
    expect(verifyPortalSession("")).toBeNull();
    expect(verifyPortalSession("pmwp1.only-two-parts")).toBeNull();
    expect(verifyPortalSession("pmwp1...")).toBeNull();
    expect(verifyPortalSession("pmwp1.!!!not-base64!!!.sig")).toBeNull();
  });
});

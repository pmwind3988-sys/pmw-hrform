import { generateKeyPairSync, createSign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Verification of a Google identity token, exercised against a key pair
 * generated here — so the tests prove the checks, not Google's uptime.
 *
 * Every one of these is a way a *validly signed* token can still be the wrong
 * token to accept. A signature check on its own would pass most of them.
 */

const CLIENT_ID = "1234567890-pmwhrform.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_ID = CLIENT_ID;

const { verifyGoogleIdToken, forgetGoogleKeys, googleSignInEnabled } = await import(
  "./googleIdentity.js"
);

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" }) as { n: string; e: string };
const KID = "test-key-1";

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function makeToken(
  payloadOverrides: Record<string, unknown> = {},
  headerOverrides: Record<string, unknown> = {},
  sign = true,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", kid: KID, typ: "JWT", ...headerOverrides };
  const payload = {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    email: "Someone@Gmail.com",
    email_verified: true,
    name: "Nurul Aisyah",
    iat: now,
    exp: now + 3600,
    ...payloadOverrides,
  };

  const signingInput = `${base64Url(header)}.${base64Url(payload)}`;
  const signature = sign
    ? createSign("RSA-SHA256").update(signingInput).sign(privateKey).toString("base64url")
    : Buffer.from("not-a-real-signature", "utf8").toString("base64url");

  return `${signingInput}.${signature}`;
}

beforeEach(() => {
  forgetGoogleKeys();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "cache-control": "max-age=3600" }),
      json: async () => ({ keys: [{ kid: KID, kty: "RSA", alg: "RS256", use: "sig", ...jwk }] }),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Google identity tokens", () => {
  it("is configured in this test run", () => {
    expect(googleSignInEnabled()).toBe(true);
  });

  it("accepts a properly signed token and lowercases the address", async () => {
    const identity = await verifyGoogleIdToken(makeToken());
    // Lowercased so `Someone@` and `someone@` cannot become two member records
    // for one person.
    expect(identity).toEqual({ email: "someone@gmail.com", name: "Nurul Aisyah" });
  });

  it("accepts the bare issuer spelling Google also uses", async () => {
    const identity = await verifyGoogleIdToken(makeToken({ iss: "accounts.google.com" }));
    expect(identity?.email).toBe("someone@gmail.com");
  });

  it("refuses a token issued for a different application", async () => {
    // The important one. This token is genuinely signed by Google — it just
    // belongs to somebody else's app, whose operator could otherwise hand us
    // their users' tokens and sign them in here.
    const identity = await verifyGoogleIdToken(makeToken({ aud: "someone-elses-app.apps.googleusercontent.com" }));
    expect(identity).toBeNull();
  });

  it("refuses a token from the wrong issuer", async () => {
    expect(await verifyGoogleIdToken(makeToken({ iss: "https://accounts.example.com" }))).toBeNull();
  });

  it("refuses an unverified address", async () => {
    // Google says the holder typed this address, not that they can read mail
    // sent to it. Accepting one would let somebody register under a colleague's
    // address and appear in the access log as them.
    expect(await verifyGoogleIdToken(makeToken({ email_verified: false }))).toBeNull();
  });

  it("refuses a token with no address at all", async () => {
    expect(await verifyGoogleIdToken(makeToken({ email: "" }))).toBeNull();
  });

  it("refuses an expired token", async () => {
    const past = Math.floor(Date.now() / 1000) - 7200;
    expect(await verifyGoogleIdToken(makeToken({ iat: past, exp: past + 3600 }))).toBeNull();
  });

  it("refuses a token issued in the future beyond the clock-skew allowance", async () => {
    const ahead = Math.floor(Date.now() / 1000) + 600;
    expect(await verifyGoogleIdToken(makeToken({ iat: ahead, exp: ahead + 3600 }))).toBeNull();
  });

  it("refuses a bad signature", async () => {
    expect(await verifyGoogleIdToken(makeToken({}, {}, false))).toBeNull();
  });

  it("refuses a payload edited after signing", async () => {
    const token = makeToken();
    const [header, payload, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    decoded.email = "ceo@pmwgroup.com";
    const forged = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");

    expect(await verifyGoogleIdToken(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it("refuses an algorithm other than RS256", async () => {
    // "alg: none" and HMAC-with-the-public-key are the classic JWT forgeries.
    // The algorithm is ours to fix, never the token's to nominate.
    expect(await verifyGoogleIdToken(makeToken({}, { alg: "none" }))).toBeNull();
    expect(await verifyGoogleIdToken(makeToken({}, { alg: "HS256" }))).toBeNull();
  });

  it("refuses a token signed by a key Google does not publish", async () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url({ alg: "RS256", kid: KID, typ: "JWT" });
    const payload = base64Url({
      iss: "https://accounts.google.com",
      aud: CLIENT_ID,
      email: "someone@gmail.com",
      email_verified: true,
      iat: now,
      exp: now + 3600,
    });
    const signature = createSign("RSA-SHA256")
      .update(`${header}.${payload}`)
      .sign(other.privateKey)
      .toString("base64url");

    expect(await verifyGoogleIdToken(`${header}.${payload}.${signature}`)).toBeNull();
  });

  it("refuses malformed input without throwing", async () => {
    expect(await verifyGoogleIdToken("")).toBeNull();
    expect(await verifyGoogleIdToken("only.two")).toBeNull();
    expect(await verifyGoogleIdToken("...")).toBeNull();
    expect(await verifyGoogleIdToken("!!!.!!!.!!!")).toBeNull();
  });

  it("caches Google's keys instead of fetching them per sign-in", async () => {
    await verifyGoogleIdToken(makeToken());
    await verifyGoogleIdToken(makeToken());
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("answers null rather than throwing when Google's keys cannot be fetched", async () => {
    forgetGoogleKeys();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, headers: new Headers(), json: async () => ({}) })),
    );
    expect(await verifyGoogleIdToken(makeToken())).toBeNull();
  });
});

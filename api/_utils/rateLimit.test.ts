import { beforeEach, describe, expect, it } from "vitest";

import { checkRateLimit, clientIp, resetRateLimits } from "./rateLimit.js";

const RULE = { limit: 3, windowMs: 60_000 };

beforeEach(() => {
  resetRateLimits();
});

describe("checkRateLimit", () => {
  it("allows requests up to the limit and refuses the one after", () => {
    const now = 1_000_000;
    expect(checkRateLimit("a", RULE, now).allowed).toBe(true);
    expect(checkRateLimit("a", RULE, now).allowed).toBe(true);
    expect(checkRateLimit("a", RULE, now).allowed).toBe(true);
    expect(checkRateLimit("a", RULE, now).allowed).toBe(false);
  });

  it("counts each key separately, so one caller cannot exhaust another's budget", () => {
    const now = 1_000_000;
    for (let i = 0; i < RULE.limit; i += 1) checkRateLimit("a", RULE, now);
    expect(checkRateLimit("a", RULE, now).allowed).toBe(false);
    expect(checkRateLimit("b", RULE, now).allowed).toBe(true);
  });

  it("lets a caller through again once the window has slid past their hits", () => {
    const now = 1_000_000;
    for (let i = 0; i < RULE.limit; i += 1) checkRateLimit("a", RULE, now);
    expect(checkRateLimit("a", RULE, now + RULE.windowMs - 1).allowed).toBe(false);
    expect(checkRateLimit("a", RULE, now + RULE.windowMs).allowed).toBe(true);
  });

  it("reports how long to wait for the oldest hit to fall out of the window", () => {
    const now = 1_000_000;
    for (let i = 0; i < RULE.limit; i += 1) checkRateLimit("a", RULE, now);
    // 20s into a 60s window, the first hit expires in 40s.
    expect(checkRateLimit("a", RULE, now + 20_000).retryAfterSeconds).toBe(40);
  });

  it("never reports a retry of zero seconds on a refusal, which would invite an instant retry", () => {
    const now = 1_000_000;
    for (let i = 0; i < RULE.limit; i += 1) checkRateLimit("a", RULE, now);
    expect(checkRateLimit("a", RULE, now + RULE.windowMs - 1).retryAfterSeconds).toBe(1);
  });

  it("refuses a burst spread over the window rather than only an instantaneous one", () => {
    const start = 1_000_000;
    expect(checkRateLimit("a", RULE, start).allowed).toBe(true);
    expect(checkRateLimit("a", RULE, start + 20_000).allowed).toBe(true);
    expect(checkRateLimit("a", RULE, start + 40_000).allowed).toBe(true);
    expect(checkRateLimit("a", RULE, start + 50_000).allowed).toBe(false);
  });
});

describe("clientIp", () => {
  it("takes the original client from the front of the forwarded chain", () => {
    expect(clientIp({ "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2" })).toBe("203.0.113.9");
  });

  it("reads the header whatever case it arrives in, and as an array", () => {
    expect(clientIp({ "X-Forwarded-For": "203.0.113.9" })).toBe("203.0.113.9");
    expect(clientIp({ "x-forwarded-for": ["203.0.113.9"] })).toBe("203.0.113.9");
  });

  it("puts callers with no readable address into one shared bucket", () => {
    expect(clientIp({})).toBe("unknown");
    expect(clientIp({ "x-forwarded-for": "" })).toBe("unknown");
  });
});

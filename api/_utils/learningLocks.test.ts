import { beforeAll, describe, expect, it } from "vitest";
import {
  ancestorsUnlocked,
  buildLockIndex,
  hashLockPassword,
  lockCooldownSeconds,
  lockKey,
  materialLock,
  noteLockFailure,
  noteLockSuccess,
  readSatisfiedLocks,
  signLockPass,
  topicOwnLock,
  topicUnlocked,
  validateLockPassword,
  verifyLockPassword,
  MIN_LOCK_PASSWORD_LENGTH,
  TOPIC_PASS_TTL_SECONDS,
  type EffectiveLock,
} from "./learningLocks.js";

beforeAll(() => {
  // `passSecret()` reads this at call time. A deployment without it issues no
  // passes at all, which is asserted at the bottom of this file.
  process.env.INTERNAL_SESSION_SECRET = "test-secret-that-is-long-enough-to-sign-with";
});

/** Stand-in hashes — `readSatisfiedLocks` only ever fingerprints these. */
const index = buildLockIndex({
  materials: { "file-secret": { passwordHash: "scrypt$hash$for$one$material$x" } },
  topics: {
    Confidential: { passwordHash: "scrypt$hash$for$the$topic$y" },
    "Confidential/Board": { passwordHash: "scrypt$hash$for$the$subtopic$z" },
    Open: {},
  },
});

const VIEWER = "abc123viewer";

function pass(lock: EffectiveLock, viewer = VIEWER, ttl = TOPIC_PASS_TTL_SECONDS): string {
  return signLockPass(lock, viewer, ttl).pass;
}

describe("which lock guards a material", () => {
  it("prefers the material's own password over the topic holding it", () => {
    const lock = materialLock(index, "file-secret", "Confidential");
    expect(lock).toEqual({ scope: "material", target: "file-secret", hash: expect.any(String) });
  });

  it("falls back to the nearest locked folder above it", () => {
    // Nobody is ever asked for two passwords: the deepest lock on the path wins.
    expect(materialLock(index, "file-plain", "Confidential/Board")).toMatchObject({
      scope: "topic",
      target: "Confidential/Board",
    });
    expect(materialLock(index, "file-plain", "Confidential/Minutes")).toMatchObject({
      scope: "topic",
      target: "Confidential",
    });
  });

  it("leaves a material outside any locked folder open", () => {
    expect(materialLock(index, "file-plain", "Open")).toBeNull();
    expect(materialLock(index, "file-plain", "")).toBeNull();
  });
});

describe("what a caller may see", () => {
  const satisfied = new Set([lockKey("topic", "Confidential")]);

  it("hides a folder's contents until its own password is given", () => {
    expect(topicUnlocked(index, "Confidential", new Set())).toBe(false);
    expect(topicUnlocked(index, "Confidential", satisfied)).toBe(true);
  });

  it("keeps a nested lock shut even once its parent is open", () => {
    expect(topicUnlocked(index, "Confidential/Board", satisfied)).toBe(false);
  });

  it("still lists a locked folder itself, so it can be unlocked", () => {
    // Its ancestors are what decide whether it appears at all; its own lock
    // decides only whether the inside is sent.
    expect(ancestorsUnlocked(index, "Confidential", new Set())).toBe(true);
    expect(ancestorsUnlocked(index, "Confidential/Board", new Set())).toBe(false);
    expect(ancestorsUnlocked(index, "Confidential/Board", satisfied)).toBe(true);
  });

  it("leaves an unlocked topic alone", () => {
    expect(topicOwnLock(index, "Open")).toBeNull();
    expect(topicUnlocked(index, "Open", new Set())).toBe(true);
  });
});

describe("unlock passes", () => {
  const topicLock = topicOwnLock(index, "Confidential") as EffectiveLock;

  it("round-trips the lock it was issued for", () => {
    const satisfied = readSatisfiedLocks([pass(topicLock)], VIEWER, index);
    expect(satisfied.has(lockKey("topic", "Confidential"))).toBe(true);
    // And only that one — a pass for one folder is not a pass for its children.
    expect(satisfied.has(lockKey("topic", "Confidential/Board"))).toBe(false);
  });

  it("is bound to the viewer it was issued to", () => {
    const satisfied = readSatisfiedLocks([pass(topicLock, "someone-else")], VIEWER, index);
    expect(satisfied.size).toBe(0);
  });

  it("stops working the moment the password is changed", () => {
    const issued = pass(topicLock);
    const rotated = buildLockIndex({
      materials: {},
      topics: { Confidential: { passwordHash: "scrypt$a$different$hash$entirely" } },
    });
    expect(readSatisfiedLocks([issued], VIEWER, rotated).size).toBe(0);
  });

  it("stops working the moment the password is removed", () => {
    const issued = pass(topicLock);
    expect(readSatisfiedLocks([issued], VIEWER, buildLockIndex({ materials: {}, topics: {} })).size).toBe(0);
  });

  it("refuses an expired pass", () => {
    expect(readSatisfiedLocks([pass(topicLock, VIEWER, -1)], VIEWER, index).size).toBe(0);
  });

  it("refuses a pass whose payload has been edited", () => {
    const [prefix, payload, signature] = pass(topicLock).split(".");
    const forged = Buffer.from(
      JSON.stringify({ s: "topic", t: "Confidential/Board", v: VIEWER, k: "x", x: Date.now() + 60_000 }),
      "utf8",
    ).toString("base64url");

    expect(readSatisfiedLocks([`${prefix}.${forged}.${signature}`], VIEWER, index).size).toBe(0);
    // And the original payload with somebody else's signature is no better.
    expect(readSatisfiedLocks([`${prefix}.${payload}.notthesignature`], VIEWER, index).size).toBe(0);
  });

  it("ignores junk instead of failing the request it arrived on", () => {
    expect(readSatisfiedLocks(["", "nonsense", "pmwl1.only.two"], VIEWER, index).size).toBe(0);
    expect(readSatisfiedLocks(null, VIEWER, index).size).toBe(0);
    expect(readSatisfiedLocks("not-an-array", VIEWER, index).size).toBe(0);
  });
});

describe("password rules", () => {
  it("takes a password of a usable length", () => {
    expect(validateLockPassword("Fire-Drill-2026")).toBe("Fire-Drill-2026");
  });

  it("refuses one too short or too repetitive to be worth checking", () => {
    expect(() => validateLockPassword("short")).toThrow(new RegExp(String(MIN_LOCK_PASSWORD_LENGTH)));
    expect(() => validateLockPassword("aaaaaaaaaaaa")).toThrow(/repetitive/i);
  });

  it("hashes one way, and verifies against the hash", async () => {
    const stored = await hashLockPassword("Fire-Drill-2026");
    expect(stored).not.toContain("Fire-Drill-2026");
    expect(await verifyLockPassword("Fire-Drill-2026", stored)).toBe(true);
    expect(await verifyLockPassword("Fire-Drill-2025", stored)).toBe(false);
  });
});

describe("guess throttling", () => {
  const lock: EffectiveLock = { scope: "topic", target: "Throttled", hash: "scrypt$throttle$test" };

  it("waits a caller out after a run of wrong passwords, then lets them back in", () => {
    const viewer = "throttle-viewer";
    expect(lockCooldownSeconds(viewer, lock)).toBe(0);

    for (let attempt = 0; attempt < 4; attempt += 1) noteLockFailure(viewer, lock);
    // Still trying: four misses is a person mistyping, not an attack.
    expect(lockCooldownSeconds(viewer, lock)).toBe(0);

    noteLockFailure(viewer, lock);
    expect(lockCooldownSeconds(viewer, lock)).toBeGreaterThan(0);

    // The cooldown is per caller and per lock — one person guessing must never
    // shut a shared password out for the department it was handed to.
    expect(lockCooldownSeconds("another-viewer", lock)).toBe(0);
    expect(lockCooldownSeconds(viewer, { ...lock, target: "Elsewhere" })).toBe(0);
  });

  it("forgets the count once the right password lands", () => {
    const viewer = "recovering-viewer";
    noteLockFailure(viewer, lock);
    noteLockFailure(viewer, lock);
    noteLockSuccess(viewer, lock);

    for (let attempt = 0; attempt < 4; attempt += 1) noteLockFailure(viewer, lock);
    expect(lockCooldownSeconds(viewer, lock)).toBe(0);
  });
});

describe("with no signing secret configured", () => {
  it("issues nothing rather than signing with something guessable", () => {
    const session = process.env.INTERNAL_SESSION_SECRET;
    const client = process.env.SYSTEM_CLIENT_SECRET;
    delete process.env.INTERNAL_SESSION_SECRET;
    delete process.env.SYSTEM_CLIENT_SECRET;

    try {
      expect(() => signLockPass(topicOwnLock(index, "Confidential") as EffectiveLock, VIEWER, 60)).toThrow();
      expect(readSatisfiedLocks(["pmwl1.anything.atall"], VIEWER, index).size).toBe(0);
    } finally {
      if (session) process.env.INTERNAL_SESSION_SECRET = session;
      if (client) process.env.SYSTEM_CLIENT_SECRET = client;
    }
  });
});

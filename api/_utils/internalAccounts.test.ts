import { describe, expect, it } from "vitest";
import {
  hashPassword,
  isLockedOut,
  minutesUntilUnlock,
  nextFailureState,
  normalizeLoginId,
  validateFullName,
  validateLoginId,
  validatePassword,
  verifyPassword,
  LOCKOUT_MINUTES,
  MAX_FAILED_ATTEMPTS,
} from "./internalAccounts.js";

describe("password hashing", () => {
  it("accepts the password it stored", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse batteru", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("never stores the password itself", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored).not.toContain("correct");
    expect(stored.startsWith("scrypt$")).toBe(true);
  });

  it("salts, so two people sharing a password do not share a hash", async () => {
    const [first, second] = await Promise.all([hashPassword("same-password"), hashPassword("same-password")]);
    expect(first).not.toBe(second);
    // Both still verify — the difference is the salt, not the password.
    expect(await verifyPassword("same-password", first)).toBe(true);
    expect(await verifyPassword("same-password", second)).toBe(true);
  });

  it("carries its own parameters, so they can be raised later without a migration", async () => {
    const stored = await hashPassword("correct horse battery");
    const [scheme, N, r, p] = stored.split("$");
    expect(scheme).toBe("scrypt");
    expect(Number(N)).toBeGreaterThanOrEqual(16384);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
  });

  it("rejects a malformed stored value instead of throwing", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "plaintext-password")).toBe(false);
    expect(await verifyPassword("anything", "bcrypt$1$2$3$4$5")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$notanumber$8$1$c2FsdA==$aGFzaA==")).toBe(false);
  });
});

describe("login IDs", () => {
  it("folds case and strips what an OData filter could not survive", () => {
    expect(normalizeLoginId("  Trainee.Ali  ")).toBe("trainee.ali");
    expect(normalizeLoginId("ali'; DROP")).toBe("alidrop");
    expect(normalizeLoginId("ali@pmw.com")).toBe("alipmw.com");
  });

  it("refuses one too short to be deliberate", () => {
    expect(() => validateLoginId("ab")).toThrow(/3-64/);
    expect(() => validateLoginId("")).toThrow();
  });

  it("accepts an ordinary issued ID", () => {
    expect(validateLoginId("Contractor_Lim-01")).toBe("contractor_lim-01");
  });
});

describe("password rules", () => {
  it("requires real length", () => {
    expect(() => validatePassword("short")).toThrow(/at least 10/);
  });

  it("refuses a long but repetitive password", () => {
    expect(() => validatePassword("aaaaaaaaaaaaaaa")).toThrow(/repetitive/);
  });

  it("accepts an ordinary issued password", () => {
    expect(validatePassword("Induction-2026!")).toBe("Induction-2026!");
  });
});

describe("full names", () => {
  it("collapses stray whitespace", () => {
    expect(validateFullName("  Ali   bin  Ahmad ")).toBe("Ali bin Ahmad");
  });

  it("refuses an empty one", () => {
    expect(() => validateFullName(" ")).toThrow(/2-120/);
  });
});

describe("lockout", () => {
  const now = new Date("2026-08-16T09:00:00.000Z");

  it("counts misses without locking until the limit", () => {
    let state = { failedAttempts: 0, lockedUntil: "" };
    for (let attempt = 1; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
      state = nextFailureState(state, now);
      expect(state.failedAttempts).toBe(attempt);
      expect(isLockedOut(state, now)).toBe(false);
    }
  });

  it("locks on the last miss and reports how long is left", () => {
    let state = { failedAttempts: MAX_FAILED_ATTEMPTS - 1, lockedUntil: "" };
    state = nextFailureState(state, now);

    expect(isLockedOut(state, now)).toBe(true);
    expect(minutesUntilUnlock(state, now)).toBe(LOCKOUT_MINUTES);
  });

  it("hands back a full set of tries once the lockout expires", () => {
    const state = nextFailureState({ failedAttempts: MAX_FAILED_ATTEMPTS - 1, lockedUntil: "" }, now);
    const later = new Date(now.getTime() + (LOCKOUT_MINUTES + 1) * 60_000);

    expect(isLockedOut(state, later)).toBe(false);
    expect(minutesUntilUnlock(state, later)).toBe(0);
    // The counter was cleared alongside the lock, so the next miss starts at 1
    // rather than locking again immediately.
    expect(nextFailureState(state, later).failedAttempts).toBe(1);
  });

  it("treats an unparseable lock timestamp as not locked", () => {
    expect(isLockedOut({ failedAttempts: 0, lockedUntil: "not a date" }, now)).toBe(false);
  });
});

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Scrypt password hashing, shared by everything in this codebase that stores a
 * password.
 *
 * These functions used to live in `internalAccounts.ts` alongside the HR-issued
 * portal accounts. Those accounts are gone — guest members sign in with Google
 * and this application never sees a password for them — but the learning hub's
 * topic and material locks still hold one, so the hashing itself outlived the
 * feature it was written for and moved here.
 */

/**
 * N=16384 costs about 128 * N * r = 16 MB and ~50-100ms per hash — heavy enough
 * to make offline guessing expensive, light enough that a serverless request
 * still answers promptly. The parameters travel inside the stored string so a
 * future increase can re-hash on next use without a migration.
 */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  try {
    const expected = Buffer.from(rawHash, "base64");
    const derived = await scrypt(password, Buffer.from(rawSalt, "base64"), expected.length, {
      N,
      r,
      p,
      maxmem: SCRYPT_MAXMEM,
    });
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

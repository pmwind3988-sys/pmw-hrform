/**
 * validateUserToken.ts — Validates Azure AD access tokens using JWKS
 *
 * Extracts user identity (oid, email) from a valid MSAL access token
 * without requiring on-behalf-of (OBO) flow. Uses Node.js built-in crypto.
 */

import crypto from "node:crypto";

const TENANT_ID =
  process.env.VITE_AZURE_TENANT_ID || process.env.AZURE_TENANT_ID || "";

const JWKS_CACHE_TTL = 86_400_000; // 24 hours
let jwksCache: { keys: Record<string, crypto.KeyObject>; fetchedAt: number } | null = null;

export interface ValidatedUser {
  oid: string;
  email: string;
  name: string;
  preferredUsername: string;
}

// ── JWKS fetching & caching ────────────────────────────────────────────

async function fetchJwks(): Promise<Record<string, crypto.KeyObject>> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL) {
    return jwksCache.keys;
  }

  const url = `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);

  const body = (await res.json()) as { keys: Array<{ kid: string; kty: string; n: string; e: string }> };
  const keys: Record<string, crypto.KeyObject> = {};

  for (const jwk of body.keys) {
    if (jwk.kty === "RSA") {
      keys[jwk.kid] = crypto.createPublicKey({ format: "jwk", key: jwk });
    }
  }

  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

// ── JWT helpers ────────────────────────────────────────────────────────

function base64UrlDecode(str: string): string {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function base64UrlToBuffer(str: string): Buffer {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

// ── Main validation ────────────────────────────────────────────────────

export interface TokenValidationResult {
  valid: boolean;
  user?: ValidatedUser;
  error?: string;
}

export async function validateAccessToken(token: string): Promise<TokenValidationResult> {
  if (!TENANT_ID) {
    return { valid: false, error: "AZURE_TENANT_ID not configured" };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "Malformed token" };
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // 1. Decode header to get key ID
  let header: { kid?: string; alg?: string };
  try {
    header = JSON.parse(base64UrlDecode(headerB64));
  } catch {
    return { valid: false, error: "Invalid token header" };
  }

  if (header.alg !== "RS256") {
    return { valid: false, error: `Unsupported algorithm: ${header.alg}` };
  }

  // 2. Fetch JWKS and find the signing key
  const keys = await fetchJwks();
  const kid = header.kid;
  if (!kid || !keys[kid]) {
    return { valid: false, error: "Signing key not found" };
  }
  const publicKey = keys[kid];

  // 3. Verify signature
  const data = `${headerB64}.${payloadB64}`;
  const signature = base64UrlToBuffer(signatureB64);

  const verify = crypto.createVerify("RSA-SHA256");
  verify.update(data);
  if (!verify.verify(publicKey, signature)) {
    return { valid: false, error: "Invalid token signature" };
  }

  // 4. Decode & validate payload claims
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    return { valid: false, error: "Invalid token payload" };
  }

  // 5. Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && typeof payload.exp === "number" && payload.exp < now) {
    return { valid: false, error: "Token expired" };
  }

  // 6. Check issuer
  const expectedIssuer = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
  if (payload.iss !== expectedIssuer) {
    return { valid: false, error: `Invalid issuer: ${payload.iss}` };
  }

  // 7. Extract user claims
  const oid = String(payload.oid || payload.sub || "");
  const email = String(payload.email || payload.preferred_username || "");
  const name = String(payload.name || email || "Unknown");
  const preferredUsername = String(payload.preferred_username || email || "");

  if (!oid) {
    return { valid: false, error: "Token missing user identity (oid)" };
  }

  return {
    valid: true,
    user: { oid, email, name, preferredUsername },
  };
}

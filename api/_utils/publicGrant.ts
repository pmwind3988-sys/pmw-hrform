/**
 * Signed per-submission grants for public workflow layers.
 *
 * The old model put one `publicToken` UUID on the layer in the form's
 * `LayerConfig`: every submission of that form shared it, the target submission
 * came from an unsigned `?item=` query param, and the whole config (token
 * included) was served to anonymous callers by `/api/form-config`. Anyone with
 * one link could action anybody else's submission.
 *
 * A grant instead binds the link to one submission, one layer and one expiry,
 * and signs the lot:
 *
 *     v1.<base64url(payload)>.<base64url(HMAC-SHA256(payload, secret))>
 *
 * Because the item and layer live *inside* the signature, `?item=` stops being
 * trusted — editing it, the layer, or the expiry invalidates the token.
 *
 * `serial` is the revocation handle. It is compared against the per-item
 * `WorkflowGrantSerials` column; bumping that number kills every outstanding
 * link for the layer without touching the form config.
 *
 * Single use needs no state here: `api/evaluate.ts` already refuses a layer
 * whose status is terminal or whose submission has moved on, which is exactly
 * "the link dies once a decision is submitted".
 *
 * Signed with `PUBLIC_LINK_SECRET`, falling back to the server-only
 * `CRON_SECRET`. Never `API_SECRET_KEY` — its `VITE_` twin ships in the browser
 * bundle, so signing with it would let anyone mint their own grants. Rotating
 * the secret invalidates every link already in an inbox.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import {
  DEFAULT_PUBLIC_LINK_TTL_HOURS,
  MAX_PUBLIC_LINK_TTL_HOURS,
  MIN_PUBLIC_LINK_TTL_HOURS,
  normalizePublicAccessConfig,
} from "./publicIdentity.js";

const GRANT_VERSION = "v1";
const GRANT_RE = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export interface PublicGrantPayload {
  /** Form title — the response list is `${formTitle} Responses`. */
  f: string;
  /** Response item id. */
  i: number;
  /** Layer number. */
  l: number;
  /** Revocation serial, matched against `WorkflowGrantSerials`. */
  s: number;
  /** Expiry, epoch seconds. */
  e: number;
}

export interface PublicGrant {
  formTitle: string;
  responseItemId: number;
  layerNumber: number;
  serial: number;
  expiresAt: Date;
}

export type PublicGrantFailure = "malformed" | "bad-signature" | "expired" | "unconfigured";

export type PublicGrantVerification =
  | { ok: true; grant: PublicGrant }
  | { ok: false; reason: PublicGrantFailure };

export class PublicGrantSecretMissingError extends Error {
  constructor() {
    super("No PUBLIC_LINK_SECRET (or CRON_SECRET) configured — public workflow links cannot be signed.");
    this.name = "PublicGrantSecretMissingError";
  }
}

function grantSecret(): string {
  return (process.env.PUBLIC_LINK_SECRET || process.env.CRON_SECRET || "").trim();
}

export function isPublicGrantConfigured(): boolean {
  return grantSecret().length > 0;
}

/** True for anything shaped like a signed grant, verified or not. */
export function looksLikePublicGrant(token: unknown): boolean {
  return typeof token === "string" && GRANT_RE.test(token.trim());
}

function base64UrlEncode(value: Buffer): string {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64");
}

function sign(encodedPayload: string, secret: string): string {
  return base64UrlEncode(createHmac("sha256", secret).update(encodedPayload).digest());
}

/** Clamps a configured TTL into the supported range. */
export function grantExpiryFromTtl(linkTtlHours: number | undefined, now = new Date()): Date {
  const hours = Number.isFinite(linkTtlHours) && Number(linkTtlHours) > 0
    ? Math.min(Math.max(Math.round(Number(linkTtlHours)), MIN_PUBLIC_LINK_TTL_HOURS), MAX_PUBLIC_LINK_TTL_HOURS)
    : DEFAULT_PUBLIC_LINK_TTL_HOURS;
  return new Date(now.getTime() + hours * 3600_000);
}

export interface MintPublicGrantParams {
  formTitle: string;
  responseItemId: number | string;
  layerNumber: number;
  serial?: number;
  /** Falls back to the default TTL when omitted. */
  linkTtlHours?: number;
  now?: Date;
}

/** @throws PublicGrantSecretMissingError when no signing secret is configured. */
export function mintPublicGrant(params: MintPublicGrantParams): string {
  const secret = grantSecret();
  if (!secret) throw new PublicGrantSecretMissingError();

  const payload: PublicGrantPayload = {
    f: params.formTitle,
    i: Number(params.responseItemId),
    l: Number(params.layerNumber),
    s: Number(params.serial) || 0,
    e: Math.floor(grantExpiryFromTtl(params.linkTtlHours, params.now).getTime() / 1000),
  };
  const encoded = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${GRANT_VERSION}.${encoded}.${sign(encoded, secret)}`;
}

function signaturesMatch(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  // timingSafeEqual throws on a length mismatch, which is itself a mismatch.
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyPublicGrant(token: unknown, now = new Date()): PublicGrantVerification {
  const raw = typeof token === "string" ? token.trim() : "";
  if (!GRANT_RE.test(raw)) return { ok: false, reason: "malformed" };

  const secret = grantSecret();
  if (!secret) return { ok: false, reason: "unconfigured" };

  const [, encoded, signature] = raw.split(".");
  if (!signaturesMatch(sign(encoded, secret), signature)) {
    return { ok: false, reason: "bad-signature" };
  }

  let payload: PublicGrantPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encoded).toString("utf8")) as PublicGrantPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const formTitle = typeof payload.f === "string" ? payload.f.trim() : "";
  const responseItemId = Number(payload.i);
  const layerNumber = Number(payload.l);
  const expiresAt = new Date(Number(payload.e) * 1000);
  if (!formTitle || !Number.isInteger(responseItemId) || responseItemId < 1
      || !Number.isInteger(layerNumber) || layerNumber < 1
      || Number.isNaN(expiresAt.getTime())) {
    return { ok: false, reason: "malformed" };
  }
  if (expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };

  return {
    ok: true,
    grant: { formTitle, responseItemId, layerNumber, serial: Number(payload.s) || 0, expiresAt },
  };
}

// ── Revocation serials ──────────────────────────────────────────────────────
// Stored as one JSON note column per response item, `{ "<layer>": <serial> }`,
// the same per-item-JSON shape as `WorkflowEmailSchedule`. An absent entry is
// serial 0, so nothing needs backfilling.

export const GRANT_SERIAL_COLUMN = "WorkflowGrantSerials";

export function parseGrantSerials(raw: unknown): Record<string, number> {
  const source = typeof raw === "string" && raw.trim()
    ? (() => { try { return JSON.parse(raw) as unknown; } catch { return null; } })()
    : raw;
  if (typeof source !== "object" || source === null || Array.isArray(source)) return {};

  const serials: Record<string, number> = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const serial = Number(value);
    if (/^\d+$/.test(key) && Number.isFinite(serial) && serial >= 0) {
      serials[key] = Math.floor(serial);
    }
  }
  return serials;
}

export function currentGrantSerial(raw: unknown, layerNumber: number): number {
  return parseGrantSerials(raw)[String(layerNumber)] ?? 0;
}

/** Returns the serials JSON to persist, with this layer's serial incremented. */
export function bumpGrantSerial(raw: unknown, layerNumber: number): { serials: Record<string, number>; serial: number } {
  const serials = parseGrantSerials(raw);
  const serial = (serials[String(layerNumber)] ?? 0) + 1;
  serials[String(layerNumber)] = serial;
  return { serials, serial };
}

// ── Issuing a layer's link token ────────────────────────────────────────────

export interface WorkflowLayerLike {
  authMode?: unknown;
  publicToken?: unknown;
  publicAccess?: unknown;
}

export interface IssueLayerLinkTokenParams {
  formTitle: string;
  responseItemId: number | string;
  layerNumber: number;
  /** Current serial for this layer, from `WorkflowGrantSerials`. */
  serial?: number;
  now?: Date;
}

/**
 * The token that belongs in one layer's review link.
 *
 * A public layer gets a freshly minted grant scoped to this submission. Any
 * other layer returns "", which sends `buildWorkflowReviewLink` down the
 * signed-in slug form. If no signing secret is configured the layer's legacy
 * form-wide `publicToken` is used so an existing deployment keeps working
 * rather than mailing a dead link.
 */
export function issueLayerLinkToken(
  layer: WorkflowLayerLike | undefined,
  params: IssueLayerLinkTokenParams,
): string {
  if (!layer || layer.authMode !== "public") return "";

  const legacyToken = typeof layer.publicToken === "string" ? layer.publicToken.trim() : "";
  if (!isPublicGrantConfigured()) return legacyToken;

  return mintPublicGrant({
    formTitle: params.formTitle,
    responseItemId: params.responseItemId,
    layerNumber: params.layerNumber,
    serial: params.serial,
    linkTtlHours: normalizePublicAccessConfig(layer.publicAccess).linkTtlHours,
    now: params.now,
  });
}

/**
 * rateLimit.ts — a ceiling on how often one caller may hit an endpoint.
 *
 * Sliding window, held in the function instance's own memory. That is an
 * honest description of what this can and cannot do, and the limits below are
 * chosen to suit it:
 *
 * - It is **per warm instance**, not global. Vercel may run several instances
 *   of the same function at once, so a determined caller spread across them
 *   gets the limit multiplied by however many are warm. It is a brake, not a
 *   gate.
 * - It resets when an instance goes cold, which on a quiet deployment can be
 *   minutes.
 *
 * Both are acceptable for what this defends against: the abuse that matters
 * here is volume — thousands of messages, or a reference counter churned in a
 * loop — and a brake that turns "thousands per minute" into "tens" removes the
 * point of trying. It is deliberately NOT the authorisation check. Every
 * endpoint that holds data still proves who the caller is; this only limits
 * what a caller who has already been let through may do.
 *
 * A shared store (Redis, or a SharePoint list) would make this exact, and is
 * the right upgrade if abuse is ever actually observed. It is not worth a new
 * dependency and a round trip on every request before then.
 */

export interface RateLimitRule {
  /** How many requests are allowed inside one window. */
  limit: number;
  /** The window's width, in milliseconds. */
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** What to put in `Retry-After`. Zero when the request was allowed. */
  retryAfterSeconds: number;
}

/**
 * Keys currently being tracked. Swept when it grows past this, so a long-lived
 * instance seeing many distinct callers cannot grow its memory without bound.
 */
const MAX_TRACKED_KEYS = 5000;

const hits = new Map<string, number[]>();

function sweep(now: number, windowMs: number): void {
  for (const [key, timestamps] of hits) {
    const live = timestamps.filter((at) => now - at < windowMs);
    if (live.length === 0) hits.delete(key);
    else hits.set(key, live);
  }
}

/**
 * Records one request against `key` and says whether it may proceed.
 *
 * Call this once per request, and only after cheaper checks (method, API key)
 * have already turned away the obvious noise — a rejected request should not
 * consume the budget that a real one needs.
 */
export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitRule,
  now: number = Date.now(),
): RateLimitDecision {
  if (hits.size > MAX_TRACKED_KEYS) sweep(now, windowMs);

  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);

  if (recent.length >= limit) {
    hits.set(key, recent);
    // How long until the oldest hit in the window falls out of it, which is
    // the first moment another request could succeed.
    const oldest = recent[0];
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }

  recent.push(now);
  hits.set(key, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Drops all recorded history. Tests only — nothing in production should call it. */
export function resetRateLimits(): void {
  hits.clear();
}

/**
 * The caller's address, for use as a rate-limit key when there is no identity
 * to key on.
 *
 * `x-forwarded-for` is a chain the platform appends to, so the *first* entry is
 * the original client. It is spoofable in general — but not here, because
 * Vercel rewrites the header on the way in rather than trusting what arrived.
 * Falls back to a single shared bucket when no address can be read, which fails
 * closed: a caller who hides their address shares one budget with everyone else
 * doing the same.
 */
export function clientIp(headers: Record<string, string | string[] | undefined>): string {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === "x-forwarded-for")?.[1];
  const value = (Array.isArray(entry) ? entry[0] : entry) || "";
  const first = value.split(",")[0]?.trim();
  return first || "unknown";
}

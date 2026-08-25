/**
 * testRun.ts — turning a form's real workflow into a rehearsal.
 *
 * A test run is a genuine submission down the genuine pipeline: the chain walk,
 * the Department Approver Directory lookup and the distribution-list expansion
 * all still happen, and their answers are written to the usual `L{n}_Email`
 * columns so the builder can see who the form *would* have gone to. Only the
 * moment of dispatch is overridden.
 *
 * Test mode is never read from a request body. A public test opens an anonymous
 * page, so the only thing that may switch it on is a ticket signed with
 * `API_SECRET_KEY` by an authenticated Form Builder Superuser. Anything wrong
 * with a ticket — absent, malformed, edited, expired — yields `null`, and the
 * caller then treats the submission as ordinary production traffic. That is the
 * safe direction to fail: the worst case is a real submission, not a silent
 * redirect of real mail.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Long enough to fill in a form at leisure, short enough that a leak dies. */
export const TEST_TICKET_TTL_MS = 4 * 60 * 60 * 1000;

export interface TestTicketPayload {
  slug: string;
  testEmail: string;
  issuedBy: string;
  /** Epoch ms. */
  expiresAt: number;
}

function signingKey(): string {
  const key = process.env.API_SECRET_KEY || "";
  if (!key) throw new Error("API_SECRET_KEY is required to sign a test ticket.");
  return key;
}

function sign(body: string): string {
  return createHmac("sha256", signingKey()).update(body).digest("base64url");
}

export function mintTestTicket(
  payload: Omit<TestTicketPayload, "expiresAt">,
  now: Date = new Date(),
): string {
  const testEmail = payload.testEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(testEmail)) {
    throw new Error("A test run needs a valid email address to redirect to.");
  }
  const body = Buffer.from(
    JSON.stringify({
      slug: payload.slug.trim(),
      testEmail,
      issuedBy: payload.issuedBy.trim().toLowerCase(),
      expiresAt: now.getTime() + TEST_TICKET_TTL_MS,
    } satisfies TestTicketPayload),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyTestTicket(
  raw: unknown,
  slug: string,
  now: Date = new Date(),
): TestTicketPayload | null {
  if (typeof raw !== "string" || !raw.includes(".")) return null;
  const [body, signature] = raw.split(".");
  if (!body || !signature) return null;

  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return null;
  }
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TestTicketPayload;
    if (typeof parsed?.slug !== "string" || parsed.slug !== slug.trim()) return null;
    if (typeof parsed.testEmail !== "string" || !EMAIL_RE.test(parsed.testEmail)) return null;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= now.getTime()) return null;
    return parsed;
  } catch {
    return null;
  }
}

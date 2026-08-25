/**
 * sendEmailTestRun.ts — applying a test run's redirect to the browser-driven
 * sender.
 *
 * `api/send-email.ts` is called straight from the client with a signed-in
 * submitter's confirmation mail, bypassing `deliverWorkflowEmail` entirely
 * (it has no workflow row to look one up from). A rehearsal run still needs
 * this mail redirected, so the caller may pass along the same test ticket the
 * submission itself was minted under. Anything wrong with the ticket — absent,
 * malformed, expired, minted for a different form — yields the message
 * unchanged: an ordinary send is always the safe fallback.
 */
import { redirectTestMessage, verifyTestTicket } from "./testRun.js";

export function applySendEmailTestRun<T extends { to: string | string[]; subject: string; body: string }>(
  message: T,
  testTicket: unknown,
  slug: unknown,
  now: Date = new Date(),
): T {
  if (typeof slug !== "string" || !slug.trim()) return message;
  const payload = verifyTestTicket(testTicket, slug, now);
  if (!payload) return message;
  return redirectTestMessage(message, { testEmail: payload.testEmail });
}

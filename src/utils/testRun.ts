/**
 * testRun.ts — the browser's copy of the test-run flag reader.
 *
 * `api/_utils/testRun.ts` is the server-side original — signs and verifies the
 * test ticket, redirects outbound mail, and defines the `IsTest` / `TestEmail`
 * columns a test run writes. `src/` cannot import from `api/`, so this file
 * re-implements the pieces the browser needs: reading whether a response row
 * is a rehearsal, and who its steps go to. Keep these in step with their twins.
 */

import type { DirectoryPerson } from "./resolveAssignee";

export const TEST_FLAG_FIELD = "IsTest";
export const TEST_EMAIL_FIELD = "TestEmail";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface TestRunTicketDetails {
  testEmail: string;
  /** Who every step belongs to, with the tester as their stand-in. "" for none. */
  onBehalfOf: string;
}

/**
 * The tester's address, and whoever they rehearse standing in for, read from a
 * test ticket without checking its signature — the browser does not hold the
 * key. Used only to assign a signed-in tester's own submission; the server
 * verifies the ticket when it stamps the row, and a ticket it rejects leaves no
 * test run behind. Empty for anything that is not a readable ticket.
 */
export function testRunFromTicket(ticket: string): TestRunTicketDetails {
  const none = { testEmail: "", onBehalfOf: "" };
  const body = ticket.split(".")[0] ?? "";
  if (!body) return none;
  try {
    const parsed = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))) as { testEmail?: unknown; onBehalfOf?: unknown };
    const testEmail = String(parsed.testEmail ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(testEmail)) return none;
    const onBehalfOf = String(parsed.onBehalfOf ?? "").trim().toLowerCase();
    return { testEmail, onBehalfOf: EMAIL_RE.test(onBehalfOf) && onBehalfOf !== testEmail ? onBehalfOf : "" };
  } catch {
    return none;
  }
}

type PersonPorts = { lookupPerson(email: string): Promise<DirectoryPerson | null> };

/**
 * Directory lookups for a test run that rehearses a stand-in. Mirror of
 * `withTestRunStandIn` in api/_utils/testRun.ts: `principal` reads back naming
 * the tester as their PA, so the request email says so as it would for a real
 * one, and no directory row changes.
 */
export function withTestRunStandIn(ports: PersonPorts, tester: string, principal: string): PersonPorts {
  const wanted = principal.trim().toLowerCase();
  if (!tester || !wanted) return ports;
  return {
    lookupPerson: async (email: string) => {
      const real = await ports.lookupPerson(email).catch(() => null);
      if (email.trim().toLowerCase() !== wanted) return real;
      const base: DirectoryPerson = real ?? { email, name: email, department: "", position: "", approverEmail: "" };
      return { ...base, delegateEmails: [...(base.delegateEmails ?? []), tester] };
    },
  };
}

/**
 * Who every step of a test-run row is assigned to: its `TestEmail`, or "" when
 * the row is not a test run or has no usable address (it then routes as usual,
 * and its mail is withheld server-side rather than sent to a real approver).
 */
export function testRunAssignee(fields: Record<string, unknown> | undefined): string {
  if (!isTestRow(fields)) return "";
  const testEmail = String(fields?.[TEST_EMAIL_FIELD] ?? "").trim().toLowerCase();
  return EMAIL_RE.test(testEmail) ? testEmail : "";
}

/**
 * Tolerant reading of the `IsTest` column: `true`, `"true"` and `"TRUE"` all
 * mean the row is a rehearsal. Anything else — including a missing field, which
 * is how every submission created before this column existed reads — means an
 * ordinary production submission. That is the safe direction to fail: a row
 * never mistakenly disappears from a production listing.
 */
export function isTestRow(fields: Record<string, unknown> | undefined): boolean {
  const flag = fields?.[TEST_FLAG_FIELD];
  return flag === true || String(flag ?? "").trim().toLowerCase() === "true";
}

/**
 * testRunReviewer.ts — whether the tester of a test run may act on its steps.
 *
 * A test run routes every step to the real assignee — layer resolution runs for
 * real so the rehearsal proves the routing — and only the mail is redirected to
 * the test address. The review page, though, lets a step be opened only by its
 * assignee, so the tester who received the redirected link was turned away with
 * "waiting for someone else" on every form whose steps were not assigned to
 * them. The rehearsal could not be finished by the person running it.
 *
 * So the run's tester may act too — but the flag and the test address live on
 * the submission row, and a submitter can edit their own row. If those alone
 * opened a step, marking your own leave request as a test would let you approve
 * it. The tester must therefore also prove, with their own SharePoint token,
 * that they are a Form Builder Superuser: the only people who can start a test
 * run at all, and who can already reassign any step from the workflow workspace.
 */
import { isFormBuilderSuperuser, resolveDelegatedUser, type DelegatedUser } from "./hrFormsOwner.js";
import { readTestRunRedirect } from "./testRun.js";

export interface TestRunReviewerDeps {
  resolveDelegatedUser: (token: string) => Promise<DelegatedUser | null>;
  isFormBuilderSuperuser: (token: string) => Promise<boolean>;
}

const DEFAULT_DEPS: TestRunReviewerDeps = { resolveDelegatedUser, isFormBuilderSuperuser };

/**
 * True only when the row is a test run, the signed-in viewer is its tester, and
 * the SharePoint token they sent is theirs and belongs to a builder superuser.
 * Fails closed on anything unreadable.
 */
export async function testRunTesterMayAct(
  fields: Record<string, unknown> | undefined,
  viewerEmail: string,
  sharePointToken: string,
  deps: TestRunReviewerDeps = DEFAULT_DEPS,
): Promise<boolean> {
  const redirect = readTestRunRedirect(fields);
  const viewer = viewerEmail.trim().toLowerCase();
  if (!redirect || !viewer || redirect.testEmail !== viewer) return false;
  if (!sharePointToken) return false;

  // The SharePoint token must be the viewer's own, or a superuser's token could
  // be paired with somebody else's sign-in.
  const tokenOwner = await deps.resolveDelegatedUser(sharePointToken).catch(() => null);
  if (!tokenOwner || tokenOwner.email.toLowerCase() !== viewer) return false;

  return deps.isFormBuilderSuperuser(sharePointToken).catch(() => false);
}

/** The header the review page carries its SharePoint token in. */
export const SHAREPOINT_TOKEN_HEADER = "x-sharepoint-token";

export function sharePointTokenFrom(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers[SHAREPOINT_TOKEN_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}

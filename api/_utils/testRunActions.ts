/**
 * testRunActions.ts — the authenticated half of test runs.
 *
 * Lives in `_utils` and rides on an existing endpoint because `api/` is at the
 * hard twelve-function Vercel cap; see `api/AGENTS.md`.
 *
 * Column provisioning happens here rather than at submit time for a reason that
 * is easy to get wrong: the app-only client credential the submit path uses
 * cannot create columns at all — `POST .../columns` comes back 403. Only a
 * signed-in admin's delegated SharePoint token can, and a mint request is the
 * one moment in the feature where such a token is in hand.
 */
import { mintTestTicket, verifyTestTicket, testRunFieldsFor, isTestRow } from "./testRun.js";
import { TEST_EMAIL_FIELD, TEST_FLAG_FIELD } from "./testRun.js";
import { appendTestRunStep, TEST_RUN_LOG_FIELD, type TestRunStep } from "./testRunTrail.js";
import { logWarn } from "./logger.js";

export const TEST_RUN_COLUMNS = [TEST_FLAG_FIELD, TEST_EMAIL_FIELD, TEST_RUN_LOG_FIELD];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface MintTestTicketDeps {
  resolveOwner(delegatedToken: string): Promise<string | null>;
  ensureColumn(delegatedToken: string, listTitle: string, column: string): Promise<void>;
}

export async function handleMintTestTicket(
  body: Record<string, unknown>,
  deps: MintTestTicketDeps,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const delegatedToken = String(body.delegatedToken ?? "").trim();
  if (!delegatedToken) return { status: 401, payload: { error: "Sign in to start a test run." } };

  const owner = await deps.resolveOwner(delegatedToken);
  if (!owner) return { status: 403, payload: { error: "Only an HR Forms Owner can start a test run." } };

  const slug = String(body.slug ?? "").trim();
  const listTitle = String(body.listTitle ?? "").trim();
  if (!slug || !listTitle) return { status: 400, payload: { error: "A form is required to start a test run." } };

  const testEmail = String(body.testEmail ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(testEmail)) {
    return { status: 400, payload: { error: "Enter a valid email address to receive the test run." } };
  }

  try {
    for (const column of TEST_RUN_COLUMNS) {
      await deps.ensureColumn(delegatedToken, listTitle, column);
    }
  } catch (error) {
    return {
      status: 500,
      payload: {
        error: "Could not prepare this form's response list for test runs.",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }

  return { status: 200, payload: { ticket: mintTestTicket({ slug, testEmail, issuedBy: owner }) } };
}

export interface StampTestRunDeps {
  /**
   * Resolves the response list a slug's form actually writes to — the same
   * lookup the rest of the app uses to go from a form's public identity to
   * its SharePoint list. Returns `null` if the slug names no form.
   */
  resolveListTitleForSlug(slug: string): Promise<string | null>;
  updateFields(token: string, listTitle: string, itemId: string, fields: Record<string, unknown>): Promise<unknown>;
}

/**
 * Flags a just-created response row as a test run — the only place `IsTest`/
 * `TestEmail` are ever written.
 *
 * The signed-in submission path writes its row straight to SharePoint (it
 * never goes through the guest `mint-test-ticket`/submit flow that stamps
 * these fields at create time), so this is a second, narrower door onto the
 * same two columns. It exists only because the browser must never be trusted
 * to assert test-ness itself — a client that could set `IsTest: true` with an
 * arbitrary `TestEmail` on any submission could redirect a real approval's
 * mail. So the only fields this ever writes are re-derived from a ticket this
 * function verifies itself, server-side, against the slug the caller claims;
 * a ticket that is missing, tampered, expired, or minted for a different form
 * changes nothing and the row is left exactly as `createListItem` left it —
 * ordinary production traffic, the safe direction to fail.
 *
 * The response list to write to is never taken from the caller either. A
 * ticket is a capability scoped to one form, not to a response list name the
 * caller can put in the request body — trusting `body.listTitle` directly
 * would let anyone holding any one valid ticket flag an arbitrary row in an
 * arbitrary list (the ticket lives for hours and is not single-use), pulling
 * someone else's real submission out of production listings and redirecting
 * its approval mail. So the list is re-derived here from the ticket's own
 * (verified) slug, exactly the way the rest of the app maps a form's public
 * identity to its SharePoint list; `body.listTitle` is ignored entirely.
 */
export async function handleStampTestRun(
  token: string,
  body: Record<string, unknown>,
  deps: StampTestRunDeps,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const itemId = String(body.itemId ?? "").trim();
  const slug = String(body.slug ?? "").trim();
  if (!itemId || !slug) {
    return { status: 400, payload: { error: "A response row and slug are required to mark a test run." } };
  }

  const ticket = verifyTestTicket(body.testTicket, slug);
  if (!ticket) {
    return { status: 400, payload: { error: "This test ticket is invalid or has expired." } };
  }

  const listTitle = await deps.resolveListTitleForSlug(ticket.slug);
  if (!listTitle) {
    return { status: 400, payload: { error: "This test ticket's form could not be found." } };
  }

  await deps.updateFields(token, listTitle, itemId, testRunFieldsFor(ticket));
  return { status: 200, payload: { ok: true } };
}

export interface TestRunStepDeps {
  readItem(token: string, listTitle: string, itemId: string): Promise<{ fields: Record<string, unknown> } | null>;
  updateFields(token: string, listTitle: string, itemId: string, fields: Record<string, unknown>): Promise<unknown>;
}

/**
 * Appends one step to a run's trail, and swallows anything that goes wrong.
 *
 * The trail is a report on the submission, not part of it. A failure to write
 * the report must never be the reason the submission it describes fails.
 */
export async function recordTestRunStep(
  token: string,
  listTitle: string,
  itemId: string,
  step: Omit<TestRunStep, "at">,
  deps: TestRunStepDeps,
): Promise<void> {
  return recordTestRunSteps(token, listTitle, itemId, [step], deps);
}

/**
 * Appends several steps to a run's trail in one read and one write.
 *
 * Recording steps one at a time — a read/write round trip per step — is what
 * `recordTestRunStep` does, and it is fine for steps that happen at genuinely
 * different moments. But a batch of steps that are all already known by the
 * time any of them is recorded (the post-create steps, in particular) gain
 * nothing from being written separately, and each extra round trip is a
 * SharePoint call a rehearsal can least afford: enough of them stacked up
 * inside one request can trip the serverless function timeout, failing a
 * test run whose only purpose is to prove the real thing won't fail.
 *
 * Same never-throws contract as `recordTestRunStep`: the trail is a report on
 * the submission, not part of it.
 */
export async function recordTestRunSteps(
  token: string,
  listTitle: string,
  itemId: string,
  steps: Omit<TestRunStep, "at">[],
  deps: TestRunStepDeps,
): Promise<void> {
  if (steps.length === 0) return;
  try {
    const item = await deps.readItem(token, listTitle, itemId);
    let raw: unknown = item?.fields?.[TEST_RUN_LOG_FIELD];
    for (const step of steps) {
      raw = appendTestRunStep(raw, step);
    }
    await deps.updateFields(token, listTitle, itemId, { [TEST_RUN_LOG_FIELD]: raw });
  } catch (error) {
    logWarn("api:test-run", "Could not record test run steps", {
      listTitle,
      steps: steps.map((step) => step.step).join(", "),
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface DeleteTestRunsDeps {
  resolveOwner(delegatedToken: string): Promise<string | null>;
  /**
   * Resolves the response list a slug's form actually writes to — the same
   * lookup `handleStampTestRun` uses. The caller's own `body.listTitle` is
   * never trusted for this; see the note below.
   */
  resolveListTitleForSlug(slug: string): Promise<string | null>;
  listRows(listTitle: string): Promise<{ id: string; fields: Record<string, unknown> }[]>;
  deleteRow(delegatedToken: string, listTitle: string, id: string): Promise<void>;
}

/**
 * Deletes test-run rows from a form's response list, either all of them or
 * one named row.
 *
 * This is a genuinely destructive action driven entirely by an id the browser
 * sends. Without the `isTestRow` check below, `itemId` would be a way for
 * anyone who can reach this endpoint to permanently delete any submission in
 * the list — production or not — simply by naming its row id. So the row is
 * always re-read from SharePoint and re-checked here; the caller's belief
 * that a row is a test run is never trusted on its own.
 *
 * The response list to operate on is also never taken from the caller. This
 * handler runs on an app-only Graph token that can reach every list on the
 * site — trusting `body.listTitle` directly would let an HR Forms Owner
 * authorised for one form permanently delete rows in, or overwrite trail
 * JSON on, an entirely different form's list simply by naming it. So the
 * list is re-derived here from the caller's own `slug`, exactly the way
 * `handleStampTestRun` re-derives its list from a verified ticket's slug;
 * `body.listTitle` is ignored entirely.
 */
export async function handleDeleteTestRuns(
  body: Record<string, unknown>,
  deps: DeleteTestRunsDeps,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const delegatedToken = String(body.delegatedToken ?? "").trim();
  if (!delegatedToken) return { status: 401, payload: { error: "Sign in to delete test runs." } };

  const owner = await deps.resolveOwner(delegatedToken);
  if (!owner) return { status: 403, payload: { error: "Only an HR Forms Owner can delete test runs." } };

  const slug = String(body.slug ?? "").trim();
  if (!slug) return { status: 400, payload: { error: "A form is required to delete test runs." } };

  const listTitle = await deps.resolveListTitleForSlug(slug);
  if (!listTitle) return { status: 400, payload: { error: "This form could not be found." } };

  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";

  const rows = await deps.listRows(listTitle);

  if (itemId) {
    const row = rows.find((candidate) => candidate.id === itemId);
    if (!row || !isTestRow(row.fields)) {
      return { status: 400, payload: { error: "That submission is not a test run and cannot be deleted here." } };
    }
    await deps.deleteRow(delegatedToken, listTitle, itemId);
    return { status: 200, payload: { deleted: [itemId] } };
  }

  const testRows = rows.filter((row) => isTestRow(row.fields));
  for (const row of testRows) {
    await deps.deleteRow(delegatedToken, listTitle, row.id);
  }
  return { status: 200, payload: { deleted: testRows.map((row) => row.id) } };
}

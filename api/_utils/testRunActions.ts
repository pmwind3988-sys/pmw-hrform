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
import { mintTestTicket } from "./testRun.js";
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

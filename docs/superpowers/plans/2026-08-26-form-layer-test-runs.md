# Form Layer Test Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Form Builder Superuser run a real submission through a form's real layer sequence with every email redirected to one nominated address, flagged so it never mixes with production data, and recorded as a pass/fail checklist that ends with the submission PDF.

**Architecture:** A signed test ticket, minted by an authenticated superuser, is the only thing that can turn test mode on. `api/submit-form.ts` verifies it, stamps `IsTest` / `TestEmail` on the response row, and then routes layers exactly as it always does — the override happens only where a message is about to be sent. Later layers re-read the flag from the stored row, so the redirect outlives the ticket. Every stage appends an entry to a `TestRunLog` JSON column, which the builder renders as a checklist.

**Tech Stack:** TypeScript, Vercel serverless functions (Node), Microsoft Graph + SharePoint REST, React 19 + MUI 9, Vitest, `@react-pdf/renderer`.

**Spec:** `docs/superpowers/specs/2026-08-26-form-layer-test-runs-design.md`

## Global Constraints

- **Never add a file directly under `api/`.** That directory sits at the hard Vercel Hobby cap of 12 serverless functions; `api/_utils/deploymentLimits.test.ts` fails if a 13th appears. New server surface is an `action` on an existing endpoint. New shared code goes in `api/_utils/`, which is bundled, not deployed.
- **App-only credentials cannot create lists or columns.** Any column provisioning uses the signed-in admin's *delegated* SharePoint token through `ensureTextFieldViaSPRest` / `ensureListViaSPRest` from `api/_utils/sharepointRest.ts`. `getGraphToken()` is app-only — it reads and writes items only.
- **`api/` cannot import from `src/`.** Logic needed on both sides is duplicated and kept in step, the way `api/_utils/resolveAssignee.ts` and `src/utils/resolveAssignee.ts` already are. Say so in a header comment on both copies.
- **Source files are CRLF.** Prefer the Edit tool over shell heredocs when patching existing files.
- **Failing safe means falling back to production behaviour.** An absent, malformed, tampered, or expired ticket must produce an ordinary non-test submission, never an error.
- Run the full check with `npx vitest run` and `npx tsc -b` before each commit. `npx tsc -b` is what the Vercel build runs; a passing Vitest suite alone does not prove the deploy compiles.
- Test names in this repo read as sentences about behaviour ("refuses a second one straight away"), not as method names. Match that.

---

### Task 1: Test ticket — mint and verify

The ticket is a capability: holding one lets an otherwise anonymous form submission enter test mode. It is HMAC-signed with `API_SECRET_KEY` so a public respondent cannot forge one, and short-lived so a leaked one stops working.

**Files:**
- Create: `api/_utils/testRun.ts`
- Test: `api/_utils/testRun.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface TestTicketPayload { slug: string; testEmail: string; issuedBy: string; expiresAt: number }`
  - `mintTestTicket(payload: Omit<TestTicketPayload, "expiresAt">, now?: Date): string`
  - `verifyTestTicket(raw: unknown, slug: string, now?: Date): TestTicketPayload | null`
  - `TEST_TICKET_TTL_MS: number`

- [ ] **Step 1: Write the failing test**

Create `api/_utils/testRun.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";

import { mintTestTicket, verifyTestTicket, TEST_TICKET_TTL_MS } from "./testRun.js";

const NOW = new Date("2026-08-26T09:00:00Z");

function ticket(overrides: Partial<{ slug: string; testEmail: string; issuedBy: string }> = {}) {
  return mintTestTicket(
    { slug: "leave-application", testEmail: "tester@pmw-group.com", issuedBy: "hr@pmw-group.com", ...overrides },
    NOW,
  );
}

describe("test ticket", () => {
  beforeEach(() => {
    process.env.API_SECRET_KEY = "secret-for-tests";
  });

  it("round-trips the run's details", () => {
    const payload = verifyTestTicket(ticket(), "leave-application", NOW);
    expect(payload).toMatchObject({
      slug: "leave-application",
      testEmail: "tester@pmw-group.com",
      issuedBy: "hr@pmw-group.com",
    });
  });

  it("refuses a ticket minted for a different form", () => {
    expect(verifyTestTicket(ticket(), "expense-claim", NOW)).toBeNull();
  });

  it("refuses a ticket whose payload was edited", () => {
    const [body, signature] = ticket().split(".");
    const tampered = Buffer.from(
      JSON.stringify({ slug: "leave-application", testEmail: "attacker@example.com", issuedBy: "x", expiresAt: 9e15 }),
    ).toString("base64url");
    expect(body).not.toBe(tampered);
    expect(verifyTestTicket(`${tampered}.${signature}`, "leave-application", NOW)).toBeNull();
  });

  it("refuses a ticket signed with a different secret", () => {
    const minted = ticket();
    process.env.API_SECRET_KEY = "a-different-secret";
    expect(verifyTestTicket(minted, "leave-application", NOW)).toBeNull();
  });

  it("refuses a ticket once it has expired", () => {
    const later = new Date(NOW.getTime() + TEST_TICKET_TTL_MS + 1000);
    expect(verifyTestTicket(ticket(), "leave-application", later)).toBeNull();
  });

  it("treats junk as no ticket at all rather than throwing", () => {
    expect(verifyTestTicket(undefined, "leave-application", NOW)).toBeNull();
    expect(verifyTestTicket("", "leave-application", NOW)).toBeNull();
    expect(verifyTestTicket("not-a-ticket", "leave-application", NOW)).toBeNull();
    expect(verifyTestTicket({ slug: "leave-application" }, "leave-application", NOW)).toBeNull();
  });

  it("refuses to mint without an address to redirect to", () => {
    expect(() => mintTestTicket({ slug: "x", testEmail: "not-an-email", issuedBy: "hr@pmw-group.com" }, NOW)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_utils/testRun.test.ts`
Expected: FAIL — cannot resolve `./testRun.js`.

- [ ] **Step 3: Write minimal implementation**

Create `api/_utils/testRun.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_utils/testRun.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add api/_utils/testRun.ts api/_utils/testRun.test.ts && git commit -m "Sign a test ticket only an authenticated superuser can mint"
```

---

### Task 2: Redirect every recipient class to the test address

The whole safety property of the feature lives here: whatever a message was addressed to, a test run sends it to one place. Actor, notification mailbox, submitter copy, HR copy — there is no class of recipient that is exempt, because the tester cannot audit what they never see.

**Files:**
- Modify: `api/_utils/testRun.ts`
- Test: `api/_utils/testRun.test.ts`

**Interfaces:**
- Consumes: `TestTicketPayload` from Task 1.
- Produces:
  - `interface TestRunRedirect { testEmail: string }`
  - `redirectTestMessage<T extends { to: string | string[]; subject: string; body: string }>(message: T, redirect: TestRunRedirect): T`
  - `TEST_SUBJECT_PREFIX = "[TEST] "`

- [ ] **Step 1: Write the failing test**

Append to `api/_utils/testRun.test.ts`:

```ts
import { redirectTestMessage, TEST_SUBJECT_PREFIX } from "./testRun.js";

describe("test-run redirect", () => {
  const redirect = { testEmail: "tester@pmw-group.com" };

  it("sends a message addressed to one person to the test address instead", () => {
    const out = redirectTestMessage(
      { to: "hod-finance@pmw-group.com", subject: "Approval needed", body: "<p>Hi</p>" },
      redirect,
    );
    expect(out.to).toBe("tester@pmw-group.com");
  });

  it("collapses a fan-out to the single test address", () => {
    const out = redirectTestMessage(
      { to: ["siti@pmw-group.com", "hr-inbox@pmw-group.com"], subject: "s", body: "b" },
      redirect,
    );
    expect(out.to).toBe("tester@pmw-group.com");
  });

  it("marks the subject so a test mail is never mistaken for a real one", () => {
    const out = redirectTestMessage({ to: "a@b.com", subject: "Approval needed", body: "b" }, redirect);
    expect(out.subject).toBe(`${TEST_SUBJECT_PREFIX}Approval needed`);
  });

  it("does not double-prefix a subject that is already marked", () => {
    const once = redirectTestMessage({ to: "a@b.com", subject: "s", body: "b" }, redirect);
    const twice = redirectTestMessage(once, redirect);
    expect(twice.subject).toBe(`${TEST_SUBJECT_PREFIX}s`);
  });

  it("names in the body who the mail was diverted from", () => {
    const out = redirectTestMessage(
      { to: ["siti@pmw-group.com", "hod@pmw-group.com"], subject: "s", body: "<p>Body</p>" },
      redirect,
    );
    expect(out.body).toContain("siti@pmw-group.com");
    expect(out.body).toContain("hod@pmw-group.com");
    expect(out.body).toContain("Body");
  });

  it("escapes the diverted addresses rather than trusting them as markup", () => {
    const out = redirectTestMessage(
      { to: '<img src=x onerror=alert(1)>@b.com', subject: "s", body: "b" },
      redirect,
    );
    expect(out.body).not.toContain("<img");
    expect(out.body).toContain("&lt;img");
  });

  it("leaves every other property of the message alone", () => {
    const out = redirectTestMessage(
      { to: "a@b.com", subject: "s", body: "b", attachments: [{ name: "form.pdf" }] },
      redirect,
    );
    expect(out.attachments).toEqual([{ name: "form.pdf" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_utils/testRun.test.ts`
Expected: FAIL — `redirectTestMessage` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `api/_utils/testRun.ts`:

```ts
export const TEST_SUBJECT_PREFIX = "[TEST] ";

export interface TestRunRedirect {
  testEmail: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Rewrites one outbound message for a test run.
 *
 * The production addresses are not merely dropped — they are printed in the
 * banner. Seeing "would have gone to hod-finance@…" is the single most useful
 * thing a test run tells a builder, and it is the part a redirect would
 * otherwise destroy.
 */
export function redirectTestMessage<T extends { to: string | string[]; subject: string; body: string }>(
  message: T,
  redirect: TestRunRedirect,
): T {
  const intended = (Array.isArray(message.to) ? message.to : [message.to]).filter((entry) => entry.trim());
  const banner =
    `<div style="border:2px solid #b91c1c;background:#fef2f2;color:#7f1d1d;padding:12px;margin:0 0 16px;border-radius:6px;font-family:sans-serif">` +
    `<strong>TEST RUN — this is not a real submission.</strong><br>` +
    `In production this email would have gone to: ${intended.map((entry) => escapeHtml(entry)).join(", ") || "nobody"}.` +
    `</div>`;

  return {
    ...message,
    to: redirect.testEmail,
    subject: message.subject.startsWith(TEST_SUBJECT_PREFIX)
      ? message.subject
      : `${TEST_SUBJECT_PREFIX}${message.subject}`,
    body: `${banner}${message.body}`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_utils/testRun.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add api/_utils/testRun.ts api/_utils/testRun.test.ts && git commit -m "Collapse every recipient of a test run to the one test address"
```

---

### Task 3: The run trail

An append-only checklist stored as JSON on the response row, following the shape and merge semantics `WorkflowEmailLog` already uses in `api/_utils/workflowEmail.ts`. Entries are keyed so a re-run of the same step overwrites rather than duplicates, and so two layers writing concurrently cannot lose each other's entries.

**Files:**
- Create: `api/_utils/testRunTrail.ts`
- Test: `api/_utils/testRunTrail.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type TestRunStepStatus = "pass" | "fail" | "warn" | "skip" | "pending"`
  - `interface TestRunStep { step: string; label: string; status: TestRunStepStatus; detail?: string; at: string; order: number }`
  - `type TestRunTrail = Record<string, TestRunStep>`
  - `TEST_RUN_LOG_FIELD = "TestRunLog"`
  - `parseTestRunTrail(raw: unknown): TestRunTrail`
  - `appendTestRunStep(raw: unknown, step: Omit<TestRunStep, "at">, now?: Date): string`
  - `orderedTestRunSteps(trail: TestRunTrail): TestRunStep[]`
  - `testRunOutcome(trail: TestRunTrail): "passed" | "failed" | "running"`

- [ ] **Step 1: Write the failing test**

Create `api/_utils/testRunTrail.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  appendTestRunStep,
  orderedTestRunSteps,
  parseTestRunTrail,
  testRunOutcome,
} from "./testRunTrail.js";

const NOW = new Date("2026-08-26T09:00:00Z");

describe("test run trail", () => {
  it("reads a row that has never been written to as an empty trail", () => {
    expect(parseTestRunTrail(undefined)).toEqual({});
    expect(parseTestRunTrail("")).toEqual({});
    expect(parseTestRunTrail("not json")).toEqual({});
    expect(parseTestRunTrail("[1,2]")).toEqual({});
  });

  it("records a step with the time it happened", () => {
    const raw = appendTestRunStep("", { step: "ticket", label: "Ticket validated", status: "pass", order: 1 }, NOW);
    expect(parseTestRunTrail(raw).ticket).toMatchObject({
      step: "ticket",
      label: "Ticket validated",
      status: "pass",
      at: "2026-08-26T09:00:00.000Z",
    });
  });

  it("keeps earlier steps when a later one is added", () => {
    const first = appendTestRunStep("", { step: "ticket", label: "Ticket validated", status: "pass", order: 1 }, NOW);
    const second = appendTestRunStep(first, { step: "row", label: "Response row created", status: "pass", order: 4 }, NOW);
    expect(Object.keys(parseTestRunTrail(second)).sort()).toEqual(["row", "ticket"]);
  });

  it("replaces a step that runs again rather than listing it twice", () => {
    const pending = appendTestRunStep("", { step: "pdf", label: "PDF rendered", status: "pending", order: 9 }, NOW);
    const done = appendTestRunStep(pending, { step: "pdf", label: "PDF rendered", status: "pass", order: 9 }, NOW);
    const steps = orderedTestRunSteps(parseTestRunTrail(done));
    expect(steps).toHaveLength(1);
    expect(steps[0].status).toBe("pass");
  });

  it("orders steps by the run's sequence, not by insertion", () => {
    const later = appendTestRunStep("", { step: "pdf", label: "PDF rendered", status: "pass", order: 9 }, NOW);
    const earlier = appendTestRunStep(later, { step: "ticket", label: "Ticket validated", status: "pass", order: 1 }, NOW);
    expect(orderedTestRunSteps(parseTestRunTrail(earlier)).map((entry) => entry.step)).toEqual(["ticket", "pdf"]);
  });

  it("carries the reason a step failed", () => {
    const raw = appendTestRunStep(
      "",
      { step: "layer-2-email", label: "Layer 2 email", status: "fail", detail: "Mailbox not found", order: 72 },
      NOW,
    );
    expect(parseTestRunTrail(raw)["layer-2-email"].detail).toBe("Mailbox not found");
  });

  it("calls a run failed when any step failed, even if later ones passed", () => {
    const failed = appendTestRunStep("", { step: "a", label: "A", status: "fail", order: 1 }, NOW);
    const then = appendTestRunStep(failed, { step: "b", label: "B", status: "pass", order: 2 }, NOW);
    expect(testRunOutcome(parseTestRunTrail(then))).toBe("failed");
  });

  it("calls a run running while any step is still pending", () => {
    const raw = appendTestRunStep("", { step: "a", label: "A", status: "pending", order: 1 }, NOW);
    expect(testRunOutcome(parseTestRunTrail(raw))).toBe("running");
  });

  it("does not let a warning fail a run", () => {
    const raw = appendTestRunStep("", { step: "a", label: "A", status: "warn", order: 1 }, NOW);
    expect(testRunOutcome(parseTestRunTrail(raw))).toBe("passed");
  });

  it("drops entries that are not steps rather than rendering junk", () => {
    expect(parseTestRunTrail(JSON.stringify({ ok: { step: "ok" }, bad: 7 }))).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_utils/testRunTrail.test.ts`
Expected: FAIL — cannot resolve `./testRunTrail.js`.

- [ ] **Step 3: Write minimal implementation**

Create `api/_utils/testRunTrail.ts`:

```ts
/**
 * testRunTrail.ts — the checklist a test run leaves behind.
 *
 * Stored as one JSON object on the response row's `TestRunLog` column, keyed by
 * step id. Keyed rather than appended to an array for the same reason
 * `WorkflowEmailLog` is: a step that runs twice — a pending PDF check that later
 * completes, a retried send — should update its line, and two layers writing at
 * once should merge instead of clobbering.
 *
 * `order` rather than insertion order decides how the checklist reads, because
 * the browser writes the last step (the PDF render) long after the server wrote
 * the ones before it.
 *
 * `src/utils/testRunTrail.ts` is the browser's copy of this file; `api/` cannot
 * import from `src/`. Keep the two in step.
 */

export const TEST_RUN_LOG_FIELD = "TestRunLog";

export type TestRunStepStatus = "pass" | "fail" | "warn" | "skip" | "pending";

export interface TestRunStep {
  step: string;
  label: string;
  status: TestRunStepStatus;
  detail?: string;
  /** ISO timestamp. */
  at: string;
  /** Position in the run, so the checklist reads in the order things happen. */
  order: number;
}

export type TestRunTrail = Record<string, TestRunStep>;

const STATUSES: TestRunStepStatus[] = ["pass", "fail", "warn", "skip", "pending"];

function toStep(value: unknown): TestRunStep | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.step !== "string" || !record.step) return null;
  if (typeof record.label !== "string") return null;
  if (typeof record.status !== "string" || !STATUSES.includes(record.status as TestRunStepStatus)) return null;
  return {
    step: record.step,
    label: record.label,
    status: record.status as TestRunStepStatus,
    detail: typeof record.detail === "string" ? record.detail : undefined,
    at: typeof record.at === "string" ? record.at : "",
    order: typeof record.order === "number" && Number.isFinite(record.order) ? record.order : 0,
  };
}

export function parseTestRunTrail(raw: unknown): TestRunTrail {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const trail: TestRunTrail = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const step = toStep(value);
      if (step) trail[key] = step;
    }
    return trail;
  } catch {
    return {};
  }
}

export function appendTestRunStep(
  raw: unknown,
  step: Omit<TestRunStep, "at">,
  now: Date = new Date(),
): string {
  const trail = parseTestRunTrail(raw);
  trail[step.step] = { ...step, at: now.toISOString() };
  return JSON.stringify(trail);
}

export function orderedTestRunSteps(trail: TestRunTrail): TestRunStep[] {
  return Object.values(trail).sort((a, b) => a.order - b.order || a.at.localeCompare(b.at));
}

export function testRunOutcome(trail: TestRunTrail): "passed" | "failed" | "running" {
  const steps = Object.values(trail);
  if (steps.some((step) => step.status === "fail")) return "failed";
  if (steps.some((step) => step.status === "pending")) return "running";
  return "passed";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_utils/testRunTrail.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Mirror the module for the browser**

Copy the file to `src/utils/testRunTrail.ts`, changing only the header comment's last paragraph to point back at `api/_utils/testRunTrail.ts`, and dropping the `.js` extension convention if the surrounding `src/utils` files omit it (check `src/utils/workflowEmailLog.ts` and match it).

- [ ] **Step 6: Guard the mirror**

Create `src/utils/__tests__/testRunTrail.test.ts` — or place it beside the module if that is the local convention; check what `src/utils/workflowEmailLog.test.ts` does and match — asserting the same behaviours as Step 1 against the `src` copy. Copy the test bodies verbatim, changing only the import path. Two copies of the tests is the point: it is what catches the copies drifting.

- [ ] **Step 7: Run both suites and the typecheck**

Run: `npx vitest run testRunTrail && npx tsc -b`
Expected: PASS, both files.

- [ ] **Step 8: Commit**

```bash
git add api/_utils/testRunTrail.ts api/_utils/testRunTrail.test.ts src/utils/testRunTrail.ts src/utils/__tests__/testRunTrail.test.ts && git commit -m "Record a test run as an ordered pass/fail checklist"
```

---

### Task 4: A separate TEST- reference series

A test run must not consume a number from the form's real daily sequence, and must be recognisable at a glance in the email subject and on the PDF.

**Files:**
- Modify: `api/_utils/referenceCounter.ts`
- Test: create `api/_utils/referenceCounter.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `allocateReferenceNumber` gains an optional `isTest?: boolean` on `AllocateReferenceParams`; `__test__.counterTitleKey(formTitle, isTest?)` and a new `__test__.testReferenceConfig(config)`.

- [ ] **Step 1: Write the failing test**

Create `api/_utils/referenceCounter.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { __test__ } from "./referenceCounter.js";

describe("test-run reference series", () => {
  it("counts a test run on a different row from the form's real one", () => {
    expect(__test__.counterTitleKey("Leave Application", true))
      .not.toBe(__test__.counterTitleKey("Leave Application", false));
  });

  it("keeps the production key exactly as it was, so live counters are untouched", () => {
    expect(__test__.counterTitleKey("Leave Application")).toBe("leave application");
    expect(__test__.counterTitleKey("Leave Application", false)).toBe("leave application");
  });

  it("marks a test reference so it is obvious in a subject line", () => {
    expect(__test__.testReferenceConfig({ prefix: "LA", pad: 4 })).toEqual({ prefix: "TEST-LA", pad: 4 });
  });

  it("still marks a test reference for a form that has no prefix of its own", () => {
    expect(__test__.testReferenceConfig({ prefix: "", pad: 4 })).toEqual({ prefix: "TEST", pad: 4 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_utils/referenceCounter.test.ts`
Expected: FAIL — `counterTitleKey` takes one argument; `testReferenceConfig` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `api/_utils/referenceCounter.ts`, replace `counterTitleKey` and add `testReferenceConfig`:

```ts
/**
 * Test runs count on their own row. Sharing the production counter would burn
 * real numbers and leave gaps in a sequence people treat as a primary ID.
 */
function counterTitleKey(formTitle: string, isTest = false): string {
  const key = formTitle.trim().toLowerCase();
  return isTest ? `${key}::test` : key;
}

/** A reference nobody can mistake for a production one. */
function testReferenceConfig(
  config: Pick<ReferenceNumberConfig, "prefix" | "pad">,
): Pick<ReferenceNumberConfig, "prefix" | "pad"> {
  const prefix = (config.prefix ?? "").trim();
  return { ...config, prefix: prefix ? `TEST-${prefix}` : "TEST" };
}
```

Add `isTest?: boolean` to `AllocateReferenceParams` with the comment `/** Allocate from the form's TEST- series instead of its live one. */`, then inside `allocateReferenceNumber`:

```ts
  const isTest = params.isTest === true;
  const titleKey = counterTitleKey(formTitle, isTest);
  const referenceConfig = isTest ? testReferenceConfig(config) : config;
```

Use `referenceConfig` in the `formatReferenceNumber(dateKey, next, referenceConfig)` call, and pass `isTest ? \`${formTitle} (test)\` : formTitle` as the counter row's `Title` in `createCounterItem` so the two rows are distinguishable in SharePoint. Extend the `__test__` export to `{ backoffDelay, counterTitleKey, toPositiveInt, testReferenceConfig }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_utils/referenceCounter.test.ts && npx tsc -b`
Expected: PASS, 4 tests; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add api/_utils/referenceCounter.ts api/_utils/referenceCounter.test.ts && git commit -m "Allocate test-run references from their own TEST- series"
```

---

### Task 5: Carry the redirect through the mail sender

`deliverWorkflowEmail` is the single chokepoint every server-sent workflow email passes through, including the scheduled ones the cron delivers. Putting the redirect here means no future caller can forget it.

**Files:**
- Modify: `api/_utils/workflowEmail.ts` (`WorkflowEmailContext`, `deliverWorkflowEmail`)
- Test: `api/_utils/workflowEmailDelivery.test.ts`

**Interfaces:**
- Consumes: `redirectTestMessage`, `TestRunRedirect` from Task 2.
- Produces: `WorkflowEmailContext` gains `testRun?: TestRunRedirect`. All existing callers keep working unchanged because it is optional.

- [ ] **Step 1: Read the existing test file first**

Run: `sed -n 1,96p api/_utils/workflowEmailDelivery.test.ts`

Match its mocking style exactly — it already stubs the Graph send. Do not invent a new harness.

- [ ] **Step 2: Write the failing test**

Append to `api/_utils/workflowEmailDelivery.test.ts`, adapting the mock setup to whatever Step 1 showed:

```ts
describe("test-run delivery", () => {
  it("sends a test run's layer email to the test address, not the assignee", async () => {
    const sent = captureSentMessages(); // however the existing tests capture sends
    await deliverWorkflowEmail(
      "token",
      { to: "hod-finance@pmw-group.com", subject: "Approval needed", body: "<p>x</p>" },
      { listTitle: "Leave Application", responseItemId: "42", layer: 2, testRun: { testEmail: "tester@pmw-group.com" } },
    );
    expect(sent[0].to).toBe("tester@pmw-group.com");
    expect(sent[0].subject).toContain("[TEST]");
    expect(sent[0].body).toContain("hod-finance@pmw-group.com");
  });

  it("records the delivery against the test address that actually received it", async () => {
    const recorded = captureRecordedAttempts();
    await deliverWorkflowEmail(
      "token",
      { to: "hod-finance@pmw-group.com", subject: "s", body: "b" },
      { listTitle: "Leave Application", responseItemId: "42", layer: 2, testRun: { testEmail: "tester@pmw-group.com" } },
    );
    expect(recorded[0].recipient).toBe("tester@pmw-group.com");
  });

  it("leaves a production delivery exactly as it was", async () => {
    const sent = captureSentMessages();
    await deliverWorkflowEmail(
      "token",
      { to: "hod-finance@pmw-group.com", subject: "Approval needed", body: "<p>x</p>" },
      { listTitle: "Leave Application", responseItemId: "42", layer: 2 },
    );
    expect(sent[0].to).toBe("hod-finance@pmw-group.com");
    expect(sent[0].subject).toBe("Approval needed");
    expect(sent[0].body).toBe("<p>x</p>");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run api/_utils/workflowEmailDelivery.test.ts`
Expected: FAIL — `testRun` is not a property of `WorkflowEmailContext`.

- [ ] **Step 4: Write minimal implementation**

In `api/_utils/workflowEmail.ts`, import `redirectTestMessage, type TestRunRedirect` from `./testRun.js`, add to `WorkflowEmailContext`:

```ts
  /**
   * Set only on a test run. Present here rather than at each call site because
   * this is the one place every workflow email passes through — a redirect that
   * a future caller could forget to apply would mail a real approver.
   */
  testRun?: TestRunRedirect;
```

Then at the top of `deliverWorkflowEmail`, before the recipient is derived:

```ts
  const outgoing = context.testRun ? redirectTestMessage(message, context.testRun) : message;
```

and use `outgoing` for both `sendGraphEmail` and the `recipient` string that gets recorded.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run api/_utils/ && npx tsc -b`
Expected: PASS — including every pre-existing workflow-email test, unchanged.

- [ ] **Step 6: Commit**

```bash
git add api/_utils/workflowEmail.ts api/_utils/workflowEmailDelivery.test.ts && git commit -m "Redirect a test run's mail at the one place every send passes through"
```

---

### Task 6: Read the redirect back off the stored row

The ticket expires; the run does not. Layers two and beyond, and the cron that delivers deferred evaluation mail, learn a run is a test by reading the row they are already loading.

**Files:**
- Modify: `api/_utils/testRun.ts`
- Test: `api/_utils/testRun.test.ts`

**Interfaces:**
- Consumes: `TestRunRedirect` from Task 2.
- Produces:
  - `TEST_FLAG_FIELD = "IsTest"`, `TEST_EMAIL_FIELD = "TestEmail"`
  - `testRunFieldsFor(payload: TestTicketPayload): Record<string, string>`
  - `readTestRunRedirect(fields: Record<string, unknown> | undefined): TestRunRedirect | undefined`
  - `isTestRow(fields: Record<string, unknown> | undefined): boolean`

- [ ] **Step 1: Write the failing test**

Append to `api/_utils/testRun.test.ts`:

```ts
import { isTestRow, readTestRunRedirect, testRunFieldsFor } from "./testRun.js";

describe("reading a test run back off its row", () => {
  it("stamps the flag and the address the run redirects to", () => {
    expect(testRunFieldsFor({
      slug: "leave-application",
      testEmail: "tester@pmw-group.com",
      issuedBy: "hr@pmw-group.com",
      expiresAt: 0,
    })).toEqual({ IsTest: "true", TestEmail: "tester@pmw-group.com" });
  });

  it("recovers the redirect from a stored row long after the ticket expired", () => {
    expect(readTestRunRedirect({ IsTest: "true", TestEmail: "tester@pmw-group.com" }))
      .toEqual({ testEmail: "tester@pmw-group.com" });
  });

  it("treats an ordinary submission as no redirect at all", () => {
    expect(readTestRunRedirect({})).toBeUndefined();
    expect(readTestRunRedirect(undefined)).toBeUndefined();
    expect(isTestRow({})).toBe(false);
  });

  it("refuses to redirect a flagged row with no usable address, rather than guessing", () => {
    expect(readTestRunRedirect({ IsTest: "true", TestEmail: "" })).toBeUndefined();
    expect(readTestRunRedirect({ IsTest: "true", TestEmail: "not-an-email" })).toBeUndefined();
    expect(readTestRunRedirect({ IsTest: "true" })).toBeUndefined();
  });

  it("still knows such a row is a test one, so it stays out of production views", () => {
    expect(isTestRow({ IsTest: "true" })).toBe(true);
    expect(isTestRow({ IsTest: "TRUE" })).toBe(true);
    expect(isTestRow({ IsTest: true })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_utils/testRun.test.ts`
Expected: FAIL — `testRunFieldsFor` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `api/_utils/testRun.ts`:

```ts
export const TEST_FLAG_FIELD = "IsTest";
export const TEST_EMAIL_FIELD = "TestEmail";

export function testRunFieldsFor(payload: TestTicketPayload): Record<string, string> {
  return { [TEST_FLAG_FIELD]: "true", [TEST_EMAIL_FIELD]: payload.testEmail };
}

export function isTestRow(fields: Record<string, unknown> | undefined): boolean {
  const flag = fields?.[TEST_FLAG_FIELD];
  return flag === true || String(flag ?? "").trim().toLowerCase() === "true";
}

/**
 * A flagged row with no usable address gets no redirect. The alternative —
 * falling back to the real assignee — would mail a real approver from a run the
 * builder believes is a rehearsal, which is the one outcome this feature exists
 * to prevent. The mail simply does not go out, and the trail records why.
 */
export function readTestRunRedirect(
  fields: Record<string, unknown> | undefined,
): TestRunRedirect | undefined {
  if (!isTestRow(fields)) return undefined;
  const testEmail = String(fields?.[TEST_EMAIL_FIELD] ?? "").trim().toLowerCase();
  return EMAIL_RE.test(testEmail) ? { testEmail } : undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_utils/testRun.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add api/_utils/testRun.ts api/_utils/testRun.test.ts && git commit -m "Recover a test run's redirect from the row after the ticket expires"
```

---

### Task 7: Mint a ticket and provision the columns

The mint is the authenticated end of the feature: it is where "you are a Form Builder Superuser" is checked, and — because column creation needs the caller's delegated SharePoint token, which only exists on an authenticated request — it is also where the three new columns get provisioned.

**Files:**
- Modify: `api/submit-form.ts` (handler entry, before the public-submission path)
- Test: `api/_utils/testRunActions.test.ts` (create)
- Create: `api/_utils/testRunActions.ts`

**Interfaces:**
- Consumes: `mintTestTicket` (Task 1), `TEST_FLAG_FIELD`, `TEST_EMAIL_FIELD` (Task 6), `TEST_RUN_LOG_FIELD` (Task 3), `resolveHrFormsOwner` from `./hrFormsOwner.js`, `ensureTextFieldViaSPRest` from `./sharepointRest.js`.
- Produces:
  - `handleMintTestTicket(body, deps): Promise<{ status: number; payload: Record<string, unknown> }>` where
    `deps = { resolveOwner(token: string): Promise<string | null>; ensureColumn(token: string, list: string, name: string): Promise<void> }`
  - `TEST_RUN_COLUMNS: string[]`

Keeping the handler as a plain function over injected `deps`, rather than reaching for Graph itself, is what makes it testable without a live tenant — the same shape `api/_utils/careerPortalAccess.ts` uses.

- [ ] **Step 1: Write the failing test**

Create `api/_utils/testRunActions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleMintTestTicket, TEST_RUN_COLUMNS } from "./testRunActions.js";
import { verifyTestTicket } from "./testRun.js";

function deps(owner: string | null = "hr@pmw-group.com") {
  return {
    resolveOwner: vi.fn(async () => owner),
    ensureColumn: vi.fn(async () => {}),
  };
}

const BODY = {
  action: "mint-test-ticket",
  slug: "leave-application",
  listTitle: "Leave Application",
  testEmail: "tester@pmw-group.com",
  delegatedToken: "delegated",
};

describe("minting a test ticket", () => {
  beforeEach(() => {
    process.env.API_SECRET_KEY = "secret-for-tests";
  });

  it("hands a superuser a ticket for the form they asked about", async () => {
    const result = await handleMintTestTicket(BODY, deps());
    expect(result.status).toBe(200);
    expect(verifyTestTicket(result.payload.ticket, "leave-application")).toMatchObject({
      testEmail: "tester@pmw-group.com",
      issuedBy: "hr@pmw-group.com",
    });
  });

  it("refuses anyone who is not an HR Forms Owner", async () => {
    const result = await handleMintTestTicket(BODY, deps(null));
    expect(result.status).toBe(403);
    expect(result.payload.ticket).toBeUndefined();
  });

  it("refuses a request with no delegated token to identify the caller", async () => {
    const result = await handleMintTestTicket({ ...BODY, delegatedToken: "" }, deps());
    expect(result.status).toBe(401);
  });

  it("refuses an address it could not redirect mail to", async () => {
    const result = await handleMintTestTicket({ ...BODY, testEmail: "nope" }, deps());
    expect(result.status).toBe(400);
    expect(String(result.payload.error)).toContain("email");
  });

  it("provisions the test columns with the caller's own token, not an app-only one", async () => {
    const d = deps();
    await handleMintTestTicket(BODY, d);
    for (const column of TEST_RUN_COLUMNS) {
      expect(d.ensureColumn).toHaveBeenCalledWith("delegated", "Leave Application", column);
    }
  });

  it("does not hand out a ticket when the columns could not be created", async () => {
    const d = deps();
    d.ensureColumn.mockRejectedValueOnce(new Error("403 accessDenied"));
    const result = await handleMintTestTicket(BODY, d);
    expect(result.status).toBe(500);
    expect(result.payload.ticket).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_utils/testRunActions.test.ts`
Expected: FAIL — cannot resolve `./testRunActions.js`.

- [ ] **Step 3: Write minimal implementation**

Create `api/_utils/testRunActions.ts`:

```ts
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
import { TEST_RUN_LOG_FIELD } from "./testRunTrail.js";

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_utils/testRunActions.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Wire the action into the existing endpoint**

In `api/submit-form.ts`, immediately after the API-key check and before the submission body is parsed, add:

```ts
  if (req.method === "POST" && (req.body as Record<string, unknown>)?.action === "mint-test-ticket") {
    const result = await handleMintTestTicket(req.body as Record<string, unknown>, {
      resolveOwner: resolveHrFormsOwner,
      ensureColumn: (token, listTitle, column) => ensureTextFieldViaSPRest(token, listTitle, column, column),
    });
    return res.status(result.status).json(result.payload);
  }
```

with the matching imports. Confirm the argument order of `ensureTextFieldViaSPRest` against `api/_utils/sharepointRest.ts` and against its existing call in `api/_utils/internalAccounts.ts:271` before writing this — do not assume it from the snippet.

- [ ] **Step 6: Verify no thirteenth function appeared**

Run: `npx vitest run api/_utils/deploymentLimits.test.ts && npx tsc -b`
Expected: PASS — still 12 functions.

- [ ] **Step 7: Commit**

```bash
git add api/_utils/testRunActions.ts api/_utils/testRunActions.test.ts api/submit-form.ts && git commit -m "Let a superuser mint a test ticket and provision the test columns"
```

---

### Task 8: Run a test submission through submit-form

**Files:**
- Modify: `api/submit-form.ts`
- Test: `api/_utils/testRunSubmission.test.ts` (create)

**Interfaces:**
- Consumes: `verifyTestTicket`, `testRunFieldsFor`, `readTestRunRedirect` (Tasks 1, 6); `appendTestRunStep` (Task 3); `allocateReferenceNumber({ isTest })` (Task 4); `WorkflowEmailContext.testRun` (Task 5).
- Produces: `recordTestRunStep(token, listTitle, itemId, step, deps)` exported from `api/_utils/testRunActions.ts`, used by Tasks 9 and 11.

- [ ] **Step 1: Write the failing test for the step recorder**

Append to `api/_utils/testRunActions.test.ts`:

```ts
import { recordTestRunStep } from "./testRunActions.js";
import { parseTestRunTrail } from "./testRunTrail.js";

describe("recording a step on a run", () => {
  function trailDeps(existing = "") {
    const written: Record<string, unknown>[] = [];
    return {
      written,
      readItem: vi.fn(async () => ({ fields: { TestRunLog: existing } })),
      updateFields: vi.fn(async (_t: string, _l: string, _i: string, fields: Record<string, unknown>) => {
        written.push(fields);
      }),
    };
  }

  it("adds the step to the run's trail", async () => {
    const d = trailDeps();
    await recordTestRunStep("token", "Leave Application", "42", { step: "row", label: "Response row created", status: "pass", order: 4 }, d);
    expect(parseTestRunTrail(d.written[0].TestRunLog).row.status).toBe("pass");
  });

  it("keeps the steps already recorded", async () => {
    const d = trailDeps(JSON.stringify({ ticket: { step: "ticket", label: "Ticket validated", status: "pass", at: "", order: 1 } }));
    await recordTestRunStep("token", "Leave Application", "42", { step: "row", label: "Response row created", status: "pass", order: 4 }, d);
    expect(Object.keys(parseTestRunTrail(d.written[0].TestRunLog)).sort()).toEqual(["row", "ticket"]);
  });

  it("never fails the submission it is only reporting on", async () => {
    const d = trailDeps();
    d.updateFields.mockRejectedValueOnce(new Error("SharePoint said no"));
    await expect(
      recordTestRunStep("token", "Leave Application", "42", { step: "row", label: "l", status: "pass", order: 4 }, d),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_utils/testRunActions.test.ts`
Expected: FAIL — `recordTestRunStep` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `api/_utils/testRunActions.ts`:

```ts
import { appendTestRunStep, TEST_RUN_LOG_FIELD, type TestRunStep } from "./testRunTrail.js";
import { logWarn } from "./logger.js";

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
  try {
    const item = await deps.readItem(token, listTitle, itemId);
    await deps.updateFields(token, listTitle, itemId, {
      [TEST_RUN_LOG_FIELD]: appendTestRunStep(item?.fields?.[TEST_RUN_LOG_FIELD], step),
    });
  } catch (error) {
    logWarn("api:test-run", "Could not record a test run step", {
      listTitle,
      step: step.step,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_utils/testRunActions.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit the recorder**

```bash
git add api/_utils/testRunActions.ts api/_utils/testRunActions.test.ts && git commit -m "Append a run step without ever failing the submission it reports on"
```

- [ ] **Step 6: Wire test mode into the submission path**

In `api/submit-form.ts`, in the public submission handler:

1. Right after the form config is loaded and the slug is known:

```ts
  const testTicket = verifyTestTicket((req.body as Record<string, unknown>)?.testTicket, valueToText(formConfig.Slug));
  const testRedirect = testTicket ? { testEmail: testTicket.testEmail } : undefined;
```

2. Merge `testTicket ? testRunFieldsFor(testTicket) : {}` into the fields written by `createSubmissionItem`, so `IsTest` and `TestEmail` land on the row as it is created rather than in a later patch that could fail after the mail has gone.

3. Pass `isTest: Boolean(testTicket)` to `allocateReferenceNumber`.

4. Pass `testRun: testRedirect` in every `WorkflowEmailContext` this file builds — the `scheduleOrDeliverWorkflowEmail` calls around `api/submit-form.ts:1700-1760` and `sendManualPaperWorkflowEmail`. Grep for `listTitle,` inside context literals to find them all; the typecheck will not catch a missed one because the property is optional.

5. After the row is created, and only when `testTicket` is set, record the early steps with `recordTestRunStep(token, listTitle, parentId, …, { readItem: queryListItemById, updateFields: updateListItemFields })`:

| step id | order | label | status |
|---|---|---|---|
| `ticket` | 1 | `Test ticket validated` | `pass`, detail `Issued by ${testTicket.issuedBy}` |
| `answers` | 2 | `Answers accepted` | `pass` |
| `reference` | 3 | `Reference number allocated` | `pass` with the reference as detail, or `fail` with the error |
| `row` | 4 | `Response row created` | `pass`, detail `Item ${parentId}` |
| `fields` | 5 | `All answers stored` | `pass`, or `warn` listing the field names the schema rejected |
| `attachments` | 6 | `Attachments and signature stored` | `pass`, `skip` when the form has none, `fail` on error |
| `matrix` | 7 | `Matrix rows written` | `pass`, or `skip` when the form has no matrix |
| `layer-{n}-routing` | `10 * n` | `Layer {n} routed` | `pass` with the resolved production addresses as detail, `fail` with the resolver error |
| `layer-{n}-email` | `10 * n + 1` | `Layer {n} email sent` | `pass` with `to ${testEmail}`, `fail` with the send error |

For step `fields`, the rejected field names are already known: `patchFieldWithFallback` and the `logWarn("api:submit-form", "Submitted field missing from response list schema", …)` call near `api/submit-form.ts:927` are where a field is dropped. Collect those names into an array as they happen and report them in one `warn` entry — surfacing what is currently only visible in server logs is much of the trail's value.

- [ ] **Step 7: Verify by hand-tracing plus the suite**

Run: `npx vitest run && npx tsc -b`
Expected: PASS. Then re-read the diff and confirm every `WorkflowEmailContext` literal in the file carries `testRun`.

- [ ] **Step 8: Commit**

```bash
git add api/submit-form.ts && git commit -m "Route a ticketed submission as a test run and record its first steps"
```

---

### Task 9: Keep the redirect through the remaining layers

**Files:**
- Modify: `api/evaluate.ts`, `api/workflow-email-cron.ts`
- Test: `api/_utils/workflowEmailCron.test.ts`

**Interfaces:**
- Consumes: `readTestRunRedirect` (Task 6), `recordTestRunStep` (Task 8).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Append to `api/_utils/workflowEmailCron.test.ts`, matching its existing harness:

```ts
it("still redirects a deferred test-run email, long after the ticket expired", async () => {
  // A row flagged as a test, with a schedule entry due now and no ticket anywhere.
  const sent = await runCronWith({
    fields: { IsTest: "true", TestEmail: "tester@pmw-group.com" },
    schedule: { "2": { layer: 2, recipient: "hod@pmw-group.com", dueAt: "2026-08-26T00:00:00Z", status: "scheduled" } },
  });
  expect(sent[0].to).toBe("tester@pmw-group.com");
});

it("leaves a production deferred email addressed to its real recipient", async () => {
  const sent = await runCronWith({
    fields: {},
    schedule: { "2": { layer: 2, recipient: "hod@pmw-group.com", dueAt: "2026-08-26T00:00:00Z", status: "scheduled" } },
  });
  expect(sent[0].to).toBe("hod@pmw-group.com");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_utils/workflowEmailCron.test.ts`
Expected: FAIL — the deferred test email goes to `hod@pmw-group.com`.

- [ ] **Step 3: Write minimal implementation**

In `api/workflow-email-cron.ts`, the item's fields are already loaded to read `WorkflowEmailSchedule`. Pass `testRun: readTestRunRedirect(item.fields)` on the `WorkflowEmailContext` it hands to `deliverWorkflowEmail`.

In `api/evaluate.ts`, the response item is already loaded before the next layer's mail is built (around `api/evaluate.ts:800-900`). Add once, near that load:

```ts
  const testRun = readTestRunRedirect(responseItem?.fields);
```

and pass `testRun` on every `WorkflowEmailContext` built in the file. Then, when `testRun` is set, record the decision and the next layer's dispatch:

- `layer-{n}-decision`, order `10 * n + 2`, label `Layer {n} decision recorded`, `pass`, detail `${action} by ${actor || "the tester"}`.
- `final-status`, order `1000`, label `Final status set`, `pass`, detail = the status written — recorded only when no next layer follows.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/evaluate.ts api/workflow-email-cron.ts api/_utils/workflowEmailCron.test.ts && git commit -m "Carry a test run's redirect through every layer after the first"
```

---

### Task 10: Keep test runs out of production views

**Files:**
- Modify: `src/utils/submissionFilters.ts`, `src/components/builder/SubmissionFilterPanel.tsx`, `src/components/builder/ApprovalDashboard.tsx`, `src/components/builder/ResponseViewer.tsx`
- Test: `src/utils/__tests__/submissionFilters.test.ts` (or wherever the existing filter tests live — find them first with `npx vitest run submissionFilters`)

**Interfaces:**
- Consumes: `isTestRow` semantics from Task 6 — but implement the `src` side against the same `IsTest` column; do not import from `api/`.
- Produces: `SubmissionFilters` gains `includeTestRuns: boolean` (default `false`); `FilterableRecord` gains `isTest: boolean`.

- [ ] **Step 1: Read the existing filter model and its tests**

Run: `sed -n 40,200p src/utils/submissionFilters.ts` and locate its test file. Every adapter that builds a `FilterableRecord` must be found now — grep for the adapter type name — because a missed adapter silently reports every row as production.

- [ ] **Step 2: Write the failing test**

Add to the filter test file:

```ts
describe("test runs", () => {
  it("hides a test run from an ordinary listing", () => {
    expect(matchesFilters(record({ isTest: true }), defaultFilters())).toBe(false);
  });

  it("shows production submissions as it always did", () => {
    expect(matchesFilters(record({ isTest: false }), defaultFilters())).toBe(true);
  });

  it("shows test runs once they are asked for", () => {
    expect(matchesFilters(record({ isTest: true }), { ...defaultFilters(), includeTestRuns: true })).toBe(true);
  });

  it("keeps showing production submissions alongside them", () => {
    expect(matchesFilters(record({ isTest: false }), { ...defaultFilters(), includeTestRuns: true })).toBe(true);
  });

  it("treats a submission from before the column existed as production", () => {
    expect(matchesFilters(record({ isTest: undefined as unknown as boolean }), defaultFilters())).toBe(true);
  });
});
```

Name the helpers to match whatever the existing tests in that file already use.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run submissionFilters`
Expected: FAIL — `includeTestRuns` is not part of the filter model.

- [ ] **Step 4: Write minimal implementation**

Add `includeTestRuns: boolean` to the filter interface and to its empty/default factory with `false`, add `isTest: boolean` to `FilterableRecord`, and add the check as the first clause of the matcher:

```ts
  // Universal, and outside the form → profile → version hierarchy: a test run is
  // hidden regardless of which form it belongs to. Default-off because a real
  // approver opening the dashboard must not be offered a rehearsal to act on.
  if (record.isTest && !filters.includeTestRuns) return false;
```

Update every adapter to set `isTest` from the row's `IsTest` field with the same tolerant reading as `isTestRow` (`true`, `"true"`, `"TRUE"`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run && npx tsc -b`
Expected: PASS.

- [ ] **Step 6: Add the toggle and the badge**

In `SubmissionFilterPanel.tsx` add a `Show test runs` switch bound to `includeTestRuns`, placed with the other universal facets rather than inside the form hierarchy. In `ApprovalDashboard.tsx` and `ResponseViewer.tsx` render a red `TEST` `Chip` on any row whose `isTest` is true.

- [ ] **Step 7: Guard the dashboard action**

In `ApprovalDashboard.tsx`, refuse an approve/reject/evaluate action on a row with `isTest` true while `includeTestRuns` is false, with the message `This is a test run. Turn on "Show test runs" to act on it.` The real assignee addresses stay in the layer columns, so without this a production approver who reaches the row could action a rehearsal.

- [ ] **Step 8: Commit**

```bash
git add src/utils/submissionFilters.ts src/components/builder/ && git commit -m "Hide test runs from production listings unless they are asked for"
```

---

### Task 11: Launch a test run from the builder

**Files:**
- Create: `src/components/builder/TestRunLauncher.tsx`, `src/utils/testRunLaunch.ts`, `src/utils/__tests__/testRunLaunch.test.ts`
- Modify: `src/components/builder/FormLibrary.tsx`, `src/pages/DynamicFormPage.tsx`

**Interfaces:**
- Consumes: the `mint-test-ticket` action from Task 7.
- Produces:
  - `sampleAnswersFor(surveyJson: Record<string, unknown>): Record<string, unknown>`
  - `testRunFormUrl(params: { slug: string; ticket: string; isPublic: boolean }): string`

- [ ] **Step 1: Write the failing test for the pure parts**

Create `src/utils/__tests__/testRunLaunch.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { sampleAnswersFor, testRunFormUrl } from "../testRunLaunch";

describe("sample answers", () => {
  it("fills a text question with something a reviewer can recognise as a test", () => {
    const answers = sampleAnswersFor({ pages: [{ elements: [{ type: "text", name: "reason" }] }] });
    expect(String(answers.reason)).toContain("Test");
  });

  it("picks the first offered choice, so branching starts somewhere valid", () => {
    const answers = sampleAnswersFor({
      pages: [{ elements: [{ type: "dropdown", name: "branch", choices: ["Managerial", "Non-managerial"] }] }],
    });
    expect(answers.branch).toBe("Managerial");
  });

  it("gives a number question a number and a date question a date", () => {
    const answers = sampleAnswersFor({
      pages: [{ elements: [{ type: "text", name: "days", inputType: "number" }, { type: "text", name: "start", inputType: "date" }] }],
    });
    expect(typeof answers.days).toBe("number");
    expect(String(answers.start)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("leaves a question type it does not understand unanswered rather than guessing", () => {
    expect(sampleAnswersFor({ pages: [{ elements: [{ type: "signaturepad", name: "sign" }] }] })).toEqual({});
  });

  it("survives a form with no pages at all", () => {
    expect(sampleAnswersFor({})).toEqual({});
  });
});

describe("test run url", () => {
  it("opens the public respondent view for a public form", () => {
    const url = testRunFormUrl({ slug: "leave-application", ticket: "abc.def", isPublic: true });
    expect(url).toContain("/form/leave-application");
    expect(url).toContain("testTicket=abc.def");
  });

  it("opens the signed-in view otherwise", () => {
    expect(testRunFormUrl({ slug: "leave-application", ticket: "abc.def", isPublic: false })).toContain("/forms/leave-application");
  });
});
```

Before writing the implementation, confirm the two real route paths from `src/App.tsx` and correct the expectations above to match them — the paths in this test are a placeholder for whatever the router actually declares, and they are the one thing here worth checking rather than assuming.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run testRunLaunch`
Expected: FAIL — cannot resolve `../testRunLaunch`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/testRunLaunch.ts` implementing both functions. Walk `surveyJson.pages[].elements[]`; map `text` to `"Test answer — {name}"`, `text` with `inputType: "number"` to `1`, `inputType: "date"` to today in `YYYY-MM-DD`, `comment` to a sentence, `dropdown`/`radiogroup`/`checkbox` to the first choice (handling both `"A"` and `{ value, text }` choice shapes), `boolean` to `true`, `rating` to the midpoint. Return nothing for any other type — a wrong guess for a signature or file question is worse than an empty field the tester fills in themselves.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run testRunLaunch && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Build the launcher dialog**

`TestRunLauncher.tsx`: a dialog with one email field (defaulting to the signed-in user's address), an explanation that every email from this run goes only to that address and the run will not appear in normal listings, and a **Start test run** button. On submit it POSTs `{ action: "mint-test-ticket", slug, listTitle, testEmail, delegatedToken }` to `/api/submit-form` with the `X-Api-Key` header the other client calls use, then opens `testRunFormUrl(...)` in a new tab. Surface the API's `error` text on a non-200 verbatim — "Could not prepare this form's response list for test runs" is the message that tells an admin their delegated token lacked permission.

Add a **Test workflow** menu item per form in `FormLibrary.tsx`, shown only to a Form Builder Superuser, enabled for drafts as well as published forms.

- [ ] **Step 6: Honour the ticket on the form page**

In `DynamicFormPage.tsx`: read `testTicket` from the query string; when present, prefill answers with `sampleAnswersFor(surveyJson)`, render a fixed red **TEST RUN — emails go only to {address}** banner that cannot be dismissed, and include `testTicket` in the `/api/submit-form` body. The address to display comes back from the mint call and is passed through the URL as a display-only parameter; the server reads the authoritative one out of the signed ticket, never from the query string.

- [ ] **Step 7: Verify in the browser**

Start the dev server via the preview tooling, open a form with `?testTicket=` absent and confirm nothing changed, then with a real ticket and confirm the banner and prefill appear.

- [ ] **Step 8: Commit**

```bash
git add src/utils/testRunLaunch.ts src/utils/__tests__/testRunLaunch.test.ts src/components/builder/TestRunLauncher.tsx src/components/builder/FormLibrary.tsx src/pages/DynamicFormPage.tsx && git commit -m "Start a test run from the builder and mark the form while it runs"
```

---

### Task 12: The Test runs panel, the PDF check, and deletion

**Files:**
- Create: `src/components/builder/TestRunPanel.tsx`
- Modify: `src/components/builder/FormBuilder.tsx` (or wherever the form's side panels are hosted — confirm first), `api/_utils/testRunActions.ts`, `api/submit-form.ts`
- Test: `api/_utils/testRunActions.test.ts`

**Interfaces:**
- Consumes: `orderedTestRunSteps`, `testRunOutcome`, `parseTestRunTrail` (Task 3, `src` copy); `generateFormPdf` from `src/utils/generateFormPdf.ts`.
- Produces: `handleDeleteTestRuns(body, deps)` on `api/_utils/testRunActions.ts`.

- [ ] **Step 1: Write the failing test for deletion**

Append to `api/_utils/testRunActions.test.ts`:

```ts
import { handleDeleteTestRuns } from "./testRunActions.js";

function deleteDeps(rows: { id: string; fields: Record<string, unknown> }[], owner: string | null = "hr@pmw-group.com") {
  const deleted: string[] = [];
  return {
    deleted,
    resolveOwner: vi.fn(async () => owner),
    listRows: vi.fn(async () => rows),
    deleteRow: vi.fn(async (_t: string, _l: string, id: string) => { deleted.push(id); }),
  };
}

describe("deleting test runs", () => {
  const rows = [
    { id: "1", fields: { IsTest: "true" } },
    { id: "2", fields: {} },
    { id: "3", fields: { IsTest: "true" } },
  ];

  it("deletes only the runs that are flagged as tests", async () => {
    const d = deleteDeps(rows);
    const result = await handleDeleteTestRuns({ listTitle: "Leave Application", delegatedToken: "t" }, d);
    expect(result.status).toBe(200);
    expect(d.deleted.sort()).toEqual(["1", "3"]);
  });

  it("deletes one named run when asked for one", async () => {
    const d = deleteDeps(rows);
    await handleDeleteTestRuns({ listTitle: "Leave Application", delegatedToken: "t", itemId: "3" }, d);
    expect(d.deleted).toEqual(["3"]);
  });

  it("refuses to delete a production submission even when named directly", async () => {
    const d = deleteDeps(rows);
    const result = await handleDeleteTestRuns({ listTitle: "Leave Application", delegatedToken: "t", itemId: "2" }, d);
    expect(result.status).toBe(400);
    expect(d.deleted).toEqual([]);
  });

  it("refuses anyone who is not an HR Forms Owner", async () => {
    const d = deleteDeps(rows, null);
    const result = await handleDeleteTestRuns({ listTitle: "Leave Application", delegatedToken: "t" }, d);
    expect(result.status).toBe(403);
    expect(d.deleted).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_utils/testRunActions.test.ts`
Expected: FAIL — `handleDeleteTestRuns` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append `handleDeleteTestRuns` to `api/_utils/testRunActions.ts`, using `isTestRow` for the check. The refusal on an unflagged row is the important line — the delete action takes an item id from the browser, and without that check it becomes a way to delete any submission in the list.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_utils/testRunActions.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Wire the action in**

Add `action: "delete-test-runs"` to the same dispatch block in `api/submit-form.ts` as Task 7, with `resolveHrFormsOwner`, a `queryListItems` call filtered to the list, and `deleteListItem` as its deps. Re-run `npx vitest run api/_utils/deploymentLimits.test.ts`.

- [ ] **Step 6: Build the panel**

`TestRunPanel.tsx` lists the form's `IsTest` rows, newest first, each showing its reference, submitted time, current lifecycle stage, and — expanded — the checklist from `orderedTestRunSteps(parseTestRunTrail(row.TestRunLog))`. Render `pass` as a green check, `warn` amber with the detail, `fail` red with the detail, `skip` grey, `pending` as a spinner. Head each run with the `testRunOutcome` verdict. Give each run a delete button and the panel a **Clear all test runs** button, both confirming first.

- [ ] **Step 7: Add the PDF step**

The last step cannot be written by the server: PDFs are produced in the browser by `@react-pdf/renderer` through `src/utils/generateFormPdf.ts`. In the panel, a finished run shows **Render PDF**. Pressing it calls `generateFormPdf` for that submission, and:

- on success, opens the PDF in a new tab and records `{ step: "pdf", label: "PDF rendered", status: "pass", order: 1100, detail: \`${bytes} bytes\` }`;
- on failure, records `status: "fail"` with the error message and shows it inline.

Both write back through the `record-test-run-step` action — add it alongside the other two in Task 7's dispatch block, gated on `resolveHrFormsOwner` and on the target row being `isTestRow`, and delegating to `recordTestRunStep`. Before rendering, show the step as `pending` so a run in progress reads honestly.

- [ ] **Step 8: Verify in the browser**

Run a complete test run end to end against the dev server: start it from the builder, submit, approve each layer from the emails' links, then render the PDF, and confirm the checklist shows every step from `ticket` to `pdf`.

- [ ] **Step 9: Full verification**

Run: `npx vitest run && npx tsc -b && npm run lint`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add api/ src/components/builder/TestRunPanel.tsx src/components/builder/FormBuilder.tsx && git commit -m "Show a test run's checklist through to its rendered PDF"
```

---

### Task 13: Document the feature

**Files:**
- Modify: `api/AGENTS.md`, `src/components/builder/AGENTS.md`, `CONTEXT.md`

- [ ] **Step 1: Add the row to the api WHERE TO LOOK table**

```markdown
| Test runs | `_utils/testRun.ts`, `_utils/testRunActions.ts`, `_utils/testRunTrail.ts` | A rehearsal of a form's layer sequence. Layer resolution runs for real and the production addresses are written to `L{n}_Email` as usual; only the dispatch is redirected to the one address on the signed ticket. `IsTest`/`TestEmail` on the row carry the redirect past the ticket's expiry, so `evaluate.ts` and the cron keep honouring it. `TestRunLog` holds the pass/fail checklist. Ticket mint, run deletion, and step recording ride on `submit-form.ts` as actions because `api/` is at the 12-function cap. |
```

- [ ] **Step 2: Add the Language entry to CONTEXT.md**

```markdown
**Test Run**:
A rehearsal submission through a form's real layer sequence, where every email is
redirected to one address the tester nominates. It is flagged on the response
row, hidden from production listings by default, and carries a pass/fail
checklist of every step it took.
_Avoid_: Treating a test run as a real submission, or calling a preview of the
form a test run
```

- [ ] **Step 3: Note the builder panel in `src/components/builder/AGENTS.md`**

Follow that file's existing table format.

- [ ] **Step 4: Commit**

```bash
git add api/AGENTS.md src/components/builder/AGENTS.md CONTEXT.md && git commit -m "Document test runs for the next person to touch this"
```

---

## Verification checklist

Before calling the feature done, confirm each by running the command and reading the output, not by assuming:

- [ ] `npx vitest run` — whole suite green.
- [ ] `npx tsc -b` — clean; this is what the Vercel build runs.
- [ ] `npm run lint` — clean.
- [ ] `npx vitest run api/_utils/deploymentLimits.test.ts` — still 12 functions.
- [ ] A complete run in the browser: launched from the builder, all layers approved from the emails, PDF rendered, checklist complete.
- [ ] Grep the diff for `WorkflowEmailContext` literals and confirm every one in `submit-form.ts`, `evaluate.ts`, and `workflow-email-cron.ts` passes `testRun`.
- [ ] A production submission on the same form is unchanged: real reference series, real recipients, absent from the Test runs panel.

# Pre-send Routing Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before any "please act" email for the Training Evaluation Form, check the step's saved people against routing; correct a mismatch, hold when routing has no answer, and log every check on the submission.

**Architecture:** The "what does routing pick" rules move out of `ApprovalDashboard.tsx` into one ports-based module mirrored between `src/utils` and `api/_utils`. A server-only runner (`preSendRoutingCheck.ts`) re-reads the row, applies the verdict, writes the correction/hold and the log, and returns the recipients to use. Every send path calls the runner before it builds its message.

**Tech Stack:** TypeScript ~6 (`erasableSyntaxOnly`, `verbatimModuleSyntax`), Vercel serverless functions, Microsoft Graph via `api/_utils/graphClient.ts`, React 19, vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-pre-send-routing-check-design.md` (read it, including "Clarifications after the builder read", which overrides earlier sections).

## Global Constraints

- No new file directly under `api/` (12-function cap). New server code goes in `api/_utils/`.
- No new SharePoint column. The log lives in `WorkflowAssignmentData`.
- Mirrored files (`src/utils/X.ts` and `api/_utils/X.ts`) must be identical below the header comment, each with an identity test in the style of `src/utils/__tests__/directoryHarvest.test.ts:630`. API imports end in `.js`.
- Source files are CRLF. No `console.*`, no `any`, no `@ts-ignore`, no `enum`, no `useMemo`/`useCallback`, relative imports only.
- A hand reassignment (`WorkflowAssignmentData` layer `source === "manual-override"`) is never changed.
- A check that throws never results in a send.
- Test runs (`isTestRow`) and forms not in `ROUTING_CHECKED_FORM_TITLES` are skipped: behaviour byte-for-byte as today.
- The check must never fail a submission or a recorded decision; it only holds an email.
- Verification for every task: `npx vitest run` and `npm run build` both pass.
- Do not commit unless the owner asks.

## Review Focus

1. Form title with different case/spacing ("training  evaluation form") is still checked. (Task 1)
2. A row whose `WorkflowAssignmentData` is blank, malformed JSON, or lacks `checks` still gets a log and keeps its `layers`. (Task 2)
3. Saved and routed lists that differ only in order, case or stand-in order are a match, not a correction. (Task 3)
4. Two due emails for one person where one is corrected to someone else: the summary grouping uses the corrected recipient. (Task 5)
5. A step held yesterday and still held today adds no second log line and no second HR notice. (Tasks 2, 4)

---

### Task 1: Which forms are checked

**Files:**
- Create: `src/utils/routingCheckedForms.ts`, `api/_utils/routingCheckedForms.ts` (mirror)
- Test: `src/utils/__tests__/routingCheckedForms.test.ts`

**Interfaces:**
- Produces: `ROUTING_CHECKED_FORM_TITLES: readonly string[]` (`["Training Evaluation Form"]`); `isRoutingCheckedForm(title: unknown): boolean` (case- and whitespace-insensitive, as `superuserOnlyForms.ts` matches).

- [ ] Test: `"Training Evaluation Form"`, `"TRAINING  EVALUATION form "` true; `"Training Needs Analysis"`, `""`, `undefined` false; the two files identical below the header.
- [ ] Implement both files. Run tests.

### Task 2: The check log inside `WorkflowAssignmentData`

**Files:**
- Modify: `src/utils/workflowAssignmentData.ts`
- Create: `api/_utils/workflowAssignmentData.ts` (mirror; today the server has no copy)
- Test: `src/utils/__tests__/workflowAssignmentData.test.ts` (extend or create)

**Interfaces:**
- Produces:
  ```ts
  export type RoutingCheckOutcome =
    | "match" | "corrected" | "left-alone" | "not-checkable"
    | "held-no-routing" | "held-check-failed";
  export type RoutingCheckTrigger =
    | "submission" | "step-advanced" | "daily-run" | "reminder"
    | "send-selected" | "send-now" | "link-reissue";
  export interface RoutingCheckEntry {
    at: string; firstAt?: string; layer: number;
    trigger: RoutingCheckTrigger; outcome: RoutingCheckOutcome;
    saved: string[]; routed: string[]; note?: string; how?: string; count?: number;
  }
  export const MAX_ROUTING_CHECKS = 60;
  // WorkflowAssignmentData gains: checks?: RoutingCheckEntry[]
  export function readRoutingChecks(raw: unknown): RoutingCheckEntry[];           // newest last
  export function recordRoutingCheck(raw: unknown, entry: RoutingCheckEntry):
    { data: WorkflowAssignmentData; isNew: boolean; count: number };
  ```
- `recordRoutingCheck`: if the latest entry **for that layer** has the same `outcome`, `saved` and `routed` (compared with `emailListsMatch`), bump its `count` (starting from 1), set `at`, keep `firstAt`, and return `isNew: false`; otherwise append with `isNew: true`. Trim to the newest 60.
- `parseWorkflowAssignmentData` and `setWorkflowAssignmentOverride` preserve `checks`. An absent `checks` is not written as an empty array.

- [ ] Tests: blank / malformed / no-`checks` input; `setWorkflowAssignmentOverride` keeps existing checks; repeat hold bumps `count` to 2 with `isNew: false`; a different outcome on the same layer appends; another layer's entry in between does not break de-duplication; the 61st entry drops the oldest; mirror identity.
- [ ] Implement. Run tests.

### Task 3: One shared "what routing picks" module, used by the dashboard

**Files:**
- Create: `src/utils/routingInspect.ts`, `api/_utils/routingInspect.ts` (mirror)
- Create: `api/_utils/evaluationSubmitterRouting.ts` (mirror of `src/utils/evaluationSubmitterRouting.ts`; change its type import so both copies compile, e.g. a local structural type for the layer/rule)
- Create: `api/_utils/routingCheck.ts` (mirror of `src/utils/routingCheck.ts`) if not importable as is
- Move: `resolutionContextFromItem`, `PreviousStep` into `src/utils/resolveAssignee.ts`'s neighbour `src/utils/resolutionContext.ts` + api mirror; `workflowChainContext.ts` re-exports them so existing imports keep working
- Modify: `src/components/builder/ApprovalDashboard.tsx` (`inspectLayerRouting`, `findApproverOfFormSubject` become thin callers)
- Test: `src/utils/__tests__/routingInspect.test.ts`

**Interfaces:**
- Consumes: `classifyLayerRouting`, `LayerRoutingVerdict` (`routingCheck.ts`); `ResolvableLayer`, `ResolvedLayerActors`, `DirectoryPerson`, `isDeferredAssignee`, `addStandIns` (`resolveAssignee.ts`); `resolveEvaluationSubmitterRouting`; `getWorkflowAssignment`; `isNeedsRoutingStatus`, `isManualPaperStatus` (`submissionLifecycle.ts`, mirror to api if absent).
- Produces:
  ```ts
  export interface RoutingInspectPorts {
    /** The shared resolver with this side's ports; `layer` may be the substituted one-hop chain layer. */
    resolveLayer(layer: ResolvableLayer, item: Record<string, unknown>):
      Promise<{ email: string; emails: string[]; error?: string; parked?: { reason: string }; explanation?: string }>;
    /** The employee the form is about, from its answers (approvalDirectory reader's lookupSubject). */
    lookupSubject(item: Record<string, unknown>): Promise<DirectoryPerson | null>;
    lookupPerson(email: string): Promise<DirectoryPerson | null>;
    /** Dedicated manual-paper address, lower-cased, or "". */
    paperMailbox: string;
  }
  export async function inspectLayerRouting(
    layer: ResolvableLayer & { title?: string; type?: string; manualPaperWhenSenderEmail?: boolean; submitterRoutingRules?: unknown[] },
    item: Record<string, unknown>,
    currentLayerNumber: number,
    ports: RoutingInspectPorts,
  ): Promise<{ verdict: LayerRoutingVerdict; routedPrimary: string }>;
  ```
- Rule order is the spec's Design section 1, items 1-8. The public-link branch (submitter not a person's address, step type `department-approver`) uses `lookupSubject` then that person's `approverEmail`; **every** routed answer passes through `addStandIns(..., { lookupPerson })` before comparison. Keep the existing user-facing note/how strings from `ApprovalDashboard.tsx:2358-2433` and `:762-781` word for word where the same situation applies.

- [ ] Tests (ports faked): manual override -> `manual`; Needs Routing status -> `unresolved`; deferred assignee ahead of current layer -> `waiting`; submitter rule naming an evaluator -> `match`/`mismatch` against it; rule sending to paper -> `unresolved`; department-approver + staff submitter resolves via one-hop chain layer (assert the layer handed to `resolveLayer` has `assignee.type === "chain"`, `hops: 1`, `fallback.mode === "park"`); GUEST submitter uses `lookupSubject`; subject with no approver -> `unresolved`; "Fell back ..." explanation -> `unresolved`; routed = paper mailbox -> `unresolved`; saved `B; a` vs routed `a, b` -> `match`; routed person with a stand-in vs saved "approver + PA" -> `match`; `resolveLayer` throwing -> `unresolved` with the error text; mirror identity for each mirrored file.
- [ ] Implement the module and mirrors.
- [ ] Switch `ApprovalDashboard.tsx` to call it with browser ports (`resolveLayerAssigneeEmail`, `createApprovalDirectoryReader(token, { layerConfig }).lookupSubject/lookupPerson`, `CONFIGURED_MANUAL_PAPER_EMAIL`). Delete the inlined logic. `handleFixRouting` writes `verdict.routed` (now including stand-ins).
- [ ] Run `src/utils/routingCheck.test.ts`, the new tests, and the build.

### Task 4: The server runner and the hold notice

**Files:**
- Create: `api/_utils/preSendRoutingCheck.ts`
- Modify: `api/_utils/workflowEmail.ts` (add `buildRoutingHoldNoticeEmail`)
- Test: `api/_utils/preSendRoutingCheck.test.ts`

**Interfaces:**
- Consumes: Task 1-3 exports; `queryListItemById`, `updateListItemFields`, `queryListItems` (`graphClient.ts`); `createApprovalDirectoryReader`; `resolveLayerAssignee` (`api/_utils/resolveAssignee.ts`) with the server ports used at `api/evaluate.ts:262-277`; `writeLayerRecipientFields`, `parseValidEmailList`; `isTestRow`; `parseWorkflowEmailSchedule`, `setWorkflowEmailSchedule`, `sendGraphEmail`; the per-submission layer-config lookup `api/evaluate.ts` uses at `:1009-1011` (extract to a shared helper in `api/_utils/` if it is inline) and `pickLayerByNumber` (`layerPick.ts`).
- Produces:
  ```ts
  export interface PreSendCheckCache { /* directory reader, Master Form rows and layer configs by version key */ }
  export function createPreSendCheckCache(token: string): PreSendCheckCache;
  export interface PreSendCheckResult {
    outcome: RoutingCheckOutcome | "skipped";
    /** true when the caller must not send the action email. */
    hold: boolean;
    /** Delivery list to use (L{n}_NotifyEmails after any correction); empty on hold. */
    recipients: string[];
    /** L{n}_Email after any correction. */
    primary: string;
    /** The row's fields after any write, for callers that go on to build a message. */
    fields: Record<string, unknown>;
    reason?: string;
  }
  export async function checkBeforeSend(token: string, params: {
    formTitle: string; itemId: string; layer: number;
    trigger: RoutingCheckTrigger; cache?: PreSendCheckCache;
    /** Row already in hand; re-read when omitted. */
    fields?: Record<string, unknown>;
  }): Promise<PreSendCheckResult>;
  export const FAILED_CHECKS_BEFORE_ATTENTION = 5;
  ```
- Behaviour per outcome: the spec's table in Design section 2 plus "Clarifications". Specifics the spec does not pin:
  - `corrected` patch: `writeLayerRecipientFields(patch, layer, verdict.routed, routedPrimary)`; `WorkflowAssignmentData` via `setWorkflowAssignmentOverride` with `source: "resolved"`, `reason: "Corrected automatically to match routing"`, `updatedBy: "SYSTEM"`; a `scheduled` schedule entry for the layer gets `recipient` = the new delivery list joined with `", "`, `dueAt` untouched.
  - `held-no-routing` patch: `L{n}_Status = "Needs Routing"`, actors cleared with `writeLayerRecipientFields(patch, layer, [])`, `RoutingNotes` gets `Layer {n}: {reason}` appended on its own line (separate best-effort patch, as `api/evaluate.ts:301`).
  - The log is written with `recordRoutingCheck` in its own patch after the decision; failure is `logWarn`ed and does not change the outcome, **except** `corrected`: the actor patch and the log go in one patch, and if that patch fails the result is `held-check-failed`.
  - Every call writes one `logWarn`-level-or-lower server line: form title, item id, layer, trigger, outcome. No email addresses in it (logger convention).
  - The HR notice (`buildRoutingHoldNoticeEmail`, to `process.env.HR_FORM_EMAIL_FROM_ADDRESS || process.env.EMAIL_FROM_ADDRESS`) is sent only when `recordRoutingCheck` returned `isNew: true` for `held-no-routing`, or when `count === FAILED_CHECKS_BEFORE_ATTENTION` for `held-check-failed`. No `followUp`. Best effort.
  - Any thrown error inside the runner is caught and returned as `held-check-failed` (logged on the row if the row can still be written).
- `buildRoutingHoldNoticeEmail(params: { formTitle; responseItemId; layer; totalLayers; layerType; reason; referenceNo?; applicantName?; submittedBy; kind: "no-routing" | "check-failing" }): WorkflowEmailMessage` - modelled on `buildLayerNeedsRoutingEmail`; intro for `no-routing`: "The request email for this step was not sent, because the Routing page has no approver for it. Open the submission in All Submissions and use Reconfigure this submission to name the person; the email goes out then." For `check-failing`: "The routing check for this step has failed five mornings in a row, so its email is still waiting. It will keep retrying."

- [ ] Tests (graph client, directory reader and `sendGraphEmail` mocked as in `api/_utils/workflowEmailCron.test.ts`): each outcome's patch and returned `recipients`/`hold`; other form -> `skipped`, zero Graph calls; test row -> `skipped`; manual override untouched and logged `left-alone`; resolver throws -> `held-check-failed`, `hold: true`, nothing sent; correction updates a scheduled recipient and keeps `dueAt`; second identical hold -> no second notice; 5th failed check -> one notice; missing HR address -> hold stands, no throw; cache -> directory read once across two calls.
- [ ] Implement. Run tests.

### Task 5: The daily run

**Files:**
- Modify: `api/workflow-email-cron.ts`
- Test: `api/_utils/workflowEmailCron.test.ts` (extend)

**Interfaces:**
- Consumes: `checkBeforeSend`, `createPreSendCheckCache`, `isRoutingCheckedForm`.

- [ ] One `createPreSendCheckCache(token)` per run and per `handleSendSelected` call.
- [ ] In the scan loop, for a checked form and a non-test row, call `checkBeforeSend(..., trigger: "daily-run")` for each due entry **before** the `digestCandidates.push` / `claimAndDeliver` at `:181-195`. On `hold`: skip the entry (leave it `scheduled`). Otherwise replace `entry.recipient` with `result.recipients.join(", ")` and `item.fields` with `result.fields` before grouping/delivery.
- [ ] Same before a reminder candidate is built at `:200-223` (`trigger: "reminder"`); on hold, no reminder.
- [ ] Same in `handleSendSelected` (`trigger: "send-selected"`); a hold adds `"{form} #{id}: on hold - {reason}"` to `skipped`.
- [ ] For a checked form, a due entry whose step status is Needs Routing or manual-paper is not delivered as an action email (it comes back `not-checkable`; treat `not-checkable` with a parked status as skip).
- [ ] Tests: correction regroups (two entries for A, one corrected to B -> A gets a single email, B gets a single email, no summary); held entry stays `scheduled` and `deliverWorkflowEmail` is not called for it; an unchecked form's run is unchanged (existing tests untouched and green); directory read once for 3 checked rows.

### Task 6: Submission and step advance

**Files:**
- Modify: `api/submit-form.ts` (the two action-email sites near `:2271` and `:2325`), `api/evaluate.ts` (`:1340-1470`)
- Test: extend `api/_utils/submitFormParkedRouting.test.ts` or add `api/_utils/preSendHooks.test.ts`, following how those tests drive the handlers

**Interfaces:**
- Consumes: `checkBeforeSend`.

- [ ] `evaluate.ts`: after `resolveDeferredNextLayer`, for a checked form and non-test row call `checkBeforeSend(trigger: "step-advanced")`; use `result.recipients` / `result.primary` / `result.fields` for the recipient, stand-in note and `nextStatus`. `held-no-routing`: send nothing further (the runner's HR notice is the notice). `held-check-failed`: `persistWorkflowEmailSchedule` a `scheduled` entry due `nextDigestRunAt(now)` with the built `reviewLink`, so the daily run retries. Wrapped so a throw cannot undo the recorded decision.
- [ ] `submit-form.ts`: same after the row is created, `trigger: "submission"`, before the first step's `scheduleOrDeliverWorkflowEmail`, including when the email is only scheduled (then a hold just leaves the schedule entry as written).
- [ ] Tests: advance with a mismatch mails the routed person; advance with no routing answer mails no reviewer and returns success to the approver; failed check writes a `scheduled` entry and returns success.

### Task 7: Browser-driven sends and reissued links

**Files:**
- Modify: `api/send-email.ts` (`:152-222`), `api/_utils/linkReissue.ts`, `src/utils/formBuilderSP.ts` (`triggerApprovalNotification` reads the new `held` answer), `src/components/builder/ApprovalDashboard.tsx` (resend shows the hold reason)
- Test: `api/_utils/sendEmailWorkflowRedirect.test.ts` (extend), `api/_utils/linkReissue.test.ts` (extend)

- [ ] `send-email.ts`: only when `followUp === true` (a request to act), the workflow context is present and `isRoutingCheckedForm(listTitle)`: a row lookup failure answers `200 { ok: true, held: "check-failed" }` without sending (the send-anyway fallback stays for other forms); otherwise `checkBeforeSend(trigger: "send-now")`. `hold` -> `200 { ok: true, held: outcome, reason }`. `corrected` -> rebuild with `buildWorkflowActionEmail` from `result.fields` (reference, applicant, training title, submitter name, stand-in note, review link from the row's schedule entry or rebuilt as `evaluate.ts:1386` does) and deliver to `result.recipients`. Other outcomes -> send the browser's message unchanged.
- [ ] `linkReissue.ts`: before sending, same check with `trigger: "link-reissue"`; on hold return the same generic answer as today without sending.
- [ ] Browser: when `/api/send-email` answers `held`, the caller shows "Not sent: {reason}. The step is on hold until routing is set." instead of the sent notice; a signed-in submission still completes.
- [ ] Tests: unchecked form + lookup failure still sends; checked form + lookup failure does not; corrected rebuild addresses the routed people; reissue on hold sends nothing and answers as before.

### Task 8: What the admin sees

**Files:**
- Modify: `src/components/builder/RoutingCheckPanel.tsx`, `src/components/builder/ApprovalDashboard.tsx` (pass `checks`), `src/utils/emailScheduleOverview.ts` + its test
- Create: `src/utils/routingCheckLabels.ts` + test (labels, pure)

**Interfaces:**
- Produces: `routingCheckOutcomeLabel(outcome)`: `match` "Matches routing", `corrected` "Corrected", `left-alone` "Set by hand, left alone", `not-checkable` "Not checked yet", `held-no-routing` "On hold: routing has no answer", `held-check-failed` "On hold: could not check, will retry". `routingCheckTriggerLabel(trigger)`: "submission", "after the previous step", "daily run", "reminder", "send selected now", "send now", "new link request".
- `RoutingCheckPanel` gains prop `autoChecks: RoutingCheckEntry[]` and renders "Automatic checks", newest first, per the spec's sketch: date/time (Malaysian, the format the panel's neighbours use), "Step {n}: {title}", label, trigger; for `corrected` "Was: ... Now: ..."; `how` / `note` beneath; "x{count}, first {firstAt}" when `count > 1`. Empty: "No automatic checks yet." Inline styles via `C`, no MUI.
- `compileEmailSchedule`: a scheduled entry whose step's latest check is `held-*` goes under "Needs attention" with the label above.

- [ ] Label tests; `compileEmailSchedule` test for the held entry.
- [ ] Verify in the browser preview only if a signed-in session is available; otherwise say it was not seen live.

### Task 9: Documentation and full verification

- [ ] Root `AGENTS.md`: new gotcha section "Routing check before a request email (Training Evaluation)" - what runs where, outcomes, the log's home in `WorkflowAssignmentData.checks`, the mirrors to keep in step, how a hold is released. Update `api/AGENTS.md` and `src/utils/AGENTS.md` tables for the new files.
- [ ] `npx vitest run` - all pass. `npm run build` - passes. `npm run lint` - no new errors in touched files.
- [ ] Report to the owner: what was verified by tests, and that live proof is the first real daily run (test runs skip the check).

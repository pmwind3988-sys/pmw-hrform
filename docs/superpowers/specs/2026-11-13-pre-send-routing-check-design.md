# Automatic routing check before a Training Evaluation request email

Date: 2026-11-13. Status: awaiting owner approval.

## Intent and why

A Training Evaluation step is assigned to a person when the form is submitted,
but its request email can go out much later: the Head of Department is asked to
evaluate three months after the course. In that time the Routing page (Approval
Directory) can change, so the email goes to whoever was saved at submission,
who may no longer be the right person, and that person is the one allowed to
act.

Today an admin can open a submission in All Submissions, press "Check routing"
and "Fix" a step that no longer matches. Nothing does this automatically.

The owner wants: before any email asking someone to approve or evaluate a
Training Evaluation, the system checks the saved person against routing.
Same: send. Different: correct it, then send to the right person. Routing has
no answer: hold. Every check is logged.

## Goals

- Every "please act" email for the Training Evaluation Form is preceded by the
  check, on every path that can send one.
- A mismatch is corrected exactly as the manual "Fix" corrects it.
- No routing answer puts the step on hold; nothing reaches a reviewer.
- Each check leaves a record an admin can read on the submission.
- One set of rules decides "what routing picks", shared by the manual check
  and the automatic one.

## Non-goals

- Other forms. Built so a form can be switched on by adding its title to one
  list, but only "Training Evaluation Form" is on.
- Outcome emails, routing notices and paper notices (nobody is asked to act
  online).
- Changing how routing itself resolves, or the Routing page.
- A bulk "re-check everything now" button. The existing Workflow check page
  and the per-submission button remain.

## Anti-goals

- **Never undo a hand reassignment.** A step an admin reassigned by hand
  (`WorkflowAssignmentData` source `manual-override`) is left alone and logged
  as such. Decided by the owner.
- **Never send when the check could not run.** A check that errors is not a
  "match".
- **Never a reason a submission or an approval fails.** The check runs after
  the row is saved / the decision recorded; its failure holds an email, not
  the transaction.
- **No fourth copy of routing logic** (root AGENTS.md).
- **No new SharePoint column.** The app-only principal cannot create columns,
  and republishing this form is not a safe no-op (the live route serves
  publish profile `150726`).
- Test runs are not touched: every step belongs to the tester.

## Constraints found in the code

- `api/` is at the 12-function cap: no new file directly under `api/`, only
  `api/_utils/` modules and hooks in existing routes.
- The cron scan has a 40s budget and delivery 55s. The check must read the
  Approval Directory once per run, not once per row.
- The daily summary groups by recipient, so a correction has to happen
  **before** grouping, not at send.
- "What routing picks" currently lives inline in a React component
  (`inspectLayerRouting`, `findApproverOfFormSubject` in
  `src/components/builder/ApprovalDashboard.tsx`), over browser SharePoint
  calls. The server has the shared resolver (`api/_utils/resolveAssignee.ts`)
  but not these extra rules.
- `parseWorkflowAssignmentData` keeps only `version` and `layers`; any other
  key is dropped the next time the browser rewrites the column.

## Approaches considered

1. **Check inside the one delivery function** (`deliverWorkflowEmail`). One
   hook, but the message is already built and addressed by then, the daily
   summary and reminders do not go through it, and it has neither the layer
   config nor the row. Rejected.
2. **A nightly sweep that re-checks every open Training Evaluation step**,
   separate from sending. Simple, but an email sent at submission or right
   after an approval is never checked, and it corrects steps whose email is
   months away, long before the directory has settled. Rejected: the owner
   asked for "before the email is sent".
3. **A shared check called at each send path, before the message is built**
   (chosen). More call sites, but each has the row and layer in hand, the
   correction lands before the recipient is used, and the same module serves
   the manual button.

## Design

### 1. One shared "what does routing pick" module

Move the decision out of `ApprovalDashboard.tsx` into
`src/utils/routingInspect.ts`, mirrored at `api/_utils/routingInspect.ts`
(a test asserts the two are identical apart from the header, as for
`resolveAssignee.ts`). It is pure apart from `ports`:

- `resolveLayer(layer, item, context)` - the shared resolver with that side's
  ports (browser: SP REST and `/api/expand-group`; server: Graph).
- `loadDirectoryRows()` - active, confirmed Approval Directory rows.
- `paperMailbox` - the configured manual-paper address, or "".

It returns the existing `LayerRoutingVerdict` plus `routedPrimary`, applying
the rules the dashboard applies today, in this order:

1. Hand reassignment -> `manual`.
2. Step already parked (Needs Routing) or on paper -> `unresolved`.
3. Step depends on an earlier step nobody has acted on -> `waiting`.
4. A submitter routing rule: paper -> no answer; names an evaluator -> that
   person.
5. A "Department approver" step follows the Routing page instead: one hop up
   from the submitter, or, when the submitter is not a person's address
   (public link, "GUEST"), from the employee named in the form's answers
   (staff number, then email, then a unique name).
6. Any other step type: the shared resolver's answer.
7. A "Fell back ..." answer, or the paper mailbox, counts as no answer.
8. `classifyLayerRouting` (existing, unchanged) gives the verdict.

The dashboard's "Check routing" and "Fix" call this module; their behaviour
must not change. `resolutionContextFromItem` moves from
`src/components/builder/workflowChainContext.ts` to somewhere both sides can
use, or is passed in.

### 2. The automatic check (`api/_utils/preSendRoutingCheck.ts`)

`checkBeforeSend(token, { formTitle, itemId, layer, trigger, cache })` re-reads
the row, and returns one of:

| Outcome | When | Effect on the row | Email |
|---|---|---|---|
| `match` | saved = routed | none | sent as planned |
| `corrected` | saved differs | actor set replaced (`writeLayerRecipientFields`, with the routed person's stand-ins), `WorkflowAssignmentData` entry with source `resolved`, reason "Corrected automatically to match routing", updatedBy "SYSTEM"; a `scheduled` email's recipient updated, date kept | sent to the corrected people |
| `left-alone` | hand reassignment | none | sent as planned |
| `not-checkable` | step waits on an earlier step, or is already parked / on paper | none | as today (no action email goes for a parked or paper step) |
| `held-no-routing` | routing has no answer | `L{n}_Status` = "Needs Routing", actors cleared, reason appended to `RoutingNotes`; scheduled entry left `scheduled` | not sent |
| `held-check-failed` | the check threw (directory unreadable, Graph error) | none | not sent; retried |
| `skipped` | form not switched on, or a test run | none | sent as planned |

Callers get back the recipients to use, so they never read a stale copy of the
row.

**Switch:** `ROUTING_CHECKED_FORM_TITLES = ["Training Evaluation Form"]` in
`src/utils/routingCheckedForms.ts`, mirrored in `api/_utils/`, matched case-
and space-insensitively, with a test keeping the two identical (the
`superuserOnlyForms` pattern).

**Cache:** the caller passes a per-request cache so one cron run reads the
Approval Directory, Master Form row and survey JSON once.

### 3. Where it is called

| Path | File | Notes |
|---|---|---|
| Submission, first step | `api/submit-form.ts` | after the row is created, before `scheduleOrDeliverWorkflowEmail`; also when the email is only being scheduled |
| After an approval/evaluation | `api/evaluate.ts` | after `resolveDeferredNextLayer`, before the next step's email |
| Daily run: due emails | `api/workflow-email-cron.ts` | in the scan loop, **before** a candidate is pushed or delivered, so summaries group on the corrected recipient |
| Daily run: reminders | same | before a reminder is queued |
| "Send selected now" | same (`handleSendSelected`) | a held one is listed in `skipped` with the reason |
| Signed-in submission and admin "Send now or resend" | `api/send-email.ts` | the browser built the message. On `corrected`, the server rebuilds the action email from the row (`buildWorkflowActionEmail`) rather than re-addressing the browser's text. On a hold it answers with a `held` result and the reason, which the caller shows |
| Reissued review link | `api/_utils/linkReissue.ts` | same check; a hold refuses the reissue with a plain message |

A step whose routing is held (`held-no-routing`) is released the existing way:
an admin opens it in All Submissions and names the person with "Reconfigure
this submission", which sets the step back to pending and sends or reschedules
its email. Because that is a hand reassignment, later checks leave it alone.

### 4. Holds and retries

- `held-no-routing` at an instant send (submission, after approval): the row
  shows "Needs Routing" in All Submissions, and the notice a parked step gets
  today (`buildLayerNeedsRoutingEmail`) goes out the same way it does when a
  step parks at submission. The builder must confirm who receives that today
  and keep it identical.
- `held-check-failed` at an instant send: a `scheduled` entry is written, due
  at the next daily run (`nextDigestRunAt`), so the cron retries the check and
  then sends. At the daily run: the entry simply stays `scheduled`.
- The cron must stop delivering a due entry whose step is parked or on hold;
  today it would mail the stored recipient.
- A check that keeps failing is visible in the log and in the Email schedule
  view under "Needs attention" after 5 failed checks, mirroring the existing
  5-attempt delivery cap. It is never sent unchecked.

### 5. The log

Stored inside the existing `WorkflowAssignmentData` note column as a new
top-level `checks` array. `parseWorkflowAssignmentData` /
`setWorkflowAssignmentOverride` (both copies, if a server copy is added) are
changed to preserve it.

```
{ at, layer, trigger, outcome, saved: [..], routed: [..], note?, how?, count? }
```

- `trigger`: `submission` | `step-advanced` | `daily-run` | `reminder` |
  `send-selected` | `send-now` | `link-reissue`.
- A check with the same layer, outcome, saved and routed as the layer's latest
  entry does not add a line; it bumps `count` and `at` (and keeps `firstAt`).
  Otherwise a held step would add a line every morning.
- Newest 60 entries are kept per submission.
- The log write is its own patch after the decision. If it fails, the outcome
  still stands, and a sanitized line goes to the server log (`logWarn`) so
  there is always one record. Every check also writes a server log line.
- If the form's list has no `WorkflowAssignmentData` column, the correction
  cannot be recorded: treat as `held-check-failed` with a note saying the
  column is missing (the manual Fix adds it with the admin's token).

### 6. What the admin sees

In All Submissions, the "Check approver / evaluator routing" panel gains an
"Automatic checks" list under the button, newest first:

```
Automatic checks
13 Nov 2026 08:00  Step 2: HOD Evaluation   Corrected   daily run
   Was: old.hod@...   Now: new.hod@...
   Routing page: Ali (SG010) is approved by new.hod@...
12 Aug 2026 10:14  Step 2: HOD Evaluation   Matches routing   submission
12 Aug 2026 10:14  Step 1: Superior         Set by hand, left alone   submission
```

A held step already shows as "Needs Routing" in the list and detail panel; its
log line says why. Wording in end-user terms, same labels as the manual panel
("Matches routing", "Corrected", "Set by hand, left alone", "On hold: routing
has no answer", "On hold: could not check, will retry").

## Testing

- `routingInspect` - unit tests per rule above, plus the mirror-identity test.
- `preSendRoutingCheck` - each outcome, log de-duplication, cap, "never sends
  on error", test runs and other forms skipped, hand reassignment untouched.
- Cron - a due entry is corrected before grouping; a parked step's entry is not
  delivered; one directory read per run.
- Existing routing-check, cron, hold, delivery and reminder tests still pass.
- `npm run build` and `npx vitest run`.
- Live rehearsal is limited: `ZZ TEST RUN` assigns every step to the tester,
  and test runs skip the check, so the live proof is the first real daily run,
  read from the new log.

## Left to the builder

- Exact function signatures, file split and cache shape.
- How `send-email.ts` recognises an action email for a step (it already
  receives list title, item and layer as context).
- Where `resolutionContextFromItem` ends up.
- Styling of the "Automatic checks" list within the existing panel.

## Clarifications after the builder read

These override anything above that reads differently.

- **Stand-ins.** The shared module always returns the routed person **plus
  their stand-ins** (`addStandIns`), on every branch, including the
  public-link branch that looks the employee up from the form's answers.
  Today's manual check returns the approver alone there, so a step saved at
  submission as "approver + PA" reads as a mismatch and Fix drops the PA. That
  is a defect; the manual check changes in this one case, on purpose.
- **Routing page wins from the first check.** A "Department approver" step is
  checked against the Routing page even at submission, as the manual check
  already does. Where the Department Approver Directory and the Routing page
  disagree, the step is corrected at once; where the employee on a public
  submission is not on the Routing page, the step is held. This is what "not
  set in routing: hold" means; the handover calls it out to the owner.
- **Which workflow version.** The check reads the layer config the reviewer
  page would read for that submission (its own form version / instance, as
  `api/evaluate.ts` resolves it), not the form's current one. Cache per
  version key within a run.
- **Failed checks never stop retrying and never send.** The count lives on the
  log entry (`count`), not on the schedule entry's `attempts`, which stays the
  delivery cap. At 5 the Email schedule view lists it under "Needs attention".
- **Reissued links** (`linkReissue.ts`, public-link steps only) stay silent:
  on a hold no email is sent and the caller gets the same answer as always.
- **`send-email.ts`** keeps its send-anyway fallback for other forms. For a
  checked form, a row that cannot be read is `held-check-failed`.
- **Signed-in submission whose evaluation email is only scheduled**: the
  browser writes the schedule itself and never calls `send-email`, so that
  step's first check is at the daily run that would send it. Accepted.
- **Submitter routing rules** already exist twice
  (`src/utils/evaluationSubmitterRouting.ts`, inline in
  `api/submit-form.ts`). The shared module uses one mirrored copy; the inline
  server one is replaced by it if that is safe, otherwise left and noted.
- **Paper mailbox port** is the dedicated manual-paper address only, as the
  manual check uses today, not the sender fallback of the paper toggle.
- **Who is told about a hold**: see the open question below. Today's
  "needs routing" notice only reaches addresses still saved on the step, and a
  hold clears them, so on its own it reaches nobody.

## Who is told about a hold (decided by the owner)

The **HR forms mailbox**: the address workflow mail is sent from
(`HR_FORM_EMAIL_FROM_ADDRESS`, falling back as `resolveHrFormSender` does).
One notice when a step is first held for having no routing answer, built like
`buildLayerNeedsRoutingEmail` (form, reference, submission, step, reason, and
where to fix it: All Submissions -> Reconfigure this submission). Not repeated
on later runs while the same hold stands (the log's de-duplication decides:
a notice goes only when a new log line is written, not when `count` is
bumped). Not flagged for follow-up; it asks nobody to act as a reviewer. A
`held-check-failed` sends no notice until its 5th consecutive failure, then
one. If the mailbox is not configured, or the notice fails, the hold still
stands and the failure is logged.

## Calls made by the designer (not decisions the owner stated)

- Scope switch by form title, only the Training Evaluation Form on.
- Log kept inside `WorkflowAssignmentData` rather than a new column.
- A failed check holds and retries rather than sending.
- Reminders, "Send selected now", resends and reissued links are checked too.
- A held step is released through the existing "Reconfigure this submission".
- AGENTS.md gets a section describing the feature once built.

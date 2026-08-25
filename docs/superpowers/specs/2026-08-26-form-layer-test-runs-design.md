# Form Layer Test Runs — Design

**Date:** 2026-08-26
**Status:** Approved for planning

## Problem

A form's layer sequence cannot be proven before it goes live. The only way to
find out whether layer 3 resolves the right head of department, whether the
evaluation mail renders, or whether the final PDF comes out intact, is to submit
a real form and mail real approvers. Builders therefore ship workflows they have
never seen run, and discover routing mistakes from the people receiving them.

## Solution

A **test run**: a real submission through the real pipeline, where every
outbound email is redirected to one address the tester nominates, the row is
flagged so it never mixes with production data, and every step of the run is
recorded on a pass/fail trail the tester can read — ending with the final PDF.

Layer resolution itself is **not** simulated. The chain walk, the Department
Approver Directory lookup and the distribution-list expansion all run exactly as
they would in production, and their results are written to the normal
`L{n}_Email` / `L{n}_Emails` columns. Only the moment of dispatch is overridden.
That is the whole point: the tester needs to see who the workflow *would* have
mailed, without mailing them.

## Decisions

| Question | Decision |
|---|---|
| Where the answers come from | The real form, opened in test mode with editable sample answers prefilled |
| Storage | The real response list, flagged `IsTest` |
| Email override | Every recipient class collapses to the one test address |
| Reference numbers | Separate `TEST-` counter series |
| Retention | Kept; deleted from the builder, individually or all at once |
| Access | Form Builder Superusers, any form including unpublished drafts |
| Public forms | Tested through the public respondent path when the form is published as a public link |

## 1. Tester-facing flow

The builder gains a **Test workflow** action per form. It asks for one email
address, then opens the form:

- **Public-link forms** open the public respondent view, so the redacted layer
  config, server-side routing and public signature handling are exercised — the
  paths that differ most from the signed-in flow.
- **Everything else** opens the signed-in view.

Either way the page carries a persistent, non-dismissible **TEST RUN** banner
naming the destination address, and sample answers are prefilled from the form's
question types. The tester may edit any of them; editing is how branch selection
and department-lookup routing get steered.

On submit the run proceeds normally. Each workflow email arrives at the test
address with:

- a `[TEST]` subject prefix,
- a banner block naming the layer and the production recipients it was diverted
  from ("Layer 2 — Evaluation — would go to: siti@…, hod-finance@…"),
- working action links, so the tester genuinely approves, rejects, or evaluates
  each layer in sequence.

A **Test runs** panel in the builder lists the form's runs with current layer,
lifecycle status, the trail (§4) and a delete button, plus a "clear all test
runs" action.

## 2. Data model

Two new columns on each form's response list:

- `IsTest` — `"true"` on a test row, absent otherwise.
- `TestEmail` — the nominated address, re-read by later stages.

A third column, `TestRunLog`, holds the run trail as JSON (§4), following the
shape and append semantics already used by `WorkflowEmailLog` in
`api/_utils/workflowEmail.ts`.

Provisioning uses the signed-in admin's **delegated** SharePoint token via
`ensureTextFieldViaSPRest`. App-only client credentials cannot create columns —
see the app-only note in `api/AGENTS.md`. A response list missing these columns
must still serve real submissions unchanged; only the test action provisions
them, and only it fails if provisioning fails.

Every existing reader treats a row as production unless flagged. The filter
model in `src/utils/submissionFilters.ts` gains one universal facet — **exclude
test runs, on by default** — honoured by the approval dashboard, the response
viewer and exports. With "Show test runs" enabled, matching rows appear badged
TEST.

Reference numbers come from a distinct counter row (`TEST-` prefix) in `Form
Reference Counters`, so a test run never consumes a number from the form's real
daily sequence and never leaves a gap in it.

## 3. Enforcing the redirect

Test mode is decided on the server and never read from a request body.

**Test ticket.** Launching a run mints an HMAC-signed ticket — form slug,
test email, issuing superuser, expiry — signed with `API_SECRET_KEY`, returned
to the builder and carried by the form page. Because a public test opens an
anonymous page, the signed ticket is the only thing that can turn test mode on;
a public respondent cannot forge one. An absent, malformed, or expired ticket
does not error the submission — it produces an ordinary production submission,
which is the safe direction to fail.

**At submit.** `api/submit-form.ts` validates the ticket, stamps
`IsTest`/`TestEmail`, then runs layer resolution unchanged and writes the real
resolved addresses to `L{n}_Email` / `L{n}_Emails`. The override applies at the
single point of dispatch: layer actors, notification mailboxes, the submitter
copy and any HR copy are all rewritten to `TestEmail` immediately before
sending.

**At each subsequent layer.** `api/evaluate.ts` re-reads `IsTest`/`TestEmail`
from the stored response item before mailing the next layer, so the redirect
survives the whole chain long after the ticket has expired. The scheduled sender
`api/workflow-email-cron.ts` reads the same two fields, so a deferred test
email is redirected too.

**Guard.** Because the real addresses remain in the layer columns, a production
assignee could otherwise open the approval dashboard and act on a test row. Two
things prevent it: the default-off filter hides such rows, and the dashboard
refuses an action on a row flagged `IsTest` unless "Show test runs" is on.

## 4. The run trail

Every test run carries an append-only checklist on `TestRunLog`. Each entry is:

```
{ step: string, label: string, status: "pass" | "fail" | "warn" | "skip" | "pending",
  detail?: string, at: string }
```

Steps recorded, in order:

1. **Ticket validated** — who issued it, which form, which test address.
2. **Answers accepted** — required-field and validation outcome.
3. **Reference number allocated** — the `TEST-` value, or the failure.
4. **Response row created** — plus, as `warn`, any field the response list
   schema could not accept. Those mismatches are today only visible as server
   `logWarn` output; the trail surfaces them, which is much of its value.
5. **Attachments and signature stored** — upload library resolved, each file and
   signature link written or failed.
6. **Matrix child rows written** — for forms with a dynamic matrix; `skip`
   otherwise.
7. **Per layer, repeated:** actors resolved (recording the production addresses
   the run would have used, and any resolver error), email dispatched to the
   test address (`pass`/`fail` with the delivery error), review link minted, and
   the decision recorded once the tester acts.
8. **Final status set** — the lifecycle stage the run ended in.
9. **PDF rendered** — the submission PDF is generated and checked.

Steps 1–8 are written server-side as the run progresses. Step 9 is different:
PDF generation is a browser concern (`@react-pdf/renderer` via
`src/utils/generateFormPdf.ts`), so the Test runs panel renders the finished
submission's PDF, reports success or the render error, offers a preview, and
writes the result back to `TestRunLog`. A completed run therefore ends with the
same artefact a real approver would receive.

The panel shows the trail as a checklist: green for `pass`, amber for `warn`,
red for `fail` with the error text, grey for `skip`, and a spinner for `pending`
steps in a run still in flight. A run with any `fail` is summarised as failed at
the top of the panel.

## 5. Constraints

`api/` sits at the hard twelve-serverless-function cap. Neither the ticket mint
nor the test-run delete may add a file — both ride as `action`s on existing
endpoints, the way the `portal-*` actions live inside `learning-materials.ts`.
`api/_utils/deploymentLimits.test.ts` guards this.

Shared logic mirrored between `api/_utils` and `src/utils` (`resolveAssignee`,
`layerRecipients`) must stay in step; the test-run helpers follow the same
convention where both sides need them.

## 6. Files

New: `api/_utils/testRun.ts` (ticket mint/verify, recipient override, trail
append), `src/components/builder/TestRunPanel.tsx`, `src/utils/testRunTrail.ts`.

Changed: `api/submit-form.ts`, `api/evaluate.ts`, `api/workflow-email-cron.ts`,
`api/_utils/referenceCounter.ts`, `src/pages/DynamicFormPage.tsx`,
`src/utils/submissionFilters.ts`, `src/components/builder/FormLibrary.tsx`,
`ApprovalDashboard.tsx`, `ResponseViewer.tsx`, `SubmissionFilterPanel.tsx`.

## 7. Testing

Unit tests, written before the code they cover:

- Every recipient class — actor, notification mailbox, submitter copy, HR copy —
  collapses to the test address.
- Resolution output is identical with and without test mode.
- An absent, tampered, or expired ticket yields a production submission.
- `evaluate.ts` and the cron redirect from the stored row, with no ticket present.
- The default filter excludes test rows; the toggle includes them.
- The dashboard refuses an action on a test row while test rows are hidden.
- The `TEST-` counter advances without touching the form's real counter row.
- Trail entries append in order and survive concurrent layer writes.
- A schema-rejected field produces a `warn` entry rather than a silent drop.

## Out of scope

Auto-deletion of old test runs, per-layer distinct test addresses, and load or
concurrency testing of the workflow.

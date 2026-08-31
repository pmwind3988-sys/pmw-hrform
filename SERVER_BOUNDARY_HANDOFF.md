# Moving authorization off the reviewer's browser — handoff

**Status: reviewing is now entirely server-side, reading and writing. Do NOT
lock the SharePoint lists yet — signed-in staff still submit forms straight
from the browser, and locking would stop every submission in the company.**

Written 2026-08-31 and updated the same day. Read this before continuing;
several constraints here were discovered the hard way and are not obvious from
the code.

## Why this work exists

Every rule about who may open or approve a submission used to run in the
reviewer's own browser. The page fetched the whole record from SharePoint with
a token issued to that reviewer, then decided whether to display it — by which
point the record had already arrived. Anyone willing to open developer tools
could read a colleague's HR submission the page was busy refusing to show, and
write to it just as easily.

The public-link path never had this problem: there the server decides and the
browser holds no SharePoint token at all. The goal is to bring the signed-in
path to where the public path already is.

## Decisions the owner has already made

Do not re-litigate these; they were asked and answered.

| Question | Answer |
| --- | --- |
| Is a SharePoint tenant admin available to lock the lists? | **Yes** — the final step is genuinely on the table |
| Which forms? | **All of them**, not a sensitive subset |
| Move the admin submissions workspace too? | **No.** It stays on direct SharePoint access. Its users are superusers already entitled to that data, and it is ~44 direct calls of work for almost no security gain |

## What is done

All on `main`, in order:

- `8549f65` — the API can resolve a caller to a verified identity
  (`requireSignedInViewer` / `bearerFromHeaders` in `api/_utils/viewerIdentity.ts`),
  and the client can attach one (`src/utils/apiIdentity.ts`)
- `1472b1b` — `api/evaluate.ts` GET accepts a **signed-in mode**:
  `?slug=&responseItemId=&layerNumber=&prefix=` plus a bearer, instead of a
  public layer token
- `31b0e99` — `EvaluationPage.tsx` signed-in path calls that endpoint instead of
  reading the response list itself. Client copies of the access rules deleted
- `3600911` — fix: the endpoint's "missing token" guard was rejecting the
  signed-in shape before it reached its own branch
- `c58b5e0` — fix: response lists are named two different ways; see below
- `7dc8e57` — this document
- `355feba` — **`api/evaluate.ts` POST accepts the same signed-in mode.** The
  decision, the advance and the next reviewer's email are recorded by the
  server. `assertSignedInLayerCanSubmit` deleted from the browser
- `13b0e31` — repeating-table answers ("one row per trip") come back with the
  record instead of being fetched separately by the browser

Reading was verified working in production by the owner on a real pending
request. **Submitting has not yet been verified on a real request** — see
"Before trusting `355feba`" below.

## Before trusting `355feba`

A change to this path is only proven when a real link opens *and a real
decision is recorded*. Nothing local can prove it: there is no test tenant.

Use the built-in test-run facility, which redirects the emails, and check that:

1. An approval step still records and moves to the next layer.
2. An evaluation step still saves its answers (`EvaluationData`).
3. The next reviewer gets exactly **one** email, not two.
4. The submissions workspace shows the same wording it did before — the
   `Status` column ("Approved Layer 2" and so on) is now written by the server;
   it was deliberately kept because admins read it.
5. A final approval still produces the PDF and still notifies the submitter.
6. A rejection still notifies the submitter.

Items 3–6 are where a mistake would hide: the emails moved, and moving one
twice or not at all is invisible from the reviewer's side.

## What is left, in order

### 1. Move form submission to the server — the real blocker

**This is bigger than it sounds and it gates everything below.**

When a signed-in member of staff submits a form, `DynamicFormPage.tsx` writes
the row to SharePoint itself (`spPost` to the response list, around
`src/pages/DynamicFormPage.tsx:1306`), plus the matrix child rows, signature
uploads and `ensureWorkflowColumns`. Only **guests** go through
`api/submit-form.ts`.

So the lists cannot be locked while this stands: locking them stops every
signed-in submission in the company. The earlier version of this document said
reviewing was the last thing in the way. That was wrong.

`api/submit-form.ts` (2120 lines) already does the whole job for guests —
matrices, signatures, PDPA columns, reference numbers, layer config. The likely
shape of the work is routing signed-in submissions through it with a verified
identity rather than writing a second implementation. Expect to deal with:

- `SubmittedBy` and the reference-number allocation, which currently differ
  between the two paths on purpose (see the comment at `DynamicFormPage.tsx:108`)
- `ensureWorkflowColumns` — **the app-only principal cannot create columns**, so
  whatever the browser was creating on demand has to already exist, or be
  created by an admin token
- the test-run stamping flow, which today makes a second call precisely because
  the signed-in path does not go through the endpoint

This is the single most critical path in the product. Do it in pieces, with the
owner submitting a real test-run form after each.

### 2. Lock the response lists

**Only after step 1 is done and proven.** Break permission inheritance on each
response list; grant the application principal and an admin group, remove
ordinary users. Automate it inside form provisioning — a list is created per
form at publish time, so a manual pass is stale within a week.

Admins must keep their access: the app-only principal **cannot create lists or
columns**, so provisioning breaks without a signed-in admin token.

Two things in the reviewer page still read and write the response list with the
reviewer's own token, and will need moving or an exemption before locking:

- `loadPdfAndGenerate` — generates the PDF record and patches its URL onto the
  row (`src/utils/generateFormPdf.ts:482`)
- `triggerApprovalNotification` — the closing note to whoever submitted, which
  reads the row for the reference number and writes `WorkflowEmailSchedule`

Both only run once a workflow has finished. They were deliberately left in the
browser in `355feba` rather than moved blind: the server has no equivalent of
the PDF generator, and the terminal notices have never been sent from the
public path, so adding them there would start sending mail that public
workflows do not send today.

Until this lands, everything above is defence in depth, not a boundary.

## Constraints — all verified, all cost time to discover

**The Vercel function ceiling is reached.** 12 of 12 `api/*.ts` files, and the
Hobby plan refuses a thirteenth. The build succeeds and the *deployment* then
fails, so nothing local catches it. Add an `action`/mode to an existing endpoint
— never a new file. Files under `api/_utils/` do not count. Guarded by
`api/_utils/deploymentLimits.test.ts`.

**Response lists have two naming conventions.** Some are named after the form
(`Training Evaluation Form`), some with a suffix (`… Responses`). The signed-in
page always used the bare title; `api/evaluate.ts` always assumed the suffix.
Both `handleGet` and the POST handler now try both. Any new server code touching
a response list must do the same or it will fail on half the forms.

**Old response lists reject narrow field requests.** A list created before later
columns existed returns an error for any request naming a column it lacks, which
is why several paths fetch whole rows. `Created` and other built-ins are always
safe; `L{n}_Emails` is not.

**SharePoint fails an entire PATCH over one unknown column.** The browser used
to write a decision as three separate patches, so a missing column cost one of
them. The server writes one, so a missing column would have cost the whole
decision. `api/evaluate.ts` therefore retries once without `L{n}_Signature`,
`L{n}_Rejection` and `Status` — the droppable ones. The decision itself and the
evaluation answers are never dropped; losing those silently would be worse than
failing loudly.

**The app-only principal cannot create structure.** Reading and writing rows is
fine; `POST` of lists or columns returns 403. See `api/AGENTS.md`.

**Each SharePoint site must be granted to the app individually** — `Sites.Selected`
authorises nothing until that is done. See `VERCEL_SETUP.md`.

**Scheduled emails go out once a day at 08:00 MYT** (`0 0 * * *`). A time set on
a schedule means "not before", not "at". More frequent runs need a paid plan.

## Mistakes already made — do not repeat them

**Read the whole handler before extending it.** Two production breakages came
from adding a branch to `handleGet` without reading what ran before it: an early
guard demanding a public token, then the list-name assumption. Both turned away
every signed-in reviewer.

**There is no test tenant.** Localhost reads and writes the same live SharePoint,
so local testing catches code errors, not data errors. Opening a request is
read-only and safe; submitting changes real data — use the built-in test-run
facility, which redirects the emails.

**A change to this path is only proven when a real link opens.** Do not call it
a safe stopping point before the owner has clicked one.

**Check who else writes to a list before proposing to lock it.** The step-1
blocker above sat unnoticed through a whole round of this work because only the
reviewer path was examined.

**Fail open on second-line checks.** `routePrefixAllowsLayerType` returns `true`
when it cannot tell (unknown prefix, unreadable date). A test caught the
opposite, which would have refused genuine approvers. The assignment check is
the barrier; the prefix rule stands behind it.

## Where the rules live now

Server-side, once each — deliberately:

- `api/_utils/layerItemAccess.ts` — `denyLayerItemAccess`, shared by read and act
  so what a link may show can never drift from what it may approve, plus
  `firstUnfinishedEarlierLayer` for rows too old to carry `CurrentLayer`
- `api/_utils/workflowLink.ts` — `routePrefixAllowsLayerType`, judged against the
  submission's own `Created`, never today's date
- `api/evaluate.ts` — the assignment check for signed-in callers, applied
  identically on the read and the write

The client copies were deleted. **Do not reintroduce them.** Two answers to
"what may this person see" is exactly how they drift apart, and that is the bug
class this whole exercise exists to prevent.

## Verify before claiming done

```bash
npx tsc -b && npx vitest run && npx eslint .
```

1035 tests passed at `13b0e31`. Lint has 4 pre-existing warnings in
`EvaluationPage.tsx`; that count should not grow.

`main` is the deploy branch and pushes go live. The owner also commits here, so
fetch and rebase rather than force-pushing — origin moved twice mid-task during
this work.

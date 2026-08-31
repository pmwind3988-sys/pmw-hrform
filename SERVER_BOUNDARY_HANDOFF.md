# Moving authorization off the reviewer's browser — handoff

**Status: partly done. Reading is server-side; writing is not. Do not lock the
SharePoint lists yet.**

Written 2026-08-31, after the work described below landed on `main`. Read this
before continuing; several of the constraints here were discovered the hard way
and are not obvious from the code.

## Why this work exists

Every rule about who may open a submission used to run in the reviewer's own
browser. The page fetched the whole record from SharePoint with a token issued
to that reviewer, then decided whether to display it. The record had already
arrived — the refusal covered the page, it did not withhold the data. Anyone
willing to open developer tools could read a colleague's HR submission the page
was busy refusing to show.

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

Verified working in production by the owner on a real pending request.

## What is left, in order

### 1. Move submitting to the server

`EvaluationPage.handleSubmit`'s signed-in branch still writes directly to
SharePoint (`updateLayerStatus`, `submitEvaluationData`, `spPatch`). It also
still runs `assertSignedInLayerCanSubmit` in the browser, which is advisory
only for the same reason the read check was.

`api/evaluate.ts` POST already does all of this correctly for public links —
gate via `denyLayerItemAccess({ intent: "act" })`, write, advance the layer,
send the next notification. Give it the same signed-in mode the GET has: bind
by assignment (`isLayerActor` against `L{n}_Emails` / `L{n}_Email`) instead of
by `k`, and reuse everything else.

Matrix child-list answers (`loadMatrixChildData`) are also still read directly
and should move at the same time — they are submission data like any other.

### 2. Lock the response lists

**Only after step 1 is done and proven.** Break permission inheritance on each
response list; grant the application principal and an admin group, remove
ordinary users. Automate it inside form provisioning — a list is created per
form at publish time, so a manual pass is stale within a week.

Admins must keep their access: the app-only principal **cannot create lists or
columns**, so provisioning breaks without a signed-in admin token.

Until this lands, steps done so far are defence in depth, not a boundary.

## Constraints — all verified, all cost time to discover

**The Vercel function ceiling is reached.** 12 of 12 `api/*.ts` files, and the
Hobby plan refuses a thirteenth. The build succeeds and the *deployment* then
fails, so nothing local catches it. Add an `action`/mode to an existing endpoint
— never a new file. Guarded by `api/_utils/deploymentLimits.test.ts`.

**Response lists have two naming conventions.** Some are named after the form
(`Training Evaluation Form`), some with a suffix (`… Responses`). The signed-in
page always used the bare title; `api/evaluate.ts` always assumed the suffix.
`handleGet` now tries both. Any new server code touching a response list must do
the same or it will fail on half the forms.

**Old response lists reject narrow field requests.** A list created before later
columns existed returns an error for any request naming a column it lacks, which
is why several paths fetch whole rows. `Created` and other built-ins are always
safe; `L{n}_Emails` is not.

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

**Fail open on second-line checks.** `routePrefixAllowsLayerType` returns `true`
when it cannot tell (unknown prefix, unreadable date). A test caught the
opposite, which would have refused genuine approvers. The assignment check is
the barrier; the prefix rule stands behind it.

## Where the rules live now

Server-side, once each — deliberately:

- `api/_utils/layerItemAccess.ts` — `denyLayerItemAccess`, shared by read and act
  so what a link may show can never drift from what it may approve
- `api/_utils/workflowLink.ts` — `routePrefixAllowsLayerType`, judged against the
  submission's own `Created`, never today's date
- `api/evaluate.ts` — the assignment check for signed-in callers

The client copies were deleted. **Do not reintroduce them.** Two answers to
"what may this person see" is exactly how they drift apart, and that is the bug
class this whole exercise exists to prevent.

## Verify before claiming done

```bash
npx tsc -b && npx vitest run && npx eslint .
```

1023 tests passed at `c58b5e0`. Lint has 5 pre-existing warnings in
`EvaluationPage.tsx`; that count should not grow.

`main` is the deploy branch and pushes go live. The owner also commits here, so
fetch and rebase rather than force-pushing — origin moved twice mid-task during
this work.

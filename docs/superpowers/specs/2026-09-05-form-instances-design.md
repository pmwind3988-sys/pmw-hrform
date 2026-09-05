# Form instances

Status: approved design, not yet implemented
Date: 2026-09-05

## The problem

HR runs a form for a specific occasion — a training event, an induction, a
briefing — and wants the answers to arrive already carrying that occasion's
details. The app can do this today: `PrefilledQrPanel` builds a link with the
values encoded into the URL as a base64 blob (`?prefill=`), and a QR of it.

Nothing is recorded. The link is made on the spot and exists only in whatever
was printed or pasted into an email. Afterwards there is no way to answer "what
links did we hand out", "which responses came from the March briefing", or
"stop accepting these now". The values also travel inside the URL, so a link
already in circulation cannot be corrected.

## What an instance is

A named run of an existing form. It holds **only**:

- fixed values for some of the form's fields
- which of those the respondent may not change
- an expiry date
- open or closed
- whether sign-in is required
- a random token, which is what the link carries

It does **not** hold questions, a form version, approval layers, evaluation
config or routing. Those come from the main form, always — one source of truth.
An edit to the main form reaches every instance immediately, and an edit to an
instance reaches every link already distributed.

## Decisions taken

| Question | Decision |
|---|---|
| What must be traceable | The instance, and every submission stamped with it |
| Form version | None. Instances always serve the live published form |
| Who may fill it in | The admin chooses per instance |
| At expiry | Closes, stays listed with its submissions, can be reopened |
| Approval / evaluation | Follows the main form. Instances never carry their own |
| Historical submissions | Grouped by a nominated field's value; old links are not recoverable |

## 1. Data model

### `Form Instances` (new SharePoint list)

| Column | Purpose |
|---|---|
| `Title` | The instance's name — "Fire Safety Briefing, March 2026" |
| `FormTitle` | The response list this belongs to |
| `FormSlug` | Denormalised so the fill route resolves without a second lookup |
| `Token` | Random opaque key; what the link carries. `crypto.randomUUID()`, as `linkToken` already does |
| `PrefillJson` | JSON object, `{ fieldName: value }` — the fixed values |
| `LockedFields` | JSON array of field names; the subset the respondent may not edit. A name here that is absent from `PrefillJson` is ignored |
| `GroupValue` | Denormalised copy of `PrefillJson[GroupByField]`, stored as its own column so a group can be queried without parsing every instance's JSON. Written whenever the prefill is saved; the prefill remains the source of truth |
| `ExpiresAt` | When it stops accepting submissions |
| `Status` | `open` / `closed` |
| `RequireSignIn` | Whether the link demands a Microsoft identity |
| `CreatedBy`, `Created` | Who made it, when |

### Changes to existing lists

- **`Master Form`** gains `GroupByField`: the name of the field whose value
  groups this form's submissions. Empty means the form has no grouping and
  behaves exactly as it does today. It sits beside `ConditionField` and
  `ReferenceConfig`, which are the same kind of per-form setting.
- **Response lists** gain `InstanceId`, provisioned on first use through the
  builder's existing column provisioning. Additive: existing rows hold an empty
  value and every existing query keeps working.

### Why the grouping key is a field value, not the instance

Historical submissions have no instance — those links were never recorded and
cannot be. But they do carry the event's details in their answers, because that
is what the prefill put there.

So the group is the **value of the nominated field**, and an instance simply
sets that field to its own `GroupValue`. "Fire Safety Briefing, March 2026" then
gathers both the responses from the new QR and the ones filled in last year
through an ad-hoc link. Retro-tracing is not a second feature; it is the same
feature seen from the other end.

`InstanceId` is still stamped, for two things the field value cannot do: it
survives someone editing that value on a submission, and it is the only proof of
which link a response actually arrived through.

## 2. The link and the respondent

`/form/<slug>?instance=<token>`. The token is a key and carries no payload,
which is what lets an edit to the instance change a link already in circulation.
The QR encodes that same URL, so the existing generator is unchanged.

The page resolves the token before rendering:

- **Open** — the form renders with the values already in place. Locked fields
  are read-only and say they are set by the event, so they do not read as
  broken. Unlocked prefills are ordinary starting values.
- **Closed, or past `ExpiresAt`** — a page naming the instance and its date,
  saying it has closed. Deliberately **not** a 404: someone scanning a poster
  after the event should learn they are late, not that the link is broken.
- **Unknown token** — the not-found treatment a bad slug already gets.
- **`RequireSignIn` and not signed in** — the existing sign-in gate, returning
  to the form afterwards.

### Enforcement belongs on the server

Expiry, status, `RequireSignIn` and the locked values are all checked at submit
against the instance record. The locked values are **written from the record**,
not taken from the posted body — otherwise a locked field is a suggestion and
the event name on a submission is whatever the respondent typed into dev tools.

The browser-side copies exist so the form behaves sensibly. They enforce
nothing. This is the same rule the test-run ticket already follows: minted and
verified server-side precisely so a request body cannot claim to be a rehearsal.

## 3. The admin side

### Where instances live

An **Instances** panel on the form builder, beside Test runs and Prefilled QR.
Instances belong to a form, and this puts creation in front of the person who
already knows the form's fields.

Creating one: name it, choose the fixed values, tick which are locked, set the
expiry, choose whether sign-in is required. Then a confirmation step showing the
whole thing back, because a mistake is expensive once QRs are printed and this
is the last cheap moment to catch it.

The confirmation must state two things plainly:

1. **If `RequireSignIn` is off on a form that normally requires sign-in**, that
   this opens the form to anyone holding the link. It names the form and records
   who made the choice, so it is a decision with a name on it.
2. **If any locked field is used by the form's routing.** See below.

Afterwards the panel offers the link, a QR to download, and extend / close /
reopen / duplicate.

### Locking a routing field decides who approves

Routing reads the submitted data: the reporting line and the Department Approver
Directory both resolve from what was submitted (`resolveAssignee`). So locking a
field the routing depends on — department, typically — sends every response in
that instance to the same approver, decided when the instance was created rather
than by the person filling the form in.

For an event that is often exactly right. It is also a way to misroute forty
submissions silently. The creation dialog names which locked fields the form's
routing uses, and where they will send it.

### The Prefilled QR panel stays

It remains the right tool for a one-off link nobody needs to trace, and removing
it would break a workflow in use. Instances are the tracked path, not a
replacement. The QR panel gains a line pointing at instances, so the choice is
visible at the moment it is being made.

### All Submissions becomes two levels

For a form with a `GroupByField`, All Submissions shows its groups first —
name, response count, and the instance's state where there is one — and opens
into the submissions inside, using the existing table.

Groups are the distinct values of the grouping field across submissions, joined
to instances by that value. **A group may have no instance behind it**: that is
the historical case, and it shows the name and the count with no expiry and no
link, because there never was one.

A form with no `GroupByField` is unchanged: straight to the flat list.

## 4. Failure modes designed for

- **The grouping field is renamed or deleted.** Instances then set a field that
  no longer exists. The Instances panel shows this as a problem on the instance
  rather than letting it fail quietly at submit.
- **Someone edits a grouping value on a submission.** It moves group. This is
  the second reason `InstanceId` is stamped — the instance membership survives.
- **Two instances choose the same `GroupValue`.** They merge into one group.
  Allowed, since the group is the value, but the creation dialog warns when the
  value is already in use so it is deliberate rather than accidental.
- **Column provisioning fails** on a locked-down response list. Instance
  creation reports it and refuses, rather than producing a link whose
  submissions cannot be stamped.

## 5. Testing

Unit tests on the pure logic:

- token resolution, including unknown and malformed tokens
- the open / closed / expired decision, with the boundary at `ExpiresAt`
- grouping submissions by field value, including submissions whose value is
  missing or empty
- the join from group to instance, including a group with no instance
- which locked fields a given form's routing depends on

Then live verification, as with the test-run work: create an instance against
ZZ TEST RUN, open its link, confirm locked values are written from the record
and not from the posted body, let it expire, reopen it.

## Out of scope

- Attendee rosters and who-has-not-responded
- Per-instance reminder emails
- Per-instance export
- Recovering the links of historical ad-hoc prefills. Those were never
  recorded; the submissions are reachable by their grouping value, and that is
  the whole of what can be offered.

# Google sign-in and permanent guest members

**Date:** 2026-09-01
**Status:** Approved design, not yet planned
**Replaces:** Portal accounts (login ID + password), removed in full

## Summary

Members of the public sign in with Google and become permanent guest members of
the HR portal. Membership never expires. The HR-issued portal account — a login
ID and a generated password handed over in person — is deleted outright and this
takes its place.

A guest member is a record in this application. It is **not** a Microsoft
account, and no guest is ever invited into the tenant or the SharePoint site.

## Why

Portal accounts work, but every one of them costs HR a manual ceremony: generate
a password, show it once on a hand-over panel, and speak the access-log notice
aloud. That ceremony is the bottleneck. Google sign-in removes it — the person
proves who they are to Google, and HR is left with the one decision that
actually needs judgement: whether this person may open learning materials.

The audit trail also improves. Today the name in the access log is typed by HR;
afterwards it is an email address Google has verified.

## Decisions

| Question | Decision |
|---|---|
| Who may sign in with Google | Anyone. Nobody is refused at the door. |
| What a new member reaches | Careers, job applications, HR forms, their own submissions. |
| Learning hub | Shut until an HR Forms Owner approves that member. |
| Expiry | None. There is no expiry column. |
| Profile | Full name, position, department — collected once, blocking. |
| Department | Dropdown from the existing Department Approver Directory. |
| Editing | Member may edit; the access log keeps the values as they were at each view. |
| Portal accounts | Removed in full. Existing holders lose access on deploy. |
| Tenant guests | Not created. See "Rejected: real SharePoint guests". |

## Rejected: real SharePoint guests

"Same as adding a guest in SharePoint" was considered literally — inviting each
person as an Entra B2B guest and adding them to the site's members group — and
rejected.

- **Public sign-up would flood the directory.** Every stranger who clicks the
  button becomes a permanent tenant object, visible in people pickers and Teams,
  indistinguishable from genuine partners.
- **A site guest bypasses this application's gates.** Learning approval,
  per-material password locks and the named access log are all enforced by the
  app. A tenant guest reads the SharePoint site directly, where none of them
  apply — including the access log itself.
- **Guests need no SharePoint permission.** The app already reads and writes
  SharePoint with its own service identity on the visitor's behalf.
- **Google sign-in would not work without further setup.** Without Google
  configured as a federated provider in Entra External Identities, a Gmail guest
  authenticates by emailed one-time passcode, not by the Google button.

**Left open deliberately.** A per-person "invite to SharePoint" action on the HR
screen, for the small number of already-approved members who genuinely need to
open SharePoint content directly, is a later addition. The member record carries
its Google email as the key, which is the same key an invitation would use, so
adding this later is an addition rather than a rework. Not built now.

## Architecture

### Identity

1. The sign-in screen offers **Continue with Microsoft 365** (primary,
   unchanged) and **Continue with Google** where the portal-account panel is
   now.
2. Google Identity Services returns a signed ID token in the browser.
3. The server verifies that token against Google's published keys — signature,
   issuer, audience (our client ID) and expiry — and reads the verified email
   and name.
4. The server finds or creates the member's row and issues **the application's
   own session token**, reusing the existing signed-session machinery: same HMAC
   construction, same token-version field, same revocation behaviour. Only the
   prefix differs, so a guest session can never be mistaken for a portal one.

Token version is what makes revocation work: disabling a member or revoking
approval bumps it, retiring every session already issued. Member state is cached
briefly, so a revocation takes effect within about a minute rather than
instantly — the same trade already accepted for portal accounts.

Nothing downstream needs to learn a new concept. `resolveSignedInViewer` gains a
`guest` kind alongside `m365`; the client-side token helpers return the guest
session before touching MSAL, exactly as they do for portal sessions today.

### Records

A new SharePoint list, `Guest Members`, replaces `Internal Accounts`. One row per
person. As everywhere else in this repo, **every column is single-line text**,
timestamps and flags included, and both the list and its columns are created
with the admin's delegated token over SharePoint REST — the app-only principal
is refused list creation on this tenant.

| Column | Purpose |
|---|---|
| `Title` | Google email, lowercased. The key. |
| `GoogleName` | Name as Google reports it, kept for reference. |
| `FullName` | Name the member declared. |
| `Position` | Declared position. |
| `Department` | Declared department. |
| `ProfileComplete` | Whether the blocking profile step has been passed. |
| `LearningApproved` | Whether an HR Forms Owner has granted learning access. |
| `Disabled` | Blocked entirely. |
| `TokenVersion` | Bumped to retire issued sessions. |
| `JoinedAt` | First sign-in. |
| `LastLoginAt` | Most recent sign-in. |

There is no expiry column. Permanence is a property of the schema, not a date
set far in the future.

**`Title` must be indexed at provisioning.** SharePoint answers filtered reads
against unindexed columns unreliably past roughly 5,000 items. The portal
account code tolerated this by falling back to a scan capped at 2,000 items,
under a comment reading *"this is not a list that grows with use"* — true for
hand-issued accounts, false the moment sign-up is public. Past a couple of
thousand members that fallback cannot cover its own list, and a registered
person is intermittently told they do not exist. Indexing removes the cause;
**the scan fallback is not carried over**, because a scan that cannot cover the
list turns "SharePoint is unreachable" into "you have no account".

### The profile gate

First sign-in lands on a one-time form: full name, position, department. The
department control is a dropdown populated from the Department Approver
Directory. Until it is saved, nothing else in the application is reachable —
not careers, not forms, not learning.

**Known limitation, accepted.** That directory lists PMW's internal departments,
maintained for approval routing. A genuinely external guest may find nothing
there that describes them and will pick the nearest wrong entry. This fits
guests who are subsidiary or attached staff; it fits outside contractors poorly.
An "Other, please specify" escape hatch is the fix if that becomes the common
case — noted, not built.

The member may edit all three fields later from their profile.

### Access and routing

A completed member reaches:

- **Careers and job applications** — as today.
- **HR forms** — as today, with their Google email written as the submitter.
- **My submissions** — their job applications with status, and the HR forms they
  have sent.
- **Learning hub** — only once approved. Before approval it shows a plain
  "your access is being reviewed" state, not an error.

Route gating follows the portal precedent: a **separate route table** for the
guest page state rather than a flag threaded through the main one. An allowlist
cannot leak a route added later; twenty individually guarded routes eventually
will.

**Historical submissions cannot be recovered.** Public HR form submissions
currently record the literal text `GUEST` as the submitter. There is no way back
from that to a person. The "My submissions" page therefore starts empty for
everyone and fills from launch onward. Job applications are unaffected — they
already store the applicant's email.

### Learning access log

Unchanged in structure and purpose, with two differences:

- Rows are written for approved guest members, carrying the Google-verified
  email in place of an HR-typed login ID.
- Each row stores the member's **full name, position and department as they were
  at the moment of that view**. A member who later edits their profile does not
  rewrite what the trail says about who opened a confidential briefing. This is
  the one place where showing current values would be wrong.

M365 staff are still never written here. That separation is the product
decision recorded in `PDPA_COMPLIANCE.md` and does not move.

### HR screen

`/admin/portal-accounts` becomes `/admin/guest-members`, HR Forms Owner only.

- Lists who signed up and when, with their declared name, position and
  department, and whether learning is approved.
- Actions: approve learning, revoke learning, disable, re-enable.
- **Paged, with a search box.** Loading every member at once is fine at forty
  and unusable at four thousand.
- No password generation, no hand-over panel, no reset dialogs. All of that is
  deleted.

## Deletions

Removed in full:

- Login-ID and password authentication: scrypt hashing, lockout counters,
  failed-attempt tracking, the enumeration-timing defences, and the timing-equal
  wrong-password path.
- The `portal-sign-in` action and every `portal-*` admin action.
- The credential dialogs and hand-over panel on the admin page.
- The portal-account panel on the sign-in screen.

Existing portal account holders lose access on the day this deploys and sign in
with Google instead. Their access-log history is left untouched.

The `Internal Accounts` list itself is **not** deleted by the application.
Removing an HR records list is an HR decision made outside the software.

## Deployment constraints

**The function cap is hard.** `api/` sits at exactly 12 serverless functions,
which is the Vercel Hobby ceiling. A thirteenth fails *after* a successful
build, with nothing in the build log to explain it. The Google and guest-member
actions therefore take over the slots the `portal-*` actions vacate on
`api/learning-materials.ts`. `api/_utils/deploymentLimits.test.ts` fails the
suite if this is got wrong.

**The Content-Security-Policy is written twice** — the header in `vercel.json`
and the `<meta http-equiv>` in `index.html` — and a page carrying both is held
to the intersection. Widening only one changes nothing. Google Identity Services
needs its script origin, frame origin and connection origin allowed in **both**
files, or the sign-in button silently never renders, with no error surfaced.
This is the same trap that once left video playing with dead controls.

**New environment variables.** One: the Google client ID. It is public and
ships in the bundle, and the server needs the same value to check that a token
was issued for this application. No Google client secret is required — the
browser flow returns an identity token the server verifies against Google's
public keys, and the app never calls a Google API on the member's behalf.

The existing session secret is reused for signing guest sessions. It must remain
distinct from the API key that ships to browsers: signing sessions with a public
value would let anyone holding the bundle mint a session for any address.

## Compliance

Portal account holders are told about the named access log **in person**, at
hand-over. Self-registration removes that conversation entirely. Act 709's
notice-and-choice principle expects the individual to know the log exists, so
the notice must move into the product: shown at the point learning access is
granted, and again on the member's profile. This is a requirement of the
feature, not a nicety.

`PDPA_COMPLIANCE.md` is updated in the same change: the section describing
portal-account holders is rewritten for guest members, and the outstanding
"tell holders at hand-over" action item is closed by the in-app notice.

## Testing

- Google token verification: valid token accepted; wrong audience, wrong issuer,
  expired, and tampered-signature tokens all refused.
- A new member is created on first sign-in and reused on the second — no
  duplicate rows for the same address.
- The profile gate blocks every route until saved.
- An unapproved member is refused learning materials by the **API**, not merely
  hidden by the interface.
- Revoking approval retires sessions already issued.
- Access log rows keep the profile values from the time of the view after the
  member edits their profile.
- `deploymentLimits` still passes — the function count did not grow.
- Member lookup is correct at list sizes past the 5,000-item threshold.

## Open questions

1. **Retention for the access log.** It is append-only and never shrinks. How
   long should rows be kept? This is a records-keeping decision, not a technical
   one, and nothing is built until it is answered.
2. **Department for genuinely external guests.** Whether the "Other, please
   specify" escape hatch is needed depends on who actually signs up. Revisit
   after launch with real data.

## Not in scope

- Inviting guest members into the Microsoft tenant or the SharePoint site.
- Migrating existing portal accounts to Google identities.
- Recovering the submitter of historical public form submissions.
- Any change to how M365 staff sign in.

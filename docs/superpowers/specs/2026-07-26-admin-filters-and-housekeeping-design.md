# Admin Filters & Submission Housekeeping — Design

**Date:** 2026-07-26
**Status:** Approved
**Scope:** Presentation layer only — admin dashboard filters, header notifications, and `/admin/submissions` organisation.

---

## Problem

### 1. Three separate filter implementations

| Where | Filters |
|---|---|
| `src/components/dashboard/Toolbar.tsx` (homepage) | search, list, status, sort, submitter |
| `src/components/builder/ApprovalDashboard.tsx` | training-title search, submitter, date from/to, training dropdown, profile dropdown, tabs, pagination |
| `src/pages/AdminHomePage.tsx` export dialog | date preset/custom, list, category, submitter |

The export dialog re-implements filtering independently of the toolbar, so exporting ignores whatever the admin has filtered on screen and forces them to re-pick everything.

### 2. `/admin/submissions` splits by current layer type

The `Approvals | Evaluations` toggle filters on the item's **current layer type**
(`ApprovalDashboard.tsx`, `categoryItems`). Consequences:

- A submission **moves between the two tabs as it advances** through layers.
- A completed form whose final layer was an evaluation is filed under "Evaluations" permanently.
- There is no way to see everything awaiting action across both types.

### 3. Overlapping status tabs

Under Evaluations the tabs are `Pending | Evaluated`, where "Evaluated" is defined as
*anything not pending* — so rejected items are counted as evaluated. `getItemStatus`
collapses submitted / in-review / pending into a single bucket, so in-progress work is
indistinguishable from untouched work.

### 4. Notifications

`NotificationCenter` is rendered only from `Header.tsx` (compact and desktop variants).
Admins have `/admin/submissions` for the same information.

---

## Design

### Shared foundation — two new pure modules

Both are pure TypeScript (no React, no network), following the existing
`workflowStatus.ts` / `statusConstants.ts` pattern, and both are unit-tested.

#### `src/utils/submissionLifecycle.ts`

A single definition of "what state is this submission in", consumed by both surfaces.

| Stage | Meaning |
|---|---|
| `pending` | Submitted; no layer acted on yet |
| `in_review` | At least one layer complete; not finished |
| `manual_paper` | Current layer is *Manual Approval/Evaluation Required* — handled offline by HR |
| `completed` | Terminal positive |
| `rejected` | Terminal negative |

These map onto the `SP_FORM_STATUS` values that `resolveWorkflowDisplayState`
(`src/utils/workflowStatus.ts`) already produces. This is a re-expression of existing
logic, not a new set of rules.

Exports:

- `type LifecycleStage`
- `resolveLifecycleStage(input: LifecycleInput): LifecycleStage`
- `lifecycleLabel(stage: LifecycleStage): string`
- `LIFECYCLE_STAGES: readonly LifecycleStage[]` — canonical tab/dropdown order

`LifecycleInput` is a minimal shape that both `Submission` (homepage) and `PendingItem`
(`/admin/submissions`) can be adapted into, since the two surfaces use different object
types.

#### `src/utils/submissionFilters.ts`

One filter predicate shared by the homepage list and the export dialog.

```ts
interface SubmissionFilterState {
  search: string;
  listTitle: string;
  stage: string;          // "all" | LifecycleStage
  submitter: string;
  dateFrom: string;       // yyyy-mm-dd
  dateTo: string;         // yyyy-mm-dd, inclusive to end of day
  trainingTitle: string;  // "" = all | NO_TRAINING_TITLE | value
  publishProfile: string; // "" = all | profile key
}
```

Exports: `submissionMatchesFilters`, `collectTrainingTitles`, `collectPublishProfiles`,
`sortSubmissions`, and the `NO_TRAINING_TITLE` sentinel.

---

### A. Admin homepage

1. **`Submission` gains `publishKey?: string`.** The column is already fetched
   (`App.tsx` queries with `select: "*"`) but never surfaced on the mapped object.
   Populated in `mapSubmission`.

   `submissionData` is **left untouched** — `PublishKey` continues to appear there, so
   CSV export and the detail modal produce identical output to today. This duplicates the
   value in two places; accepted deliberately to guarantee zero regression, and noted as a
   follow-up.

2. **`DashboardContext` shrinks.** The ten individual filter props
   (`search`/`setSearch`/`listFilter`/`setListFilter`/`statusFilter`/`setStatusFilter`/
   `sortBy`/`setSortBy`/`submitterFilter`/`setSubmitterFilter`) collapse into
   `filters: SubmissionFilterState` + `setFilters`. `sortBy` remains a separate field, and
   `hasFilters` continues to be provided (derived) because `EmptyState` consumes it.
   TypeScript flags every call site, so no usage can be silently missed.

3. **Toolbar gains admin-only controls**, inside the existing "Advanced Search" collapse,
   all gated on `isAdmin`:
   - Date from / Date to
   - Training title dropdown — distinct values present in loaded submissions, plus an
     explicit "No training title" bucket
   - Publish profile dropdown
   - Status dropdown switches to the five lifecycle stages

   **`/user/dashboard` is unchanged.** `isAdmin` is false there, so users continue to see
   search / list / status / sort only. This reuses the gating pattern already applied to
   the submitter filter.

4. **Export dialog reuses `submissionMatchesFilters`**, seeded from the current on-screen
   filter state, with an option to widen to all submissions. Removes the third filter
   implementation.

### B. Notifications — removed

- Delete `src/components/dashboard/NotificationCenter.tsx`
- Remove both render sites and the import in `Header.tsx`
- Drop `submissions` and `onViewSubmission` from `HeaderProps` and the `AdminHomePage`
  call site — verified used **only** by `NotificationCenter`. `userEmail` is retained
  because the account menu uses it.

### C. `/admin/submissions` — reorganised by lifecycle

- **Primary tabs become the five lifecycle stages**, each with a live count.
- **Workflow type becomes a secondary dropdown** (All / Approval / Evaluation), derived
  from the current layer type as before — but as a filter, not a structural split.
- Items awaiting a manual branch selection are badged within **Pending**, since they are
  blocked on an admin.
- Training title, submitter, date range, profile filters and pagination are unchanged.

An item's tab now reflects *what needs doing* rather than which layer type it happens to
be sitting on, and items no longer migrate between tabs as they advance.

---

## Testing

- Unit tests for `submissionLifecycle.ts` and `submissionFilters.ts`, including the
  stage-derivation edge cases (rejected mid-workflow, manual-paper layers, no-layer forms)
  and date-boundary handling.
- `npm run build` and `npx vitest run` must both pass — both gate CI.

## Out of scope

Explicitly **not** touched:

- Routing, submission, approval, evaluation, or email behaviour
- SharePoint schema and provisioning
- The `/eval/...` reviewer pages
- Published forms, publish profiles, QR links, and all in-flight submissions

## Known limitations (deliberately deferred)

- **The `top: 100` per-form ceiling on `/admin/submissions` is not addressed.** Better
  filtering over a capped 100 rows is still capped. Server-side pagination is a separate
  piece of work.
- `publishKey` is duplicated between the typed field and `submissionData` (see A.1).
- The homepage status dropdown options change, which is user-visible on
  `/admin/dashboard`. This is intended.

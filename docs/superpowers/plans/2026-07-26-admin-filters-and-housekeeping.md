# Admin Filters & Submission Housekeeping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins one consistent filter vocabulary across the dashboard and `/admin/submissions`, remove the header notification centre, and reorganise `/admin/submissions` by lifecycle stage so items stop migrating between tabs as they advance.

**Architecture:** Two new pure modules (`submissionLifecycle.ts`, `submissionFilters.ts`) become the single source of truth for "what state is this submission in" and "does it match the current filters". Both existing surfaces adapt their own item type into those modules. `DashboardContext` collapses ten filter props into one state object. No workflow, schema, or routing behaviour changes.

**Tech Stack:** React 19, TypeScript (strict: `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`, `noUnusedParameters`), MUI v9, Vitest.

**Repo conventions that apply to every task:**
- Use `import type` for type-only imports.
- No `any`, no `@ts-ignore`, no `console.*`, no runtime `enum`.
- No `useMemo`/`useCallback` in new code (React 19). Existing ones in touched files may stay.
- Homepage/dashboard uses MUI `sx`; `ApprovalDashboard` uses inline styles via its local `C` object. Match whichever file you are in.
- Run `npm run build` before every commit. It is the only reliable check.

---

### Task 1: Remove the notification centre

Independent of everything else. Do it first to verify the pipeline.

**Files:**
- Delete: `src/components/dashboard/NotificationCenter.tsx`
- Modify: `src/components/dashboard/Header.tsx`
- Modify: `src/pages/AdminHomePage.tsx`

- [ ] **Step 1: Delete the component**

```bash
git rm src/components/dashboard/NotificationCenter.tsx
```

- [ ] **Step 2: Remove the import in `Header.tsx`**

Delete this line (currently line 36):

```tsx
import NotificationCenter from "./NotificationCenter";
```

- [ ] **Step 3: Remove both render sites in `Header.tsx`**

There are two. The compact/mobile one (around line 195):

```tsx
<NotificationCenter
  userEmail={userEmail}
  isAdmin={isAdmin}
  submissions={submissions}
  onViewSubmission={onViewSubmission}
  compact
/>
```

and the desktop one (around line 328):

```tsx
<NotificationCenter
  userEmail={userEmail}
  isAdmin={isAdmin}
  submissions={submissions}
  onViewSubmission={onViewSubmission}
/>
```

Delete both JSX elements entirely. Leave the surrounding `<>...</>` fragment and sibling elements intact.

- [ ] **Step 4: Drop the now-unused props from `HeaderProps`**

`submissions` and `onViewSubmission` were used **only** by `NotificationCenter`. `userEmail` is still used by the account menu — keep it.

In the `HeaderProps` interface, delete:

```tsx
  submissions: Submission[];
  onViewSubmission: (item: Submission) => void;
```

In the destructured parameter list, delete `submissions,` and `onViewSubmission,`.

Then remove the now-unused type import at the top of the file:

```tsx
import type { Submission } from "../../types";
```

`noUnusedLocals` will error if you leave it.

- [ ] **Step 5: Update the `AdminHomePage.tsx` call site**

Find the `<Header ... />` element and delete these two props:

```tsx
        submissions={submissions}
        onViewSubmission={setDetailItem}
```

Do **not** remove `submissions` or `setDetailItem` from the `useDashboard()` destructure — both are still used elsewhere in the file (`submissions` by the export rows and stats, `setDetailItem` by `SubmissionRow`).

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: succeeds with no new TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Remove header notification centre

Admins use /admin/submissions for the same information. Drops the
submissions and onViewSubmission props from Header, which were used
only by NotificationCenter."
```

---

### Task 2: `submissionLifecycle.ts` — the shared stage model

**Files:**
- Create: `src/utils/submissionLifecycle.ts`
- Test: `src/utils/__tests__/submissionLifecycle.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/submissionLifecycle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  LIFECYCLE_STAGES,
  isManualPaperStatus,
  lifecycleLabel,
  resolveLifecycleStage,
} from "../submissionLifecycle";

describe("isManualPaperStatus", () => {
  it("matches both manual paper sentinels case-insensitively", () => {
    expect(isManualPaperStatus("Manual Approval Required")).toBe(true);
    expect(isManualPaperStatus("manual evaluation required")).toBe(true);
    expect(isManualPaperStatus("  Manual Approval Required  ")).toBe(true);
  });

  it("rejects other statuses", () => {
    expect(isManualPaperStatus("Pending")).toBe(false);
    expect(isManualPaperStatus("Approved")).toBe(false);
    expect(isManualPaperStatus(null)).toBe(false);
    expect(isManualPaperStatus(undefined)).toBe(false);
  });
});

describe("resolveLifecycleStage", () => {
  it("treats rejection as terminal, ahead of everything else", () => {
    expect(resolveLifecycleStage({ formStatus: "Rejected" })).toBe("rejected");
    expect(resolveLifecycleStage({ formStatus: "Rejected at Layer 2" })).toBe("rejected");
    // Rejection wins even when the current layer is a manual paper layer.
    expect(
      resolveLifecycleStage({
        formStatus: "Rejected",
        currentLayerStatus: "Manual Approval Required",
      }),
    ).toBe("rejected");
  });

  it("treats completion as terminal", () => {
    expect(resolveLifecycleStage({ formStatus: "Completed" })).toBe("completed");
    expect(resolveLifecycleStage({ formStatus: "Approved" })).toBe("completed");
    expect(resolveLifecycleStage({ formStatus: "Fully Approved" })).toBe("completed");
  });

  it("reports manual paper when the live layer needs offline handling", () => {
    expect(
      resolveLifecycleStage({
        formStatus: "In Review",
        currentLayerStatus: "Manual Evaluation Required",
      }),
    ).toBe("manual_paper");
  });

  it("distinguishes in-review from untouched submissions", () => {
    expect(resolveLifecycleStage({ formStatus: "In Review" })).toBe("in_review");
    expect(resolveLifecycleStage({ formStatus: "Submitted" })).toBe("pending");
  });

  it("falls back to the legacy Status column and defaults to pending", () => {
    expect(resolveLifecycleStage({ status: "Approved Layer 1" })).toBe("in_review");
    expect(resolveLifecycleStage({})).toBe("pending");
    expect(resolveLifecycleStage({ formStatus: null, status: null })).toBe("pending");
  });
});

describe("lifecycleLabel", () => {
  it("labels every stage", () => {
    for (const stage of LIFECYCLE_STAGES) {
      expect(lifecycleLabel(stage).length).toBeGreaterThan(0);
    }
    expect(lifecycleLabel("manual_paper")).toBe("Manual / paper");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/__tests__/submissionLifecycle.test.ts`
Expected: FAIL — cannot resolve `../submissionLifecycle`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/submissionLifecycle.ts`:

```ts
import { isCompletedFormStatus, isRejectedStatus } from "./workflowStatus";

/** Canonical tab / dropdown order. */
export const LIFECYCLE_STAGES = [
  "pending",
  "in_review",
  "manual_paper",
  "completed",
  "rejected",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export interface LifecycleInput {
  /** Normalised form status (an SP_FORM_STATUS value) when available. */
  formStatus?: string | null;
  /** Legacy free-text Status column, used when formStatus is absent. */
  status?: string | null;
  /** Raw L{n}_Status of the layer currently awaiting action. */
  currentLayerStatus?: string | null;
}

/**
 * The two sentinel statuses written by the API when a layer has no online
 * reviewer and must be handled on paper by HR.
 * Mirrors manualPaperStatusForLayer() in api/submit-form.ts.
 */
export function isManualPaperStatus(value: string | null | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "manual approval required" || normalized === "manual evaluation required";
}

/**
 * Collapse a submission's workflow state into one housekeeping stage.
 * Terminal states win, then offline handling, then progress.
 */
export function resolveLifecycleStage(input: LifecycleInput): LifecycleStage {
  const formStatus = input.formStatus ?? input.status ?? "";
  if (isRejectedStatus(formStatus)) return "rejected";
  if (isCompletedFormStatus(formStatus)) return "completed";
  if (isManualPaperStatus(input.currentLayerStatus)) return "manual_paper";

  const normalized = formStatus.toLowerCase().replace(/[\s_-]/g, "");
  if (normalized.includes("review") || normalized.includes("progress") || normalized.includes("approvedlayer")) {
    return "in_review";
  }
  return "pending";
}

export function lifecycleLabel(stage: LifecycleStage): string {
  const labels: Record<LifecycleStage, string> = {
    pending: "Pending",
    in_review: "In review",
    manual_paper: "Manual / paper",
    completed: "Completed",
    rejected: "Rejected",
  };
  return labels[stage];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/__tests__/submissionLifecycle.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Build and commit**

```bash
npm run build
git add src/utils/submissionLifecycle.ts src/utils/__tests__/submissionLifecycle.test.ts
git commit -m "Add shared submission lifecycle stage model

One definition of pending / in review / manual paper / completed /
rejected, derived from the statuses resolveWorkflowDisplayState already
produces. Consumed by both the dashboard and /admin/submissions."
```

---

### Task 3: Surface the current layer's raw status on `Submission`

`mapSubmission` already collects raw `L{n}_Status` strings into `layerStatusValues` and then discards them. `manual_paper` detection needs the current layer's value. Also adds `publishKey`, which is fetched (`select: "*"`) but never surfaced.

**Files:**
- Modify: `src/types/index.ts` (the `Submission` interface, around line 18-45)
- Modify: `src/App.tsx` (`mapSubmission`, around lines 434-585)

- [ ] **Step 1: Extend the `Submission` interface**

In `src/types/index.ts`, inside `export interface Submission`, add these two fields immediately after `formVersion: string;`:

```ts
  /** Published profile (PublishKey) the submission was sent under. */
  publishKey?: string;
  /** Raw L{n}_Status of the layer currently awaiting action, for lifecycle derivation. */
  currentLayerStatus?: string;
```

- [ ] **Step 2: Populate both in `mapSubmission`**

In `src/App.tsx`, find the `return {` block at the end of `mapSubmission` (around line 565). Add these three lines alongside the existing fields — `currentLayer` and `layerStatusValues` are both already in scope at this point:

```ts
    publishKey: raw.PublishKey ? String(raw.PublishKey) : undefined,
    currentLayerStatus:
      currentLayer > 0 && layerStatusValues[currentLayer - 1]
        ? String(layerStatusValues[currentLayer - 1])
        : undefined,
```

**On the indexing — verify this rather than trusting it.** `mapSubmission` fills `layerStatusValues` in two different branches: the `layersConfig` path uses `layerStatusValues[i]` (0-based position), and the legacy fallback uses `layerStatusValues[i - 1]` (i is 1..3). Both end up 0-based by layer number, which is exactly how `resolveWorkflowDisplayState` already reads the array (`layerStatuses[rawCurrentLayer - 1]`). `currentLayer` at the return site is the post-`displayState` value, i.e. a 1-based layer number. So `layerStatusValues[currentLayer - 1]` is correct and consistent with existing behaviour.

Do **not** add `PublishKey` to the `isDashboardInternalField` exclusion list. Leaving it in `submissionData` keeps CSV export and the detail modal byte-identical to today. The duplication is deliberate and recorded in the spec.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds. Both fields are optional, so no call site breaks.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/App.tsx
git commit -m "Surface publishKey and current layer status on Submission

Both values are already fetched; mapSubmission computed the raw layer
statuses and discarded them. Needed for profile filtering and manual
paper detection. submissionData is left untouched so CSV export and the
detail modal are unchanged."
```

---

### Task 4: `submissionFilters.ts` — the shared filter predicate

**Files:**
- Create: `src/utils/submissionFilters.ts`
- Test: `src/utils/__tests__/submissionFilters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/submissionFilters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Submission } from "../../types";
import {
  EMPTY_SUBMISSION_FILTERS,
  NO_TRAINING_TITLE,
  collectPublishProfiles,
  collectTrainingTitles,
  countActiveFilters,
  sortSubmissions,
  submissionMatchesFilters,
} from "../submissionFilters";

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "1",
    submissionId: "1",
    listTitle: "Training Feedback",
    formId: "FRM-001",
    formVersion: "1.0",
    title: "Item 1",
    submittedByEmail: "ahmad@example.com",
    submittedAt: "2026-07-10T09:00:00.000Z",
    formStatus: "Submitted",
    totalLayers: 2,
    layers: [],
    meta: { icon: "", color: "", pale: "", category: "HR" },
    submissionData: {},
    ...overrides,
  };
}

describe("submissionMatchesFilters", () => {
  it("matches everything when no filters are set", () => {
    expect(submissionMatchesFilters(makeSubmission(), EMPTY_SUBMISSION_FILTERS)).toBe(true);
  });

  it("searches title, form id and submission id", () => {
    const item = makeSubmission({ title: "Safety Briefing" });
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, search: "safety" })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, search: "FRM-001" })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, search: "nope" })).toBe(false);
  });

  it("filters by list title exactly", () => {
    const item = makeSubmission();
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, listTitle: "Training Feedback" })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, listTitle: "Other Form" })).toBe(false);
  });

  it("filters by lifecycle stage", () => {
    const pending = makeSubmission({ formStatus: "Submitted" });
    const done = makeSubmission({ formStatus: "Completed" });
    expect(submissionMatchesFilters(pending, { ...EMPTY_SUBMISSION_FILTERS, stage: "pending" })).toBe(true);
    expect(submissionMatchesFilters(pending, { ...EMPTY_SUBMISSION_FILTERS, stage: "completed" })).toBe(false);
    expect(submissionMatchesFilters(done, { ...EMPTY_SUBMISSION_FILTERS, stage: "completed" })).toBe(true);
  });

  it("matches submitter across email and display names", () => {
    const item = makeSubmission({ submitterName: "Ahmad Zahari" });
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, submitter: "zahari" })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, submitter: "ahmad@" })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, submitter: "siti" })).toBe(false);
  });

  it("treats the date range as inclusive of both whole days", () => {
    const item = makeSubmission({ submittedAt: "2026-07-10T23:30:00.000Z" });
    expect(
      submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, dateFrom: "2026-07-10", dateTo: "2026-07-10" }),
    ).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, dateFrom: "2026-07-11" })).toBe(false);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, dateTo: "2026-07-09" })).toBe(false);
  });

  it("filters by training title including an explicit empty bucket", () => {
    const withTitle = makeSubmission({ submissionData: { trainingTitle: "Fire Safety" } });
    const withoutTitle = makeSubmission({ submissionData: {} });
    expect(submissionMatchesFilters(withTitle, { ...EMPTY_SUBMISSION_FILTERS, trainingTitle: "Fire Safety" })).toBe(true);
    expect(submissionMatchesFilters(withTitle, { ...EMPTY_SUBMISSION_FILTERS, trainingTitle: NO_TRAINING_TITLE })).toBe(false);
    expect(submissionMatchesFilters(withoutTitle, { ...EMPTY_SUBMISSION_FILTERS, trainingTitle: NO_TRAINING_TITLE })).toBe(true);
  });

  it("filters by publish profile, treating missing as the default profile", () => {
    const cSuite = makeSubmission({ publishKey: "c-suite" });
    const legacy = makeSubmission({ publishKey: undefined });
    expect(submissionMatchesFilters(cSuite, { ...EMPTY_SUBMISSION_FILTERS, publishProfile: "c-suite" })).toBe(true);
    expect(submissionMatchesFilters(legacy, { ...EMPTY_SUBMISSION_FILTERS, publishProfile: "c-suite" })).toBe(false);
    expect(submissionMatchesFilters(legacy, { ...EMPTY_SUBMISSION_FILTERS, publishProfile: "production" })).toBe(true);
  });
});

describe("collectTrainingTitles", () => {
  it("returns sorted distinct titles and ignores blanks", () => {
    const items = [
      makeSubmission({ submissionData: { trainingTitle: "Safety" } }),
      makeSubmission({ submissionData: { trainingTitle: "First Aid" } }),
      makeSubmission({ submissionData: { trainingTitle: "Safety" } }),
      makeSubmission({ submissionData: {} }),
    ];
    expect(collectTrainingTitles(items)).toEqual(["First Aid", "Safety"]);
  });
});

describe("collectPublishProfiles", () => {
  it("returns sorted distinct profiles and normalises missing to production", () => {
    const items = [
      makeSubmission({ publishKey: "c-suite" }),
      makeSubmission({ publishKey: undefined }),
      makeSubmission({ publishKey: "c-suite" }),
    ];
    expect(collectPublishProfiles(items)).toEqual(["c-suite", "production"]);
  });
});

describe("sortSubmissions", () => {
  it("sorts newest first by default and oldest first on request", () => {
    const older = makeSubmission({ id: "a", submittedAt: "2026-07-01T00:00:00.000Z" });
    const newer = makeSubmission({ id: "b", submittedAt: "2026-07-20T00:00:00.000Z" });
    expect(sortSubmissions([older, newer], "newest").map((i) => i.id)).toEqual(["b", "a"]);
    expect(sortSubmissions([older, newer], "oldest").map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const items = [
      makeSubmission({ id: "a", submittedAt: "2026-07-01T00:00:00.000Z" }),
      makeSubmission({ id: "b", submittedAt: "2026-07-20T00:00:00.000Z" }),
    ];
    sortSubmissions(items, "newest");
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("countActiveFilters", () => {
  it("counts only fields that differ from the empty state", () => {
    expect(countActiveFilters(EMPTY_SUBMISSION_FILTERS)).toBe(0);
    expect(countActiveFilters({ ...EMPTY_SUBMISSION_FILTERS, search: "x", stage: "pending" })).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/__tests__/submissionFilters.test.ts`
Expected: FAIL — cannot resolve `../submissionFilters`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/submissionFilters.ts`:

```ts
import type { Submission } from "../types";
import { resolveLifecycleStage, type LifecycleStage } from "./submissionLifecycle";

/** Sentinel for "submissions that have no training title at all". */
export const NO_TRAINING_TITLE = "__NO_TRAINING_TITLE__";

/** Form field carrying the training title. Mirrors ApprovalDashboard. */
export const TRAINING_TITLE_FIELD = "trainingTitle";

/** Profile key used for submissions predating the PublishKey column. */
export const DEFAULT_PROFILE_KEY = "production";

export interface SubmissionFilterState {
  search: string;
  listTitle: string;
  /** "all" or a LifecycleStage value. */
  stage: string;
  submitter: string;
  /** yyyy-mm-dd, inclusive from start of day. */
  dateFrom: string;
  /** yyyy-mm-dd, inclusive to end of day. */
  dateTo: string;
  /** "" = all, NO_TRAINING_TITLE, or an exact title. */
  trainingTitle: string;
  /** "" = all, or a profile key. */
  publishProfile: string;
}

export const EMPTY_SUBMISSION_FILTERS: SubmissionFilterState = {
  search: "",
  listTitle: "",
  stage: "all",
  submitter: "",
  dateFrom: "",
  dateTo: "",
  trainingTitle: "",
  publishProfile: "",
};

export function getSubmissionTrainingTitle(item: Submission): string {
  const value = item.submissionData[TRAINING_TITLE_FIELD];
  return typeof value === "string" ? value.trim() : "";
}

export function getSubmissionProfileKey(item: Submission): string {
  return (item.publishKey ?? "").trim() || DEFAULT_PROFILE_KEY;
}

export function getSubmissionStage(item: Submission): LifecycleStage {
  return resolveLifecycleStage({
    formStatus: item.formStatus,
    currentLayerStatus: item.currentLayerStatus,
  });
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value: string): Date | null {
  const date = parseDate(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: string): Date | null {
  const date = parseDate(value);
  if (!date) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

export function submissionMatchesFilters(item: Submission, filters: SubmissionFilterState): boolean {
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    const haystack = [item.title, item.formId, item.submissionId];
    if (!haystack.some((value) => value.toLowerCase().includes(needle))) return false;
  }

  if (filters.listTitle && item.listTitle !== filters.listTitle) return false;

  if (filters.stage !== "all" && getSubmissionStage(item) !== filters.stage) return false;

  if (filters.submitter) {
    const needle = filters.submitter.toLowerCase();
    const candidates = [
      item.submittedByEmail,
      item.submitterName ?? "",
      item.createdByName ?? "",
      item.createdByEmail ?? "",
    ];
    if (!candidates.some((candidate) => candidate.toLowerCase().includes(needle))) return false;
  }

  if (filters.dateFrom || filters.dateTo) {
    const submitted = parseDate(item.submittedAt);
    if (!submitted) return false;
    const from = filters.dateFrom ? startOfDay(filters.dateFrom) : null;
    const to = filters.dateTo ? endOfDay(filters.dateTo) : null;
    if (from && submitted < from) return false;
    if (to && submitted > to) return false;
  }

  if (filters.trainingTitle) {
    const title = getSubmissionTrainingTitle(item);
    if (filters.trainingTitle === NO_TRAINING_TITLE) {
      if (title) return false;
    } else if (title !== filters.trainingTitle) {
      return false;
    }
  }

  if (filters.publishProfile && getSubmissionProfileKey(item) !== filters.publishProfile) return false;

  return true;
}

export function collectTrainingTitles(items: Submission[]): string[] {
  const titles = new Set<string>();
  for (const item of items) {
    const title = getSubmissionTrainingTitle(item);
    if (title) titles.add(title);
  }
  return Array.from(titles).sort((a, b) => a.localeCompare(b));
}

export function collectPublishProfiles(items: Submission[]): string[] {
  const profiles = new Set<string>();
  for (const item of items) profiles.add(getSubmissionProfileKey(item));
  return Array.from(profiles).sort((a, b) => a.localeCompare(b));
}

export function sortSubmissions(items: Submission[], sortBy: string): Submission[] {
  return [...items].sort((a, b) => {
    switch (sortBy) {
      case "oldest":
        return (a.submittedAt || "").localeCompare(b.submittedAt || "");
      case "status":
        return getSubmissionStage(a).localeCompare(getSubmissionStage(b));
      case "list":
        return a.listTitle.localeCompare(b.listTitle);
      default:
        return (b.submittedAt || "").localeCompare(a.submittedAt || "");
    }
  });
}

export function countActiveFilters(filters: SubmissionFilterState): number {
  return (Object.keys(EMPTY_SUBMISSION_FILTERS) as (keyof SubmissionFilterState)[]).filter(
    (key) => filters[key] !== EMPTY_SUBMISSION_FILTERS[key],
  ).length;
}

export function hasActiveFilters(filters: SubmissionFilterState): boolean {
  return countActiveFilters(filters) > 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/__tests__/submissionFilters.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Build and commit**

```bash
npm run build
git add src/utils/submissionFilters.ts src/utils/__tests__/submissionFilters.test.ts
git commit -m "Add shared submission filter predicate

One implementation of search / list / stage / submitter / date range /
training title / profile filtering, replacing what will otherwise be
three separate copies."
```

---

### Task 5: Collapse the ten filter props into one state object

**Files:**
- Modify: `src/contexts/DashboardContext.tsx`
- Modify: `src/App.tsx` (state at lines 624-629, filter pipeline at ~1168-1214, provider at ~1325-1350)
- Modify: `src/pages/AdminHomePage.tsx` (`useDashboard()` destructure, `<Toolbar>` call site)
- Modify: `src/components/dashboard/Toolbar.tsx` (props only — new controls come in Task 6)

- [ ] **Step 1: Update `DashboardContext.tsx`**

Add the import at the top:

```ts
import type { SubmissionFilterState } from "../utils/submissionFilters";
```

In `DashboardContextValue`, delete these ten lines:

```ts
  search: string;
  setSearch: (s: string) => void;
  listFilter: string;
  setListFilter: (s: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  sortBy: string;
  setSortBy: (s: string) => void;
  submitterFilter: string;
  setSubmitterFilter: (s: string) => void;
```

and replace them with:

```ts
  filters: SubmissionFilterState;
  setFilters: (filters: SubmissionFilterState) => void;
  sortBy: string;
  setSortBy: (s: string) => void;
```

`sortBy` stays separate — it is a sort, not a filter, and `sortSubmissions` takes it as its own argument.

- [ ] **Step 2: Replace the filter state in `App.tsx`**

Add these imports near the other `src/utils` imports:

```ts
import {
  EMPTY_SUBMISSION_FILTERS,
  hasActiveFilters,
  sortSubmissions,
  submissionMatchesFilters,
} from "./utils/submissionFilters";
import type { SubmissionFilterState } from "./utils/submissionFilters";
```

Replace the five `useState` declarations at lines 624-629:

```ts
  // Filters
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [submitterFilter, setSubmitterFilter] = useState("");
```

with:

```ts
  // Filters
  const [filters, setFilters] = useState<SubmissionFilterState>(EMPTY_SUBMISSION_FILTERS);
  const [sortBy, setSortBy] = useState("newest");
```

- [ ] **Step 3: Replace the filter pipeline in `App.tsx`**

Find `const filteredSubmissions = submissions.filter((item) => {` (around line 1163) and replace the whole `filteredSubmissions` + `sortedSubmissions` + `hasFilters` block — everything from that line down to and including `const hasFilters = !!(search || listFilter || statusFilter !== "all" || submitterFilter);` — with:

```ts
  const filteredSubmissions = submissions.filter((item) => submissionMatchesFilters(item, filters));
  const sortedSubmissions = sortSubmissions(filteredSubmissions, sortBy);
```

Keep the `listMetaMap` block that sits between them exactly where it is — move it above the two lines above if needed, it has no dependency on the filters.

Then, where `hasFilters` was defined, put:

```ts
  const hasFilters = hasActiveFilters(filters);
```

- [ ] **Step 4: Delete the now-unused `normalizeStatus` helper**

`normalizeStatus` at `src/App.tsx:340` has no remaining callers once Step 3 lands. `noUnusedLocals` will flag it. Delete the whole function:

```ts
function normalizeStatus(status: string | null): string {
  // ...
}
```

If the build reports it is still referenced somewhere, keep it and skip this step.

- [ ] **Step 5: Update the `DashboardProvider` call site in `App.tsx`**

Replace these ten props:

```tsx
        search={search}
        setSearch={setSearch}
        listFilter={listFilter}
        setListFilter={setListFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        sortBy={sortBy}
        setSortBy={setSortBy}
        submitterFilter={submitterFilter}
        setSubmitterFilter={setSubmitterFilter}
```

with:

```tsx
        filters={filters}
        setFilters={setFilters}
        sortBy={sortBy}
        setSortBy={setSortBy}
```

- [ ] **Step 6: Update `AdminHomePage.tsx`**

In the `useDashboard()` destructure, replace:

```ts
    search,
    setSearch,
    listFilter,
    setListFilter,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    submitterFilter,
    setSubmitterFilter,
```

with:

```ts
    filters,
    setFilters,
    sortBy,
    setSortBy,
```

Then update the `<Toolbar>` call site, replacing the ten filter props with:

```tsx
            filters={filters}
            setFilters={setFilters}
            sortBy={sortBy}
            setSortBy={setSortBy}
```

Leave `isAdmin`, `canExportSubmissions`, `onOpenExport`, `visibleLists`, `total` and `filtered` as they are.

- [ ] **Step 7: Update `Toolbar.tsx` to the new prop shape**

Add the import:

```ts
import { EMPTY_SUBMISSION_FILTERS, countActiveFilters } from "../../utils/submissionFilters";
import type { SubmissionFilterState } from "../../utils/submissionFilters";
```

In `ToolbarProps`, replace the ten filter props with:

```ts
  filters: SubmissionFilterState;
  setFilters: (filters: SubmissionFilterState) => void;
  sortBy: string;
  setSortBy: (v: string) => void;
```

Update the destructured parameter list to match.

Add a single patch helper just inside the component body:

```tsx
  const patch = (next: Partial<SubmissionFilterState>) => setFilters({ ...filters, ...next });
```

Then rewire the existing controls:

| Was | Becomes |
|---|---|
| `value={search}` / `onChange={(e) => setSearch(e.target.value)}` | `value={filters.search}` / `onChange={(e) => patch({ search: e.target.value })}` |
| `value={listFilter}` / `setListFilter(e.target.value)` | `value={filters.listTitle}` / `patch({ listTitle: e.target.value })` |
| `value={statusFilter}` / `setStatusFilter(e.target.value)` | `value={filters.stage}` / `patch({ stage: e.target.value })` |
| `value={submitterFilter}` / `setSubmitterFilter(e.target.value)` | `value={filters.submitter}` / `patch({ submitter: e.target.value })` |

`sortBy` / `setSortBy` are unchanged.

Replace the two local derived values:

```tsx
  const detailedFilterCount = [
    Boolean(listFilter),
    statusFilter !== "all",
    sortBy !== "newest",
    Boolean(submitterFilter),
  ].filter(Boolean).length;
  const hasFilters =
    search || listFilter || statusFilter !== "all" || sortBy !== "newest" || submitterFilter;
```

with:

```tsx
  const detailedFilterCount = countActiveFilters(filters) + (sortBy !== "newest" ? 1 : 0);
  const hasFilters = detailedFilterCount > 0;
```

and replace `clearFilters`:

```tsx
  const clearFilters = () => {
    setFilters(EMPTY_SUBMISSION_FILTERS);
    setSortBy("newest");
  };
```

Leave the status `<Select>` options alone for now — Task 6 replaces them.

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: succeeds. If it reports a missed `search` / `listFilter` / `statusFilter` / `submitterFilter` reference, fix that call site — the compiler is finding exactly what this task is meant to catch.

- [ ] **Step 9: Commit**

```bash
git add src/contexts/DashboardContext.tsx src/App.tsx src/pages/AdminHomePage.tsx src/components/dashboard/Toolbar.tsx
git commit -m "Collapse dashboard filter props into one state object

Replaces ten individual context props with filters/setFilters and routes
the dashboard list through the shared submissionMatchesFilters predicate.
Behaviour is unchanged; the context surface shrinks."
```

---

### Task 6: Admin-only filter controls in the toolbar

**Files:**
- Modify: `src/components/dashboard/Toolbar.tsx`
- Modify: `src/pages/AdminHomePage.tsx` (pass the option lists)

- [ ] **Step 1: Pass the available options from `AdminHomePage.tsx`**

Add the import:

```ts
import { collectPublishProfiles, collectTrainingTitles } from "../utils/submissionFilters";
```

Just above the `return (`, add:

```tsx
  const trainingTitleOptions = collectTrainingTitles(submissions);
  const publishProfileOptions = collectPublishProfiles(submissions);
```

Pass them to `<Toolbar>`:

```tsx
            trainingTitleOptions={trainingTitleOptions}
            publishProfileOptions={publishProfileOptions}
```

- [ ] **Step 2: Accept them in `Toolbar.tsx`**

Add to `ToolbarProps`:

```ts
  trainingTitleOptions: string[];
  publishProfileOptions: string[];
```

Add `trainingTitleOptions,` and `publishProfileOptions,` to the destructured parameter list.

Extend the lifecycle import added in Task 5:

```ts
import { LIFECYCLE_STAGES, lifecycleLabel } from "../../utils/submissionLifecycle";
import { EMPTY_SUBMISSION_FILTERS, NO_TRAINING_TITLE, countActiveFilters } from "../../utils/submissionFilters";
```

- [ ] **Step 3: Replace the status `<Select>` options with lifecycle stages**

Find the Status `<FormControl>` and replace its `<MenuItem>` children:

```tsx
                  <MenuItem value="all">All statuses</MenuItem>
                  <MenuItem value="pending">Pending</MenuItem>
                  <MenuItem value="inProgress">In Review</MenuItem>
                  <MenuItem value="approved">Approved</MenuItem>
                  <MenuItem value="fullyApproved">Fully Approved</MenuItem>
                  <MenuItem value="rejected">Rejected</MenuItem>
```

with:

```tsx
                  <MenuItem value="all">All statuses</MenuItem>
                  {LIFECYCLE_STAGES.map((stage) => (
                    <MenuItem key={stage} value={stage}>
                      {lifecycleLabel(stage)}
                    </MenuItem>
                  ))}
```

- [ ] **Step 4: Add the four admin-only controls**

Immediately after the existing admin-only submitter `<TextField>` (inside the same grid, still within the `{isAdmin && (...)}` region), extend that block so all five admin controls are grouped. Replace:

```tsx
              {isAdmin && (
                <TextField
                  placeholder="Filter by submitter email..."
                  value={filters.submitter}
                  onChange={(e) => patch({ submitter: e.target.value })}
                  size="small"
                  sx={searchFieldSx}
                />
              )}
```

with:

```tsx
              {isAdmin && (
                <>
                  <TextField
                    placeholder="Filter by submitter email..."
                    value={filters.submitter}
                    onChange={(e) => patch({ submitter: e.target.value })}
                    size="small"
                    sx={searchFieldSx}
                  />

                  <TextField
                    label="Submitted from"
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => patch({ dateFrom: e.target.value })}
                    size="small"
                    sx={searchFieldSx}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />

                  <TextField
                    label="Submitted to"
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => patch({ dateTo: e.target.value })}
                    size="small"
                    sx={searchFieldSx}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />

                  <FormControl size="small" sx={{ minWidth: 0 }}>
                    <InputLabel>Training title</InputLabel>
                    <Select
                      value={filters.trainingTitle}
                      label="Training title"
                      onChange={(e) => patch({ trainingTitle: e.target.value })}
                      sx={selectSx}
                    >
                      <MenuItem value="">All training titles</MenuItem>
                      <MenuItem value={NO_TRAINING_TITLE}>No training title</MenuItem>
                      {trainingTitleOptions.map((title) => (
                        <MenuItem key={title} value={title}>
                          {title}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 0 }}>
                    <InputLabel>Profile</InputLabel>
                    <Select
                      value={filters.publishProfile}
                      label="Profile"
                      onChange={(e) => patch({ publishProfile: e.target.value })}
                      sx={selectSx}
                    >
                      <MenuItem value="">All profiles</MenuItem>
                      {publishProfileOptions.map((profile) => (
                        <MenuItem key={profile} value={profile}>
                          {profile}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </>
              )}
```

`/user/dashboard` renders with `isAdmin === false`, so none of these appear there.

- [ ] **Step 5: Widen the grid for the extra admin controls**

The grid currently assumes at most four columns. Find:

```tsx
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: isAdmin ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))",
                  lg: isAdmin ? "repeat(4, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))",
                },
```

and replace with:

```tsx
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                  lg: isAdmin ? "repeat(4, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))",
                },
```

The admin grid now wraps to two rows of four on `lg`, which is the intended layout.

- [ ] **Step 6: Build and verify manually**

Run: `npm run build`
Expected: succeeds.

Then run `npm run dev`, sign in as an admin, open `/admin/dashboard`, expand **Advanced Search**, and confirm: date from/to, training title, profile and the five lifecycle statuses are present and filter the list. Then visit `/user/dashboard` and confirm only search / list / status / sort appear.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/Toolbar.tsx src/pages/AdminHomePage.tsx
git commit -m "Add admin-only date, training title and profile filters

Brings the dashboard toolbar in line with /admin/submissions and switches
the status dropdown to lifecycle stages. All new controls are gated on
isAdmin, so /user/dashboard is unchanged."
```

---

### Task 7: Make export reuse the on-screen filters

**Files:**
- Modify: `src/pages/AdminHomePage.tsx`

- [ ] **Step 1: Delete the duplicate filter machinery**

Remove these top-level helpers, which no longer have callers: `submissionMatchesExportFilters`, `exportDateRange`, `startOfDay`, `endOfDay`, and the `ExportDatePreset` type. Keep `parseDateValue` only if the build shows it is still used elsewhere; otherwise remove it too. Keep `csvCell`, `EXPORT_BASE_COLUMNS`, `buildSubmissionCsv` and `downloadCsv` untouched.

- [ ] **Step 2: Replace the export dialog state**

Delete:

```tsx
  const [exportDatePreset, setExportDatePreset] = useState<ExportDatePreset>("all");
  const [exportCustomFrom, setExportCustomFrom] = useState("");
  const [exportCustomTo, setExportCustomTo] = useState("");
  const [exportListFilter, setExportListFilter] = useState("");
  const [exportCategoryFilter, setExportCategoryFilter] = useState("");
  const [exportSubmitterFilter, setExportSubmitterFilter] = useState("");
```

and replace with a single scope toggle:

```tsx
  const [exportScope, setExportScope] = useState<"current" | "all">("current");
```

- [ ] **Step 3: Replace the export row computation**

Delete the `exportRows` block that calls `submissionMatchesExportFilters` and replace with:

```tsx
  const exportRows = exportScope === "all" ? submissions : sortedSubmissions;
```

`sortedSubmissions` is already exactly "what the admin is currently looking at", so this is the whole point of the task.

- [ ] **Step 4: Simplify the export dialog body**

Replace the dialog's filter controls with the scope choice and a live count. Inside `<DialogContent>`:

```tsx
            <Stack spacing={2} sx={{ pt: 1 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Scope</InputLabel>
                <Select
                  value={exportScope}
                  label="Scope"
                  onChange={(e) => setExportScope(e.target.value as "current" | "all")}
                >
                  <MenuItem value="current">Current view (filters applied)</MenuItem>
                  <MenuItem value="all">All submissions</MenuItem>
                </Select>
              </FormControl>

              <Typography variant="body2" sx={{ color: editorial.muted }}>
                {exportRows.length} submission{exportRows.length === 1 ? "" : "s"} will be exported.
              </Typography>
            </Stack>
```

Leave `<DialogTitle>` and `<DialogActions>` (including the button that calls `handleExportCsv`) as they are.

- [ ] **Step 5: Simplify the export filename**

Replace the `scopePart` computation inside `handleExportCsv` with:

```tsx
    const scopePart = exportScope === "all" ? "all" : "filtered";
```

- [ ] **Step 6: Remove now-unused values**

`categoryOptions` was only consumed by the deleted category filter. If the build flags it as unused, delete it. Same for any MUI imports that become unused.

- [ ] **Step 7: Build and verify**

Run: `npm run build`
Expected: succeeds.

Then in `npm run dev`: filter the list, click **Export submissions**, and confirm the dialog reports the same count as the on-screen list, and that switching to "All submissions" reports the full count.

- [ ] **Step 8: Commit**

```bash
git add src/pages/AdminHomePage.tsx
git commit -m "Make CSV export follow the on-screen filters

Deletes the third filter implementation. The dialog now exports either
the current filtered view or all submissions, instead of asking the admin
to re-pick date, list, category and submitter."
```

---

### Task 8: Reorganise `/admin/submissions` by lifecycle stage

**Files:**
- Modify: `src/components/builder/ApprovalDashboard.tsx`

- [ ] **Step 1: Carry per-layer statuses on `PendingItem`**

In the `PendingItem` interface (line 84), add:

```ts
  /** Raw L{n}_Status by layer number, loaded via a tolerant tier query. */
  layerStatuses?: Record<number, string>;
```

- [ ] **Step 2: Add a tolerant tier query for layer statuses**

The loader already isolates optional columns into separate queries that swallow 400s, so a list missing a column cannot break the core fetch. Follow that pattern exactly.

Next to the existing tier query for `CurrentLayer` (around line 965), add another that selects layers 1 to 5:

```tsx
                  const layerStatusRows = await spGet(
                    token,
                    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,L1_Status,L2_Status,L3_Status,L4_Status,L5_Status&$orderby=Created desc&$top=100`
                  ).catch(() => null) as { value?: Record<string, unknown>[] } | null;
```

and merge the result into each item the same way the neighbouring tiers do:

```tsx
                  const layerStatusById = new Map<number, Record<number, string>>();
                  for (const row of layerStatusRows?.value ?? []) {
                    const id = Number(row.Id);
                    const statuses: Record<number, string> = {};
                    for (let n = 1; n <= 5; n++) {
                      const value = row[`L${n}_Status`];
                      if (typeof value === "string" && value.trim()) statuses[n] = value;
                    }
                    if (Object.keys(statuses).length > 0) layerStatusById.set(id, statuses);
                  }
```

then, where the tiers are stitched onto items, set `layerStatuses: layerStatusById.get(item.Id)`.

Five layers matches the builder's own default (`AdminFormBuilder` seeds five layer slots) and the `minLayerColumns: 3` provisioning floor. Items with more layers simply fall back to `pending` / `in_review`, which is the current behaviour.

- [ ] **Step 3: Add the stage adapter**

Below `getItemStatus` (line 227), add:

```tsx
function getItemLifecycleStage(item: PendingItem): LifecycleStage {
  const currentLayerNumber = Math.max(item.CurrentLayer || 0, item.CurrentApprovalLayer || 0);
  return resolveLifecycleStage({
    formStatus: item.FormStatus,
    status: item.Status,
    currentLayerStatus: currentLayerNumber > 0 ? item.layerStatuses?.[currentLayerNumber] : undefined,
  });
}

/** Manual-branch forms are parked at CurrentLayer 0 until an admin picks a branch. */
function needsBranchPick(item: PendingItem): boolean {
  return (item.CurrentLayer ?? 0) === 0 && !(item.SelectedBranch ?? "").trim();
}
```

Add the import at the top of the file:

```ts
import { LIFECYCLE_STAGES, lifecycleLabel, resolveLifecycleStage } from "../../utils/submissionLifecycle";
import type { LifecycleStage } from "../../utils/submissionLifecycle";
```

- [ ] **Step 4: Replace the two filter states**

Replace:

```tsx
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "evaluated">("pending");
  const [viewMode, setViewMode] = useState<"approvals" | "evaluations">("approvals");
```

with:

```tsx
  const [stageFilter, setStageFilter] = useState<LifecycleStage>("pending");
  const [workflowTypeFilter, setWorkflowTypeFilter] = useState<"all" | "approval" | "evaluation">("all");
```

- [ ] **Step 5: Rewrite `categoryItems` and `filteredItems`**

Replace the `categoryItems` memo:

```tsx
  const categoryItems = useMemo(() => {
    if (workflowTypeFilter === "all") return baseFilteredItems;
    return baseFilteredItems.filter((i) =>
      workflowTypeFilter === "evaluation"
        ? itemCurrentTypes[getPendingItemKey(i)] === "evaluation"
        : itemCurrentTypes[getPendingItemKey(i)] !== "evaluation",
    );
  }, [baseFilteredItems, itemCurrentTypes, workflowTypeFilter]);
```

and replace the status branch inside `filteredItems`:

```tsx
    if (statusFilter === "pending") {
      items = items.filter(i => getItemStatus(i) === "pending");
    } else if (statusFilter === "approved") {
      items = items.filter(i => getItemStatus(i) === "approved");
    } else if (statusFilter === "rejected") {
      items = items.filter(i => getItemStatus(i) === "rejected");
    } else if (statusFilter === "evaluated") {
      items = items.filter(i => getItemStatus(i) !== "pending");
    }
```

with:

```tsx
    items = items.filter((i) => getItemLifecycleStage(i) === stageFilter);
```

Update that memo's dependency array from `[categoryItems, statusFilter, trainingFilter, profileFilter]` to `[categoryItems, stageFilter, trainingFilter, profileFilter]`.

Update the page-reset effect dependency array, replacing `viewMode, statusFilter` with `workflowTypeFilter, stageFilter`.

Update the training/profile reset effect, replacing its `[viewMode]` dependency with `[workflowTypeFilter]`.

- [ ] **Step 6: Replace the tab UI**

Replace the whole `viewMode` pill row (around line 2330) and the status tab row beneath it with lifecycle tabs plus a workflow-type dropdown:

```tsx
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {LIFECYCLE_STAGES.map((stage) => {
            const count = categoryItems.filter((item) => getItemLifecycleStage(item) === stage).length;
            return (
              <button
                key={stage}
                onClick={() => setStageFilter(stage)}
                style={{
                  padding: "6px 16px", borderRadius: 20, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: 600,
                  background: stageFilter === stage ? C.purple : "#fff",
                  color: stageFilter === stage ? "#fff" : C.textSecond,
                  boxShadow: stageFilter === stage ? "none" : "0 1px 2px rgba(0,0,0,0.06)",
                }}
              >
                {lifecycleLabel(stage)} ({count})
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: C.textSecond }}>Workflow type</label>
          <select
            value={workflowTypeFilter}
            onChange={(e) => setWorkflowTypeFilter(e.target.value as "all" | "approval" | "evaluation")}
            style={{
              padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
              fontSize: 13, color: C.textPrimary, outline: "none", background: "#fff",
            }}
          >
            <option value="all">All</option>
            <option value="approval">Approval</option>
            <option value="evaluation">Evaluation</option>
          </select>
        </div>
```

- [ ] **Step 7: Badge items awaiting a branch pick**

In the list row rendering, inside the block that already renders the status chip (around line 2725), add after it:

```tsx
                        {needsBranchPick(item) && (
                          <span style={{
                            marginLeft: 6, padding: "2px 8px", borderRadius: 999,
                            background: C.amberPale, color: "#92400E",
                            fontSize: 10, fontWeight: 700,
                          }}>
                            Branch not selected
                          </span>
                        )}
```

- [ ] **Step 8: Fix the results heading**

Replace the heading that reads `{viewMode === "approvals" ? "Approval" : "Evaluation"} {statusFilter === "evaluated" ? ...}` (around line 2620) with:

```tsx
                {lifecycleLabel(stageFilter)} ({filteredItems.length})
```

- [ ] **Step 9: Remove dead code**

`getItemStatus` is still used by the detail pane (lines ~2944, ~3044) — keep it. If the build flags any other symbol as unused after this task, delete it.

- [ ] **Step 10: Build and verify**

Run: `npm run build`
Expected: succeeds.

Then in `npm run dev`, open `/admin/submissions` and confirm: five lifecycle tabs with counts, a workflow-type dropdown, items no longer move between tabs as they advance, and a completed evaluation form appears under **Completed**.

- [ ] **Step 11: Commit**

```bash
git add src/components/builder/ApprovalDashboard.tsx
git commit -m "Reorganise /admin/submissions by lifecycle stage

Primary tabs become pending / in review / manual paper / completed /
rejected, and approval-vs-evaluation becomes a secondary dropdown.
Previously the tabs split on current layer type, so a submission moved
between them as it advanced and completed items were filed under
whichever layer type happened to be last."
```

---

### Task 9: Full verification

**Files:** none modified.

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: succeeds with no new TypeScript errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests pass — the ~77 pre-existing `FormBuilderEngine` tests plus the new lifecycle and filter tests.

- [ ] **Step 3: Lint check**

Run: `npm run lint`
Expected: no *new* warnings attributable to these changes. The repo has many pre-existing warnings; compare against `git stash` baseline if unsure.

- [ ] **Step 4: Manual smoke test**

Run `npm run dev` and confirm:

1. `/admin/dashboard` — advanced search shows date from/to, training title, profile, and five lifecycle statuses; each filters the list.
2. `/user/dashboard` — only search, list, status, sort. No admin filters.
3. Header — no notification bell on either dashboard, on desktop or mobile width.
4. Export — reports the same count as the filtered list; "All submissions" reports the full count.
5. `/admin/submissions` — five lifecycle tabs with counts, workflow-type dropdown, existing training/submitter/date/profile filters and pagination all still work.
6. Open one submission from `/admin/submissions` and confirm the detail pane, approve/reject controls and PDF actions are unchanged.

- [ ] **Step 5: Confirm nothing out of scope changed**

```bash
git diff main --stat
```

Expected: changes confined to `src/App.tsx`, `src/types/index.ts`, `src/contexts/DashboardContext.tsx`, `src/pages/AdminHomePage.tsx`, `src/components/dashboard/{Header,Toolbar}.tsx`, `src/components/builder/ApprovalDashboard.tsx`, the two new `src/utils` modules and their tests, plus the deleted `NotificationCenter.tsx` and the docs. **No changes under `api/`.**

---

## Notes for the implementer

- **If a step's code does not match what you find in the file**, stop and re-read the surrounding code rather than forcing the edit. These files have been edited frequently and line numbers drift.
- **`npm run build` is the only reliable check** — `npm run dev` will happily run with type errors.
- **Do not touch anything under `api/`.** This work is presentation-layer only. Nothing here may alter how a submission is routed, approved, evaluated, or emailed.
- **The `top: 100` per-form ceiling on `/admin/submissions` is deliberately out of scope.** Filtering over capped data is still capped; server-side pagination is separate work.

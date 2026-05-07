# Enhanced Approval & Evaluation Layer System

## Overview

Replace the current hardcoded approval layer system (L1-L3, flat columns, approve/reject only) with a unified, configurable layer sequence where each layer is either **approval** (approve/reject) or **evaluation** (fill custom fields, then confirm). Layers support signature or checkbox confirmation, 365 sign-in or public-link access, and incremental visibility.

---

## Architecture Decisions (Locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Layer config storage | JSON blob in Master Form Note column (`LayerConfig`) | Atomic load, follows existing patterns, replaces `NumberOfApprovalLayer` + `ApprovalRules` |
| Evaluation data storage | JSON blob in `EvaluationData` Note column on response list | Simpler than separate list, everything in one place, follows same pattern as `RawJSON` |
| Submission pipeline | Extend existing `onComplete` handler | Avoids duplication; add pipeline abstraction layer |
| Public access | UUID tokens stored in Master Form, validated in `api/evaluate.ts` | Revokable, simple, follows existing serverless pattern |
| Layer state machine | Hybrid: stored `currentLayer` + `layerStatuses`, computed accessibility | Queryable + auditable |
| Status values | `FORM_STATUS` + `SP_LAYER_STATUS` const objects with migration helpers | Unified, clear, replace scattered strings |
| Visibility | Backend query filtering combined with DetailModal-level UI filtering | Pragmatic for SP's limited query capabilities |

---

## Implementation Phases

### Phase 0: Foundation — Types & Constants

**Effort**: Small (~1 day)
**Depends on**: Nothing
**Changes everything else uses these types**

#### Files to create/modify:

**`src/types/index.ts`** — Add new types:

```typescript
// ── Layer Configuration (stored in Master Form LayerConfig column) ──

export type LayerType = "approval" | "evaluation";
export type AuthMode = "365" | "public";
export type ConfirmationType = "signature" | "checkbox";

export interface BaseLayer {
  layerNumber: number;
  type: LayerType;
  authMode: AuthMode;
  assignee: LayerAssignee;
  title?: string;               // Display name for the layer
  description?: string;         // Instructions for the approver/evaluator
  publicToken?: string;         // UUID, generated on publish for public layers
  tokenExpiresAt?: string;      // ISO date, null = never expires
  notifyOnComplete?: boolean;   // Send notification when this layer is done
}

export interface LayerAssignee {
  type: "user" | "field-reference";
  value: string;                // email for "user", "${fieldName}" for "field-reference"
}

export interface ApprovalLayer extends BaseLayer {
  type: "approval";
  confirmationType: ConfirmationType;   // signature | checkbox
  allowRejectionReason: boolean;        // Show rejection reason text field
}

export interface EvaluationLayer extends BaseLayer {
  type: "evaluation";
  surveyElements: SurveyElement[];      // Subset of SurveyJS elements (reused from form builder types)
  confirmationLabel?: string;           // Button text, default "I confirm this evaluation"
}

export type Layer = ApprovalLayer | EvaluationLayer;

export interface LayerConfig {
  version: "1.0";
  layers: Layer[];
  routing?: ConditionalRouting[];       // Future: conditional skip based on form data
}

export interface ConditionalRouting {
  conditionField: string;
  rules: {
    when: string;
    skipLayers?: number[];              // Layer numbers to skip when condition matches
  }[];
}
```

**Layer-level statuses** (stored per-layer on response item):
```typescript
export type LayerStatus =
  | "pending"          // Waiting for action
  | "in_progress"      // Evaluator viewing/filling (evaluation only)
  | "confirmed"        // Evaluation layer: evaluator confirmed
  | "approved"         // Approval layer: approved
  | "rejected"         // Approval layer: rejected
  | "skipped"          // Skipped via conditional routing
  | "cancelled";       // Admin cancelled outstanding layer
```

**Form-level statuses** (derived from layer statuses):
```typescript
export type FormStatus =
  | "draft"
  | "submitted"
  | "in_review"        // At least one layer active
  | "completed"        // All layers done (confirmed/approved/skipped)
  | "rejected"         // Any layer rejected
  | "cancelled";
```

**Stored evaluation data per response item:**
```typescript
export interface EvaluationDataEntry {
  status: LayerStatus;
  confirmerEmail: string;
  confirmerName: string | null;
  confirmedAt: string | null;    // ISO date
  fields: Record<string, unknown>;  // { fieldName: value }
  notes?: string;
  signatureUrl?: string | null;
}

// Stored in EvaluationData Note column as JSON
// Keyed by layerNumber: Record<number, EvaluationDataEntry>
```

**Updated `Submission` type:**
```typescript
export interface Submission {
  id: string;
  submissionId: string;
  listTitle: string;
  formId: string;
  formVersion: string;
  title: string;
  submittedByEmail: string;
  submittedAt: string | null;
  formStatus: FormStatus;
  currentLayer: number;                    // Active layer number (0 = none/submitted)
  layers: (ApprovalLayerResult | EvaluationLayerResult | null)[];  // All layers
  meta: ListMetaEntry;
  submissionData: Record<string, unknown>;  // Form field values
}

export interface ApprovalLayerResult {
  layerNumber: number;
  type: "approval";
  status: LayerStatus;
  outcome: "approved" | "rejected" | undefined;
  email: string | null;
  signedAt: string | null;
  rejectionReason: string | null;
  signature: string | null;
  confirmedVia: ConfirmationType;
}

export interface EvaluationLayerResult {
  layerNumber: number;
  type: "evaluation";
  status: LayerStatus;
  email: string | null;
  confirmedAt: string | null;
  fields: Record<string, unknown>;
  notes?: string;
}
```

**`src/utils/statusConstants.ts`** — New file:
```typescript
export const SP_LAYER_STATUS = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  CONFIRMED: "Confirmed",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SKIPPED: "Skipped",
  CANCELLED: "Cancelled",
} as const;

export const SP_FORM_STATUS = {
  SUBMITTED: "Submitted",
  IN_REVIEW: "In Review",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
} as const;

export const SP_LAYER_COLUMNS = {
  STATUS: "Status",
  EMAIL: "Email",
  SIGNED_AT: "SignedAt",
  REJECTION: "Rejection",
  SIGNATURE: "Signature",
} as const;

// Mapping helper for backward compatibility
export const LEGACY_STATUS_MAP: Record<string, string> = {
  "Pending": SP_LAYER_STATUS.PENDING,
  "Waiting": SP_LAYER_STATUS.PENDING,
  "Pending Approval": SP_LAYER_STATUS.PENDING,
  "approved": SP_LAYER_STATUS.APPROVED,
  "rejected": SP_LAYER_STATUS.REJECTED,
  "Approved Layer 1": SP_LAYER_STATUS.APPROVED,
  "Approved Layer 2": SP_LAYER_STATUS.APPROVED,
  "Approved Layer 3": SP_LAYER_STATUS.APPROVED,
  "Fully Approved": SP_FORM_STATUS.COMPLETED,
};

export function normalizeLayerStatus(raw: string): LayerStatus {
  return (LEGACY_STATUS_MAP[raw] as LayerStatus) || SP_LAYER_STATUS.PENDING as LayerStatus;
}
```

#### Verification:
- `lsp_diagnostics` clean on changed files
- `npm run build` passes

---

### Phase 1: Layer Config in Builder UI

**Effort**: Medium (~2-3 days)
**Depends on**: Phase 0

#### Files to modify:

**`src/pages/AdminFormBuilder.tsx`**:
1. Replace the "Approval" sidebar tab with a unified **"Layers"** tab
2. Add layer sequence UI:
   - Number of layers selector (0-10, or "Add Layer" button)
   - Each layer card shows: layer number, type badge (approval/evaluation), auth mode icon
   - Drag-to-reorder layers
3. Per-layer configuration panel:
   - Layer type toggle: Approval / Evaluation
   - Auth mode toggle: 365 sign-in / Public link
   - Assignee: static email input OR field reference picker (dropdown of form fields)
   - Confirmation type (if approval): Signature / Checkbox
   - Show rejection reason toggle
   - Layer title and description inputs
4. For evaluation layers:
   - "Configure Evaluation Form" button → opens element picker
   - Reuse `FormLibrary.tsx` element selection or a simplified version
   - Shows list of selected evaluation fields with remove/reorder
5. Conditional routing section (optional):
   - Enable toggle
   - Condition field selector (dropdown of form hidden fields)
   - Rules table: when value → skip layers
6. Replace `handlePublish` to:
   - Serialize `LayerConfig` to JSON
   - Store in `LayerConfig` Note column of Master Form
   - Keep backward compat: also write `NumberOfApprovalLayer` for existing readers
   - Generate UUID tokens for public layers → store in LayerConfig
7. Add "Copy Link" button for public layers → shows URL with token

**`src/components/builder/ApproverRow.tsx`**:
- Extend to support field-reference assignee type
- Add auth mode selector
- Add confirmation type selector

**`src/components/builder/`** — New files:
- `LayerConfigPanel.tsx` — Full layer sequence editor
- `LayerCard.tsx` — Single layer card (drag-reorderable)
- `EvalElementPicker.tsx` — Simplified element selector for evaluation layers
- `PublicLinkDisplay.tsx` — Copyable link display for public layers

#### Verification:
- Builder loads, layers tab renders
- Can add/reorder/remove layers
- Can configure evaluation elements
- Public token displays copyable link
- Publishing writes LayerConfig to Master Form

---

### Phase 2: Storage & Provisioning

**Effort**: Medium (~2 days)
**Depends on**: Phase 0

#### Files to modify:

**`src/utils/formBuilderSP.ts`**:
1. Extend `upsertFormConfig()` / `saveFormConfig()` to write `LayerConfig` JSON
2. Extend `getFormConfig()` to parse `LayerConfig` column (with fallback to old `NumberOfApprovalLayer` + `ApprovalRules`)
3. Extend `provisionResponseList()`:
   - Add `EvaluationData` Note column (for all evaluation layers JSON)
   - Add `CurrentLayer` Number column (tracks active layer)
   - Add `FormStatus` Text column
   - Keep existing `L{n}_*` columns but make them dynamic (don't hardcode L1-L3)
4. New function: `generatePublicToken()` — UUID generation + expiry
5. New function: `getPublicTokenStatus()` — check if token is valid, not expired, not revoked
6. Extend `logEvent()` to record layer config changes in audit log

**`src/utils/spConfig.ts`**:
1. Extend `loadConfig()` to read `LayerConfig` column and parse it
2. Add helper: `getLayerConfig(formConfig): LayerConfig | null`
3. Add migration helper: `legacyToLayerConfig(formConfig)` — converts old `NumberOfApprovalLayer` + `ApprovalRules` to new `LayerConfig` format for backward compat

#### Verification:
- New forms published with layers create correct columns
- Old forms still load correctly (backward compat)
- `EvaluationData` column exists on response lists
- Public tokens generated and stored

---

### Phase 3: Submission Pipeline

**Effort**: Large (~3-4 days)
**Depends on**: Phase 2

#### Files to modify:

**`src/pages/DynamicFormPage.tsx`**:
1. Extend `onComplete` handler with pipeline abstraction:
   ```typescript
   // Submission pipeline steps:
   // 1. Upload signatures (existing)
   // 2. Resolve layer config (new: use LayerConfig instead of old logic)
   // 3. Determine first active layer (new: skip skipped layers)
   // 4. Build submission body (existing, extended)
   // 5. Write to SP (existing, extended for evaluation data)
   // 6. Trigger notifications (extended)
   ```
2. For evaluation-type first layers:
   - Write main form data + `FormStatus: "Submitted"`
   - Set `CurrentLayer: 1`
   - Set `Layer1_Status: "Pending"` (same column pattern)
   - Do NOT write `EvaluationData` yet (evaluator fills later)
3. For approval-type first layers:
   - Same as current flow but use new status constants
   - Write `L{n}_Status`, `L{n}_Email` using `SP_LAYER_STATUS` constants
4. Trigger notification:
   - For approval: email approver with link to approval dashboard
   - For evaluation (365): email evaluator with link to evaluation page
   - For evaluation (public): no email; URL is shared out-of-band

**`src/App.tsx`**:
1. Rewrite `mapSubmission()` to dynamically read layers:
   ```typescript
   // Read LayerConfig for this form (from loaded configs)
   // For each layer in config:
   //   - Read L{n}_Status, L{n}_Email, L{n}_SignedAt, etc.
   //   - If evaluation type: also read EvaluationData[n] from JSON
   // Build layers array dynamically (no L1-L3 hardcode)
   ```
2. Extend `fetchData()` to load `LayerConfig` for each form
3. Update `normalizeStatus()` to handle new status values

**`src/utils/formBuilderSP.ts`**:
1. New function: `submitEvaluationData()` — appends evaluation results to `EvaluationData` JSON column
2. Extend `triggerApprovalNotification()` for evaluation layers:
   - Create `triggerLayerNotification()` unified handler
   - Handle evaluation notification templates
   - Include evaluation URL in notification

#### Verification:
- Submit form with approval L1 → creates item with correct statuses
- Submit form with evaluation L1 → creates item without evaluation data
- Submit form with mixed layers → correct statuses per type
- Notifications triggered correctly per layer type

---

### Phase 4: Evaluator/Approver Interface

**Effort**: Large (~3-4 days)
**Depends on**: Phase 3

#### New page:

**`src/pages/EvaluationPage.tsx`**:
- Route: `/eval/:token` (public) or `/eval/:formSlug/:responseId/:layerNumber` (365)
- Authentication:
  - 365 mode: validates MSAL user email matches layer assignee
  - Public mode: validates token from URL, no user auth
- Renders:
  - Submission data preview (read-only) for context
  - Previous layer results (read-only) — approval statuses, evaluation summaries
  - Current layer:
    - **Evaluation**: SurveyJS form with evaluation elements from `LayerConfig`
    - **Approval**: Summary + signature pad OR checkbox + optional rejection reason
  - Action buttons:
    - Evaluation: "Confirm Evaluation" (records fields + timestamp)
    - Approval (signature): signature pad → "Approve with Signature" / "Reject"
    - Approval (checkbox): checkbox + "I approve" button / "Reject" button
- On submit:
  - For 365: direct SP REST call to update response item
  - For public: POST to `/api/evaluate` with token
- Post-submit: redirect to success/thank-you page

**`api/evaluate.ts`** — New serverless function:
```typescript
// POST /api/evaluate
// Body: { token, layerNumber, data }
// Flow:
// 1. Look up token in Master Form (fetch LayerConfig, find matching token)
// 2. Validate: not expired, not revoked, not used, correct layer
// 3. Fetch response item from appropriate list
// 4. Validate: response item is at correct currentLayer
// 5. If approval: update L{n}_Status, L{n}_SignedAt, etc.
// 6. If evaluation: merge data into EvaluationData JSON column
// 7. Update CurrentLayer (or set FormStatus = Completed if last layer)
// 8. Trigger notification for next layer if applicable
// 9. Mark token as used
```

**`src/utils/formBuilderSP.ts`**:
- Extend `submitFormResponse()` to handle `EvaluationData` column updates
- New function: `getLayerResponseData()` — fetches response item + parses layer data for a specific layer

**`src/components/builder/EvaluationSummary.tsx`** — New component:
- Renders evaluation results in read-only mode
- Shows evaluator name, date, field values

#### Verification:
- 365 evaluator can view evaluation page after auth
- Public token URL loads evaluation page without auth
- Evaluation form renders with configured fields
- Approval checkbox records email + datetime
- Signature approval uploads signature
- Submit writes data to SP / API correctly

---

### Phase 5: Dashboard & Display

**Effort**: Medium (~2-3 days)
**Depends on**: Phase 3

#### Files to modify:

**`src/components/dashboard/DetailModal.tsx`**:
1. Extend to render evaluation layer results:
   - New `EvaluationLayerCard` component showing evaluation data
   - Show evaluator name, date, field values using `formatFieldValue()`
2. Update `ApprovalCard` for new status values and checkbox confirmation
3. Add layer progression UI:
   - Timeline/stepper showing all layers with status badges
   - Clickable layers showing detail
   - Current active layer highlighted
4. Update SKIP filter to include `CurrentLayer`, `FormStatus`, `EvaluationData`
5. Handle new `Layer` result types in the display

**`src/components/dashboard/StatusBadge.tsx`**:
1. Update `normalizeStatus()` for new `FormStatus` values
2. Add evaluation-specific status display
3. Fix the "Approved Layer N → pending" bug (treat as "in_review")

**`src/components/dashboard/SubmissionRow.tsx`**:
1. Show layer progression indicator (e.g., "Layer 2/4")
2. Show layer type icons (approval vs evaluation)

**`src/components/builder/ApprovalDashboard.tsx`**:
1. Extend to show evaluation items alongside approval items
2. Add evaluation status filter
3. Show layer type in item cards
4. Add admin override actions for evaluation layers (cancel, reassign)

**`src/components/builder/ResponseViewer.tsx`**:
1. Show `FormStatus` and `CurrentLayer` columns
2. Show layer progression per submission

#### Verification:
- DetailModal shows evaluation layer data correctly
- Status badges show correct colors for all new states
- Layer progression visible in lists and detail
- ApprovalDashboard shows both approval and evaluation items
- Admin can view/override evaluation layers

---

### Phase 6: Visibility Enforcement

**Effort**: Medium (~2 days)
**Depends on**: Phase 5

#### Files to modify:

**`src/pages/EvaluationPage.tsx`** (from Phase 4):
1. When rendering previous layer results:
   - For approval: show status + outcome only (not full submission data unless authorized)
   - For evaluation: show summary of evaluation fields
2. Restrict field visibility based on `viewRoles` / `isSensitive` properties
   - Previous layers' evaluation data: show only fields marked as visible to next layers

**`src/App.tsx`**:
1. In `fetchData()`, add layer-level filtering:
   ```typescript
   // When fetching response items for a user:
   // 1. Find all layers where user is assignee
   // 2. For each matching layer, include full response data
   // 3. For non-matching layers: include only metadata (status, dates)
   ```
   - Implementation note: SP can't filter JSON. Instead, fetch full item, then filter client-side.
   - For public access: token identifies which layer, serverless function returns filtered data.

**`src/components/dashboard/DetailModal.tsx`**:
1. Accept optional `viewerContext` prop: `{ layerNumber, authMode, layerType }`
2. Filter displayed evaluation data based on viewer's layer:
   - Viewer in layer N: see all data from layers 1 to N-1 (read-only)
   - Hide data from layers N+1 and beyond
3. Mark sensitive fields: if a field has `isSensitive` in the form config, hide it from evaluation layer viewers

**`api/evaluate.ts`** (from Phase 4):
1. Return filtered response data based on token's layer level
2. Only include submission data + previous layer results (not future layers)

#### Verification:
- Layer 2 evaluator sees submission data + Layer 1 results
- Layer 2 evaluator does NOT see future layer configs or data
- Public token limits access to exactly its layer
- Admin sees everything

---

### Phase 7: Migration & Cleanup

**Effort**: Small (~1 day)
**Depends on**: Phase 3+

#### Files to modify:

**`src/App.tsx`**:
1. One-time migration: update existing SP list items
   - Add `FormStatus` column values based on old `Status` field
   - Add `CurrentLayer` values based on existing layer completion
   - Backfill `EvaluationData` as empty `{}` for existing items
2. Remove dead code:
   - Old `NumberOfApprovalLayer` / `ApprovalRules` reading code paths (after migration window)
   - Hardcoded L1-L3 references
   - Dead `HomePage.tsx` references (as noted in AGENTS.md)

**`src/utils/formBuilderSP.ts`**:
1. Add migration function `migrateExistingForms()`:
   - Read all Master Form items
   - Convert `NumberOfApprovalLayer` + `ApprovalRules` → `LayerConfig`
   - Write back `LayerConfig` column
   - Generate public tokens for existing forms if needed

#### Verification:
- Migration script runs without errors
- Old forms still work after migration
- No hardcoded L1-L3 references remain

---

## Files Summary

### New Files
| File | Phase | Purpose |
|------|-------|---------|
| `src/utils/statusConstants.ts` | 0 | Status enum values, migration helpers |
| `src/components/builder/LayerConfigPanel.tsx` | 1 | Layer sequence editor UI |
| `src/components/builder/LayerCard.tsx` | 1 | Single layer configuration card |
| `src/components/builder/EvalElementPicker.tsx` | 1 | Evaluation element selector |
| `src/components/builder/PublicLinkDisplay.tsx` | 1 | Copyable public link display |
| `src/components/builder/EvaluationSummary.tsx` | 4 | Read-only evaluation results view |
| `src/pages/EvaluationPage.tsx` | 4 | Evaluator/approver interface page |
| `api/evaluate.ts` | 4 | Public evaluation submission endpoint |

### Modified Files
| File | Phase | Changes |
|------|-------|---------|
| `src/types/index.ts` | 0 | Add `LayerConfig`, `Layer`, `EvaluationDataEntry`, updated `Submission` |
| `src/utils/formBuilderSP.ts` | 2,3,4 | Layer config SP ops, evaluation data submit, unified notifications |
| `src/utils/spConfig.ts` | 2 | LayerConfig parsing, backward compat |
| `src/pages/AdminFormBuilder.tsx` | 1 | Replace approval tab with Layers tab, updated publish flow |
| `src/components/builder/ApproverRow.tsx` | 1 | Extended with auth mode, confirmation type, field reference |
| `src/pages/DynamicFormPage.tsx` | 3 | Unified submission pipeline, evaluation layer support |
| `src/App.tsx` | 3,6 | Dynamic `mapSubmission()`, visibility filtering |
| `src/components/dashboard/DetailModal.tsx` | 5,6 | Evaluation data display, layer context filtering |
| `src/components/dashboard/StatusBadge.tsx` | 5 | Updated for new status values |
| `src/components/dashboard/SubmissionRow.tsx` | 5 | Layer progression indicator |
| `src/components/builder/ApprovalDashboard.tsx` | 5 | Evaluation item support |
| `src/components/builder/ResponseViewer.tsx` | 5 | Layer progression columns |

---

## Dependencies & Ordering

```
Phase 0 (Types)
  └── Phase 1 (Builder UI) ───┐
  └── Phase 2 (Storage) ──────┤
                               ├── Phase 3 (Submission Pipeline)
                               │       └── Phase 4 (Evaluator Interface)
                               │       └── Phase 5 (Dashboard)
                               │               └── Phase 6 (Visibility)
                               └── Phase 7 (Migration)
```

Phases 1 and 2 can be done in parallel. Phase 4 and 5 can be done in parallel after Phase 3.

---

## Risk Areas

1. **SharePoint list column limits**: Each form list could get many columns. Evaluation data in a single JSON blob avoids per-field columns. Keep `L{n}_*` columns only for approval layers (max ~10 layers × 5 columns = 50, well within SP's 276 column limit).

2. **Public token security**: Token is the only gate for public access. Token generation must use cryptographic randomness (`crypto.randomUUID()`). Tokens should be revokable. Rate-limit the `/api/evaluate` endpoint.

3. **Backward compatibility**: Old forms with `NumberOfApprovalLayer` but no `LayerConfig` must keep working. The migration helper in Phase 2 handles this.

4. **Status normalization**: Existing items have mixed status casing. The `normalizeLayerStatus()` helper handles reads; new code writes canonical values.

5. **Evaluation data size**: Large evaluation forms could produce big JSON blobs. SP Note columns can hold ~2GB text, but fetching large JSON could be slow. Consider pagination or separate endpoint for evaluation data if needed.

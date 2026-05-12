# AGENTS.md — pmw-hrform

## Structure
- **Single app at root**. All commands run from root.
- Entry: `src/main.tsx` → `msalInstance.initialize()` → `BrowserRouter` → `AuthProvider` → `App.tsx`
- Theme: `src/theme/index.ts` (MUI custom, `#0078D4` primary / `#6264A7` secondary). MUI v9 (`@mui/material` v9) — uses `Grid` (not Grid2), `slotProps` replaces `PaperProps`.
- Assets: `public/` (favicon, icons.svg), `src/assets/` (hero.png)
- **Sub-instructions**: `src/utils/AGENTS.md`, `src/components/builder/AGENTS.md`, `src/components/dashboard/AGENTS.md`, `src/components/auth/AGENTS.md`, `src/pages/AGENTS.md`, `api/AGENTS.md` each have hard-earned module-specific context.

## Commands (run from root)
```bash
npm run dev        # Vite dev server (port 3000) — frontend only; /api/* will 404
npm run dev:api    # vercel dev — runs BOTH Vite frontend + API routes locally
npm run build      # tsc -b && vite build — fails on any new TS error
npm run lint       # ESLint flat config (many pre-existing warnings — use lsp_diagnostics)
npm run preview    # Preview production build
```
- `npm run build` is the **only** reliable check. `lsp_diagnostics` catches TS errors too.
- `build_errors.txt` / `build_status.txt` are stale/unreliable — ignore them. Trust `npm run build` exit code.

## Stack
- React 19 + TypeScript ~6.0.2 (ES2022 target, bundler moduleResolution, `verbatimModuleSyntax`, `erasableSyntaxOnly: true` — no runtime `enum`/`namespace`; use `const` objects or string unions)
- Vite 8 with `@vitejs/plugin-react` (Oxc-based, React Compiler NOT enabled). `define: { global: 'globalThis' }` in vite config.
- `buffer` polyfill: `globalThis.Buffer = Buffer` set in `main.tsx` (required by some SP responses)
- MUI v9 (`@mui/material`, `@mui/icons-material`)
- `@azure/msal-react` + `@azure/msal-browser` — Azure AD authentication
- **react-router-dom v7** — `BrowserRouter` in `main.tsx`, `<Routes>` in `App.tsx`
- **SurveyJS v2.5** (`survey-core`, `survey-react-ui`) — **Custom form builder** (NOT SurveyJS Creator).
  - **Gotcha**: `Model.onValidationChanged` does NOT exist in v2.5. Use `m.onValueChanged.add(fn)` + `setTimeout(fn, 0)` for validation tracking. Do not call `.add()` on `onValidationChanged` — it's `undefined` and will throw `TypeError`.
- **@react-pdf/renderer** — server-side PDF generation. `generateAndStorePdf` returns URL only (no auto-open).
- `react-dnd` v16 — drag-drop canvas in FormBuilder (HTML5 backend)
- ESLint: flat config (`eslint.config.js`), NOT type-checked. Many pre-existing warnings.

## Auth State Machine (in `App.tsx`)
```
checking → (isAuthenticated?) → loading → (tenant check) → ready / wrong_tenant / error
         → (not auth, stored decision?) → guest / choice
         → (not auth, no decision) → choice → MSAL login or guest
```
- Auth decision persisted in `localStorage` (`pmw_hr_auth_decision`)
- Post-login redirect stored in `sessionStorage` (`pmw_post_login_redirect`)
- Admin detection via SharePoint group `_HR_ Forms Owners`
- MSAL: `main.tsx` calls `msalInstance.initialize()` before React render
- MSAL: `handleRedirectPromise()` uses **3s timeout** (`Promise.race`) — fix for hung redirects (private/incognito windows)
- MSAL: Clears `sessionStorage` keys `msal.interaction.status` + `msal.login.error` before `loginRedirect()` — intentional fix for `interaction_in_progress` errors; DO NOT remove

## Routing
| Route | Component | File | Notes |
|-------|-----------|------|-------|
| `/form/:formId` | `DynamicFormPage` | `src/pages/DynamicFormPage.tsx` | Public/private form rendering |
| `/admin/builder[/:formTitle]` | `AdminFormBuilder` | `src/pages/AdminFormBuilder.tsx` | Full builder + sidebar + publish |
| `/admin/approvals` | `ApprovalDashboard` | **`src/components/builder/ApprovalDashboard.tsx`** | NOT in `dashboard/` dir |
| `/admin/responses/:formTitle` | `ResponseViewer` | `src/components/builder/ResponseViewer.tsx` | Submission responses |
| `/adminhomepage` | `AdminHomePage` | `src/pages/AdminHomePage.tsx` | Catch-all dashboard |
| `/eval/:token` | `EvaluationPage` | `src/pages/EvaluationPage.tsx` | Public evaluation via unique link |
| `/eval/:formSlug/:responseId/:layerNumber` | `EvaluationPage` | same file | 365-authenticated evaluation |

- **No code splitting** — all pages eagerly imported
- Header "Form Builder" navigates to `/admin/builder`
- All pages imported statically in `App.tsx` — no `React.lazy()`

## Enhanced Layer System
Forms have a unified **layer sequence** where each layer is `approval` (approve/reject) or `evaluation` (custom SurveyJS fields, confirm action).

### Storage
- **LayerConfig**: JSON Note column on Master Form — also stored **per-version** in Web Form Versions' `SurveyJSON` blob
- **EvaluationData**: JSON Note column on response lists — stores `Record<layerNumber, EvaluationDataEntry>`
- **Status columns**: `L{n}_Status`, `L{n}_Email`, `L{n}_SignedAt`, `L{n}_Rejection`, `L{n}_Signature` per layer
- **System columns**: `CurrentLayer` (Number), `FormStatus` (Text), `CurrentApprovalLayer` (legacy)

### Key types (`src/types/index.ts`)
- `LayerConfig`, `LayerConfigItem` (union `ApprovalLayerConfig` | `EvaluationLayerConfig`)
- `ManualBranch` — named branching with its own layer sequence
- `LayerStatus`, `FormStatus`, `EvaluationDataEntry`, `ApprovalLayerResult`, `EvaluationLayerResult`
- Status constants in `src/utils/statusConstants.ts`

### Version-aware layers
- `saveFormVersion()` stores `layerConfig` inside the version's `SurveyJSON` blob alongside `surveyJson`
- `ApprovalDashboard` loads per-version configs from `Web Form Versions` at startup
- An item's `FormVersion` determines which layer config applies — v1.0 (no layers) vs v1.1 (L1 approval + L2 evaluation)

### Manual branching (form builder)
- `LayerConfig.manualBranches: ManualBranch[]` — each branch has its own layer sequence
- Configured in `LayerConfigPanel` via "Manual Branching" toggle
- In ApprovalDashboard, items pending branch assignment show a "Select Branch" card
- Branch selection persisted to `SelectedBranch` column (auto-created if missing)

## ApprovalDashboard (`/admin/approvals`)
The admin approval view has a two-tier filter system:

**Top filter**: `All | Pending | Approvals | Evaluations`
- "Approvals" = items whose current layer type is approval
- "Evaluations" = items whose current layer type is evaluation
- "Pending" = all pending items regardless of type (universal)

**Bottom sub-filter** (depends on top selection):
- Under All/Approvals: `All | Pending | Approved | Rejected`
- Under Evaluations: `All | Pending | Evaluated`
- Evaluated = evaluation item whose status is no longer pending

**Layer detection**: `itemCurrentTypes` map computed from:
1. Version-specific LayerConfig (from Web Form Versions)
2. Current Master Form LayerConfig as fallback
3. `Math.max(CurrentLayer, CurrentApprovalLayer)` for layer number
4. `L1_Status` inference when both layer fields are unavailable (if L1_Status = "Approved" and form has 2+ layers, current layer = 2)

**Note**: `CurrentLayer` and `CurrentApprovalLayer` columns may not exist on older response lists. Both are queried via separate SP queries to avoid crashing the main tier 1 query.

## API Routes (Vercel serverless)
| Route | File | Purpose |
|-------|------|---------|
| `GET /api/form-config` | `api/form-config.ts` | Public form config fetcher |
| `POST /api/submit-form` | `api/submit-form.ts` | Public form submission (guest) |
| `GET/POST /api/evaluate` | `api/evaluate.ts` | Public layer evaluation |
| `POST /api/send-email` | `api/send-email.ts` | Graph API sendMail |

- All API routes use `api/_utils/graphClient.ts` (client-credentials flow)
- `api/_utils/sharepoint.ts` is **dead code** — not imported by any route. Safe to delete.
- `vercel.json` rewrites SPA routes to `/index.html` except `/api/*`, `/assets/*`, and static files. CORS headers added for `/api/*`.
- Local API testing: `VERCEL_SETUP.md` has full setup guide
- API env vars: Use `process.env.SYSTEM_CLIENT_ID`, `SYSTEM_CLIENT_SECRET` (not `VITE_` prefix)

## SharePoint Integration
- **OData**: `odata=nometadata` — responses use `data.value` not `data.d.results`
- **Dual client pattern**:
  - Dashboard: `App.tsx` → `createSpClient(msalInstance, accounts)` → `sharepointClient.ts`
  - Builder: `AdminFormBuilder.tsx` → raw token → `formBuilderSP.ts` (independent digest cache)
- Digest cached with 30min expiry, `X-HTTP-Method` headers for writes
- Lists discovered via `/_api/web/lists` (system lists filtered by BaseTemplate + properties)
- SP queries use **tier fallback**: `$select` with more columns first, if 400 error, retry with fewer columns

### Tier query pattern (critical)
When querying SharePoint lists, columns that may not exist must NOT be in the main `$select`. Instead:
1. Main query: only guaranteed columns (Id, Title, Status, L1_Status, etc.)
2. Optional columns (CurrentLayer, CurrentApprovalLayer, SelectedBranch, EvaluationData, PdfUrl) fetched in **separate** lightweight queries
3. If a separate query fails (400), it's caught silently — the main data is unaffected

### SP Column Type Mapping
See `src/utils/FormBuilderEngine.ts` `getSpColumnKind()` or `src/utils/formBuilderSP.ts` `addColumn()`:
- 2 = Text, 3 = Note (used for LayerConfig, EvaluationData), 4 = DateTime, 6 = Choice, 8 = Boolean, 9 = Number, 15 = MultiChoice, 11 = Image
- Layout/display types: no SP column (null)
- `dynamicmatrix`/`tableinput` create `_Html` (richText) + `_Json` columns
- `spChoicesSource` fields fetch live choices from SP at publish time and pass them to `addColumn()`

## Form Builder System (admin-only)
- **Entry**: Header → `/admin/builder`
- **Styling**: Inline styles via `C` color object (`src/components/builder/constants.ts`) — NOT MUI components
- **State**: Local `useState` only — no context or external store
- **SP lists**: `Master Form`, `Web Form Versions`, `Form Builder Log`, `Approvers`
- **EvalElementPicker**: MUI icons, expandable property panel (General/Validation/Options tabs), requires at least one required field
- **Publish flow**: Serializes `LayerConfig` JSON + stores it in the version's `SurveyJSON` blob

## Custom SurveyJS Widgets
Two custom widgets registered via the pattern `Serializer.addClass` → `ElementFactory` → `ReactQuestionFactory`:
- **SignaturePad** (`src/utils/SignaturePad.tsx`): Click-to-sign modal with lock/unlock. Image stored as base64, uploaded to `Signature Images` doc library on submit.
- **DynamicMatrix** (`src/utils/DynamicMatrix.tsx`): Per-column cell type editor (text/dropdown/date/number/checkbox/boolean).

See their pattern for any new custom SurveyJS widgets.

## Core Modules
| Module | Path | Lines | Notes |
|--------|------|-------|-------|
| MSAL config | `src/auth/msalConfig.ts` | — | `AllSites.Manage` SP scope |
| Auth provider | `src/auth/AuthProvider.tsx` | — | `MsalProvider` wrapper |
| Shared types | `src/types/index.ts` | ~870 | All interfaces/types |
| SP REST (builder) | `src/utils/formBuilderSP.ts` | ~1641 | Raw `token: string` param, 53+ exports. Independent digest cache. |
| SP REST (dashboard) | `src/utils/sharepointClient.ts` | — | MSAL-aware factory, `createSpClient()` |
| Config loader | `src/utils/spConfig.ts` | ~264 | `loadConfig`, `legacyToLayerConfig()` migration |
| Status constants | `src/utils/statusConstants.ts` | ~146 | `SP_LAYER_STATUS`, `SP_FORM_STATUS`, `normalizeLayerStatus()`, `deriveFormStatus()`, `layerColumn()` |
| Form engine | `src/utils/FormBuilderEngine.ts` | ~810+ | **Warning**: has duplicate function declarations (build errors). Pure logic, no React imports. |
| PDF generation | `src/utils/generateFormPdf.ts` | — | Returns URL only (no `window.open`) |
| Custom widgets | `src/utils/SignaturePad.tsx`, `src/utils/DynamicMatrix.tsx` | — | SurveyJS custom widget pattern |

## Anti-Patterns
- **NO `useMemo`/`useCallback`** — React 19 makes these unnecessary; remove when touching code
- **NO `console.log/warn/error`** in production — replace or remove
- **NO `any`** — many files use it; fix types when touching
- **NO `@ts-ignore` / `@ts-expect-error`** — never suppress type errors
- **NO dead code** — remove `.backup`, `.txt`, dead pages when found
- `FormBuilder.tsx` has `eslint-disable` and `any[]` usage
- `formBuilderSP.ts` has `catch (e: any)` and `data.d.results` fallback (legacy format)
- `ApprovalDashboard.tsx` and `AdminFormBuilder.tsx` have `console.warn`/`console.error`
- `DetailModal.tsx` uses `dangerouslySetInnerHTML` — audit XSS if user input reaches `value`
- **Build**: Run `npm run build` after all changes. Do NOT add new TS errors.
- **MSAL interaction state**: Clearing `sessionStorage` keys before login is intentional — don't remove

## Conventions
- **PowerShell**: use `workdir` parameter with `bash` tool; no `&&` or `;`
- **TypeScript**: `"erasableSyntaxOnly": true` — no runtime `enum`/`namespace`; use `const` objects or string unions
- **Prefer `import type`**: for type-only imports (`verbatimModuleSyntax`)
- **React 19**: no `forwardRef`, no manual memoization
- **No path aliases** — all imports relative (`../../utils/...`)
- **No barrel exports** except `src/components/builder/index.ts`
- **79 unit tests** exist for `FormBuilderEngine.ts` — run via `npx vitest run`
- **CI only builds** — `.github/workflows/ci.yml` runs `npm ci && npm run build`; no test execution in CI
- **No `opencode.json`** config file
- **ErrorBoundary**: `src/components/ErrorBoundary.tsx` wraps each route to prevent white-screen crashes
- **DashboardContext**: `src/contexts/DashboardContext.tsx` provides dashboard state to AdminHomePage (replaces prop-drilling)

## Testing

### Unit Tests (Vitest)
- Config: `vitest.config.ts`
- Location: `src/**/__tests__/*.test.ts`
- Run: `npx vitest run` (79 tests, ~200ms)
- Watch mode: `npx vitest`
- All tests are **pure function tests** — no SharePoint, no network, no browser. They test `FormBuilderEngine.ts` logic only (validation, field tree manipulation, question type helpers, SP column type mapping).
- **Round-trip tests** for `buildSurveyJson`/`buildQuestionTree` catch regressions where form builder field properties get lost during save/load serialization (e.g., `spChoicesSource` being stripped from `INTERNAL_FIELDS`).

### Integration Testing Gap
The app has **no integration tests** against real SharePoint. There are no E2E tests (Playwright, Cypress), no MSW mock handlers, and no test harness for the SharePoint REST layer.

Environment is controlled entirely by env vars:
| Var | Controls |
|-----|----------|
| `VITE_SP_SITE_URL` | SharePoint site all SP calls target |
| `VITE_AZURE_CLIENT_ID` | Azure AD app for MSAL auth |
| `VITE_AZURE_TENANT_ID` | Tenant for auth + API |
| `SYSTEM_CLIENT_ID` / `SYSTEM_CLIENT_SECRET` | API server-side auth (Vercel) |

### How to Test Changes

**Pure-logic changes** (e.g., `FormBuilderEngine.ts`):
1. Add/update a unit test in `src/utils/__tests__/FormBuilderEngine.test.ts`
2. Run `npx vitest run` — passes in under 1s
3. Run `npm run build` to confirm no TS errors

**Changes touching SharePoint integration** (save/load/publish flows):
1. Create a test SharePoint site collection on the same tenant
2. Copy `.env.example` → `.env.test.local`, override `VITE_SP_SITE_URL` to the test site
3. Create a test Azure AD app registration with `Sites.Manage` permission for the test site
4. Run `npm run dev` pointing at the test env — full builder + dashboard + API against test data
5. Best-effort manual smoke test: create form → add field with SP choices source → save draft → reload → verify setting persists → publish → submit → verify choice column data

**API changes** (`api/` routes):
1. Set up Vercel dev: `npm run dev:api` (requires `SYSTEM_CLIENT_ID`/`SYSTEM_CLIENT_SECRET` in `.env.local`)
2. Or deploy to a Vercel preview branch with test env vars

### Why No Test Environment Exists Today
The frontend talks directly to SharePoint via MSAL-delegated auth (user's browser token). There's no backend proxy that could be swapped. A test environment requires:
- A separate SharePoint site collection
- A separate Azure AD app registration (or grant the existing one access to the test site)
- Manual env var switching

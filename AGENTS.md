# AGENTS.md — pmw-hrform

## Structure
- **Single app at root** (NOT `pmw-hrform-app/`). All commands run from root.
- Entry: `src/main.tsx` → `BrowserRouter` → `AuthProvider` → `App.tsx`
- Theme: `src/theme/index.ts` (MUI custom, #0078D4 primary / #6264A7 secondary)
- Assets: `public/` (favicon, icons.svg), `src/assets/` (hero.png)
- **Sub-instructions**: `src/utils/AGENTS.md`, `src/components/builder/AGENTS.md`, `src/components/dashboard/AGENTS.md`, `src/pages/AGENTS.md`, `api/AGENTS.md` have additional hard-earned context.

## Commands (run from root)
```bash
npm run dev        # Vite dev server (port 3000)
npm run dev:api    # Vercel dev server (runs api/ routes locally)
npm run build      # tsc -b && vite build
npm run lint       # ESLint flat config (many pre-existing errors — check changed files with lsp_diagnostics instead)
npm run preview    # Preview production build
```

## Stack
- React 19 + TypeScript ~6.0.2 (ES2022 target, bundler moduleResolution, `verbatimModuleSyntax`)
- Vite 8 with `@vitejs/plugin-react` (Oxc-based, React Compiler NOT enabled)
- MUI v9 (`@mui/material`, `@mui/icons-material`) — `Grid` (not Grid2)
- `@azure/msal-react` + `@azure/msal-browser` — Azure AD authentication
- **react-router-dom v7** — `BrowserRouter` in `main.tsx`, `<Routes>` in `App.tsx`
- **SurveyJS v2.5** — `survey-core`, `survey-react-ui`; **Custom form builder** (NOT SurveyJS Creator)
- ESLint: flat config with `tseslint.configs.recommended` (not type-checked), `react-hooks`, `react-refresh`
- `react-dnd` v16 — drag-drop canvas in FormBuilder (HTML5 backend)

## Auth State Machine (in `App.tsx`)
```
checking → (isAuthenticated?) → loading → (tenant check) → ready / wrong_tenant / error
         → (not auth, stored decision?) → guest / choice
         → (not auth, no decision) → choice → MSAL login or guest
```
States: `checking` | `choice` | `guest` | `loading` | `ready` | `wrong_tenant` | `error`
- Auth decision persisted in `localStorage` (`pmw_hr_auth_decision`)
- Post-login redirect stored in `sessionStorage` (`pmw_post_login_redirect`), read after MSAL callback
- Admin detection via SharePoint group `_HR_ Forms Owners`
- Tenant validation via `VITE_AZURE_TENANT_ID` env var
- Auth screens (`ChoiceScreen`, `GuestLanding`, etc.) render directly in `App.tsx` before `<Routes>`

## Routing (react-router-dom v7)
| Route | Component | Notes |
|-------|-----------|-------|
| `/form/:formId` | `DynamicFormPage` | Public/private form rendering |
| `/admin/builder` | `AdminFormBuilder` | Full builder with sidebar, library, publish |
| `/admin/builder/:formTitle` | `AdminFormBuilder` | Loads specific form for editing |
| `/admin/approvals` | `ApprovalDashboard` | Approval workflow |
| `/admin/responses/:formTitle` | `ResponseViewer` | Submission responses |
| `/adminhomepage` | `AdminHomePage` | Explicit dashboard route |
| `/eval/:token` | `EvaluationPage` | Public evaluation/approval via unique link |
| `/eval/:formSlug/:responseId/:layerNumber` | `EvaluationPage` | 365-authenticated evaluation |
| `*` | `AdminHomePage` | Catch-all dashboard |

- Header "Form Builder" button navigates to `/admin/builder` (not a modal)

## API Routes (Vercel serverless)
| Route | File | Method | Purpose |
|-------|------|--------|---------|
| `/api/form-config` | `api/form-config.ts` | GET | Public form config fetcher |
| `/api/submit-form` | `api/submit-form.ts` | POST | Public form submission (guest) |
| `/api/evaluate` | `api/evaluate.ts` | GET/POST | Public layer evaluation: GET = read filtered data, POST = submit approve/reject/confirm |

- All API routes use `api/_utils/graphClient.ts` for Microsoft Graph API (client-credentials flow)
- `api/_utils/sharepoint.ts` is **dead code** — not imported by any route
- `vercel.json` configures SPA rewrite rules and CORS headers

## Enhanced Layer System (built in Phases 0-7)
Forms now support a unified **layer sequence** where each layer is either `approval` (approve/reject with signature or checkbox) or `evaluation` (fill custom fields, then confirm).

### Layer types
| Property | Approval Layer | Evaluation Layer |
|----------|----------------|------------------|
| Action | Approve / Reject | Confirm evaluation |
| Confirmation | Signature pad OR checkbox | Button click |
| Fields | Status columns only | Custom SurveyJS elements |
| Auth modes | 365 sign-in OR public link | Same |

### Storage
- **LayerConfig**: JSON Note column on Master Form — replaces `NumberOfApprovalLayer` + `ApprovalRules` (backward compat preserved)
- **EvaluationData**: JSON Note column on response lists — stores `Record<layerNumber, EvaluationDataEntry>`
- **Status columns**: `L{n}_Status`, `L{n}_Email`, `L{n}_SignedAt`, `L{n}_Rejection`, `L{n}_Signature` per layer (dynamic, no L1-L3 hardcode)
- **System columns**: `CurrentLayer` (Number), `FormStatus` (Text) on response lists

### Key types (src/types/index.ts)
- `LayerConfig`, `LayerConfigItem` (union of `ApprovalLayerConfig` | `EvaluationLayerConfig`)
- `LayerStatus` — `pending | in_progress | confirmed | approved | rejected | skipped | cancelled`
- `FormStatus` — `draft | submitted | in_review | completed | rejected | cancelled`
- `EvaluationDataEntry` — stores per-layer evaluation result
- `ApprovalLayerResult`, `EvaluationLayerResult` — typed runtime results
- Status constants in `src/utils/statusConstants.ts`: `SP_LAYER_STATUS`, `SP_FORM_STATUS`, `normalizeLayerStatus()`, `deriveFormStatus()`

### Builder UI (admin)
- **"Layers" tab** in AdminFormBuilder sidebar replaces old "Approval" + "Conditional" tabs
- Components: `LayerConfigPanel`, `LayerCard`, `EvalElementPicker`, `PublicLinkDisplay`, `EvaluationSummary`
- Publish flow serializes `LayerConfig` JSON + generates UUID tokens for public layers
- Old `ApproverRow` still exists (used within LayerConfigPanel for static assignee input)

## SharePoint Integration
- **OData**: `odata=nometadata` — responses use `data.value` not `data.d.results`
- **User resolution**: `resolveUserEmails()` in `sharepointClient.ts` maps `AuthorId` → email
- **`sharepointClient.ts`** — MSAL-aware factory (`createSpClient(instance, accounts)`) for dashboard
- **`formBuilderSP.ts`** — Standalone file (~1470 lines); uses raw `token: string` param, NOT `createSpClient`
- Digest cached with 30min expiry, `X-HTTP-Method` headers for writes
- Config loaded from `Master Form` list
- Lists discovered via `/_api/web/lists` (system lists filtered by BaseTemplate + properties)

### Dual SP Client Pattern
```
Dashboard: App.tsx → createSpClient(msalInstance, accounts) → sharepointClient.ts
Builder:    AdminFormBuilder.tsx → raw token → formBuilderSP.ts (independent digest cache)
```
Risk: two digest caches, two `SP_SITE_URL` reads, inconsistent error handling.

## SP Column Type Mapping
| SurveyJS Type | SP FieldTypeKind | SharePoint Type |
|---|---|---|
| `text`, `email`, `url`, `tel`, `password`, masked, autocomplete, taginput, time, colorpicker, nric, otp, hierarchy | 2 | Text |
| `comment`, `richtext`, `addressblock`, `jsoneditor`, `locationpicker` | 3 | Note |
| `date`, `datetime` | 4 | DateTime |
| `dropdown`, `radiogroup`, `buttongroup` (single) | 6 | Choice |
| `checkbox`, `buttongroup` (multi) | 15 | MultiChoice |
| `boolean`, `toggleswitch`, `consent` | 8 | Boolean |
| `number`, `currency`, `slider`, `starrating`, `nps`, `duration`, `formula`, unitconverter, counter, scorecard, rating | 9 | Number |
| `dynamicmatrix`, `tableinput` | — | `_Html` + `_Json` columns |
| `ranking`, `budgetallocator`, `rangeslider`, `daterange` | 3 | Note (JSON) |
| `signaturepad` | 11 | Image (DisplayFormat:2) |
| Layout/display, `file`, `imageupload`, `audiorecorder` | null | No column |

### spChoicesSource
- Choice fields can pull from existing SP list columns
- Fetched live at runtime (`DynamicFormPage.tsx`) and at publish time (`provisionResponseList()`)

## System Lists Filtering
- `filterVisibleLists()` in `spConfig.ts`
- BaseTemplate exclusions: 109, 111, 112, 113, 114, 116, 119, 130, 140, 212, 300, 850
- Property exclusions: `isCatalog`, `isSiteAssetsLibrary`, `isApplicationList`, `isSystemList`, `noCrawl`
- Named exclusions: "Style Library", "Site Assets", "Approvers", "Master Form", etc.

## Form Builder System (admin-only)
- **Entry**: Header "Form Builder" button (admin only) → `/admin/builder`
- **Components**: `FormBuilder.tsx` (react-dnd canvas), `FormLibrary.tsx` (sidebar), `VersionHistory.tsx`, `AuditLog.tsx`, `ProvisionOverlay.tsx`
- **Layer components**: `LayerConfigPanel.tsx`, `LayerCard.tsx`, `EvalElementPicker.tsx`, `PublicLinkDisplay.tsx`, `EvaluationSummary.tsx`
- **Styling**: Inline styles via `C` color object (`constants.ts`) — NOT MUI
- **SP lists**: `Master Form`, `Web Form Versions`, `Form Builder Log`, `Approvers`
- **Versioning**: `Web Form Versions` list, auto-incrementing

## Dashboard
- `Header.tsx` — Sticky top bar with user menu, role badge, Form Builder button
- `ListSummaryCards.tsx` — Grid of form list cards; navigates to `/admin/builder/:listTitle`
- `Toolbar.tsx` — Search + filter dropdowns
- `DetailModal.tsx` — Full dialog with fields, signatures, **Layer Progression** stepper, **EvaluationSummary** for eval layers, legacy ApprovalCard for approval layers
- `StatusBadge.tsx` — Handles: `fullyapproved`, `approved`, `confirmed`, `rejected`, `inprogress`, `pending`, `cancelled`
- `mapSubmission()` in `App.tsx` filters internal fields using `/^L[1-9]_/` regex (not L[1-3] — extended for dynamic layers)

### Visibility
- Non-admin users see: own submissions + submissions where they're a layer assignee
- Public access: token-scoped filtered data from `GET /api/evaluate`
- DetailModal shows all layers read-only; future layer data hidden for evaluator view

## Core Modules
- `src/auth/AuthProvider.tsx` — `MsalProvider` wrapper
- `src/auth/msalConfig.ts` — MSAL config with `AllSites.Manage` SP scope
- `src/types/index.ts` — All shared types
- `src/utils/sharepointClient.ts` — Dashboard SP REST client
- `src/utils/formBuilderSP.ts` — Builder SP REST (standalone, 43 exported functions, ~1470 lines). Key exports: `getFormConfig`, `saveFormConfig`, `upsertFormConfig`, `getAllFormConfigs`, `provisionResponseList`, `bootstrapSystemLists`, `triggerApprovalNotification`, `uploadSignatureImage`, `submitEvaluationData`, `updateLayerStatus`, `getLayerResponseData`, `migrateExistingForms`
- `src/utils/spConfig.ts` — Config loader, `legacyToLayerConfig()` migration helper
- `src/utils/statusConstants.ts` — `SP_LAYER_STATUS`, `SP_FORM_STATUS`, `normalizeLayerStatus()`, `deriveFormStatus()`
- `src/utils/FormBuilderEngine.ts` — Pure logic: question types (57), validation, survey JSON builder
- `api/_utils/graphClient.ts` — Graph API client. Exports: `getGraphToken`, `graphGet`, `graphPost`, `queryListItems`, `createListItem`, `updateListItemFields`

## Signature Upload Flow
1. User signs in custom `SignaturePad.tsx` widget → base64 data URI
2. On submit (`DynamicFormPage.tsx` `onComplete`), `data:image/` values detected
3. `uploadSignatureImage()` converts base64 → binary, determines daily counter, uploads to "Signature Images" doc library
4. File naming: `{action}-{formId}-{yymmdd}{xxx}.png`
5. `ServerRelativeUrl` replaces base64 in submission body
6. SP image column (kind 11, DisplayFormat:2) renders the URL

## Migration
- `migrateExistingForms(token)` in `formBuilderSP.ts` converts legacy forms:
  - Reads Master Form items without `LayerConfig`
  - Converts `NumberOfApprovalLayer` + `ApprovalRules` → `LayerConfig` JSON
  - Backfills `FormStatus` and `CurrentLayer` on response lists from old `Status`/`CurrentApprovalLayer`

## Anti-Patterns (This Project)
- **NO `useMemo`/`useCallback`** — React 19 makes these unnecessary; remove when touching code
- **NO `console.log/warn/error`** in production — replace with proper logging or remove
- **NO `dangerouslySetInnerHTML` without audit** — `DetailModal.tsx` uses it
- **NO `@ts-ignore` / `@ts-expect-error`** — never suppress type errors
- **NO `any`** — many files use it; fix types when touching
- **NO dead code** — remove `.backup`, `.txt`, dead pages when found
- `FormBuilder.tsx` has `eslint-disable` and `any[]` usage
- `AdminFormBuilder.tsx` and `DynamicFormPage.tsx` have `console.error`/`console.warn` calls

## Conventions
- **PowerShell**: use `workdir` parameter with `bash` tool; no `&&` or native `grep`/`ls`
- **File paths**: full Windows paths or forward slashes
- **TypeScript**: project references (`tsconfig.json` → `tsconfig.app.json` + `tsconfig.node.json`). `"erasableSyntaxOnly": true` — no runtime `enum`/`namespace`; use `const` objects or string unions.
- **ESLint**: NOT type-checked. Many pre-existing errors. Check changed files with `lsp_diagnostics`.
- **React 19**: no `forwardRef`, no manual memoization
- **MUI v9**: uses `Grid` (not `Grid2`); `slotProps` replaces `PaperProps` on Dialog
- **Prefer `import type`**: for type-only imports (`verbatimModuleSyntax`)
- **`.env.local`** at root: `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID`, `VITE_AZURE_AUTHORITY`, `VITE_SP_SITE_URL`. **Never commit.**
- **Verifying changes**: Run `npm run build` (`tsc -b && vite build`). `npm run lint` has many pre-existing warnings.
- **No path aliases** — all imports relative (`../../utils/...`)
- **No barrel exports** except `src/components/builder/index.ts`
- **No tests** — zero unit/E2E tests; no vitest/jest/playwright

## Notes
- **No CI/CD** — zero GitHub Actions, Docker, deployment configs
- **Env vars**: API routes use `process.env.SYSTEM_CLIENT_*` (not `VITE_`); frontend uses `import.meta.env.VITE_*`
- **`HomePage.tsx`** — deleted (was dead code, not imported)
- **`references/`** — deleted (was stale JS copies)
- **`AdminHomePage.tsx` dead Dialog** — removed (builderOpen never set to true)

# AGENTS.md — pmw-hrform

## Structure
- **Single app at root**. All commands run from root.
- Entry: `src/main.tsx` → `msalInstance.initialize()` → `BrowserRouter` → `AuthProvider` → `App.tsx`
- Theme: `src/theme/index.ts` (MUI custom, `#0078D4` primary / `#6264A7` secondary). MUI v9 — **`Grid`** (not Grid2), **`slotProps`** replaces `PaperProps`.
- **Sub-instructions** (keep updated if paths change):
  `src/utils/AGENTS.md`, `src/components/builder/AGENTS.md`, `src/pages/AGENTS.md`,
  `api/AGENTS.md`, `src/components/auth/AGENTS.md`, `src/components/dashboard/AGENTS.md`
- **Only context**: `src/contexts/DashboardContext.tsx` — used by `AdminHomePage`; everything else uses local `useState`.

## Commands
```bash
npm run dev        # Vite dev server (port 3000) — frontend only; /api/* will 404
npm run dev:api    # vercel dev — runs BOTH Vite frontend + API routes locally
npm run build      # tsc -b && vite build — FAILS on any new TS error
npm run lint       # ESLint flat config (many pre-existing warnings)
npx vitest run     # ~77 unit tests in src/utils/__tests__/FormBuilderEngine.test.ts, ~300ms
```
- `npm run build` is the **only** reliable check before commit. `lsp_diagnostics` catches TS errors too.
- `build_errors.txt` / `build_status.txt` are stale artifacts gitignored after `git rm --cached` — ignore them.
- `vitest.config.ts` at root — includes `src/**/*.test.ts`. No setup files, no MSW.

## Stack
- **React 19** + **TypeScript ~6.0.2** (`verbatimModuleSyntax`, `erasableSyntaxOnly: true` — no runtime `enum`/`namespace`, `noUnusedLocals`, `noUnusedParameters`)
- **Vite 8** with `@vitejs/plugin-react` (Oxc-based, React Compiler NOT enabled). `define: { global: 'globalThis' }`.
- `buffer` polyfill: `globalThis.Buffer = Buffer` in `main.tsx` (needed by some SP responses)
- **MUI v9**, `@azure/msal-react`/`@azure/msal-browser`, **react-router-dom v7**
- **SurveyJS v2.5** (`survey-core`, `survey-react-ui`) — Custom form builder (NOT SurveyJS Creator). CSS imported in `main.tsx`.
- `@react-pdf/renderer` — generates PDF on client side. `src/utils/generateFormPdf.ts` handles PDF creation flow.
- `react-dnd` v16 (HTML5 backend) — drag-drop canvas in form builder.
- **API**: Vercel serverless functions in `api/` — **not Express**. Graph API client (`api/_utils/graphClient.ts`) for all list operations. No SP REST SDK — raw `fetch` to `graph.microsoft.com`.
- **API auth**: All 8 API routes (`form-config`, `submit-form`, `evaluate`, `jobs-list`, `job-apply`, `job-admin`, `send-email`, `dashboard-background`) require `X-Api-Key` header matching `API_SECRET_KEY` env var. Validated by `api/_utils/auth.ts`. Frontend sends via `VITE_API_SECRET_KEY` (same value, compiled into bundle).
- **Security**: CORS restricted, CSP set, API auth enforced, error messages sanitized server-side, `encodeURIComponent` on all Graph API path params.
- Other notable deps: `dompurify` (HTML sanitization), `qrcode`, `libphonenumber-js`.

## CI
- `.github/workflows/ci.yml`: `npm ci` → `npm run build` → **`npx vitest run`** (build AND tests both gate the pipeline).
- Runs on `pull_request` + `push` to `main`/`master` (ubuntu-latest, Node 20).

## Gotchas

### Formula / Calculated Fields
- Formulas convert to `type: "text", readOnly: true` with a custom `_expression` property in SurveyJSON (SurveyJS native `expression` conflicts with manual evaluation).
- **CSP blocks `new Function()`**: The published form runs under SharePoint's CSP which blocks `unsafe-eval`. Use `safeEvalArithmetic()` (recursive descent parser in `FormBuilderEngine.ts`) instead of `new Function()` or `eval()`. If a formula shows 0 and the console shows an `EvalError`, this is the cause.
- **Expression blank on load**: `buildQuestionTree` reads `_expression` (new format) first, falls back to `expression` (old/native format). If both are missing, expression shows `""` in the builder.

### DynamicMatrix — Separate SharePoint List
- `dynamicmatrix` fields provision **child lists** named `{FormTitle} Matrix {FieldName}` (NOT just `_Html`/`_Json` columns on the main list).
- Child list columns: `ParentResponseId` (Number), `RowIndex` (Number), plus per-matrix-column fields mapped by cellType.
- `_Html`/`_Json` columns still created for backward compatibility but child list is primary storage.

### SurveyJS Custom Widget Registration Pattern
```
Serializer.addClass("widgetname", [...props], () => new QuestionModel(""), "questionparent")
  → ElementFactory.Instance.registerElement("widgetname", ...)
  → ReactQuestionFactory.Instance.registerQuestion("widgetname", ...)
```
Used by: `SignaturePad` (`src/utils/SignaturePad.tsx`) and `DynamicMatrix` (`src/utils/DynamicMatrix.tsx`).

### Auth & MSAL
- Auth state machine in `App.tsx`: `checking → loading → ready/wrong_tenant/error` or `guest/choice`.
- Auth decision persisted in `localStorage` (`pmw_hr_auth_decision`). Post-login redirect in `sessionStorage` (`pmw_post_login_redirect`).
- Admin detection via SharePoint group `_HR_ Forms Owners`.
- Form builder access is narrower: user must be an HR Forms Owner **and** a member of SharePoint group `superuser`. Only this subset can see or open `/admin/builder[/:formTitle]`.
- `handleRedirectPromise()` uses **3s timeout** (`Promise.race`) — fix for hung redirects in private/incognito. DO NOT remove.
- Clears `sessionStorage` keys `msal.interaction.status` + `msal.login.error` before `loginRedirect()` — DO NOT remove.
- Required env vars validated at startup in `main.tsx`: `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID`, `VITE_SP_SITE_URL`.

### SharePoint REST (Dual Client Pattern)
```
Dashboard: App.tsx → createSpClient(msalInstance, accounts) → src/utils/sharepointClient.ts (MSAL-aware)
Builder:   AdminFormBuilder.tsx → raw token → src/utils/formBuilderSP.ts (standalone, 30min digest cache)
```
- **OData**: `odata=nometadata` — responses use `data.value` not `data.d.results`.
- **Graph API** (server-side): `api/_utils/graphClient.ts` — uses client credentials flow, raw `fetch`. Exports: `queryListItems`, `createListItem`, `updateListItemFields`, `deleteListItem`, `queryListItemById`, `getListId`, etc.
- **Tier query pattern**: Separate lightweight SP queries for optional columns (CurrentLayer, CurrentApprovalLayer, EvaluationData, PdfUrl). 400 errors caught silently.
- **PATCH (SP REST)**: Use `spPatch()` which sends `X-HTTP-Method: MERGE` with `IF-MATCH: *`.

### DynamicFormPage Submission Flow
- `onCompleting` handler prevents SurveyJS auto-complete (`options.allowComplete = false`), captures data, sets `submitStatus: "loading"`.
- A separate `useEffect` on `submitStatus` triggers `doSubmitForm()`. This split prevents async submission from blocking the survey's complete cycle.
- `onComplete` is intentionally NOT registered.

### Career / Job Application System
- **Public careers page**: `src/pages/CareersPage.tsx` — lists open jobs from "Internal Job Listing" SP list (status === "New").
- **Job apply flow**: `src/pages/JobApplyPage.tsx` — form with file uploads, sends PDF + application data to `POST /api/job-apply`. Resume (required single file) and Supporting Documents (optional, max 5, 10MB each) are separate upload sections.
- **API routes**:
  - `api/jobs-list.ts` — public: lists active jobs with live applicant counts (computed from "Job Applications" list)
  - `api/job-apply.ts` — creates application list item, updates count, sends email. **Blocking**: count update and email are mandatory; failure returns 500 with specific error. Duplicate check always runs; `forceApply` bypass only works when `submittedByEmail !== applicantEmail`.
  - `api/job-admin.ts` — admin: list/update/delete applications, CRUD for job listings. All IDs validated as numeric before Graph `$filter` usage.
- **Email**: Uses Graph API `sendMail`. Requires `EMAIL_FROM_ADDRESS` (mail-enabled user) and `HR_RECRUITMENT_EMAIL` env vars. Azure AD app needs `Mail.Send` application permission (admin-granted).
- **Applicant count**: Computed live from "Job Applications" list grouped by `JobListingID`. Also stored as `Application_x0020_Count` on the job listing item.

### `queryListItemById` — Workaround for Filter-on-ID Issues
The `api/_utils/graphClient.ts` helper `queryListItemById(token, listName, itemId)` fetches a single list item by its ID in the URL path (`/items/{id}?$expand=fields`). **Always use this instead of `queryListItems` with `$filter=id eq '...'`** — the latter triggers Graph API 500 `generalException`.

## Key Types (`src/types/index.ts`)
- `FormBuilderField` — all field properties
- `LayerConfig`, `LayerConfigItem` — approval/evaluation layer sequence
- `SurveyJson` — SurveyJS JSON shape
- `JobListing`, `JobApplyRequest`, `JobAdminApplication` — career/jobs types
- `MatrixColumnDef` (in `formBuilderSP.ts`) — dynamicmatrix column definitions

## Anti-Patterns
- **NO `console.log/warn/error`** in production (37 exist across 10 files — remove when touching)
- **NO `any`** — many files have them; fix types when touching
- **NO `@ts-ignore` / `@ts-expect-error`** (zero occurrences currently — keep it that way)
- **NO runtime `enum`/`namespace`** — `erasableSyntaxOnly: true`
- **NO `forwardRef`** or manual memoization — React 19 makes these unnecessary
- **NO `useMemo`/`useCallback`** — redundant in React 19. Exception: `src/hooks/useReactiveForm.ts` (hook implementation) has 5 — leave those.
- **NO path aliases** — all imports relative (`../../utils/...`). No barrel exports except `src/components/builder/index.ts`.
- **NO `React.lazy()`** — route pages are loaded through `src/components/LazyRoute.tsx` dynamic imports in `App.tsx`.
- `FormBuilder.tsx` has `eslint-disable` and `any[]` usage
- `DetailModal.tsx` uses `dangerouslySetInnerHTML` — always uses `DOMPurify.sanitize()` but audit if user input bypasses it
- **Build**: Run `npm run build` after all changes. Do NOT add new TS errors.

## Conventions
- **PowerShell**: use `workdir` parameter with `bash` tool
- **Prefer `import type`** for type-only imports (`verbatimModuleSyntax` requires it)
- **Styling**: Form builder uses inline styles via `C` color object (`src/components/builder/constants.ts`). Published form uses CSS-in-JS with theme tokens. Dashboard uses MUI components with theme overrides. Careers pages use MUI `sx` with inline theme-aware values.
- **State**: Local `useState` only — no context stores except `DashboardContext` in `AdminHomePage`.
- **Responsive**: Dashboard uses `useMediaQuery` for mobile detection (SubmissionRow has stacked card layout on mobile). Header collapses all nav items into a single hamburger menu on mobile.
- **Hooks**: 3 custom hooks in `src/hooks/` — `useUserProfile` (MS Graph user info), `useDashboardBackground` (background image/gradient), `useReactiveForm` (generic form state management).

## Testing
- ~77 unit tests in `src/utils/__tests__/FormBuilderEngine.test.ts` (pure logic, no network/SP).
- Run: `npx vitest run`. Watch: `npx vitest`.
- Config: `vitest.config.ts` — includes `src/**/*.test.ts`.
- No integration/E2E tests exist. No MSW mock handlers. No test fixtures.

## Env Vars
| Var | Controls | Notes |
|---|---|---|
| `VITE_SP_SITE_URL` | SharePoint site all SP calls target | Required, validated at startup |
| `VITE_AZURE_CLIENT_ID` | Azure AD app for MSAL auth | Required |
| `VITE_AZURE_TENANT_ID` | Tenant for auth + API | Required |
| `SYSTEM_CLIENT_ID` / `SYSTEM_CLIENT_SECRET` | API server-side Graph API token (Vercel) | NOT `VITE_` prefixed |
| `API_SECRET_KEY` | Server-side API key for `X-Api-Key` auth | Should differ from `VITE_API_SECRET_KEY` |
| `VITE_API_SECRET_KEY` | Client-side API key (compiled into bundle) | Must match `API_SECRET_KEY` for requests to work |
| `HR_RECRUITMENT_EMAIL` / `VITE_HR_RECRUITMENT_EMAIL` | Recipient for job application HR emails | |
| `EMAIL_FROM_ADDRESS` / `VITE_EMAIL_FROM_ADDRESS` | Sender for HR emails (mail-enabled user, needs `Mail.Send`) | |

For Vercel deployment setup see `VERCEL_SETUP.md`.

## Routing
| Route | Component | File |
|---|---|---|
| `/form/:formId` | `DynamicFormPage` | `src/pages/DynamicFormPage.tsx` |
| `/admin/builder[/:formTitle]` | `AdminFormBuilder` (superuser-only) | `src/pages/AdminFormBuilder.tsx` |
| `/admin/approvals` | `ApprovalDashboard` | `src/components/builder/ApprovalDashboard.tsx` |
| `/admin/responses/:formTitle` | `ResponseViewer` | `src/components/builder/ResponseViewer.tsx` |
| `/admin/dashboard` | admin dashboard (AdminGuard) | `AdminHomePage` (via `adminDashboardInner`) |
| `/user/dashboard` | user dashboard (no guard) | `AdminHomePage` (via `adminDashboardInner`) |
| `/admin/career/applications` | `AdminJobsPage` | `src/pages/AdminJobsPage.tsx` |
| `/admin/career/opportunities` | `AdminJobManagePage` | `src/pages/AdminJobManagePage.tsx` |
| `/admin/career/cards` | `AdminCareerPortalCardsPage` | `src/pages/AdminCareerPortalCardsPage.tsx` |
| `/admin/jobs` | redirect → `/admin/career/applications` | — |
| `/admin/jobs/manage` | redirect → `/admin/career/opportunities` | — |
| `/adminhomepage` | (legacy) redirect via catch-all | `AdminHomePage` |
| `/privacy` | `PrivacyNoticePage` | `src/pages/PrivacyNoticePage.tsx` |
| `/career-portal` | `CareersPage` | `src/pages/CareersPage.tsx` |
| `/career-portal/:jobId/apply` | `JobApplyPage` | `src/pages/JobApplyPage.tsx` |
| `/careers` | redirect → `/career-portal` | — |
| `/careers/:jobId/apply` | redirect → `/career-portal/:jobId/apply` | — |
| `/eval/:token` / `/eval/:formSlug/:responseId/:layerNumber` | `EvaluationPage` | `src/pages/EvaluationPage.tsx` |
| `*` (catch-all) | admin→`/admin/dashboard`, else→`/user/dashboard` | — |

## Builder Architecture (summary)
```
AdminFormBuilder.tsx (page — /admin/builder, Form Builder Superuser-only)
  ├── FormLibrary (sidebar)
  ├── FormBuilder.tsx (canvas — react-dnd drag-drop)
  │     ├── Palette (57 question types)
  │     ├── Canvas (FieldCard reorder + panel nesting)
  │     ├── PropertyPanel (per-field OR Form Settings when deselected)
  │     ├── JsonPreview (collapsed raw JSON)
  │     └── LivePreviewModal (survey-react-ui)
  ├── LayerConfigPanel (approval/evaluation layer sequence editor)
  │     ├── LayerCard[], EvalElementPicker, PublicLinkDisplay
  ├── VersionHistory / AuditLog / ProvisionOverlay
```

## Deployment
- **Vercel** — SPA + serverless functions. `vercel.json` rewrites all non-API routes to `index.html`.
- `vercel dev` runs both frontend and API locally (not `npm run dev` which is frontend-only).
- CORS restricted to `https://pmw-hrform.vercel.app` via `vercel.json`. Security headers (CSP, XFO, etc.) also set there.

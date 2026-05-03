# AGENTS.md — pmw-hrform

## Structure
- Single app package at `pmw-hrform-app/`. All source, config, and commands run from that directory.
- Entry point: `pmw-hrform-app/src/main.tsx` → `BrowserRouter` → `AuthProvider` → `App.tsx`
- Theme: `pmw-hrform-app/src/theme/index.ts` (MUI custom theme, white palette with #0078D4 primary / #6264A7 secondary)
- Assets: `pmw-hrform-app/public/` (favicon, icons.svg), `pmw-hrform-app/src/assets/` (hero.png)

## Commands (run from `pmw-hrform-app/`)
```
npm run dev       # Vite dev server with HMR (port 3000)
npm run build     # tsc -b && vite build (TypeScript must pass before build)
npm run lint      # ESLint flat config
npm run preview   # Preview production build
```
No test framework is configured.

## Stack
- React 19 + TypeScript 6 (ES2023 target, bundler moduleResolution, `verbatimModuleSyntax`)
- Vite 8 with `@vitejs/plugin-react` (Oxc-based, React Compiler NOT enabled)
- MUI v9 (`@mui/material`, `@mui/icons-material`) — `Grid` (not Grid2) in v9.0.0
- `@azure/msal-react` + `@azure/msal-browser` — Azure AD authentication
- **react-router-dom v7** — Routing now active: `BrowserRouter` in `main.tsx`, `<Routes>` in `App.tsx`
- **SurveyJS v2.5** — `survey-core`, `survey-react-ui`, `survey-creator-react` for form builder
- ESLint: flat config with `tseslint.configs.recommended` (not type-checked), `react-hooks`, `react-refresh`

## Auth State Machine (in `App.tsx`)
```
checking → (isAuthenticated?) → loading → (tenant check) → ready / wrong_tenant / error
         → (not auth, stored decision?) → guest / choice
         → (not auth, no decision) → choice → MSAL login or guest
```
States: `checking` | `choice` | `guest` | `loading` | `ready` | `wrong_tenant` | `error`
- Auth decision persisted in `localStorage` (`pmw_hr_auth_decision`)
- Admin detection via SharePoint group `_HR_ Forms Owners`
- Tenant validation via `VITE_AZURE_TENANT_ID` env var

## Routing (react-router-dom v7)
- `"/form/:formId"` → `DynamicFormPage` (public/private form rendering)
- `"*"` → Dashboard with `Header`, `StatsRow`, `ListSummaryCards`, `Toolbar`, `SubmissionRow`
- Form builder opens as modal (`builderOpen` state in `App.tsx`), not a route
- Header "Form Builder" button wired via `onOpenBuilder` prop → sets `builderOpen=true`

## SharePoint Integration
- **odata format**: `odata=nometadata` — responses use `data.value` not `data.d.results`
- **User resolution**: `resolveUserEmails()` in `sharepointClient.ts` maps `AuthorId` → email via `_api/web/getUserById()`
- **`sharepointClient.ts`** exports `createSpClient(instance, accounts)` — passes MSAL instance
- **`formBuilderSP.ts`** — STANDALONE file; uses raw `token: string` param, NOT `createSpClient`
- Config loaded from `Master Form` list (FormId, TotalLayers mapping)
- Lists discovered via `/_api/web/lists` (system lists filtered by BaseTemplate + properties)
- Submissions queried per visible list with `$orderby: Created desc`
- Digest cached with 30min expiry, `X-HTTP-Method` headers for writes

## System Lists Filtering
- Both user and admin contexts see system lists filtered in `filterVisibleLists()`
- `SYSTEM_BASE_TEMPLATES` set: 109, 111, 112, 113, 114, 116, 119, 130, 140, 212, 300, 850
- Property-based exclusions: `isCatalog`, `isSiteAssetsLibrary`, `isApplicationList`, `isSystemList`, `noCrawl`
- `DiscoveredList` type includes: `hidden`, `baseTemplate`, `baseType`, `isCatalog`, `isSiteAssetsLibrary`, `isApplicationList`, `isSystemList`, `noCrawl`

## Form Builder System (admin-only)
- **Entry**: Header "Form Builder" button (visible only when `isAdmin=true`)
- **Files**:
  - `src/components/builder/FormBuilder.tsx` — Main UI (SurveyJS Creator via `survey-creator-react`)
  - `src/components/builder/constants.ts` — `C` color object for inline styles (not MUI)
  - `src/utils/formBuilderSP.ts` — SharePoint REST (standalone, raw token pattern)
  - `src/utils/FormBuilderEngine.ts` — Pure logic: validate, version calc, approval layers
  - `src/utils/DynamicMatrix.tsx` — Custom SurveyJS widget (dynamic table input)
  - `src/utils/matrixToHtml.ts` — Matrix data ↔ HTML/JSON conversion for SharePoint
  - `src/pages/DynamicFormPage.tsx` — End-user form rendering (public/private auth gating)
- **SharePoint lists used**: `Master Form`, `Web Form Versions`, `Form Builder Log`, `Approvers`
- **Approval layers**: 1–3 configurable layers, saved as `L1_Approvers`, `L2_Approvers`, etc.
- **Form versioning**: `Web Form Versions` list, auto-incrementing version numbers
- **Inline styles**: Builder UI uses `C` color object pattern (not MUI) — matches reference code

## Dashboard Components (`src/components/dashboard/`)
- `Header.tsx` — Sticky top bar with user menu, role badge, admin tools, **Form Builder button**
- `RoleBadge.tsx` — Admin/User chip indicator
- `StatsRow.tsx` — 4-column stats (Total / Approved / Pending / Rejected)
- `ListSummaryCards.tsx` — Grid of form list cards with submission counts, **`onEditForm` → opens FormBuilder**
- `Toolbar.tsx` — Search + filter dropdowns (list, status, sort, submitter)
- `ListHeader.tsx` — Column headers for desktop table view
- `SubmissionRow.tsx` — Clickable submission rows (responsive grid/stacked)
- `DetailModal.tsx` — Full detail dialog with fields, signatures, approval chain
- `EmptyState.tsx` — No submissions placeholder
- `ConfigWarningBanner.tsx` — Amber warning for unconfigured lists
- `ListBadge.tsx` — Colored list pill
- `StatusBadge.tsx` — Colored status pill with auto-normalization

## Data Views (DetailModal)
- `DetailModal.tsx` renders `submissionData` fields using `formatFieldValue()`:
  - Dates: auto-detected and locale-formatted
  - User objects: `{ Email, Title }` → displays email or title
  - Lookup fields: `{ Value }` → displays value
  - Booleans: "Yes"/"No"
  - Arrays: comma-joined
- `mapSubmission()` in `App.tsx` filters internal fields using `/^L[1-3]_/` regex (not broad `startsWith("L")`)
- Fields like "Location", "LeaveType" etc. are preserved (not incorrectly filtered)

## Loading Screen
- `LoadingScreen.tsx` accepts `progress` (0-100) and `status` (string) props
- `App.tsx` `fetchData()` reports 6 steps with percentage:
  - 10%: Checking permissions
  - 20%: Discovering lists
  - 35%: Loading configuration
  - 50-95%: Fetching submissions per list with `(n/total)` status
  - 98%: Finalizing
  - 100%: Ready
- Shows determinate CircularProgress + LinearProgress bar + status subtitle

## Auth Components (`src/components/auth/`)
- **Shared visual pattern**: White base, 2-3 radial gradient blobs, subtle SVG accent lines, `position: absolute` with `pointerEvents: none`, `zIndex: 0`
- **Card pattern**: `elevation={0}` with custom border + shadow, top accent bar gradient, `borderRadius: 24`
- **Button patterns**: Primary `contained` (#0078D4, borderRadius 12px), Secondary `outlined`
- `ChoiceScreen.tsx` — MSAL login vs guest choice with Microsoft logo (base64 SVG)
- `GuestLanding.tsx` — Guest-only landing page with sign-in prompt
- `WrongTenantScreen.tsx` — Access denied for non-PMW tenants
- `LoadingScreen.tsx` — Progress bar with % and status subtitle during data loading
- `ErrorScreen.tsx` — Error state with retry and sign-out

## Core Modules
- `src/auth/AuthProvider.tsx` — `MsalProvider` wrapper
- `src/auth/msalConfig.ts` — MSAL configuration with dynamic `AllSites.Manage` SP scope
- `src/types/index.ts` — Shared types: `PageState`, `Submission`, `ApprovalLayer`, `ListMetaEntry`, `DiscoveredList`, `LoadedConfig`, `SharePointClient`, **`FormConfig`, `SurveyJson`, `FormVersionData`**
- `src/utils/sharepointClient.ts` — SP REST client (CRUD, digest cache, `isGroupMember`, list discovery, `resolveUserEmails`)
- `src/utils/spConfig.ts` — Config loader (`loadConfig` from Master Form, `filterVisibleLists`, `generateMeta`, `getMissingConfigs`)
- `src/utils/authDecision.ts` — `localStorage` auth persistence helpers (`pmw_hr_auth_decision`)
- `src/utils/formBuilderSP.ts` — **Standalone** SP REST for form builder (uses raw `token: string`, NOT `createSpClient`)
- `src/utils/FormBuilderEngine.ts` — Pure data logic for form building (validate, versioning, approval layers)

## Conventions
- **PowerShell**: use `workdir` parameter with `bash` tool; PowerShell does NOT support `&&` or native `grep`/`ls` commands
- **File paths**: use full Windows paths like `C:\Users\user\pmw-hrform\pmw-hrform-app\src\...` or the `read` tool's native format with forward slashes
- **TypeScript**: tsconfig uses project references (`tsconfig.json` → `tsconfig.app.json` + `tsconfig.node.json`). Run `tsc -b` for type-checking.
- **ESLint**: NOT type-checked. To add type-aware linting, see `README.md` for the recommended config.
- **React 19**: no `forwardRef` needed, no manual memoization (`useMemo`/`useCallback`)
- **MUI v9.0.0**: uses `Grid` (not `Grid2`); `slotProps` replaces `PaperProps` on Dialog
- **All component files**: use `import type` for type-only imports (`verbatimModuleSyntax`)
- **SurveyJS Creator**: import from `survey-creator-react` (not `survey-react-ui`); widgets registered via `CustomWidgetCollection.Instance.addCustomWidget()`
- **`.env.local`** at app root contains Azure AD credentials (`VITE_AZURE_*`) and SP URL (`VITE_SP_SITE_URL`). **Never commit or expose these values.**
- **`"use client"` directive**: some files use this (Next.js convention) — this is a Vite app, not Next.js. Safe to ignore.

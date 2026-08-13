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
- **API auth**: Frontend-facing API routes require `X-Api-Key` matching `API_SECRET_KEY`. The scheduled `workflow-email-cron` route accepts Vercel's `Authorization: Bearer CRON_SECRET` header or the normal API key for manual verification.
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

### Department Approver Lookup
- Use the SharePoint list name `Department Approver Directory` for department-to-approver mappings.
- Recommended columns: `Department` (single line text, exact form value), `ApproverEmail` (single line text), `ApproverName` (single line text), `ApproverRole` (choice/text; default layer role value is `HOD`).
- Approval layer assignee type `department-approver` reads the submitted department field, filters the directory by exact `Department` and `ApproverRole`, then writes the resolved email into `L{n}_Email`.
- This design avoids Microsoft Graph tenant user search and does not require `User.Read.All`.

### Layer Assignees — Several People, Distribution Lists, Shared Mailboxes
A layer's `assignee` can now resolve to more than one person, and the mail can go somewhere other than the assignee:

| `assignee.type` | `value` | Resolves to |
|---|---|---|
| `user` | one email | that person |
| `users` | comma/semicolon/newline separated emails | all of them |
| `distribution-list` | a DL / mail-enabled group address | its members, expanded via Graph |
| `field-reference` | a form field name | the submitted email |
| `department-approver` | a department field name | the directory lookup |

- **Any one of them completes the layer.** The first approval/evaluation wins; the other links go stale via the existing `CurrentLayer` / terminal-status checks. There is no per-person quorum.
- **Response columns** (all additive — `L{n}_Email` keeps its old meaning and every legacy reader still works):
  - `L{n}_Email` (text) — the **primary** actor. Unchanged.
  - `L{n}_Emails` (note) — every address allowed to act, `"; "` joined. Note, not text, because an expanded DL overruns 255 chars.
  - `L{n}_NotifyEmails` (note) — where the notification was actually delivered.
  - `L{n}_ActedBy` (text) — which of the allowed addresses decided. The PDF prefers this over `L{n}_Email`.
- **Access checks read `L{n}_Emails`**, falling back to `L{n}_Email` for submissions predating these columns — see `isLayerActor()` in `src/utils/layerRecipients.ts` (mirrored at `api/_utils/layerRecipients.ts`; keep the two in sync).
- **Notification split**: `BaseLayer.notifyEmails` lists mailboxes that receive the layer email but **can never act**. `notifyRecipientMode: "notify-only"` sends to those mailboxes *instead of* the assignee — the shared-mailbox case, where the approval still belongs to and is recorded against the evaluator.
- **DL expansion needs `Group.Read.All` as a *Microsoft Graph* Application permission** (admin consent) on `SYSTEM_CLIENT_ID` — not SharePoint. It runs on the `getGraphToken()` token; the SharePoint token is a separate acquisition and granting it there does nothing. Without it Graph returns 403 and submission fails with a configuration error rather than silently assigning nobody. Members come from `/groups/{id}/transitiveMembers`, so nested groups flatten; disabled accounts are skipped.
- The browser cannot expand a DL (delegated token lacks the permission), so `DynamicFormPage` and `ApprovalDashboard` call `POST /api/expand-group` with a **form slug + layer number**, never an address — the server reads the address off that layer's published config. Keeps the route from being a general membership lookup for anyone holding `VITE_API_SECRET_KEY`.
- **Reassigning a layer replaces the whole actor set**, not just the primary — otherwise former co-assignees keep access.
- **Forms published before this change** have none of the three new columns. Both submit paths drop them silently (`OPTIONAL_LAYER_COLUMN_RE` in `api/submit-form.ts` and `src/pages/DynamicFormPage.tsx`) instead of failing the submission — the notification still fans out because it is computed in memory, but the access check falls back to `L{n}_Email` until the form is republished.

### Per-Submission Workflow Overrides
- `/admin/submissions` and `/admin/approvals` are the same internal workflow workspace and both require HR Forms Owner + `superuser`.
- Assigned approvers/evaluators act through `/eval/...`; that reviewer page is separate from the internal workflow workspace.
- Item-specific assignee metadata is stored in the response item's `WorkflowAssignmentData` Note column. `L{n}_Email` remains authoritative for routing and access checks.
- Reassigning a layer also updates any existing `WorkflowEmailSchedule` recipient for that layer without changing its due date. Completed layers cannot be changed.

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
- **Email**: Uses Graph API `sendMail`. HR form workflow emails use `HR_FORM_EMAIL_FROM_ADDRESS`; job application emails use `JOB_APPLICATION_EMAIL_FROM_ADDRESS`; both fall back to `EMAIL_FROM_ADDRESS` for compatibility. Sender env vars must be mail-enabled users with `Mail.Send` application permission (admin-granted). Job application notifications also require `HR_RECRUITMENT_EMAIL`.
- **Applicant count**: Computed live from "Job Applications" list grouped by `JobListingID`. Also stored as `Application_x0020_Count` on the job listing item.
- **Career portal access (public vs. internal)**: HR Forms Owners toggle it from the dashboard header menu → *Career Portal Access* (`src/components/dashboard/CareerPortalAccessDialog.tsx`, `src/hooks/useCareerPortalAccess.ts`).
  - Stored as the `career-portal-access` item in the `AdminPanelSettings` SP list, `SettingValue` = `public` | `internal` (`api/_utils/careerPortalAccess.ts`). Default and every fallback is **public** — a missing setting must not close a portal nobody closed.
  - The `SettingValue` column is created with the **admin's delegated token**, not the app-only Graph principal, which gets `403 accessDenied` on column creation. See the app-only note in `api/AGENTS.md`.
  - Enforced server-side, not by routing: `api/jobs-list.ts` and `api/job-apply.ts` require an `Authorization: Bearer <Microsoft Graph token>` while the portal is internal, and answer `403 { code: "career-portal-private" }` otherwise. `/career-portal*` stays in `isPublicRoutePath` so signed-in visitors keep skipping the dashboard profile load.
  - **The identity proof is a Graph token, not a SharePoint one** (`resolveTenantIdentity`): `/_api/web/currentuser` 403s for staff with no permissions on the HR SharePoint site — the people `RestrictedAccessScreen` exists for — and they must still get into an internal-only portal. Validated by tenant (`tid` claim) *and* a live `graph.microsoft.com/v1.0/me` call; the claim alone is attacker-controlled text, the Graph call is what proves the signature.
  - `job-apply` keeps taking the **SharePoint** token in the request *body* (that is what writes the item, and it decides `isPublicSubmission`). The Graph token rides in the header and only answers "are you signed in". Two tokens, two jobs — do not merge them.
  - The career pages send the identity token via `acquireCareerPortalToken()` and render `CareerPortalPrivateGate` on `isCareerPortalPrivateError(err)`. The client gate is presentation only — the API is the control.
  - `acquireCareerPortalToken` uses `instance.acquireTokenSilent` directly, **never** `acquireAccessTokenSilentOrRedirect`: that helper redirects to Microsoft when the silent call fails, which would throw a visitor off a career page they were reading — including a guest on a portal that is fully public. Failing quietly to `""` is the point.
  - Every caller of `fetchJobs` / `fetchJob` / `fetchCareersPortalData` must pass the token, `AdminHomePage`'s dashboard carousel included, or it 403s once the portal is closed.
  - A private portal responds per-caller, so `jobs-list` switches its `Cache-Control` to `private, no-store`.

### Learning Materials Hub (e-learning)
- **Storage is one SharePoint document library, `Learning Materials`.** Folders are topics, nested folders are subtopics (max 4 deep). Files are materials. Reorganising in SharePoint reorganises the hub — there is no parallel structure to keep in sync.
- **Views** live in the generic list `Learning Material Views`, one item per (material, viewer), stored in the built-in `Title` column as `{driveItemId}::{sha256(email) first 24 hex}`. Only the Title column is used because the app-only Graph principal cannot create columns on this tenant. Counts are therefore **distinct people, never play counts**, and the address is hashed — the feature never needs to know who watched what (`PDPA_COMPLIANCE.md`).
- **Per-material settings** (display title, description, `downloadable`, sort order) ride as JSON in the `CustomImageUrl` note column of the existing `AdminPanelSettings` item titled `learning-materials-settings` — the same trick `career-portal-system-default-cards` uses, and for the same reason (no new columns).
- **Downloads are off by default.** A new upload is view-only until an HR Forms Owner turns the switch on in `/admin/learning`. Documents open through a server-issued SharePoint preview URL (`POST /drives/{id}/items/{id}/preview`) so the file URL never reaches the page; video and images need their bytes and get a short-lived `@microsoft.graph.downloadUrl`. That last part is best-effort, not a security boundary — anything a browser can play, a determined viewer can capture.
- **Uploads go browser → SharePoint directly** (SP REST, chunked above 8 MB, in `src/utils/learningService.ts`), never through `/api`. A Vercel function body caps at ~4.5 MB, which any real training video clears immediately.
- **Two different tokens on one route.** `api/learning-materials.ts` treats `Authorization` as a **Graph** token for learner actions (`list`, `open-material`, `record-view` — identity is what makes a view unique, and staff with no SharePoint permissions must still be able to learn) and as a **SharePoint** token for the admin actions listed in `ADMIN_ACTIONS`, which are checked against `_HR_ Forms Owners`.
- **Never name `@microsoft.graph.downloadUrl` in a `$select`.** It is an OData annotation, not a property, and SharePoint drives answer such a request by omitting it entirely — no error, just a missing URL, which reads downstream as "SharePoint did not return a playable link". Request the drive item with no `$select` (the default projection carries it) and fall back to the `Location` of `GET /items/{id}/content`, which 302s to the same URL. `readDownloadUrl` and `readChildren` in `api/_utils/learningLibrary.ts` both depend on this.
- **There are TWO Content-Security-Policies** — the header in `vercel.json` *and* the `<meta http-equiv>` in `index.html` — and a page carrying both is held to the **intersection**. Widening only the header changes nothing. `media-src` must allow `https://*.sharepoint.com` in **both** or video silently fails to play: it is not covered by `img-src`, so `default-src 'self'` blocks the stream, the player renders with dead controls, and no error surfaces in the app. Document previews likewise need the SharePoint and Office origins in `frame-src` in both.
- **A `<video>` that fails falls back to SharePoint's player.** `VIDEO_EXTENSIONS` accepts containers no browser decodes natively (`.mkv`, `.avi`, `.wmv`, HEVC `.mov`), so `MaterialViewerDialog` re-requests with `preferEmbed: true` on the element's `error` event and iframes the preview URL instead. That path counts the view on open, since an iframe gives no `timeupdate`.
- **The hub sits on the dashboard background**, which an admin can set to a photograph. Anything on `/learning` that would otherwise be ink-on-photo carries its own surface — `learningPanelSx` for blocks, `learningInlineSurfaceSx` / `LearningSectionLabel` for stray labels and the breadcrumb trail.

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
| `CRON_SECRET` | Vercel Cron authentication for scheduled evaluator emails | Server-only; use a separate random value |
| `HR_RECRUITMENT_EMAIL` / `VITE_HR_RECRUITMENT_EMAIL` | Recipient for job application HR emails | |
| `HR_FORM_EMAIL_FROM_ADDRESS` | Sender for HR form workflow/approval emails | Falls back to `EMAIL_FROM_ADDRESS`; mail-enabled user, needs `Mail.Send` |
| `JOB_APPLICATION_EMAIL_FROM_ADDRESS` | Sender for job application/recruitment emails | Falls back to `EMAIL_FROM_ADDRESS`; mail-enabled user, needs `Mail.Send` |
| `EMAIL_FROM_ADDRESS` | Legacy/shared fallback sender for Graph mail | Prefer the specific sender vars above; old `VITE_*` sender fallbacks still work but should not be used for new config |

For Vercel deployment setup see `VERCEL_SETUP.md`.

## Routing
| Route | Component | File |
|---|---|---|
| `/form/:formId` | `DynamicFormPage` | `src/pages/DynamicFormPage.tsx` |
| `/admin/builder[/:formTitle]` | `AdminFormBuilder` (superuser-only) | `src/pages/AdminFormBuilder.tsx` |
| `/admin/approvals` | `ApprovalDashboard` (superuser-only) | `src/components/builder/ApprovalDashboard.tsx` |
| `/admin/responses/:formTitle` | `ResponseViewer` | `src/components/builder/ResponseViewer.tsx` |
| `/admin/dashboard` | admin dashboard (AdminGuard) | `AdminHomePage` (via `adminDashboardInner`) |
| `/user/dashboard` | user dashboard (no guard) | `AdminHomePage` (via `adminDashboardInner`) |
| `/admin/career/applications` | `AdminJobsPage` | `src/pages/AdminJobsPage.tsx` |
| `/admin/career/opportunities` | `AdminJobManagePage` | `src/pages/AdminJobManagePage.tsx` |
| `/admin/career/cards` | `AdminCareerPortalCardsPage` | `src/pages/AdminCareerPortalCardsPage.tsx` |
| `/learning` | `LearningMaterialsPage` (any signed-in account) | `src/pages/LearningMaterialsPage.tsx` |
| `/admin/learning` | `AdminLearningPage` (AdminGuard) | `src/pages/AdminLearningPage.tsx` |
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

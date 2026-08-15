# AGENTS.md — src/pages/

**Scope:** Top-level route components. Each maps 1:1 to a route defined in `App.tsx`.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Admin dashboard | `AdminHomePage.tsx` | Route `/adminhomepage` and catch-all. Props: ~25 from `App.tsx` (prop-drilling). |
| Form builder page | `AdminFormBuilder.tsx` | Routes `/admin/builder[/:formTitle]`. Form Builder Superuser-only: route guard and page backup check require HR Forms Owner + `superuser`. Brand header + mode rail (Builder / Workflow / Settings / Publish); at most two panes at a time. Hosts `FormBuilder` (Builder), `LayerConfigPanel` (Workflow), and the Settings / Publish disclosure columns. Manages `showBanner`, `meta`, `layerConfig`, publish flow. |
| Public form renderer | `DynamicFormPage.tsx` | Route `/form/:formId`. Auth gate bypassed for public forms. Drawn by the `src/native/` engine; submission handler with LayerConfig-based layer resolution. `handleSubmit` validates, applies the PDPA and company-choice gates, fills `lastDataRef` from `collect()` and raises `submitStatus`, which a `useEffect` turns into `doSubmitForm()`. |
| Evaluator interface | `EvaluationPage.tsx` | Routes `/eval/:token` (public) and `/eval/:formSlug/:responseId/:layerNumber` (365). Auth gate, layer action (approve/signature/checkbox/reject/confirm). |
| Approval workspace | `ApprovalDashboard.tsx` | Routes `/admin/submissions` and `/admin/approvals`. Both are Form Builder Superuser-only; distinct from `/eval/...`, which is the assigned reviewer action page. |
| Approval routing | `AdminRoutingPage.tsx` | Route `/admin/routing`. Form Builder Superuser-only. Manages the `Approval Directory` list (who approves whom) that `chain` and `role-holder` layer assignees resolve against. Tabs: People (CRUD, CSV import/export), Trace, Problems. Panels live in `src/components/routing/`. |
| Native renderer preview | `NativeFormPreviewPage.tsx` | Route `/native/:formId`, public. Same published form as `/form/:formId`, and now the same renderer — read-only, validating and printing the payload rather than submitting. `/native/demo` uses a bundled sample and needs no backend, which makes it the quickest way to look at the engine. |
| Privacy notice | `PrivacyNoticePage.tsx` | Route `/privacy`. Public page with PDPA privacy notice content. |
| Job admin lists | `AdminJobsPage.tsx` | Route `/admin/career/applications`. Lists/manages job applications. |
| Job admin manage | `AdminJobManagePage.tsx` | Route `/admin/career/opportunities`. CRUD for job listings. |
| Career portal cards | `AdminCareerPortalCardsPage.tsx` | Route `/admin/career/cards`. Manages career portal hero/feature cards. |

## Conventions
- **Prop-drilling**: `AdminHomePage` receives massive props from `App.tsx` — no context abstraction yet.
- **Route imports**: Pages are dynamically imported from `App.tsx` via `src/components/LazyRoute.tsx` — no `React.lazy()`.
- **No barrel export**: Import each page directly by path, e.g. `import AdminHomePage from "../pages/AdminHomePage"`.
- **Each page is self-contained**: Pages don't import from other pages.

## Anti-Patterns
- `DynamicFormPage.tsx` — has `console.error`/`console.warn` calls (remove or replace with proper logging).
- `AdminFormBuilder.tsx` — has `console.error`/`console.warn` calls.

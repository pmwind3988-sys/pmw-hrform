# AGENTS.md — src/pages/

**Scope:** Top-level route components. Each maps 1:1 to a route defined in `App.tsx`.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Admin dashboard | `AdminHomePage.tsx` | Route `/adminhomepage` and catch-all. Props: ~25 from `App.tsx` (prop-drilling). |
| Form builder page | `AdminFormBuilder.tsx` | Routes `/admin/builder[/:formTitle]`. Hosts `FormBuilder` + `FormLibrary` + sidebar with Layers/Meta/Versions/Log/Publish tabs. Manages `showBanner`, `meta`, `layerConfig`, publish flow. |
| Public form renderer | `DynamicFormPage.tsx` | Route `/form/:formId`. Auth gate bypassed for public forms. SurveyJS model + theme + submission handler with LayerConfig-based layer resolution. Signature upload hooked in `onComplete`. |
| Evaluator interface | `EvaluationPage.tsx` | Routes `/eval/:token` (public) and `/eval/:formSlug/:responseId/:layerNumber` (365). Auth gate, layer action (approve/signature/checkbox/reject/confirm). |

## Conventions
- **Prop-drilling**: `AdminHomePage` receives massive props from `App.tsx` — no context abstraction yet.
- **Eager imports**: All pages imported statically in `App.tsx` — no `React.lazy()` or route-level code splitting.
- **No barrel export**: Import each page directly by path, e.g. `import AdminHomePage from "../pages/AdminHomePage"`.
- **Each page is self-contained**: Pages don't import from other pages.

## Anti-Patterns
- `DynamicFormPage.tsx` — has `console.error`/`console.warn` calls (remove or replace with proper logging).
- `AdminFormBuilder.tsx` — has `console.error`/`console.warn` calls.

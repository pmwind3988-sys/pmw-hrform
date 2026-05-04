# AGENTS.md — src/utils/

**Scope:** SharePoint REST clients, form builder logic, config loading, auth persistence.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| SP REST client (dashboard) | `sharepointClient.ts` | Factory `createSpClient(instance, accounts)` — CRUD, digest cache, `isGroupMember`, list discovery, `resolveUserEmails` |
| SP REST client (builder) | `formBuilderSP.ts` | **Standalone** — raw `token: string` param, NOT `createSpClient`; ~1100 lines |
| Config loader | `spConfig.ts` | `loadConfig` from Master Form, `filterVisibleLists`, `generateMeta`, `getMissingConfigs` |
| Form logic | `FormBuilderEngine.ts` | Pure functions: question types, validation, survey JSON builder, versioning |
| Custom widget | `DynamicMatrix.tsx` | Custom SurveyJS widget for matrix questions |
| Matrix conversion | `matrixToHtml.ts` | Matrix ↔ HTML/JSON conversion |
| Auth persistence | `authDecision.ts` | `localStorage` helpers for `pmw_hr_auth_decision` |

## Dual SharePoint Client Pattern
```
Dashboard path:
  App.tsx → createSpClient(msalInstance, accounts) → sharepointClient.ts

Builder path:
  AdminFormBuilder.tsx → raw token (via msalInstance.acquireTokenSilent)
    → formBuilderSP.ts (independent digest cache)
```
- **Intentional separation**: builder uses raw token, dashboard uses MSAL instance
- **Risk**: two digest caches, two SP_SITE_URL reads, inconsistent error handling

## Conventions
- `sharepointClient.ts`: returns `SharePointClient` interface; MSAL-aware
- `formBuilderSP.ts`: standalone functions; no MSAL dependency
- `FormBuilderEngine.ts`: pure logic, no side effects, no React imports
- **OData**: `odata=nometadata` — responses use `data.value` not `data.d.results`

## SP Column Type Mapping
`FormBuilderEngine.ts` `getSpColumnKind()` and `formBuilderSP.ts` `addColumn()` map SurveyJS types to SharePoint `FieldTypeKind`:
- 2 = Text, 3 = Note, 4 = DateTime, 6 = Choice, 8 = Boolean, 9 = Number, 15 = MultiChoice
- `dynamicmatrix`/`tableinput` create `_Html` (richText) + `_Json` columns
- `spChoicesSource` fields fetch live choices from SP at publish time and pass them to `addColumn()`

## Anti-Patterns
- `formBuilderSP.ts` has `catch (e: any)` and `eslint-disable` — fix types when touching
- `formBuilderSP.ts` has `data.d.results` fallback — legacy format, should be removed
- `console.warn` in `formBuilderSP.ts` — remove or replace with proper logging

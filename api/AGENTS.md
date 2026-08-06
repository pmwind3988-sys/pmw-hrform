# AGENTS.md — api/

**Scope:** Vercel serverless functions. Run locally via `npm run dev:api`. Deployed to Vercel alongside the SPA.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Public form config | `form-config.ts` | `GET /api/form-config?slug=X[&version=Y]`. Reads Master Form + Web Form Versions via Graph API. |
| Public form submit | `submit-form.ts` | `POST /api/submit-form`. Verifies form is public, creates list item via Graph API. Accepts optional `matrixData` param for dynamicmatrix child list items and resolves department approver layers from "Department Approver Directory". |
| Submission reference no. | `next-reference.ts` | `POST /api/next-reference` `{listTitle}`. Allocates the next `[PREFIX-]DDMMYY-NNNN` for a form. The **only** allocator — the signed-in browser and `submit-form.ts` both call through it, so concurrent submissions cannot claim the same number. Prefix/padding come from the form's `ReferenceConfig`, never the request. |
| Reference counter | `_utils/referenceCounter.ts` | One permanent row per form in `Form Reference Counters`, holding `LastDateKey` + `LastNumber`. Increments via SP REST `IF-MATCH` with a 412-retry loop; the daily reset falls out of comparing the stored day to today (Malaysia, UTC+8). Numbers are claimed before the row is written, so failed submissions leave gaps by design. |
| Public evaluation | `evaluate.ts` | `GET /api/evaluate?token=X&responseItemId=Y` returns filtered layer-visible data; `POST /api/evaluate` submits approve/reject/confirm actions via system credential. |
| Dashboard background | `dashboard-background.ts` | `GET/POST /api/dashboard-background`. Fetches/saves dashboard background setting from SP list. |
| Distribution list expansion | `expand-group.ts` | `POST /api/expand-group` `{slug, layerNumber, branch?}`. Expands the DL configured on that layer into member addresses. Reads the address off the published `LayerConfig` rather than trusting the request, so the client API key cannot be used for arbitrary group-membership lookups. Needs `Group.Read.All` as a **Microsoft Graph** Application permission (not SharePoint). |
| Group members | `_utils/groupMembers.ts` | `expandDistributionList(token, address)` — resolves the group by mail/proxyAddress, then pages `transitiveMembers` (nested groups flatten, disabled accounts skipped). Throws on Graph failure so a missing permission is never mistaken for an empty group. |
| Layer actors vs. recipients | `_utils/layerRecipients.ts` | Who may act (`L{n}_Emails`) vs. who gets the mail (`L{n}_NotifyEmails`). **Mirror of `src/utils/layerRecipients.ts` — keep both in sync.** |
| Send email | `send-email.ts` | `POST /api/send-email`. Sends HR form workflow mail via Graph API `sendMail` from `HR_FORM_EMAIL_FROM_ADDRESS` (fallback `EMAIL_FROM_ADDRESS`). Requires `Mail.Send` app permission. |
| Scheduled workflow email | `workflow-email-cron.ts` | Daily Vercel Cron runner. Sends due per-item evaluator emails persisted in `WorkflowEmailSchedule`; authenticated with `CRON_SECRET` or `X-Api-Key`. |
| Job listings (public) | `jobs-list.ts` | `GET /api/jobs-list`. Lists active jobs from "Internal Job Listing" SP list with live applicant counts. Enforces career portal access — see below. |
| Job applications | `job-apply.ts` | `POST /api/job-apply`. Creates "Job Applications" item, uploads files, sends HR email. See gotchas in root AGENTS.md. |
| Job admin | `job-admin.ts` | `GET/PUT/DELETE /api/job-admin`. Admin CRUD for applications and job listings. All IDs validated as numeric before Graph `$filter`. |
| Graph client | `_utils/graphClient.ts` | Client-credentials token for `graph.microsoft.com/v1.0`. Exports: `queryListItems`, `createListItem`, `updateListItemFields`, `deleteListItem`, `queryListItemById`, `getListId`, etc. |
| API auth | `_utils/auth.ts` | Validates `X-Api-Key` header against `API_SECRET_KEY` env var. Used by all routes. |
| Career portal cards | `_utils/careerPortalCards.ts` | CRUD helpers for "Career Portal Cards" SP list. Used by jobs-list.ts and job-admin.ts. |
| Career portal access | `_utils/careerPortalAccess.ts` | Reads/writes the `career-portal-access` item in `AdminPanelSettings` (`SettingValue` = `public` \| `internal`). `readCareerPortalAccess` never throws — a missing list or a Graph failure falls back to public, which is how the portal behaved before the setting existed. **`SettingValue` must be provisioned with the admin's delegated token** (`ensureCareerPortalAccessSchema`) — see the app-only column note below. |
| List provisioning | `_utils/provisioning.ts` | Helpers for ensuring SP list schemas exist (used by submit-form, job-apply). |
| Logger | `_utils/logger.ts` | Sanitized logging helpers that avoid raw personal data in output. |

## Conventions
- **Import paths**: API routes import from `./_utils/...` (relative, `_` prefix convention).
- **OData**: Uses `odata=nometadata` — responses use `data.value` not `data.d.results`.
- **CORS**: `vercel.json` restricts `Access-Control-Allow-Origin` to `https://pmw-hrform.vercel.app` for `/api/*`.
- **Environment**: API routes run server-side in Vercel (Node.js runtime). Use `process.env` for secrets, NOT `import.meta.env.VITE_*`.
- **Graph API**: Raw `fetch` to `graph.microsoft.com/v1.0` with client credentials flow. No SP REST SDK.
- **App-only cannot create columns.** The client-credentials principal reads and writes list *items* fine, but `POST /sites/{id}/lists/{id}/columns` comes back `403 accessDenied`. Add columns with the signed-in admin's delegated SharePoint token instead — `ensureTextFieldViaSPRest` in `_utils/sharepointRest.ts`. This is why `ADMIN_PANEL_SETTINGS_COLUMNS` does not list `SettingValue`: `ensureListColumns` throws on the first column it cannot add, so a column named there but absent from an existing site breaks every caller, including dashboard background saves.

## Anti-Patterns
- `console.error` in API routes — replace with proper logging.

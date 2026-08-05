# Vercel Serverless Functions — Local Testing Guide

## Quick Start

You do **not** need to deploy to Vercel first to test the API endpoints locally.

---

## 1. Install Vercel CLI

```bash
npm i -g vercel
```

---

## 2. Link Your Project

Run this once to connect your local repo to your Vercel project (creates `.vercel/` folder — no deployment happens):

```bash
vercel link
```

Follow the prompts to select your Vercel account and project.

---

## 3. Set Up Environment Variables

The API functions need these env vars to authenticate with SharePoint via client credentials:

| Variable | Description |
|----------|-------------|
| `VITE_AZURE_TENANT_ID` | Your Microsoft Entra tenant ID |
| `VITE_SP_SITE_URL` | Your SharePoint site URL |
| `SYSTEM_CLIENT_ID` | App registration Client ID (app-only) |
| `SYSTEM_CLIENT_SECRET` | App registration Client Secret |
| `API_SECRET_KEY` / `VITE_API_SECRET_KEY` | Shared API key for frontend-to-API calls |
| `CRON_SECRET` | Server-only bearer secret used by Vercel Cron for scheduled evaluator emails |
| `PUBLIC_LINK_SECRET` | Server-only HMAC key that signs public approval/evaluation links. Falls back to `CRON_SECRET` if unset. **Never set this to `API_SECRET_KEY`** — see below |
| `HR_FORM_EMAIL_FROM_ADDRESS` | Mail-enabled sender for HR form workflow and approval emails |
| `JOB_APPLICATION_EMAIL_FROM_ADDRESS` | Mail-enabled sender for job application emails |
| `HR_RECRUITMENT_EMAIL` | Recipient mailbox for job application notifications |

### Option A: Local `.env` file (fastest)

Create a `.env` file in the project root:

```bash
VITE_AZURE_TENANT_ID=3042ec28-18ef-448b-a1fd-cf1f2446943c
VITE_SP_SITE_URL=https://pmwgroupcom.sharepoint.com/sites/PMWHRDocs
SYSTEM_CLIENT_ID=d3b814bf-b62f-4281-93ca-8e8082155bf7
SYSTEM_CLIENT_SECRET=psE8Q~b8OFJtkcx8xHkhwtSz483JboOykhyFSavX
```

> **Note:** `.env` is already gitignored. Never commit secrets.

### Option B: Pull from Vercel dashboard

If you've already added the env vars in the Vercel dashboard:

```bash
vercel env pull .env


---

## 4. Run Local Dev Server

```bash
vercel dev
```

This starts both:
- **Vite frontend** at `http://localhost:3000`
- **Serverless API** at `http://localhost:3000/api/*`

### Difference from `npm run dev`

| Command | Frontend | API Routes | Use For |
|---------|----------|------------|---------|
| `npm run dev` | ✅ Vite | ❌ 404 on `/api/*` | Frontend UI work only |
| `vercel dev` | ✅ Vite | ✅ Functions active | Testing anonymous form access |

---

## 5. Test Anonymous Form Access

1. Make sure you have a **public** form published (`IsPublic: true`) with a slug
2. Open an **incognito/private browser window** (no MSAL auth)
3. Visit: `http://localhost:3000/form/{your-slug}`
4. The form should load via `GET /api/form-config?slug={your-slug}`
5. Submit the form — it should hit `POST /api/submit-form`

---

## 6. Prerequisite: Admin Consent

Your app registration (`SYSTEM_CLIENT_ID`) must have **admin consent** granted. Without it, the client credentials flow will fail.

The app acquires **two separate tokens**, so the permissions below come from **two different APIs** when you add them in the portal. Adding one under the wrong API silently does nothing — the token that needs it is a different token.

### Required permissions

All are **Application** permissions (client credentials, no signed-in user) — never Delegated.

| Permission | Add under | Needed for |
|---|---|---|
| `Sites.Selected` | **Microsoft Graph** | All Graph list reads/writes. Grants nothing on its own — each site must additionally be granted to the app (see note) |
| `Mail.Send` | **Microsoft Graph** | Workflow, approval and job application emails |
| `Group.Read.All` | **Microsoft Graph** | Expanding a distribution-list layer assignee — see below |
| `AuditLog.Read.All` | **Microsoft Graph** | Currently granted; not required by any route in this repo |

> **`Sites.Selected` is not `Sites.Read.All`.** It authorises nothing until a specific site is granted to the app registration (via Graph `sites/{id}/permissions` or PnP `Grant-PnPAzureADAppSitePermission`). If Graph list calls start returning 403 for a *new* SharePoint site, this is why — the app needs that site added, not a broader permission.

The certificate-based SharePoint REST token (`getSharePointToken()`) carries its own separate grants, used for the Hyperlink/Image field patches Graph handles unreliably. Those were configured before this work and are not listed here.

`Group.Read.All` is needed **only if** a workflow layer is assigned to a distribution list. Without it, `POST /api/expand-group` gets a 403 from Graph and those submissions fail with a configuration error rather than silently assigning nobody. Layers assigned to individual people never need it.

Which token uses which: SharePoint REST calls go through `getSharePointToken()` (scope = your site origin); everything else — Graph list operations, `sendMail`, group expansion — goes through `getGraphToken()` (scope `https://graph.microsoft.com/.default`). Both in `api/_utils/graphClient.ts`.

### How to grant
1. Go to [Azure Portal](https://portal.azure.com) → Microsoft Entra ID → App registrations
2. Find your system app (`d3b814bf-b62f-4281-93ca-8e8082155bf7`)
3. API permissions → **Add a permission** → pick **Microsoft Graph** or **SharePoint** per the table → **Application permissions** → select → Add
4. **Grant admin consent for [your tenant]**, then confirm every row shows "Granted for [tenant]"

---

## 6b. Public approval links (`PUBLIC_LINK_SECRET`)

A workflow layer set to **Public Link** is actioned without a 365 sign-in. Each submission is
emailed its own HMAC-signed link, scoped to that one submission and layer, expiring on the layer's
configured schedule and refusing a second decision once one has landed.

- Generate a value with `openssl rand -base64 32` (or anything long and random) and add it as a
  **server-only** variable — no `VITE_` prefix.
- If it is unset, links are signed with `CRON_SECRET` instead. That works, but a dedicated key
  means rotating one does not invalidate the other.
- **Never reuse `API_SECRET_KEY`.** Its twin `VITE_API_SECRET_KEY` ships inside the browser bundle,
  so anyone could mint their own approval links.
- **Rotating the secret invalidates every link already sitting in an inbox.** Recipients get "This
  review link is not valid"; reissue from `/admin/submissions`.
- If neither variable is set, public layers fall back to the legacy form-wide token where one still
  exists on the layer, and no new signed links are issued.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Token acquisition failed" | Missing env vars or no admin consent | Check `.env` exists and admin consent is granted |
| "Form not found" | Wrong slug or form not published | Verify slug in `Master Form` list and `IsPublished = true` |
| "Form is not public" | `IsPublic` is false | Check form settings in the builder |
| CORS errors | `vercel.json` headers not applied | Make sure `vercel.json` is in project root |
| API returns HTML instead of JSON | Using `npm run dev` instead of `vercel dev` | Run `vercel dev` |
| "This review link is not valid" on a public link | `PUBLIC_LINK_SECRET` (or `CRON_SECRET`) changed since the link was mailed | Reissue the link from `/admin/submissions`; rotating the signing key invalidates every outstanding link |
| "This review link has expired" | Past the layer's configured link validity | Reissue from `/admin/submissions`, or raise "Link valid for" on the layer |
| "This review link has been replaced by a newer one" | The layer's link was reissued with revocation | Use the most recent email |
| "Could not expand the distribution list" on submit | `Group.Read.All` not granted, or the address is not a mail-enabled group | Grant `Group.Read.All` with admin consent; confirm the address resolves under Entra ID → Groups |

---

## 8. Files Involved

| File | Purpose |
|------|---------|
| `api/_utils/sharepoint.ts` | OAuth client credentials + SP REST helpers |
| `api/form-config.ts` | `GET /api/form-config?slug=` — loads form for guests |
| `api/submit-form.ts` | `POST /api/submit-form` — anonymous submission |
| `vercel.json` | SPA routing + CORS headers |
| `.env` | Local env vars (gitignored) |

---

## 9. Deploying to Vercel

When you're ready to deploy:

```bash
vercel --prod
```

Or push to Git — Vercel auto-deploys connected repos.

### Required Dashboard Env Vars

In Vercel Dashboard → Project Settings → Environment Variables, add:

- `VITE_AZURE_TENANT_ID`
- `VITE_SP_SITE_URL`
- `SYSTEM_CLIENT_ID`
- `SYSTEM_CLIENT_SECRET`
- `API_SECRET_KEY`
- `VITE_API_SECRET_KEY`
- `CRON_SECRET`
- `PUBLIC_LINK_SECRET`
- `HR_FORM_EMAIL_FROM_ADDRESS`
- `JOB_APPLICATION_EMAIL_FROM_ADDRESS`
- `HR_RECRUITMENT_EMAIL`

> Keep system credentials and sender mailboxes server-only. The browser-required values are `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID`, `VITE_SP_SITE_URL`, and `VITE_API_SECRET_KEY`.

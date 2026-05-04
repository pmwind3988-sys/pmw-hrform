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
```

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

Your app registration (`SYSTEM_CLIENT_ID`) must have **admin consent** granted for SharePoint permissions. Without it, the client credentials flow will fail.

### Required permissions:
- `Sites.Read.All` (to read form configs)
- `Sites.Manage.All` or `Sites.FullControl.All` (to write submissions)

### How to grant:
1. Go to [Azure Portal](https://portal.azure.com) → Microsoft Entra ID → App registrations
2. Find your system app (`d3b814bf-b62f-4281-93ca-8e8082155bf7`)
3. API Permissions → Grant admin consent for [your tenant]

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Token acquisition failed" | Missing env vars or no admin consent | Check `.env` exists and admin consent is granted |
| "Form not found" | Wrong slug or form not published | Verify slug in `Master Form` list and `IsPublished = true` |
| "Form is not public" | `IsPublic` is false | Check form settings in the builder |
| CORS errors | `vercel.json` headers not applied | Make sure `vercel.json` is in project root |
| API returns HTML instead of JSON | Using `npm run dev` instead of `vercel dev` | Run `vercel dev` |

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

> **Do NOT** prefix them with `VITE_` or `NEXT_PUBLIC_` — those expose secrets to the browser. The frontend only needs `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID`, and `VITE_SP_SITE_URL`.

# Session Management System

## Architecture Overview

```
┌─────────────────────────┐       ┌──────────────────────────────────────┐
│       SPA (Browser)     │       │    Vercel Serverless API             │
│                         │       │                                      │
│  useSessionManager()    │──────►│  /api/session/register  (POST)      │
│  - Generates sessionId  │       │  /api/session/release   (POST)      │
│  - Registers on login   │       │  /api/session/heartbeat (POST)      │
│  - Heartbeat every 5min │       │  /api/admin/sessions    (GET)       │
│  - Detects takeover     │       │                                      │
│  - Releases on close    │       │  Token validation via JWKS           │
│  - 30min inactivity     │       │  Session store → SharePoint list    │
└─────────────────────────┘       └──────────────────────────────────────┘
                                           │
                                           ▼
                                  ┌─────────────────────┐
                                  │  SharePoint          │
                                  │  "Session Log" list  │
                                  │  (auto-created)      │
                                  └─────────────────────┘
```

**Key principle**: Session enforcement is per-user (Azure AD object ID). Guest users are entirely excluded — they never hit any session endpoint.

---

## How It Works (Step by Step)

### 1. Session Registration (on login)

1. User authenticates via MSAL → `pageState` reaches `"ready"`
2. `useSessionManager` hook generates a UUID (`sessionId`) and stores it in `sessionStorage`
3. Hook calls `POST /api/session/register` with:
   - `sessionId`: UUID from step 2
   - `isAdmin`: from the SharePoint group check
   - `Authorization: Bearer <MSAL_token>` — validated server-side via JWKS
4. **Server-side** (`api/_utils/validateUserToken.ts`):
   - Fetches Azure AD JWKS (`/discovery/v2.0/keys`)
   - Verifies token signature (RS256) using Node.js `crypto`
   - Checks `exp`, `iss` claims
   - Extracts `oid`, `email`, `name` from the token
5. **Server-side** (`api/_utils/sessionStore.ts`):
   - Queries "Session Log" list for active sessions matching `userObjectId`
   - Filters out stale sessions (no heartbeat > 15 min)
   - If active session found AND `force !== true` → returns `409 Conflict`
   - Otherwise → marks old sessions inactive, creates new session record

### 2. Session Conflict (409)

When a second browser/tab tries to register for the same user:

```
Tab 1: session registered (S1)
Tab 2: tries to register → 409 Conflict
       └► Shows SessionTakeoverDialog:
          "Your account is active on another browser.
           Session started: 10:32 AM
           Browser: Chrome 124 on Windows"

       Two choices:
       ├─ "Go Back" → dismisses dialog, keeps Tab 2 idle
       └─ "Take Over" → calls register with force=true
                         → API marks S1 as inactive
                         → creates S2
                         → Tab 1's next heartbeat gets 409
```

### 3. Heartbeat

- Every **5 minutes**, the active tab sends `POST /api/session/heartbeat`
- Updates `LastActivityAt` in the session record
- If the session was invalidated (taken over), returns `409 SESSION_INVALIDATED`
- SPA shows `SessionTakenOverScreen` with "Take Back" and "Sign Out" buttons

### 4. Session Release

Three triggers:
- **Explicit logout**: `handleSignOut()` calls `session.release()` → sendBeacon to `/api/session/release`
- **Tab close**: `beforeunload` event → sendBeacon to `/api/session/release`
- **Takeover**: old session marked inactive by the new registration with `force=true`

### 5. Inactivity Timeout

- Tracks `mousedown`, `keydown`, `touchstart`, `scroll`, `click` events
- If no activity for **30 minutes**, forces session to "takenOver" state
- (Configurable by changing `INACTIVITY_TIMEOUT_MS` in `sessionManager.ts`)

### 6. Admin Monitoring

Route: `/admin/sessions` (admin users see "Sessions" button in header)

Three tabs:
| Tab | Source | Description |
|-----|--------|-------------|
| **Active Sessions** | SharePoint "Session Log" | Current active sessions — user, started at, browser, IP, role. "End" button to force-invalidate. |
| **Session History** | SharePoint "Session Log" | Last 100 session records (active and ended). |
| **Azure AD Sign-ins** | Graph API `/auditLogs/signIns` | Requires `AuditLog.Read.All` permission. Shows sign-in logs with status, IP, app, client type. |

---

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `api/_utils/validateUserToken.ts` | ~130 | JWKS-based Azure AD token validation |
| `api/_utils/sessionStore.ts` | ~250 | CRUD operations on "Session Log" SharePoint list |
| `api/session/register.ts` | ~80 | POST handler — register session (with 409 conflict) |
| `api/session/release.ts` | ~65 | POST handler — deactivate session |
| `api/session/heartbeat.ts` | ~70 | POST handler — keep-alive + takeover detection |
| `api/admin/sessions.ts` | ~175 | GET handler — admin session monitoring + Azure AD logs |
| `src/utils/sessionManager.ts` | ~310 | React hook — full session lifecycle |
| `src/components/session/SessionTakeoverDialog.tsx` | ~95 | MUI dialog for 409 conflict |
| `src/components/session/SessionTakenOverScreen.tsx` | ~95 | Full-screen "session taken over" UI |
| `src/pages/AdminSessionsPage.tsx` | ~300 | Admin session monitoring page |

## Files Modified

| File | What Changed |
|------|-------------|
| `vercel.json` | Added `Authorization` to `Access-Control-Allow-Headers`, `DELETE` to methods |
| `src/App.tsx` | Integrated `useSessionManager`, taken-over screen, takeover dialog, `/admin/sessions` route, `onOpenSessions` callback |
| `src/contexts/DashboardContext.tsx` | Added `onOpenSessions` to interface |
| `src/pages/AdminHomePage.tsx` | Passes `onOpenSessions` to Header |
| `src/components/dashboard/Header.tsx` | Added "Sessions" button for admin users |
| `src/pages/DynamicFormPage.tsx` | Bugfix: added `clearStoredAuthDecision()` to logout handler |
| `src/components/builder/ApprovalDashboard.tsx` | Bugfix: added `clearStoredAuthDecision()` to inline sign-out button |

---

## Azure AD Setup Required

### Required (already configured — no action needed)

The existing Azure AD app registration is sufficient for session management to work:
- `VITE_AZURE_TENANT_ID` — identifies your tenant
- `SYSTEM_CLIENT_ID` / `SYSTEM_CLIENT_SECRET` — for Graph API access to the "Session Log" list
- The MSAL token issued to the SPA (for `{SP_ORIGIN}/AllSites.Manage`) is validated server-side via JWKS

### Optional: Azure AD Sign-in Logs in Admin UI

For the "Azure AD Sign-ins" tab in `/admin/sessions` to show data:

1. Go to [Azure Portal → App Registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Select your app registration
3. Go to **API Permissions** → **Add a permission**
4. Choose **Microsoft Graph** → **Application permissions**
5. Search for and select **`AuditLog.Read.All`**
6. Click **Add permissions**
7. Click **Grant admin consent** (requires Global Admin)
8. If this permission is NOT granted, the admin page still works — the sign-in tab just shows "Sign-in logs unavailable" with a warning banner. The Active Sessions and History tabs work from the SharePoint list data.

---

## Deploy Checklist

1. **Deploy API routes** to Vercel — `api/session/*` and `api/admin/sessions` deploy automatically with the rest of the app
2. **First deploy** — the first call to `/api/session/register` auto-creates the "Session Log" SharePoint list
3. **Verify** — log in, check that `/admin/sessions` shows your active session
4. **Test takeover** — open the app in two different browsers, sign in with the same account on both

## Session Log SharePoint List Schema

| Column | Type | Description |
|--------|------|-------------|
| `Title` | Text | Auto-generated: `Session-{uuid_prefix}` |
| `SessionId` | Text | UUID generated by SPA on page load |
| `UserEmail` | Text | User's email from validated token |
| `UserObjectId` | Text | Azure AD object ID (key for conflict detection) |
| `StartedAt` | DateTime | Session registration time |
| `LastActivityAt` | DateTime | Last heartbeat time |
| `UserAgent` | Text | Browser user agent string |
| `IPAddress` | Text | Client IP from `x-forwarded-for` |
| `IsActive` | Choice (Yes/No) | Whether session is currently active |
| `IsAdmin` | Choice (Yes/No) | Whether user is an HR Form Owner |
| `TakenOverBy` | Text | SessionId that took over (for audit trail) |

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Session store | SharePoint "Session Log" list | Consistent with existing architecture, no new infrastructure |
| Token validation | JWKS-based (Node `crypto`) | No external dependencies, works with existing MSAL tokens |
| Heartbeat interval | 5 minutes | Balances freshness with API call volume |
| Stale session timeout | 15 min without heartbeat | Allows for brief network interruptions |
| Inactivity timeout | 30 min | Industry standard for corporate apps |
| Tab close cleanup | `sendBeacon` via `beforeunload` | Reliable even during page unload |
| Guest exclusion | `isAuthenticated` check in hook | Guest users never hit session endpoints |
| Admin check | Dual: SPA sends `isAdmin` + API verifies via SharePoint group | Defense-in-depth |

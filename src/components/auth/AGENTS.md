# AGENTS.md — src/components/auth/

**Scope:** Auth UI screens and route guards for the Azure AD / Google guest-member auth state machine.

## Auth State Machine Mapping

Each `PageState` maps to a screen component rendered by `App.tsx`:

| State | Component | Purpose |
|-------|-----------|---------|
| `choice` | `ChoiceScreen` | Microsoft 365 sign-in, plus Google's own "Continue with Google" button |
| `member` | *(inline in App.tsx)* | Signed in as a guest member — its own small route table, everything else redirects to `/member`. Renders `GuestProfileSetupPage` **instead of** that table until the profile is complete |
| `guest` | `GuestLanding` | Anonymous browsing — **nobody is signed in**. Not to be confused with a *guest member*, who is |
| `loading` | `LoadingScreen` | Animated progress bar while fetching data |
| `restricted` | `RestrictedAccessScreen` | Signed-in account lacks SharePoint site access |
| `wrong_tenant` | `WrongTenantScreen` | Tenant mismatch error with sign-out |
| `error` | `ErrorScreen` | Generic error fallback; auth timeout recovery uses "Re-login" with visual recovery steps |
| `ready` | `AdminGuard` | Route guard for admin pages (not an auth state screen) |

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Auth choice | `ChoiceScreen.tsx` | Microsoft 365 primary + Google button. Fetches the admin background itself (unauthenticated read) since it renders before anyone is signed in |
| Guest session | `../../auth/useGuestSession.ts` | Stored session, cross-tab sync, expiry timer. Broadcasts `pmw-guest-session-changed` so a sign-out anywhere collapses the member route table |
| Google script | `../../auth/googleSignIn.ts` | Loads Google Identity Services once per page and renders their button. **Needs `https://accounts.google.com` in the CSP in BOTH `vercel.json` and `index.html`** — the intersection is enforced, so widening one changes nothing and the button silently never appears |
| Guest landing | `GuestLanding.tsx` | Public user landing page |
| Loading indicator | `LoadingScreen.tsx` | `LinearProgress` with fade-in animation |
| SharePoint access restriction | `RestrictedAccessScreen.tsx` | Shows site membership guidance with retry/switch/sign-out |
| Wrong tenant | `WrongTenantScreen.tsx` | Identity mismatch — shows current vs expected tenant |
| Error fallback | `ErrorScreen.tsx` | Catch-all error with configurable retry/re-login callback and optional visual recovery steps |
| Admin guard | `AdminGuard.tsx` | Wraps protected admin-style routes; shows "Access Denied" + 4s redirect to `/user/dashboard`. Builder routes pass a superuser restriction label. |
| Profile gate | `../../pages/GuestProfileSetupPage.tsx` | The blocking one-time form: full name, position, department. Rendered in place of the route table, not as a route in it, so no path reaches anything while it is outstanding |
| Member home | `../../pages/GuestMemberPage.tsx` | Their own record, learning-access state, and what they have submitted. Carries the PDPA notice about the access log |

## Conventions

- **Styling**: MUI components + `fadeInUp` animation imported from `../../theme`
- **fadeInUp**: Defined in `src/theme/index.ts` — keyframe animation used by ALL auth screens (slide up + fade in)
- **ThemeProvider**: Each auth screen wraps its own `<ThemeProvider theme={theme}>` — redundant with App.tsx's outer ThemeProvider but functional (MUI merges)
- **Props**: All screens receive simple props: `setPageState`, `onSignIn`, `onGuest`, `retry`, etc.
- **No ErrorBoundary**: Auth screens render OUTSIDE any ErrorBoundary — a crash here produces a white screen

## Anti-Patterns

- `ChoiceScreen.tsx` renders Google's button through a ref-held callback rather than a state-checked one. That is deliberate, not sloppiness: the button is rendered once on mount and captures its callback then, so a guard reading `signingIn` state would read the first render's value forever.
- `AdminGuard.tsx` receives the already-computed permission flag from `App.tsx` rather than checking group membership itself. Builder routes pass `canUseFormBuilder`; other admin routes pass `isAdmin`.
- `WrongTenantScreen.tsx` exposes `accounts[0]?.tenantId` (the current tenant) — this is visible to the user; acceptable for debugging

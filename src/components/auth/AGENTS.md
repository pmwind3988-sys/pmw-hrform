# AGENTS.md — src/components/auth/

**Scope:** Auth UI screens and route guards for the Azure AD / guest auth state machine.

## Auth State Machine Mapping

Each `PageState` maps to a screen component rendered by `App.tsx`:

| State | Component | Purpose |
|-------|-----------|---------|
| `choice` | `ChoiceScreen` | MSAL login vs guest decision (persisted to localStorage) |
| `guest` | `GuestLanding` | Guest mode entry point |
| `loading` | `LoadingScreen` | Animated progress bar while fetching data |
| `wrong_tenant` | `WrongTenantScreen` | Tenant mismatch error with sign-out |
| `error` | `ErrorScreen` | Generic error with "Try Again" button |
| `ready` | `AdminGuard` | Route guard for admin pages (not an auth state screen) |

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Auth choice | `ChoiceScreen.tsx` | MSAL vs guest toggle — note: checkbox state is NOT wired (decision always persisted) |
| Guest landing | `GuestLanding.tsx` | Public user landing page |
| Loading indicator | `LoadingScreen.tsx` | `LinearProgress` with fade-in animation |
| Wrong tenant | `WrongTenantScreen.tsx` | Identity mismatch — shows current vs expected tenant |
| Error fallback | `ErrorScreen.tsx` | Catch-all error with retry callback |
| Admin guard | `AdminGuard.tsx` | Wraps admin routes; shows "Access Denied" + 4s redirect to `/` |

## Conventions

- **Styling**: MUI components + `fadeInUp` animation imported from `../../theme`
- **fadeInUp**: Defined in `src/theme/index.ts` — keyframe animation used by ALL auth screens (slide up + fade in)
- **ThemeProvider**: Each auth screen wraps its own `<ThemeProvider theme={theme}>` — redundant with App.tsx's outer ThemeProvider but functional (MUI merges)
- **Props**: All screens receive simple props: `setPageState`, `onSignIn`, `onGuest`, `retry`, etc.
- **No ErrorBoundary**: Auth screens render OUTSIDE any ErrorBoundary — a crash here produces a white screen

## Anti-Patterns

- `ChoiceScreen.tsx` has `console.log("Choice clicked")` — remove
- `AdminGuard.tsx` receives `isAdmin` as prop from `App.tsx` rather than checking group membership itself (defense-in-depth backup only — real check is in `ApprovalDashboard` and other pages)
- `WrongTenantScreen.tsx` exposes `accounts[0]?.tenantId` (the current tenant) — this is visible to the user; acceptable for debugging

import { useCallback, useEffect, useState } from "react";
import {
  clearStoredGuestSession,
  readStoredGuestSession,
  storeGuestSession,
  type GuestSession,
} from "../utils/guestMemberService";

/**
 * The signed-in state of a guest member — the identity that stands in for
 * Microsoft 365 for people outside the company.
 *
 * Deliberately not an MSAL concept and not stored anywhere MSAL can see: these
 * two identity systems never merge, and where both are present the Microsoft
 * account wins (see `guestModeActive` in App.tsx).
 */
export interface GuestSessionState {
  session: GuestSession | null;
  signIn: (session: GuestSession) => void;
  signOut: () => void;
}

/**
 * `storage` events only reach *other* tabs, so a second component calling
 * `signOut()` in this one would leave every other instance — App.tsx's route
 * gate above all — still holding the old session. This event covers that gap.
 */
const SESSION_CHANGED_EVENT = "pmw-guest-session-changed";

export function useGuestSession(): GuestSessionState {
  const [session, setSession] = useState<GuestSession | null>(() => readStoredGuestSession());

  // Signing out in one tab has to sign out the others; leaving a second tab
  // holding a dead session would let it keep rendering the hub until its next
  // API call failed.
  useEffect(() => {
    const syncFromStorage = () => setSession(readStoredGuestSession());
    window.addEventListener("storage", syncFromStorage);
    window.addEventListener(SESSION_CHANGED_EVENT, syncFromStorage);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener(SESSION_CHANGED_EVENT, syncFromStorage);
    };
  }, []);

  // The API rejects an expired token anyway; this is what turns that into a
  // clean return to the sign-in screen instead of a page of failed requests.
  useEffect(() => {
    if (!session) return;

    const msRemaining = Date.parse(session.expiresAt) - Date.now();
    // An already-expired session goes through the same timer at zero delay
    // rather than setting state during the effect — same outcome one tick later,
    // without a cascading render. Unparseable counts as expired.
    //
    // The upper clamp matters too: setTimeout silently fires *immediately* past
    // the 32-bit ceiling, which on a long-lived session would sign the person
    // out the instant they arrived.
    const delay = Number.isFinite(msRemaining)
      ? Math.min(Math.max(msRemaining, 0), 2_147_483_647)
      : 0;

    const timer = window.setTimeout(() => {
      clearStoredGuestSession();
      setSession(null);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [session]);

  const signIn = useCallback((next: GuestSession) => {
    storeGuestSession(next);
    setSession(next);
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  }, []);

  const signOut = useCallback(() => {
    clearStoredGuestSession();
    setSession(null);
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  }, []);

  return { session, signIn, signOut };
}

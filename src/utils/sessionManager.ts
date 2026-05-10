/**
 * sessionManager.ts — SPA session lifecycle management
 *
 * Manages session registration, heartbeat, takeover detection,
 * inactivity timeout, and cleanup on tab close.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import type { IPublicClientApplication, AccountInfo } from "@azure/msal-browser";

// ── Types ──────────────────────────────────────────────────────────────

export type SessionState = "idle" | "registering" | "active" | "conflict" | "takenOver";

export interface ConflictInfo {
  startedAt: string;
  userAgent: string;
}

export interface UseSessionManagerProps {
  instance: IPublicClientApplication;
  accounts: AccountInfo[];
  isAuthenticated: boolean;
  isAdmin: boolean;
  isReady: boolean; // pageState === "ready"
}

export interface UseSessionManagerReturn {
  sessionState: SessionState;
  sessionId: string | null;
  conflictInfo: ConflictInfo | null;
  register: () => Promise<void>;
  takeover: () => Promise<void>;
  release: () => Promise<void>;
  reset: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────

const SESSION_STORAGE_KEY = "pmw_hr_session_id";
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const SP_SCOPE = (() => {
  try {
    const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
    return `${new URL(SP_SITE_URL).origin}/AllSites.Manage`;
  } catch {
    return "https://graph.microsoft.com/.default";
  }
})();

// ── Helpers ────────────────────────────────────────────────────────────

function generateSessionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function getStoredSessionId(): string {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // sessionStorage unavailable
  }
  const id = generateSessionId();
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, id);
  } catch {
    // ignore
  }
  return id;
}

async function getAccessToken(instance: IPublicClientApplication, accounts: AccountInfo[]): Promise<string> {
  const response = await instance.acquireTokenSilent({
    scopes: [SP_SCOPE],
    account: accounts[0],
  });
  return response.accessToken;
}

async function callApi(
  url: string,
  method: string,
  body: Record<string, unknown>,
  token: string
): Promise<Response> {
  return fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useSessionManager({
  instance,
  accounts,
  isAuthenticated,
  isAdmin,
  isReady,
}: UseSessionManagerProps): UseSessionManagerReturn {
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);
  const sessionIdRef = useRef<string>(getStoredSessionId());
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // ── Inactivity tracking ───────────────────────────────────────────

  const resetInactivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const startInactivityTracking = useCallback(() => {
    const events = ["mousedown", "keydown", "touchstart", "scroll", "click"];
    const handler = () => resetInactivityTimer();

    for (const ev of events) {
      window.addEventListener(ev, handler, { passive: true });
    }

    // Check inactivity every 30 seconds
    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        // Force logout due to inactivity
        setSessionState("takenOver"); // Treat as invalidated
        clearInterval(checkInterval);
      }
      // Could add warning toast at INACTIVITY_WARNING_MS here
    }, 30_000);

    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, handler);
      }
      clearInterval(checkInterval);
    };
  }, [resetInactivityTimer]);

  // ── Heartbeat ──────────────────────────────────────────────────────

  const startHeartbeat = useCallback((): (() => void) => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    const beat = async () => {
      try {
        if (sessionState !== "active") return;
        const token = await getAccessToken(instance, accounts);
        const res = await callApi(
          "/api/session/heartbeat",
          "POST",
          { sessionId: sessionIdRef.current },
          token
        );

        if (res.status === 409) {
          // Session was invalidated (taken over)
          setSessionState("takenOver");
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
          }
        }
      } catch {
        // Network error — try again next interval
      }
    };

    // Fire first heartbeat after 1 minute
    const firstTimeout = setTimeout(() => {
      beat();
      heartbeatIntervalRef.current = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    }, 60_000);

    return () => {
      clearTimeout(firstTimeout);
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [instance, accounts, sessionState]);

  // ── Register session ──────────────────────────────────────────────

  const doRegister = useCallback(
    async (force: boolean = false) => {
      if (!isAuthenticated || accounts.length === 0) return;

      setSessionState("registering");

      try {
        const token = await getAccessToken(instance, accounts);
        const res = await callApi("/api/session/register", "POST", {
          sessionId: sessionIdRef.current,
          isAdmin,
          force,
        }, token);

        if (res.ok) {
          setSessionState("active");
          setConflictInfo(null);
        } else if (res.status === 409) {
          const data = (await res.json()) as {
            error?: string;
            existing?: { startedAt: string; userAgent: string };
          };
          if (data.existing) {
            setConflictInfo(data.existing);
            setSessionState("conflict");
          } else {
            setSessionState("active"); // Stale session, treat as success
          }
        } else {
          // Registration failed — stay in idle to retry
          setSessionState("idle");
        }
      } catch {
        setSessionState("idle");
      }
    },
    [isAuthenticated, accounts, instance, isAdmin]
  );

  // ── Public API ─────────────────────────────────────────────────────

  const register = useCallback(() => doRegister(false), [doRegister]);
  const takeover = useCallback(() => doRegister(true), [doRegister]);

  const release = useCallback(async () => {
    try {
      if (accounts.length === 0) return;
      await getAccessToken(instance, accounts);
      const payload = JSON.stringify({ sessionId: sessionIdRef.current });
      navigator.sendBeacon(
        "/api/session/release",
        new Blob([payload], { type: "application/json" })
      );
    } catch {
      // Best-effort release
    }
    setSessionState("idle");
  }, [instance, accounts]);

  const reset = useCallback(() => {
    setSessionState("idle");
    setConflictInfo(null);
  }, []);

  // ── Lifecycle ──────────────────────────────────────────────────────

  // Register when user becomes ready
  useEffect(() => {
    if (isReady && isAuthenticated && sessionState === "idle") {
      doRegister(false);
    }
  }, [isReady, isAuthenticated, sessionState, doRegister]);

  // Start heartbeat when active
  useEffect(() => {
    if (sessionState === "active") {
      const cleanup = startHeartbeat();
      const cleanupInactivity = startInactivityTracking();
      return () => {
        cleanup?.();
        cleanupInactivity?.();
      };
    }
  }, [sessionState, startHeartbeat, startInactivityTracking]);

  // Release on unmount (tab close)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionState === "active") {
        const payload = JSON.stringify({ sessionId: sessionIdRef.current });
        navigator.sendBeacon(
          "/api/session/release",
          new Blob([payload], { type: "application/json" })
        );
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (sessionState === "active") {
        handleBeforeUnload();
      }
    };
  }, [sessionState]);

  return {
    sessionState,
    sessionId: sessionIdRef.current,
    conflictInfo,
    register,
    takeover,
    release,
    reset,
  };
}

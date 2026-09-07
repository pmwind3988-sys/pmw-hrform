/**
 * Keeps unfinished work alive across a forced sign-in.
 *
 * When Microsoft 365 stops trusting the tab, the only way back is a full-page
 * redirect to the sign-in host — which throws away every answer typed so far
 * along with the rest of the page. This module lets a page hand over a small
 * snapshot of what the person has entered just before that redirect starts,
 * and pick it up again when they land back on the same address.
 *
 * Deliberately narrow: snapshots are taken only when a re-authentication is
 * actually beginning (never on ordinary navigation), they are tied to the exact
 * route that wrote them, they expire, and they are read exactly once.
 */

const STORAGE_PREFIX = "pmw_wip:";
/** A snapshot older than this belongs to a session nobody is coming back to. */
const MAX_AGE_MS = 30 * 60 * 1000;
/**
 * sessionStorage is a few megabytes for the whole origin, and an answer can
 * carry a signature or an attachment as a data URL. Anything past this is
 * dropped rather than risking a quota failure that loses the small answers too.
 */
const MAX_SNAPSHOT_BYTES = 512 * 1024;
/** A single value bigger than this is an upload, not something worth keeping. */
const MAX_VALUE_BYTES = 32 * 1024;

type SnapshotProvider = () => unknown;

type StoredSnapshot = {
  route: string;
  savedAt: number;
  data: unknown;
};

const providers = new Map<string, SnapshotProvider>();

function currentRoute(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname + window.location.search;
}

function storageKey(key: string): string {
  return STORAGE_PREFIX + key;
}

/**
 * Register what this page would want back after a forced sign-in. Returns the
 * unregister function, so a component can call it straight from an effect.
 *
 * The provider is called at most once, at the moment a redirect begins, so it
 * can be re-registered on every render without costing anything.
 */
export function registerWorkInProgress(key: string, provider: SnapshotProvider): () => void {
  providers.set(key, provider);
  return () => {
    if (providers.get(key) === provider) providers.delete(key);
  };
}

/**
 * Drops oversized entries — an attached file held as a data URL — so the typed
 * answers around them still fit. Returns null when even the trimmed snapshot is
 * too big to store.
 */
function serializeWithinBudget(snapshot: StoredSnapshot): string | null {
  try {
    const full = JSON.stringify(snapshot);
    if (full.length <= MAX_SNAPSHOT_BYTES) return full;
  } catch {
    return null;
  }

  const data = snapshot.data;
  if (!data || typeof data !== "object") return null;

  const trimmed: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(data as Record<string, unknown>)) {
    let encoded: string;
    try {
      encoded = JSON.stringify(value) ?? "";
    } catch {
      continue;
    }
    if (encoded.length > MAX_VALUE_BYTES) continue;
    trimmed[field] = value;
  }

  try {
    const reduced = JSON.stringify({ ...snapshot, data: trimmed });
    return reduced.length <= MAX_SNAPSHOT_BYTES ? reduced : null;
  } catch {
    return null;
  }
}

/**
 * Take a snapshot from every registered page. Called immediately before a
 * sign-in redirect leaves the page.
 */
export function captureWorkInProgress(): void {
  if (typeof window === "undefined" || providers.size === 0) return;

  const route = currentRoute();
  for (const [key, provider] of providers) {
    let data: unknown;
    try {
      data = provider();
    } catch {
      continue;
    }
    if (data === null || data === undefined) continue;

    const serialized = serializeWithinBudget({ route, savedAt: Date.now(), data });
    if (!serialized) continue;

    try {
      sessionStorage.setItem(storageKey(key), serialized);
    } catch {
      // Private browsing, or the quota is gone. Losing the draft is the old
      // behaviour, so there is nothing to recover here.
    }
  }
}

/** Forget a snapshot without reading it. */
export function clearWorkInProgress(key: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(key));
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

/**
 * Read what this page saved before the sign-in, if it is still the same page
 * and still recent, and leave it where it is.
 *
 * For a component that can be mounted more than once before it is ready — one
 * that remounts when the form it is editing finally loads — reading without
 * removing means an early mount cannot eat the draft the real one needs.
 * Whoever offers it to the person is then responsible for clearing it.
 */
export function peekWorkInProgress<T = unknown>(key: string): T | null {
  if (typeof window === "undefined") return null;

  let raw: string | null;
  try {
    raw = sessionStorage.getItem(storageKey(key));
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.route !== currentRoute()) return null;
    if (!Number.isFinite(parsed.savedAt) || Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return (parsed.data ?? null) as T | null;
  } catch {
    return null;
  }
}

/**
 * Read back what this page saved before the sign-in, if it is still the same
 * page and still recent. Removes it either way, so a later reload starts clean.
 */
export function consumeWorkInProgress<T = unknown>(key: string): T | null {
  const data = peekWorkInProgress<T>(key);
  clearWorkInProgress(key);
  return data;
}

/** Test seam — forgets every registration without touching storage. */
export function resetWorkInProgressRegistry(): void {
  providers.clear();
}

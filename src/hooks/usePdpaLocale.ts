import { useCallback, useSyncExternalStore } from "react";
import {
  getPdpaContent,
  isPdpaLocale,
  PDPA_DEFAULT_LOCALE,
  type PdpaLocale,
  type PdpaNoticeContent,
} from "../utils/pdpa";

const STORAGE_KEY = "pmw_pdpa_locale";

const listeners = new Set<() => void>();

function readStored(): PdpaLocale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isPdpaLocale(stored)) return stored;
  } catch {
    // Private mode or blocked storage — fall through to the default.
  }
  return PDPA_DEFAULT_LOCALE;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Keep other tabs in step so a person cannot consent in one language while
  // reading the notice in another.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function setStoredLocale(locale: PdpaLocale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Ignore — the in-memory notification below still updates this tab.
  }
  listeners.forEach((listener) => listener());
}

/**
 * The language the privacy notice and consent wording are shown in, shared
 * across the notice page and every consent checkbox and persisted so the choice
 * survives navigation between them.
 */
export function usePdpaLocale(): {
  locale: PdpaLocale;
  setLocale: (locale: PdpaLocale) => void;
  content: PdpaNoticeContent;
} {
  const locale = useSyncExternalStore(subscribe, readStored, () => PDPA_DEFAULT_LOCALE);
  const setLocale = useCallback((next: PdpaLocale) => setStoredLocale(next), []);
  return { locale, setLocale, content: getPdpaContent(locale) };
}

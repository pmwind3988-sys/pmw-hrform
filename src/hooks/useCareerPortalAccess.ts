import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import {
  acquireCareerPortalToken,
  fetchCareerPortalAccess,
  saveCareerPortalAccess,
} from "../utils/careersService";
import type { CareerPortalAccessSetting } from "../types";

const DEFAULT_SETTING: CareerPortalAccessSetting = { isPublic: true };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

/**
 * Reads and writes who the career portal is open to. Both calls go through the
 * admin API, so the hook only fetches while `enabled` — the caller opens that
 * gate when the settings dialog is shown rather than on every dashboard load.
 */
export function useCareerPortalAccess(isAdmin: boolean, enabled: boolean) {
  const { instance, accounts } = useMsal();
  const [setting, setSetting] = useState<CareerPortalAccessSetting>(DEFAULT_SETTING);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAdmin || !enabled || loaded) return;

    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      try {
        const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
        const accessToken = await acquireCareerPortalToken(instance, account);
        if (!accessToken) throw new Error("Sign in again to manage career portal access.");
        const nextSetting = await fetchCareerPortalAccess({ accessToken });
        if (cancelled) return;
        setSetting(nextSetting);
        setLoaded(true);
        setError("");
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [instance, isAdmin, enabled, loaded, accounts.length]);

  async function save(isPublic: boolean): Promise<CareerPortalAccessSetting> {
    if (!isAdmin) {
      throw new Error("Only HR Forms Owners can change career portal access.");
    }

    setSaving(true);
    try {
      const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
      const accessToken = await acquireCareerPortalToken(instance, account);
      if (!accessToken) throw new Error("Sign in again to manage career portal access.");
      const savedSetting = await saveCareerPortalAccess(isPublic, { accessToken });
      setSetting(savedSetting);
      setLoaded(true);
      setError("");
      return savedSetting;
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    } finally {
      setSaving(false);
    }
  }

  return { error, loaded, loading, save, saving, setting };
}

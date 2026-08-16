import { useCallback, useEffect, useRef } from "react";
import { fetchLearningViewCounts } from "../utils/learningService";
import type { LearningViewCounts } from "../types";

/**
 * How often a visible page asks for fresh numbers. Deliberately slow: your own
 * view already updates the moment it is recorded, so this tick only carries
 * *other people's* views, and a view is a rare, deliberate act rather than a
 * page impression. Every tick is a billed Vercel invocation, and there is
 * nothing here worth paying to learn twice a minute.
 */
const POLL_INTERVAL_MS = 60_000;

/**
 * Keeps the view counts on screen up to date without a reload.
 *
 * Polling, not a live connection: Vercel's serverless functions bill for the
 * time they are held open, so a push channel would mean paying for an idle
 * socket per reader all day to deliver a number that changes a few times a
 * week. A short request every {@link POLL_INTERVAL_MS} costs nothing between
 * ticks and reads the same list either way.
 *
 * Nothing polls while the tab is in the background — a page nobody is looking
 * at does not need fresh numbers — and returning to the tab refreshes at once,
 * so the counts are already current by the time they are read.
 *
 * Returns a manual refresh for callers that know something just changed.
 */
export function useLearningViewCounts(
  accessToken: string,
  enabled: boolean,
  apply: (counts: LearningViewCounts) => void,
): () => void {
  // Held in a ref so a caller can pass an inline function without restarting
  // the timer on every render.
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  }, [apply]);

  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    // A slow answer must not queue another request behind it: a tab that has
    // been open for hours would otherwise pile them up.
    if (!enabled || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      applyRef.current(await fetchLearningViewCounts(accessToken));
    } catch {
      // A stale number is not worth an error message. The next tick tries again.
    } finally {
      inFlightRef.current = false;
    }
  }, [accessToken, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    const timer = window.setInterval(refreshIfVisible, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [enabled, refresh]);

  return refresh;
}

/**
 * Folds polled counts into the materials already on screen, leaving every other
 * field alone — the media URLs in particular, which would otherwise be replaced
 * with equal-but-new strings and restart whatever is playing.
 *
 * A count never walks backwards: SharePoint can take a moment to index a row
 * just written, and a view recorded seconds ago must not blink out of the total
 * before it comes back.
 */
export function mergeViewCounts<T extends { id: string; viewCount: number; viewedByMe: boolean }>(
  materials: T[],
  data: LearningViewCounts,
): T[] {
  const viewed = new Set(data.viewedByMe);
  let changed = false;

  const next = materials.map((material) => {
    const viewCount = Math.max(data.counts[material.id] ?? 0, material.viewCount);
    const viewedByMe = material.viewedByMe || viewed.has(material.id);
    if (viewCount === material.viewCount && viewedByMe === material.viewedByMe) return material;
    changed = true;
    return { ...material, viewCount, viewedByMe };
  });

  // Same array back when nothing moved, so React skips the re-render entirely.
  return changed ? next : materials;
}

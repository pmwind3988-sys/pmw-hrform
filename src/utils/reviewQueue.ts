/**
 * reviewQueue.ts — the browser half of "Waiting for me".
 *
 * The list is built by the server (`GET /api/evaluate?action=my-queue`, see
 * `api/_utils/reviewQueue.ts`) from the caller's verified Microsoft token, so
 * it can only ever be the caller's own work. Every entry opens the ordinary
 * signed-in reviewer page (in a window, see `ReviewWindow`), where the server
 * checks the assignment again.
 */
import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";

import { apiIdentityHeaders } from "./apiIdentity";

export interface ReviewQueueEntry {
  formTitle: string;
  formSlug: string;
  responseItemId: string;
  layerNumber: number;
  layerType: "approval" | "evaluation";
  layerTitle: string;
  referenceNo: string;
  applicantName: string;
  submittedBy: string;
  waitingSince: string;
  /** App-relative, e.g. `/eval/training-evaluation/42/2`. */
  link: string;
}

export async function fetchReviewQueue(
  instance: IPublicClientApplication,
  account: AccountInfo | undefined,
): Promise<ReviewQueueEntry[]> {
  const res = await fetch("/api/evaluate?action=my-queue", {
    headers: await apiIdentityHeaders(instance, account),
  });
  const json = (await res.json().catch(() => ({}))) as { items?: ReviewQueueEntry[]; error?: string };
  if (!res.ok) throw new Error(json.error || "Could not load your waiting requests.");
  return Array.isArray(json.items) ? json.items : [];
}

/** How long ago, in words a reviewer reads at a glance. */
export function waitingLabel(iso: string, now = new Date()): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "—";
  const days = Math.floor((now.getTime() - time) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

import type { LayerConfig } from "../types";

/**
 * Whether the browser should work out who each approval layer goes to, or leave
 * that to the API.
 *
 * A public respondent's copy of the workflow has had `assignee`, `publicToken`
 * and the approver mailboxes taken out of it — see
 * `api/_utils/publicLayerConfig.ts`, which must not hand those to anyone who can
 * load a published form. So the browser cannot route an anonymous submission
 * even in principle, and it does not need to: `applyLayerConfigWorkflow` in
 * `api/submit-form.ts` routes it from the server's own unredacted copy and
 * overwrites whatever the browser sent.
 *
 * Signed-in staff read the master list from SharePoint under their own
 * permissions, so their config still carries the assignees and the browser
 * resolves them. Where that read fails the page drops its token and submits as a
 * public respondent, which lands back on the deferred path.
 */
export interface LayerRoutingPlan {
  /** Leave layer routing to `api/submit-form.ts`. */
  deferToApi: boolean;
  /** Branch workflows start unrouted, until an HR Forms Owner picks a branch. */
  hasManualBranches: boolean;
}

export function planLayerRouting(
  layerConfig: LayerConfig | null | undefined,
  { hasToken }: { hasToken: boolean },
): LayerRoutingPlan {
  const hasManualBranches = (layerConfig?.manualBranches?.length ?? 0) > 0;
  const hasLayers = (layerConfig?.layers?.length ?? 0) > 0;

  return {
    deferToApi: !hasToken && (hasLayers || hasManualBranches),
    hasManualBranches,
  };
}

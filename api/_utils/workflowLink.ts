/**
 * workflowLink.ts — builds the per-item link a workflow email sends out.
 *
 * Approval layers get `/approval/...`, evaluation layers get `/eval/...`, so the
 * URL names what the recipient is being asked to do. Both prefixes mount the
 * same page, which resolves the layer type from the data either way — the label
 * is for the human, not the router.
 *
 * A public link also carries `k` — the value minted for that one submission
 * when it reached the layer, stored on the record as `L{n}_LinkToken`. The
 * item id beside it says which record to fetch; `k` is what proves the link
 * was issued for it. Without that, counting the id up read every other
 * submission to the same form. See `api/_utils/layerItemAccess.ts`.
 *
 * `src/utils/workflowLink.ts` is the client-side copy of this file; api/ cannot
 * import from src/. Keep the two in step.
 */

export type WorkflowRoutePrefix = "approval" | "eval";

export interface WorkflowReviewLinkParams {
  baseUrl: string;
  layerType: string | undefined;
  authMode: string | undefined;
  publicToken: string | undefined;
  formSlug: string;
  responseItemId: string | number;
  layerNumber: number;
  /**
   * `L{n}_LinkToken` for this submission. Public layers only; a link built
   * without one is refused at the far end rather than opening the record.
   */
  linkToken?: string | undefined;
}

export function workflowRoutePrefix(layerType: string | undefined): WorkflowRoutePrefix {
  return layerType === "evaluation" ? "eval" : "approval";
}

export function buildWorkflowReviewLink(params: WorkflowReviewLinkParams): string {
  const prefix = workflowRoutePrefix(params.layerType);
  const token = (params.publicToken || "").trim();
  const itemId = encodeURIComponent(String(params.responseItemId));
  // The token form carries the item as a query param, not a path segment — the
  // token identifies the layer, the item says which submission.
  if (params.authMode === "public" && token) {
    const linkToken = (params.linkToken || "").trim();
    const binding = linkToken ? `&k=${encodeURIComponent(linkToken)}` : "";
    return `${params.baseUrl}/${prefix}/${encodeURIComponent(token)}?item=${itemId}${binding}`;
  }
  return `${params.baseUrl}/${prefix}/${encodeURIComponent(params.formSlug)}/${itemId}/${params.layerNumber}`;
}

/**
 * The same link with its prefix corrected to match the layer type.
 *
 * A scheduled evaluation email stores its link in SharePoint and the cron posts
 * that stored string as it stands, months later. Links written before approval
 * and evaluation prefixes were split all say `/eval/...`, so without this the
 * cron keeps delivering the old shape long after the split — and the reviewer
 * page now refuses a link whose prefix disagrees with its layer.
 *
 * Only the two known prefixes are rewritten. Anything else is left exactly as
 * stored: it is not a link this function understands, and guessing at it would
 * be worse than passing it through.
 */
export function withWorkflowRoutePrefix(link: string, layerType: string | undefined): string {
  const prefix = workflowRoutePrefix(layerType);
  return link.replace(
    /^((?:https?:\/\/[^/]+)?)\/(?:approval|eval)\//,
    (_match, origin: string) => `${origin}/${prefix}/`,
  );
}

/**
 * When this app started telling the two link shapes apart.
 *
 * Before the prefixes were split, every workflow link said `/eval/...`
 * whatever kind of step it opened, so an approval link in that shape is a real
 * one a real approver may still hold. After it, no approval link was ever
 * issued that way again.
 *
 * Compared against *the submission*, not against today: a request raised after
 * this could never have been sent an old-shape approval link, so refusing one
 * is safe immediately and stays safe, while an older request keeps working for
 * as long as it lives. A cutoff on today's date instead meant every old link
 * died on one morning, and no one could tell in advance who that would strand.
 */
export const PREFIX_SPLIT_SAFE_FROM = new Date("2026-08-05T00:00:00Z");

/**
 * Whether a link with this prefix may open a layer of this type.
 *
 * The prefix and the layer number sit side by side in an address a reviewer can
 * edit, so a link whose two halves disagree was edited rather than issued. It
 * is a second barrier standing behind the assignment check, never a substitute:
 * an unreadable date or an unknown layer type allows, because this should not
 * be the thing that turns a real reviewer away on its own.
 */
export function routePrefixAllowsLayerType(
  prefix: string,
  layerType: string | undefined,
  submissionCreatedAt?: unknown,
): boolean {
  if (!layerType) return true;
  if (prefix === "approval") return layerType !== "evaluation";
  // Anything other than the two known shapes is the caller not saying, which
  // is not evidence of an edit. A caller that omits it — an older cached page,
  // a surface not yet passing it — must not have its approvers refused.
  if (prefix !== "eval") return true;
  if (layerType === "evaluation") return true;
  const created = Date.parse(String(submissionCreatedAt ?? ""));
  if (!Number.isFinite(created)) return true;
  return created < PREFIX_SPLIT_SAFE_FROM.getTime();
}

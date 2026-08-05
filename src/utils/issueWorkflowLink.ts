/**
 * Public review links, issued from the browser.
 *
 * A public layer's link is HMAC-signed with a server-only secret, so the
 * dashboard cannot compose one itself — it asks `api/workflow-link.ts`, which
 * refuses unless the named layer really is public and the submission is
 * currently sitting on it.
 *
 * `revokeExisting` bumps that layer's revocation serial first, which kills every
 * link previously issued for it. Use it when reissuing because the old link
 * went astray; leave it off for an ordinary resend, where the recipient may
 * well still be holding a working link.
 */
import { buildWorkflowReviewLink } from "./workflowLink";

const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";

export interface IssueWorkflowReviewLinkParams {
  formSlug: string;
  responseItemId: number;
  layerNumber: number;
  layerType: string | undefined;
  authMode: string | undefined;
  revokeExisting?: boolean;
}

/**
 * Returns the review link for one layer of one submission.
 *
 * Non-public layers never leave the browser: their link is a plain route that
 * `buildWorkflowReviewLink` composes locally.
 */
export async function issueWorkflowReviewLink(params: IssueWorkflowReviewLinkParams): Promise<string> {
  const localLink = buildWorkflowReviewLink({
    baseUrl: window.location.origin,
    layerType: params.layerType,
    authMode: params.authMode,
    publicToken: "",
    formSlug: params.formSlug,
    responseItemId: params.responseItemId,
    layerNumber: params.layerNumber,
  });
  if (params.authMode !== "public") return localLink;

  if (!params.formSlug.trim()) {
    throw new Error("A published form slug is needed to issue a public review link.");
  }

  const response = await fetch(`${window.location.origin}/api/workflow-link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
    },
    body: JSON.stringify({
      slug: params.formSlug,
      responseItemId: params.responseItemId,
      layerNumber: params.layerNumber,
      ...(params.revokeExisting ? { revokeExisting: true } : {}),
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "Could not issue a review link for this layer.");
  }
  const payload = await response.json() as { reviewLink?: unknown };
  return typeof payload.reviewLink === "string" && payload.reviewLink ? payload.reviewLink : localLink;
}

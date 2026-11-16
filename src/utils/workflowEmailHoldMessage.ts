/**
 * workflowEmailHoldMessage.ts — what an admin is told when the routing check
 * kept a request email from going out (`api/send-email.ts` answered `held`).
 *
 * One wording for every dashboard action that sends a request, so a resend and
 * a reassignment never describe the same hold differently.
 */

export function workflowEmailHoldMessage(hold: { reason: string; checkFailed: boolean }): string {
  if (hold.checkFailed) {
    return "Not sent: the routing check could not run. It will be retried on the next daily run.";
  }
  const reason = hold.reason.trim().replace(/[.\s]+$/, "") || "routing has no answer for this step";
  return `Not sent: ${reason}. The step is on hold until routing is set.`;
}

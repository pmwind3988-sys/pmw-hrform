/**
 * Browser side of the two admin actions on /api/submit-form that tie public-link
 * submissions to people in the Approval Directory. Both take the admin's own
 * SharePoint token; the server checks they are an HR Forms Owner.
 */
const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";

export interface RelinkSummary {
  formsScanned: number;
  submissionsChecked: number;
  linked: number;
  unmatched: number;
  skippedForms: string[];
  incomplete: boolean;
}

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch("/api/submit-form", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status}).`);
  return data;
}

/** Re-scan every public submission nobody has been linked to yet. */
export async function relinkPublicSubmissions(delegatedToken: string): Promise<RelinkSummary> {
  return (await post({ action: "relink-public-submissions", delegatedToken })) as unknown as RelinkSummary;
}

/**
 * Correct one submission. `person` is a directory email or staff number; blank
 * removes the link and stops a later re-scan from putting it back.
 */
export async function setSubmissionLink(params: {
  delegatedToken: string;
  listTitle: string;
  itemId: string;
  person: string;
}): Promise<{ linkedTo: string }> {
  const data = await post({ action: "set-submission-link", ...params });
  return { linkedTo: typeof data.linkedTo === "string" ? data.linkedTo : "" };
}

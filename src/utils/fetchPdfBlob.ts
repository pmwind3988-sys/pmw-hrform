import { sharePointFileFetchUrls } from "./sharePointUrl";

/**
 * Fetch a stored PDF so it can be shown inside the app rather than in a tab.
 *
 * It does NOT fetch the file's own library URL. That redirects, and a redirect
 * fails the CORS preflight outright -- measured against the live site, and not
 * a localhost quirk, since the deployed app is cross-origin to SharePoint too.
 * A preview built on the library URL would have said "unavailable" every single
 * time. `sharePointFileFetchUrls` supplies the `_api` routes that do work, and
 * they are tried in order because some tenants refuse bearer auth on the first.
 *
 * WHY THIS RETURNS A RESULT RATHER THAN THROWING. Even through `_api`, failure
 * is an ordinary outcome here: a tenant may refuse both routes. The caller's
 * job is then to fall back to opening the PDF in a tab -- which is what the app
 * did before there was a preview at all. Nothing should ever become less
 * reachable than it was.
 */

export type PdfFetchResult =
  | { ok: true; blob: Blob }
  | { ok: false; reason: string };

const GENERIC_FAILURE =
  "The preview could not be loaded from SharePoint. You can still open or download the file.";

export async function fetchPdfBlob(
  url: string,
  accessToken: string,
  fetcher: typeof fetch = fetch,
  siteUrl?: string,
): Promise<PdfFetchResult> {
  if (!url) return { ok: false, reason: "No PDF has been generated for this submission yet." };
  if (!accessToken) return { ok: false, reason: GENERIC_FAILURE };

  const candidates = sharePointFileFetchUrls(url, siteUrl ?? url);
  if (candidates.length === 0) return { ok: false, reason: GENERIC_FAILURE };

  let lastDetail = "";

  for (const candidate of candidates) {
    try {
      const response = await fetcher(candidate, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        lastDetail = ` (HTTP ${response.status})`;
        continue;
      }

      const blob = await response.blob();

      // A tenant that will not honour the token can answer 200 with an HTML
      // sign-in page. Rendering that in the iframe would show the user a login
      // form where their document should be, which is worse than saying so.
      if (blob.type && blob.type.includes("text/html")) {
        lastDetail = "";
        continue;
      }

      // An iframe handed a zero-byte blob paints a blank white page and reports
      // nothing, which reads as an empty document rather than a failed fetch.
      if (!blob.size) {
        lastDetail = "";
        continue;
      }

      return { ok: true, blob };
    } catch {
      lastDetail = "";
    }
  }

  return { ok: false, reason: `${GENERIC_FAILURE}${lastDetail}` };
}

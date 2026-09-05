/**
 * sharePointUrl.ts — turning a stored SharePoint path into a link a browser can open.
 *
 * SharePoint hands back **server-relative** paths for uploaded files —
 * `/sites/PMWHRDocs/Form PDFs/ZZ_TEST_RUN_8.pdf` — and that is what gets stored
 * in `PdfUrl`. It is the right thing to store, because it survives the tenant
 * being renamed, but it is not something you can put in an `href`.
 *
 * Two ways to get this wrong, and this app has managed both:
 *
 * 1. Use the path as-is. The browser resolves it against whatever origin the
 *    page is on — the Vercel app — and the user gets a 404 from Vercel for a
 *    file that is sitting safely in SharePoint.
 * 2. Prefix the whole site URL rather than its origin. `SP_SITE_URL` already
 *    ends in `/sites/PMWHRDocs`, and the stored path starts with it, so you get
 *    `/sites/PMWHRDocs/sites/PMWHRDocs/...` — also a 404, and a more confusing
 *    one because the host is right.
 *
 * Only the ORIGIN belongs in front of a server-relative path.
 */

/**
 * Makes a stored SharePoint path absolute.
 *
 * Already-absolute URLs (and `data:` URLs) are returned untouched, so this is
 * safe to apply to a value that may be either. An unparseable site URL leaves
 * the path as it was rather than producing a link to a nonsense host.
 *
 * @param pathOrUrl A server-relative path, or an absolute URL.
 * @param siteUrl The SharePoint site URL to take the origin from.
 */
export function absoluteSharePointUrl(pathOrUrl: string | undefined, siteUrl: string | undefined): string {
  const value = (pathOrUrl ?? "").trim();
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:")) {
    return value;
  }
  try {
    const origin = new URL(siteUrl ?? "").origin;
    return `${origin}${value.startsWith("/") ? "" : "/"}${value}`;
  } catch {
    // No usable site URL — better to hand back the path than invent a host.
    return value;
  }
}

/**
 * The URLs to try when FETCHING a stored SharePoint file, in order.
 *
 * A file's own library URL is fine in an `href` — the browser follows its
 * redirect and sends cookies — but it cannot be `fetch`ed cross-origin. The
 * redirect fails the CORS preflight outright:
 *
 *   Access to fetch at '.../Form PDFs/ZZ_TEST_RUN_8.pdf' has been blocked by
 *   CORS policy: Response to preflight request doesn't pass access control
 *   check: Redirect is not allowed for a preflight request.
 *
 * Measured against the live site, and it is not a localhost quirk: the deployed
 * app is cross-origin to SharePoint too. Anything fetching a file by its
 * library URL therefore never works.
 *
 * The `_api` endpoints do work — the whole app reads lists through them with a
 * bearer token — so a file is fetched through `getFileByServerRelativePath`
 * instead. `download.aspx` follows as a second attempt because some tenants do
 * not honour bearer auth on `/$value` and answer 401, or redirect to an HTML
 * sign-in page while still returning 200; that is the same two-step
 * `generateFormPdf.ts` already relies on.
 *
 * @param pathOrUrl A server-relative path or an absolute SharePoint URL.
 * @param siteUrl The site the file lives on.
 */
export function sharePointFileFetchUrls(
  pathOrUrl: string | undefined,
  siteUrl: string | undefined,
): string[] {
  const serverRelativePath = serverRelativeSharePointPath(pathOrUrl, siteUrl);
  const site = (siteUrl ?? "").replace(/\/$/, "");
  if (!serverRelativePath || !site) return [];

  return [
    `${site}/_api/web/getFileByServerRelativePath(decodedurl='${encodeServerRelativePathParam(serverRelativePath)}')/$value`,
    `${site}/_layouts/15/download.aspx?SourceUrl=${encodeURIComponent(serverRelativePath)}`,
  ];
}

/**
 * The server-relative path of a stored file, whether it arrives absolute or
 * already relative. Returns "" for anything that is not a SharePoint path,
 * including `data:` URLs, so a caller cannot build a request out of nonsense.
 */
export function serverRelativeSharePointPath(
  pathOrUrl: string | undefined,
  siteUrl: string | undefined,
): string {
  const value = (pathOrUrl ?? "").trim();
  if (!value || value.startsWith("data:")) return "";

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const parsed = new URL(value);
      const siteOrigin = new URL(siteUrl ?? "").origin;
      // A URL on another host is not this tenant's file, and guessing a path
      // out of it would aim a token-bearing request somewhere unintended.
      if (parsed.origin !== siteOrigin) return "";
      return decodeURIComponent(parsed.pathname);
    } catch {
      return "";
    }
  }

  return value.startsWith("/") ? decodeURIComponent(value) : "";
}

/** Single quotes are the OData string delimiter, so they are doubled to escape. */
function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Percent-encodes a path for an OData `decodedurl='...'` parameter, leaving the
 * separators alone — encoding those would make SharePoint read the whole thing
 * as one filename.
 */
function encodeServerRelativePathParam(serverRelativeUrl: string): string {
  return encodeURIComponent(escapeODataString(serverRelativeUrl)).replace(/%2F/gi, "/");
}

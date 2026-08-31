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

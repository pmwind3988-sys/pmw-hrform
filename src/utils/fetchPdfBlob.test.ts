import { describe, expect, it, vi } from "vitest";
import { fetchPdfBlob } from "./fetchPdfBlob";

const SITE = "https://tenant.sharepoint.com/sites/HRDocs";
const FILE = `${SITE}/Form%20PDFs/ZZ_TEST_RUN_8.pdf`;

function pdfResponse(size = 1024) {
  return {
    ok: true,
    status: 200,
    blob: async () => ({ size, type: "application/pdf" }) as Blob,
  } as unknown as Response;
}

function htmlResponse() {
  return {
    ok: true,
    status: 200,
    blob: async () => ({ size: 4096, type: "text/html" }) as Blob,
  } as unknown as Response;
}

function errorResponse(status: number) {
  return { ok: false, status, blob: async () => ({}) as Blob } as unknown as Response;
}

describe("fetchPdfBlob", () => {
  it("returns the blob when the file loads", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => pdfResponse());
    const result = await fetchPdfBlob(FILE, "token-1", fetcher, SITE);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.blob.size).toBe(1024);
  });

  /**
   * The whole reason this helper exists. Fetching the file's own library URL
   * fails its CORS preflight with "Redirect is not allowed for a preflight
   * request" — measured against the live site — so the request must go through
   * `_api`, which the rest of the app already uses cross-origin.
   */
  it("never requests the file's own library URL", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => pdfResponse());
    await fetchPdfBlob(FILE, "token-1", fetcher, SITE);
    const requested = fetcher.mock.calls[0][0] as string;
    expect(requested).not.toBe(FILE);
    expect(requested).toContain("/_api/web/getFileByServerRelativePath");
    // Spaces stay percent-encoded inside decodedurl='...'; the separators do
    // not, or SharePoint reads the whole path as a single filename.
    expect(requested).toContain("decodedurl='/sites/HRDocs/Form%20PDFs/ZZ_TEST_RUN_8.pdf'");
  });

  it("sends the bearer token", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => pdfResponse());
    await fetchPdfBlob(FILE, "token-1", fetcher, SITE);
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-1");
  });

  /**
   * Some tenants refuse bearer auth on `/$value`. `download.aspx` is a second,
   * independently-authed route — the same two-step `generateFormPdf` relies on.
   */
  it("falls back to download.aspx when the REST route is refused", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(401))
      .mockResolvedValueOnce(pdfResponse());
    const result = await fetchPdfBlob(FILE, "token-1", fetcher, SITE);
    expect(result.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0] as string).toContain("/_layouts/15/download.aspx");
  });

  /**
   * A tenant that will not honour the token can answer 200 with a sign-in page.
   * Showing that in the iframe would put a login form where the document should
   * be, which is worse than admitting the preview failed.
   */
  it("rejects an HTML sign-in page served as 200", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => htmlResponse());
    const result = await fetchPdfBlob(FILE, "token-1", fetcher, SITE);
    expect(result.ok).toBe(false);
  });

  it("reports a failure instead of throwing when both routes are blocked", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    const result = await fetchPdfBlob(FILE, "token-1", fetcher, SITE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/could not be loaded/i);
  });

  it("reports a failure when every route errors", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => errorResponse(404));
    const result = await fetchPdfBlob(FILE, "token-1", fetcher, SITE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("404");
  });

  it("treats an empty body as a failure", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => pdfResponse(0));
    const result = await fetchPdfBlob(FILE, "token-1", fetcher, SITE);
    expect(result.ok).toBe(false);
  });

  it("refuses to fetch without a url", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => pdfResponse());
    const result = await fetchPdfBlob("", "token-1", fetcher, SITE);
    expect(result.ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses to fetch without a token", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => pdfResponse());
    const result = await fetchPdfBlob(FILE, "", fetcher, SITE);
    expect(result.ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  /**
   * A URL on another host is not this tenant's file. Building a request from it
   * would aim a token-bearing fetch somewhere unintended.
   */
  it("refuses a file on a different host", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => pdfResponse());
    const result = await fetchPdfBlob("https://elsewhere.example/a.pdf", "token-1", fetcher, SITE);
    expect(result.ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("accepts an already server-relative path", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => pdfResponse());
    const result = await fetchPdfBlob("/sites/HRDocs/Form PDFs/a.pdf", "token-1", fetcher, SITE);
    expect(result.ok).toBe(true);
    expect(fetcher.mock.calls[0][0] as string).toContain("/_api/web/getFileByServerRelativePath");
  });
});

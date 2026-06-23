import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveJobListingColumns, setSharePointRestField } from "../job-admin";

describe("resolveJobListingColumns", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses writable Title instead of the read-only LinkTitle display column", () => {
    const columns = resolveJobListingColumns({
      byDisplay: {
        Title: "LinkTitle",
      },
      byInternal: {
        Title: "Title",
        LinkTitle: "LinkTitle",
      },
    });

    expect(columns.title).toBe("Title");
  });

  it("prefers the text Job Location column over an object-backed SharePoint Location column", () => {
    const columns = resolveJobListingColumns({
      byDisplay: {
        Location: "Location",
        "Job Location": "JobLocation",
      },
      byInternal: {
        Location: "Location",
        JobLocation: "JobLocation",
      },
      fieldTypes: {
        Location: 31,
        JobLocation: 2,
      },
    });

    expect(columns.location).toBe("JobLocation");
  });

  it("writes SharePoint lookup fields with the LookupId suffix", async () => {
    vi.resetModules();
    vi.stubEnv("SP_SITE_URL", "https://pmwgroupcom.sharepoint.com/sites/PMWHRDocs");
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/_api/web/lists(guid'company-list')/items")) {
        expect(url).toContain("Title+eq+%27PMW%27");
        return Response.json({ value: [{ Id: 12 }] });
      }
      return new Response("unexpected request", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const fields: Record<string, unknown> = {};
    const didSet = await setSharePointRestField(
      "sharepoint-token",
      fields,
      {
        byDisplay: { Company: "Company" },
        byInternal: { Company: "Company" },
        fieldTypes: { Company: 7 },
        lookupFields: {
          Company: {
            lookupList: "company-list",
            lookupField: "Title",
          },
        },
      },
      "Company",
      "PMW",
    );

    expect(didSet).toBe(true);
    expect(fields).toEqual({ CompanyId: 12 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("writes SharePoint URL fields as FieldUrlValue objects", async () => {
    const fields: Record<string, unknown> = {};

    const didSet = await setSharePointRestField(
      "sharepoint-token",
      fields,
      {
        byDisplay: { Website: "Website" },
        byInternal: { Website: "Website" },
        fieldTypes: { Website: 11 },
        lookupFields: {},
      },
      "Website",
      "https://example.com",
    );

    expect(didSet).toBe(true);
    expect(fields).toEqual({
      Website: {
        __metadata: { type: "SP.FieldUrlValue" },
        Url: "https://example.com",
        Description: "https://example.com",
      },
    });
  });
});

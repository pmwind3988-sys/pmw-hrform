import { afterEach, describe, expect, it, vi } from "vitest";
import { buildJobListingCreateFields, resolveJobListingColumns, setSharePointRestField } from "../job-admin";

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

  it("prefers the visible Location column when it is writable text", () => {
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
        Location: 2,
        JobLocation: 2,
      },
    });

    expect(columns.location).toBe("Location");
  });

  it("accepts a Choice Location column for the job location", () => {
    const columns = resolveJobListingColumns({
      byDisplay: {
        Location: "Location",
      },
      byInternal: {
        Location: "Location",
      },
      fieldTypes: {
        Location: 6,
      },
    });

    expect(columns.location).toBe("Location");
  });

  it("prefers the visible CustomFields column over an alternate Custom Fields column", () => {
    const columns = resolveJobListingColumns({
      byDisplay: {
        CustomFields: "CustomFields",
        "Custom Fields": "CustomFields0",
      },
      byInternal: {
        CustomFields: "CustomFields",
        CustomFields0: "CustomFields0",
      },
      fieldTypes: {
        CustomFields: 3,
        CustomFields0: 3,
      },
    });

    expect(columns.customFields).toBe("CustomFields");
  });

  it("matches SharePoint job listing columns without casing sensitivity", () => {
    const columns = resolveJobListingColumns({
      byDisplay: {
        LOCATION: "Location",
        "Application count": "ApplicationCount",
        Customfields: "Customfields",
      },
      byInternal: {
        Location: "Location",
        ApplicationCount: "ApplicationCount",
        Customfields: "Customfields",
      },
      fieldTypes: {
        Location: 2,
        ApplicationCount: 9,
        Customfields: 3,
      },
    });

    expect(columns.location).toBe("Location");
    expect(columns.applicationCount).toBe("ApplicationCount");
    expect(columns.customFields).toBe("Customfields");
  });

  it("builds create fields with location, application count, and custom questions", async () => {
    const columnMap = {
      byDisplay: {
        Title: "Title",
        Location: "Location",
        Status: "Status",
        "Application count": "ApplicationCount",
        Customfields: "Customfields",
      },
      byInternal: {
        Title: "Title",
        Location: "Location",
        Status: "Status",
        ApplicationCount: "ApplicationCount",
        Customfields: "Customfields",
      },
      fieldTypes: {
        Title: 2,
        Location: 6,
        Status: 6,
        ApplicationCount: 9,
        Customfields: 3,
      },
      lookupFields: {},
    };
    const customFields = [{ name: "portfolio", label: "Portfolio", type: "text", required: true }];
    const columns = resolveJobListingColumns(columnMap);

    const result = await buildJobListingCreateFields("sharepoint-token", columnMap, columns, {
      title: "Senior Analyst",
      location: "Kuala Lumpur",
      customFields,
    });

    expect(result.warnings).toEqual([]);
    expect(result.fields).toEqual({
      Title: "Senior Analyst",
      Location: "Kuala Lumpur",
      Status: "New",
      ApplicationCount: 0,
      Customfields: JSON.stringify(customFields),
    });
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

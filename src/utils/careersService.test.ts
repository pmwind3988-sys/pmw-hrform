import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJob } from "./careersService";

describe("fetchJob", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("fetches a single job by id so apply pages receive detail fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        jobs: [{
          id: "13",
          title: "Engineer",
          jobDescription: "",
          department: "",
          location: "",
          employmentType: "",
          closingDate: null,
          status: "New",
          applicationCount: 0,
          created: "",
          customFields: [{ name: "eligibility", label: "Eligibility", type: "textarea", required: true }],
        }],
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchJob("13")).resolves.toMatchObject({
      id: "13",
      customFields: [{ name: "eligibility", label: "Eligibility", type: "textarea", required: true }],
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/jobs-list?jobId=13", expect.any(Object));
  });
});

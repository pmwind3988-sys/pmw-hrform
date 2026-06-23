import { describe, expect, it } from "vitest";
import { resolveJobListingColumns } from "../job-admin";

describe("resolveJobListingColumns", () => {
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
});

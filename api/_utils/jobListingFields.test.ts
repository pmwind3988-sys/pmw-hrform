import { describe, expect, it } from "vitest";
import { parseJobCustomFields } from "./jobListingFields";

describe("parseJobCustomFields", () => {
  it("reads custom questions from the CustomFields internal name", () => {
    expect(parseJobCustomFields({
      CustomFields: JSON.stringify([{ name: "portfolio", label: "Portfolio", type: "text" }]),
    })).toEqual([{ name: "portfolio", label: "Portfolio", type: "text" }]);
  });

  it("reads custom questions from the SharePoint encoded Custom Fields internal name", () => {
    expect(parseJobCustomFields({
      Custom_x0020_Fields: JSON.stringify([{ name: "startDate", label: "Start date", type: "date" }]),
    })).toEqual([{ name: "startDate", label: "Start date", type: "date" }]);
  });

  it("reads custom questions from a resolved SharePoint internal column name", () => {
    expect(parseJobCustomFields({
      CustomFields0: JSON.stringify([{ name: "eligibility", label: "Eligibility", type: "textarea" }]),
    }, "CustomFields0")).toEqual([{ name: "eligibility", label: "Eligibility", type: "textarea" }]);
  });

  it("ignores missing, malformed, and non-array custom question payloads", () => {
    expect(parseJobCustomFields({})).toBeUndefined();
    expect(parseJobCustomFields({ CustomFields: "{bad json" })).toBeUndefined();
    expect(parseJobCustomFields({ CustomFields: JSON.stringify({ name: "not-array" }) })).toBeUndefined();
  });
});

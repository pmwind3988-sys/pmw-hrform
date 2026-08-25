import { describe, expect, it } from "vitest";

import { __test__ } from "./referenceCounter.js";

describe("test-run reference series", () => {
  it("counts a test run on a different row from the form's real one", () => {
    expect(__test__.counterTitleKey("Leave Application", true))
      .not.toBe(__test__.counterTitleKey("Leave Application", false));
  });

  it("keeps the production key exactly as it was, so live counters are untouched", () => {
    expect(__test__.counterTitleKey("Leave Application")).toBe("leave application");
    expect(__test__.counterTitleKey("Leave Application", false)).toBe("leave application");
  });

  it("marks a test reference so it is obvious in a subject line", () => {
    expect(__test__.testReferenceConfig({ prefix: "LA", pad: 4 })).toEqual({ prefix: "TEST-LA", pad: 4 });
  });

  it("still marks a test reference for a form that has no prefix of its own", () => {
    expect(__test__.testReferenceConfig({ prefix: "", pad: 4 })).toEqual({ prefix: "TEST", pad: 4 });
  });
});

import { describe, expect, it } from "vitest";
import { isJobApplicationSubmitDisabled } from "./jobApplySubmitState";

describe("isJobApplicationSubmitDisabled", () => {
  it("keeps submit clickable so form validation can show missing-field messages", () => {
    expect(isJobApplicationSubmitDisabled({
      submitting: false,
      alreadyApplied: false,
      adminOverrideMode: false,
    })).toBe(false);
  });

  it("only disables while submitting or blocked by a previous application", () => {
    expect(isJobApplicationSubmitDisabled({
      submitting: true,
      alreadyApplied: false,
      adminOverrideMode: false,
    })).toBe(true);

    expect(isJobApplicationSubmitDisabled({
      submitting: false,
      alreadyApplied: false,
      adminOverrideMode: false,
    })).toBe(false);

    expect(isJobApplicationSubmitDisabled({
      submitting: false,
      alreadyApplied: true,
      adminOverrideMode: false,
    })).toBe(true);

    expect(isJobApplicationSubmitDisabled({
      submitting: false,
      alreadyApplied: true,
      adminOverrideMode: true,
    })).toBe(false);
  });
});

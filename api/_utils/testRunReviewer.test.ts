import { describe, expect, it, vi } from "vitest";

import { testRunTesterMayAct, type TestRunReviewerDeps } from "./testRunReviewer.js";

const TEST_ROW = { IsTest: true, TestEmail: "Tester@pmw-group.com" };

function deps(overrides: Partial<{ email: string | null; superuser: boolean }> = {}): TestRunReviewerDeps {
  const email = overrides.email === undefined ? "tester@pmw-group.com" : overrides.email;
  return {
    resolveDelegatedUser: vi.fn(async () => (email === null ? null : { email, login: `i:0#.f|membership|${email}` })),
    isFormBuilderSuperuser: vi.fn(async () => overrides.superuser ?? true),
  };
}

describe("testRunTesterMayAct", () => {
  it("lets a superuser act on the test run they are the tester of", async () => {
    expect(await testRunTesterMayAct(TEST_ROW, "tester@pmw-group.com", "sp-token", deps())).toBe(true);
  });

  it("never opens a real submission, whatever the caller is", async () => {
    const d = deps();
    expect(await testRunTesterMayAct({ TestEmail: "tester@pmw-group.com" }, "tester@pmw-group.com", "sp-token", d)).toBe(false);
    expect(d.isFormBuilderSuperuser).not.toHaveBeenCalled();
  });

  it("refuses anyone but the run's own tester", async () => {
    expect(await testRunTesterMayAct(TEST_ROW, "someone.else@pmw-group.com", "sp-token", deps({ email: "someone.else@pmw-group.com" }))).toBe(false);
  });

  /**
   * The flag and the test address sit on the submission row, which a submitter
   * can edit. Marking your own request as a test must not let you approve it,
   * so the tester must also be a builder superuser — the only people who can
   * start a test run in the first place.
   */
  it("refuses a tester who is not a builder superuser", async () => {
    expect(await testRunTesterMayAct(TEST_ROW, "tester@pmw-group.com", "sp-token", deps({ superuser: false }))).toBe(false);
  });

  it("refuses without a SharePoint token to prove it", async () => {
    expect(await testRunTesterMayAct(TEST_ROW, "tester@pmw-group.com", "", deps())).toBe(false);
  });

  it("refuses a SharePoint token that belongs to somebody else", async () => {
    expect(await testRunTesterMayAct(TEST_ROW, "tester@pmw-group.com", "sp-token", deps({ email: "admin@pmw-group.com" }))).toBe(false);
    expect(await testRunTesterMayAct(TEST_ROW, "tester@pmw-group.com", "sp-token", deps({ email: null }))).toBe(false);
  });

  it("refuses a flagged row with no usable test address", async () => {
    expect(await testRunTesterMayAct({ IsTest: true, TestEmail: "not-an-address" }, "not-an-address", "sp-token", deps())).toBe(false);
  });
});

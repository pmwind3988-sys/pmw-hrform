import { describe, expect, it } from "vitest";
import { isSuperuserOnlyForm, withoutSuperuserOnlyForms, SUPERUSER_ONLY_FORM_TITLES } from "./superuserOnlyForms";
import * as server from "../../api/_utils/superuserOnlyForms";

describe("superuser-only forms", () => {
  it("recognises the test form however its title is spaced or cased", () => {
    expect(isSuperuserOnlyForm("ZZ TEST RUN")).toBe(true);
    expect(isSuperuserOnlyForm("  zz  test run ")).toBe(true);
  });

  it("leaves every other form alone, including lookalikes", () => {
    expect(isSuperuserOnlyForm("Leave Application")).toBe(false);
    expect(isSuperuserOnlyForm("ZZ TEST RUN Matrix inspection")).toBe(false);
    expect(isSuperuserOnlyForm("")).toBe(false);
    expect(isSuperuserOnlyForm(undefined)).toBe(false);
  });

  it("hides the form from everyone but a superuser", () => {
    const lists = [{ title: "Leave Application" }, { title: "ZZ TEST RUN" }];
    expect(withoutSuperuserOnlyForms(lists, false).map((l) => l.title)).toEqual(["Leave Application"]);
    expect(withoutSuperuserOnlyForms(lists, true)).toEqual(lists);
  });

  /*
    The browser hides, the server refuses. If the two lists drift, a form is
    either hidden but still openable, or refused while still listed.
  */
  it("matches the server's list exactly", () => {
    expect(server.SUPERUSER_ONLY_FORM_TITLES).toEqual(SUPERUSER_ONLY_FORM_TITLES);
    for (const title of ["ZZ TEST RUN", "zz test run", "Leave Application"]) {
      expect(server.isSuperuserOnlyForm(title)).toBe(isSuperuserOnlyForm(title));
    }
  });
});

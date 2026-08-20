import { describe, expect, it } from "vitest";
import { parseRecipientMatches } from "../recipientDirectory";

describe("parseRecipientMatches", () => {
  it("keeps the kind the directory reported", () => {
    expect(parseRecipientMatches({ matches: [
      { email: "ali@pmw.com", name: "Ali", kind: "user" },
      { email: "oshes@pmw.com", name: "OSHES", kind: "group" },
      { email: "safety@pmw.com", name: "Safety", kind: "shared" },
    ] }).map(m => m.kind)).toEqual(["user", "group", "shared"]);
  });

  it("treats an unrecognised kind as a plain user rather than dropping the person", () => {
    expect(parseRecipientMatches({ matches: [{ email: "a@pmw.com", name: "A", kind: "wat" }] })[0].kind)
      .toBe("user");
  });

  it("drops anything without a usable address", () => {
    expect(parseRecipientMatches({ matches: [
      { email: "not-an-email", name: "X", kind: "user" },
      { email: "", name: "Y", kind: "user" },
      { name: "Z", kind: "user" },
    ] })).toEqual([]);
  });

  it("falls back to the address when the directory has no display name", () => {
    expect(parseRecipientMatches({ matches: [{ email: "a@pmw.com", kind: "group" }] })[0].name)
      .toBe("a@pmw.com");
  });

  it("is empty rather than throwing on a shape it did not expect", () => {
    expect(parseRecipientMatches(null)).toEqual([]);
    expect(parseRecipientMatches({})).toEqual([]);
    expect(parseRecipientMatches({ matches: "nope" })).toEqual([]);
  });
});

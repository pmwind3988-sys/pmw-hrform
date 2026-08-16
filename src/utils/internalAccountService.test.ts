import { describe, expect, it } from "vitest";
import {
  generatePortalPassword,
  normalizePortalLoginId,
  suggestLoginId,
  MIN_PORTAL_PASSWORD_LENGTH,
} from "./internalAccountService";

describe("login ID normalisation", () => {
  it("matches what the server will store", () => {
    expect(normalizePortalLoginId("  Nurul.Aisyah  ")).toBe("nurul.aisyah");
    expect(normalizePortalLoginId("Ali_Bin-Ahmad")).toBe("ali_bin-ahmad");
  });

  it("drops characters that could confuse an OData filter", () => {
    expect(normalizePortalLoginId("ali' or 1=1")).toBe("alior11");
    expect(normalizePortalLoginId("ali'#$%")).toBe("ali");
    expect(normalizePortalLoginId("a b c")).toBe("abc");
  });

  it("folds case, so two spellings cannot become two people", () => {
    expect(normalizePortalLoginId("ALI")).toBe(normalizePortalLoginId("ali"));
  });
});

describe("login ID suggestion", () => {
  it("takes the first two words of a name", () => {
    expect(suggestLoginId("Nurul Aisyah binti Hamid")).toBe("nurul.aisyah");
    expect(suggestLoginId("Chong Wei")).toBe("chong.wei");
  });

  it("handles a single-word name", () => {
    expect(suggestLoginId("Rajan")).toBe("rajan");
  });

  it("survives extra spacing and punctuation", () => {
    expect(suggestLoginId("  Siti   Zaleha  ")).toBe("siti.zaleha");
    expect(suggestLoginId("O'Brien Kumar")).toBe("obrien.kumar");
  });

  it("returns nothing for an empty name rather than a stray dot", () => {
    expect(suggestLoginId("")).toBe("");
    expect(suggestLoginId("   ")).toBe("");
  });
});

describe("generated passwords", () => {
  it("clears the server's minimum length", () => {
    expect(generatePortalPassword().length).toBeGreaterThanOrEqual(MIN_PORTAL_PASSWORD_LENGTH);
  });

  it("avoids characters that are misread when read aloud", () => {
    // The person receiving this has five attempts before a lockout, so a
    // password containing l/1/O/0 costs a support call, not just a retry.
    for (let i = 0; i < 50; i += 1) {
      expect(generatePortalPassword()).not.toMatch(/[l1O0]/);
    }
  });

  it("passes the server's repetitiveness rule", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(new Set(generatePortalPassword()).size).toBeGreaterThanOrEqual(4);
    }
  });

  it("does not repeat itself", () => {
    const drawn = new Set(Array.from({ length: 100 }, () => generatePortalPassword()));
    expect(drawn.size).toBe(100);
  });
});

import { describe, expect, it } from "vitest";
import {
  defaultPublicAccessConfig,
  enabledIdentityFields,
  IDENTITY_EMAIL_KEY,
  isIdentityDomain,
  normalizePublicAccessConfig,
  validateDeclaredIdentity,
  writeDeclaredIdentityFields,
  type PublicIdentityField,
} from "./publicIdentity";

const field = (over: Partial<PublicIdentityField> & { key: string }): PublicIdentityField => ({
  label: over.key,
  type: "text",
  required: true,
  enabled: true,
  ...over,
});

const configWith = (fields: PublicIdentityField[], over: Partial<ReturnType<typeof defaultPublicAccessConfig>> = {}) => ({
  ...defaultPublicAccessConfig(),
  identityFields: fields,
  ...over,
});

describe("normalizePublicAccessConfig", () => {
  it("fills in every field for a layer authored before public access was configurable", () => {
    const config = normalizePublicAccessConfig(undefined);
    expect(config.linkTtlHours).toBe(168);
    expect(config.requireIdentity).toBe(true);
    expect(enabledIdentityFields(config).map((entry) => entry.key)).toEqual(["fullName", "email", "phone"]);
  });

  it("clamps a TTL outside the supported range", () => {
    expect(normalizePublicAccessConfig({ linkTtlHours: 0 }).linkTtlHours).toBe(168);
    expect(normalizePublicAccessConfig({ linkTtlHours: 99_999 }).linkTtlHours).toBe(8760);
    expect(normalizePublicAccessConfig({ linkTtlHours: 25.4 }).linkTtlHours).toBe(25);
  });

  // A builder who switched a field off meant it; merging the defaults back in
  // on read would silently resurrect it.
  it("keeps an authored field list as authored", () => {
    const config = normalizePublicAccessConfig({
      identityFields: [field({ key: "fullName", enabled: true }), field({ key: "phone", enabled: false })],
    });
    expect(config.identityFields.map((entry) => entry.key)).toEqual(["fullName", "phone"]);
    expect(enabledIdentityFields(config).map((entry) => entry.key)).toEqual(["fullName"]);
  });

  it("drops junk field entries and duplicate keys", () => {
    const config = normalizePublicAccessConfig({
      identityFields: [
        field({ key: "fullName" }),
        field({ key: "fullName", label: "dupe" }),
        { key: "9bad" },
        null,
        "nope",
      ],
    });
    expect(config.identityFields.map((entry) => entry.key)).toEqual(["fullName"]);
  });

  it("normalises domains and strips a leading @", () => {
    const config = normalizePublicAccessConfig({ allowedEmailDomains: ["@Company.com", "company.com", "", "partner.CO"] });
    expect(config.allowedEmailDomains).toEqual(["company.com", "partner.co"]);
  });
});

describe("validateDeclaredIdentity", () => {
  it("passes through untouched when the layer does not ask", () => {
    const result = validateDeclaredIdentity(configWith([], { requireIdentity: false }), undefined);
    expect(result).toEqual({ ok: true, errors: {}, identity: {}, email: "", name: "" });
  });

  it("names each missing required field", () => {
    const result = validateDeclaredIdentity(defaultPublicAccessConfig(), {});
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(["email", "fullName", "phone"]);
  });

  it("lets an optional field stay blank", () => {
    const config = configWith([field({ key: "fullName" }), field({ key: "company", required: false })]);
    const result = validateDeclaredIdentity(config, { fullName: "Ada Lovelace" });
    expect(result.ok).toBe(true);
    expect(result.identity).toEqual({ fullName: "Ada Lovelace" });
  });

  it("checks email and phone shape", () => {
    const config = configWith([
      field({ key: IDENTITY_EMAIL_KEY, type: "email" }),
      field({ key: "phone", type: "tel" }),
    ]);
    const bad = validateDeclaredIdentity(config, { email: "ada(at)example.com", phone: "12" });
    expect(Object.keys(bad.errors).sort()).toEqual(["email", "phone"]);

    const good = validateDeclaredIdentity(config, { email: "ada@example.com", phone: "+60 12-345 6789" });
    expect(good.ok).toBe(true);
  });

  it("lowercases the declared email but leaves the name as typed", () => {
    const result = validateDeclaredIdentity(defaultPublicAccessConfig(), {
      fullName: "Ada Lovelace",
      email: "Ada.Lovelace@Example.com",
      phone: "0123456789",
    });
    expect(result.email).toBe("ada.lovelace@example.com");
    expect(result.name).toBe("Ada Lovelace");
  });

  // The stored record should hold only what the builder asked for, whatever a
  // hand-crafted request sends.
  it("drops keys the layer never asked for", () => {
    const config = configWith([field({ key: "fullName" })]);
    const result = validateDeclaredIdentity(config, { fullName: "Ada", role: "admin", __proto__: "x" });
    expect(result.identity).toEqual({ fullName: "Ada" });
  });

  it("enforces the allowed email domains", () => {
    const config = configWith(
      [field({ key: IDENTITY_EMAIL_KEY, type: "email" })],
      { allowedEmailDomains: ["company.com"] },
    );
    expect(validateDeclaredIdentity(config, { email: "ada@other.com" }).ok).toBe(false);
    expect(validateDeclaredIdentity(config, { email: "ada@company.com" }).ok).toBe(true);
  });

  it("enforces a match against the layer's actor addresses when asked", () => {
    const config = configWith(
      [field({ key: IDENTITY_EMAIL_KEY, type: "email" })],
      { requireAssigneeEmailMatch: true },
    );
    const actorEmails = ["Reviewer@Company.com"];
    expect(validateDeclaredIdentity(config, { email: "someone@else.com" }, { actorEmails }).ok).toBe(false);
    expect(validateDeclaredIdentity(config, { email: "reviewer@company.com" }, { actorEmails }).ok).toBe(true);
  });

  it("does not block when the match is on but the layer has no actors yet", () => {
    const config = configWith(
      [field({ key: IDENTITY_EMAIL_KEY, type: "email" })],
      { requireAssigneeEmailMatch: true },
    );
    expect(validateDeclaredIdentity(config, { email: "ada@example.com" }, { actorEmails: [] }).ok).toBe(true);
  });

  it("reports a whole-form error when the layer asks but has nothing to ask for", () => {
    const result = validateDeclaredIdentity(configWith([field({ key: "fullName", enabled: false })]), {});
    expect(result.ok).toBe(false);
    expect(result.errors._form).toBeTruthy();
  });
});

describe("writeDeclaredIdentityFields", () => {
  it("writes the actor columns for a completed declaration", () => {
    const target: Record<string, unknown> = {};
    writeDeclaredIdentityFields(target, 2, validateDeclaredIdentity(defaultPublicAccessConfig(), {
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phone: "0123456789",
    }));

    expect(target.L2_ActedBy).toBe("ada@example.com");
    expect(target.L2_ActorName).toBe("Ada Lovelace");
    expect(JSON.parse(String(target.L2_ActorIdentity))).toEqual({
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phone: "0123456789",
    });
  });

  it("writes nothing when the layer collects nothing", () => {
    const target: Record<string, unknown> = {};
    writeDeclaredIdentityFields(target, 1, validateDeclaredIdentity(
      configWith([], { requireIdentity: false }),
      undefined,
    ));
    expect(target).toEqual({});
  });
});

describe("isIdentityDomain", () => {
  it("accepts bare domains and rejects the rest", () => {
    expect(isIdentityDomain("company.com")).toBe(true);
    expect(isIdentityDomain("mail.company.co.uk")).toBe(true);
    expect(isIdentityDomain("@company.com")).toBe(false);
    expect(isIdentityDomain("company")).toBe(false);
    expect(isIdentityDomain("https://company.com")).toBe(false);
  });
});

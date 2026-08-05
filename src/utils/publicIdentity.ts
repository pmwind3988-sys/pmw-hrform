/**
 * Public layer identity declaration.
 *
 * A layer set to `authMode: "public"` is actioned by whoever holds the link —
 * there is no 365 sign-in to read a name off. Instead the holder **declares**
 * who they are before the approve/reject/confirm buttons unlock, and that
 * declaration is stored on the response item so the audit trail and the PDF show
 * a person rather than "SYSTEM".
 *
 * Declared, not verified: nothing here proves the person owns the address they
 * typed. The security of a public layer comes from the signed, expiring,
 * single-use link (`api/_utils/publicGrant.ts`), not from this form. The two
 * optional restrictions below (`allowedEmailDomains`, `requireAssigneeEmailMatch`)
 * narrow what will be accepted, they do not authenticate it.
 *
 * Kept dependency-free so `api/_utils/publicIdentity.ts` can mirror it verbatim
 * for the serverless routes (same duplication pattern as `layerRecipients.ts`).
 */

export type PublicIdentityFieldType = "text" | "email" | "tel";

export interface PublicIdentityField {
  /** Stable storage key. Also the key used in the declared identity payload. */
  key: string;
  label: string;
  type: PublicIdentityFieldType;
  required: boolean;
  /** Off-by-default fields stay in the config so the builder can toggle them. */
  enabled: boolean;
}

export interface PublicAccessConfig {
  /** How long a freshly issued link stays valid, in hours. */
  linkTtlHours?: number;
  /** When false the holder may act without declaring anything. */
  requireIdentity?: boolean;
  identityFields?: PublicIdentityField[];
  /** Lowercase domains, no "@". Empty means any domain. */
  allowedEmailDomains?: string[];
  /** The declared email must be one of the layer's configured actor addresses. */
  requireAssigneeEmailMatch?: boolean;
}

/** Resolved form — every field present, safe to read without guards. */
export interface ResolvedPublicAccessConfig {
  linkTtlHours: number;
  requireIdentity: boolean;
  identityFields: PublicIdentityField[];
  allowedEmailDomains: string[];
  requireAssigneeEmailMatch: boolean;
}

export const DEFAULT_PUBLIC_LINK_TTL_HOURS = 168;
export const MIN_PUBLIC_LINK_TTL_HOURS = 1;
/** One year. Beyond this a "link" is really a standing credential. */
export const MAX_PUBLIC_LINK_TTL_HOURS = 8760;

/** The declared address recorded as `L{n}_ActedBy`. */
export const IDENTITY_EMAIL_KEY = "email";
/** The declared name recorded as `L{n}_ActorName`. */
export const IDENTITY_NAME_KEY = "fullName";

export const DEFAULT_PUBLIC_IDENTITY_FIELDS: readonly PublicIdentityField[] = [
  { key: IDENTITY_NAME_KEY, label: "Full name", type: "text", required: true, enabled: true },
  { key: IDENTITY_EMAIL_KEY, label: "Email address", type: "email", required: true, enabled: true },
  { key: "phone", label: "Contact number", type: "tel", required: true, enabled: true },
  { key: "company", label: "Company / organisation", type: "text", required: false, enabled: false },
  { key: "idNumber", label: "ID / staff no.", type: "text", required: false, enabled: false },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Deliberately loose — international numbers vary far too much to pin down. */
const PHONE_RE = /^[+()\d][\d\s()+.-]{5,31}$/;
export const IDENTITY_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const MAX_IDENTITY_VALUE_LENGTH = 200;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isIdentityEmail(value: unknown): boolean {
  return typeof value === "string" && EMAIL_RE.test(value.trim());
}

export function isIdentityPhone(value: unknown): boolean {
  return typeof value === "string" && PHONE_RE.test(value.trim());
}

export function isIdentityDomain(value: unknown): boolean {
  return typeof value === "string" && DOMAIN_RE.test(value.trim().toLowerCase());
}

export function defaultPublicAccessConfig(): ResolvedPublicAccessConfig {
  return {
    linkTtlHours: DEFAULT_PUBLIC_LINK_TTL_HOURS,
    requireIdentity: true,
    identityFields: DEFAULT_PUBLIC_IDENTITY_FIELDS.map((field) => ({ ...field })),
    allowedEmailDomains: [],
    requireAssigneeEmailMatch: false,
  };
}

function sanitizeIdentityField(raw: unknown, index: number): PublicIdentityField | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const key = asText(record.key);
  if (!IDENTITY_KEY_RE.test(key)) return null;
  const type = record.type === "email" || record.type === "tel" ? record.type : "text";
  return {
    key,
    label: asText(record.label) || `Field ${index + 1}`,
    type,
    required: record.required !== false,
    enabled: record.enabled !== false,
  };
}

function sanitizeIdentityFields(raw: unknown): PublicIdentityField[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const fields: PublicIdentityField[] = [];
  for (const [index, entry] of raw.entries()) {
    const field = sanitizeIdentityField(entry, index);
    if (!field) continue;
    const dedupeKey = field.key.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    fields.push(field);
  }
  return fields;
}

/**
 * Fills in every unset field so callers never guard.
 *
 * A stored `identityFields` array is used as authored rather than merged with
 * the defaults — a builder who switched a field off meant it, and re-adding it
 * on read would silently resurrect it.
 */
export function normalizePublicAccessConfig(raw: unknown): ResolvedPublicAccessConfig {
  const fallback = defaultPublicAccessConfig();
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fallback;
  const record = raw as Record<string, unknown>;

  const ttl = Number(record.linkTtlHours);
  const fields = sanitizeIdentityFields(record.identityFields);
  const domains = Array.isArray(record.allowedEmailDomains)
    ? record.allowedEmailDomains
        .map((entry) => asText(entry).toLowerCase().replace(/^@/, ""))
        .filter((entry, index, all) => entry !== "" && all.indexOf(entry) === index)
    : [];

  return {
    linkTtlHours: Number.isFinite(ttl) && ttl > 0
      ? Math.min(Math.max(Math.round(ttl), MIN_PUBLIC_LINK_TTL_HOURS), MAX_PUBLIC_LINK_TTL_HOURS)
      : fallback.linkTtlHours,
    requireIdentity: record.requireIdentity !== false,
    identityFields: fields.length > 0 ? fields : fallback.identityFields,
    allowedEmailDomains: domains,
    requireAssigneeEmailMatch: record.requireAssigneeEmailMatch === true,
  };
}

export function enabledIdentityFields(config: ResolvedPublicAccessConfig): PublicIdentityField[] {
  return config.identityFields.filter((field) => field.enabled);
}

export interface DeclaredIdentityResult {
  ok: boolean;
  /** Per-field messages, keyed by field key. `_form` carries whole-form errors. */
  errors: Record<string, string>;
  /** Only the enabled fields that were actually filled in, trimmed. */
  identity: Record<string, string>;
  /** Declared address, lowercased — written to `L{n}_ActedBy`. */
  email: string;
  /** Declared name — written to `L{n}_ActorName`. */
  name: string;
}

export interface DeclaredIdentityOptions {
  /** The layer's actor addresses, used only when `requireAssigneeEmailMatch`. */
  actorEmails?: readonly string[];
}

/**
 * Checks a declared identity payload against the layer's configuration.
 *
 * Unknown keys are dropped rather than rejected — the stored record should only
 * ever hold what the builder asked for, whatever a hand-crafted request sends.
 */
export function validateDeclaredIdentity(
  config: ResolvedPublicAccessConfig,
  declared: unknown,
  options: DeclaredIdentityOptions = {},
): DeclaredIdentityResult {
  const errors: Record<string, string> = {};
  const identity: Record<string, string> = {};
  const source = (typeof declared === "object" && declared !== null && !Array.isArray(declared))
    ? declared as Record<string, unknown>
    : {};

  if (!config.requireIdentity) {
    return { ok: true, errors, identity, email: "", name: "" };
  }

  const fields = enabledIdentityFields(config);
  if (fields.length === 0) {
    return {
      ok: false,
      errors: { _form: "This layer requires a declaration but has no fields configured." },
      identity,
      email: "",
      name: "",
    };
  }

  for (const field of fields) {
    const value = asText(source[field.key]).slice(0, MAX_IDENTITY_VALUE_LENGTH);
    if (!value) {
      if (field.required) errors[field.key] = `${field.label} is required.`;
      continue;
    }
    if (field.type === "email" && !isIdentityEmail(value)) {
      errors[field.key] = `Enter a valid email address.`;
      continue;
    }
    if (field.type === "tel" && !isIdentityPhone(value)) {
      errors[field.key] = `Enter a valid contact number.`;
      continue;
    }
    identity[field.key] = value;
  }

  const email = (identity[IDENTITY_EMAIL_KEY] || "").toLowerCase();

  if (email && config.allowedEmailDomains.length > 0) {
    const domain = email.slice(email.lastIndexOf("@") + 1);
    if (!config.allowedEmailDomains.includes(domain)) {
      errors[IDENTITY_EMAIL_KEY] = `Use an address ending in ${config.allowedEmailDomains
        .map((entry) => `@${entry}`)
        .join(" or ")}.`;
    }
  }

  if (email && config.requireAssigneeEmailMatch && !errors[IDENTITY_EMAIL_KEY]) {
    const actors = (options.actorEmails ?? []).map((entry) => entry.trim().toLowerCase());
    if (actors.length > 0 && !actors.includes(email)) {
      errors[IDENTITY_EMAIL_KEY] = "This link was issued to a different email address.";
    }
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    identity,
    email,
    name: identity[IDENTITY_NAME_KEY] || "",
  };
}

/**
 * Writes a completed public declaration onto a submission patch.
 *
 * `L{n}_ActedBy` is shared with the 365 path — one column answers "who
 * completed this layer" regardless of how they got in.
 */
export function writeDeclaredIdentityFields(
  target: Record<string, unknown>,
  layerNumber: number,
  result: DeclaredIdentityResult,
): void {
  if (result.email) target[`L${layerNumber}_ActedBy`] = result.email;
  if (result.name) target[`L${layerNumber}_ActorName`] = result.name;
  if (Object.keys(result.identity).length > 0) {
    target[`L${layerNumber}_ActorIdentity`] = JSON.stringify(result.identity);
  }
}

/**
 * Whose request this is, taken from the form rather than from the mailbox.
 *
 * `SubmittedBy` is whoever was signed in when the form was sent — often an HR
 * coordinator or a shared mailbox filing on somebody else's behalf, and on a
 * public form it is not a person at all. Naming that address in a notification
 * subject tells the approver nothing about the request in front of them, so the
 * answer preferred here is the name the form itself collected.
 *
 * `api/_utils/applicantName.ts` is the server's copy of this file; api/ cannot
 * import from src/, so keep the two field-key lists in step.
 *
 * Returns "" when the form collected no such field — the callers fall back to
 * the submitting identity rather than printing a gap.
 */

export const APPLICANT_NAME_FIELD_KEYS = new Set([
  "applicant",
  "applicantname",
  "employee",
  "employeename",
  "fullname",
  "name",
  "personname",
  "requester",
  "requestername",
  "requestor",
  "requestorname",
  "staff",
  "staffname",
  "submittedbyname",
  "submittedname",
  "submittername",
]);

const PLACEHOLDER_VALUES = new Set([
  "",
  "-",
  "--",
  "n/a",
  "na",
  "none",
  "not available",
  "not provided",
  "unknown",
  "unknown submitter",
  "unknown user",
  "guest",
  "authenticated-user",
  "public respondent",
]);

/** SharePoint encodes spaces and punctuation as `_x0020_` and friends. */
function normalizeFieldKey(key: string): string {
  return key
    .replace(/_x[0-9a-f]{4}_/gi, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function isPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_VALUES.has(normalized) || normalized.startsWith("untitled");
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function coerceText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((entry) => coerceText(entry)).filter(Boolean).join(", ");
  }
  if (typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of ["Title", "DisplayName", "displayName", "FullName", "Name", "name", "Value", "value", "Label", "Text", "text"]) {
    const text = coerceText(record[key]);
    if (text) return text;
  }
  return "";
}

export function resolveApplicantName(fields: Record<string, unknown> | undefined | null): string {
  if (!fields) return "";
  for (const [key, value] of Object.entries(fields)) {
    if (!APPLICANT_NAME_FIELD_KEYS.has(normalizeFieldKey(key))) continue;
    const text = coerceText(value);
    // An email in a "name" field is the identity again, not a person's name.
    if (!isPlaceholder(text) && !isEmailLike(text)) return text;
  }
  return "";
}

/**
 * PublicIdentityForm.tsx — "who are you?" for a public approval/evaluation link.
 *
 * A public layer has no 365 sign-in, so the link holder states who they are
 * before the decision buttons unlock. Errors surface per field as the person
 * types out of them, and the parent gates submission on `onValidityChange`.
 *
 * The same rules run again in `api/evaluate.ts` — this form is for the person
 * filling it in, not a security boundary.
 */
import { useEffect, useMemo, useState } from "react";
import {
  validateDeclaredIdentity,
  type PublicIdentityField,
  type ResolvedPublicAccessConfig,
} from "../utils/publicIdentity";

interface PublicIdentityFormProps {
  fields: PublicIdentityField[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  onValidityChange: (valid: boolean) => void;
  /** Server-reported errors from a rejected submission, keyed by field key. */
  serverErrors?: Record<string, string>;
  disabled?: boolean;
}

const COLORS = {
  purple: "#0078D4",
  border: "#D6DCE5",
  textPrimary: "#101010",
  textSecond: "#5F646D",
  textMuted: "#747B86",
  red: "#C62828",
  redPale: "#F8E4E4",
};

const INPUT_TYPE: Record<PublicIdentityField["type"], string> = {
  text: "text",
  email: "email",
  tel: "tel",
};

const AUTOCOMPLETE: Record<PublicIdentityField["type"], string> = {
  text: "on",
  email: "email",
  tel: "tel",
};

export default function PublicIdentityForm({
  fields,
  values,
  onChange,
  onValidityChange,
  serverErrors,
  disabled = false,
}: PublicIdentityFormProps) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Only the field list matters for validation here; the domain and
  // assignee-match rules are the server's to enforce, since the browser is not
  // told the layer's actor addresses.
  const config = useMemo<ResolvedPublicAccessConfig>(() => ({
    linkTtlHours: 0,
    requireIdentity: true,
    identityFields: fields,
    allowedEmailDomains: [],
    requireAssigneeEmailMatch: false,
  }), [fields]);

  const result = useMemo(() => validateDeclaredIdentity(config, values), [config, values]);

  useEffect(() => {
    onValidityChange(result.ok);
  }, [result.ok, onValidityChange]);

  if (fields.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 4 }}>
        Confirm who you are
      </div>
      <div style={{ fontSize: 12, color: COLORS.textSecond, marginBottom: 14, lineHeight: 1.5 }}>
        This link does not require a sign-in, so your details are recorded against the decision you
        make below.
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {fields.map((field) => {
          const message = serverErrors?.[field.key] || (touched[field.key] ? result.errors[field.key] : "");
          return (
            <label key={field.key} style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginBottom: 6 }}>
                {field.label}
                {field.required
                  ? <span style={{ color: COLORS.red }} aria-hidden="true"> *</span>
                  : <span style={{ fontWeight: 400 }}> (optional)</span>}
              </span>
              <input
                type={INPUT_TYPE[field.type]}
                autoComplete={AUTOCOMPLETE[field.type]}
                required={field.required}
                aria-invalid={message ? true : undefined}
                value={values[field.key] || ""}
                disabled={disabled}
                onChange={(event) => onChange({ ...values, [field.key]: event.target.value })}
                onBlur={() => setTouched((prev) => ({ ...prev, [field.key]: true }))}
                style={{
                  width: "100%",
                  minHeight: 44,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${message ? COLORS.red : COLORS.border}`,
                  fontSize: 14,
                  fontFamily: "inherit",
                  color: COLORS.textPrimary,
                  background: disabled ? "#F5F6F8" : "#FFFFFF",
                  outline: "none",
                }}
              />
              {message && (
                <span style={{ display: "block", fontSize: 12, color: COLORS.red, marginTop: 5 }}>
                  {message}
                </span>
              )}
            </label>
          );
        })}
      </div>

      {serverErrors?._form && (
        <div style={{ marginTop: 12, fontSize: 13, color: COLORS.red, background: COLORS.redPale, borderRadius: 8, padding: 10 }}>
          {serverErrors._form}
        </div>
      )}
    </div>
  );
}

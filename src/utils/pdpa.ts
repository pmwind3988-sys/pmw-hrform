/**
 * Public surface for the PDPA privacy notice.
 *
 * Source of truth: "PMW INTERNATIONAL BERHAD - PRIVACY NOTICE" / "NOTIS
 * PRIVASI", document reference `020126`, issued in English and Bahasa Malaysia.
 * Section 7(3) of Act 709 requires the notice in both the national language and
 * English, so both renditions ship together and must be revised together.
 *
 * The clause text lives in `pdpaContent.en.ts` and `pdpaContent.ms.ts`; the
 * types live in `pdpaTypes.ts`.
 */
import { PDPA_CONTENT_EN } from "./pdpaContent.en";
import { PDPA_CONTENT_MS } from "./pdpaContent.ms";
import type { PdpaLocale, PdpaNoticeContent } from "./pdpaTypes";

export type {
  PdpaLocale,
  PdpaListItem,
  PdpaListMarker,
  PdpaNoticeBlock,
  PdpaNoticeContent,
  PdpaNoticeSection,
  PdpaNoticeUi,
} from "./pdpaTypes";

/**
 * Revision of the notice, taken from the document's own `020126` reference.
 * Stamped onto every consent record (`PDPANoticeVersion`) via
 * `getPdpaNoticeVersion()`, which appends the language actually displayed so an
 * audit can show which rendition the person read. The bare value here is the
 * server-side fallback and is duplicated in `api/submit-form.ts` and
 * `api/job-apply.ts` — change all three together.
 */
export const PDPA_NOTICE_VERSION = "PMW-PRIVACY-NOTICE-020126";

export const PDPA_LOCALES: readonly PdpaLocale[] = ["en", "ms"];

export const PDPA_DEFAULT_LOCALE: PdpaLocale = "en";

const PDPA_CONTENT: Record<PdpaLocale, PdpaNoticeContent> = {
  en: PDPA_CONTENT_EN,
  ms: PDPA_CONTENT_MS,
};

export function isPdpaLocale(value: unknown): value is PdpaLocale {
  return value === "en" || value === "ms";
}

export function getPdpaContent(locale: PdpaLocale = PDPA_DEFAULT_LOCALE): PdpaNoticeContent {
  return PDPA_CONTENT[locale] ?? PDPA_CONTENT[PDPA_DEFAULT_LOCALE];
}

/**
 * Consent evidence records the language the notice was displayed in, because
 * consent is only informed if the person could read what they agreed to.
 */
export function getPdpaNoticeVersion(locale: PdpaLocale = PDPA_DEFAULT_LOCALE): string {
  return `${PDPA_NOTICE_VERSION}-${locale.toUpperCase()}`;
}

export const PDPA_DEFAULT_RETENTION_YEARS = Number(
  import.meta.env.VITE_PDPA_RETENTION_YEARS || "7",
);

export const PDPA_CONTROLLER_NAME = "PMW International Berhad";

/**
 * Clause J designates the Group Chief Human Resources Officer as the person in
 * charge of access, correction and withdrawal requests. This is part of the
 * approved notice text, so it is deliberately not overridable by environment —
 * `VITE_HR_RECRUITMENT_EMAIL` addresses recruitment traffic, not data subject
 * requests.
 */
export const PDPA_CONTACT_EMAIL = "grouphr@pmw-group.com";

export const PDPA_CONTACT = {
  addressLines: [
    "Lot 133077, Jalan Lahat,",
    "Bukit Merah Industrial Estate,",
    "31500 Lahat, Perak.",
  ],
  email: PDPA_CONTACT_EMAIL,
  tel: "05-322 4690",
} as const;

export function getPdpaRetentionUntil(from: Date = new Date()): string {
  const retentionUntil = new Date(from);
  retentionUntil.setFullYear(retentionUntil.getFullYear() + PDPA_DEFAULT_RETENTION_YEARS);
  return retentionUntil.toISOString();
}

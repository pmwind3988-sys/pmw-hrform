/**
 * Shared shapes for the PDPA privacy notice content. Kept separate from
 * `pdpa.ts` so the per-language content modules can import the types without a
 * circular value import.
 */

export type PdpaLocale = "en" | "ms";

export type PdpaListMarker = "alpha" | "roman" | "decimal";

export type PdpaListItem = {
  text: string;
  /** Marker for the list this item belongs to; read from the first sibling. */
  marker?: PdpaListMarker;
  items?: readonly PdpaListItem[];
};

export type PdpaNoticeBlock =
  | { kind: "text"; text: string }
  | { kind: "list"; marker: PdpaListMarker; items: readonly PdpaListItem[] }
  /** Renders the clause J contact card from PDPA_CONTACT. */
  | { kind: "contact" };

export type PdpaNoticeSection = {
  /** Clause letter/number as printed in the source document. */
  id: string | null;
  title: string;
  blocks: readonly PdpaNoticeBlock[];
};

/** Chrome and labels around the notice text, so the page can render fully in either language. */
export type PdpaNoticeUi = {
  languageName: string;
  documentTitle: string;
  eyebrow: string;
  versionLabel: (version: string) => string;
  back: string;
  returnHome: string;
  addressLabel: string;
  personInChargeLabel: string;
  emailLabel: string;
  telLabel: string;
  viewNotice: string;
  consentRequired: string;
  footer: string;
  consentRecordNote: (version: string) => string;
};

export type PdpaNoticeContent = {
  locale: PdpaLocale;
  preamble: string;
  sections: readonly PdpaNoticeSection[];
  additionalTermsIntro: string;
  additionalTerms: readonly PdpaNoticeSection[];
  /** Short caption shown next to the consent checkbox. */
  summary: string;
  /** Retention wording, mirroring clause E. */
  retentionSummary: string;
  /** The consent checkbox label itself. */
  consentLabel: string;
  /** Clause F(2)/K(1) — consent held for referees and other third parties. */
  thirdPartyConfirmation: string;
  contactEntity: string;
  personInCharge: string;
  ui: PdpaNoticeUi;
};

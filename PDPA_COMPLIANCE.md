# PDPA Compliance Notes

This project processes HR forms and job applications that may contain personal data. The implementation follows the Malaysia Personal Data Protection Act 2010 (Act 709) principles at an application-control level, but final compliance still needs owner approval, retention rules, and legal review.

Official references:
- JPDP principles: https://www.pdp.gov.my/ppdpv1/en/principles-of-personal-data-protection/
- JPDP introduction and controller duties: https://www.pdp.gov.my/ppdpv1/en/introduction/
- Act 709 and 2024 amendment materials: https://www.pdp.gov.my/ppdpv1/en/akta/pdp-act-2010-en/

## Implemented Controls

- Notice and choice: `/privacy` reproduces the approved corporate notice, clauses A–L plus the vendor and website terms, verbatim. It is legal wording, not app copy — do not reword it.
- **Bilingual as Act 709 s.7(3) requires.** Both renditions of revision `020126` ship together: "PMW INTERNATIONAL BERHAD - PRIVACY NOTICE" (English) in `src/utils/pdpaContent.en.ts` and "NOTIS PRIVASI" (Bahasa Malaysia) in `src/utils/pdpaContent.ms.ts`. `src/utils/pdpa.ts` is the public surface, `src/utils/pdpaTypes.ts` the shared shapes. A revision to one language must be made to the other in the same change.
- Language choice at the point of consent: `usePdpaLocale` (`src/hooks/usePdpaLocale.ts`) persists the reader's language to `localStorage` under `pmw_pdpa_locale` and shares it between `/privacy` and every consent checkbox, so someone who reads the notice in Malay also consents in Malay. `PdpaLanguageToggle` renders the switch inline next to each checkbox.
- Consent: public forms and job applications require an explicit checkbox before submission.
- Consent evidence: submissions store `PDPAConsent`, `PDPANoticeVersion`, and `PDPAConsentAt`. The version records the language actually displayed — `PMW-PRIVACY-NOTICE-020126-EN` or `-MS` — because consent is only informed if the person could read what they agreed to. `getPdpaNoticeVersion(locale)` produces it; the unsuffixed value is the server-side fallback.
- Referee and third-party consent: clauses F(2) and K(1) require the submitter to confirm they hold the consent of anyone else whose data they supply. This is shown as its own line under the consent checkbox on the job application form (`thirdPartyConfirmation`), in the reader's language.
- Retention marking: submissions store `RetentionUntil` for operational deletion/review workflows. Default retention is 7 years and can be overridden with `VITE_PDPA_RETENTION_YEARS` on the frontend and `PDPA_RETENTION_YEARS` on API runtime.
- Server-side enforcement: `/api/submit-form` and `/api/job-apply` reject submissions that do not include consent.
- Server-side provisioning: public form and job application APIs create PDPA metadata columns when missing.
- Security: API calls include the configured API key; API logs avoid raw personal data.
- Data minimisation: PDPA metadata is treated as system metadata and hidden from normal dashboard/PDF display.
- Access, correction and withdrawal: clause J names the Group Chief Human Resources Officer as the person in charge, with the Lahat postal address, `grouphr@pmw-group.com` and 05-322 4690. This contact is hardcoded and deliberately **not** overridable by `VITE_HR_RECRUITMENT_EMAIL` — that variable routes recruitment mail, not data subject requests.
- Learning views by staff are not identifiable: the `Learning Material Views` list stores a one-way SHA-256 of the signer's address, so the feature can answer "how many distinct people" without holding who watched what.
- Learning views by HR-issued portal accounts **are** identifiable, and deliberately so: the `Learning Access Log` list records login ID, full name, material name, and timestamp. These accounts are issued by HR to named individuals outside the company precisely so that receipt of the material can be evidenced. Data minimisation is applied within that purpose — the log holds no address, device, or IP data, and nothing about the M365 population.
- Separation of the two: `resolveLearnerViewer` in `api/learning-materials.ts` only carries a name for portal accounts, so the named trail cannot silently widen to employees.
- Passwords for portal accounts are stored as scrypt hashes with no read path anywhere in the codebase; admins reset them and can never view them.

## Operational Items Still Required

- **Tell portal account holders about the access log at hand-over.** The log is lawful as a legitimate HR purpose, but Act 709's notice-and-choice principle expects the individual to know it exists. The account is handed over in person by HR, so this is a spoken/written step in that process, not something the app can do — and it is currently not written down anywhere.
- Decide a retention period for `Learning Access Log` entries and who trims them. Nothing expires today, and the list keeps entries after the account itself is deleted (deliberately, so the evidence survives, but it needs an owner and an end date).
- Consider whether the `/privacy` notice should name the learning access log for portal account holders.

- **Decide whether the notice change requires re-consent.** Consent records captured before this update carry `PDPANoticeVersion` = `PDPA-MY-HR-2026-05-22` (an earlier app-authored summary, not an approved document); records captured after carry `PMW-PRIVACY-NOTICE-020126-EN` or `-MS`. The approved notice is materially broader than that summary, so legal/HR should decide whether earlier consents still cover it or whether those individuals must be re-asked.
- **The Malay text carries one correction.** The source PDF reads "Kumpulan boleh megekalkan" in additional term 2(a)(i); `pdpaContent.ms.ts` has "mengekalkan". Confirm the correction with whoever owns the document, and fix it at source so the two do not drift.
- **Default language is English.** A first-time visitor with no stored preference sees the English notice. If HR would rather default to Bahasa Malaysia, or pick from the browser's `Accept-Language`, change `PDPA_DEFAULT_LOCALE` in `src/utils/pdpa.ts`.
- **The referee confirmation is wording, not a separate tick.** Clause F(2)'s confirmation is now displayed under the job application consent checkbox, but it is still covered by that single checkbox rather than one of its own. Confirm that is acceptable, or split it.
- **Sensitive personal data is in scope.** Clause A(1)(a) covers health, racial or ethnic origin, and offence history, which Act 709 treats as sensitive personal data requiring explicit consent. Confirm the single consent checkbox is accepted as explicit consent for those categories, or add a distinct opt-in where such fields are actually asked.
- **Cookies.** Additional term 2(d) tells users to configure their browser if they do not want cookies, and offers no in-app control. Confirm this matches what the portal actually sets.
- Confirm whether the default 7-year retention marker matches PMW's HR, recruitment, tax, audit, and legal hold requirements. Note the notice itself (clause E) states no fixed period — the 7-year `RetentionUntil` stamp is an internal review marker, not a promise made to the individual.
- Appoint and publish the responsible data protection contact/officer where required.
- Maintain a data breach notification process aligned with current JPDP circulars and forms.
- Review SharePoint permissions regularly so only authorised HR users, approvers, and evaluators can access submissions.
- If data is transferred outside Malaysia through Microsoft 365 tenancy, backup, or support arrangements, review cross-border transfer requirements.

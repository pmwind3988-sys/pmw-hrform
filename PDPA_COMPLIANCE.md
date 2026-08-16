# PDPA Compliance Notes

This project processes HR forms and job applications that may contain personal data. The implementation follows the Malaysia Personal Data Protection Act 2010 (Act 709) principles at an application-control level, but final compliance still needs owner approval, retention rules, and legal review.

Official references:
- JPDP principles: https://www.pdp.gov.my/ppdpv1/en/principles-of-personal-data-protection/
- JPDP introduction and controller duties: https://www.pdp.gov.my/ppdpv1/en/introduction/
- Act 709 and 2024 amendment materials: https://www.pdp.gov.my/ppdpv1/en/akta/pdp-act-2010-en/

## Implemented Controls

- Notice and choice: `/privacy` provides a privacy notice for HR forms and careers.
- Consent: public forms and job applications require an explicit checkbox before submission.
- Consent evidence: submissions store `PDPAConsent`, `PDPANoticeVersion`, and `PDPAConsentAt`.
- Retention marking: submissions store `RetentionUntil` for operational deletion/review workflows. Default retention is 7 years and can be overridden with `VITE_PDPA_RETENTION_YEARS` on the frontend and `PDPA_RETENTION_YEARS` on API runtime.
- Server-side enforcement: `/api/submit-form` and `/api/job-apply` reject submissions that do not include consent.
- Server-side provisioning: public form and job application APIs create PDPA metadata columns when missing.
- Security: API calls include the configured API key; API logs avoid raw personal data.
- Data minimisation: PDPA metadata is treated as system metadata and hidden from normal dashboard/PDF display.
- Access and correction: the notice identifies the HR contact email for requests.
- Learning views by staff are not identifiable: the `Learning Material Views` list stores a one-way SHA-256 of the signer's address, so the feature can answer "how many distinct people" without holding who watched what.
- Learning views by HR-issued portal accounts **are** identifiable, and deliberately so: the `Learning Access Log` list records login ID, full name, material name, and timestamp. These accounts are issued by HR to named individuals outside the company precisely so that receipt of the material can be evidenced. Data minimisation is applied within that purpose — the log holds no address, device, or IP data, and nothing about the M365 population.
- Separation of the two: `resolveLearnerViewer` in `api/learning-materials.ts` only carries a name for portal accounts, so the named trail cannot silently widen to employees.
- Passwords for portal accounts are stored as scrypt hashes with no read path anywhere in the codebase; admins reset them and can never view them.

## Operational Items Still Required

- **Tell portal account holders about the access log at hand-over.** The log is lawful as a legitimate HR purpose, but Act 709's notice-and-choice principle expects the individual to know it exists. The account is handed over in person by HR, so this is a spoken/written step in that process, not something the app can do — and it is currently not written down anywhere.
- Decide a retention period for `Learning Access Log` entries and who trims them. Nothing expires today, and the list keeps entries after the account itself is deleted (deliberately, so the evidence survives, but it needs an owner and an end date).
- Consider whether the `/privacy` notice should name the learning access log for portal account holders.

- Confirm the privacy notice wording with legal/HR.
- Confirm whether the default 7-year retention marker matches PMW's HR, recruitment, tax, audit, and legal hold requirements.
- Appoint and publish the responsible data protection contact/officer where required.
- Maintain a data breach notification process aligned with current JPDP circulars and forms.
- Review SharePoint permissions regularly so only authorised HR users, approvers, and evaluators can access submissions.
- If data is transferred outside Malaysia through Microsoft 365 tenancy, backup, or support arrangements, review cross-border transfer requirements.

/**
 * submissionAuditExport.ts — the rows of All Submissions → "Export CSV": one
 * line per submission carrying everything an auditor asks for in one sheet.
 * That means who sent it and when, consent, any correction by the submitter,
 * and for each step who decided, in what post, on whose behalf, when and why.
 *
 * Reads a full response item (every column, as SharePoint returns it). Pure.
 */
import { REFERENCE_NO_FIELD } from "./referenceNumber";
import { correctedQuestionLabels, correctionsFromFields } from "./submissionCorrections";
import { readOnBehalfOf } from "./layerRecipients";
import { isTestRow } from "./testRun";

type Fields = Record<string, unknown>;

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && typeof (value as { Url?: unknown }).Url === "string") return (value as { Url: string }).Url;
  return "";
}

/** The highest step number this item has any record for. */
export function stepCount(item: Fields): number {
  let max = 0;
  for (const key of Object.keys(item)) {
    const match = /^L(\d+)_(Status|Email|SignedAt|ActedBy)$/.exec(key);
    if (match && text(item[key])) max = Math.max(max, Number(match[1]));
  }
  return max;
}

const BASE_HEADER = [
  "Form", "Reference No.", "Item ID", "Submitted by", "Submitted at", "Status", "Current step",
  "Form version", "Test run", "PDPA consent", "Privacy notice version", "Consent given at",
  "Keep until", "Corrected by submitter (times)", "Last corrected at", "Answers corrected",
  "Last changed in SharePoint at",
];

const STEP_HEADER = ["status", "decided by", "decided by (email)", "position", "on behalf of", "decided at", "rejection reason"];

export function auditExportHeader(steps: number): string[] {
  const header = [...BASE_HEADER];
  for (let n = 1; n <= steps; n += 1) for (const part of STEP_HEADER) header.push(`Step ${n} ${part}`);
  return header;
}

/** One submission as a CSV row. `formatAt` turns a stored time into Malaysian local time. */
export function auditExportRow(item: Fields, steps: number, formatAt: (iso: string) => string): string[] {
  const at = (value: unknown) => {
    const raw = text(value);
    return raw ? formatAt(raw) : "";
  };
  const corrections = correctionsFromFields(item);
  const consent = item.PDPAConsent;
  const row = [
    text(item.Title),
    text(item[REFERENCE_NO_FIELD]),
    text(item.Id ?? item.ID ?? item.id),
    text(item.SubmittedBy),
    at(item.SubmittedAt),
    text(item.FormStatus) || text(item.Status),
    String(Math.max(Number(item.CurrentLayer) || 0, Number(item.CurrentApprovalLayer) || 0) || ""),
    text(item.FormVersion),
    isTestRow(item) ? "Yes" : "",
    consent === true || /^(true|yes|1)$/i.test(text(consent)) ? "Yes" : text(consent) ? "No" : "",
    text(item.PDPANoticeVersion),
    at(item.PDPAConsentAt),
    at(item.RetentionUntil),
    corrections.length ? String(corrections.length) : "",
    corrections.length ? formatAt(corrections[corrections.length - 1].at) : "",
    correctedQuestionLabels(corrections).join("; "),
    at(item.Modified),
  ];
  for (let n = 1; n <= steps; n += 1) {
    const onBehalf = readOnBehalfOf(item, n);
    row.push(
      text(item[`L${n}_Status`]),
      text(item[`L${n}_ActedByName`]),
      text(item[`L${n}_SignedAt`]) ? text(item[`L${n}_ActedBy`]) || text(item[`L${n}_Email`]) : "",
      text(item[`L${n}_ActedByPosition`]),
      onBehalf ? [onBehalf.name || onBehalf.email, onBehalf.position].filter(Boolean).join(", ") : "",
      at(item[`L${n}_SignedAt`]),
      text(item[`L${n}_Rejection`]),
    );
  }
  return row;
}

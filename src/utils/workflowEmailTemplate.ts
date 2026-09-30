import { editorial } from "../theme/editorial";
/**
 * The one look every PMW HR Form notification wears.
 *
 * `api/_utils/workflowEmailTemplate.ts` is the server's copy of this file; api/
 * cannot import from src/, so the two are kept byte-identical below the header
 * comment — change one and change the other.
 *
 * Everything here is table-based with inline styles on purpose: Outlook drops
 * <style> blocks, and a notification that loses its layout is the one an
 * approver ignores.
 */

export interface WorkflowEmailDetail {
  label: string;
  value: string | number;
}

export interface WorkflowEmailStatusPill {
  label: string;
  color: string;
  background: string;
  border: string;
}

export interface WorkflowEmailTemplateParams {
  /** Hidden preview line mail clients show next to the subject. */
  preheader: string;
  /** Small uppercase label in the top-right of the dark header bar. */
  eyebrow: string;
  heading: string;
  /** Greeted by name when we know one — otherwise the intro stands alone. */
  greetingName?: string;
  intro: string;
  status?: WorkflowEmailStatusPill;
  details: WorkflowEmailDetail[];
  /** The primary button. Omitted entirely when there is nothing to open. */
  actionUrl?: string;
  actionLabel?: string;
  /** A second, quieter button — the PDF record, where one exists. */
  secondaryUrl?: string;
  secondaryLabel?: string;
  /** Amber callout for something the reader has to act on outside the app. */
  callout?: string;
  note?: string;
}

const BRAND_NAME = "PMW HR Form";
const COMPANY_NAME = "PMW Group";

// Colours mirror src/theme/editorial.ts (email cannot import tokens, so literal hex).
const NAVY = "#0F3D91";
const NAVY_DARK = "#0B2F70";
const CANVAS = "#F6F8FB";
const INK = "#101828";
const MUTED = "#5A6880";
const BORDER = "#E5E9F0";

const FONT_STACK =
  "Inter,'Segoe UI',Arial,Helvetica,sans-serif";

/** Plain wording: the app calls approval stages "steps", not "layers". */
function plainStepText(text: string): string {
  return text
    .replace(/\bLayer (\d+)\b/g, "Step $1")
    .replace(/\bworkflow layer\b/gi, (m) => m.replace(/layer/i, (l) => (l[0] === "L" ? "Step" : "step")));
}

function plainDetail(detail: WorkflowEmailDetail): WorkflowEmailDetail {
  const value = String(detail.value ?? "");
  if (detail.label === "Workflow stage") {
    return { label: "Step", value: value.replace(/^Layer (\d+)/, "Step $1") };
  }
  if (detail.label === "Layer") return { label: "Step name", value };
  if (detail.label === "Submission ID") return { label: "Submission", value };
  return detail;
}

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * The subject line, in the shape recipients were asked for:
 * `[Action Required] Leave Application – Nur Aisyah (#OSH-040826-0007)`.
 *
 * The applicant's name comes from the form itself, not from the mailbox that
 * submitted it — a shared HR mailbox files requests for other people, and a
 * subject naming the mailbox tells the approver nothing about whose request it
 * is. Falls back to whatever identity we do have rather than printing a gap.
 */
export function buildWorkflowEmailSubject(params: {
  prefix: string;
  formTitle: string;
  applicantName?: string;
  submittedBy?: string;
  referenceNo?: string;
  responseItemId?: string | number;
}): string {
  const who = (params.applicantName || "").trim() || (params.submittedBy || "").trim();
  const reference = (params.referenceNo || "").trim()
    || (params.responseItemId === undefined ? "" : String(params.responseItemId).trim());
  const parts = [`[${params.prefix}] ${params.formTitle.trim()}`];
  if (who) parts.push(` – ${who}`);
  if (reference) parts.push(` (#${reference})`);
  return parts.join("");
}

function detailRows(rawDetails: WorkflowEmailDetail[]): string {
  const hasReference = rawDetails.some(
    (detail) => /^reference/i.test(detail.label) && String(detail.value ?? "").trim(),
  );
  // With a reference number, the internal submission id is noise to an approver.
  const visible = rawDetails
    .filter((detail) => !(hasReference && detail.label === "Submission ID"))
    .map(plainDetail)
    .filter((detail) => String(detail.value ?? "").trim());
  return visible
    .map((detail, index) => {
      const last = index === visible.length - 1;
      const pad = last ? "0" : "0 0 10px 0";
      return `<tr>
                                              <td style="padding:${pad};font-size:14px;line-height:20px;color:${MUTED};width:38%;vertical-align:top"><strong>${escapeEmailHtml(detail.label)}</strong></td>
                                              <td style="padding:${pad};font-size:14px;line-height:20px;color:${INK};font-weight:500;vertical-align:top">${escapeEmailHtml(String(detail.value))}</td>
                                            </tr>`;
    })
    .join("\n");
}

function actionButton(url: string, label: string): string {
  return `<a href="${escapeEmailHtml(url)}" target="_blank" style="display:inline-block;background-color:${NAVY};color:#FFFFFF;font-size:15px;font-weight:600;line-height:20px;text-decoration:none;padding:14px 32px;border-radius:8px;border:1px solid ${NAVY_DARK}">${escapeEmailHtml(label)}</a>`;
}

function secondaryButton(url: string, label: string): string {
  return `<a href="${escapeEmailHtml(url)}" target="_blank" style="display:inline-block;background-color:#FFFFFF;color:${NAVY};font-size:15px;font-weight:600;line-height:20px;text-decoration:none;padding:14px 26px;border-radius:8px;border:1px solid ${BORDER}">${escapeEmailHtml(label)}</a>`;
}

export function renderWorkflowEmail(params: WorkflowEmailTemplateParams): string {
  const rows = detailRows(params.details);
  const primary = params.actionUrl
    ? actionButton(params.actionUrl, params.actionLabel || "Open request")
    : "";
  const secondary = params.secondaryUrl
    ? secondaryButton(params.secondaryUrl, params.secondaryLabel || "View PDF record")
    : "";
  const buttonsHtml = primary || secondary
    ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:${params.actionUrl ? "24px" : "8px"}">
                                <tr>
                                    <td align="center">
                                        <table border="0" cellpadding="0" cellspacing="0"><tr>
                                          ${primary ? `<td style="padding-right:${secondary ? "10px" : "0"}">${primary}</td>` : ""}
                                          ${secondary ? `<td>${secondary}</td>` : ""}
                                        </tr></table>
                                    </td>
                                </tr>
                            </table>`
    : "";
  // Only the action link gets a copy-paste fallback: it is the one a reviewer
  // must reach even when their client strips the button.
  const fallbackHtml = params.actionUrl
    ? `<p style="margin:0;font-size:13px;color:${MUTED};text-align:center;line-height:1.5">
                                Having trouble with the button? Copy and paste this link into your browser:<br>
                                <a href="${escapeEmailHtml(params.actionUrl)}" style="color:${NAVY};word-break:break-all">${escapeEmailHtml(params.actionUrl)}</a>
                            </p>`
    : "";
  const statusHtml = params.status
    ? `<table border="0" cellpadding="0" cellspacing="0" style="margin-bottom:16px;background-color:${params.status.background};border:1px solid ${params.status.border};border-radius:999px">
                                <tr><td style="padding:6px 14px;font-size:11px;line-height:14px;font-weight:700;color:${params.status.color};text-transform:uppercase;letter-spacing:0.06em">${escapeEmailHtml(params.status.label)}</td></tr>
                            </table>`
    : "";
  const calloutHtml = params.callout
    ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;margin-bottom:24px">
                                <tr><td style="padding:14px 16px;font-size:13px;line-height:20px;color:#92400E">${escapeEmailHtml(plainStepText(params.callout))}</td></tr>
                            </table>`
    : "";
  const noteHtml = params.note
    ? `<p style="margin:20px 0 0;font-size:12px;line-height:18px;color:${MUTED};text-align:center">${escapeEmailHtml(plainStepText(params.note))}</p>`
    : "";
  const greetingHtml = params.greetingName?.trim()
    ? `Hello <strong>${escapeEmailHtml(params.greetingName.trim())}</strong>,<br><br>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeEmailHtml(plainStepText(params.heading))}</title>
</head>
<body style="margin:0;padding:0;background-color:${CANVAS};font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;color:${INK}">

    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeEmailHtml(params.preheader)}</div>

    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:${CANVAS};padding:40px 10px">
        <tr>
            <td align="center">

                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);border:1px solid ${BORDER}">

                    <tr>
                        <td style="background-color:${NAVY};padding:24px 32px;border-bottom:3px solid ${NAVY_DARK}">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td>
                                        <span style="color:#FFFFFF;font-size:20px;font-weight:700;letter-spacing:-0.5px">${BRAND_NAME}</span>
                                    </td>
                                    <td align="right">
                                        <span style="color:#DCE6F7;font-size:13px;text-transform:uppercase;letter-spacing:1px;font-weight:600">${escapeEmailHtml(params.eyebrow)}</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:32px">

                            ${statusHtml}

                            <h1 style="margin:0 0 16px 0;font-size:22px;line-height:28px;font-weight:600;color:${INK}">${escapeEmailHtml(plainStepText(params.heading))}</h1>

                            <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:${MUTED}">
                                ${greetingHtml}${escapeEmailHtml(plainStepText(params.intro))}
                            </p>

                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#FFFFFF;border-radius:8px;border:1px solid ${BORDER};margin-bottom:32px">
                                <tr>
                                    <td style="padding:20px">
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                            ${rows}
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            ${calloutHtml}

                            ${buttonsHtml}

                            ${fallbackHtml}

                            ${noteHtml}

                        </td>
                    </tr>

                    <tr>
                        <td style="background-color:${CANVAS};padding:24px 32px;border-top:1px solid ${BORDER};text-align:center">
                            <p style="margin:0 0 8px 0;font-size:12px;color:${MUTED}">
                                This is an automated notification. Please do not reply directly to this email. For full details, attachments, comments, and audit history, open the request in ${BRAND_NAME}.
                            </p>
                            <p style="margin:0;font-size:12px;color:${MUTED}">
                                &copy; ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.
                            </p>
                        </td>
                    </tr>

                </table>

            </td>
        </tr>
    </table>

</body>
</html>`;
}

/** The status pills the workflow notices use, so the colours stay consistent. */
export const WORKFLOW_EMAIL_STATUS = {
  actionRequired: { label: "Action required", color: editorial.pmwBlueDark, background: editorial.blueSoft, border: editorial.sky },
  pending: { label: "Pending review", color: editorial.accentText, background: editorial.accentSoft, border: editorial.accentSoft },
  manual: { label: "Manual paper workflow", color: editorial.accentText, background: editorial.accentSoft, border: editorial.accentSoft },
  awaitingRouting: { label: "Awaiting routing", color: editorial.accentText, background: editorial.accentSoft, border: editorial.accentSoft },
  completed: { label: "Completed", color: editorial.success, background: editorial.successSoft, border: editorial.successSoft },
  rejected: { label: "Rejected", color: editorial.error, background: editorial.errorSoft, border: editorial.errorSoft },
} as const;

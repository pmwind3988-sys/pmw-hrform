/**
 * The one look every PMW HR Form notification wears.
 *
 * `src/utils/workflowEmailTemplate.ts` is the browser's copy of this file; api/
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

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,'Helvetica Neue',Arial,sans-serif";

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

function detailRows(details: WorkflowEmailDetail[]): string {
  const visible = details.filter((detail) => String(detail.value ?? "").trim());
  return visible
    .map((detail, index) => {
      const last = index === visible.length - 1;
      const pad = last ? "0" : "0 0 10px 0";
      return `<tr>
                                              <td style="padding:${pad};font-size:14px;line-height:20px;color:#64748B;width:38%;vertical-align:top"><strong>${escapeEmailHtml(detail.label)}</strong></td>
                                              <td style="padding:${pad};font-size:14px;line-height:20px;color:#0F172A;font-weight:500;vertical-align:top">${escapeEmailHtml(String(detail.value))}</td>
                                            </tr>`;
    })
    .join("\n");
}

function actionButton(url: string, label: string): string {
  return `<a href="${escapeEmailHtml(url)}" target="_blank" style="display:inline-block;background-color:#2563EB;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:6px;border:1px solid #1D4ED8">${escapeEmailHtml(label)}</a>`;
}

function secondaryButton(url: string, label: string): string {
  return `<a href="${escapeEmailHtml(url)}" target="_blank" style="display:inline-block;background-color:#FFFFFF;color:#2563EB;font-size:15px;font-weight:600;text-decoration:none;padding:14px 26px;border-radius:6px;border:1px solid #BFDBFE">${escapeEmailHtml(label)}</a>`;
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
    ? `<p style="margin:0;font-size:13px;color:#64748B;text-align:center;line-height:1.5">
                                Having trouble with the button? Copy and paste this link into your browser:<br>
                                <a href="${escapeEmailHtml(params.actionUrl)}" style="color:#2563EB;word-break:break-all">${escapeEmailHtml(params.actionUrl)}</a>
                            </p>`
    : "";
  const statusHtml = params.status
    ? `<table border="0" cellpadding="0" cellspacing="0" style="margin-bottom:16px;background-color:${params.status.background};border:1px solid ${params.status.border};border-radius:999px">
                                <tr><td style="padding:6px 14px;font-size:11px;line-height:14px;font-weight:700;color:${params.status.color};text-transform:uppercase;letter-spacing:0.06em">${escapeEmailHtml(params.status.label)}</td></tr>
                            </table>`
    : "";
  const calloutHtml = params.callout
    ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;margin-bottom:24px">
                                <tr><td style="padding:14px 16px;font-size:13px;line-height:20px;color:#92400E">${escapeEmailHtml(params.callout)}</td></tr>
                            </table>`
    : "";
  const noteHtml = params.note
    ? `<p style="margin:20px 0 0;font-size:12px;line-height:18px;color:#94A3B8;text-align:center">${escapeEmailHtml(params.note)}</p>`
    : "";
  const greetingHtml = params.greetingName?.trim()
    ? `Hello <strong>${escapeEmailHtml(params.greetingName.trim())}</strong>,<br><br>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeEmailHtml(params.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F6F9;font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;color:#333333">

    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeEmailHtml(params.preheader)}</div>

    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#F4F6F9;padding:40px 10px">
        <tr>
            <td align="center">

                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background-color:#FFFFFF;border-radius:8px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);border:1px solid #E1E6EB">

                    <tr>
                        <td style="background-color:#0F172A;padding:24px 32px;border-bottom:3px solid #2563EB">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td>
                                        <span style="color:#FFFFFF;font-size:20px;font-weight:700;letter-spacing:-0.5px">${BRAND_NAME}</span>
                                    </td>
                                    <td align="right">
                                        <span style="color:#94A3B8;font-size:13px;text-transform:uppercase;letter-spacing:1px;font-weight:600">${escapeEmailHtml(params.eyebrow)}</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:32px">

                            ${statusHtml}

                            <h1 style="margin:0 0 16px 0;font-size:22px;line-height:28px;font-weight:600;color:#0F172A">${escapeEmailHtml(params.heading)}</h1>

                            <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#475569">
                                ${greetingHtml}${escapeEmailHtml(params.intro)}
                            </p>

                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#F8FAFC;border-radius:6px;border:1px solid #E2E8F0;margin-bottom:32px">
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
                        <td style="background-color:#F8FAFC;padding:24px 32px;border-top:1px solid #E2E8F0;text-align:center">
                            <p style="margin:0 0 8px 0;font-size:12px;color:#94A3B8">
                                This is an automated notification. Please do not reply directly to this email. For full details, attachments, comments, and audit history, open the request in ${BRAND_NAME}.
                            </p>
                            <p style="margin:0;font-size:12px;color:#94A3B8">
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
  actionRequired: { label: "Action required", color: "#1E40AF", background: "#EFF6FF", border: "#BFDBFE" },
  pending: { label: "Pending review", color: "#92400E", background: "#FFFBEB", border: "#FDE68A" },
  manual: { label: "Manual paper workflow", color: "#92400E", background: "#FFFBEB", border: "#FDE68A" },
  awaitingRouting: { label: "Awaiting routing", color: "#92400E", background: "#FFFBEB", border: "#FDE68A" },
  completed: { label: "Completed", color: "#065F46", background: "#ECFDF5", border: "#A7F3D0" },
  rejected: { label: "Rejected", color: "#991B1B", background: "#FEF2F2", border: "#FECACA" },
} as const;

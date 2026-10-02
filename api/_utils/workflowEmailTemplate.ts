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
  /** Small uppercase label above the heading in the white card. */
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

// Colour palette from the approved design prototype
const BACKGROUND = "#EFF2F5";
const CARD_BG = "#FFFFFF";
const BORDER = "#E5E9F0";
const INK = "#0C0E14";
const MUTED = "#6B7484";
const BUTTON = "#2B2870";
const STATUS_COMPLETED = "#1F8A5B";
const STATUS_REJECTED = "#C0362C";
const LOGO_URL = "https://pmw-hrform.vercel.app/logo.png";

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
  return `<a href="${escapeEmailHtml(url)}" target="_blank" style="display:inline-block;background-color:${BUTTON};color:#FFFFFF;font-size:15px;font-weight:600;line-height:20px;text-decoration:none;padding:14px 32px;border-radius:10px;border:none">${escapeEmailHtml(label)}</a>`;
}

function secondaryButton(url: string, label: string): string {
  return `<a href="${escapeEmailHtml(url)}" target="_blank" style="display:inline-block;background-color:#FFFFFF;color:${BUTTON};font-size:15px;font-weight:600;line-height:20px;text-decoration:none;padding:14px 26px;border-radius:10px;border:1px solid ${BORDER}">${escapeEmailHtml(label)}</a>`;
}

function statusIndicator(status: WorkflowEmailStatusPill): string {
  // Determine if this is a completed or rejected status
  const isCompleted = status.label.toLowerCase() === "completed";
  const isRejected = status.label.toLowerCase() === "rejected";

  if (isCompleted) {
    return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom:24px;margin-top:8px">
                                <tr>
                                    <td align="center">
                                        <table align="center" border="0" cellpadding="0" cellspacing="0" style="width:76px;height:76px;margin:0 auto;background-color:${STATUS_COMPLETED};border-radius:999px">
                                            <tr><td align="center" valign="middle" style="font-size:44px;color:#FFFFFF;line-height:1">✓</td></tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>`;
  } else if (isRejected) {
    return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom:24px;margin-top:8px">
                                <tr>
                                    <td align="center">
                                        <table align="center" border="0" cellpadding="0" cellspacing="0" style="width:76px;height:76px;margin:0 auto;background-color:${STATUS_REJECTED};border-radius:999px">
                                            <tr><td align="center" valign="middle" style="font-size:44px;color:#FFFFFF;line-height:1">✕</td></tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>`;
  }
  return "";
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
                                <a href="${escapeEmailHtml(params.actionUrl)}" style="color:${BUTTON};word-break:break-all">${escapeEmailHtml(params.actionUrl)}</a>
                            </p>`
    : "";
  const statusCircleHtml = params.status ? statusIndicator(params.status) : "";
  const eyebrowHtml = `<p style="margin:0 0 8px 0;font-size:12px;line-height:14px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.06em;text-align:center">${escapeEmailHtml(params.eyebrow)}</p>`;
  const calloutHtml = params.callout
    ? `<p style="margin:0 0 24px 0;font-size:13px;line-height:20px;color:${MUTED}">${escapeEmailHtml(plainStepText(params.callout))}</p>`
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
<body style="margin:0;padding:0;background-color:${BACKGROUND};font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;color:${INK}">

    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeEmailHtml(params.preheader)}</div>

    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:${BACKGROUND};padding:40px 10px">
        <tr>
            <td align="center">

                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background-color:${CARD_BG};border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);border:1px solid ${BORDER}">

                    <tr>
                        <td style="padding:32px">

                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td align="center">
                                        <img src="${LOGO_URL}" alt="PMW" style="height:32px;width:auto;display:block;margin-bottom:24px">
                                    </td>
                                </tr>
                            </table>

                            ${statusCircleHtml}

                            ${eyebrowHtml}

                            <h1 style="margin:0 0 16px 0;font-size:26px;line-height:32px;font-weight:700;color:${INK};text-align:center">${escapeEmailHtml(plainStepText(params.heading))}</h1>

                            <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:${MUTED};text-align:center">
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
                        <td style="background-color:${BACKGROUND};padding:24px 32px;border-top:1px solid ${BORDER};text-align:center">
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
  actionRequired: { label: "Action required", color: "#1E40AF", background: "#EFF6FF", border: "#BFDBFE" },
  pending: { label: "Pending review", color: "#92400E", background: "#FFFBEB", border: "#FDE68A" },
  manual: { label: "Manual paper workflow", color: "#92400E", background: "#FFFBEB", border: "#FDE68A" },
  awaitingRouting: { label: "Awaiting routing", color: "#92400E", background: "#FFFBEB", border: "#FDE68A" },
  completed: { label: "Completed", color: "#065F46", background: "#ECFDF5", border: "#A7F3D0" },
  rejected: { label: "Rejected", color: "#991B1B", background: "#FEF2F2", border: "#FECACA" },
} as const;

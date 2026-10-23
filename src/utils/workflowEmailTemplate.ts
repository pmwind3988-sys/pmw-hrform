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
  /**
   * A blue "For your information" box with an (i): context the reader should
   * know but need not act on, such as who else received the request.
   */
  info?: string;
  note?: string;
  /** Names the portal under the logo, for an email the reader may not be expecting. */
  portalIdentity?: boolean;
  /** A small "how to complete it" box under the button, for request emails. */
  guide?: WorkflowEmailGuide;
}

export interface WorkflowEmailGuide {
  title: string;
  /** One short line each; text between **double asterisks** is printed bold. */
  steps: string[];
  /** One line under the steps: who the email genuinely comes from, who to ask. */
  footnote?: string;
  /** A small white box under the steps, for someone who cannot sign in. */
  help?: { title: string; lines: string[] };
}

/**
 * For the reviewer who cannot sign in: use their own password, else ask PMW IT.
 */
export const PASSWORD_HELP: { title: string; lines: string[] } = {
  title: "Cannot find your Microsoft password?",
  lines: [
    "**Set your own password?** Please use that one.",
    "**Still unable to sign in?** Please contact **PMW IT** and we will gladly help.",
  ],
};

/** The HR forms mailbox, named in the guide when no sender is configured. */
export const DEFAULT_HR_FORM_SENDER = "pmw.hrform@pmw-group.com";

/**
 * The guide a request email carries. Someone asked to evaluate or approve
 * for the first time does not know the portal, may take the email for a scam,
 * and does not know what is expected — so it says what to press, how to sign
 * in, what to do there, and which sender address is the real one.
 */
export function buildRequestGuide(params: {
  formTitle: string;
  layerType: "approval" | "evaluation";
  /** The button's label in this email, so the first step names it exactly. */
  buttonLabel: string;
  /** The address the email is sent from. */
  sender?: string;
}): WorkflowEmailGuide {
  const trainingEvaluation = /\btraining\s+evaluation\b/i.test(params.formTitle);
  // Approved on the paper form's sign-off: the approver signs on its line.
  const paperApproval = /\btraining\s+(needs?\s+analysis|requisition)\b/i.test(params.formTitle);
  const signIn = "Sign in with your usual PMW Microsoft account (the one for Outlook).";
  const steps = params.layerType === "evaluation"
    ? [
      `Press **${params.buttonLabel}** above.`,
      signIn,
      trainingEvaluation
        ? "Read the employee’s form, then tick Yes or No and add a comment."
        : "Read the submitted form, then answer the evaluation questions.",
      trainingEvaluation ? "Sign on the line and press **Submit evaluation**." : "Press **Submit evaluation**.",
    ]
    : [
      `Press **${params.buttonLabel}** above.`,
      signIn,
      "Read the submitted form.",
      paperApproval
        ? "Sign on the line and press **Approve request**, or **Reject** with a reason."
        : "Press **Approve request**, or **Reject** with a reason.",
    ];
  const sender = (params.sender || "").trim() || DEFAULT_HR_FORM_SENDER;
  return {
    title: "How to complete it (about 3 minutes)",
    steps,
    help: PASSWORD_HELP,
    footnote: `Make sure it was sent from **${sender}** only; treat any other sender as suspicious. We never ask for your password by email. For any enquiries, please contact the main administrator.`,
  };
}

/**
 * Who to name as the submitter. A public-link submission is recorded as
 * "GUEST", which tells a reviewer nothing; the name the form collected does.
 */
export function requestSubmitterName(submittedBy: string, applicantName?: string): string {
  const name = (applicantName || "").trim();
  return (submittedBy || "").trim().toUpperCase() === "GUEST" && name ? name : submittedBy;
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
const STATUS_ACTION = "#1E40AF";
const STATUS_ATTENTION = "#B45309";
const CALLOUT_BG = "#FFFBEB";
const CALLOUT_BORDER = "#FDE68A";
const CALLOUT_INK = "#78350F";
const INFO_BG = "#EFF6FF";
const INFO_BORDER = "#BFDBFE";
const INFO_INK = "#1E3A8A";
const INFO_ICON = "#1E40AF";
const SITE_ORIGIN = "https://pmw-hrform.vercel.app";
const LOGO_URL = `${SITE_ORIGIN}/logo.png`;
// logo.png is 1898×999. Outlook for Windows ignores `width:auto` and draws an
// image at its file size unless told otherwise, which stretched the whole email
// to nearly 2000px wide — so the size goes in attributes as well as CSS.
const LOGO_HEIGHT = 32;
const LOGO_WIDTH = 61;
// Outlook for Windows also ignores max-width; a fixed-width table it alone reads
// (inside <!--[if mso]>) holds the card to this.
const CARD_WIDTH = 600;

const FONT_STACK =
  "Inter,'Segoe UI',Arial,Helvetica,sans-serif";

/** Plain wording: the app calls approval stages "steps", not "layers". */
function plainStepText(text: string): string {
  return text
    // "Layer 3", "layer 3" and "layer #3" all read as a step.
    .replace(/\b([Ll])ayer #?(\d+)\b/g, (_match, l: string, n: string) => `${l === "L" ? "S" : "s"}tep ${n}`)
    .replace(/\bworkflow layer\b/gi, (m) => m.replace(/layer/i, (l) => (l[0] === "L" ? "Step" : "step")));
}

function plainDetail(detail: WorkflowEmailDetail): WorkflowEmailDetail {
  const value = String(detail.value ?? "");
  if (detail.label === "Workflow stage") {
    return { label: "Step", value: value.replace(/^Layer (\d+)/, "Step $1") };
  }
  if (detail.label === "Layer") return { label: "Step name", value };
  if (detail.label === "Submission ID") return { label: "Submission", value };
  return { label: detail.label, value: plainStepText(value) };
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
 * `Action Required: Leave Application – Nur Aisyah (#OSH-040826-0007)`.
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
  const parts = [`${params.prefix}: ${params.formTitle.trim()}`];
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
                                              <td width="38%" style="padding:${pad};font-size:14px;line-height:20px;color:${MUTED};width:38%;vertical-align:top"><strong>${escapeEmailHtml(detail.label)}</strong></td>
                                              <td style="padding:${pad};font-size:14px;line-height:20px;color:${INK};font-weight:500;vertical-align:top">${escapeEmailHtml(String(detail.value))}</td>
                                            </tr>`;
    })
    .join("\n");
}

// Outlook for Windows ignores padding and background on a link, so each button's
// colour and size live on a table cell around it.
function actionButton(url: string, label: string): string {
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${BUTTON}" style="background-color:${BUTTON};border-radius:10px;padding:14px 32px"><a href="${escapeEmailHtml(url)}" target="_blank" style="display:inline-block;color:#FFFFFF;font-size:15px;font-weight:600;line-height:20px;text-decoration:none">${escapeEmailHtml(label)}</a></td></tr></table>`;
}

function secondaryButton(url: string, label: string): string {
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border-radius:10px;border:1px solid ${BORDER};padding:13px 26px"><a href="${escapeEmailHtml(url)}" target="_blank" style="display:inline-block;color:${BUTTON};font-size:15px;font-weight:600;line-height:20px;text-decoration:none">${escapeEmailHtml(label)}</a></td></tr></table>`;
}

interface StatusIcon {
  glyph: string;
  color: string;
  /** A cartoon of the status, under the site's public/email/. The glyph is its alt text. */
  picture?: string;
  /** Printed small under the circle. Completed and Rejected keep their eyebrow instead. */
  labelled: boolean;
}

/**
 * Every status is a coloured circle with one symbol in it, so an approval
 * request, a routing problem, a paper step and an outcome tell themselves apart
 * before anyone reads a word. The circle is a table cell with a text character,
 * never SVG: Outlook for Windows shows no SVG and Gmail strips it. Where there is
 * a cartoon PNG, it sits inside that cell with the character as its alt text, so
 * a mail app that blocks pictures (Outlook does until asked) still shows the
 * coloured circle and its symbol rather than an empty box.
 */
function statusIcon(status: WorkflowEmailStatusPill): StatusIcon {
  switch (status.label.trim().toLowerCase()) {
    case "completed": return { glyph: "✓", color: STATUS_COMPLETED, labelled: false };
    case "rejected": return { glyph: "✕", color: STATUS_REJECTED, labelled: false };
    case "action required": return { glyph: "!", color: STATUS_ACTION, labelled: true, picture: "status-action-required.png" };
    case "awaiting routing": return { glyph: "?", color: STATUS_ATTENTION, labelled: true, picture: "status-awaiting-routing.png" };
    case "manual paper workflow": return { glyph: "✎", color: STATUS_ATTENTION, labelled: true, picture: "status-manual-paper.png" };
    default: return { glyph: "!", color: status.color, labelled: true };
  }
}

function statusIndicator(status: WorkflowEmailStatusPill): string {
  const icon = statusIcon(status);
  const symbol = icon.picture
    ? `<img src="${SITE_ORIGIN}/email/${icon.picture}" width="76" height="76" alt="${icon.glyph}" style="display:block;width:76px;height:76px;border:0;border-radius:999px;color:#FFFFFF;font-family:${FONT_STACK};font-size:44px;font-weight:700;line-height:76px;text-align:center">`
    : icon.glyph;
  const label = icon.labelled
    ? `<p style="margin:0 0 16px 0;font-size:13px;line-height:16px;font-weight:700;color:${icon.color};text-transform:uppercase;letter-spacing:0.06em;text-align:center">${escapeEmailHtml(status.label)}</p>`
    : "";
  return `${spacer(8)}<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center">
                                        <table align="center" border="0" cellpadding="0" cellspacing="0" width="76" height="76" style="width:76px;height:76px;margin:0 auto;background-color:${icon.color};border-radius:999px">
                                            <tr><td align="center" valign="middle" style="font-size:44px;font-weight:700;color:#FFFFFF;line-height:1">${symbol}</td></tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            ${spacer(icon.labelled ? 12 : 24)}
                            ${label}`;
}

/**
 * A fixed gap. Outlook for Windows ignores margins on tables, images and divs,
 * so a margin there collapses to nothing and blocks run into each other; an
 * empty row of a set height is the one gap every mail app keeps.
 */
function spacer(px: number): string {
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"><tr><td height="${px}" style="height:${px}px;font-size:1px;line-height:${px}px">&nbsp;</td></tr></table>`;
}

/** Escaped text with **marked** words bold. */
function emphasised(text: string, color: string = INK): string {
  return escapeEmailHtml(text).replace(/\*\*(.+?)\*\*/g, `<strong style="color:${color}">$1</strong>`);
}

function guideHtml(guide: WorkflowEmailGuide): string {
  const steps = guide.steps
    .map((step, i) => `<tr>
                                            <td width="26" style="width:26px;vertical-align:top;padding:0 8px 6px 0"><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="18"><tr><td width="18" height="18" align="center" bgcolor="#EEF0FA" style="width:18px;height:18px;border-radius:50%;background-color:#EEF0FA;color:${BUTTON};font-size:11px;font-weight:700;line-height:18px;text-align:center">${i + 1}</td></tr></table></td>
                                            <td style="vertical-align:top;padding:0 0 6px 0;font-size:13px;line-height:18px;color:${INK}">${emphasised(step)}</td>
                                        </tr>`)
    .join("\n");
  const footnote = guide.footnote
    ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:6px"><tr><td style="padding:8px 0 4px 0;border-top:1px solid ${BORDER};font-size:12px;line-height:17px;color:${MUTED}">${emphasised(guide.footnote)}</td></tr></table>`
    : "";
  const help = guide.help
    ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#FFFFFF" style="margin-top:6px;background-color:#FFFFFF;border:1px solid ${BORDER};border-radius:6px">
                                            <tr><td style="padding:12px 14px 8px 14px">
                                                <p style="margin:0 0 6px 0;font-size:13px;line-height:19px;font-weight:700;color:${INK}">${escapeEmailHtml(guide.help.title)}</p>
                                                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                                                ${guide.help.lines.map((line) => `<tr>
                                                    <td width="14" style="width:14px;vertical-align:top;padding:0 0 4px 0;font-size:13px;line-height:19px;color:${INK}">&bull;</td>
                                                    <td style="vertical-align:top;padding:0 0 4px 0;font-size:13px;line-height:19px;color:${INK}">${emphasised(line)}</td>
                                                </tr>`).join("")}
                                                </table>
                                            </td></tr>
                                        </table>
                                        ${spacer(6)}`
    : "";
  return `${spacer(24)}<table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#F7F8FC" style="border:1px solid ${BORDER};border-radius:8px;background-color:#F7F8FC">
                                <tr>
                                    <td style="padding:14px 16px 8px 16px">
                                        <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:${INK}">${escapeEmailHtml(guide.title)}</p>
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                        ${steps}
                                        </table>
                                        ${help}
                                        ${footnote}
                                    </td>
                                </tr>
                            </table>`;
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
    ? `<table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td align="center">
                                        <table border="0" cellpadding="0" cellspacing="0"><tr>
                                          ${primary ? `<td style="padding-right:${secondary ? "10px" : "0"}">${primary}</td>` : ""}
                                          ${secondary ? `<td>${secondary}</td>` : ""}
                                        </tr></table>
                                    </td>
                                </tr>
                            </table>
                            ${spacer(params.actionUrl ? 16 : 8)}`
    : "";
  // Only the action link gets a copy-paste fallback: it is the one a reviewer
  // must reach even when their client strips the button.
  const fallbackHtml = params.actionUrl
    ? `<p style="margin:0;font-size:13px;color:${MUTED};text-align:center;line-height:1.5">
                                Having trouble with the button? Copy and paste this link into your browser:<br>
                                <a href="${escapeEmailHtml(params.actionUrl)}" style="color:${BUTTON};word-break:break-all;word-wrap:break-word">${escapeEmailHtml(params.actionUrl)}</a>
                            </p>`
    : "";
  const statusCircleHtml = params.status ? statusIndicator(params.status) : "";
  // A labelled circle already names the status; a grey eyebrow under it would be a second label.
  const iconLabelled = !!params.status && statusIcon(params.status).labelled;
  const eyebrowHtml = iconLabelled ? "" : `<p style="margin:0 0 8px 0;font-size:12px;line-height:14px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.06em;text-align:center">${escapeEmailHtml(params.eyebrow)}</p>`;
  const calloutHtml = params.callout
    ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${CALLOUT_BG}" style="background-color:${CALLOUT_BG};border:1px solid ${CALLOUT_BORDER};border-radius:8px">
                                <tr><td style="padding:14px 16px;font-size:14px;line-height:21px;color:${CALLOUT_INK}">${emphasised(plainStepText(params.callout), CALLOUT_INK)}</td></tr>
                            </table>
                            ${spacer(24)}`
    : "";
  const infoHtml = params.info
    ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${INFO_BG}" style="background-color:${INFO_BG};border:1px solid ${INFO_BORDER};border-radius:8px">
                                <tr>
                                    <td width="36" style="width:36px;vertical-align:top;padding:14px 0 14px 16px"><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="20"><tr><td width="20" height="20" align="center" bgcolor="${INFO_ICON}" style="width:20px;height:20px;border-radius:50%;background-color:${INFO_ICON};color:#FFFFFF;font-family:Georgia,'Times New Roman',serif;font-size:13px;font-weight:700;font-style:italic;line-height:20px;text-align:center">i</td></tr></table></td>
                                    <td style="vertical-align:top;padding:14px 16px 14px 10px;font-size:14px;line-height:21px;color:${INFO_INK}">
                                        <p style="margin:0 0 4px 0;font-size:13px;line-height:20px;font-weight:700;color:${INFO_INK}">For your information</p>
                                        ${emphasised(plainStepText(params.info), INFO_INK)}
                                    </td>
                                </tr>
                            </table>
                            ${spacer(24)}`
    : "";
  const noteHtml = params.note
    ? `<p style="margin:20px 0 0;font-size:12px;line-height:18px;color:${MUTED};text-align:center">${escapeEmailHtml(plainStepText(params.note))}</p>`
    : "";
  const identityHtml = params.portalIdentity
    ? `<p style="margin:0;font-size:13px;line-height:18px;font-weight:700;color:${BUTTON};letter-spacing:0.02em">PMW HR Forms Portal</p>
                                        <p style="margin:2px 0 24px 0;font-size:12px;line-height:16px;color:${MUTED}">PMW Group’s HR forms system</p>`
    : "";
  const guideBlock = params.guide ? guideHtml(params.guide) : "";
  const greetingHtml = params.greetingName?.trim()
    ? `Hello <strong>${escapeEmailHtml(params.greetingName.trim())}</strong>,<br><br>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeEmailHtml(plainStepText(params.heading))}</title>
    <!--[if mso]><style>body,table,td,p,a,h1,div{font-family:'Segoe UI',Arial,sans-serif !important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${BACKGROUND};font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;color:${INK}">

    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeEmailHtml(plainStepText(params.preheader))}</div>

    <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${BACKGROUND}" style="background-color:${BACKGROUND}">
        <tr>
            <td align="center" style="padding:40px 10px">

                <!--[if mso]><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${CARD_WIDTH}" align="center"><tr><td><![endif]-->
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:${CARD_WIDTH}px;background-color:${CARD_BG};border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);border:1px solid ${BORDER}">

                    <tr>
                        <td style="padding:32px">

                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td align="center">
                                        <img src="${LOGO_URL}" alt="PMW" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" style="width:${LOGO_WIDTH}px;height:${LOGO_HEIGHT}px;border:0;display:block;margin:0 auto">
                                        ${spacer(params.portalIdentity ? 8 : 24)}
                                        ${identityHtml}
                                    </td>
                                </tr>
                            </table>

                            ${statusCircleHtml}

                            ${eyebrowHtml}

                            <h1 style="margin:0 0 16px 0;font-size:26px;line-height:32px;font-weight:700;color:${INK};text-align:center">${escapeEmailHtml(plainStepText(params.heading))}</h1>

                            <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:${MUTED};text-align:center">
                                ${greetingHtml}${escapeEmailHtml(plainStepText(params.intro))}
                            </p>

                            ${calloutHtml}

                            ${infoHtml}

                            <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border-radius:8px;border:1px solid ${BORDER}">
                                <tr>
                                    <td style="padding:20px">
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                            ${rows}
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            ${spacer(28)}

                            ${buttonsHtml}

                            ${fallbackHtml}

                            ${guideBlock}

                            ${noteHtml}

                        </td>
                    </tr>

                    <tr>
                        <td bgcolor="${BACKGROUND}" style="background-color:${BACKGROUND};padding:24px 32px;border-top:1px solid ${BORDER};text-align:center">
                            <p style="margin:0 0 8px 0;font-size:12px;color:${MUTED}">
                                This is an automated notification. Please do not reply directly to this email. For full details, attachments, comments, and audit history, open the request in ${BRAND_NAME}.
                            </p>
                            <p style="margin:0;font-size:12px;color:${MUTED}">
                                &copy; ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.
                            </p>
                        </td>
                    </tr>

                </table>
                <!--[if mso]></td></tr></table><![endif]-->

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

export interface ActionRequestEmailParams {
  formTitle: string;
  submittedBy: string;
  responseItemId: string | number;
  layer: number;
  totalLayers: number;
  layerType: "approval" | "evaluation";
  reviewLink: string;
  referenceNo?: string;
  applicantName?: string;
  /** Who on the email is standing in for whom, when a PA was asked too. */
  standInNote?: string;
  /** The address the email is sent from, named in the guide. */
  sender?: string;
  /** The PDF record so far, offered beside the main button when there is one. */
  pdfUrl?: string;
}

/**
 * The request to approve or evaluate a step. The server and the browser both
 * send it — at submission, after the previous step, from the daily run — and
 * used to word it two different ways; this is the one wording now.
 */
export function renderActionRequestEmail(params: ActionRequestEmailParams): string {
  const evaluation = params.layerType === "evaluation";
  const actionNoun = evaluation ? "evaluation review" : "approval";
  const actionVerb = evaluation ? "review" : "approve";
  const actionLabel = evaluation ? "Review & submit evaluation" : "Review & approve form";
  return renderWorkflowEmail({
    preheader: `${params.formTitle} #${params.responseItemId} is waiting for your ${actionNoun}.`,
    eyebrow: "Action required",
    status: WORKFLOW_EMAIL_STATUS.actionRequired,
    heading: `${params.formTitle} needs your ${actionNoun}`,
    intro: `A submission is waiting for you to ${actionVerb}. Please review the request details below and record your decision.`,
    details: [
      { label: "Form", value: params.formTitle },
      { label: "Reference no.", value: (params.referenceNo ?? "").trim() },
      { label: "Submission ID", value: `#${params.responseItemId}` },
      { label: "Applicant", value: (params.applicantName ?? "").trim() },
      { label: "Submitted by", value: requestSubmitterName(params.submittedBy, params.applicantName) },
      { label: "Workflow stage", value: `Layer ${params.layer} of ${params.totalLayers}` },
    ],
    info: params.standInNote || undefined,
    actionUrl: params.reviewLink || undefined,
    actionLabel,
    secondaryUrl: params.pdfUrl || undefined,
    secondaryLabel: "View PDF record",
    portalIdentity: true,
    guide: buildRequestGuide({ formTitle: params.formTitle, layerType: params.layerType, buttonLabel: actionLabel, sender: params.sender }),
    note: "Only the person this step is assigned to should act on it.",
  });
}

export interface SubmissionOutcomeEmailParams {
  outcome: "completed" | "rejected";
  formTitle: string;
  responseItemId: string | number;
  /** The step that finished the workflow: the last one, or the one that rejected. */
  layer: number;
  totalLayers: number;
  referenceNo?: string;
  applicantName?: string;
  /** The reason the reviewer typed when rejecting, if they gave one. */
  reason?: string;
  /** Who decided, by name, when known. */
  decidedBy?: string;
  /** The submitter's own list of submissions, where this one can be opened. */
  submissionsUrl?: string;
  pdfUrl?: string;
}

/** The closing note to whoever submitted: finished, or stopped and why. */
export function renderSubmissionOutcomeEmail(params: SubmissionOutcomeEmailParams): string {
  const completed = params.outcome === "completed";
  const reason = (params.reason ?? "").trim();
  const common = [
    { label: "Form", value: params.formTitle },
    { label: "Reference no.", value: (params.referenceNo ?? "").trim() },
    { label: "Submission ID", value: `#${params.responseItemId}` },
    { label: "Applicant", value: (params.applicantName ?? "").trim() },
  ];
  const buttons = {
    actionUrl: params.submissionsUrl || undefined,
    actionLabel: "View my submissions",
    secondaryUrl: params.pdfUrl || undefined,
    secondaryLabel: "View PDF record",
  };
  if (completed) {
    return renderWorkflowEmail({
      preheader: `${params.formTitle} #${params.responseItemId} has been completed.`,
      eyebrow: "Status update",
      status: WORKFLOW_EMAIL_STATUS.completed,
      heading: `${params.formTitle} has been completed`,
      intro: "Every step of your request has been approved. No further action is needed from you.",
      details: [
        ...common,
        { label: "Final status", value: "Completed" },
        { label: "Steps", value: `All ${params.totalLayers} completed` },
      ],
      ...buttons,
      note: "Keep the PDF record for reference if your department process requires it.",
    });
  }
  return renderWorkflowEmail({
    preheader: `${params.formTitle} #${params.responseItemId} was rejected at step ${params.layer}.`,
    eyebrow: "Status update",
    status: WORKFLOW_EMAIL_STATUS.rejected,
    heading: `${params.formTitle} was rejected`,
    intro: reason
      ? `Your request was rejected at step ${params.layer} of ${params.totalLayers}, so it will not go any further. The reviewer's reason is below.`
      : `Your request was rejected at step ${params.layer} of ${params.totalLayers}, so it will not go any further. No reason was recorded.`,
    callout: reason ? `**Reason given:** ${reason}` : undefined,
    details: [
      ...common,
      { label: "Final status", value: "Rejected" },
      { label: "Rejected by", value: (params.decidedBy ?? "").trim() },
      { label: "Rejected at", value: `Step ${params.layer} of ${params.totalLayers}` },
    ],
    ...buttons,
    note: "Contact the reviewing department if you need clarification before submitting a new request.",
  });
}

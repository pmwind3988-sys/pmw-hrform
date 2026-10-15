/**
 * manualPaperEmail.ts — The notice sent when a submission's workflow has a
 * step handled on paper, wearing the same look as every other workflow email.
 *
 * The server sends its own copy of this notice when a later step turns out to
 * be manual (`buildManualPaperWorkflowEmail` in api/_utils/workflowEmail.ts);
 * the wording here is kept the same so the two read as one message.
 */
import { buildWorkflowEmailSubject, renderWorkflowEmail, WORKFLOW_EMAIL_STATUS } from "./workflowEmailTemplate";

export interface ManualPaperSubmissionEmailParams {
  formTitle: string;
  responseItemId: string | number;
  submittedBy: string;
  referenceNo?: string;
  /** The step handled on paper, when known. */
  layer?: { layerNumber: number; type: "approval" | "evaluation"; title?: string };
  totalLayers?: number;
  /** The stored PDF record, offered as a button beside the attachment. */
  pdfUrl?: string;
}

/** The same plain sentence the server's manual notice opens with. */
export function manualPaperIntro(layerType: "approval" | "evaluation" | undefined): string {
  const noun = layerType === "approval" ? "approval" : layerType === "evaluation" ? "evaluation" : "approval or evaluation";
  return `Nobody completes this step online, so it is handled on paper. Print the attached form, complete the ${noun} by hand, and return the signed copy to HR.`;
}

export function buildManualPaperSubmissionEmail(params: ManualPaperSubmissionEmailParams): { subject: string; body: string } {
  const noun = params.layer?.type === "approval" ? "manual approval" : params.layer?.type === "evaluation" ? "manual evaluation" : "manual handling";
  const reference = (params.referenceNo ?? "").trim();
  return {
    subject: buildWorkflowEmailSubject({
      prefix: "Manual Action Required",
      formTitle: params.formTitle,
      submittedBy: params.submittedBy,
      referenceNo: reference,
      responseItemId: params.responseItemId,
    }),
    body: renderWorkflowEmail({
      preheader: `${params.formTitle} #${reference || params.responseItemId} needs ${noun}.`,
      eyebrow: "Manual workflow",
      status: WORKFLOW_EMAIL_STATUS.manual,
      heading: `${params.formTitle} needs ${noun}`,
      intro: manualPaperIntro(params.layer?.type),
      details: [
        { label: "Form", value: params.formTitle },
        { label: "Reference no.", value: reference },
        { label: "Submission ID", value: `#${params.responseItemId}` },
        { label: "Submitted by", value: params.submittedBy },
        {
          label: "Workflow stage",
          value: params.layer ? `Layer ${params.layer.layerNumber}${params.totalLayers ? ` of ${params.totalLayers}` : ""}` : "",
        },
        { label: "Layer", value: params.layer ? params.layer.title?.trim() || `Layer ${params.layer.layerNumber}` : "" },
      ],
      ...(params.pdfUrl ? { secondaryUrl: params.pdfUrl, secondaryLabel: "Open the PDF record" } : {}),
    }),
  };
}

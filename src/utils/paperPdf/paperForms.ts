/**
 * paperForms.ts — Which forms are shown and printed as HR's own Word form.
 *
 * Each of these forms has a layout of its own, matched by title, that follows
 * its Word form (Desktop › HR Form Folder): the submission popup, the reviewer
 * page and the paper-form PDF all draw it. Every other form keeps the standard
 * views; the general paper layout stays an opt-in design for them.
 */
import { isTrainingEvaluationForm } from "./trainingEvaluationLayout";

export type PaperVariant =
  | "training-evaluation"
  | "training-attendance"
  | "training-needs-analysis"
  | "training-requisition";

export function isTrainingAttendanceForm(title: string): boolean {
  return /\btraining\s+attendance\b/i.test(title);
}

export function isTrainingNeedsAnalysisForm(title: string): boolean {
  return /\btraining\s+needs?\s+analysis\b/i.test(title);
}

export function isTrainingRequisitionForm(title: string): boolean {
  return /\btraining\s+requisition\b/i.test(title);
}

/** The form's own paper layout, or null for a form that has none. */
export function paperFormVariant(title: string): PaperVariant | null {
  if (isTrainingEvaluationForm(title)) return "training-evaluation";
  if (isTrainingAttendanceForm(title)) return "training-attendance";
  if (isTrainingNeedsAnalysisForm(title)) return "training-needs-analysis";
  if (isTrainingRequisitionForm(title)) return "training-requisition";
  return null;
}

/** Whether a form is shown on screen as its paper form. */
export function hasPaperForm(title: string): boolean {
  return paperFormVariant(title) !== null;
}

/**
 * The PDF design a manual/paper step prints with: a form that has a paper
 * layout goes out as its paper form, ready to complete by hand; any other
 * form keeps the design it was published with.
 */
export function manualPaperDesign(formTitle: string): { design?: "paper" } {
  return hasPaperForm(formTitle) ? { design: "paper" } : {};
}

/**
 * An approval step on a paper form is signed off as the paper form signs it:
 * the approver signs on the Signature line, under their name and post.
 */
export function hasPaperApproval(title: string): boolean {
  const variant = paperFormVariant(title);
  return variant === "training-needs-analysis" || variant === "training-requisition";
}

import { editorial } from "../../theme/editorial";
import type { SubmissionState } from "../../utils/formSubmissionSummary";

/**
 * The dense "SAP GUI" look used by the Forms section (Available forms, My
 * Submissions, All Submissions): square bordered panels, gridlines, a grey
 * toolbar strip and a status bar. The rest of the app keeps the rounded system;
 * these tokens are for the Forms section's grids only.
 *
 * Colours come from `editorial` where it has them, so the navy and the status
 * hues are the same ones the rest of the app uses.
 */
export const sap = {
  /** Panel outlines and the toolbar / status bar rules. */
  line: "#B9C4D6",
  /** Header cell borders. */
  lineSoft: "#CDD5E2",
  /** Body cell borders. */
  cellLine: editorial.border,
  /** Column header fill. */
  headerBg: editorial.blueWash,
  /** Toolbar and status-bar fill. */
  barBg: editorial.blueSoft,
  zebra: "#F7F9FC",
  selected: editorial.sky,
  headerInk: "#344054",
  radius: 2,
  fontSize: 13,
} as const;

export const SUBMISSION_STATE_COLORS: Record<SubmissionState, { fill: string; text: string }> = {
  pending: { fill: editorial.warningFill, text: editorial.warning },
  review: { fill: editorial.navyMid, text: editorial.navyDeep },
  approved: { fill: editorial.successFill, text: editorial.success },
  rejected: { fill: editorial.errorFill, text: editorial.error },
};

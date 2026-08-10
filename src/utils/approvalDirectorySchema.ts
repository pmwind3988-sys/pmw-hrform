/**
 * approvalDirectorySchema.ts — the shape of the `Approval Directory` list.
 *
 * One row per person. The column that matters is `ApproverEmail`: it answers
 * "who approves this person", and that single answer is what lets a form say
 * "the submitter's approver" instead of naming anybody. A clerk, their HOD and
 * the CFO all route differently from the same layer configuration, because the
 * answer is per person rather than per department.
 *
 * `Position` doubles as the role for role-holder layers — "the HOD of Safety"
 * is the row with that Department and that Position — so one list answers both
 * routing questions.
 *
 * This is separate from the older `Department Approver Directory`, which maps
 * department to approver and keeps serving `department-approver` layers
 * unchanged. Nothing here touches those.
 *
 * `api/_utils/approvalDirectorySchema.ts` is the server-side copy of this file;
 * api/ cannot import from src/. Keep the two in step.
 */

export const APPROVAL_DIRECTORY_LIST = "Approval Directory";

export const APPROVAL_DIRECTORY_COLUMNS = {
  /** The person this row is about. Unique; the lookup key. */
  personEmail: "PersonEmail",
  personName: "PersonName",
  department: "Department",
  /** Job title, and the role matched by role-holder layers (e.g. "HOD"). */
  position: "Position",
  /** Identifier from whichever system HR actually keys off. Free text. */
  employeeId: "EmployeeId",
  /** Who approves this person. Empty means top of the line. */
  approverEmail: "ApproverEmail",
  /** Leavers are switched off, never deleted, so old submissions stay readable. */
  isActive: "IsActive",
} as const;

export interface ApprovalDirectoryRow {
  id?: number;
  personEmail: string;
  personName: string;
  department: string;
  position: string;
  employeeId: string;
  approverEmail: string;
  isActive: boolean;
}

/** Case- and whitespace-insensitive key for comparing addresses. */
export function directoryEmailKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Reads one SharePoint item into a row. Tolerates missing columns so a
 * half-provisioned list degrades to blanks rather than throwing.
 */
export function toApprovalDirectoryRow(fields: Record<string, unknown>): ApprovalDirectoryRow {
  const text = (key: string): string => {
    const value = fields[key];
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
  };
  const active = fields[APPROVAL_DIRECTORY_COLUMNS.isActive];
  return {
    personEmail: text(APPROVAL_DIRECTORY_COLUMNS.personEmail),
    personName: text(APPROVAL_DIRECTORY_COLUMNS.personName),
    department: text(APPROVAL_DIRECTORY_COLUMNS.department),
    position: text(APPROVAL_DIRECTORY_COLUMNS.position),
    employeeId: text(APPROVAL_DIRECTORY_COLUMNS.employeeId),
    approverEmail: text(APPROVAL_DIRECTORY_COLUMNS.approverEmail),
    // A blank cell on a freshly added column must not read as "left the company".
    isActive: active === undefined || active === null || active === "" ? true : Boolean(active),
  };
}

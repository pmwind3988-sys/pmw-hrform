/**
 * typedAddressAssignment.ts - when an admin types a different address into
 * "Send now or resend" or the scheduled email, the step's people change by
 * hand. Recording it as a hand reassignment is what keeps the automatic
 * routing check (`api/_utils/preSendRoutingCheck.ts`) from putting the routed
 * person back and mailing them instead. Pure.
 */
import { setWorkflowAssignmentOverride } from "./workflowAssignmentData";

export const TYPED_ADDRESS_REASON = "Email sent to a different address";

export interface TypedAddressInput {
  layer: number;
  /** The address the admin typed; empty when they typed none. */
  email: string;
  /** The admin. */
  updatedBy: string;
  updatedAt: string;
  /** When the submission was made, for the routed person's history line. */
  submittedAt?: string;
}

/**
 * The `WorkflowAssignmentData` to write in the same patch that rewrites the
 * step's people, or null when the typed address is the one already saved
 * (nothing changes by hand then). Built on the row as just re-read, so the
 * routing-check log it carries is kept.
 */
export function typedAddressAssignment(
  row: Record<string, unknown>,
  input: TypedAddressInput,
): string | null {
  const email = input.email.trim();
  const stored = typeof row[`L${input.layer}_Email`] === "string" ? String(row[`L${input.layer}_Email`]).trim() : "";
  if (!email || email.toLowerCase() === stored.toLowerCase()) return null;
  return JSON.stringify(setWorkflowAssignmentOverride(row.WorkflowAssignmentData, {
    layer: input.layer,
    email,
    reason: TYPED_ADDRESS_REASON,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
    previous: {
      email: stored || email,
      source: "resolved",
      updatedBy: "SYSTEM",
      updatedAt: input.submittedAt || input.updatedAt,
    },
  }));
}

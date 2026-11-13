/**
 * evaluationSubmitterRouting.ts — a layer's submitter routing rules: the first
 * rule that matches the submission names its evaluator or sends it to paper.
 *
 * Server copy of `src/utils/evaluationSubmitterRouting.ts`. Keep identical below
 * this header; a test asserts it.
 */

/**
 * One submitter routing rule, as stored on a layer. The same shape as
 * `EvaluationSubmitterRoutingRule` in `src/types`, declared here because the
 * server copy cannot import from src/.
 */
export interface SubmitterRoutingRule {
  id: string;
  label: string;
  emailField?: string;
  emailValue?: string;
  employeeIdField?: string;
  employeeIdValue?: string;
  userIdField?: string;
  userIdValue?: string;
  fullNameField?: string;
  fullNameValue?: string;
  action: "assign-evaluator" | "manual-paper" | "send-to-configured-sender";
  evaluatorEmail?: string;
}

export interface EvaluationSubmitterRoutingResult {
  rule: SubmitterRoutingRule;
  email?: string;
  manualPaper: boolean;
  sendToConfiguredSender: boolean;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalized(value: unknown): string {
  return text(value).toLowerCase();
}

function fieldValue(data: Record<string, unknown>, fieldName: string | undefined): string {
  if (!fieldName) return "";
  if (Object.prototype.hasOwnProperty.call(data, fieldName)) return text(data[fieldName]);
  const target = fieldName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const found = Object.keys(data).find((key) => key.toLowerCase().replace(/_x[0-9a-f]{4}_/g, "").replace(/[^a-z0-9]+/g, "") === target);
  return found ? text(data[found]) : "";
}

function ruleMatches(rule: SubmitterRoutingRule, data: Record<string, unknown>): boolean {
  const expectedEmail = normalized(rule.emailValue);
  const expectedEmployeeId = normalized(rule.employeeIdValue);
  const expectedUserId = normalized(rule.userIdValue);
  const expectedFullName = normalized(rule.fullNameValue);
  const hasEmailCondition = !!expectedEmail;
  const hasEmployeeCondition = !!expectedEmployeeId;
  const hasUserIdCondition = !!expectedUserId;
  const hasFullNameCondition = !!expectedFullName;
  if (!hasEmailCondition && !hasEmployeeCondition && !hasUserIdCondition && !hasFullNameCondition) return false;

  if (hasEmailCondition) {
    const submittedBy = normalized(data.SubmittedBy);
    const fieldEmail = normalized(fieldValue(data, rule.emailField));
    if (submittedBy !== expectedEmail && fieldEmail !== expectedEmail) return false;
  }

  if (hasEmployeeCondition) {
    const actualEmployeeId = normalized(fieldValue(data, rule.employeeIdField));
    if (actualEmployeeId !== expectedEmployeeId) return false;
  }

  if (hasUserIdCondition) {
    const actualUserId = normalized(fieldValue(data, rule.userIdField));
    if (actualUserId !== expectedUserId) return false;
  }

  if (hasFullNameCondition) {
    const actualFullName = normalized(fieldValue(data, rule.fullNameField));
    if (actualFullName !== expectedFullName) return false;
  }

  return true;
}

export function resolveEvaluationSubmitterRouting(
  layer: { submitterRoutingRules?: readonly SubmitterRoutingRule[] },
  data: Record<string, unknown>,
): EvaluationSubmitterRoutingResult | null {
  const rule = (layer.submitterRoutingRules ?? []).find((candidate) => ruleMatches(candidate, data));
  if (!rule) return null;
  return {
    rule,
    email: rule.action === "assign-evaluator" ? text(rule.evaluatorEmail) : undefined,
    manualPaper: rule.action === "manual-paper" || rule.action === "send-to-configured-sender",
    sendToConfiguredSender: rule.action === "send-to-configured-sender",
  };
}

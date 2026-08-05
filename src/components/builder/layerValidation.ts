import type { LayerConfig, LayerConfigItem, ManualBranch } from "../../types";
import { parseEmailList } from "../../utils/layerRecipients";
import {
  enabledIdentityFields,
  IDENTITY_EMAIL_KEY,
  isIdentityDomain,
  MAX_PUBLIC_LINK_TTL_HOURS,
  MIN_PUBLIC_LINK_TTL_HOURS,
  normalizePublicAccessConfig,
} from "../../utils/publicIdentity";

export interface LayerFieldOption {
  name: string;
  title?: string;
  type?: string;
  inputType?: string;
}

export interface LayerValidationResult {
  errors: string[];
  warnings: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidLayerEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

function displayLayerLabel(scope: string, layer: LayerConfigItem, index: number): string {
  return `${scope} layer ${layer.layerNumber || index + 1}`;
}

function validateLayer(
  layer: LayerConfigItem,
  index: number,
  scope: string,
  fieldNames: Set<string>,
): LayerValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const label = displayLayerLabel(scope, layer, index);

  if (layer.authMode === "365") {
    const assigneeValue = layer.assignee?.value?.trim() || "";
    if (!assigneeValue) {
      errors.push(`${label}: assign an approver, email field, or department lookup.`);
    } else if (layer.assignee.type === "user" && !isValidLayerEmail(assigneeValue)) {
      errors.push(`${label}: static assignee must be a valid email address.`);
    } else if (layer.assignee.type === "users") {
      const emails = parseEmailList(assigneeValue);
      const invalid = emails.filter((email) => !isValidLayerEmail(email));
      if (emails.length === 0) {
        errors.push(`${label}: add at least one assignee email.`);
      } else if (invalid.length > 0) {
        errors.push(`${label}: these assignee addresses are not valid emails — ${invalid.join(", ")}.`);
      }
    } else if (layer.assignee.type === "distribution-list" && !isValidLayerEmail(assigneeValue)) {
      errors.push(`${label}: the distribution list must be a valid email address.`);
    } else if (layer.assignee.type === "field-reference" && !fieldNames.has(assigneeValue)) {
      errors.push(`${label}: field reference "${assigneeValue}" does not exist in the form.`);
    } else if (layer.assignee.type === "department-approver") {
      if (!fieldNames.has(assigneeValue)) {
        errors.push(`${label}: department field "${assigneeValue}" does not exist in the form.`);
      }
      if (!layer.assignee.listName?.trim()) {
        errors.push(`${label}: department approver lookup needs a SharePoint list name.`);
      }
      if (!layer.assignee.departmentColumn?.trim()) {
        errors.push(`${label}: department approver lookup needs a department column.`);
      }
      if (!layer.assignee.emailColumn?.trim()) {
        errors.push(`${label}: department approver lookup needs an email column.`);
      }
    }
  }

  if (layer.authMode === "public") {
    const access = normalizePublicAccessConfig(layer.publicAccess);
    const identityFields = enabledIdentityFields(access);
    const emailCollected = identityFields.some((field) => field.key === IDENTITY_EMAIL_KEY);

    // The link is mailed, never displayed, so a layer nobody is addressed to
    // produces a submission that silently stalls.
    if (!layer.assignee?.value?.trim() && parseEmailList(layer.notifyEmails).length === 0) {
      errors.push(`${label}: public layers still need someone to send the link to.`);
    }

    const rawTtl = layer.publicAccess?.linkTtlHours;
    if (rawTtl !== undefined && (!Number.isFinite(rawTtl) || rawTtl < MIN_PUBLIC_LINK_TTL_HOURS || rawTtl > MAX_PUBLIC_LINK_TTL_HOURS)) {
      errors.push(`${label}: link validity must be between ${MIN_PUBLIC_LINK_TTL_HOURS} and ${MAX_PUBLIC_LINK_TTL_HOURS} hours.`);
    } else if (access.linkTtlHours > 720) {
      warnings.push(`${label}: a link valid for ${Math.round(access.linkTtlHours / 24)} days is a long-lived credential in someone's inbox.`);
    }

    if (access.requireIdentity && identityFields.length === 0) {
      errors.push(`${label}: turn on at least one detail to collect, or switch off the declaration requirement.`);
    }
    if (!access.requireIdentity) {
      warnings.push(`${label}: nobody is recorded as the approver — the decision will show as SYSTEM.`);
    }

    const invalidDomains = access.allowedEmailDomains.filter((domain) => !isIdentityDomain(domain));
    if (invalidDomains.length > 0) {
      errors.push(`${label}: these are not valid email domains — ${invalidDomains.join(", ")}.`);
    }
    if (access.allowedEmailDomains.length > 0 && !emailCollected) {
      errors.push(`${label}: restricting email domains needs the email detail turned on.`);
    }
    if (access.requireAssigneeEmailMatch) {
      if (!emailCollected) {
        errors.push(`${label}: matching against the assignee needs the email detail turned on.`);
      } else if (layer.assignee?.type === "field-reference" || layer.assignee?.type === "department-approver") {
        warnings.push(`${label}: the assignee is resolved per submission, so what counts as a match varies by submission.`);
      }
    }
  }

  if (layer.type === "evaluation" && layer.authMode === "365" && layer.assignee.type === "field-reference") {
    warnings.push(`${label}: the referenced field must contain an email address when the submission is reviewed.`);
  }

  if (
    layer.type === "evaluation" &&
    layer.emailSchedule?.mode === "custom_days" &&
    (!Number.isInteger(layer.emailSchedule.customDays) || (layer.emailSchedule.customDays ?? 0) < 1)
  ) {
    errors.push(`${label} custom evaluator email delay must be at least 1 whole day.`);
  }
  if (layer.authMode === "365" && layer.assignee.type === "department-approver") {
    warnings.push(`${label}: department matching is exact; keep the form choices aligned with the approver directory.`);
  }

  if (layer.authMode === "365" && layer.assignee.type === "distribution-list") {
    warnings.push(`${label}: distribution list members are read at submit time and need the Group.Read.All Graph permission.`);
  }

  const notifyEmails = parseEmailList(layer.notifyEmails);
  const invalidNotify = notifyEmails.filter((email) => !isValidLayerEmail(email));
  if (invalidNotify.length > 0) {
    errors.push(`${label}: these notification addresses are not valid emails — ${invalidNotify.join(", ")}.`);
  }
  if (layer.notifyRecipientMode === "notify-only" && notifyEmails.length === 0) {
    errors.push(`${label}: notify-only delivery needs at least one notification mailbox.`);
  }
  if (layer.notifyRecipientMode === "notify-only" && notifyEmails.length > 0) {
    warnings.push(`${label}: the assignee is not emailed directly — they only hear about this through ${notifyEmails.join(", ")}.`);
  }

  return { errors, warnings };
}

function validateBranch(
  branch: ManualBranch,
  index: number,
  fieldNames: Set<string>,
): LayerValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const branchLabel = branch.label || branch.name || `Branch ${index + 1}`;

  if (!branch.name.trim()) {
    errors.push(`Branch ${index + 1}: add a branch key.`);
  }
  if (branch.layers.length === 0) {
    errors.push(`${branchLabel}: add at least one layer.`);
  }

  branch.layers.forEach((layer, layerIndex) => {
    const result = validateLayer(layer, layerIndex, branchLabel, fieldNames);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  });

  return { errors, warnings };
}

export function validateLayerConfig(
  config: LayerConfig | null,
  fields: LayerFieldOption[],
): LayerValidationResult {
  if (!config) return { errors: [], warnings: [] };

  const errors: string[] = [];
  const warnings: string[] = [];
  const fieldNames = new Set(fields.map((field) => field.name).filter(Boolean));
  const branches = config.manualBranches ?? [];

  if (config.manualBranches && branches.length === 0) {
    errors.push("Manual branching is enabled; add at least one branch or disable manual branching.");
  }

  config.layers.forEach((layer, index) => {
    const result = validateLayer(layer, index, "Main sequence", fieldNames);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  });

  if (branches.length > 0) {
    const seen = new Set<string>();
    branches.forEach((branch, index) => {
      const normalizedName = branch.name.trim().toLowerCase();
      if (normalizedName) {
        if (seen.has(normalizedName)) {
          errors.push(`Branch ${index + 1}: branch key "${branch.name}" is duplicated.`);
        }
        seen.add(normalizedName);
      }

      const result = validateBranch(branch, index, fieldNames);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    });
  }

  return { errors, warnings };
}

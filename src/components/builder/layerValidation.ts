import type { LayerConfig, LayerConfigItem, ManualBranch } from "../../types";
import { parseEmailList } from "../../utils/layerRecipients";
import {
  expirySourceForms,
  findExpirySourceForm,
  isDateProducingField,
} from "./publicLinkExpirySources";

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

/**
 * What a layer needs in order to be checked. `siblings` is the sequence the
 * layer sits in — its own branch, or the main one — because a public link may
 * take its expiry date from an earlier layer's review form, and only its
 * siblings can say whether that layer asks the question named.
 */
interface LayerValidationContext {
  fields: LayerFieldOption[];
  fieldNames: Set<string>;
  siblings: LayerConfigItem[];
}

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
  context: LayerValidationContext,
): LayerValidationResult {
  const { fieldNames } = context;
  const errors: string[] = [];
  const warnings: string[] = [];
  const label = displayLayerLabel(scope, layer, index);

  if (layer.authMode === "365") {
    const assigneeValue = layer.assignee?.value?.trim() || "";
    // The directory-driven modes are checked first: they are the two whose
    // `value` is legitimately empty (a reporting line starting at the submitter
    // names nobody), so the "assign somebody" check below would wrongly block
    // publishing them.
    if (layer.assignee.type === "chain") {
      if (layer.assignee.startFrom === "field" && !fieldNames.has(assigneeValue)) {
        errors.push(assigneeValue
          ? `${label}: field "${assigneeValue}" does not exist in the form.`
          : `${label}: choose the field naming the person to start the approval line from.`);
      }
      if (!Number.isInteger(layer.assignee.hops) || layer.assignee.hops < 1) {
        errors.push(`${label}: the approval line must go up at least one step.`);
      }
      if (layer.assignee.startFrom === "previous-actor" && layer.layerNumber <= 1) {
        errors.push(`${label}: there is no previous approver to start from on the first step.`);
      }
      warnings.push(`${label}: approvers come from the Approval Directory. Anyone missing from it parks for routing rather than failing.`);
    } else if (layer.assignee.type === "role-holder") {
      if (!layer.assignee.role?.trim()) {
        errors.push(`${label}: name the role to look for, such as HOD.`);
      }
      if (layer.assignee.department === "fixed" && !assigneeValue) {
        errors.push(`${label}: name the department whose head should approve.`);
      }
      if (layer.assignee.department === "from-field" && !fieldNames.has(assigneeValue)) {
        errors.push(assigneeValue
          ? `${label}: department field "${assigneeValue}" does not exist in the form.`
          : `${label}: choose the field holding the department.`);
      }
      warnings.push(`${label}: the role and department must match an Approval Directory row exactly.`);
    } else if (!assigneeValue) {
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
    if (!layer.publicToken?.trim()) {
      errors.push(`${label}: public layers need an access token.`);
    }
    if (layer.tokenExpiry?.mode === "field") {
      // A field-driven expiry has no single date to check, so what is validated
      // is that the question exists in the form it is read from and can
      // plausibly hold a date. The runtime leaves a link open when it cannot
      // read one, which is worth saying at publish time rather than leaving to
      // be discovered per submission.
      const fieldName = layer.tokenExpiry.field?.trim() || "";
      const sourceLayer = Number(layer.tokenExpiry.sourceLayer) > 0
        ? Number(layer.tokenExpiry.sourceLayer)
        : 0;
      const source = findExpirySourceForm(
        expirySourceForms(context.siblings, index, context.fields),
        sourceLayer,
      );
      const field = source?.questions.find((question) => question.name === fieldName);
      const offsetDays = layer.tokenExpiry.offsetDays ?? 0;
      if (!fieldName) {
        errors.push(`${label}: public link expiry reads a form field, but no field is chosen.`);
      } else if (!source) {
        // A source that is gone reads as a missing field when it is the
        // submitted form, and as a bad layer choice when it is a layer.
        errors.push(sourceLayer === 0
          ? `${label}: public link expiry field "${fieldName}" does not exist in the form.`
          : `${label}: public link expiry reads from layer ${sourceLayer}, which is not an earlier layer that collects answers.`);
      } else if (!field) {
        errors.push(`${label}: public link expiry field "${fieldName}" does not exist in ${source.description}.`);
      } else if (!isDateProducingField(field)) {
        warnings.push(`${label}: public link expiry field "${field.title || fieldName}" is not a date question; a submission whose answer cannot be read as a date gets a link that never expires.`);
      }
      if (!Number.isInteger(offsetDays) || offsetDays < 0) {
        errors.push(`${label}: public link expiry grace must be a whole number of days, or zero.`);
      }
    } else if (!layer.tokenExpiresAt?.trim()) {
      errors.push(`${label}: public layers need an expiry date.`);
    } else if (Number.isNaN(Date.parse(layer.tokenExpiresAt))) {
      errors.push(`${label}: public link expiry is not a valid date.`);
    } else if (new Date(layer.tokenExpiresAt).getTime() <= Date.now()) {
      warnings.push(`${label}: public link has already expired.`);
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
  formContext: Omit<LayerValidationContext, "siblings">,
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
    // A branch layer reads only from its own branch: a layer in a branch the
    // submission did not take never ran for it.
    const result = validateLayer(layer, layerIndex, branchLabel, {
      ...formContext,
      siblings: branch.layers,
    });
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
    const result = validateLayer(layer, index, "Main sequence", {
      fields,
      fieldNames,
      siblings: config.layers,
    });
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

      const result = validateBranch(branch, index, { fields, fieldNames });
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    });
  }

  return { errors, warnings };
}

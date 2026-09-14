/** variables.ts — What an admin may drop into a text or table block. */
/**
 * Tokens are namespaced (`field:`, `meta:`, `layer:`) so a question named
 * `submittedBy` cannot shadow the built-in of the same name.
 */
import { fieldsFromSurveyJson } from "../formFieldCatalog";

export interface PdfVariable {
  token: string;
  label: string;
  group: string;
}

export const BUILTIN_VARIABLES: PdfVariable[] = [
  { token: "meta:submittedBy", label: "Submitted by", group: "Submission" },
  { token: "meta:submittedAt", label: "Date submitted", group: "Submission" },
  { token: "meta:referenceNo", label: "Reference number", group: "Submission" },
  { token: "meta:formStatus", label: "Status", group: "Submission" },
  { token: "meta:formTitle", label: "Form title", group: "Submission" },
  { token: "meta:formVersion", label: "Form version", group: "Submission" },
  { token: "meta:company", label: "Company", group: "Submission" },
  { token: "meta:isoStandards", label: "ISO standards", group: "Submission" },
];

const LAYER_PROPERTIES: { key: string; label: string }[] = [
  { key: "email", label: "assignee" },
  { key: "status", label: "decision" },
  { key: "signedAt", label: "signed at" },
  { key: "rejection", label: "remarks" },
  { key: "confirmerName", label: "name" },
];

export function buildVariableCatalogue(surveyJson: unknown, layerCount: number): PdfVariable[] {
  const fields = fieldsFromSurveyJson(surveyJson).map((field) => ({
    token: `field:${field.key}`,
    label: field.label.trim() || field.key,
    group: "Form fields",
  }));

  const layers: PdfVariable[] = [];
  for (let n = 1; n <= layerCount; n += 1) {
    for (const property of LAYER_PROPERTIES) {
      layers.push({ token: `layer:${n}:${property.key}`, label: `Layer ${n} ${property.label}`, group: `Layer ${n}` });
    }
  }

  return [...fields, ...BUILTIN_VARIABLES, ...layers];
}

/**
 * formImport.ts — publish forms from definition files, many at once.
 *
 * A definition file is a published form's SurveyJSON (`{ title, pages }`), as
 * the builder's JSON panel shows it. The file name gives the slug:
 * `f1-drilling.form.json` publishes at /form/f1-drilling. Each form is
 * published the way the builder's "Actual publish" does it for a new form —
 * response list, Form Config, approvers, version, log entry — with the builder's
 * defaults for everything a file does not carry.
 *
 * Only new forms are published. A file whose title or slug is already taken is
 * reported and skipped, so importing never overwrites a live form; changing one
 * stays a job for the builder, where the diff and version bump are recorded.
 */
import type { LayerConfig, SurveyJson } from "../types";
import {
  DEFAULT_PUBLISH_KEY,
  logEvent,
  provisionFormList,
  saveFormVersion,
  slugify,
  upsertApprovers,
  upsertFormConfig,
} from "./formBuilderSP";
import { parseEmailList } from "./layerRecipients";
import { DEFAULT_REFERENCE_CONFIG, serializeReferenceNumberConfig } from "./referenceNumber";
import {
  DEFAULT_COMPANIES,
  DEFAULT_DOCUMENT_HEADER,
  DEFAULT_ISO_STANDARDS,
  DEFAULT_PDF_CONFIG,
  withDocumentHeaderDefaults,
} from "./publishDefaults";

export interface ImportFile {
  name: string;
  text: string;
}

export type PlanStatus = "ready" | "exists" | "invalid";

export interface PlannedForm {
  fileName: string;
  slug: string;
  title: string;
  formId: string;
  surveyJson: SurveyJson | null;
  status: PlanStatus;
  /** Why the file is skipped; absent when it is ready. */
  reason?: string;
}

/** The forms already on the site, as `getAllFormConfigs` returns them. */
export interface ExistingForm {
  Title: string;
  Slug?: string;
}

const VERSION = "1.0";
const PUBLISH_LABEL = "Production";

export function slugFromFileName(name: string): string {
  return slugify(name.replace(/^.*[\\/]/, "").replace(/(\.form)?\.json$/i, ""));
}

function readDefinition(text: string): { json: SurveyJson | null; reason?: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { json: null, reason: "Not valid JSON." };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { json: null, reason: "Not a form definition." };
  const json = raw as SurveyJson & { title?: unknown; pages?: unknown };
  if (typeof json.title !== "string" || !json.title.trim()) return { json: null, reason: "The form has no title." };
  const pages = Array.isArray(json.pages) ? (json.pages as { elements?: unknown }[]) : [];
  if (!pages.some((page) => Array.isArray(page?.elements) && page.elements.length > 0)) {
    return { json: null, reason: "The form has no questions." };
  }
  return { json };
}

/**
 * Reads each file and decides whether it can be published. Pure: the caller
 * supplies the forms already on the site.
 */
export function planImport(files: ImportFile[], existing: ExistingForm[]): PlannedForm[] {
  const takenTitles = new Set(existing.map((f) => f.Title.trim().toLowerCase()));
  const takenSlugs = new Set(existing.map((f) => slugify(f.Slug ?? "")).filter(Boolean));
  const batchTitles = new Set<string>();
  const batchSlugs = new Set<string>();

  return files.map((file) => {
    const slug = slugFromFileName(file.name);
    const { json, reason } = readDefinition(file.text);
    const title = json ? String((json as { title: string }).title).trim() : "";
    const base = { fileName: file.name, slug, title, formId: slug.toUpperCase(), surveyJson: json };

    if (!json) return { ...base, status: "invalid" as const, reason };
    if (!slug) return { ...base, status: "invalid" as const, reason: "The file name gives no slug." };
    if (takenTitles.has(title.toLowerCase())) return { ...base, status: "exists" as const, reason: `A form titled "${title}" is already on this site.` };
    if (takenSlugs.has(slug)) return { ...base, status: "exists" as const, reason: `/form/${slug} is already taken on this site.` };
    if (batchTitles.has(title.toLowerCase()) || batchSlugs.has(slug)) {
      return { ...base, status: "invalid" as const, reason: "Another file in this import has the same title or slug." };
    }
    batchTitles.add(title.toLowerCase());
    batchSlugs.add(slug);
    return { ...base, status: "ready" as const };
  });
}

/**
 * One approval layer for every imported form. Several addresses make any one of
 * them able to sign, as the builder's "users" assignee does. Returns null when
 * no address is given, which publishes the forms without approval.
 */
export function singleApprovalLayer(title: string, assignees: string): LayerConfig | null {
  const emails = parseEmailList(assignees);
  if (emails.length === 0) return null;
  return {
    version: "1.0",
    layers: [{
      layerNumber: 1,
      type: "approval",
      authMode: "365",
      assignee: emails.length === 1 ? { type: "user", value: emails[0] } : { type: "users", value: emails.join(", ") },
      title: title.trim() || "Layer 1",
      confirmationType: "signature",
      allowRejectionReason: true,
    }],
  };
}

export interface PublishOptions {
  layerConfig: LayerConfig | null;
  isPublic: boolean;
  changedBy: string;
  onLog?: (msg: string, type: string) => void;
}

export const publishDeps = { provisionFormList, upsertFormConfig, upsertApprovers, saveFormVersion, logEvent };
export type PublishDeps = typeof publishDeps;

/** Publishes one planned form as a new live form, in the builder's order. */
export async function publishPlannedForm(
  token: string,
  form: PlannedForm,
  { layerConfig, isPublic, changedBy, onLog = () => {} }: PublishOptions,
  deps: PublishDeps = publishDeps,
): Promise<void> {
  if (form.status !== "ready" || !form.surveyJson) throw new Error(form.reason ?? "This form is not ready to publish.");
  const { title, slug, formId, surveyJson } = form;
  const numLayers = layerConfig?.layers.length ?? 0;
  const publishKey = DEFAULT_PUBLISH_KEY;

  await deps.provisionFormList(token, title, surveyJson, onLog, { numLayers, minLayerColumns: 3 });
  await deps.upsertFormConfig(token, title, {
    formId,
    numLayers,
    slug,
    version: VERSION,
    currentPublishKey: publishKey,
    currentPublishLabel: PUBLISH_LABEL,
    isPublished: true,
    isPublic,
    conditionField: "",
    approvalRules: null,
    layerConfig: layerConfig ? JSON.stringify(layerConfig) : "",
    referenceConfig: serializeReferenceNumberConfig(DEFAULT_REFERENCE_CONFIG),
    groupByField: "",
  });
  if (layerConfig && numLayers > 0) {
    await deps.upsertApprovers(token, title, layerConfig.layers.map((layer) => ({
      email: layer.assignee.type === "user" ? layer.assignee.value : "",
      name: layer.title ?? "",
    })));
  }
  await deps.saveFormVersion(token, {
    listTitle: title,
    slug,
    version: VERSION,
    publishKey,
    publishLabel: PUBLISH_LABEL,
    surveyJson,
    meta: {
      isoStandards: DEFAULT_ISO_STANDARDS,
      companies: DEFAULT_COMPANIES,
      companyChoiceEnabled: false,
      formId,
      formVersion: VERSION,
      publishKey,
      publishLabel: PUBLISH_LABEL,
      documentHeader: withDocumentHeaderDefaults(DEFAULT_DOCUMENT_HEADER, formId, VERSION),
      showBanner: true,
      logoUrl: "",
      pdfConfig: DEFAULT_PDF_CONFIG,
      pdfTemplate: undefined,
    },
    changedBy,
    layerConfig,
  });
  await deps.logEvent(token, {
    formTitle: title,
    eventType: "FORM_CREATED",
    changedBy,
    summary: `Created form at /form/${slug} from ${form.fileName}`,
    before: null,
    after: { slug, version: VERSION, publishKey, publishLabel: PUBLISH_LABEL },
  });
}

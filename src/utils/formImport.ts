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
 * By default only new forms are published: a file whose title or slug is
 * already taken is reported and skipped, so importing never overwrites a live
 * form. With `updateExisting`, such a file is published instead as the form's
 * next version, the way the builder's republish does it: the form keeps its
 * workflow, approvers, address, publish profile, label and document header,
 * and its response list only gains columns for questions it did not have.
 */
import type { LayerConfig, SurveyJson } from "../types";
import {
  DEFAULT_PUBLISH_KEY,
  getFormConfigByTitle,
  getFormVersion,
  getFormVersionHistory,
  incrementMinor,
  isVersionGreater,
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

/** `update`: already on the site, and will be published as its next version. */
export type PlanStatus = "ready" | "update" | "exists" | "invalid";

export interface PlannedForm {
  fileName: string;
  slug: string;
  title: string;
  formId: string;
  surveyJson: SurveyJson | null;
  status: PlanStatus;
  /** Why the file is skipped; absent when it is ready. */
  reason?: string;
  /** For an update, the title of the form on the site, which names its lists. */
  existingTitle?: string;
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

export interface PlanOptions {
  /** Plan forms already on the site as `update` instead of skipping them. */
  updateExisting?: boolean;
}

/**
 * Reads each file and decides whether it can be published. Pure: the caller
 * supplies the forms already on the site.
 */
export function planImport(files: ImportFile[], existing: ExistingForm[], { updateExisting = false }: PlanOptions = {}): PlannedForm[] {
  const byTitle = new Map(existing.map((f) => [f.Title.trim().toLowerCase(), f]));
  const bySlug = new Map(existing.filter((f) => slugify(f.Slug ?? "")).map((f) => [slugify(f.Slug ?? ""), f]));
  const batchTitles = new Set<string>();
  const batchSlugs = new Set<string>();

  return files.map((file) => {
    const slug = slugFromFileName(file.name);
    const { json, reason } = readDefinition(file.text);
    const title = json ? String((json as { title: string }).title).trim() : "";
    const base = { fileName: file.name, slug, title, formId: slug.toUpperCase(), surveyJson: json };

    if (!json) return { ...base, status: "invalid" as const, reason };
    if (!slug) return { ...base, status: "invalid" as const, reason: "The file name gives no slug." };
    const sameTitle = byTitle.get(title.toLowerCase());
    const sameSlug = bySlug.get(slug);
    if (batchTitles.has(title.toLowerCase()) || batchSlugs.has(slug)) {
      return { ...base, status: "invalid" as const, reason: "Another file in this import has the same title or slug." };
    }
    if (sameTitle || sameSlug) {
      const reason = sameTitle
        ? `A form titled "${title}" is already on this site.`
        : `/form/${slug} is already taken on this site.`;
      if (!updateExisting) return { ...base, status: "exists" as const, reason };
      if (sameTitle && sameSlug && sameTitle !== sameSlug) {
        return { ...base, status: "invalid" as const, reason: `Its title is "${sameTitle.Title}" and its address belongs to "${sameSlug.Title}": two different forms, so neither is updated.` };
      }
      batchTitles.add(title.toLowerCase());
      batchSlugs.add(slug);
      return { ...base, status: "update" as const, existingTitle: (sameTitle ?? sameSlug)!.Title };
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

export const publishDeps = {
  provisionFormList,
  upsertFormConfig,
  upsertApprovers,
  saveFormVersion,
  logEvent,
  getFormConfigByTitle,
  getFormVersion,
  getFormVersionHistory,
};
export type PublishDeps = typeof publishDeps;

/** One minor version past the highest the form has had, current or saved. */
export function nextFormVersion(current: string, saved: string[]): string {
  const highest = [current, ...saved]
    .map((v) => (v ?? "").trim())
    .filter((v) => /^\d+(\.\d+)?$/.test(v))
    .reduce((top, v) => (isVersionGreater(v, top) ? v : top), "1.0");
  return incrementMinor(highest);
}

/**
 * Publishes one planned form: a new form in the builder's order, or, for an
 * `update` plan, the file as the existing form's next version.
 */
export async function publishPlannedForm(
  token: string,
  form: PlannedForm,
  options: PublishOptions,
  deps: PublishDeps = publishDeps,
): Promise<void> {
  if (form.status === "update" && form.surveyJson) return publishUpdate(token, form, options, deps);
  if (form.status !== "ready" || !form.surveyJson) throw new Error(form.reason ?? "This form is not ready to publish.");
  const { layerConfig, isPublic, changedBy, onLog = () => {} } = options;
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

/**
 * Saves the file as the next version of a form already on the site. The
 * import's own approval step and link setting are not used: the form keeps
 * its workflow, approvers, address, profile, label and header. Everything is
 * read before anything is written, so a form that cannot be read is left as
 * it was.
 */
async function publishUpdate(
  token: string,
  form: PlannedForm,
  { changedBy, onLog = () => {} }: PublishOptions,
  deps: PublishDeps,
): Promise<void> {
  const title = form.existingTitle ?? form.title;
  const surveyJson = form.surveyJson as SurveyJson;
  const config = await deps.getFormConfigByTitle(token, title);
  if (!config) throw new Error(`"${title}" is no longer on this site.`);
  const currentVersion = config.CurrentVersion?.trim() || "1.0";
  const publishKey = config.CurrentPublishKey?.trim() || DEFAULT_PUBLISH_KEY;
  const current = await deps.getFormVersion(token, title, currentVersion, publishKey);
  if (!current) throw new Error(`Could not read the current version (v${currentVersion}) of "${title}", so its settings cannot be kept.`);
  const history = await deps.getFormVersionHistory(token, title);
  const version = nextFormVersion(currentVersion, history.map((h) => h.FormVersion));

  const slug = config.Slug?.trim() || form.slug;
  const formId = config.FormID?.trim() || form.formId;
  const publishLabel = config.CurrentPublishLabel?.trim() || current.publishLabel?.trim() || PUBLISH_LABEL;
  const numLayers = Number(config.NumberOfApprovalLayer) || 0;
  const currentMeta = (current.meta ?? {}) as Record<string, unknown>;
  let approvalRules: unknown;
  try { approvalRules = config.ApprovalRules ? JSON.parse(config.ApprovalRules) : null; } catch { approvalRules = null; }

  await deps.provisionFormList(token, title, surveyJson, onLog, { numLayers, minLayerColumns: 3 });
  await deps.saveFormVersion(token, {
    listTitle: title,
    slug,
    version,
    publishKey,
    publishLabel,
    surveyJson,
    meta: { ...currentMeta, formVersion: version },
    changedBy,
    layerConfig: current.layerConfig,
  });
  // Only now does the form point at the new version: a failed save above
  // leaves the live form on the version it had.
  await deps.upsertFormConfig(token, title, {
    formId,
    numLayers,
    slug,
    version,
    currentPublishKey: publishKey,
    currentPublishLabel: publishLabel,
    isPublished: config.IsPublished ?? true,
    isPublic: config.IsPublic ?? true,
    conditionField: config.ConditionField ?? "",
    approvalRules,
    layerConfig: config.LayerConfig ?? "",
    referenceConfig: config.ReferenceConfig ?? "",
    groupByField: config.GroupByField ?? "",
  });
  await deps.logEvent(token, {
    formTitle: title,
    eventType: "PUBLISHED",
    changedBy,
    summary: `Published v${version} (${publishLabel}) from ${form.fileName}`,
    before: { version: currentVersion },
    after: { version, slug, publishKey, publishLabel },
  });
}

/**
 * submissionLayerConfig.ts — the workflow a submission was made under.
 *
 * Read from the submission's own form version and publish profile, falling back
 * to the Master Form's current `LayerConfig` when that version carries none.
 * Shared by the reviewer endpoint (`api/evaluate.ts`) and the pre-send routing
 * check, which must agree on it: a check against a different workflow than the
 * reviewer page then opens would correct a step to the wrong people.
 */
import { queryWebFormVersion } from "./graphClient.js";

export interface SubmissionLayerConfig {
  layers: Record<string, unknown>[];
  manualBranches?: { name?: string; label?: string; layers?: Record<string, unknown>[] }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A `Web Form Versions` row's `SurveyJSON`, split into its parts. */
export function parseVersionPayload(raw: unknown): { surveyJson: unknown; meta: Record<string, unknown>; layerConfig: Record<string, unknown> | null } {
  if (typeof raw !== "string" || !raw.trim()) return { surveyJson: null, meta: {}, layerConfig: null };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      surveyJson: parsed.surveyJson || parsed,
      meta: isRecord(parsed.meta) ? parsed.meta : {},
      layerConfig: isRecord(parsed.layerConfig) ? parsed.layerConfig : null,
    };
  } catch {
    return { surveyJson: null, meta: {}, layerConfig: null };
  }
}

/** Which version and profile a submission was made under. */
export function submissionVersionKey(
  formConfig: Record<string, unknown>,
  itemFields: Record<string, unknown>,
): { formVersion: string; publishKey: string } {
  return {
    formVersion: String(itemFields.FormVersion || formConfig.CurrentVersion || "1.0"),
    publishKey: String(itemFields.PublishKey || formConfig.CurrentPublishKey || ""),
  };
}

/**
 * The layer config and survey JSON for one submission. `layerConfig` is null
 * when neither the version nor the Master Form holds a parseable one;
 * `surveyJson` is null when the version row could not be read.
 */
export async function loadSubmissionLayerConfig(
  token: string,
  formTitle: string,
  formConfig: Record<string, unknown>,
  itemFields: Record<string, unknown>,
): Promise<{ layerConfig: SubmissionLayerConfig | null; surveyJson: unknown }> {
  const { formVersion, publishKey } = submissionVersionKey(formConfig, itemFields);
  const versionRow = formVersion
    ? (await queryWebFormVersion(token, formTitle, formVersion, publishKey || undefined))?.fields
    : null;
  const versionPayload = parseVersionPayload(versionRow?.SurveyJSON);

  let layerConfig: SubmissionLayerConfig | null = null;
  const rawLayerConfig = versionPayload.layerConfig
    ? JSON.stringify(versionPayload.layerConfig)
    : formConfig.LayerConfig as string | undefined;
  if (rawLayerConfig) {
    try { layerConfig = JSON.parse(rawLayerConfig); } catch { /* invalid JSON, fall through */ }
  }
  return { layerConfig, surveyJson: versionPayload.surveyJson };
}

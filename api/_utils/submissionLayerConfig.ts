/**
 * submissionLayerConfig.ts — the workflow a submission was made under.
 *
 * Read from the submission's own form version and publish profile, falling back
 * to the Master Form's current `LayerConfig` when that version carries none.
 * Shared by the reviewer endpoint (`api/evaluate.ts`) and the pre-send routing
 * check, which must agree on it: a check against a different workflow than the
 * reviewer page then opens would correct a step to the wrong people.
 */
import { queryListItemByFields, queryWebFormVersion } from "./graphClient.js";

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
 *
 * `strict` is for callers that act on the answer by changing who may act (the
 * pre-send routing check). It reads exactly the version and publish key the
 * row records and throws when that row cannot be read, instead of quietly using
 * the Master Form's current workflow, which the submission may not have been
 * made under. Only a row that records no form version (older submissions) falls
 * back to the Master Form, as the reviewer page does; so does a version row
 * that was read but carries no layer config.
 */
export async function loadSubmissionLayerConfig(
  token: string,
  formTitle: string,
  formConfig: Record<string, unknown>,
  itemFields: Record<string, unknown>,
  options: { strict?: boolean } = {},
): Promise<{ layerConfig: SubmissionLayerConfig | null; surveyJson: unknown }> {
  let versionRow: Record<string, unknown> | null | undefined;
  if (options.strict) {
    const recordedVersion = String(itemFields.FormVersion || "").trim();
    const recordedKey = String(itemFields.PublishKey || "").trim();
    if (recordedVersion) {
      // queryWebFormVersion falls back past a failed or empty keyed read; this must not.
      const row = await queryListItemByFields(token, "Web Form Versions", {
        FormTitle: formTitle,
        FormVersion: recordedVersion,
        ...(recordedKey ? { PublishKey: recordedKey } : {}),
      });
      if (!row || parseVersionPayload(row.fields.SurveyJSON).surveyJson === null) {
        throw new Error("The form version this submission was made under could not be read.");
      }
      versionRow = row.fields;
    }
  } else {
    const { formVersion, publishKey } = submissionVersionKey(formConfig, itemFields);
    versionRow = formVersion
      ? (await queryWebFormVersion(token, formTitle, formVersion, publishKey || undefined))?.fields
      : null;
  }
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

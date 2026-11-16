/**
 * submissionLayerConfig.ts — the workflow a submission was made under.
 *
 * Read from the submission's own form version and publish profile, falling back
 * to the Master Form's current `LayerConfig` when that version carries none.
 * Shared by the reviewer endpoint (`api/evaluate.ts`) and the pre-send routing
 * check, which must agree on it: a check against a different workflow than the
 * reviewer page then opens would correct a step to the wrong people.
 */
import {
  graphFieldEquals,
  queryListItemByFields,
  queryListItems,
  queryWebFormVersion,
  type GraphListItem,
} from "./graphClient.js";

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

const DEFAULT_PUBLISH_KEY = "production";

/**
 * A publish profile's questions come from the default profile of the same
 * version, as `queryWebFormVersion` serves them (`withDefaultProfileContent` in
 * graphClient.ts): the profile row's own copy of the survey is never updated
 * after it is saved. Same rule, except that a failed read throws instead of
 * quietly keeping the profile's stale copy. A default row that does not exist
 * or carries no survey keeps the profile's own, exactly as there.
 */
async function withDefaultProfileSurvey(
  token: string,
  formTitle: string,
  formVersion: string,
  profileRow: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const profile = parseJsonRecord(profileRow.SurveyJSON);
  if (!profile) return profileRow;
  const baseRow = await queryListItemByFields(token, "Web Form Versions", {
    FormTitle: formTitle,
    FormVersion: formVersion,
    PublishKey: DEFAULT_PUBLISH_KEY,
  });
  const base = parseJsonRecord(baseRow?.fields.SurveyJSON);
  if (!base?.surveyJson) return profileRow;
  return {
    ...profileRow,
    SurveyJSON: JSON.stringify({ ...profile, surveyJson: base.surveyJson, meta: base.meta ?? profile.meta }),
  };
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * With no publish key anywhere, the version's row is used only when it is the
 * only one: with rows for several profiles there is no telling which workflow
 * the submission was made under, so the check must fail rather than guess.
 */
async function readOnlyVersionRow(
  token: string,
  formTitle: string,
  formVersion: string,
): Promise<GraphListItem | null> {
  const rows = await queryListItems(token, "Web Form Versions", {
    filter: [graphFieldEquals("FormTitle", formTitle), graphFieldEquals("FormVersion", formVersion)].join(" and "),
    top: 2,
    preferNonIndexed: true,
  });
  if (rows.length > 1) {
    throw new Error("The form version this submission was made under has more than one publish profile, and the submission records none.");
  }
  return rows[0] ?? null;
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
 * made under. A row with a version but no publish key is read under the Master
 * Form's current key, as the reviewer page reads it; with no key there either,
 * the version's only row is used, and several rows throw (no guessing). Only a
 * row that records no form version (older submissions) falls
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
    // A row that records no publish key is read under the Master Form's current
    // one, the key the reviewer page uses (`submissionVersionKey`).
    const key = String(itemFields.PublishKey || formConfig.CurrentPublishKey || "").trim();
    if (recordedVersion) {
      // queryWebFormVersion falls back past a failed or empty keyed read; this must not.
      const row = key
        ? await queryListItemByFields(token, "Web Form Versions", {
          FormTitle: formTitle,
          FormVersion: recordedVersion,
          PublishKey: key,
        })
        : await readOnlyVersionRow(token, formTitle, recordedVersion);
      if (!row || parseVersionPayload(row.fields.SurveyJSON).surveyJson === null) {
        throw new Error("The form version this submission was made under could not be read.");
      }
      versionRow = row.fields;
      if (key && key !== DEFAULT_PUBLISH_KEY) {
        versionRow = await withDefaultProfileSurvey(token, formTitle, recordedVersion, versionRow);
      }
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

/**
 * directoryHarvestProfile.ts — switching harvesting on for a form that is
 * already live, without republishing it.
 *
 * A submission reads its workflow from the published profile it came in on,
 * not from the form's current draft (see `getPublishedFormSnapshot` in
 * api/submit-form.ts). So a harvest setting only takes effect once it is
 * inside that profile's stored row.
 *
 * The builder's own publish path cannot be used for this. `saveFormVersion`
 * upserts by (form, version, publish key) and rewrites the entire row — survey
 * JSON, publish status, expiry — from whatever the builder currently holds. Two
 * profiles of the same version can hold different questions, published weeks
 * apart, so republishing one to change a routing setting would push the
 * builder's questions into a live form. That is the accident this module
 * exists to avoid.
 *
 * What it does instead: read the row, merge one key into its layer config,
 * write that back. Questions, status and expiry are never touched.
 *
 * Nothing here depends on profiles being a permanent feature. When they go,
 * this collapses into "write the setting to the form" and the merge rule below
 * is still the rule.
 */
import type { DirectoryHarvestSettings } from "../types";
import { spGet, spPatch } from "./formBuilderSP";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL as string || "").replace(/\/$/, "");

const VERSIONS_LIST = "Web Form Versions";

/** One published profile of a form, as this module needs to address it. */
export interface FormProfileRef {
  version: string;
  publishKey: string;
  publishLabel: string;
  /** Off profiles cannot be submitted, so switching harvesting on is inert. */
  publishStatus: "active" | "off";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Why a profile cannot carry the setting, or "" when it can. */
export function profileHarvestObjection(payload: unknown): string {
  if (!isRecord(payload)) {
    return "its stored definition could not be read";
  }
  const layerConfig = payload.layerConfig;
  if (!isRecord(layerConfig)) {
    return "it has no approval workflow saved, so there are no layers to harvest alongside";
  }
  const layers = Array.isArray(layerConfig.layers) ? layerConfig.layers : [];
  const branches = Array.isArray(layerConfig.manualBranches) ? layerConfig.manualBranches : [];
  const branchLayers = branches.flatMap((branch) =>
    (isRecord(branch) && Array.isArray(branch.layers) ? branch.layers : []));
  const hasEvaluation = [...layers, ...branchLayers]
    .some((layer) => isRecord(layer) && layer.type === "evaluation");
  if (!hasEvaluation) {
    return "its workflow has no evaluation step, so nothing would ever be harvested from it";
  }
  return "";
}

/**
 * The profile's stored definition with the harvest setting merged in.
 *
 * Everything else is carried through untouched, including keys this app has
 * never heard of: the row is a snapshot written by whichever version of the
 * builder published it, and dropping a key we do not recognise would quietly
 * change a live form.
 */
export function mergeHarvestIntoProfilePayload(
  payload: Record<string, unknown>,
  harvest: DirectoryHarvestSettings,
): Record<string, unknown> {
  const layerConfig = isRecord(payload.layerConfig) ? payload.layerConfig : {};
  return {
    ...payload,
    layerConfig: { ...layerConfig, directoryHarvest: harvest },
  };
}

function versionsUrl(): string {
  return `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(VERSIONS_LIST)}')`;
}

function odata(value: string): string {
  return encodeURIComponent(value.replace(/'/g, "''"));
}

interface ProfileRow {
  id: number;
  payload: Record<string, unknown>;
}

/** The stored row for one profile, or null when there is no such profile. */
async function readProfileRow(
  token: string,
  formTitle: string,
  profile: FormProfileRef,
): Promise<ProfileRow | null> {
  const filter = [
    `FormTitle eq '${odata(formTitle)}'`,
    `FormVersion eq '${odata(profile.version)}'`,
    `PublishKey eq '${odata(profile.publishKey)}'`,
  ].join(" and ");

  const data = await spGet(
    token,
    `${versionsUrl()}/items?$filter=${filter}&$select=Id,SurveyJSON&$top=1`,
  ) as { value?: { Id: number; SurveyJSON?: string }[] };

  const row = data.value?.[0];
  if (!row) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(row.SurveyJSON || "");
  } catch {
    payload = null;
  }
  return isRecord(payload) ? { id: row.Id, payload } : { id: row.Id, payload: {} };
}

export interface ProfileApplyResult {
  profile: FormProfileRef;
  applied: boolean;
  /** Why not, in words an admin can act on. Empty when applied. */
  problem: string;
}

/**
 * Writes the harvest setting into one live profile and nothing else.
 *
 * Only the `SurveyJSON` column is patched, and only its `layerConfig` key
 * within that. `PublishStatus` and `PublishExpiresAt` are separate columns and
 * are not part of the request, so an expiring or switched-off profile keeps
 * being exactly that.
 */
export async function applyHarvestToProfile(
  token: string,
  formTitle: string,
  profile: FormProfileRef,
  harvest: DirectoryHarvestSettings,
): Promise<ProfileApplyResult> {
  let row: ProfileRow | null;
  try {
    row = await readProfileRow(token, formTitle, profile);
  } catch (error) {
    return {
      profile,
      applied: false,
      problem: `could not be read: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!row) {
    return { profile, applied: false, problem: "no such published profile" };
  }

  const objection = profileHarvestObjection(row.payload);
  if (objection) return { profile, applied: false, problem: objection };

  try {
    await spPatch(token, `${versionsUrl()}/items(${row.id})`, {
      SurveyJSON: JSON.stringify(mergeHarvestIntoProfilePayload(row.payload, harvest), null, 2),
    });
  } catch (error) {
    return {
      profile,
      applied: false,
      problem: `could not be saved: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return { profile, applied: true, problem: "" };
}

/**
 * Writes the setting onto the form itself, alongside the profiles.
 *
 * Needed because two different readers disagree about where a form's workflow
 * lives. A submission reads the profile it arrived on; the directory scan and
 * the builder read the form's own `LayerConfig`. Writing only the profiles
 * would leave the scan insisting no form is switched on while submissions were
 * quietly harvesting.
 *
 * Merged into whatever is stored rather than overwritten with the builder's
 * current draft, for the same reason as the profiles: an unsaved workflow edit
 * must not ride along with a routing setting.
 */
export async function applyHarvestToFormConfig(
  token: string,
  formTitle: string,
  harvest: DirectoryHarvestSettings,
): Promise<string> {
  const listUrl = `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')`;
  let row: { Id: number; LayerConfig?: string } | undefined;
  try {
    const data = await spGet(
      token,
      `${listUrl}/items?$filter=Title eq '${odata(formTitle)}'&$select=Id,LayerConfig&$top=1`,
    ) as { value?: { Id: number; LayerConfig?: string }[] };
    row = data.value?.[0];
  } catch (error) {
    return `the form's own settings could not be read: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (!row) return "the form's own settings could not be found";

  let stored: unknown;
  try {
    stored = JSON.parse(row.LayerConfig || "");
  } catch {
    stored = null;
  }
  // No stored workflow means nothing reads a form-level setting anyway; the
  // profiles carry it, so this is not worth failing the run over.
  if (!isRecord(stored)) return "";

  try {
    await spPatch(token, `${listUrl}/items(${row.Id})`, {
      LayerConfig: JSON.stringify({ ...stored, directoryHarvest: harvest }),
    });
  } catch (error) {
    return `the form's own settings could not be saved: ${error instanceof Error ? error.message : String(error)}`;
  }
  return "";
}

/** Applies the setting to several profiles, reporting rather than aborting. */
export async function applyHarvestToProfiles(
  token: string,
  formTitle: string,
  profiles: FormProfileRef[],
  harvest: DirectoryHarvestSettings,
): Promise<ProfileApplyResult[]> {
  const results: ProfileApplyResult[] = [];
  for (const profile of profiles) {
    results.push(await applyHarvestToProfile(token, formTitle, profile, harvest));
  }
  return results;
}

/** One line summing up what a run did, for the toast. */
export function describeApplyResults(results: ProfileApplyResult[]): string {
  const applied = results.filter((result) => result.applied);
  const failed = results.filter((result) => !result.applied);
  if (applied.length > 0 && failed.length === 0) {
    return `Harvesting is on for ${applied.map((result) => result.profile.publishKey).join(", ")}.`;
  }
  if (applied.length === 0) {
    return failed.map((result) => `${result.profile.publishKey}: ${result.problem}`).join("; ");
  }
  return `On for ${applied.map((result) => result.profile.publishKey).join(", ")}; `
    + failed.map((result) => `${result.profile.publishKey}: ${result.problem}`).join("; ");
}

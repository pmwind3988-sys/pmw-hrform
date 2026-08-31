import type { FormConfig, FormLogEntry, Submission, SurveyJson, LayerStatus, EvaluationDataEntry, LayerConfigItem, EvaluationEmailSchedule, DocumentControlHeader } from '../types/index.ts';
import { resolveEvaluationEmailDueAt, setScheduledWorkflowEmail } from "./workflowEmailSchedule";
import { flattenQuestions, getSpColumnKind } from './FormBuilderEngine.ts';
import { fetchWithAuthRecovery } from "./authRecovery";
import { toSharePointMalaysiaDateTime } from "./sharepointDateTime";
import { SharePointHttpError } from "./sharepointClient";
import { REFERENCE_CONFIG_FIELD, REFERENCE_NO_FIELD } from "./referenceNumber";
import { joinEmailList, parseValidEmailList } from "./layerRecipients";
import { buildWorkflowReviewLink } from "./workflowLink";
import { selectWorkflowLayer } from "./workflowReviewLink";
import { resolveApplicantName } from "./applicantName";
import {
  buildWorkflowEmailSubject,
  renderWorkflowEmail,
  WORKFLOW_EMAIL_STATUS,
  type WorkflowEmailDetail,
} from "./workflowEmailTemplate";
import { ensureLinkToken } from "./linkToken";
import { listChoiceValues, toListChoiceOptions, type ListChoiceOption } from "./listChoiceOptions";
import { resolveSite, HOME_SITE_KEY, type SiteKey } from '../config/sites';

/**
 * The SharePoint site every call in this module targets.
 *
 * Mutable because the form builder can be pointed at a second site (see
 * `src/config/sites.ts`), and every helper here already reads it at call time
 * inside a template literal rather than capturing it at module load.
 *
 * It defaults to the home site and is only ever changed by the builder route,
 * which sets it on mount and restores it on unmount. Nothing else in the app
 * switches sites, so any code path outside the builder always sees the home
 * site — reading this variable is not a decision a caller has to make.
 */
let SP_SITE_URL = resolveSite(HOME_SITE_KEY).url;
let activeSiteKey: SiteKey = HOME_SITE_KEY;
const API_KEY = import.meta.env.VITE_API_SECRET_KEY || '';

/**
 * Points this module at one of the configured sites. Throws on an unknown or
 * unconfigured key rather than falling back — see the note in `resolveSite`.
 */
export function setActiveBuilderSite(key: SiteKey): void {
  const site = resolveSite(key);
  SP_SITE_URL = site.url;
  activeSiteKey = site.key;
}

/** Restores the home site. Call when leaving the builder. */
export function resetActiveBuilderSite(): void {
  setActiveBuilderSite(HOME_SITE_KEY);
}

export function getActiveBuilderSiteKey(): SiteKey {
  return activeSiteKey;
}

export function getActiveBuilderSiteUrl(): string {
  return SP_SITE_URL;
}

/**
 * The version-row fallbacks below retry with a broader query when the first one does
 * not fit the list — a tenant whose 'Web Form Versions' predates the PublishKey column
 * answers that filter with a 400. Absorb only that shape.
 *
 * Everything else — 401/403 (no access), 429 (throttled), 5xx, a network drop, or the
 * 30s AbortError — must propagate. Swallowing those returns an empty result that reads
 * as "this form has no published version", which silently blanks `meta` and takes the
 * document header and company selector down with it.
 */
function isQueryMismatchError(error: unknown): boolean {
  return error instanceof SharePointHttpError && (error.status === 400 || error.status === 404);
}

function emptyOnQueryMismatch(error: unknown): { value: never[] } {
  if (!isQueryMismatchError(error)) throw error;
  return { value: [] };
}

export interface SpColumnSpec {
  n: string;
  k: number;
  ml?: boolean;
  rt?: boolean;
  choices?: string[];
  /** Choice column accepts a value the respondent typed ("Other" is enabled). */
  fillIn?: boolean;
  label?: string;
}

export interface SpListSchema {
  title: string;
  baseTemplate?: number;
  description?: string;
  columns?: SpColumnSpec[];
}

export interface ExistingFieldInfo {
  Title?: string;
  InternalName?: string;
  StaticName?: string;
  EntityPropertyName?: string;
}

export interface EnsureColumnsResult {
  created: string[];
  existing: string[];
}

export const SP_FIELD_KIND = {
  text: 2,
  note: 3,
  dateTime: 4,
  choice: 6,
  boolean: 8,
  number: 9,
  image: 11,
  multiChoice: 15,
} as const;

export const PDPA_COLUMN_SPECS: SpColumnSpec[] = [
  { n: 'PDPAConsent', k: SP_FIELD_KIND.text },
  { n: 'PDPANoticeVersion', k: SP_FIELD_KIND.text },
  { n: 'PDPAConsentAt', k: SP_FIELD_KIND.dateTime },
  { n: 'RetentionUntil', k: SP_FIELD_KIND.dateTime },
];

export const PDF_URL_COLUMN_SPEC: SpColumnSpec = { n: 'PdfUrl', k: SP_FIELD_KIND.text };

export const SELECTED_BRANCH_COLUMN_SPEC: SpColumnSpec = {
  n: 'SelectedBranch',
  k: SP_FIELD_KIND.text,
};

export const CAREER_PORTAL_CARD_LIST = 'Career Portal Cards';

const CAREER_PORTAL_CARD_COLUMN_SPECS: SpColumnSpec[] = [
  { n: 'CardDescription', k: SP_FIELD_KIND.note, ml: true },
  { n: 'ImageUrl', k: SP_FIELD_KIND.text },
  { n: 'ImageSource', k: SP_FIELD_KIND.note, ml: true },
  { n: 'ImageOpacity', k: SP_FIELD_KIND.number },
  { n: 'SortOrder', k: SP_FIELD_KIND.number },
  { n: 'Status', k: SP_FIELD_KIND.text },
  { n: 'TargetType', k: SP_FIELD_KIND.text },
  { n: 'TargetValue', k: SP_FIELD_KIND.text },
];

const SP_FIELD_TYPE_MAP: Record<number, string> = {
  [SP_FIELD_KIND.text]: 'SP.Field',
  [SP_FIELD_KIND.note]: 'SP.FieldMultiLineText',
  [SP_FIELD_KIND.dateTime]: 'SP.FieldDateTime',
  [SP_FIELD_KIND.choice]: 'SP.FieldChoice',
  [SP_FIELD_KIND.boolean]: 'SP.Field',
  [SP_FIELD_KIND.number]: 'SP.FieldNumber',
  [SP_FIELD_KIND.image]: 'SP.FieldUrl',
  [SP_FIELD_KIND.multiChoice]: 'SP.FieldMultiChoice',
};

const columnCache = new Map<string, Set<string>>();

function columnCacheKey(listTitle: string): string {
  return listTitle.trim().toLowerCase();
}

function normalizeColumnName(name: string): string {
  return name.trim().toLowerCase();
}

function rememberColumn(listTitle: string, fieldName: string): void {
  const key = columnCacheKey(listTitle);
  const cached = columnCache.get(key) ?? new Set<string>();
  cached.add(normalizeColumnName(fieldName));
  columnCache.set(key, cached);
}

async function getExistingColumnNames(token: string, listTitle: string): Promise<Set<string>> {
  const key = columnCacheKey(listTitle);
  const cached = columnCache.get(key);
  if (cached) return cached;

  const data = await spGet(
    token,
    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/fields?$select=Title,InternalName,StaticName,EntityPropertyName&$top=5000`
  ) as { value?: ExistingFieldInfo[] };
  const names = new Set<string>();
  for (const field of data.value || []) {
    for (const name of [field.Title, field.InternalName, field.StaticName, field.EntityPropertyName]) {
      if (name) names.add(normalizeColumnName(name));
    }
  }
  columnCache.set(key, names);
  return names;
}

export function createSharePointColumnKeyResolver(
  fields: ExistingFieldInfo[],
): (fieldName: string) => string | null {
  const byName = new Map<string, string>();
  for (const field of fields) {
    const entityKey = field.EntityPropertyName || field.InternalName || field.StaticName || field.Title;
    if (!entityKey) continue;
    for (const name of [field.Title, field.InternalName, field.StaticName, field.EntityPropertyName]) {
      if (name) byName.set(normalizeColumnName(name), entityKey);
    }
  }
  return (fieldName: string) => byName.get(normalizeColumnName(fieldName)) ?? null;
}

export async function getSharePointColumnKeyResolver(
  token: string,
  listTitle: string,
): Promise<(fieldName: string) => string | null> {
  const data = await spGet(
    token,
    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/fields?$select=Title,InternalName,StaticName,EntityPropertyName&$top=5000`,
  ) as { value?: ExistingFieldInfo[] };
  return createSharePointColumnKeyResolver(data.value || []);
}

function buildColumnBody(spec: SpColumnSpec): Record<string, unknown> {
  const body: Record<string, unknown> = {
    __metadata: { type: SP_FIELD_TYPE_MAP[spec.k] ?? 'SP.Field' },
    FieldTypeKind: spec.k,
    Title: spec.n,
    StaticName: spec.n,
  };
  if (spec.k === 3 || spec.ml) {
    body.NumberOfLines = 6;
    body.RichText = !!spec.rt;
  }
  if (spec.k === 11) {
    body.DisplayFormat = 0; // URL link. Public submissions store a shortcut to the uploaded signature file.
  }
  if ((spec.k === 6 || spec.k === 15) && spec.choices && spec.choices.length > 0) {
    body.Choices = { results: spec.choices };
    // A question with "Other" enabled submits a value the respondent typed. Without
    // FillInChoice the column treats it as invalid; with it, the answer is stored and
    // shown like any other.
    if (spec.fillIn) body.FillInChoice = true;
  }
  return body;
}

async function createColumn(token: string, listTitle: string, spec: SpColumnSpec): Promise<void> {
  const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/fields`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=verbose',
      'X-RequestDigest': await getDigest(token),
    },
    body: JSON.stringify(buildColumnBody(spec)),
  });
  if (!response.ok) {
    const text = await response.text();
    if (text.toLowerCase().includes('duplicate') || text.toLowerCase().includes('already exists')) {
      rememberColumn(listTitle, spec.n);
      return;
    }
    throw new Error(`addColumn "${spec.n}" ${response.status}: ${text}`);
  }
  rememberColumn(listTitle, spec.n);
}

async function repairUrlColumnDisplayFormat(token: string, listTitle: string, fieldName: string): Promise<void> {
  const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/fields/getbyinternalnameortitle('${encodeURIComponent(fieldName)}')`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=verbose',
      'X-HTTP-Method': 'MERGE',
      'IF-MATCH': '*',
      'X-RequestDigest': await getDigest(token),
    },
    body: JSON.stringify({
      __metadata: { type: 'SP.FieldUrl' },
      DisplayFormat: 0,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`repairUrlColumn "${fieldName}" ${response.status}: ${text}`);
  }
}

/**
 * Turn on "Can add values manually" for a choice column that already exists.
 *
 * New columns get `FillInChoice` from `buildColumnBody`, but a form published before
 * anyone enabled "Other" on a field already has its column, and `ensureColumns` skips
 * those. Without this, republishing would leave the column rejecting the very answers
 * the newly enabled "Other" row invites.
 */
async function repairChoiceColumnFillIn(token: string, listTitle: string, fieldName: string, kind: number): Promise<void> {
  const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/fields/getbyinternalnameortitle('${encodeURIComponent(fieldName)}')`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=verbose',
      'X-HTTP-Method': 'MERGE',
      'IF-MATCH': '*',
      'X-RequestDigest': await getDigest(token),
    },
    body: JSON.stringify({
      __metadata: { type: SP_FIELD_TYPE_MAP[kind] ?? 'SP.FieldChoice' },
      FillInChoice: true,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`repairChoiceColumn "${fieldName}" ${response.status}: ${text}`);
  }
}

async function setColumnIndexed(token: string, listTitle: string, fieldName: string): Promise<void> {
  const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/fields/getbyinternalnameortitle('${encodeURIComponent(fieldName)}')`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=verbose',
      'X-HTTP-Method': 'MERGE',
      'IF-MATCH': '*',
      'X-RequestDigest': await getDigest(token),
    },
    body: JSON.stringify({
      __metadata: { type: 'SP.Field' },
      Indexed: true,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`indexColumn "${fieldName}" ${response.status}: ${text}`);
  }
}

async function ensureIndexedColumns(
  token: string,
  listTitle: string,
  fieldNames: string[],
  onLog: (msg: string, type: string) => void = () => {},
): Promise<void> {
  for (const fieldName of fieldNames) {
    try {
      await setColumnIndexed(token, listTitle, fieldName);
      onLog(`  indexed: ${fieldName}`, 'ok');
    } catch (e) {
      onLog(`  index skipped: ${fieldName} (${(e as Error).message})`, 'warn');
    }
  }
}

/** Escape single quotes for OData filter string values to prevent injection */
function sanitizeODataValue(val: string): string {
  return val.replace(/'/g, "''");
}

/** HTML-entity-encode a string to prevent XSS */
function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Wraps fetch with an AbortController timeout (default 30s) */
async function fetchWithTimeout(url: string | URL | Request, options: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchWithAuthRecovery(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

const DIGEST_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
let cachedDigest: string | null = null;
let digestExpiry: number | null = null;

async function getDigest(token: string): Promise<string> {
  const now = Date.now();
  if (cachedDigest && digestExpiry && now < digestExpiry) {
    return cachedDigest;
  }

  const url = `${SP_SITE_URL}/_api/contextinfo`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch request digest: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.FormDigestValue) {
    throw new Error('No FormDigestValue returned from contextinfo endpoint');
  }

  const digestValue: string = data.FormDigestValue;
  cachedDigest = digestValue;
  digestExpiry = now + DIGEST_EXPIRY_MS;
  return digestValue;
}

export async function getFormConfig(token: string, listTitle: string): Promise<FormConfigData | null> {
  if (!await listExists(token, 'Master Form')) return null;
  const data = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items?$filter=Title eq '${encodeURIComponent(sanitizeODataValue(listTitle))}'&$select=Id,Title,FormID,NumberOfApprovalLayer,Slug,CurrentVersion,CurrentPublishKey,CurrentPublishLabel,IsPublished,IsPublic,ConditionField,ApprovalRules,LayerConfig,ReferenceConfig&$top=1`) as { value?: FormConfigData[] };
  return data.value?.[0] || null;
}

export async function saveFormConfig(
  config: Omit<FormConfig, 'Id' | 'Created' | 'Modified'>,
  token: string
): Promise<FormConfig> {
  const digest = await getDigest(token);
  const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
      'X-RequestDigest': digest,
    },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    throw new Error(`Failed to save form config: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function saveFormVersion(
  token: string,
  params: {
    listTitle: string;
    slug: string;
    version: string;
    publishKey?: string;
    publishLabel?: string;
    publishStatus?: 'active' | 'off';
    publishExpiresAt?: string;
    surveyJson: unknown;
    meta: unknown;
    changedBy: string;
    layerConfig?: unknown;
  }
): Promise<void> {
  await ensureListExists(token, 'Web Form Versions');
  const publishKey = normalizePublishKey(params.publishKey);
  const publishLabel = params.publishLabel?.trim() || (publishKey === DEFAULT_PUBLISH_KEY ? 'Production' : publishKey);
  const jsonStr = JSON.stringify({
    surveyJson: params.surveyJson, meta: params.meta, version: params.version,
    publishKey, publishLabel,
    publishStatus: params.publishStatus || 'active',
    publishExpiresAt: params.publishExpiresAt || '',
    savedAt: new Date().toISOString(), changedBy: params.changedBy,
    layerConfig: params.layerConfig,
  }, null, 2);
  let existing = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(sanitizeODataValue(params.listTitle))}' and FormVersion eq '${encodeURIComponent(sanitizeODataValue(params.version))}' and PublishKey eq '${encodeURIComponent(sanitizeODataValue(publishKey))}'&$select=Id&$top=1`)
    .catch(async () => {
      if (publishKey !== DEFAULT_PUBLISH_KEY) return { value: [] };
      return spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(sanitizeODataValue(params.listTitle))}' and FormVersion eq '${encodeURIComponent(sanitizeODataValue(params.version))}'&$select=Id&$top=1`).catch(() => ({ value: [] }));
    }) as { value?: { Id: number }[] };
  if (publishKey === DEFAULT_PUBLISH_KEY && !existing.value?.length) {
    existing = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(sanitizeODataValue(params.listTitle))}' and FormVersion eq '${encodeURIComponent(sanitizeODataValue(params.version))}'&$select=Id&$top=1`).catch(() => ({ value: [] })) as { value?: { Id: number }[] };
  }
  const body = {
    Title: `${params.listTitle} v${params.version} [${publishKey}]`,
    FormTitle: params.listTitle,
    FormSlug: params.slug,
    FormVersion: params.version,
    PublishKey: publishKey,
    PublishLabel: publishLabel,
    PublishStatus: params.publishStatus || 'active',
    PublishExpiresAt: params.publishExpiresAt || null,
    DisabledAt: null,
    DisabledBy: '',
    SurveyJSON: jsonStr,
    PublishedBy: params.changedBy,
    PublishedAt: new Date().toISOString(),
  };
  if (existing.value?.length && existing.value[0].Id) {
    await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items(${existing.value[0].Id})`, body);
  } else {
    await spPost(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items`, body);
  }
}

export async function logFormAction(
  logEntry: Omit<FormLogEntry, 'Id' | 'Timestamp'>,
  token: string
): Promise<FormLogEntry> {
  const digest = await getDigest(token);
  const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('Form%20Builder%20Log')/items`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
      'X-RequestDigest': digest,
    },
    body: JSON.stringify(logEntry),
  });

  if (!response.ok) {
    throw new Error(`Failed to log form action: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function getFormSubmissions(formId: string, token: string): Promise<Submission[]> {
  const encodedFormId = sanitizeODataValue(formId);
  const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('Submissions')/items?$filter=FormId eq '${encodedFormId}'&$orderby=Created desc`;
  const response = await fetchWithTimeout(url, {
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch form submissions: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.value || [];
}

export async function submitFormResponse(
  formId: string,
  responseData: unknown,
  token: string
): Promise<Submission> {
  const digest = await getDigest(token);
  const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('Submissions')/items`;
  const body = {
    FormId: formId,
    Response: JSON.stringify(responseData),
    Submitted: new Date().toISOString(),
  };
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
      'X-RequestDigest': digest,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to submit form response: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function getSharePointChoices(
  listTitle: string,
  fieldName: string,
  token: string
): Promise<string[]> {
  const encodedListTitle = encodeURIComponent(listTitle);
  const encodedFieldName = encodeURIComponent(sanitizeODataValue(fieldName));
  const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodedListTitle}')/fields?$filter=Title eq '${encodedFieldName}'`;
  const response = await fetchWithTimeout(url, {
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch SharePoint choices: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const field = data.value?.[0];
  if (!field) {
    return [];
  }
  const choices = field.Choices;
  if (!choices) {
    return [];
  }
  return Array.isArray(choices) ? choices : (choices.results || []);
}

export async function getSharePointLists(token: string): Promise<{ title: string; id: string }[]> {
  const url = `${SP_SITE_URL}/_api/web/lists?$select=Id,Title,Hidden&$filter=Hidden eq false&$top=500`;
  const response = await fetchWithTimeout(url, {
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch SharePoint lists: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return (data.value || [])
    .filter((list: { Title?: string }) => !!list.Title)
    .map((list: { Title: string; Id: string }) => ({ title: list.Title, id: list.Id }));
}

export async function getChoiceColumnsForList(listTitle: string, token: string): Promise<{ title: string; typeKind: number; choices: string[] }[]> {
  const encodedListTitle = encodeURIComponent(listTitle);
  const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodedListTitle}')/fields?$select=Title,FieldTypeKind,Choices&$filter=FieldTypeKind eq 6 or FieldTypeKind eq 15`;
  const response = await fetchWithTimeout(url, {
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch choice columns: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return (data.value || [])
    .filter((field: { Title?: string }) => !!field.Title)
    .map((field: { Title: string; FieldTypeKind: number; Choices?: { results?: string[] } | string[] }) => {
      const rawChoices = field.Choices;
      const choiceArr = Array.isArray(rawChoices)
        ? rawChoices
        : (rawChoices?.results || []);
      return { title: field.Title, typeKind: field.FieldTypeKind, choices: choiceArr };
    });
}

/**
 * Fetch all columns from a SharePoint list (not just choice columns).
 * Used for the filter column picker in Filtered List Source.
 */
export async function getAllColumnsForList(listTitle: string, token: string): Promise<{ title: string; typeKind: number }[]> {
  const encoded = encodeURIComponent(listTitle);
  const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encoded}')/fields?$select=Title,FieldTypeKind&$filter=Hidden eq false and ReadOnlyField eq false`;
  try {
    const data = await spGet(token, url) as { value?: { Title?: string; FieldTypeKind: number }[] };
    return (data.value || [])
      .filter(f => !!f.Title && f.Title !== "Content Type" && f.Title !== "Title")
      .map(f => ({ title: f.Title!, typeKind: f.FieldTypeKind }));
  } catch {
    return [];
  }
}

/**
 * Fetch distinct values from a list column, with optional OData filter.
 * Used by the Filtered List choice source at runtime.
 */
/**
 * Resolve a column's internal name from its display name via SharePoint REST API.
 * The fields endpoint uses `Title` (display name) for filtering and returns `EntityPropertyName` (OData name).
 */
async function resolveInternalName(
  listTitle: string,
  displayName: string,
  token: string
): Promise<string> {
  try {
    const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/fields?$filter=Title eq '${encodeURIComponent(sanitizeODataValue(displayName))}'&$select=Title,EntityPropertyName`;
    const data = await spGet(token, url) as { value?: { EntityPropertyName?: string }[] };
    return data.value?.[0]?.EntityPropertyName || displayName;
  } catch {
    return displayName;
  }
}

/**
 * Choices for a question sourced from a list.
 *
 * `labelColumn` makes the dropdown show one column while storing another —
 * a name on screen, an email in the answer. Omitted, the result is the flat
 * sorted list of values it has always been.
 */
export async function getFilteredListChoices(
  listTitle: string,
  valueColumn: string,
  token: string,
  filterColumn?: string,
  filterValue?: string,
  labelColumn?: string,
): Promise<ListChoiceOption[]> {
  const encoded = encodeURIComponent(listTitle);
  // Resolve display names → internal names (SP REST returns fields under internal names)
  const internalValCol = await resolveInternalName(listTitle, valueColumn, token);
  const internalFilterCol = filterColumn
    ? await resolveInternalName(listTitle, filterColumn, token)
    : undefined;
  // A label column naming the value column would select it twice; treat that as
  // no label, which is also what the admin means by "same as value".
  const internalLabelCol = labelColumn && labelColumn !== valueColumn
    ? await resolveInternalName(listTitle, labelColumn, token)
    : undefined;

  const select = [internalValCol, ...(internalLabelCol ? [internalLabelCol] : [])]
    .filter((column, index, all) => all.indexOf(column) === index)
    .map(encodeURIComponent)
    .join(",");
  let url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encoded}')/items?$select=${select}&$top=5000`;
  if (internalFilterCol && filterValue) {
    url += `&$filter=${encodeURIComponent(internalFilterCol)} eq '${encodeURIComponent(sanitizeODataValue(filterValue))}'`;
  }
  try {
    const data = await spGet(token, url) as { value?: Record<string, unknown>[] };
    return toListChoiceOptions((data.value || []).map((item) => ({
      value: item[internalValCol],
      label: internalLabelCol ? item[internalLabelCol] : undefined,
    })));
  } catch {
    return [];
  }
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-zA-Z0-9_\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export const DEFAULT_PUBLISH_KEY = 'production';

export function normalizePublishKey(value?: string | null): string {
  const normalized = slugify(value || DEFAULT_PUBLISH_KEY);
  return normalized || DEFAULT_PUBLISH_KEY;
}

function isPublishExpired(value?: string): boolean {
  return !!value && Date.parse(value) <= Date.now();
}

export async function checkSlugConflict(
  token: string,
  slug: string,
  excludeFormTitle?: string | null
): Promise<string | null> {
  const slugToCheck = slugify(slug);
  if (slugToCheck.length === 0) return null;
  const data = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items?$filter=Slug eq '${encodeURIComponent(sanitizeODataValue(slugToCheck))}'&$select=Title,Slug&$top=5`).catch(() => ({ value: [] })) as { value?: { Title: string }[] };
  const others = (data.value || []).filter(r => r.Title !== excludeFormTitle);
  return others.length > 0 ? others[0].Title : null;
}

export async function getAllSlugs(token: string): Promise<{ Title: string; Slug: string; CurrentVersion: string; CurrentPublishKey?: string }[]> {
  const data = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items?$select=Title,Slug,CurrentVersion,CurrentPublishKey&$top=500`).catch(() => ({ value: [] })) as { value?: { Title: string; Slug: string; CurrentVersion: string; CurrentPublishKey?: string }[] };
  return data.value || [];
}

export async function spUploadFile(token: string, lib: string, filename: string, content: string | Uint8Array): Promise<unknown> {
  const digest = await getDigest(token);
  const r = await fetchWithTimeout(`${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(lib)}')/rootfolder/files/add(url='${encodeURIComponent(filename)}',overwrite=true)`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-RequestDigest': digest, 'Content-Type': 'application/octet-stream' }, body: (typeof content === 'string' ? new TextEncoder().encode(content) : content) as BodyInit });
  if (!r.ok) { const t = await r.text(); throw new Error(`Upload ${r.status}: ${t}`); }
  return r.json().catch(() => ({}));
}

export async function getFormLog(token: string, listTitle: string): Promise<FormLogEntry[]> {
  if (!await listExists(token, 'Form Builder Log')) return [];
  const data = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Form%20Builder%20Log')/items?$filter=FormTitle eq '${encodeURIComponent(sanitizeODataValue(listTitle))}'&$select=EventType,ChangedBy,EventSummary,BeforeJSON,AfterJSON,EventAt,Title&$orderby=EventAt desc&$top=200`).catch(() => ({ value: [] })) as { value?: FormLogEntry[] };
  return data.value || [];
}

export interface FormVersionData {
  surveyJson: unknown;
  meta: unknown;
  layerConfig?: unknown;
  publishKey?: string;
  publishLabel?: string;
  publishStatus?: string;
  publishExpiresAt?: string;
  version?: string;
}

/** Read one saved row of `Web Form Versions`, exactly as it was written. */
async function readFormVersionRow(
  token: string,
  listTitle: string,
  version: string,
  normalizedPublishKey: string
): Promise<FormVersionData | null> {
  const baseFilter = `FormTitle eq '${encodeURIComponent(sanitizeODataValue(listTitle))}' and FormVersion eq '${encodeURIComponent(sanitizeODataValue(version))}'`;
  const query = normalizedPublishKey
    ? `${baseFilter} and PublishKey eq '${encodeURIComponent(sanitizeODataValue(normalizedPublishKey))}'`
    : baseFilter;
  let data = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=${query}&$select=SurveyJSON,FormVersion,PublishedAt,PublishedBy,PublishKey,PublishLabel,PublishStatus,PublishExpiresAt&$orderby=PublishedAt desc&$top=1`)
    .catch(async (error: unknown) => {
      if (!isQueryMismatchError(error)) throw error;
      if (!normalizedPublishKey || normalizedPublishKey !== DEFAULT_PUBLISH_KEY) return { value: [] };
      return spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=${baseFilter}&$select=SurveyJSON,FormVersion,PublishedAt,PublishedBy&$orderby=PublishedAt desc&$top=1`).catch(emptyOnQueryMismatch);
    }) as { value?: { SurveyJSON?: string }[] };
  if (normalizedPublishKey === DEFAULT_PUBLISH_KEY && !data.value?.length) {
    data = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=${baseFilter}&$select=SurveyJSON,FormVersion,PublishedAt,PublishedBy&$orderby=PublishedAt desc&$top=1`).catch(emptyOnQueryMismatch) as { value?: { SurveyJSON?: string }[] };
  }
  const row = data.value?.[0];
  if (!row?.SurveyJSON) return null;
  try {
    const parsed = JSON.parse(row.SurveyJSON);
    return {
      ...parsed,
      publishStatus: (row as { PublishStatus?: string }).PublishStatus || parsed.publishStatus,
      publishExpiresAt: (row as { PublishExpiresAt?: string }).PublishExpiresAt || parsed.publishExpiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * A publish profile is the same version with a different workflow, so it has to
 * ask the same questions as the form it belongs to.
 *
 * Every profile is stored as its own row and so carries its own copy of the
 * survey and its meta - a copy taken when the profile was last saved and never
 * moved since. Serving that copy is what left `?publish=...` links showing an
 * out-of-date company list while `/form/{slug}` showed the current one. The
 * questions, the choices and the banner meta now come from the default profile
 * of the same version; the profile row keeps only what a profile is for: its
 * own workflow, its label, and whether it is still open.
 *
 * A profile whose version has no default row keeps its own content, so no link
 * that works today can lose its questions to this.
 */
export async function getFormVersion(
  token: string,
  listTitle: string,
  version: string,
  publishKey?: string | null
): Promise<FormVersionData | null> {
  const normalizedPublishKey = publishKey ? normalizePublishKey(publishKey) : "";
  const profile = await readFormVersionRow(token, listTitle, version, normalizedPublishKey);
  if (!profile || !normalizedPublishKey || normalizedPublishKey === DEFAULT_PUBLISH_KEY) return profile;
  const base = await readFormVersionRow(token, listTitle, version, DEFAULT_PUBLISH_KEY).catch(() => null);
  if (!base?.surveyJson) return profile;
  return { ...profile, surveyJson: base.surveyJson, meta: base.meta ?? profile.meta };
}

/**
 * addColumn — idempotent.
 * kind: 2=Text 3=Note 4=DateTime 6=Choice 8=Boolean 9=Number 15=MultiChoice
 * multiLine=true → SP.FieldMultiLineText (kind must be 3)
 * richText=true → Enhanced Rich Text (multiLine must be true)
 * choices → required for kind 6 (Choice) and 15 (MultiChoice)
 */
export async function addColumn(
  token: string,
  listTitle: string,
  fieldName: string,
  kind: number,
  multiLine = false,
  richText = false,
  choices?: string[]
): Promise<void> {
  await ensureColumns(token, listTitle, [{ n: fieldName, k: kind, ml: multiLine, rt: richText, choices }]);
}

export async function ensureColumns(
  token: string,
  listTitle: string,
  columns: SpColumnSpec[],
): Promise<EnsureColumnsResult> {
  if (columns.length === 0) return { created: [], existing: [] };

  const existingColumns = await getExistingColumnNames(token, listTitle);
  const result: EnsureColumnsResult = { created: [], existing: [] };
  for (const column of columns) {
    const normalized = normalizeColumnName(column.n);
    if (existingColumns.has(normalized)) {
      if (column.k === SP_FIELD_KIND.image) {
        await repairUrlColumnDisplayFormat(token, listTitle, column.n);
      }
      if (column.fillIn) {
        await repairChoiceColumnFillIn(token, listTitle, column.n, column.k);
      }
      result.existing.push(column.n);
      continue;
    }
    await createColumn(token, listTitle, column);
    existingColumns.add(normalized);
    result.created.push(column.n);
  }
  return result;
}

export async function deleteListColumnsWhere(
  listTitle: string,
  filterExpr: string,
  token: string
): Promise<number> {
  const encodedListTitle = encodeURIComponent(listTitle);
  const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodedListTitle}')/Fields?$filter=${encodeURIComponent(filterExpr)}`;
  const response = await fetchWithTimeout(url, {
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    return 0;
  }
  const data = await response.json();
  const columns = data.value || [];
  let deleted = 0;
  for (const item of columns) {
    if (!item.Id) continue;
    const encodedId = encodeURIComponent(item.Id.toString());
    const deleteUrl = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodedListTitle}')/Fields('${encodedId}')`;
    const digest = await getDigest(token);
    const deleteResponse = await fetchWithTimeout(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json;odata=nometadata',
        'Authorization': `Bearer ${token}`,
        'X-RequestDigest': digest,
      },
    });
    if (deleteResponse.ok) {
      deleted += 1;
    }
  }
  if (deleted > 0) {
    columnCache.delete(columnCacheKey(listTitle));
  }
  return deleted;
}

export async function createSpList(
  token: string,
  listTitle: string,
  baseTemplate = 100,
  description = ""
): Promise<unknown> {
  columnCache.delete(columnCacheKey(listTitle));
  const d = await getDigest(token);
  const r = await fetchWithTimeout(`${SP_SITE_URL}/_api/web/lists`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata", "Content-Type": "application/json;odata=verbose", "X-RequestDigest": d },
    body: JSON.stringify({ __metadata: { type: "SP.List" }, AllowContentTypes: false, BaseTemplate: baseTemplate, ContentTypesEnabled: false, Title: listTitle, Description: description }),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`createSpList ${r.status}: ${t}`); }
  // Retry: wait for the list to be available (SP provisioning)
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise(res => setTimeout(res, 1000));
    if (await listExists(token, listTitle)) break;
  }
  return r.status === 204 ? {} : r.json().catch(() => ({}));
}

export async function listExists(
  token: string,
  listTitle: string
): Promise<boolean> {
  const encodedListTitle = encodeURIComponent(listTitle);
  const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodedListTitle}')`;
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'Accept': 'application/json;odata=nometadata',
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ── Low-level HTTP helpers (from reference) ─────────────────────────────────────
export async function ensureSpList(
  token: string,
  listTitle: string,
  options: { baseTemplate?: number; description?: string } = {},
): Promise<boolean> {
  if (await listExists(token, listTitle)) return false;
  await createSpList(token, listTitle, options.baseTemplate ?? 100, options.description ?? '');
  return true;
}

export async function ensureListSchema(
  token: string,
  schema: SpListSchema,
  onLog?: (msg: string, type: string) => void,
): Promise<EnsureColumnsResult> {
  const createdList = await ensureSpList(token, schema.title, {
    baseTemplate: schema.baseTemplate,
    description: schema.description,
  });
  onLog?.(`${createdList ? 'Created' : 'Found'} list "${schema.title}"`, createdList ? 'ok' : 'info');

  const columns = schema.columns ?? [];
  const result = await ensureColumns(token, schema.title, columns);
  for (const column of columns) {
    const status = result.created.includes(column.n) ? 'created' : 'exists';
    onLog?.(`  ${status}: ${column.n}`, 'ok');
  }
  await ensureIndexedColumns(token, schema.title, LIST_INDEXES[schema.title] ?? [], onLog);
  return result;
}

export function makeListSchema(
  title: string,
  columns: SpColumnSpec[],
  options: { baseTemplate?: number; description?: string } = {},
): SpListSchema {
  return {
    title,
    baseTemplate: options.baseTemplate,
    description: options.description,
    columns,
  };
}

export async function ensurePdpaColumns(token: string, listTitle: string): Promise<EnsureColumnsResult> {
  return ensureColumns(token, listTitle, PDPA_COLUMN_SPECS);
}

export async function ensurePdfUrlColumn(token: string, listTitle: string): Promise<EnsureColumnsResult> {
  return ensureColumns(token, listTitle, [PDF_URL_COLUMN_SPEC]);
}

export async function ensureSelectedBranchColumn(token: string, listTitle: string): Promise<EnsureColumnsResult> {
  return ensureColumns(token, listTitle, [SELECTED_BRANCH_COLUMN_SPEC]);
}

export async function ensureDocumentLibrary(
  token: string,
  libraryName: string,
  description = "",
  onLog?: (msg: string) => void,
): Promise<string> {
  const created = await ensureSpList(token, libraryName, {
    baseTemplate: 101,
    description,
  });
  if (created) {
    onLog?.(`Created document library "${libraryName}"`);
  }
  return libraryName;
}

export async function spGet(token: string, url: string): Promise<unknown> {
  const response = await fetchWithTimeout(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json;odata=nometadata',
    },
  });
  if (!response.ok) throw new SharePointHttpError(`GET ${url}`, response);
  return response.json();
}

export async function spPost(token: string, url: string, body: unknown): Promise<unknown> {
  const digest = await getDigest(token);
  const cleanBody = body ? JSON.parse(JSON.stringify(body)) : {};
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'X-RequestDigest': digest,
    },
    body: JSON.stringify(cleanBody),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST ${response.status}: ${text}`);
  }
  return response.status === 204 ? {} : response.json().catch(() => ({}));
}

export async function spPatch(token: string, url: string, body: unknown): Promise<void> {
  const digest = await getDigest(token);
  const cleanBody = body ? JSON.parse(JSON.stringify(body)) : {};
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'X-RequestDigest': digest,
      'IF-MATCH': '*',
      'X-HTTP-Method': 'MERGE',
    },
    body: JSON.stringify(cleanBody),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PATCH ${response.status}: ${text}`);
  }
}

async function getListEntityTypeFullName(token: string, listTitle: string): Promise<string> {
  const data = await spGet(
    token,
    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')?$select=ListItemEntityTypeFullName`,
  ) as { ListItemEntityTypeFullName?: string };
  if (!data.ListItemEntityTypeFullName) {
    throw new Error(`Could not resolve SharePoint entity type for "${listTitle}".`);
  }
  return data.ListItemEntityTypeFullName;
}

export function toAbsoluteSharePointUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed) || !SP_SITE_URL) return trimmed;
  const site = new URL(SP_SITE_URL);
  if (trimmed.startsWith("/")) return `${site.origin}${trimmed}`;
  return `${SP_SITE_URL}/${trimmed.replace(/^\/+/, "")}`;
}

export async function spPatchUrlField(
  token: string,
  listTitle: string,
  itemId: string | number,
  fieldName: string,
  url: string,
  description = "",
): Promise<void> {
  const digest = await getDigest(token);
  const entityType = await getListEntityTypeFullName(token, listTitle);
  const absoluteUrl = toAbsoluteSharePointUrl(url);
  const response = await fetchWithTimeout(`${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${itemId})`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json;odata=verbose',
      'Content-Type': 'application/json;odata=verbose',
      'X-RequestDigest': digest,
      'IF-MATCH': '*',
      'X-HTTP-Method': 'MERGE',
    },
    body: JSON.stringify({
      __metadata: { type: entityType },
      [fieldName]: {
        __metadata: { type: 'SP.FieldUrlValue' },
        Url: absoluteUrl,
        Description: description || absoluteUrl,
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PATCH URL field ${response.status}: ${text}`);
  }
}

export async function spDelete(token: string, url: string): Promise<void> {
  const digest = await getDigest(token);
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-RequestDigest': digest,
      'IF-MATCH': '*',
      'X-HTTP-Method': 'DELETE',
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`DELETE ${response.status}: ${text}`);
  }
}

// ── Version helpers (from reference) ─────────────────────────────────────────
function parseVersion(v: string): { major: number; minor: number } {
  const [major = 1, minor = 0] = (v || '1.0').split('.').map(Number);
  return { major, minor };
}

function formatVersion({ major, minor }: { major: number; minor: number }): string {
  return `${major}.${minor}`;
}

export function incrementMinor(version: string): string {
  const { major, minor } = parseVersion(version);
  return formatVersion({ major, minor: minor + 1 });
}

export function incrementMajor(version: string): string {
  return formatVersion({ major: parseVersion(version).major + 1, minor: 0 });
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a), pb = parseVersion(b);
  return pa.major !== pb.major ? pa.major - pb.major : pa.minor - pb.minor;
}

export function isVersionGreater(a: string, b: string): boolean {
  return compareVersions(a, b) > 0;
}

// ── Form Config CRUD (from reference) ────────────────────────────────────────
interface FormConfigData {
  Id?: string;
  Title: string;
  FormID?: string;
  NumberOfApprovalLayer?: number;
  Slug?: string;
  CurrentVersion?: string;
  CurrentPublishKey?: string;
  CurrentPublishLabel?: string;
  IsPublished?: boolean;
  IsPublic?: boolean;
  ConditionField?: string;
  ApprovalRules?: string;
  LayerConfig?: string;
  /** JSON `ReferenceNumberConfig`; see src/utils/referenceNumber.ts. */
  ReferenceConfig?: string;
}

export async function getAllFormConfigs(token: string): Promise<FormConfigData[]> {
  if (!await listExists(token, 'Master Form')) return [];
  const data = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items?$select=Id,Title,FormID,NumberOfApprovalLayer,Slug,CurrentVersion,CurrentPublishKey,CurrentPublishLabel,IsPublished,IsPublic,ConditionField,ApprovalRules,LayerConfig,ReferenceConfig&$orderby=Title asc&$top=500`) as { value?: FormConfigData[] };
  return data.value || [];
}

export async function getFormConfigByTitle(token: string, listTitle: string): Promise<FormConfigData | null> {
  if (!await listExists(token, 'Master Form')) return null;
  const data = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items?$filter=Title eq '${encodeURIComponent(sanitizeODataValue(listTitle))}'&$select=Id,Title,FormID,NumberOfApprovalLayer,Slug,CurrentVersion,CurrentPublishKey,CurrentPublishLabel,IsPublished,IsPublic,ConditionField,ApprovalRules,LayerConfig,ReferenceConfig&$top=1`) as { value?: FormConfigData[] };
  return data.value?.[0] || null;
}

interface UpsertFormConfigParams {
  formId?: string;
  numLayers?: number;
  slug?: string;
  version?: string;
  currentPublishKey?: string;
  currentPublishLabel?: string;
  isPublished?: boolean;
  isPublic?: boolean;
  conditionField?: string;
  approvalRules?: unknown;
  layerConfig?: string;
  referenceConfig?: string;
}

export async function upsertFormConfig(
  token: string,
  listTitle: string,
  config: UpsertFormConfigParams
): Promise<string> {
  await ensureListExists(token, 'Master Form');
  const existing = await getFormConfigByTitle(token, listTitle);
  const body: Record<string, unknown> = {
    Title: listTitle,
    FormID: config.formId || '',
    NumberOfApprovalLayer: parseInt(String(config.numLayers), 10) || 0,
    LayerConfig: config.layerConfig || '',
    Slug: config.slug || '',
    CurrentVersion: config.version || '1.0',
    CurrentPublishKey: normalizePublishKey(config.currentPublishKey),
    CurrentPublishLabel: config.currentPublishLabel?.trim() || 'Production',
    IsPublished: config.isPublished ?? true,
    IsPublic: config.isPublic ?? true,
    ConditionField: config.conditionField || '',
    ApprovalRules: config.approvalRules ? JSON.stringify(config.approvalRules) : '',
    [REFERENCE_CONFIG_FIELD]: config.referenceConfig || '',
  };

  if (existing?.Id) {
    await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items(${existing.Id})`, body);
    return existing.Id;
  }
  const result = await spPost(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items`, body) as { Id?: string };
  if (!result.Id) throw new Error('upsertFormConfig: POST returned no Id');
  return result.Id;
}

// ── Approvers (from reference) ─────────────────────────────────────────────
interface ApproverLayer {
  email: string;
  name?: string;
}

export async function upsertApprovers(token: string, listTitle: string, layers: ApproverLayer[]): Promise<void> {
  await ensureListExists(token, 'Approvers');
  const existing = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Approvers')/items?$filter=FormTitle eq '${encodeURIComponent(sanitizeODataValue(listTitle))}'&$select=Id&$top=500`) as { value?: { Id: string }[] };
  for (const item of existing.value || []) {
    await spDelete(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Approvers')/items(${item.Id})`);
  }
  for (let i = 0; i < layers.length; i++) {
    if (!layers[i]?.email) continue;
    await spPost(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Approvers')/items`, {
      Title: `${listTitle} - Layer ${i + 1}`,
      FormTitle: listTitle,
      LayerNumber: i + 1,
      ApproverEmail: layers[i].email,
      ApproverName: layers[i].name || '',
    });
  }
}

// ── Form Deletion ─────────────────────────────────────────────────────────

/**
 * Deletes all version records for a form from the Web Form Versions list.
 */
export async function deleteFormVersions(token: string, formTitle: string): Promise<number> {
  if (!await listExists(token, 'Web Form Versions')) return 0;
  const data = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(sanitizeODataValue(formTitle))}'&$select=Id&$top=500`) as { value?: { Id: number }[] };
  const items = data.value || [];
  await Promise.all(items.map(item => spDelete(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items(${item.Id})`)));
  return items.length;
}

/**
 * Deletes all audit log entries for a form from the Form Builder Log list.
 */
export async function deleteFormLogEntries(token: string, formTitle: string): Promise<number> {
  if (!await listExists(token, 'Form Builder Log')) return 0;
  const data = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Form%20Builder%20Log')/items?$filter=FormTitle eq '${encodeURIComponent(sanitizeODataValue(formTitle))}'&$select=Id&$top=500`) as { value?: { Id: number }[] };
  const items = data.value || [];
  await Promise.all(items.map(item => spDelete(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Form%20Builder%20Log')/items(${item.Id})`)));
  return items.length;
}

/**
 * Deletes all approver records for a form from the Approvers list.
 */
export async function deleteFormApprovers(token: string, formTitle: string): Promise<number> {
  if (!await listExists(token, 'Approvers')) return 0;
  const data = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Approvers')/items?$filter=FormTitle eq '${encodeURIComponent(sanitizeODataValue(formTitle))}'&$select=Id&$top=500`) as { value?: { Id: number }[] };
  const items = data.value || [];
  await Promise.all(items.map(item => spDelete(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Approvers')/items(${item.Id})`)));
  return items.length;
}

/**
 * Deletes the form config entry from the Master Form list.
 */
export async function deleteFormConfig(token: string, formId: string): Promise<void> {
  await spDelete(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items(${formId})`);
}

export interface DeleteFormResult {
  configDeleted: boolean;
  versionsDeleted: number;
  logEntriesDeleted: number;
  approversDeleted: number;
  responseListDeleted?: boolean;
  responseItemsDeleted?: number;
}

/**
 * Master delete function — deletes a form and all related rows.
 * Cascades: Web Form Versions → Form Builder Log → Approvers → Master Form.
 * Does NOT delete the form's submission list or response list.
 */
export async function deleteForm(token: string, formTitle: string, formId: string): Promise<DeleteFormResult> {
  const [versionsDeleted, logEntriesDeleted, approversDeleted] = await Promise.all([
    deleteFormVersions(token, formTitle),
    deleteFormLogEntries(token, formTitle),
    deleteFormApprovers(token, formTitle),
  ]);
  await deleteFormConfig(token, formId);
  return { configDeleted: true, versionsDeleted, logEntriesDeleted, approversDeleted };
}

/**
 * Deletes the entire response list for a form (e.g. "Training Form Responses").
 * Uses SharePoint REST API to delete the list itself, not just its items.
 */
export async function deleteResponseList(token: string, formTitle: string): Promise<boolean> {
  const listName = `${formTitle} Responses`;
  const exists = await listExists(token, listName);
  if (!exists) return false;
  await spDelete(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')`);
  columnCache.delete(columnCacheKey(listName));
  return true;
}

/**
 * Hard-delete: deletes the form AND its entire response list with all submissions.
 * Use with extreme caution — data cannot be recovered.
 */
export async function hardDeleteForm(token: string, formTitle: string, formId: string): Promise<DeleteFormResult> {
  const baseResult = await deleteForm(token, formTitle, formId);
  const responseListDeleted = await deleteResponseList(token, formTitle);
  return { ...baseResult, responseListDeleted };
}

// ── Form Versions (from reference) ────────────────────────────────────────
interface FormVersionRecord {
  Title: string;
  FormTitle: string;
  FormSlug: string;
  FormVersion: string;
  PublishKey?: string;
  PublishLabel?: string;
  PublishStatus?: 'active' | 'off';
  PublishExpiresAt?: string;
  DisabledAt?: string;
  DisabledBy?: string;
  SurveyJSON: string;
  PublishedBy: string;
  PublishedAt: string;
}

export async function getFormVersionHistory(token: string, listTitle: string): Promise<FormVersionRecord[]> {
  if (!await listExists(token, 'Web Form Versions')) return [];
  const data = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(sanitizeODataValue(listTitle))}'&$select=FormVersion,PublishKey,PublishLabel,PublishStatus,PublishExpiresAt,DisabledAt,DisabledBy,PublishedAt,PublishedBy,Title&$orderby=PublishedAt desc&$top=100`) as { value?: FormVersionRecord[] };
  return data.value || [];
}

async function getFormVersionRecordId(
  token: string,
  listTitle: string,
  version: string,
  publishKey: string
): Promise<number> {
  const normalizedPublishKey = normalizePublishKey(publishKey);
  let data = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(sanitizeODataValue(listTitle))}' and FormVersion eq '${encodeURIComponent(sanitizeODataValue(version))}' and PublishKey eq '${encodeURIComponent(sanitizeODataValue(normalizedPublishKey))}'&$select=Id&$top=1`)
    .catch(() => ({ value: [] })) as { value?: { Id: number }[] };
  if (normalizedPublishKey === DEFAULT_PUBLISH_KEY && !data.value?.length) {
    data = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(sanitizeODataValue(listTitle))}' and FormVersion eq '${encodeURIComponent(sanitizeODataValue(version))}'&$select=Id&$top=1`).catch(() => ({ value: [] })) as { value?: { Id: number }[] };
  }
  const id = data.value?.[0]?.Id;
  if (!id) throw new Error(`Profile "${normalizedPublishKey}" v${version} not found.`);
  return id;
}

export async function updatePublishProfile(
  token: string,
  params: {
    listTitle: string;
    version: string;
    publishKey: string;
    publishLabel?: string;
    publishStatus?: 'active' | 'off';
    publishExpiresAt?: string;
    changedBy: string;
  }
): Promise<void> {
  await ensureListExists(token, 'Web Form Versions');
  const normalizedPublishKey = normalizePublishKey(params.publishKey);
  const id = await getFormVersionRecordId(token, params.listTitle, params.version, normalizedPublishKey);
  const body: Record<string, unknown> = {};
  const nextLabel = params.publishLabel === undefined
    ? undefined
    : params.publishLabel.trim() || normalizedPublishKey;
  if (nextLabel !== undefined) body.PublishLabel = nextLabel;
  if (params.publishStatus !== undefined) {
    body.PublishStatus = params.publishStatus;
    body.DisabledAt = params.publishStatus === 'off' ? new Date().toISOString() : null;
    body.DisabledBy = params.publishStatus === 'off' ? params.changedBy : '';
  }
  if (params.publishExpiresAt !== undefined) body.PublishExpiresAt = params.publishExpiresAt || null;

  // The profile name is also stored inside the version's own JSON blob, which is
  // what the public form and the builder read back. Rename both together.
  if (nextLabel !== undefined) {
    const versionData = await getFormVersion(token, params.listTitle, params.version, normalizedPublishKey);
    if (versionData) {
      const existingMeta = versionData.meta && typeof versionData.meta === 'object' && !Array.isArray(versionData.meta)
        ? versionData.meta as Record<string, unknown>
        : null;
      body.SurveyJSON = JSON.stringify({
        ...versionData,
        publishLabel: nextLabel,
        meta: existingMeta ? { ...existingMeta, publishLabel: nextLabel } : versionData.meta,
        savedAt: new Date().toISOString(),
        changedBy: params.changedBy,
      }, null, 2);
    }
  }

  await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items(${id})`, body);

  // A renamed profile that is the live default must carry the new name on the
  // form config too, otherwise /form keeps showing the old label.
  if (nextLabel !== undefined) {
    const config = await getFormConfigByTitle(token, params.listTitle);
    if (
      config?.Id &&
      config.CurrentVersion === params.version &&
      normalizePublishKey(config.CurrentPublishKey) === normalizedPublishKey
    ) {
      await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items(${config.Id})`, {
        CurrentPublishLabel: nextLabel,
      });
    }
  }
}

export async function setDefaultPublishProfile(
  token: string,
  params: {
    listTitle: string;
    version: string;
    publishKey: string;
    publishLabel?: string;
  }
): Promise<void> {
  const config = await getFormConfigByTitle(token, params.listTitle);
  if (!config?.Id) throw new Error(`Form "${params.listTitle}" not found.`);
  const normalizedPublishKey = normalizePublishKey(params.publishKey);
  const versionData = await getFormVersion(token, params.listTitle, params.version, normalizedPublishKey);
  if (!versionData) throw new Error(`Profile "${normalizedPublishKey}" v${params.version} not found.`);
  const layerConfig = versionData.layerConfig ? JSON.stringify(versionData.layerConfig) : config.LayerConfig || '';
  await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items(${config.Id})`, {
    CurrentVersion: params.version,
    CurrentPublishKey: normalizedPublishKey,
    CurrentPublishLabel: params.publishLabel?.trim() || versionData.publishLabel || normalizedPublishKey,
    LayerConfig: layerConfig,
    IsPublished: true,
  });
}

function effectiveLayerCountFromConfig(layerConfig: unknown): number {
  if (!layerConfig || typeof layerConfig !== 'object') return 0;
  const config = layerConfig as { layers?: unknown[]; manualBranches?: { layers?: unknown[] }[] };
  const branchCounts = (config.manualBranches ?? []).map((branch) => branch.layers?.length ?? 0);
  return Math.max(config.layers?.length ?? 0, ...branchCounts, 0);
}

export async function updatePublishProfileLayerConfig(
  token: string,
  params: {
    listTitle: string;
    version: string;
    publishKey: string;
    layerConfig: unknown;
    changedBy: string;
  }
): Promise<void> {
  await ensureListExists(token, 'Web Form Versions');
  const normalizedPublishKey = normalizePublishKey(params.publishKey);
  const id = await getFormVersionRecordId(token, params.listTitle, params.version, normalizedPublishKey);
  const versionData = await getFormVersion(token, params.listTitle, params.version, normalizedPublishKey);
  if (!versionData) throw new Error(`Profile "${normalizedPublishKey}" v${params.version} not found.`);
  const updated = {
    ...versionData,
    layerConfig: params.layerConfig,
    savedAt: new Date().toISOString(),
    changedBy: params.changedBy,
  };
  await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items(${id})`, {
    SurveyJSON: JSON.stringify(updated, null, 2),
    PublishedBy: params.changedBy,
    PublishedAt: new Date().toISOString(),
  });

  const config = await getFormConfigByTitle(token, params.listTitle);
  if (
    config?.Id &&
    config.CurrentVersion === params.version &&
    normalizePublishKey(config.CurrentPublishKey) === normalizedPublishKey
  ) {
    await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items(${config.Id})`, {
      LayerConfig: JSON.stringify(params.layerConfig),
      NumberOfApprovalLayer: effectiveLayerCountFromConfig(params.layerConfig),
    });
  }
}

/**
 * Updates the Document Control Header stored in a single publish profile's
 * version record (meta.documentHeader), without touching its survey or layers.
 * Each profile owns its own version row, so this is inherently per-profile.
 */
export async function updatePublishProfileDocumentHeader(
  token: string,
  params: {
    listTitle: string;
    version: string;
    publishKey: string;
    documentHeader: DocumentControlHeader;
    changedBy: string;
  }
): Promise<void> {
  await ensureListExists(token, 'Web Form Versions');
  const normalizedPublishKey = normalizePublishKey(params.publishKey);
  const id = await getFormVersionRecordId(token, params.listTitle, params.version, normalizedPublishKey);
  const versionData = await getFormVersion(token, params.listTitle, params.version, normalizedPublishKey);
  if (!versionData) throw new Error(`Profile "${normalizedPublishKey}" v${params.version} not found.`);
  const existingMeta = versionData.meta && typeof versionData.meta === 'object' && !Array.isArray(versionData.meta)
    ? versionData.meta as Record<string, unknown>
    : {};
  const updated = {
    ...versionData,
    meta: { ...existingMeta, documentHeader: params.documentHeader },
    savedAt: new Date().toISOString(),
    changedBy: params.changedBy,
  };
  await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items(${id})`, {
    SurveyJSON: JSON.stringify(updated, null, 2),
    PublishedBy: params.changedBy,
    PublishedAt: new Date().toISOString(),
  });
}

export async function logEvent(
  token: string,
  params: {
    formTitle: string;
    eventType: string;
    changedBy: string;
    before?: unknown;
    after?: unknown;
    summary?: string;
  }
): Promise<void> {
  try {
    await ensureListExists(token, 'Form Builder Log');
    await spPost(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Form%20Builder%20Log')/items`, {
      Title: `${params.formTitle} — ${params.eventType}`,
      FormTitle: params.formTitle,
      EventType: params.eventType,
      ChangedBy: params.changedBy,
      EventSummary: params.summary || '',
      BeforeJSON: params.before ? JSON.stringify(params.before) : '',
      AfterJSON: params.after ? JSON.stringify(params.after) : '',
      EventAt: new Date().toISOString(),
    });
  } catch {
    // Audit logging is best-effort and should not block builder actions.
  }
}

// ── Diff helpers (from reference) ─────────────────────────────────────────
export function diffSurveyJson(before: unknown, after: unknown): unknown[] {
  if (!before) return [{ type: 'FORM_CREATED', summary: 'Form created' }];
  const events: unknown[] = [];

  const getAllElements = (json: unknown): unknown[] => {
    const pages = (json as { pages?: { elements?: unknown[] }[] })?.pages || [];
    return pages.flatMap(p => p.elements || []);
  };

  const bF = getAllElements(before);
  const aF = getAllElements(after);
  const bM = Object.fromEntries(bF.map((f: unknown) => [(f as { name?: string }).name, f]));
  const aM = Object.fromEntries(aF.map((f: unknown) => [(f as { name?: string }).name, f]));
  for (const f of aF) {
    const fname = (f as { name?: string }).name;
    if (fname && !bM[fname]) events.push({ type: 'FIELD_ADDED', summary: `Field added: "${fname}"`, before: null, after: f });
  }
  for (const f of bF) {
    const fname = (f as { name?: string }).name;
    if (fname && !aM[fname]) events.push({ type: 'FIELD_REMOVED', summary: `Field removed: "${fname}"`, before: f, after: null });
  }
  for (const f of aF) {
    const fname = (f as { name?: string }).name;
    if (!fname) continue;
    const p = bM[fname];
    if (p && JSON.stringify(p) !== JSON.stringify(f)) events.push({ type: 'FIELD_CHANGED', summary: `Field modified: "${fname}"`, before: p, after: f });
  }
  return events;
}

// ── Bootstrap (from reference) ──────────────────────────────────────────
const LIST_SCHEMAS: Record<string, { t: number; desc: string; cols: SpColumnSpec[] }> = {
  'Master Form': { t: 100, desc: 'Form builder configuration', cols: [
    { n: 'FormID', k: 2 }, { n: 'NumberOfApprovalLayer', k: 9 },
    { n: 'Slug', k: 2 }, { n: 'CurrentVersion', k: 2 },
    { n: 'CurrentPublishKey', k: 2 }, { n: 'CurrentPublishLabel', k: 2 },
    { n: 'IsPublished', k: 8 }, { n: 'IsPublic', k: 8 },
    { n: 'ConditionField', k: 2 }, { n: 'ApprovalRules', k: 3, ml: true },
    { n: 'LayerConfig', k: 3, ml: true },
    { n: REFERENCE_CONFIG_FIELD, k: 3, ml: true },
  ]},
  'Approvers': { t: 100, desc: 'Approver layers per form', cols: [
    { n: 'FormTitle', k: 2 }, { n: 'LayerNumber', k: 9 },
    { n: 'ApproverEmail', k: 2 }, { n: 'ApproverName', k: 2 },
  ]},
  'Web Form Versions': { t: 100, desc: 'Published form version metadata', cols: [
    { n: 'FormTitle', k: 2 }, { n: 'FormSlug', k: 2 },
    { n: 'FormVersion', k: 2 }, { n: 'PublishKey', k: 2 }, { n: 'PublishLabel', k: 2 },
    { n: 'PublishStatus', k: 2 }, { n: 'PublishExpiresAt', k: 4 },
    { n: 'DisabledAt', k: 4 }, { n: 'DisabledBy', k: 2 },
    { n: 'SurveyJSON', k: 3, ml: true },
    { n: 'PublishedBy', k: 2 }, { n: 'PublishedAt', k: 4 },
  ]},
  'Form Builder Log': { t: 100, desc: 'Audit log', cols: [
    { n: 'FormTitle', k: 2 }, { n: 'EventType', k: 2 },
    { n: 'ChangedBy', k: 2 }, { n: 'EventSummary', k: 3, ml: true },
    { n: 'BeforeJSON', k: 3, ml: true }, { n: 'AfterJSON', k: 3, ml: true },
    { n: 'EventAt', k: 4 },
  ]},
  'AdminPanelSettings': { t: 100, desc: 'Shared admin dashboard settings', cols: [
    { n: 'BackgroundId', k: 2 }, { n: 'CustomImageUrl', k: 3, ml: true },
    { n: 'CustomImageSource', k: 3, ml: true }, { n: 'ImageOpacity', k: 9 },
    { n: 'UpdatedBy', k: 2 }, { n: 'UpdatedAt', k: 4 },
  ]},
  [CAREER_PORTAL_CARD_LIST]: { t: 100, desc: 'Career portal carousel cards', cols: CAREER_PORTAL_CARD_COLUMN_SPECS },
};

const LIST_INDEXES: Record<string, string[]> = {
  'Master Form': ['Title', 'Slug', 'FormID', 'CurrentVersion', 'CurrentPublishKey'],
  'Approvers': ['FormTitle', 'LayerNumber', 'ApproverEmail'],
  'Web Form Versions': ['FormTitle', 'FormSlug', 'FormVersion', 'PublishKey', 'PublishedAt'],
  'Form Builder Log': ['FormTitle', 'EventType', 'ChangedBy', 'EventAt'],
  'AdminPanelSettings': ['BackgroundId', 'UpdatedAt'],
  [CAREER_PORTAL_CARD_LIST]: ['Status', 'SortOrder', 'TargetType', 'TargetValue'],
};

async function ensureListExists(token: string, listTitle: string): Promise<void> {
  const schema = LIST_SCHEMAS[listTitle];
  if (!schema) {
    await ensureSpList(token, listTitle);
    return;
  }
  await ensureListSchema(token, {
    title: listTitle,
    baseTemplate: schema.t,
    description: schema.desc,
    columns: schema.cols,
  });
}

export async function ensureCareerPortalCardList(token: string): Promise<void> {
  await ensureListExists(token, CAREER_PORTAL_CARD_LIST);
}

export async function ensureDashboardBackgroundSettingsList(token: string): Promise<void> {
  await ensureListExists(token, 'AdminPanelSettings');
}

/**
 * The lists the form builder itself reads and writes, and the only ones it may
 * provision.
 *
 * `AdminPanelSettings` and the career portal cards are owned by other pages,
 * which are fixed to the home site and already provision them on demand. The
 * builder is the one screen that can be pointed at another site, so creating
 * them from here put an HR-only list on that site the first time the builder
 * opened there — lists nobody asked for, on a site that has no page to use them.
 */
const BUILDER_LIST_TITLES = ['Master Form', 'Approvers', 'Web Form Versions', 'Form Builder Log'] as const;

export async function bootstrapSystemLists(token: string, onLog?: (msg: string, type: string) => void): Promise<void> {
  for (const title of BUILDER_LIST_TITLES) {
    const schema = LIST_SCHEMAS[title];
    onLog?.(`Checking "${title}"…`, 'info');
    await ensureListSchema(token, {
      title,
      baseTemplate: schema.t,
      description: schema.desc,
      columns: schema.cols,
    }, onLog);
  }
  onLog?.('Bootstrap complete ✓', 'ok');
}

// ── Get latest form by slug (from reference) ────────────────────────────────
export async function getLatestFormBySlug(token: string, slug: string, publishKey?: string | null): Promise<{
  formConfig: FormConfigData;
  surveyJson: unknown;
  meta: unknown;
} | null> {
  const data = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items?$filter=Slug eq '${encodeURIComponent(sanitizeODataValue(slug))}'&$select=Title,CurrentVersion,CurrentPublishKey,CurrentPublishLabel,FormID,NumberOfApprovalLayer,Slug,IsPublished,IsPublic,ConditionField,ApprovalRules,LayerConfig,ReferenceConfig&$top=1`) as { value?: FormConfigData[] };
  const form = data.value?.[0];
  if (!form) return null;
  if (!form.IsPublished) return null;

  const activePublishKey = normalizePublishKey(publishKey || form.CurrentPublishKey);
  const versionData = await getFormVersion(token, form.Title, form.CurrentVersion || '1.0', activePublishKey);
  if (versionData?.publishStatus === 'off' || isPublishExpired(versionData?.publishExpiresAt)) return null;
  const layerConfig = versionData?.layerConfig
    ? JSON.stringify(versionData.layerConfig)
    : form.LayerConfig;
  return {
    formConfig: {
      ...form,
      CurrentPublishKey: activePublishKey,
      CurrentPublishLabel: versionData?.publishLabel || form.CurrentPublishLabel || 'Production',
      LayerConfig: layerConfig,
    },
    surveyJson: versionData?.surveyJson || null,
    meta: versionData?.meta || {},
  };
}

// ── Matrix Child Lists ────────────────────────────────────────────────────

/** Column definition for a dynamicmatrix child list — mirrors `MatrixColumn` in matrixData.ts */
export interface MatrixColumnDef {
  name: string;
  title: string;
  cellType?: string;
  choices?: string[];
  multiSelect?: boolean;
}

export interface MatrixChildParentSnapshot {
  formTitle?: string;
  formVersion?: string;
  submittedAt?: string;
  submittedBy?: string;
}

interface ProvisionFormListOptions {
  formTitle?: string;
  numLayers?: number;
  minLayerColumns?: number;
  includePdpaColumns?: boolean;
  includePdfUrl?: boolean;
  includeFileLibrary?: boolean;
}

const BASE_RESPONSE_COLUMNS: SpColumnSpec[] = [
  // Provisioned on every response list, not only forms with references turned
  // on, so that switching the setting on never needs a schema change mid-life.
  { n: REFERENCE_NO_FIELD, k: SP_FIELD_KIND.text },
  { n: 'SubmittedAt', k: SP_FIELD_KIND.dateTime },
  { n: 'FormVersion', k: SP_FIELD_KIND.text },
  { n: 'PublishKey', k: SP_FIELD_KIND.text },
  { n: 'FormID', k: SP_FIELD_KIND.text },
  { n: 'SubmittedBy', k: SP_FIELD_KIND.text },
  { n: 'Status', k: SP_FIELD_KIND.text },
  { n: 'CurrentApprovalLayer', k: SP_FIELD_KIND.number },
  { n: 'RawJSON', k: SP_FIELD_KIND.note, ml: true },
];

const ENHANCED_LAYER_COLUMNS: SpColumnSpec[] = [
  { n: 'EvaluationData', k: SP_FIELD_KIND.note, ml: true },
  { n: 'WorkflowAssignmentData', k: SP_FIELD_KIND.note, ml: true },
  { n: 'WorkflowEmailLog', k: SP_FIELD_KIND.note, ml: true },
  { n: 'WorkflowEmailSchedule', k: SP_FIELD_KIND.note, ml: true },
  // When each layer last had a replacement link mailed out, so an old link
  // cannot be clicked repeatedly to mail a reviewer. See api/_utils/linkToken.ts.
  { n: 'LinkReissueLog', k: SP_FIELD_KIND.note, ml: true },
  { n: 'CurrentLayer', k: SP_FIELD_KIND.number },
  { n: 'FormStatus', k: SP_FIELD_KIND.text },
  // Why a layer could not be routed, kept on the item so whoever picks the
  // approver can see the reason without re-deriving it from a directory that
  // may have changed since. Forms published before this exist without it; both
  // submit paths drop it rather than failing (OPTIONAL_LAYER_COLUMN_RE).
  { n: 'RoutingNotes', k: SP_FIELD_KIND.note, ml: true },
];

const RESPONSE_INDEXED_COLUMNS = [
  REFERENCE_NO_FIELD,
  'SubmittedAt',
  'FormVersion',
  'PublishKey',
  'FormID',
  'SubmittedBy',
  'Status',
  'CurrentApprovalLayer',
  'CurrentLayer',
  'FormStatus',
  'RetentionUntil',
  'SelectedBranch',
];

function dedupeColumnSpecs(columns: SpColumnSpec[]): SpColumnSpec[] {
  const seen = new Set<string>();
  const deduped: SpColumnSpec[] = [];
  for (const column of columns) {
    const key = normalizeColumnName(column.n);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(column);
  }
  return deduped;
}

function layerColumnSpecs(layerCount: number): SpColumnSpec[] {
  const specs: SpColumnSpec[] = [];
  for (let n = 1; n <= layerCount; n++) {
    specs.push(
      { n: `L${n}_Status`, k: 2 },
      { n: `L${n}_Email`, k: 2 },
      // Every address allowed to act on the layer, "; " joined. Multi-line
      // because an expanded distribution list overruns the 255-char text limit.
      // L{n}_Email stays the primary so legacy readers keep working.
      { n: `L${n}_Emails`, k: 3, ml: true },
      // Where the notification was actually delivered — may include a shared
      // mailbox that receives the notice but cannot act.
      { n: `L${n}_NotifyEmails`, k: 3, ml: true },
      // Which of the allowed addresses completed the layer.
      { n: `L${n}_ActedBy`, k: 2 },
      { n: `L${n}_SignedAt`, k: 4 },
      { n: `L${n}_Rejection`, k: 3, ml: true },
      { n: `L${n}_Signature`, k: 3, ml: true },
      // The value that binds this submission's public review link to it. Minted
      // when the submission reaches a public layer; the link carries it as `k`
      // and the far end refuses anything that does not match. See
      // api/_utils/layerItemAccess.ts.
      { n: `L${n}_LinkToken`, k: 2 },
    );
  }
  return specs;
}

function matrixColumnSpec(col: MatrixColumnDef): SpColumnSpec {
  switch (col.cellType || 'text') {
    case 'dropdown':
      return { n: col.name, k: 6, choices: col.choices };
    case 'date':
      return { n: col.name, k: 4 };
    case 'number':
      return { n: col.name, k: 9 };
    case 'checkbox':
      return { n: col.name, k: 15, choices: col.choices };
    case 'boolean':
      return { n: col.name, k: 8 };
    case 'text':
    default:
      return { n: col.name, k: 2 };
  }
}

async function resolveChoiceValues(
  token: string,
  question: Record<string, unknown>,
  onLog: (msg: string, type: string) => void,
): Promise<string[] | undefined> {
  const src = question.spChoicesSource as { list?: string; column?: string } | undefined;
  const flSrc = question.spFilteredListSource as
    | { list?: string; valueColumn?: string; filterColumn?: string; filterValue?: string }
    | undefined;

  if (src?.list && src?.column) {
    try {
      const choices = await getSharePointChoices(src.list, src.column, token);
      onLog(`  Source choices: ${choices.length} from "${src.list}.${src.column}"`, 'info');
      return choices;
    } catch {
      return [];
    }
  }

  if (flSrc?.list && flSrc?.valueColumn) {
    try {
      // Values only: these become a SharePoint choice column's allowed values,
      // and that column holds what a submission stores, never the label shown
      // beside it. The label column is deliberately not passed here.
      const choices = listChoiceValues(await getFilteredListChoices(
        flSrc.list,
        flSrc.valueColumn,
        token,
        flSrc.filterColumn,
        flSrc.filterValue,
      ));
      onLog(`  Source choices: ${choices.length} from "${flSrc.list}.${flSrc.valueColumn}"`, 'info');
      return choices;
    } catch {
      return [];
    }
  }

  const rawChoices = question.choices as (string | { value?: string; text?: string })[] | undefined;
  if (!Array.isArray(rawChoices) || rawChoices.length === 0) return undefined;
  return rawChoices
    .map((choice) => (typeof choice === 'string' ? choice : choice.value || choice.text || ''))
    .filter(Boolean);
}

async function surveyQuestionColumnSpecs(
  token: string,
  surveyJson: SurveyJson,
  onLog: (msg: string, type: string) => void,
): Promise<{ columns: SpColumnSpec[]; matrixFields: { name: string; columns: MatrixColumnDef[] }[]; hasFileFields: boolean }> {
  const columns: SpColumnSpec[] = [];
  const matrixFields: { name: string; columns: MatrixColumnDef[] }[] = [];
  const questions = flattenQuestions(surveyJson);
  let hasFileFields = false;

  for (const question of questions) {
    if (!question.type || !question.name) continue;
    if (question.type === 'file' || question.type === 'imageupload' || question.type === 'signaturepad') hasFileFields = true;

    if (question.type === 'matrixdynamic' || question.type === 'tableinput' || question.type === 'dynamicmatrix') {
      columns.push(
        { n: `${question.name}_Response`, k: 3, ml: true, rt: true, label: 'matrix HTML' },
        { n: `${question.name}_Html`, k: 3, ml: true, rt: true, label: 'matrix HTML fallback' },
        { n: `${question.name}_Json`, k: 3, ml: true, label: 'matrix JSON' },
        { n: `${question.name}_RowIds`, k: 3, ml: true, label: 'matrix child row IDs' },
      );
      const matrixCols = (question as unknown as Record<string, unknown>).columns as MatrixColumnDef[] | undefined;
      if (Array.isArray(matrixCols) && matrixCols.length > 0) {
        matrixFields.push({
          name: question.name,
          columns: matrixCols.filter((col) => col.name && col.title),
        });
      }
      continue;
    }

    const isFormula = !!(question as unknown as Record<string, unknown>)._expression || question.type === 'expression';
    if (isFormula) {
      columns.push({ n: question.name, k: 9, label: 'Formula -> Number' });
      continue;
    }

    const kind = getSpColumnKind(question);
    if (!kind) continue;

    let choices: string[] | undefined;
    let fillIn = false;
    if (kind.FieldTypeKind === 6 || kind.FieldTypeKind === 15) {
      choices = await resolveChoiceValues(token, question as unknown as Record<string, unknown>, onLog);
      // `showOtherItem` is the SurveyJS name, `hasOther` the builder's — a form saved
      // before the toggle existed may carry either, so honour both.
      const q = question as unknown as Record<string, unknown>;
      fillIn = q.showOtherItem === true || q.hasOther === true;
      if (fillIn) onLog(`  "Other" enabled — column accepts typed answers`, 'info');
    }

    columns.push({
      n: question.name,
      k: kind.FieldTypeKind,
      ml: kind.FieldTypeKind === 3,
      choices,
      fillIn,
      label: kind.label,
    });
  }

  return { columns: dedupeColumnSpecs(columns), matrixFields, hasFileFields };
}

function responseSystemColumnSpecs(options: ProvisionFormListOptions): SpColumnSpec[] {
  const numLayers = options.numLayers ?? 0;
  const layerCount = Math.max(numLayers, options.minLayerColumns ?? 0);
  return dedupeColumnSpecs([
    ...BASE_RESPONSE_COLUMNS,
    ...(options.includePdpaColumns === false ? [] : PDPA_COLUMN_SPECS),
    ...(options.includePdfUrl === false ? [] : [PDF_URL_COLUMN_SPEC]),
    ...layerColumnSpecs(layerCount),
    ...(layerCount > 0 ? ENHANCED_LAYER_COLUMNS : []),
  ]);
}

/** Ensure workflow columns exist before branch selection or layer actions. */
export async function ensureWorkflowColumns(
  token: string,
  listTitle: string,
  layerCount: number,
): Promise<EnsureColumnsResult> {
  const count = Math.max(layerCount, 1);
  const result = await ensureColumns(token, listTitle, dedupeColumnSpecs([
    SELECTED_BRANCH_COLUMN_SPEC,
    { n: 'PublishKey', k: SP_FIELD_KIND.text },
    ...ENHANCED_LAYER_COLUMNS,
    ...layerColumnSpecs(count),
  ]));
  await ensureIndexedColumns(token, listTitle, ['SelectedBranch', 'PublishKey', 'CurrentLayer', 'FormStatus']);
  return result;
}

function logEnsuredColumns(
  columns: SpColumnSpec[],
  result: EnsureColumnsResult,
  onLog: (msg: string, type: string) => void,
): void {
  const created = new Set(result.created);
  for (const column of columns) {
    const status = created.has(column.n) ? 'created' : 'exists';
    const suffix = column.label ? ` (${column.label})` : '';
    onLog(`  ${status}: ${column.n}${suffix}`, 'ok');
  }
}

/**
 * Provisions the actual form submission list used by published forms.
 * Fetches existing columns once, creates only missing fields, and keeps
 * matrix child-list schemas in sync when matrix columns change later.
 */
export async function provisionFormList(
  token: string,
  listTitle: string,
  surveyJson: unknown,
  onLog: (msg: string, type: string) => void = () => {},
  options: ProvisionFormListOptions = {},
): Promise<void> {
  const formTitle = options.formTitle || listTitle;
  onLog(`Checking list "${listTitle}"...`, 'info');

  if (!(await listExists(token, listTitle))) {
    await createSpList(token, listTitle, 100, `Form responses for ${formTitle}`);
    onLog(`Created list "${listTitle}"`, 'ok');
  } else {
    onLog('List exists', 'ok');
  }

  const systemColumns = responseSystemColumnSpecs(options);
  const systemResult = await ensureColumns(token, listTitle, systemColumns);
  logEnsuredColumns(systemColumns, systemResult, onLog);
  await ensureIndexedColumns(token, listTitle, RESPONSE_INDEXED_COLUMNS, onLog);

  if (!surveyJson || typeof surveyJson !== 'object') {
    onLog('No survey JSON, skipped field columns', 'warn');
    return;
  }

  const { columns, matrixFields, hasFileFields } = await surveyQuestionColumnSpecs(token, surveyJson as SurveyJson, onLog);
  const fieldResult = await ensureColumns(token, listTitle, columns);
  logEnsuredColumns(columns, fieldResult, onLog);

  for (const matrix of matrixFields) {
    try {
      await ensureMatrixChildList(token, formTitle, matrix.name, matrix.columns, onLog);
    } catch (e) {
      onLog(`  Matrix child list for "${matrix.name}": ${(e as Error).message}`, 'warn');
    }
  }

  if (hasFileFields && options.includeFileLibrary !== false) {
    try {
      await ensureDocLibrary(token, formTitle, (msg) => onLog(`  ${msg}`, 'info'));
    } catch (e) {
      onLog(`  Doc library: ${(e as Error).message}`, 'warn');
    }
  }

  onLog('Provisioning complete', 'ok');
}

/**
 * Ensures a child list exists for a dynamicmatrix/tableinput field.
 * List name: "{formTitle} Matrix {fieldName}" (sanitized).
 * Creates ParentResponseId (Number), RowIndex (Number), and per-column fields.
 * Returns { listName, listId } or null on failure.
 */
export async function ensureMatrixChildList(
  token: string,
  formTitle: string,
  fieldName: string,
  columns: MatrixColumnDef[],
  onLog: (msg: string, type: string) => void = () => {}
): Promise<{ listName: string; listId: string } | null> {
  // Sanitize field name for SP list title (remove chars that break URL encoding)
  const safeName = fieldName.replace(/[^a-zA-Z0-9_ -]/g, '').trim();
  const listName = `${formTitle} Matrix ${safeName}`;
  const columnSpecs = dedupeColumnSpecs([
    { n: 'ParentResponseId', k: 9 },
    { n: 'RowIndex', k: 9 },
    { n: 'ParentFormTitle', k: SP_FIELD_KIND.text },
    { n: 'ParentFormVersion', k: SP_FIELD_KIND.text },
    { n: 'ParentSubmittedAt', k: SP_FIELD_KIND.dateTime },
    { n: 'ParentSubmittedBy', k: SP_FIELD_KIND.text },
    ...columns.filter((col) => col.name).map(matrixColumnSpec),
  ]);

  onLog(`  Matrix child list "${listName}"…`, 'info');

  if (await listExists(token, listName)) {
    onLog(`    List exists`, 'ok');
  } else {
    await createSpList(token, listName, 100, `Matrix rows for ${formTitle} - ${fieldName}`);
    onLog(`    Created list`, 'ok');
  }

  const ensured = await ensureColumns(token, listName, columnSpecs);
  logEnsuredColumns(columnSpecs, ensured, onLog);
  await ensureIndexedColumns(token, listName, [
    'ParentResponseId',
    'ParentFormTitle',
    'ParentFormVersion',
    'ParentSubmittedAt',
    'ParentSubmittedBy',
  ], onLog);

  // Fetch list ID
  try {
    const listData = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')?$select=Id`) as { Id?: string };
    return { listName, listId: listData.Id || '' };
  } catch {
    return null;
  }
}

/**
 * Writes dynamicmatrix rows as items in a child list.
 * Each row becomes one SP item with ParentResponseId + RowIndex + column values.
 * Returns array of created item IDs.
 */
export async function writeMatrixChildItems(
  token: string,
  listName: string,
  parentResponseId: number,
  rows: Record<string, unknown>[],
  columns: MatrixColumnDef[],
  parentSnapshot: MatrixChildParentSnapshot = {},
): Promise<number[]> {
  const createdIds: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const body: Record<string, unknown> = {
      ParentResponseId: parentResponseId,
      RowIndex: i,
    };
    if (parentSnapshot.formTitle) body.ParentFormTitle = parentSnapshot.formTitle;
    if (parentSnapshot.formVersion) body.ParentFormVersion = parentSnapshot.formVersion;
    if (parentSnapshot.submittedAt) body.ParentSubmittedAt = parentSnapshot.submittedAt;
    if (parentSnapshot.submittedBy) body.ParentSubmittedBy = parentSnapshot.submittedBy;

    // Map row values to column names
    for (const col of columns) {
      if (!col.name) continue;
      body[col.name] = col.cellType === "date"
        ? toSharePointMalaysiaDateTime(row[col.name]) ?? row[col.name] ?? null
        : row[col.name] ?? null;
    }

    const result = await spPost(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items`,
      body
    ) as { Id?: number };

    if (result.Id != null) {
      createdIds.push(result.Id);
    }
  }

  return createdIds;
}

/**
 * Reads all child list rows for a given parent response item.
 * Returns rows sorted by RowIndex ascending.
 */
export async function readMatrixChildItems(
  token: string,
  listName: string,
  parentResponseId: number
): Promise<Record<string, unknown>[]> {
  const data = await spGet(
    token,
    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$filter=ParentResponseId eq ${parentResponseId}&$orderby=RowIndex asc`
  ) as { value?: Record<string, unknown>[] };

  return data.value || [];
}

// ── Response List Provisioning ────────────────────────────────────────────

/**
 * Provisions a dedicated SP list for form responses.
 * Creates [FormTitle] Responses list with system columns + per-field columns.
 * Idempotent — safe to call multiple times.
 */
export async function provisionResponseList(
  token: string,
  formTitle: string,
  surveyJson: unknown,
  onLog: (msg: string, type: string) => void = () => {},
  numLayers?: number
): Promise<void> {
  const listName = `${formTitle} Responses`;
  await provisionFormList(token, listName, surveyJson, onLog, {
    formTitle,
    numLayers,
    minLayerColumns: 0,
    includePdpaColumns: false,
    includePdfUrl: false,
  });
}

// ── Dynamic Matrix → HTML Serialization ────────────────────────────────────

/**
 * Converts a dynamicmatrix response to HTML table for SP storage.
 */
export function dynamicMatrixToHtml(
  rows: unknown,
  questionDef: unknown
): string {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '<em>No rows</em>';
  }

  const qDef = questionDef as { columns?: { title?: string; name?: string }[] };
  const columns = qDef.columns || [];

  // Header
  const headers = ['#', ...columns.map((c) => c.title || c.name)];
  const headerHtml = headers
    .map(
      (h) =>
        `<th style="border:1px solid #ccc;padding:8px;background:#f0f0f0;text-align:left">${escapeHtml(String(h))}</th>`
    )
    .join('');

  // Rows
  const bodyHtml = rows
    .map((row: unknown, i: number) => {
      const r = row as Record<string, unknown>;
      const cells = [
        i + 1,
        ...columns.map((c) => {
          const v = r[c.name ?? ''];
          if (Array.isArray(v)) return v.join(', ');
          return v ?? '';
        }),
      ];
      return `<tr>${cells
        .map(
          (c) =>
            `<td style="border:1px solid #ccc;padding:8px;vertical-align:top">${escapeHtml(String(c))}</td>`
        )
        .join('')}</tr>`;
    })
    .join('');

  return `<table style="border-collapse:collapse;width:100%;font-family:Inter,'Segoe UI','Aptos','Helvetica Neue',Arial,sans-serif;font-size:13px">
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${bodyHtml}</tbody>
  </table>`;
}

// ── Email Notifications via SharePoint ─────────────────────────────────────

interface EmailParams {
  to: string | string[];
  subject: string;
  body: string;
  attachments?: WorkflowEmailAttachment[];
  workflow?: {
    listTitle: string;
    responseItemId: number;
    layer: number;
  };
  /**
   * Present only while a test run is in progress. Carried through to
   * `/api/send-email` so the server can verify the signed ticket and redirect
   * this send to the test address — the browser never decides that redirect
   * itself, it only forwards the ticket it was handed.
   */
  testRun?: { ticket: string; slug: string };
}

interface WorkflowEmailAttachment {
  name: string;
  contentType: string;
  contentBytes: string;
}

/**
 * Sends email via SharePoint REST API (_api/SP.Utilities.Utility.SendEmail)
 */
export async function sendSpEmail(_token: string, { to, subject, body, attachments, workflow, testRun }: EmailParams): Promise<void> {
  // ⚠ SharePoint's SendEmail API has been retired (Sep 2024).
  // All emails are now sent via the /api/send-email API route using Microsoft Graph's sendMail.
  const apiUrl = `${window.location.origin}/api/send-email`;

  const response = await fetchWithTimeout(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { 'X-Api-Key': API_KEY } : {}),
    },
    body: JSON.stringify({
      to,
      subject,
      body,
      attachments,
      workflow,
      ...(testRun ? { testTicket: testRun.ticket, slug: testRun.slug } : {}),
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`sendSpEmail failed ${response.status}: ${err.error || response.statusText}`);
  }
}

// ── Approval Notification Triggers ─────────────────────────────────────────

interface ApprovalNotificationParams {
  formTitle: string;
  submittedBy: string;
  responseItemId: number;
  layer: number;
  totalLayers: number;
  action?: 'submit' | 'approve' | 'reject';
  nextApproverEmail?: string;
  /**
   * Full delivery list for the target layer when it fans out — several
   * evaluators, and/or a shared mailbox that receives the notice without being
   * able to act. Defaults to `nextApproverEmail` alone.
   */
  nextRecipients?: string[];
  nextLayerType?: 'approval' | 'evaluation';
  nextLayerNumber?: number;
  reviewLink?: string;
  pdfUrl?: string;
  responseListTitle?: string;
  throwOnEmailError?: boolean;
  nextEmailSchedule?: EvaluationEmailSchedule;
  /**
   * When the target layer went live, as an ISO timestamp. A delayed evaluation
   * counts its wait from here rather than from now, so a layer an admin routed
   * late still comes due on the date it would have if it had routed itself.
   * Omitted by every caller that notifies a layer at the moment it activates.
   */
  scheduleAnchor?: string;
  attachments?: WorkflowEmailAttachment[];
  /** Present only while a test run is in progress; forwarded to every `sendSpEmail` call below. */
  testRun?: { ticket: string; slug: string };
}

// ── Styled email HTML template ────────────────────────────────────────────

// A function, not a const: the active site can change, and capturing the origin
// at module load would pin generated email links to whichever site loaded first.
function spOrigin(): string {
  try { return new URL(SP_SITE_URL).origin; } catch { return ''; }
}

function absolutePdfUrl(pdfUrl: string | undefined): string | undefined {
  if (!pdfUrl) return undefined;
  return pdfUrl.startsWith('http') ? pdfUrl : `${spOrigin()}${pdfUrl}`;
}

type EmailDetail = WorkflowEmailDetail;

/**
 * Every workflow notice this app sends, in the one shared house style.
 *
 * The layout itself lives in `workflowEmailTemplate.ts` so the browser and the
 * `api/` routes cannot drift into sending two different-looking emails for the
 * same workflow.
 */
function emailBody(params: {
  title: string;
  subtitle: string;
  preheader: string;
  eyebrow?: string;
  statusColor: string;
  statusLabel: string;
  statusBg: string;
  statusBorder: string;
  details: EmailDetail[];
  link?: string;
  linkLabel?: string;
  pdfUrl?: string;
  note?: string;
}): string {
  return renderWorkflowEmail({
    preheader: params.preheader,
    eyebrow: params.eyebrow || params.statusLabel,
    status: {
      label: params.statusLabel,
      color: params.statusColor,
      background: params.statusBg,
      border: params.statusBorder,
    },
    heading: params.title,
    intro: params.subtitle,
    details: params.details,
    actionUrl: params.link || undefined,
    actionLabel: params.linkLabel,
    secondaryUrl: absolutePdfUrl(params.pdfUrl),
    secondaryLabel: 'View PDF record',
    note: params.note,
  });
}

function isManualPaperWorkflowStatus(value: unknown): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "manual evaluation required" || normalized === "manual approval required";
}

/**
 * Reads the two things every workflow subject line needs from the record: the
 * reference recipients search their mailbox by, and the applicant's name.
 *
 * Fetched here rather than threaded through all eight call sites: both are
 * properties of the stored item, and reading them once at send time cannot
 * drift out of step with what the record actually says.
 */
async function getNotificationSubjectContext(
  token: string,
  responseListTitle: string,
  responseItemId: number,
): Promise<{ referenceNo: string; applicantName: string }> {
  try {
    const item = await spGet(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(responseListTitle)}')/items(${responseItemId})`,
    ) as Record<string, unknown>;
    return {
      referenceNo: String(item[REFERENCE_NO_FIELD] || "").trim(),
      applicantName: resolveApplicantName(item),
    };
  } catch {
    // A list without the column, or an unreadable item, simply means a shorter
    // subject line — never a failed notification.
    return { referenceNo: "", applicantName: "" };
  }
}

async function getLayerStatusForNotification(
  token: string,
  responseListTitle: string,
  responseItemId: number,
  layerNumber: number,
): Promise<string> {
  try {
    const item = await spGet(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(responseListTitle)}')/items(${responseItemId})?$select=L${layerNumber}_Status`,
    ) as Record<string, unknown>;
    return String(item[`L${layerNumber}_Status`] || "");
  } catch {
    return "";
  }
}

function manualPaperEmailBody(params: {
  formTitle: string;
  submittedBy: string;
  applicantName?: string;
  responseItemId: number;
  layerNumber: number;
  totalLayers: number;
  layerType: "approval" | "evaluation";
}): string {
  return renderWorkflowEmail({
    preheader: `${params.formTitle} #${params.responseItemId} needs manual ${params.layerType}.`,
    eyebrow: 'Manual workflow',
    status: WORKFLOW_EMAIL_STATUS.manual,
    heading: `${params.formTitle} needs manual ${params.layerType}`,
    intro: `This workflow layer resolved to the configured sender mailbox, so it has been marked for paper/manual handling instead of assigning an online reviewer. Complete the manual ${params.layerType} in the attached or linked PDF record.`,
    details: [
      { label: 'Form', value: params.formTitle },
      { label: 'Submission ID', value: `#${params.responseItemId}` },
      { label: 'Applicant', value: params.applicantName || '' },
      { label: 'Submitted by', value: params.submittedBy },
      { label: 'Workflow stage', value: `Layer ${params.layerNumber} of ${params.totalLayers}` },
    ],
  });
}

/**
 * The action link a workflow notice should carry, worked out from the record.
 *
 * Callers that already know the layer they are mailing pass `reviewLink`
 * themselves. This is for the ones that do not, and it exists because the old
 * answer for those was the Form Builder admin workspace — a superuser-only page
 * that an approver or evaluator cannot open at all, addressed by form name and
 * item id, which is to say by two values the recipient can retype. Approvers
 * were being mailed a link to somebody else's console.
 *
 * What is returned instead is the same `/approval/...` or `/eval/...` link the
 * rest of the workflow issues: built from the layer as the form actually
 * configured it, and, for a public layer, bound to this one submission by the
 * `k` value stored on the record. See `workflowLink.ts`.
 *
 * Returns "" when the layer cannot be identified with certainty, which drops
 * the button from the email rather than pointing it somewhere unintended.
 */
async function resolveWorkflowReviewLink(
  token: string,
  params: {
    formTitle: string;
    responseListTitle: string;
    responseItemId: number;
    layerNumber: number;
    totalLayers: number;
  },
): Promise<string> {
  try {
    const cfg = await getFormConfigByTitle(token, params.formTitle);
    if (!cfg) return "";
    const formSlug = String(cfg.Slug || "").trim();

    const itemUrl = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(params.responseListTitle)}')/items(${params.responseItemId})`;
    const item = await spGet(token, itemUrl) as Record<string, unknown>;
    const selectedBranch = typeof item.SelectedBranch === "string" ? item.SelectedBranch : "";
    const layer = selectWorkflowLayer(cfg.LayerConfig, selectedBranch, params.layerNumber);
    if (!layer) return "";

    // A public layer's link is refused at the far end unless the record carries
    // the matching binding, so mint and store one when this submission reached
    // the layer without going through a path that already did.
    const patch: Record<string, unknown> = {};
    const linkToken = ensureLinkToken(layer, item, params.layerNumber, patch);
    if (Object.keys(patch).length) {
      await ensureWorkflowColumns(token, params.responseListTitle, Math.max(params.totalLayers, params.layerNumber));
      await spPatch(token, itemUrl, patch);
    }
    // A public layer with no binding available cannot be linked to safely.
    if (layer.authMode === "public" && !linkToken) return "";
    // A sign-in layer is addressed by slug; without one there is no route.
    if (layer.authMode !== "public" && !formSlug) return "";

    return buildWorkflowReviewLink({
      baseUrl: window.location.origin,
      layerType: layer.type,
      authMode: layer.authMode,
      publicToken: layer.publicToken,
      formSlug,
      responseItemId: params.responseItemId,
      layerNumber: params.layerNumber,
      linkToken,
    });
  } catch {
    // A notice that goes out without a button still tells the reviewer they
    // have something waiting; one that does not go out at all does not.
    return "";
  }
}

/**
 * Triggers email notifications for approval workflow.
 * Handles: new submission, layer approved, final approval, rejection.
 */
export async function triggerApprovalNotification(
  token: string,
  params: ApprovalNotificationParams
): Promise<void> {
  const { formTitle, submittedBy, responseItemId, layer, totalLayers, action = 'submit', nextApproverEmail, nextRecipients, nextLayerType = 'approval', nextLayerNumber, reviewLink, pdfUrl, responseListTitle = formTitle, throwOnEmailError = false, nextEmailSchedule, scheduleAnchor, attachments, testRun } = params;
  // One address stays a plain string so existing single-assignee mail is byte
  // for byte unchanged; only fan-out layers become an array.
  const deliveryList = (primary: string): string | string[] => {
    const recipients = parseValidEmailList(nextRecipients?.length ? nextRecipients : primary);
    if (recipients.length === 0) return primary;
    return recipients.length === 1 ? recipients[0] : recipients;
  };
  const nextActionNoun = nextLayerType === 'evaluation' ? 'evaluation review' : 'approval';
  const nextActionVerb = nextLayerType === 'evaluation' ? 'review' : 'approve';
  const displayNextLayerNumber = nextLayerNumber ?? layer + 1;
  const workflowStage = `Layer ${displayNextLayerNumber} of ${totalLayers}`;
  const submissionId = `#${responseItemId}`;
  const { referenceNo, applicantName } = await getNotificationSubjectContext(
    token,
    responseListTitle,
    responseItemId,
  );
  // Every subject reads `[Prefix] Form – Applicant (#Reference)`, so a reviewer
  // can tell two waiting requests apart without opening either.
  const subjectFor = (prefix: string): string => buildWorkflowEmailSubject({
    prefix,
    formTitle,
    applicantName,
    submittedBy,
    referenceNo,
    responseItemId,
  });
  const applicantDetail: EmailDetail = { label: 'Applicant', value: applicantName };
  // Empty detail values are dropped by emailBody, so this row simply disappears
  // on forms that do not issue references.
  const referenceDetail: EmailDetail = { label: 'Reference no.', value: referenceNo };
  // The link is per target layer: a "submit" notice is about `layer`, an
  // "approve" notice about the layer the submission has just moved on to.
  // Resolved once each and reused, so one notice costs at most one lookup.
  const resolvedLinks = new Map<number, string>();
  const linkForLayer = async (targetLayer: number): Promise<string> => {
    if (reviewLink) return reviewLink;
    const cached = resolvedLinks.get(targetLayer);
    if (cached !== undefined) return cached;
    const resolved = await resolveWorkflowReviewLink(token, {
      formTitle,
      responseListTitle,
      responseItemId,
      layerNumber: targetLayer,
      totalLayers,
    });
    resolvedLinks.set(targetLayer, resolved);
    return resolved;
  };
  const isEmailAddress = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const persistSchedule = async (recipients: string | string[], targetLayer: number, targetLink: string) => {
    const recipient = Array.isArray(recipients) ? joinEmailList(recipients) : recipients;
    await ensureWorkflowColumns(token, responseListTitle, totalLayers);
    const itemUrl = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(responseListTitle)}')/items(${responseItemId})`;
    const item = await spGet(token, `${itemUrl}?$select=WorkflowEmailSchedule`) as { WorkflowEmailSchedule?: string };
    const now = new Date();
    const anchored = scheduleAnchor ? new Date(scheduleAnchor) : null;
    const activatedAt = anchored && !Number.isNaN(anchored.getTime()) ? anchored : now;
    const schedule = setScheduledWorkflowEmail(item.WorkflowEmailSchedule, {
      layer: targetLayer,
      recipient,
      dueAt: resolveEvaluationEmailDueAt(nextLayerType === "evaluation" ? nextEmailSchedule : undefined, activatedAt),
      status: "scheduled",
      updatedAt: now.toISOString(),
      layerType: nextLayerType,
      totalLayers,
      reviewLink: targetLink,
      submittedBy,
    });
    await spPatch(token, itemUrl, { WorkflowEmailSchedule: JSON.stringify(schedule) });
  };

  try {
    if (action === 'submit') {
      // New submission — prefer the caller's resolved layer email, then fall back to the legacy Approvers list.
      let targetEmail = nextApproverEmail || '';
      if (!targetEmail) {
        try {
          const approvers = await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('Approvers')/items?$filter=FormTitle eq '${encodeURIComponent(sanitizeODataValue(formTitle))}' and LayerNumber eq ${layer}&$select=ApproverEmail,ApproverName&$top=1`
          ) as { value?: { ApproverEmail?: string; ApproverName?: string }[] };
          targetEmail = approvers.value?.[0]?.ApproverEmail || '';
        } catch {
          targetEmail = '';
        }
      }

      if (targetEmail) {
        const targetLayerStatus = await getLayerStatusForNotification(token, responseListTitle, responseItemId, layer);
        const submitRecipients = deliveryList(targetEmail);
        const submitLink = await linkForLayer(layer);
        await persistSchedule(submitRecipients, layer, submitLink);
        if (isManualPaperWorkflowStatus(targetLayerStatus)) {
          await sendSpEmail(token, {
            testRun,
            to: submitRecipients,
            subject: subjectFor('Manual Action Required'),
            attachments,
            workflow: {
              listTitle: responseListTitle,
              responseItemId,
              layer,
            },
            body: manualPaperEmailBody({
              formTitle,
              submittedBy,
              applicantName,
              responseItemId,
              layerNumber: layer,
              totalLayers,
              layerType: nextLayerType,
            }),
          });
          return;
        }
        if (nextLayerType === "evaluation" && nextEmailSchedule && nextEmailSchedule.mode !== "immediate") {
          return;
        }
        await sendSpEmail(token, {
          testRun,
          to: submitRecipients,
          subject: subjectFor('Action Required'),
          workflow: {
            listTitle: responseListTitle,
            responseItemId,
            layer,
          },
          body: emailBody({
            title: `${formTitle} needs your ${nextActionNoun}`,
            subtitle: `A new submission is waiting for you to ${nextActionVerb}. Review the request details and record your decision in PMW HR Form.`,
            preheader: `${formTitle} ${submissionId} is waiting for ${nextActionNoun}.`,
            statusColor: '#1E40AF',
            statusLabel: 'Action required',
            statusBg: '#EFF6FF',
            statusBorder: '#BFDBFE',
            details: [
              { label: 'Form', value: formTitle },
              referenceDetail,
              { label: 'Submission ID', value: submissionId },
              applicantDetail,
              { label: 'Submitted by', value: submittedBy },
              { label: 'Workflow stage', value: `Layer ${layer} of ${totalLayers}` },
              { label: 'Current status', value: 'Submitted' },
            ],
            link: submitLink,
            linkLabel: nextLayerType === 'evaluation' ? 'Open evaluation' : 'Open approval',
            note: 'Please complete this step when you have enough context to make the decision.',
          }),
        });
      }
    } else if (action === 'approve') {
      if (layer < totalLayers && nextApproverEmail) {
        // Notify next layer approver
        const targetLayerStatus = await getLayerStatusForNotification(token, responseListTitle, responseItemId, displayNextLayerNumber);
        const nextLayerRecipients = deliveryList(nextApproverEmail);
        const nextLayerLink = await linkForLayer(displayNextLayerNumber);
        await persistSchedule(nextLayerRecipients, displayNextLayerNumber, nextLayerLink);
        if (isManualPaperWorkflowStatus(targetLayerStatus)) {
          await sendSpEmail(token, {
            testRun,
            to: nextLayerRecipients,
            subject: subjectFor('Manual Action Required'),
            attachments,
            workflow: {
              listTitle: responseListTitle,
              responseItemId,
              layer: displayNextLayerNumber,
            },
            body: manualPaperEmailBody({
              formTitle,
              submittedBy,
              applicantName,
              responseItemId,
              layerNumber: displayNextLayerNumber,
              totalLayers,
              layerType: nextLayerType,
            }),
          });
          return;
        }
        if (nextLayerType === "evaluation" && nextEmailSchedule && nextEmailSchedule.mode !== "immediate") {
          return;
        }
        await sendSpEmail(token, {
          testRun,
          to: nextLayerRecipients,
          subject: subjectFor('Action Required'),
          workflow: {
            listTitle: responseListTitle,
            responseItemId,
            layer: displayNextLayerNumber,
          },
          body: emailBody({
            title: `${formTitle} is ready for your ${nextActionNoun}`,
            subtitle: `The previous workflow step has been completed. This request now needs you to ${nextActionVerb} Layer ${displayNextLayerNumber}.`,
            preheader: `${formTitle} ${submissionId} has advanced to ${workflowStage}.`,
            statusColor: '#92400E',
            statusLabel: nextLayerType === 'evaluation' ? 'Pending review' : 'Pending approval',
            statusBg: '#FFFBEB',
            statusBorder: '#FDE68A',
            details: [
              { label: 'Form', value: formTitle },
              referenceDetail,
              { label: 'Submission ID', value: submissionId },
              applicantDetail,
              { label: 'Submitted by', value: submittedBy },
              { label: 'Completed step', value: `Layer ${layer} of ${totalLayers}` },
              { label: 'Current step', value: workflowStage },
            ],
            link: nextLayerLink,
            linkLabel: nextLayerType === 'evaluation' ? 'Open evaluation' : 'Open approval',
            pdfUrl,
            note: 'Only the assigned reviewer or an authorized superuser should act on this workflow step.',
          }),
        });
      } else if (layer === totalLayers && isEmailAddress(submittedBy)) {
        // Final approval - notify submitter
        await sendSpEmail(token, {
          testRun,
          to: submittedBy,
          subject: subjectFor('Completed'),
          workflow: {
            listTitle: responseListTitle,
            responseItemId,
            layer,
          },
          body: emailBody({
            title: `${formTitle} has been completed`,
            subtitle: `Every workflow layer has been completed, the last of them at layer #${layer}. No further action is needed from you at this time.`,
            preheader: `${formTitle} ${submissionId} has been completed.`,
            eyebrow: 'Status update',
            statusColor: '#065F46',
            statusLabel: 'Completed',
            statusBg: '#ECFDF5',
            statusBorder: '#A7F3D0',
            details: [
              { label: 'Form', value: formTitle },
              referenceDetail,
              { label: 'Submission ID', value: submissionId },
              applicantDetail,
              { label: 'Final status', value: `Completed at layer #${layer}` },
              { label: 'Completed layers', value: totalLayers },
            ],
            pdfUrl,
            note: 'Keep the PDF record for reference if your department process requires it.',
          }),
        });
      }
    } else if (action === 'reject' && isEmailAddress(submittedBy)) {
      // Notify submitter of rejection
      await sendSpEmail(token, {
        testRun,
        to: submittedBy,
        subject: subjectFor('Rejected'),
        workflow: {
          listTitle: responseListTitle,
          responseItemId,
          layer,
        },
        body: emailBody({
          title: `${formTitle} was rejected at layer #${layer}`,
          subtitle: 'The workflow has been closed at this step. Open the request record to review the outcome details and any recorded reason.',
          preheader: `${formTitle} ${submissionId} was rejected at layer #${layer}.`,
          eyebrow: 'Status update',
          statusColor: '#991B1B',
          statusLabel: 'Rejected',
          statusBg: '#FEF2F2',
          statusBorder: '#FECACA',
          details: [
            { label: 'Form', value: formTitle },
            referenceDetail,
            { label: 'Submission ID', value: submissionId },
            applicantDetail,
            { label: 'Final status', value: `Rejected at layer #${layer}` },
            { label: 'Closed at', value: `Layer ${layer} of ${totalLayers}` },
          ],
          pdfUrl,
          note: 'Contact the reviewing department if you need clarification before submitting a new request.',
        }),
      });
    }
  } catch (error) {
    if (throwOnEmailError) throw error;
    // Don't throw - email failures shouldn't block the workflow
  }
}

/**
 * Fetches a response item and parses the data needed for a specific layer's evaluation/approval view.
 * Returns the response item fields, layer config, and previous layer results.
 */
export async function getLayerResponseData(
  token: string,
  formTitle: string,
  responseItemId: number,
  layerNumber: number
): Promise<{
  responseFields: Record<string, unknown>;
  layerConfig: LayerConfigItem[];
  currentLayer: LayerConfigItem | undefined;
  previousResults: Record<string, unknown>[];
  evaluationData: Record<string, unknown>;
} | null> {
  try {
    // Fetch the response item
    const item = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(formTitle)}')/items(${responseItemId})`) as Record<string, unknown>;

    const normalizedFormTitle = formTitle.replace(/ Responses$/, "");
    const responseFormVersion = typeof item.FormVersion === 'string' && item.FormVersion.trim() ? item.FormVersion.trim() : '';
    const responsePublishKey = typeof item.PublishKey === 'string' && item.PublishKey.trim() ? item.PublishKey.trim() : '';

    // Fetch form config for fallback layer info.
    const configData = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items?$filter=Title eq '${encodeURIComponent(sanitizeODataValue(normalizedFormTitle))}'&$select=LayerConfig,CurrentVersion,CurrentPublishKey&$top=1`) as { value?: Record<string, unknown>[] };
    const config = configData?.value?.[0];
    const fallbackVersion = typeof config?.CurrentVersion === 'string' && config.CurrentVersion.trim() ? config.CurrentVersion.trim() : '1.0';
    const fallbackPublishKey = typeof config?.CurrentPublishKey === 'string' && config.CurrentPublishKey.trim() ? config.CurrentPublishKey.trim() : DEFAULT_PUBLISH_KEY;
    const versionData = await getFormVersion(
      token,
      normalizedFormTitle,
      responseFormVersion || fallbackVersion,
      responsePublishKey || fallbackPublishKey,
    );
    const rawLayerConfig = versionData?.layerConfig
      ? JSON.stringify(versionData.layerConfig)
      : config?.LayerConfig as string | undefined;
    let layerConfig: LayerConfigItem[] = [];
    if (rawLayerConfig) {
      try {
        const parsed = JSON.parse(rawLayerConfig);
        const selectedBranch = typeof item.SelectedBranch === 'string' ? item.SelectedBranch.trim().toLowerCase() : '';
        if (selectedBranch && Array.isArray(parsed.manualBranches)) {
          const branch = parsed.manualBranches.find((b: { name?: string; label?: string; layers?: LayerConfigItem[] }) =>
            [b.name, b.label].some((candidate) => typeof candidate === 'string' && candidate.trim().toLowerCase() === selectedBranch)
          );
          layerConfig = branch?.layers || parsed.layers || [];
        } else {
          layerConfig = parsed.layers || [];
        }
      } catch {}
    }

    const currentLayer = layerConfig.find((l: LayerConfigItem) => l.layerNumber === layerNumber);

    // Parse evaluation data
    let evaluationData: Record<string, unknown> = {};
    const rawEvalData = item.EvaluationData as string | undefined;
    if (rawEvalData) {
      try { evaluationData = JSON.parse(rawEvalData); } catch {}
    }

    // Build previous layer results
    const previousResults: Record<string, unknown>[] = [];
    for (let n = 1; n < layerNumber; n++) {
      const statusVal = item[`L${n}_Status`];
      const emailVal = item[`L${n}_Email`];
      const signedAtVal = item[`L${n}_SignedAt`];
      previousResults.push({
        layerNumber: n,
        status: statusVal,
        email: emailVal,
        signedAt: signedAtVal,
        evaluationData: evaluationData[n],
      });
    }

    return {
      responseFields: item,
      layerConfig,
      currentLayer,
      previousResults,
      evaluationData,
    };
  } catch {
    return null;
  }
}

/**
 * Appends evaluation results to the EvaluationData JSON column of a response item.
 * The column stores Record<layerNumber, EvaluationDataEntry> as a JSON string.
 */
export async function submitEvaluationData(
  token: string,
  listTitle: string,
  responseItemId: number,
  layerNumber: number,
  data: {
    confirmerEmail: string;
    confirmerName?: string;
    fields: Record<string, unknown>;
    notes?: string;
    signatureUrl?: string | null;
  }
): Promise<void> {
  // 1. Fetch current item
  const item = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${responseItemId})?$select=Id,EvaluationData`);

  // 2. Parse existing data
  let allData: Record<number, EvaluationDataEntry> = {};
  const rawEvalData = (item as Record<string, unknown>).EvaluationData as string | undefined;
  if (rawEvalData && rawEvalData.trim()) {
    try { allData = JSON.parse(rawEvalData) as Record<number, EvaluationDataEntry>; } catch {}
  }

  // 3. Set/update this layer's entry
  allData[layerNumber] = {
    status: "confirmed" as LayerStatus,
    confirmerEmail: data.confirmerEmail,
    confirmerName: data.confirmerName ?? null,
    confirmedAt: new Date().toISOString(),
    fields: data.fields,
    notes: data.notes,
    signatureUrl: data.signatureUrl ?? null,
  };

  // 4. Update the item
  await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${responseItemId})`, {
    EvaluationData: JSON.stringify(allData),
  });
}

/**
 * Updates a specific approval layer's status columns on a response item.
 * Patches L{n}_Status, L{n}_SignedAt, L{n}_Rejection, L{n}_Signature as needed.
 */
export async function updateLayerStatus(
  token: string,
  listTitle: string,
  responseItemId: number,
  layerNumber: number,
  updates: {
    status: string;
    email?: string;
    signedAt?: string;
    rejection?: string;
    signature?: string;
    /**
     * Which of the layer's assignees actually acted. On a layer shared by
     * several people, L{n}_Email only names the primary, so without this there
     * is no record of who decided.
     */
    actedBy?: string;
  }
): Promise<void> {
  const body: Record<string, unknown> = {
    [`L${layerNumber}_Status`]: updates.status,
  };
  if (updates.signedAt !== undefined) body[`L${layerNumber}_SignedAt`] = updates.signedAt;
  if (updates.rejection !== undefined) body[`L${layerNumber}_Rejection`] = updates.rejection;
  if (updates.signature !== undefined) body[`L${layerNumber}_Signature`] = updates.signature;
  if (updates.email !== undefined) body[`L${layerNumber}_Email`] = updates.email;
  if (updates.actedBy) body[`L${layerNumber}_ActedBy`] = updates.actedBy;

  await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${responseItemId})`, body);
}

// ── Signature Image Upload ─────────────────────────────────────────────
// Signatures are uploaded as PNG files to a "Signature Images" document
// library and linked via a URL/Hyperlink column in the response list.
//
// File naming: {action}-{formId}-{yymmdd}{xxx}.png
//   action  = "submission" | "approval" | "reject"
//   formId  = form identifier
//   yymmdd  = local date (2-digit year, 2-digit month, 2-digit day)
//   xxx     = daily counter starting at 001

const SIGNATURE_LIBRARY = "Signature Images";

/** Get the next daily counter by checking existing files for today */
async function getNextSignatureCounter(token: string, formId: string, action: string): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const prefix = `${action}-${formId}-${yy}${mm}${dd}`;

  try {
    // List files matching today's prefix
    const query = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(SIGNATURE_LIBRARY)}')/rootfolder/files?$select=Name&$filter=startswith(Name,'${encodeURIComponent(sanitizeODataValue(prefix))}')&$orderby=Name desc&$top=1`;
    const data = await spGet(token, query) as { value?: { Name?: string }[] };

    const lastName = data.value?.[0]?.Name;
    if (lastName) {
      const match = lastName.match(/^.+(\d{3})\.png$/);
      if (match) {
        return String(parseInt(match[1], 10) + 1).padStart(3, '0');
      }
    }
  } catch {
    // Library might not exist yet — start at 001
  }

  return '001';
}

/**
 * Upload a base64 signature image to the Signature Images document library.
 * Returns the server-relative URL to the uploaded file.
 */
export async function uploadSignatureImage(
  token: string,
  formId: string,
  action: "submission",
  base64DataUrl: string,
): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const counter = await getNextSignatureCounter(token, formId, action);
  const fileName = `${action}-${formId}-${yy}${mm}${dd}${counter}.png`;

  await ensureDocumentLibrary(token, SIGNATURE_LIBRARY, "Signature image uploads");
  return uploadFileToDocLib(token, SIGNATURE_LIBRARY, fileName, base64DataUrl);
}

/**
 * Uploads a generated PDF to the Form PDFs document library and returns the server-relative URL.
 */
const PDF_LIBRARY = "Form PDFs";

export async function ensureFormPdfsLibrary(token: string): Promise<void> {
  await ensureDocumentLibrary(token, PDF_LIBRARY, "Generated form submission PDFs");
}

export async function uploadFormPdf(token: string, formTitle: string, responseId: number, pdfBlob: Blob): Promise<string> {
  await ensureFormPdfsLibrary(token);
  const fileName = `${formTitle.replace(/[^a-zA-Z0-9_-]/g, "_")}_${responseId}_${new Date().toISOString().split("T")[0]}.pdf`;
  const bytes = new Uint8Array(await pdfBlob.arrayBuffer());
  const sitePath = new URL(SP_SITE_URL).pathname;
  const result = await spUploadFile(token, PDF_LIBRARY, fileName, bytes) as { ServerRelativeUrl?: string };
  return result.ServerRelativeUrl ?? `${sitePath}/${PDF_LIBRARY}/${fileName}`;
}

export async function deleteFormPdf(token: string, pdfUrl: string): Promise<void> {
  if (!pdfUrl.trim()) return;
  let serverRelativeUrl = pdfUrl.trim();
  try {
    if (/^https?:\/\//i.test(serverRelativeUrl)) {
      serverRelativeUrl = new URL(serverRelativeUrl).pathname;
    }
    serverRelativeUrl = decodeURIComponent(serverRelativeUrl.split(/[?#]/)[0] ?? serverRelativeUrl);
  } catch {
    throw new Error("The existing PDF URL is invalid.");
  }
  if (!serverRelativeUrl.toLowerCase().includes(`/${PDF_LIBRARY.toLowerCase()}/`)) {
    throw new Error("Refusing to delete a file outside the Form PDFs library.");
  }
  const encodedPath = encodeURIComponent(sanitizeODataValue(serverRelativeUrl)).replace(/%2F/gi, "/");
  await spDelete(token, `${SP_SITE_URL}/_api/web/getFileByServerRelativePath(decodedurl='${encodedPath}')`);
}

// ── Document Library File Upload ────────────────────────────────────────

/**
 * Ensures a per-form document library exists for file uploads.
 * Creates `{formTitle} Files` if it doesn't already exist.
 * Returns the library name.
 */
export async function ensureDocLibrary(
  token: string,
  formTitle: string,
  onLog?: (msg: string) => void,
): Promise<string> {
  const libName = `${formTitle} Files`;
  return ensureDocumentLibrary(token, libName, `Uploaded files for ${formTitle}`, onLog);
}

/**
 * Uploads a base64-encoded file to a SharePoint document library.
 * Accepts raw base64 or a full data URI (data:mime;base64,...).
 * Returns the server-relative URL of the uploaded file.
 */
export async function uploadFileToDocLib(
  token: string,
  listName: string,
  fileName: string,
  base64Content: string,
  onLog?: (msg: string) => void,
): Promise<string> {
  // Strip data URI prefix if present: data:mime;base64,<payload>
  let base64 = base64Content;
  const match = base64.match(/^data:[\w/+-]+;base64,(.+)$/);
  if (match) base64 = match[1];

  // Decode base64 → binary
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const sitePath = new URL(SP_SITE_URL).pathname;
  const result = await spUploadFile(token, listName, fileName, bytes) as { ServerRelativeUrl?: string };
  const url = result.ServerRelativeUrl ?? `${sitePath}/${listName}/${fileName}`;
  onLog?.(`Uploaded "${fileName}" to "${listName}"`);
  return url;
}

/**
 * Migrates existing forms from legacy format (NumberOfApprovalLayer + ApprovalRules)
 * to the new LayerConfig JSON format.
 *
 * Also backfills FormStatus and CurrentLayer on response lists.
 *
 * Safe to call multiple times — idempotent for already-migrated forms.
 */
export async function migrateExistingForms(
  token: string,
  onLog?: (msg: string) => void
): Promise<{ migrated: number; backfilled: number }> {
  const log = onLog || ((_msg: string) => { /* silent */ });
  let migrated = 0;
  let backfilled = 0;

  // Step 1: Migrate Master Form items
  log("Reading Master Form items...");
  const allConfigs = await getAllFormConfigs(token);

  for (const cfg of allConfigs) {
    // Skip if already has LayerConfig
    if (cfg.LayerConfig && cfg.LayerConfig.trim()) {
      log(`  ✓ ${cfg.Title}: already has LayerConfig`);
      continue;
    }

    const numLayers = cfg.NumberOfApprovalLayer || 0;
    if (numLayers === 0) {
      log(`  → ${cfg.Title}: no layers, skipping`);
      continue;
    }

    // Build LayerConfig from legacy format
    let approvalRules: Record<string, unknown> | null = null;
    if (cfg.ApprovalRules && cfg.ApprovalRules.trim()) {
      try { approvalRules = JSON.parse(cfg.ApprovalRules); } catch { /* ignore parse errors */ }
    }

    const layers: Record<string, unknown>[] = [];
    for (let n = 1; n <= numLayers; n++) {
      const layer: Record<string, unknown> = {
        layerNumber: n,
        type: "approval",
        authMode: "365",
        assignee: {
          type: "field-reference",
          value: `L${n}_Email`,
        },
        confirmationType: "signature",
        allowRejectionReason: true,
        title: `Layer ${n}`,
        notifyOnComplete: true,
      };
      layers.push(layer);
    }

    const layerConfig: Record<string, unknown> = {
      version: "1.0",
      layers,
    };

    // Add conditional routing if present
    if (approvalRules?.conditionField && approvalRules?.rules) {
      layerConfig.routing = [{
        conditionField: approvalRules.conditionField as string,
        rules: (approvalRules.rules as Record<string, unknown>[]).map((r) => ({
          when: r.when as string,
          skipLayers: [],
        })),
      }];
    }

    // Write back to Master Form
    const existing = await getFormConfigByTitle(token, cfg.Title);
    if (existing?.Id) {
      await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items(${existing.Id})`, {
        LayerConfig: JSON.stringify(layerConfig),
      });
      log(`  ✓ ${cfg.Title}: migrated (${numLayers} layers)`);
      migrated++;
    }
  }

  // Step 2: Backfill FormStatus and CurrentLayer on response lists
  log("Backfilling response lists...");
  for (const cfg of allConfigs) {
    if (!cfg.Title) continue;
    const listName = `${cfg.Title} Responses`;

    try {
      // Check if list exists
      if (!(await listExists(token, listName))) {
        continue;
      }

      await ensureColumns(token, listName, [
        { n: "FormStatus", k: SP_FIELD_KIND.text },
        { n: "CurrentLayer", k: SP_FIELD_KIND.number },
      ]);

      // Query items that don't have FormStatus set
      const items = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,Status,CurrentApprovalLayer,CurrentLayer,FormStatus&$top=500&$filter=FormStatus eq null`) as { value?: Record<string, unknown>[] };

      for (const item of items.value || []) {
        const oldStatus = String(item.Status || "");
        const oldLayer = Number(item.CurrentApprovalLayer || 0);
        const patches: Record<string, unknown> = {};

        // Derive FormStatus from old Status
        const st = oldStatus.toLowerCase();
        if (st === "fully approved" || st === "approved") {
          patches.FormStatus = "Completed";
        } else if (st.includes("reject")) {
          patches.FormStatus = "Rejected";
        } else if (st === "pending approval" || st.startsWith("approved layer")) {
          patches.FormStatus = "In Review";
        } else {
          patches.FormStatus = "Submitted";
        }

        // Set CurrentLayer from CurrentApprovalLayer if not set
        if (oldLayer > 0 && !item.CurrentLayer) {
          patches.CurrentLayer = oldLayer;
        }

        if (Object.keys(patches).length > 0) {
          await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${item.Id})`, patches);
          backfilled++;
        }
      }
      log(`  ✓ ${listName}: ${items.value?.length || 0} items backfilled`);
    } catch (e) {
      log(`  ⚠ ${listName}: error — ${(e as Error).message}`);
    }
  }

  log(`Migration complete: ${migrated} forms migrated, ${backfilled} items backfilled`);
  return { migrated, backfilled };
}

/**
 * formBuilderSP.js — SharePoint REST operations for the form builder.
 * Write paths are self-healing (ensure list + columns before writing).
 * Read paths are pure — they throw naturally if something is missing.
 */

const SP = (process.env.REACT_APP_SP_SITE_URL || "").replace(/\/$/, "");
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Schema definitions ────────────────────────────────────────────────────────
const LIST_SCHEMAS = {
  "Master Form": {
    t: 100, desc: "Form builder configuration",
    cols: [
      { n: "FormID", k: 2 }, { n: "NumberOfApprovalLayer", k: 9 },
      { n: "Slug", k: 2 }, { n: "CurrentVersion", k: 2 },
      { n: "IsPublished", k: 8 }, { n: "IsPublic", k: 8 },
      { n: "ConditionField", k: 2 }, { n: "ApprovalRules", k: 3, ml: true },
    ],
  },
  "Approvers": {
    t: 100, desc: "Approver layers per form",
    cols: [
      { n: "FormTitle", k: 2 }, { n: "LayerNumber", k: 9 },
      { n: "ApproverEmail", k: 2 }, { n: "ApproverName", k: 2 },
    ],
  },
  "Web Form Versions": {
    t: 100, desc: "Published form version metadata",
    cols: [
      { n: "FormTitle", k: 2 }, { n: "FormSlug", k: 2 },
      { n: "FormVersion", k: 2 }, { n: "SurveyJSON", k: 3, ml: true },
      { n: "PublishedBy", k: 2 }, { n: "PublishedAt", k: 4 },
    ],
  },
  "Form Builder Log": {
    t: 100, desc: "Audit log",
    cols: [
      { n: "FormTitle", k: 2 }, { n: "EventType", k: 2 },
      { n: "ChangedBy", k: 2 }, { n: "EventSummary", k: 3, ml: true },
      { n: "BeforeJSON", k: 3, ml: true }, { n: "AfterJSON", k: 3, ml: true },
      { n: "EventAt", k: 4 },
    ],
  },
};

// ── Low-level helpers ─────────────────────────────────────────────────────────
let _digest = null, _digestExp = 0;

export async function getDigest(token) {
  if (_digest && Date.now() < _digestExp) return _digest;
  const r = await fetch(`${SP}/_api/contextinfo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata" },
  });
  if (!r.ok) throw new Error(`contextinfo ${r.status}`);
  const d = await r.json();
  _digest = d.FormDigestValue;
  _digestExp = Date.now() + 25 * 60 * 1000;
  return _digest;
}

export async function spGet(token, url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata" } });
  if (!r.ok) throw new Error(`GET ${r.status} ${url}`);
  return r.json();
}

export async function spPost(token, url, body) {
  const d = await getDigest(token);
  const { "__metadata": _, ...clean } = body ?? {};
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata", "Content-Type": "application/json;odata=nometadata", "X-RequestDigest": d },
    body: JSON.stringify(clean),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`POST ${r.status}: ${t}`); }
  return r.status === 204 ? {} : r.json().catch(() => ({}));
}

export async function spPatch(token, url, body) {
  const d = await getDigest(token);
  const { "__metadata": _, ...clean } = body ?? {};
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata", "Content-Type": "application/json;odata=nometadata", "X-RequestDigest": d, "IF-MATCH": "*", "X-HTTP-Method": "MERGE" },
    body: JSON.stringify(clean),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`PATCH ${r.status}: ${t}`); }
  return {};
}

export async function spDelete(token, url) {
  const d = await getDigest(token);
  await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "X-RequestDigest": d, "IF-MATCH": "*", "X-HTTP-Method": "DELETE" } });
}

export async function spUploadFile(token, lib, filename, content) {
  const d = await getDigest(token);
  const r = await fetch(
    `${SP}/_api/web/lists/getbytitle('${encodeURIComponent(lib)}')/rootfolder/files/add(url='${encodeURIComponent(filename)}',overwrite=true)`,
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "X-RequestDigest": d, "Content-Type": "application/octet-stream" }, body: typeof content === "string" ? new TextEncoder().encode(content) : content }
  );
  if (!r.ok) { const t = await r.text(); throw new Error(`Upload ${r.status}: ${t}`); }
  return r.json().catch(() => ({}));
}

// ── List + column provisioning ────────────────────────────────────────────────
export async function listExists(token, title) {
  try { await spGet(token, `${SP}/_api/web/lists/getbytitle('${encodeURIComponent(title)}')?$select=Id`); return true; }
  catch { return false; }
}

export async function createSpList(token, title, baseTemplate = 100, description = "") {
  const d = await getDigest(token);
  const r = await fetch(`${SP}/_api/web/lists`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata", "Content-Type": "application/json;odata=verbose", "X-RequestDigest": d },
    body: JSON.stringify({ __metadata: { type: "SP.List" }, AllowContentTypes: false, BaseTemplate: baseTemplate, ContentTypesEnabled: false, Title: title, Description: description }),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`createSpList ${r.status}: ${t}`); }
  await sleep(1500);
  return r.status === 204 ? {} : r.json().catch(() => ({}));
}

/**
 * addColumn — idempotent. kind: 2=Text 3=Note 4=DateTime 8=Boolean 9=Number
 * richText=true → Enhanced Rich Text (kind must be 3)
 */
export async function addColumn(token, listTitle, name, kind, multiLine = false, richText = false) {
  try {
    await spGet(token, `${SP}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/fields/getbyinternalnameortitle('${encodeURIComponent(name)}')?$select=InternalName`);
    return; // already exists
  } catch {}

  const d = await getDigest(token);
  const typeMap = { 2: "SP.Field", 3: "SP.FieldMultiLineText", 4: "SP.FieldDateTime", 8: "SP.Field", 9: "SP.FieldNumber" };
  const body = { __metadata: { type: typeMap[kind] ?? "SP.Field" }, FieldTypeKind: kind, Title: name, StaticName: name };
  if (kind === 3 || multiLine) {
    body.NumberOfLines = 6;
    body.RichText = !!richText; // false = plain text, true = enhanced rich text
  }

  const r = await fetch(`${SP}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/fields`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata", "Content-Type": "application/json;odata=verbose", "X-RequestDigest": d },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text();
    if (txt.toLowerCase().includes("duplicate") || txt.toLowerCase().includes("already exists")) return;
    throw new Error(`addColumn "${name}" ${r.status}: ${txt}`);
  }
}

export async function ensureListForWrite(token, listTitle, extraCols = []) {
  const schema = LIST_SCHEMAS[listTitle];
  const cols = schema ? schema.cols : extraCols;
  const exists = await listExists(token, listTitle);
  if (!exists) { await createSpList(token, listTitle, schema?.t ?? 100, schema?.desc ?? ""); await sleep(1000); }
  for (const col of cols) await addColumn(token, listTitle, col.n, col.k, !!col.ml, !!col.rt);
}

// ── Slug utils ────────────────────────────────────────────────────────────────
export function slugify(title) {
  return title.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export async function checkSlugConflict(token, slug, excludeTitle = null) {
  const data = await spGet(token, `${SP}/_api/web/lists/getbytitle('Master Form')/items?$filter=Slug eq '${encodeURIComponent(slug)}'&$select=Title,Slug&$top=5`).catch(() => ({ value: [] }));
  const others = (data.value || []).filter(r => r.Title !== excludeTitle);
  return others.length > 0 ? others[0].Title : null;
}

export async function getAllSlugs(token) {
  const data = await spGet(token, `${SP}/_api/web/lists/getbytitle('Master Form')/items?$select=Title,Slug,CurrentVersion&$top=500`).catch(() => ({ value: [] }));
  return data.value || [];
}

// ── Version helpers ───────────────────────────────────────────────────────────
export function parseVersion(v) { const [major = 1, minor = 0] = String(v || "1.0").split(".").map(Number); return { major, minor }; }
export function formatVersion({ major, minor }) { return `${major}.${minor}`; }
export function incrementMinor(v) { const { major, minor } = parseVersion(v); return formatVersion({ major, minor: minor + 1 }); }
export function incrementMajor(v) { return formatVersion({ major: parseVersion(v).major + 1, minor: 0 }); }
export function compareVersions(a, b) { const pa = parseVersion(a), pb = parseVersion(b); return pa.major !== pb.major ? pa.major - pb.major : pa.minor - pb.minor; }
export function isVersionGreater(a, b) { return compareVersions(a, b) > 0; }

// ── Form Config CRUD ──────────────────────────────────────────────────────────
export async function getAllFormConfigs(token) {
  if (!await listExists(token, "Master Form")) return [];
  const data = await spGet(token, `${SP}/_api/web/lists/getbytitle('Master Form')/items?$select=Id,Title,FormID,NumberOfApprovalLayer,Slug,CurrentVersion,IsPublished,IsPublic,ConditionField,ApprovalRules&$orderby=Title asc&$top=500`);
  return data.value || [];
}

export async function getFormConfig(token, listTitle) {
  if (!await listExists(token, "Master Form")) return null;
  const data = await spGet(token, `${SP}/_api/web/lists/getbytitle('Master Form')/items?$filter=Title eq '${encodeURIComponent(listTitle)}'&$select=Id,Title,FormID,NumberOfApprovalLayer,Slug,CurrentVersion,IsPublished,IsPublic,ConditionField,ApprovalRules&$top=1`);
  return data.value?.[0] || null;
}

export async function upsertFormConfig(token, listTitle, { formId, numLayers, slug, version, isPublished = true, isPublic = true, conditionField = "", approvalRules = null }) {
  await ensureListForWrite(token, "Master Form");
  const existing = await getFormConfig(token, listTitle);
  const body = {
    Title: listTitle, FormID: String(formId ?? ""),
    NumberOfApprovalLayer: parseInt(numLayers, 10) || 0,
    Slug: String(slug ?? ""), CurrentVersion: String(version ?? "1.0"),
    IsPublished: !!isPublished, IsPublic: !!isPublic,
    ConditionField: String(conditionField ?? ""),
    ApprovalRules: approvalRules ? JSON.stringify(approvalRules) : "",
  };
  if (existing) {
    await spPatch(token, `${SP}/_api/web/lists/getbytitle('Master Form')/items(${existing.Id})`, body);
    return existing.Id;
  }
  const r = await spPost(token, `${SP}/_api/web/lists/getbytitle('Master Form')/items`, body);
  if (!r.Id) throw new Error("upsertFormConfig: POST returned no Id");
  return r.Id;
}

// ── Approvers ─────────────────────────────────────────────────────────────────
export async function upsertApprovers(token, listTitle, layers) {
  await ensureListForWrite(token, "Approvers");
  const existing = await spGet(token, `${SP}/_api/web/lists/getbytitle('Approvers')/items?$filter=FormTitle eq '${encodeURIComponent(listTitle)}'&$select=Id&$top=500`).catch(() => ({ value: [] }));
  for (const item of existing.value || []) await spDelete(token, `${SP}/_api/web/lists/getbytitle('Approvers')/items(${item.Id})`);
  for (let i = 0; i < layers.length; i++) {
    if (!layers[i]?.email) continue;
    await spPost(token, `${SP}/_api/web/lists/getbytitle('Approvers')/items`, { Title: `${listTitle} - Layer ${i + 1}`, FormTitle: listTitle, LayerNumber: i + 1, ApproverEmail: layers[i].email, ApproverName: layers[i].name || "" });
  }
}

// ── Web Form Versions ─────────────────────────────────────────────────────────
export async function saveFormVersion(token, { listTitle, slug, version, surveyJson, meta, changedBy }) {
  await ensureListForWrite(token, "Web Form Versions");
  const jsonStr = JSON.stringify({ surveyJson, meta, version, savedAt: new Date().toISOString(), changedBy }, null, 2);
  const existing = await spGet(token, `${SP}/_api/web/lists/getbytitle('Web Form Versions')/items?$filter=FormTitle eq '${encodeURIComponent(listTitle)}' and FormVersion eq '${encodeURIComponent(version)}'&$select=Id&$top=1`).catch(() => ({ value: [] }));
  const body = { Title: `${listTitle} v${version}`, FormTitle: listTitle, FormSlug: slug, FormVersion: version, SurveyJSON: jsonStr, PublishedBy: changedBy, PublishedAt: new Date().toISOString() };
  if (existing.value?.length > 0) await spPatch(token, `${SP}/_api/web/lists/getbytitle('Web Form Versions')/items(${existing.value[0].Id})`, body);
  else await spPost(token, `${SP}/_api/web/lists/getbytitle('Web Form Versions')/items`, body);
  const filename = `${slug}_v${version.replace(/\./g, "_")}.json`;
  await spUploadFile(token, "Web Form Versions Library", filename, jsonStr).catch(e => console.warn("[SP] library upload failed:", e.message));
}

export async function getFormVersion(token, listTitle, version) {
  const data = await spGet(token, `${SP}/_api/web/lists/getbytitle('Web Form Versions')/items?$filter=FormTitle eq '${encodeURIComponent(listTitle)}' and FormVersion eq '${encodeURIComponent(version)}'&$select=SurveyJSON,FormVersion,PublishedAt,PublishedBy&$top=1`);
  const row = data.value?.[0];
  if (!row?.SurveyJSON) return null;
  try { return JSON.parse(row.SurveyJSON); } catch { return null; }
}

export async function getLatestFormBySlug(token, slug) {
  const cfg = await spGet(token, `${SP}/_api/web/lists/getbytitle('Master Form')/items?$filter=Slug eq '${encodeURIComponent(slug)}'&$select=Title,CurrentVersion,FormID,NumberOfApprovalLayer,Slug,IsPublished,IsPublic,ConditionField,ApprovalRules&$top=1`).catch(() => ({ value: [] }));
  const form = cfg.value?.[0];
  if (!form) return null;
  if (form.IsPublished !== true && form.IsPublished !== 1) return null;
  const ver = await getFormVersion(token, form.Title, form.CurrentVersion);
  return { ...form, versionData: ver };
}

export async function getFormVersionHistory(token, listTitle) {
  if (!await listExists(token, "Web Form Versions")) return [];
  const data = await spGet(token, `${SP}/_api/web/lists/getbytitle('Web Form Versions')/items?$filter=FormTitle eq '${encodeURIComponent(listTitle)}'&$select=FormVersion,PublishedAt,PublishedBy,Title&$orderby=PublishedAt desc&$top=100`).catch(() => ({ value: [] }));
  return data.value || [];
}

// ── Audit log ─────────────────────────────────────────────────────────────────
export async function logEvent(token, { formTitle, eventType, changedBy, before, after, summary }) {
  try {
    await ensureListForWrite(token, "Form Builder Log");
    await spPost(token, `${SP}/_api/web/lists/getbytitle('Form Builder Log')/items`, { Title: `${formTitle} — ${eventType}`, FormTitle: formTitle, EventType: eventType, ChangedBy: changedBy, EventSummary: summary || "", BeforeJSON: before ? JSON.stringify(before) : "", AfterJSON: after ? JSON.stringify(after) : "", EventAt: new Date().toISOString() });
  } catch (e) { console.warn("[SP] logEvent failed:", e.message); }
}

export async function getFormLog(token, listTitle) {
  if (!await listExists(token, "Form Builder Log")) return [];
  const data = await spGet(token, `${SP}/_api/web/lists/getbytitle('Form Builder Log')/items?$filter=FormTitle eq '${encodeURIComponent(listTitle)}'&$select=EventType,ChangedBy,EventSummary,BeforeJSON,AfterJSON,EventAt,Title&$orderby=EventAt desc&$top=200`).catch(() => ({ value: [] }));
  return data.value || [];
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
export async function bootstrapSystemLists(token, onLog = () => {}) {
  for (const [title, schema] of Object.entries(LIST_SCHEMAS)) {
    onLog(`Checking "${title}"…`, "info");
    if (!await listExists(token, title)) { await createSpList(token, title, schema.t, schema.desc); onLog(`✓ Created`, "ok"); }
    else onLog(`✓ Exists`, "ok");
    for (const col of schema.cols) { await addColumn(token, title, col.n, col.k, !!col.ml, !!col.rt); onLog(`  ✓ ${col.n}`, "ok"); }
  }
  if (!await listExists(token, "Web Form Versions Library")) {
    await createSpList(token, "Web Form Versions Library", 101, "Versioned JSON backups").catch(e => onLog(`Library warn: ${e.message}`, "warn"));
  }
  onLog("Bootstrap complete ✓", "ok");
}

// ── Diff helpers ──────────────────────────────────────────────────────────────
export function diffSurveyJson(before, after) {
  if (!before) return [{ type: "FORM_CREATED", summary: "Form created" }];
  const events = [];
  const bF = before.pages?.[0]?.elements || [], aF = after.pages?.[0]?.elements || [];
  const bM = Object.fromEntries(bF.map(f => [f.name, f])), aM = Object.fromEntries(aF.map(f => [f.name, f]));
  for (const f of aF) if (!bM[f.name]) events.push({ type: "FIELD_ADDED", summary: `Field added: "${f.name}"`, before: null, after: f });
  for (const f of bF) if (!aM[f.name]) events.push({ type: "FIELD_REMOVED", summary: `Field removed: "${f.name}"`, before: f, after: null });
  for (const f of aF) { const p = bM[f.name]; if (p && JSON.stringify(p) !== JSON.stringify(f)) events.push({ type: "FIELD_CHANGED", summary: `Field modified: "${f.name}"`, before: p, after: f }); }
  return events;
}
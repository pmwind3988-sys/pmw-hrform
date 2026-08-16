import { createHash } from "node:crypto";
import {
  createListItem,
  ensureDocLibrary,
  ensureGenericList,
  getListDriveId,
  graphDelete,
  graphGet,
  graphGetRedirectUrl,
  graphPatch,
  graphPost,
  queryAllListItems,
  queryListItemByFields,
  queryListItems,
  updateListItemFields,
  type GraphListItem,
} from "./graphClient.js";
import { logWarn } from "./logger.js";

/**
 * The whole e-learning hub lives in one SharePoint document library. Folders are
 * topics, folders inside them are subtopics, and files are materials — so the
 * people who maintain the content can reorganise it from SharePoint itself
 * without the app needing a parallel structure to keep in sync.
 */
export const LEARNING_LIBRARY = "Learning Materials";

/**
 * One item per (material, viewer) pair. Uniqueness is the point: the count this
 * list produces is "how many distinct people opened this", never "how many times
 * it was played". Only the built-in `Title` column is used, because the app-only
 * Graph principal cannot create columns on this tenant.
 */
export const LEARNING_VIEWS_LIST = "Learning Material Views";

const SETTINGS_LIST = "AdminPanelSettings";
const SETTINGS_TITLE = "learning-materials-settings";
/**
 * Per-material settings ride in the existing `CustomImageUrl` note column of the
 * shared settings list, exactly as the career portal's system-card overrides do.
 * The alternative — custom columns on the library — needs column creation the
 * app-only principal is denied (see `ensureCareerPortalAccessSchema`).
 */
const SETTINGS_JSON_COLUMN = "CustomImageUrl";

const VIEW_KEY_SEPARATOR = "::";
const MAX_TITLE_LENGTH = 150;
const MAX_DESCRIPTION_LENGTH = 600;
const MAX_FOLDER_DEPTH = 4;
const COVER_THUMBNAIL_COUNT = 4;

export type LearningMaterialKind = "video" | "image" | "pdf" | "document" | "other";

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogv", "ogg", "mov", "m4v", "mkv", "avi", "wmv"]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg", "heic"]);
const DOCUMENT_EXTENSIONS = new Set([
  "doc", "docx", "dot", "dotx", "rtf", "txt", "csv",
  "ppt", "pptx", "pps", "ppsx", "xls", "xlsx", "odt", "ods", "odp",
]);

export interface MaterialSettings {
  title?: string;
  description?: string;
  downloadable?: boolean;
  sortOrder?: number;
}

export interface TopicSettings {
  description?: string;
  sortOrder?: number;
}

interface LearningSettings {
  materials: Record<string, MaterialSettings>;
  topics: Record<string, TopicSettings>;
}

export interface LearningFolder {
  id: string;
  path: string;
  name: string;
  parentPath: string;
  childThumbnails: string[];
}

export interface LearningFile {
  id: string;
  name: string;
  folderPath: string;
  extension: string;
  kind: LearningMaterialKind;
  sizeBytes: number;
  thumbnailUrl: string;
  /** Pre-authenticated, expires in about an hour. Only surfaced for media. */
  downloadUrl: string;
  createdAt: string;
  modifiedAt: string;
}

interface DriveItemResponse {
  id?: string;
  name?: string;
  size?: number;
  webUrl?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  folder?: { childCount?: number };
  file?: { mimeType?: string };
  "@microsoft.graph.downloadUrl"?: string;
  thumbnails?: Array<{ large?: { url?: string }; medium?: { url?: string }; small?: { url?: string } }>;
}

// ── Naming and kinds ─────────────────────────────────────────────────────────

export function fileExtension(fileName: string): string {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

export function materialKind(fileName: string): LearningMaterialKind {
  const extension = fileExtension(fileName);
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (extension === "pdf") return "pdf";
  if (DOCUMENT_EXTENSIONS.has(extension)) return "document";
  return "other";
}

export function stripExtension(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]+$/i, "");
}

/**
 * SharePoint rejects these outright, and a stray slash would let a folder name
 * escape into the path and address a different folder than the caller named.
 */
export function sanitizeFolderName(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\\/:*?"<>|#%{}~&]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

/**
 * Normalises a library-relative folder path and refuses anything that tries to
 * climb out of the library. Returns "" for the library root.
 */
export function sanitizeFolderPath(raw: unknown): string {
  const segments = String(raw ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Invalid folder path.");
  }
  if (segments.length > MAX_FOLDER_DEPTH) {
    throw new Error(`Folders can be nested at most ${MAX_FOLDER_DEPTH} levels deep.`);
  }

  const cleaned = segments.map((segment) => sanitizeFolderName(segment));
  if (cleaned.some((segment) => !segment)) {
    throw new Error("Invalid folder path.");
  }
  return cleaned.join("/");
}

function encodeDrivePath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function joinPath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

function thumbnailUrl(item: DriveItemResponse): string {
  const thumbnail = item.thumbnails?.[0];
  return thumbnail?.large?.url || thumbnail?.medium?.url || thumbnail?.small?.url || "";
}

/** Document libraries carry a hidden `Forms` folder that is not content. */
function isSystemFolder(name: string): boolean {
  return name === "Forms" || name.startsWith("_") || name.startsWith(".");
}

// ── Provisioning ─────────────────────────────────────────────────────────────

export async function ensureLearningLibrary(token: string): Promise<void> {
  await ensureDocLibrary(token, LEARNING_LIBRARY);
  await ensureGenericList(token, LEARNING_VIEWS_LIST);
}

export async function learningLibraryExists(token: string): Promise<boolean> {
  try {
    await getListDriveId(token, LEARNING_LIBRARY);
    return true;
  } catch {
    return false;
  }
}

// ── Reading the library tree ─────────────────────────────────────────────────

async function readChildren(token: string, driveId: string, path: string): Promise<DriveItemResponse[]> {
  const base = path
    ? `/drives/${driveId}/root:/${encodeDrivePath(path)}:/children`
    : `/drives/${driveId}/root/children`;
  // Deliberately no `$select`. The pre-authenticated file URL arrives as the
  // OData annotation `@microsoft.graph.downloadUrl`, and naming an annotation in
  // `$select` drops it on SharePoint drives — which left every media card without
  // a source. The default projection includes it, at the cost of a fatter body.
  const query = "?$top=200&$expand=thumbnails($select=small,medium,large)";
  const data = (await graphGet(token, `${base}${query}`)) as { value?: DriveItemResponse[] };
  return data.value || [];
}

/**
 * Walks the whole library once. Folder count is what drives the request count,
 * and topics are curated by hand — a handful of folders, not thousands.
 */
export async function readLearningTree(
  token: string,
): Promise<{ folders: LearningFolder[]; files: LearningFile[] }> {
  const driveId = await getListDriveId(token, LEARNING_LIBRARY);
  const folders: LearningFolder[] = [];
  const files: LearningFile[] = [];

  async function walk(path: string, depth: number): Promise<string[]> {
    const children = await readChildren(token, driveId, path);
    const thumbnailsHere: string[] = [];

    for (const child of children) {
      const name = String(child.name || "");
      if (!name || !child.id) continue;

      if (child.folder) {
        if (isSystemFolder(name) || depth >= MAX_FOLDER_DEPTH) continue;
        const childPath = joinPath(path, name);
        const folder: LearningFolder = {
          id: child.id,
          path: childPath,
          name,
          parentPath: path,
          childThumbnails: [],
        };
        folders.push(folder);
        folder.childThumbnails = await walk(childPath, depth + 1);
        thumbnailsHere.push(...folder.childThumbnails);
        continue;
      }

      const thumbnail = thumbnailUrl(child);
      files.push({
        id: child.id,
        name,
        folderPath: path,
        extension: fileExtension(name),
        kind: materialKind(name),
        sizeBytes: Number(child.size) || 0,
        thumbnailUrl: thumbnail,
        downloadUrl: String(child["@microsoft.graph.downloadUrl"] || ""),
        createdAt: String(child.createdDateTime || ""),
        modifiedAt: String(child.lastModifiedDateTime || ""),
      });
      if (thumbnail) thumbnailsHere.push(thumbnail);
    }

    return thumbnailsHere.slice(0, COVER_THUMBNAIL_COUNT);
  }

  await walk("", 0);
  return { folders, files };
}

export async function resolveFolderId(token: string, path: string): Promise<string> {
  const driveId = await getListDriveId(token, LEARNING_LIBRARY);
  const target = path ? `/drives/${driveId}/root:/${encodeDrivePath(path)}` : `/drives/${driveId}/root`;
  const data = (await graphGet(token, `${target}?$select=id,folder`)) as DriveItemResponse;
  if (!data.id || !data.folder) throw new Error(`Folder "${path || "/"}" was not found.`);
  return data.id;
}

export async function readDriveItem(token: string, itemId: string): Promise<DriveItemResponse | null> {
  const driveId = await getListDriveId(token, LEARNING_LIBRARY);
  try {
    return (await graphGet(
      token,
      `/drives/${driveId}/items/${encodeURIComponent(itemId)}` +
        "?$select=id,name,size,webUrl,folder,file,createdDateTime,lastModifiedDateTime",
    )) as DriveItemResponse;
  } catch {
    return null;
  }
}

/** A fresh pre-authenticated URL. The one from the tree read may be an hour old. */
export async function readDownloadUrl(token: string, itemId: string): Promise<string> {
  const driveId = await getListDriveId(token, LEARNING_LIBRARY);
  const itemPath = `/drives/${driveId}/items/${encodeURIComponent(itemId)}`;

  // No `$select` here either — see `readChildren`. Asking for the annotation by
  // name is what made the viewer report "no playable link".
  const data = (await graphGet(token, itemPath)) as DriveItemResponse;
  const annotated = String(data["@microsoft.graph.downloadUrl"] || "");
  if (annotated) return annotated;

  // Second route to the same URL: `/content` redirects to it. Graph withholds
  // the annotation for items it has not finished processing (a video still
  // being transcoded, most often), and this answers for those.
  return graphGetRedirectUrl(token, `${itemPath}/content`);
}

/**
 * A short-lived SharePoint viewer URL for an iframe. Used for documents, which
 * must never hand the raw file URL to the browser: the embed viewer is what
 * keeps a non-downloadable document non-downloadable.
 */
export async function readEmbedUrl(token: string, itemId: string): Promise<string> {
  const driveId = await getListDriveId(token, LEARNING_LIBRARY);
  const data = (await graphPost(
    token,
    `/drives/${driveId}/items/${encodeURIComponent(itemId)}/preview`,
    {},
  )) as { getUrl?: string };
  return String(data.getUrl || "");
}

// ── Folder and file mutations ────────────────────────────────────────────────

export async function createFolder(token: string, parentPath: string, name: string): Promise<{ path: string }> {
  const safeName = sanitizeFolderName(name);
  if (!safeName) throw new Error("Folder name is required.");
  const safeParent = sanitizeFolderPath(parentPath);
  const parentDepth = safeParent ? safeParent.split("/").length : 0;
  if (parentDepth >= MAX_FOLDER_DEPTH) {
    throw new Error(`Folders can be nested at most ${MAX_FOLDER_DEPTH} levels deep.`);
  }

  const driveId = await getListDriveId(token, LEARNING_LIBRARY);
  const parentId = await resolveFolderId(token, safeParent);
  await graphPost(token, `/drives/${driveId}/items/${parentId}/children`, {
    name: safeName,
    folder: {},
    "@microsoft.graph.conflictBehavior": "fail",
  });

  return { path: joinPath(safeParent, safeName) };
}

export async function renameFolder(token: string, path: string, name: string): Promise<{ path: string }> {
  const safePath = sanitizeFolderPath(path);
  if (!safePath) throw new Error("The library root cannot be renamed.");
  const safeName = sanitizeFolderName(name);
  if (!safeName) throw new Error("Folder name is required.");

  const driveId = await getListDriveId(token, LEARNING_LIBRARY);
  const folderId = await resolveFolderId(token, safePath);
  await graphPatch(token, `/drives/${driveId}/items/${folderId}`, { name: safeName });

  const parentPath = safePath.split("/").slice(0, -1).join("/");
  return { path: joinPath(parentPath, safeName) };
}

export async function deleteFolder(token: string, path: string): Promise<void> {
  const safePath = sanitizeFolderPath(path);
  if (!safePath) throw new Error("The library root cannot be deleted.");

  const driveId = await getListDriveId(token, LEARNING_LIBRARY);
  const folderId = await resolveFolderId(token, safePath);
  await graphDelete(token, `/drives/${driveId}/items/${folderId}`);
}

export async function deleteMaterial(token: string, itemId: string): Promise<void> {
  const driveId = await getListDriveId(token, LEARNING_LIBRARY);
  await graphDelete(token, `/drives/${driveId}/items/${encodeURIComponent(itemId)}`);
}

export async function moveMaterial(token: string, itemId: string, targetPath: string): Promise<void> {
  const safePath = sanitizeFolderPath(targetPath);
  const driveId = await getListDriveId(token, LEARNING_LIBRARY);
  const targetId = await resolveFolderId(token, safePath);
  await graphPatch(token, `/drives/${driveId}/items/${encodeURIComponent(itemId)}`, {
    parentReference: { id: targetId },
  });
}

// ── Per-material settings ────────────────────────────────────────────────────

function emptySettings(): LearningSettings {
  return { materials: {}, topics: {} };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseMaterialSettings(raw: unknown): MaterialSettings {
  const value = asRecord(raw);
  const settings: MaterialSettings = {};
  if (typeof value.title === "string") settings.title = value.title.slice(0, MAX_TITLE_LENGTH);
  if (typeof value.description === "string") settings.description = value.description.slice(0, MAX_DESCRIPTION_LENGTH);
  if (value.downloadable !== undefined) settings.downloadable = value.downloadable === true;
  if (Number.isFinite(Number(value.sortOrder))) settings.sortOrder = Number(value.sortOrder);
  return settings;
}

function parseTopicSettings(raw: unknown): TopicSettings {
  const value = asRecord(raw);
  const settings: TopicSettings = {};
  if (typeof value.description === "string") settings.description = value.description.slice(0, MAX_DESCRIPTION_LENGTH);
  if (Number.isFinite(Number(value.sortOrder))) settings.sortOrder = Number(value.sortOrder);
  return settings;
}

export function parseMaterialSettingsInput(raw: Record<string, unknown>): MaterialSettings {
  return parseMaterialSettings(raw);
}

export function parseTopicSettingsInput(raw: Record<string, unknown>): TopicSettings {
  return parseTopicSettings(raw);
}

/**
 * Scans rather than filters. `AdminPanelSettings` holds a handful of rows, and
 * every other reader of this list does the same — a `$filter` on Title buys
 * nothing here and fails differently on a list whose schema Graph has cached.
 */
async function findSettingsItem(token: string): Promise<GraphListItem | null> {
  try {
    const items = await queryListItems(token, SETTINGS_LIST, { top: 100 });
    return items.find((item) => String(item.fields.Title || "") === SETTINGS_TITLE) ?? null;
  } catch (error) {
    logWarn("api:learning", "Could not read learning settings item", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Never throws: settings are decoration on top of the files. A library whose
 * settings cannot be read still lists every material, just with default titles
 * and downloads switched off — the safe direction to fail in.
 */
export async function readLearningSettings(token: string): Promise<LearningSettings> {
  const item = await findSettingsItem(token);
  const json = String(item?.fields?.[SETTINGS_JSON_COLUMN] || "");
  if (!json.trim()) return emptySettings();

  try {
    const parsed = asRecord(JSON.parse(json));
    const materials: Record<string, MaterialSettings> = {};
    for (const [id, value] of Object.entries(asRecord(parsed.materials))) {
      materials[id] = parseMaterialSettings(value);
    }
    const topics: Record<string, TopicSettings> = {};
    for (const [path, value] of Object.entries(asRecord(parsed.topics))) {
      topics[path] = parseTopicSettings(value);
    }
    return { materials, topics };
  } catch {
    return emptySettings();
  }
}

async function writeLearningSettings(
  token: string,
  settings: LearningSettings,
  updatedBy: string,
): Promise<void> {
  const fields = {
    Title: SETTINGS_TITLE,
    BackgroundId: SETTINGS_TITLE,
    [SETTINGS_JSON_COLUMN]: JSON.stringify(settings),
    UpdatedBy: updatedBy,
    UpdatedAt: new Date().toISOString(),
  };

  const existing = await findSettingsItem(token);
  if (existing) {
    await updateListItemFields(token, SETTINGS_LIST, existing.id, fields);
  } else {
    await createListItem(token, SETTINGS_LIST, fields);
  }
}

export async function saveMaterialSettings(
  token: string,
  materialId: string,
  input: MaterialSettings,
  updatedBy: string,
): Promise<MaterialSettings> {
  const settings = await readLearningSettings(token);
  const merged: MaterialSettings = { ...settings.materials[materialId], ...input };
  settings.materials[materialId] = merged;
  await writeLearningSettings(token, settings, updatedBy);
  return merged;
}

export async function saveTopicSettings(
  token: string,
  path: string,
  input: TopicSettings,
  updatedBy: string,
): Promise<void> {
  const settings = await readLearningSettings(token);
  settings.topics[path] = { ...settings.topics[path], ...input };
  await writeLearningSettings(token, settings, updatedBy);
}

/** Drops settings for a material that no longer exists, keeping the blob small. */
export async function forgetMaterialSettings(token: string, materialId: string, updatedBy: string): Promise<void> {
  const settings = await readLearningSettings(token);
  if (!settings.materials[materialId]) return;
  delete settings.materials[materialId];
  await writeLearningSettings(token, settings, updatedBy);
}

// ── Unique-viewer tracking ───────────────────────────────────────────────────

/**
 * Views are stored under a one-way hash of the viewer's address rather than the
 * address itself: the product only ever needs "how many distinct people" and
 * "have I seen this", and a list of who-watched-what is personal data this
 * feature has no reason to accumulate (see PDPA_COMPLIANCE.md).
 */
export function viewerKey(email: string): string {
  return createHash("sha256")
    .update(`learning-views|${email.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 24);
}

/**
 * The same idea for an HR-issued portal account, which has a login ID instead of
 * an address. The `portal|` segment keeps the two namespaces apart: without it a
 * login ID that happened to look like an address would hash into the same key as
 * that person's M365 account and merge two different viewers into one.
 */
export function portalViewerKey(loginId: string): string {
  return createHash("sha256")
    .update(`learning-views|portal|${loginId.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 24);
}

function viewItemTitle(materialId: string, viewer: string): string {
  return `${materialId}${VIEW_KEY_SEPARATOR}${viewer}`;
}

export interface ViewIndex {
  counts: Record<string, number>;
  viewedByMe: Set<string>;
}

/**
 * Reads every view row and folds it into per-material counts. Cached briefly
 * because the hub re-reads it on every page load while the underlying number
 * changes slowly — a view is a rare, deliberate act, not a page impression.
 */
let cachedViewRows: { rows: GraphListItem[]; expiresAt: number } | null = null;
const VIEW_CACHE_MS = 30_000;

async function readViewRows(token: string): Promise<GraphListItem[]> {
  if (cachedViewRows && cachedViewRows.expiresAt > Date.now()) return cachedViewRows.rows;

  let rows: GraphListItem[];
  try {
    rows = await queryAllListItems(token, LEARNING_VIEWS_LIST, { maxItems: 20000 });
  } catch (error) {
    logWarn("api:learning", "Could not read learning view rows", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    rows = [];
  }

  cachedViewRows = { rows, expiresAt: Date.now() + VIEW_CACHE_MS };
  return rows;
}

export async function readViewIndex(token: string, viewer: string): Promise<ViewIndex> {
  const rows = await readViewRows(token);
  const counts: Record<string, number> = {};
  const seen = new Set<string>();
  const viewedByMe = new Set<string>();

  for (const row of rows) {
    const title = String(row.fields.Title || "");
    const separatorIndex = title.indexOf(VIEW_KEY_SEPARATOR);
    if (separatorIndex <= 0) continue;

    const materialId = title.slice(0, separatorIndex);
    const rowViewer = title.slice(separatorIndex + VIEW_KEY_SEPARATOR.length);
    // Belt and braces: SharePoint permits duplicate Titles, and a racing double
    // POST would otherwise count one person twice.
    if (seen.has(title)) continue;
    seen.add(title);

    counts[materialId] = (counts[materialId] || 0) + 1;
    if (rowViewer === viewer) viewedByMe.add(materialId);
  }

  return { counts, viewedByMe };
}

/**
 * Records that this account has viewed this one material, once and only once.
 * `materialId` is always a single file's drive item id — the caller resolves it
 * against the library first and refuses folders, so a topic can never take a
 * view of its own, and browsing one never spends a view on what is inside it.
 *
 * Returns the material's resulting distinct-viewer count.
 */
export async function recordView(token: string, materialId: string, viewer: string): Promise<number> {
  const title = viewItemTitle(materialId, viewer);
  const existing = await queryListItemByFields(token, LEARNING_VIEWS_LIST, { Title: title }).catch(() => null);

  if (!existing) {
    try {
      await createListItem(token, LEARNING_VIEWS_LIST, { Title: title });
    } catch (error) {
      // The library can exist without the tracking list — someone created the
      // document library by hand in SharePoint, or provisioning half-finished.
      // Build it on the first view rather than losing the view.
      logWarn("api:learning", "Creating the view-tracking list before recording", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      await ensureGenericList(token, LEARNING_VIEWS_LIST);
      await createListItem(token, LEARNING_VIEWS_LIST, { Title: title });
    }
    cachedViewRows = null;
  }

  // A freshly created item can take a moment to show up in a list query. This
  // caller has definitely viewed it, so count them whether or not their own row
  // is back yet — otherwise the number would tick *down* for the one person who
  // just added to it, and tick back up on the next refresh.
  const index = await readViewIndex(token, viewer);
  const counted = index.counts[materialId] ?? 0;
  return index.viewedByMe.has(materialId) ? counted : counted + 1;
}

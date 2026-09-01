import { createHash } from "node:crypto";
import {
  createListItem,
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
import { ensureListViaSPRest } from "./sharepointRest.js";
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
  /**
   * A scrypt string when this material is password-locked, absent when it is
   * not. Server-side only — `buildMaterial` turns it into a boolean and the hash
   * itself never leaves this process. Set through `saveMaterialPassword`, never
   * through the settings the admin screen posts (see `parseMaterialSettingsInput`).
   */
  passwordHash?: string;
}

export interface TopicSettings {
  description?: string;
  sortOrder?: number;
  /** As above, for a whole topic folder and everything inside it. */
  passwordHash?: string;
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
  parentReference?: { path?: string };
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

/**
 * Runs as the signed-in admin, not as the application: this tenant refuses the
 * app-only principal `POST /sites/{id}/lists`, so building either of these
 * through Graph fails with `403 accessDenied` on a site that does not have them
 * yet. See `ensureListViaSPRest`.
 */
export async function ensureLearningLibrary(delegatedToken: string): Promise<void> {
  await ensureListViaSPRest(delegatedToken, LEARNING_LIBRARY, "documentLibrary");
  await ensureListViaSPRest(delegatedToken, LEARNING_VIEWS_LIST);
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
 *
 * Returns the tree flat and unfiltered. Folder covers are *not* aggregated here
 * any more: a topic's cover is made of thumbnails from inside it, and password
 * locks are known only to the caller — so a lock that hides a folder's contents
 * would otherwise have gone on advertising them from the parent's cover.
 */
export async function readLearningTree(
  token: string,
): Promise<{ folders: LearningFolder[]; files: LearningFile[] }> {
  const driveId = await getListDriveId(token, LEARNING_LIBRARY);
  const folders: LearningFolder[] = [];
  const files: LearningFile[] = [];

  async function walk(path: string, depth: number): Promise<void> {
    const children = await readChildren(token, driveId, path);

    for (const child of children) {
      const name = String(child.name || "");
      if (!name || !child.id) continue;

      if (child.folder) {
        if (isSystemFolder(name) || depth >= MAX_FOLDER_DEPTH) continue;
        const childPath = joinPath(path, name);
        folders.push({ id: child.id, path: childPath, name, parentPath: path });
        await walk(childPath, depth + 1);
        continue;
      }

      files.push({
        id: child.id,
        name,
        folderPath: path,
        extension: fileExtension(name),
        kind: materialKind(name),
        sizeBytes: Number(child.size) || 0,
        thumbnailUrl: thumbnailUrl(child),
        downloadUrl: String(child["@microsoft.graph.downloadUrl"] || ""),
        createdAt: String(child.createdDateTime || ""),
        modifiedAt: String(child.lastModifiedDateTime || ""),
      });
    }
  }

  await walk("", 0);
  return { folders, files };
}

/**
 * Up to a few thumbnails from inside a folder, for its card. Descends into
 * subfolders but stops at any the caller may not browse, so a cover never shows
 * a frame of something behind a password.
 */
export function collectCoverThumbnails(
  path: string,
  folders: LearningFolder[],
  files: LearningFile[],
  canBrowse: (folderPath: string) => boolean,
): string[] {
  const covers: string[] = [];

  function gather(current: string): void {
    if (covers.length >= COVER_THUMBNAIL_COUNT || !canBrowse(current)) return;

    for (const file of files) {
      if (file.folderPath !== current || !file.thumbnailUrl) continue;
      covers.push(file.thumbnailUrl);
      if (covers.length >= COVER_THUMBNAIL_COUNT) return;
    }
    for (const folder of folders) {
      if (folder.parentPath !== current) continue;
      gather(folder.path);
      if (covers.length >= COVER_THUMBNAIL_COUNT) return;
    }
  }

  gather(path);
  return covers;
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
        "?$select=id,name,size,webUrl,folder,file,parentReference,createdDateTime,lastModifiedDateTime",
    )) as DriveItemResponse;
  } catch {
    return null;
  }
}

/**
 * The library-relative folder a drive item sits in, read back off the item
 * itself. Which topic a material belongs to is what decides whether a topic
 * password applies to it, and `open-material` resolves one item by id without
 * ever walking the tree — so the answer has to come from the item.
 *
 * Graph reports this as `/drives/{id}/root:/Safety/Fire%20Drill`, percent-encoded,
 * and as `/drives/{id}/root:` for the library root.
 */
export function driveItemFolderPath(item: DriveItemResponse | null): string {
  const raw = String(item?.parentReference?.path || "");
  const marker = "/root:";
  const index = raw.indexOf(marker);
  if (index < 0) return "";

  try {
    return decodeURIComponent(raw.slice(index + marker.length)).replace(/^\/+/, "");
  } catch {
    return raw.slice(index + marker.length).replace(/^\/+/, "");
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
  if (typeof value.passwordHash === "string" && value.passwordHash) settings.passwordHash = value.passwordHash;
  return settings;
}

function parseTopicSettings(raw: unknown): TopicSettings {
  const value = asRecord(raw);
  const settings: TopicSettings = {};
  if (typeof value.description === "string") settings.description = value.description.slice(0, MAX_DESCRIPTION_LENGTH);
  if (Number.isFinite(Number(value.sortOrder))) settings.sortOrder = Number(value.sortOrder);
  if (typeof value.passwordHash === "string" && value.passwordHash) settings.passwordHash = value.passwordHash;
  return settings;
}

/**
 * The request-body versions, and the reason the two are not the same function:
 * `passwordHash` is readable in the stored blob but must never be settable from
 * a request. Letting one through here would turn "save this material's title"
 * into a way to install a password hash of the caller's choosing — or, with an
 * empty string, to quietly unlock somebody else's material.
 */
export function parseMaterialSettingsInput(raw: Record<string, unknown>): MaterialSettings {
  const { passwordHash: _ignored, ...settings } = parseMaterialSettings(raw);
  return settings;
}

export function parseTopicSettingsInput(raw: Record<string, unknown>): TopicSettings {
  const { passwordHash: _ignored, ...settings } = parseTopicSettings(raw);
  return settings;
}

/** Everything an admin screen may see — the hash is not part of it. */
export function publicMaterialSettings(settings: MaterialSettings): Record<string, unknown> {
  const { passwordHash, ...rest } = settings;
  return { ...rest, locked: Boolean(passwordHash) };
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

/**
 * Sets or removes a material's password. Separate from `saveMaterialSettings`
 * because removing one has to *delete* the key rather than merge an empty value
 * over it — a `passwordHash: ""` left in the blob would read back as a lock with
 * a password nothing can ever match.
 */
export async function saveMaterialPassword(
  token: string,
  materialId: string,
  passwordHash: string,
  updatedBy: string,
): Promise<void> {
  const settings = await readLearningSettings(token);
  const existing = settings.materials[materialId] ?? {};

  if (passwordHash) {
    settings.materials[materialId] = { ...existing, passwordHash };
  } else {
    delete existing.passwordHash;
    settings.materials[materialId] = existing;
  }

  await writeLearningSettings(token, settings, updatedBy);
}

export async function saveTopicPassword(
  token: string,
  path: string,
  passwordHash: string,
  updatedBy: string,
): Promise<void> {
  const settings = await readLearningSettings(token);
  const existing = settings.topics[path] ?? {};

  if (passwordHash) {
    settings.topics[path] = { ...existing, passwordHash };
  } else {
    delete existing.passwordHash;
    settings.topics[path] = existing;
  }

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
 * The same idea for a guest member, who signs in with Google.
 *
 * The `guest|` segment keeps the two namespaces apart. A guest's address and a
 * staff member's address are both addresses, and somebody who is both — a
 * contractor with a PMW mailbox who also signed up with a personal Google
 * account carrying the same address — must count as two viewers, not silently
 * merge into one.
 */
export function guestViewerKey(email: string): string {
  return createHash("sha256")
    .update(`learning-views|guest|${email.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 24);
}

function viewItemTitle(materialId: string, viewer: string): string {
  return `${materialId}${VIEW_KEY_SEPARATOR}${viewer}`;
}

export interface ViewIndex {
  counts: Record<string, number>;
  viewedByMe: Set<string>;
  /**
   * False when the tracking list could not be read at all, which means the
   * counts are *unknown* rather than zero. The admin library screen turns this
   * into an offer to provision; without it, a library whose tracking list was
   * never created looks exactly like one nobody has opened yet.
   */
  ready: boolean;
}

/** The tracking list has never been provisioned, as opposed to being empty. */
function isMissingViewsList(error: unknown): boolean {
  return error instanceof Error && error.message.includes(`List "${LEARNING_VIEWS_LIST}" not found`);
}

/**
 * Reads every view row and folds it into per-material counts. Cached briefly
 * because the hub re-reads it on every page load while the underlying number
 * changes slowly — a view is a rare, deliberate act, not a page impression.
 */
let cachedViewRows: { rows: GraphListItem[]; expiresAt: number; ready: boolean } | null = null;
const VIEW_CACHE_MS = 30_000;

async function readViewRows(token: string): Promise<{ rows: GraphListItem[]; ready: boolean }> {
  if (cachedViewRows && cachedViewRows.expiresAt > Date.now()) return cachedViewRows;

  let rows: GraphListItem[] = [];
  let ready = true;
  try {
    rows = await queryAllListItems(token, LEARNING_VIEWS_LIST, { maxItems: 20000 });
  } catch (error) {
    logWarn("api:learning", "Could not read learning view rows", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    ready = false;
  }

  cachedViewRows = { rows, ready, expiresAt: Date.now() + VIEW_CACHE_MS };
  return cachedViewRows;
}

export async function readViewIndex(token: string, viewer: string): Promise<ViewIndex> {
  const { rows, ready } = await readViewRows(token);
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

  return { counts, viewedByMe, ready };
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
      cachedViewRows = null;
    } catch (error) {
      if (!isMissingViewsList(error)) throw error;

      // A library standing without its tracking list, which happens when the
      // document library was created by hand. Only an admin's delegated token
      // can build it (see `ensureListViaSPRest`), and this runs on a learner's
      // request — so there is nothing to retry and nothing to be gained by
      // failing the call.
      //
      // Returning instead of throwing is the whole point: this used to take down
      // the entire `record-view` request, and the named access log is written
      // *after* the count. An unprovisioned counter was silently costing portal
      // accounts their audit trail as well as their view.
      logWarn("api:learning", "View not counted: the tracking list does not exist", {
        list: LEARNING_VIEWS_LIST,
        remedy: "An admin must open Manage Learning Materials and run Set up.",
      });
      return 0;
    }
  }

  // A freshly created item can take a moment to show up in a list query. This
  // caller has definitely viewed it, so count them whether or not their own row
  // is back yet — otherwise the number would tick *down* for the one person who
  // just added to it, and tick back up on the next refresh.
  const index = await readViewIndex(token, viewer);
  const counted = index.counts[materialId] ?? 0;
  return index.viewedByMe.has(materialId) ? counted : counted + 1;
}

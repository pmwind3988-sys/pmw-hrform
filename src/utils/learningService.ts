import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";
import { readStoredPortalSession } from "./internalAccountService";
import type {
  LearningLibraryData,
  LearningMaterialOpenResult,
  LearningMaterialKind,
  LearningUnlockResult,
  LearningViewCounts,
} from "../types";

const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";
const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
const LEARNING_LIBRARY = "Learning Materials";

/** Files above this go up in chunks; SharePoint takes a single PUT below it. */
const CHUNK_THRESHOLD_BYTES = 8 * 1024 * 1024;
const CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * The caller is signed in to Microsoft 365 but the API could not confirm it —
 * usually an expired silent token. Surfaced as its own type so the hub can show
 * a sign-in prompt instead of a generic failure.
 */
export class LearningSignInRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LearningSignInRequiredError";
  }
}

export function isLearningSignInRequiredError(error: unknown): boolean {
  return error instanceof LearningSignInRequiredError;
}

/**
 * The material is behind a password that has not been given. Its own type so the
 * viewer can put a password box on screen instead of an error — being asked for
 * a password is the feature working, not something going wrong.
 */
export class LearningLockedError extends Error {
  /** What the password belongs to: this material, or the topic guarding it. */
  readonly lockLabel: string;

  constructor(message: string, lockLabel: string) {
    super(message);
    this.name = "LearningLockedError";
    this.lockLabel = lockLabel;
  }
}

export function isLearningLockedError(error: unknown): boolean {
  return error instanceof LearningLockedError;
}

/** What the refused password belongs to, or "" for anything else. */
export function learningLockLabel(error: unknown): string {
  return error instanceof LearningLockedError ? error.lockLabel : "";
}

function apiHeaders(accessToken?: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function readApiError(response: Response, fallback: string): Promise<Error> {
  let detail = "";
  let code = "";
  let lockLabel = "";
  try {
    const body = (await response.json()) as { error?: unknown; code?: unknown; lockLabel?: unknown };
    if (typeof body.error === "string" && body.error.trim()) detail = body.error.trim();
    if (typeof body.code === "string") code = body.code;
    if (typeof body.lockLabel === "string") lockLabel = body.lockLabel;
  } catch {
    // Some failures come back with an empty or non-JSON body.
  }

  if (code === "learning-sign-in-required") {
    return new LearningSignInRequiredError(detail || "Sign in with your PMW account to open learning materials.");
  }
  if (code === "learning-locked") {
    return new LearningLockedError(detail || "This material is password protected.", lockLabel);
  }
  return new Error(detail || `${fallback} (${response.status})`);
}

async function postAction<T>(
  action: string,
  payload: Record<string, unknown>,
  accessToken: string,
  fallbackMessage: string,
): Promise<T> {
  const response = await fetch("/api/learning-materials", {
    method: "POST",
    headers: apiHeaders(accessToken),
    body: JSON.stringify({ action, ...payload }),
  });
  if (!response.ok) throw await readApiError(response, fallbackMessage);
  return (await response.json()) as T;
}

/**
 * A Microsoft Graph token proving which PMW account is asking. It is what makes
 * a view count one person rather than one play, so it is required even though
 * the hub itself sits behind the app's own sign-in.
 *
 * Fails quietly to "": a learner reading a page should never be thrown out to
 * Microsoft mid-scroll. The API answers 403 and the page offers a sign-in.
 */
export async function acquireLearningIdentityToken(
  instance: IPublicClientApplication,
  account: AccountInfo | null,
): Promise<string> {
  // An HR-issued portal account proves itself with its own signed session
  // instead of a Microsoft token. Checked first: these visitors have no MSAL
  // account at all, so the branch below would hand back "" and the hub would
  // ask them to sign in they already had.
  const portalSession = readStoredPortalSession();
  if (portalSession) return portalSession.token;

  if (!account) return "";
  try {
    const result = await instance.acquireTokenSilent({ scopes: ["User.Read"], account });
    return result.accessToken;
  } catch {
    return "";
  }
}

// ── Learner API ──────────────────────────────────────────────────────────────

/**
 * `passes` are the topic unlocks this browser is currently holding. They travel
 * on every read because the server decides what to send from them: a topic whose
 * pass is missing has no materials, no subtopics and no cover in the answer at
 * all. A POST rather than a GET for exactly that reason — the passes are part of
 * the question, and they do not belong in a URL.
 */
export async function fetchLearningLibrary(
  accessToken: string,
  passes: string[] = [],
): Promise<LearningLibraryData> {
  const data = await postAction<Partial<LearningLibraryData>>(
    "list",
    { passes },
    accessToken,
    "Failed to load learning materials",
  );
  return {
    topics: data.topics ?? [],
    materials: data.materials ?? [],
    libraryReady: data.libraryReady !== false,
    viewsReady: data.viewsReady !== false,
  };
}

/**
 * `preferEmbed` asks for SharePoint's own viewer instead of the raw bytes. The
 * dialog sets it after a `<video>` has failed, which is the only reliable signal
 * that this browser cannot decode the container someone uploaded.
 *
 * `passes` carries the one-shot unlock the viewer was just issued. Without it a
 * locked material answers 403 `learning-locked` and nothing playable is sent.
 */
export function openLearningMaterial(
  materialId: string,
  accessToken: string,
  preferEmbed = false,
  passes: string[] = [],
): Promise<LearningMaterialOpenResult> {
  return postAction<LearningMaterialOpenResult>(
    "open-material",
    { materialId, preferEmbed, passes },
    accessToken,
    "Failed to open this material",
  );
}

/**
 * Trades a password for a short-lived pass. Two scopes, and the caller names the
 * thing rather than the lock: a material inside a locked topic is unlocked with
 * that topic's password, and the server is what decides which lock applies.
 */
async function unlock(
  payload: Record<string, unknown>,
  accessToken: string,
): Promise<LearningUnlockResult> {
  const data = await postAction<{ pass?: string; expiresAt?: string; alreadyOpen?: boolean }>(
    "unlock",
    payload,
    accessToken,
    "That password could not be checked",
  );
  return {
    pass: data.pass ?? "",
    expiresAt: data.expiresAt ?? "",
    alreadyOpen: data.alreadyOpen === true,
  };
}

export function unlockLearningTopic(
  path: string,
  password: string,
  accessToken: string,
): Promise<LearningUnlockResult> {
  return unlock({ scope: "topic", path, password }, accessToken);
}

export function unlockLearningMaterial(
  materialId: string,
  password: string,
  accessToken: string,
): Promise<LearningUnlockResult> {
  return unlock({ scope: "material", materialId, password }, accessToken);
}

/**
 * The view numbers on their own. Cheap enough to ask for on a timer: it skips
 * the SharePoint folder walk that `fetchLearningLibrary` does and reads one
 * list, which the API serves from a short cache.
 */
export async function fetchLearningViewCounts(accessToken: string): Promise<LearningViewCounts> {
  const data = await postAction<Partial<LearningViewCounts>>(
    "view-counts",
    {},
    accessToken,
    "Failed to refresh view counts",
  );
  return { counts: data.counts ?? {}, viewedByMe: data.viewedByMe ?? [] };
}

/**
 * `passes` for the same reason `openLearningMaterial` takes them: a view on a
 * locked material is only recorded for someone who got through its password. The
 * named access log is an audit trail, and a row in it has to mean what it says.
 */
export async function recordLearningView(
  materialId: string,
  accessToken: string,
  passes: string[] = [],
): Promise<number> {
  const data = await postAction<{ viewCount?: number }>(
    "record-view",
    { materialId, passes },
    accessToken,
    "Failed to record the view",
  );
  return Number(data.viewCount) || 0;
}

// ── Admin API (delegated SharePoint token) ───────────────────────────────────

/**
 * The management view of the same library: locked topics and materials come back
 * whole, covers included, and each carries its lock state so the switches can
 * show it. An HR Forms Owner sets these passwords — being shut out of a folder
 * by one they just typed in would make the screen unusable.
 */
export async function fetchLearningLibraryForAdmin(spToken: string): Promise<LearningLibraryData> {
  const data = await postAction<Partial<LearningLibraryData>>(
    "admin-list",
    {},
    spToken,
    "Failed to load learning materials",
  );
  return {
    topics: data.topics ?? [],
    materials: data.materials ?? [],
    libraryReady: data.libraryReady !== false,
    viewsReady: data.viewsReady !== false,
  };
}

export function ensureLearningLibraryProvisioned(spToken: string): Promise<{ success: boolean }> {
  return postAction<{ success: boolean }>("ensure-library", {}, spToken, "Failed to prepare the library");
}

export function createLearningFolder(
  parentPath: string,
  name: string,
  spToken: string,
): Promise<{ path: string }> {
  return postAction<{ path: string }>("create-folder", { parentPath, name }, spToken, "Failed to create the topic");
}

export function renameLearningFolder(path: string, name: string, spToken: string): Promise<{ path: string }> {
  return postAction<{ path: string }>("rename-folder", { path, name }, spToken, "Failed to rename the topic");
}

export function deleteLearningFolder(path: string, spToken: string): Promise<{ success: boolean }> {
  return postAction<{ success: boolean }>("delete-folder", { path }, spToken, "Failed to delete the topic");
}

export function updateLearningTopic(
  path: string,
  data: { description?: string; sortOrder?: number },
  spToken: string,
): Promise<{ success: boolean }> {
  return postAction<{ success: boolean }>("update-topic", { path, ...data }, spToken, "Failed to save the topic");
}

export function updateLearningMaterial(
  materialId: string,
  data: { title?: string; description?: string; downloadable?: boolean; sortOrder?: number },
  spToken: string,
): Promise<{ success: boolean }> {
  return postAction<{ success: boolean }>(
    "update-material",
    { materialId, ...data },
    spToken,
    "Failed to save the material",
  );
}

/**
 * Sets, replaces, or removes a password — an empty string removes it. There is
 * no counterpart that reads one back: the server stores a one-way hash, so an
 * admin replaces a forgotten password rather than looking it up.
 */
export function setLearningMaterialPassword(
  materialId: string,
  password: string,
  spToken: string,
): Promise<{ locked: boolean }> {
  return postAction<{ locked: boolean }>(
    "set-material-password",
    { materialId, password },
    spToken,
    "Failed to save the password",
  );
}

export function setLearningTopicPassword(
  path: string,
  password: string,
  spToken: string,
): Promise<{ locked: boolean }> {
  return postAction<{ locked: boolean }>(
    "set-topic-password",
    { path, password },
    spToken,
    "Failed to save the password",
  );
}

export function moveLearningMaterial(
  materialId: string,
  targetPath: string,
  spToken: string,
): Promise<{ success: boolean }> {
  return postAction<{ success: boolean }>(
    "move-material",
    { materialId, targetPath },
    spToken,
    "Failed to move the material",
  );
}

export function deleteLearningMaterial(materialId: string, spToken: string): Promise<{ success: boolean }> {
  return postAction<{ success: boolean }>(
    "delete-material",
    { materialId },
    spToken,
    "Failed to delete the material",
  );
}

// ── Upload (browser → SharePoint, bypassing the API) ─────────────────────────

/**
 * Uploads go straight from the admin's browser to SharePoint with their own
 * delegated token, never through `/api`. A Vercel serverless function caps a
 * request body at ~4.5 MB, which any real training video clears in the first
 * few seconds — routing them through the API would make the feature unusable
 * for exactly the file type it exists to serve.
 */
export interface UploadProgress {
  loadedBytes: number;
  totalBytes: number;
}

export function sanitizeUploadFileName(name: string): string {
  const cleaned = name
    .replace(/[~"#%&*:<>?/\\{|}]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim();
  return cleaned.slice(0, 180) || `material-${Date.now()}`;
}

function serverRelativeFolderPath(folderPath: string): string {
  const sitePath = new URL(SP_SITE_URL).pathname.replace(/\/$/, "");
  const segments = folderPath.split("/").map((segment) => segment.trim()).filter(Boolean);
  return [sitePath, LEARNING_LIBRARY, ...segments].join("/");
}

/** Encodes a server-relative path for a SharePoint REST `decodedurl` argument. */
function encodeDecodedUrl(path: string): string {
  return encodeURIComponent(path.replace(/'/g, "''")).replace(/%2F/gi, "/");
}

async function getDigest(spToken: string): Promise<string> {
  const response = await fetch(`${SP_SITE_URL}/_api/contextinfo`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${spToken}`,
      Accept: "application/json;odata=nometadata",
    },
  });
  if (!response.ok) {
    throw new Error(`SharePoint refused the upload session (${response.status}). Check your site permissions.`);
  }
  const data = (await response.json()) as { FormDigestValue?: string };
  if (!data.FormDigestValue) throw new Error("SharePoint did not return an upload token.");
  return data.FormDigestValue;
}

async function spUploadPost(
  spToken: string,
  digest: string,
  url: string,
  body: BodyInit | null,
): Promise<Response> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${spToken}`,
      Accept: "application/json;odata=nometadata",
      "X-RequestDigest": digest,
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed (${response.status}): ${text.slice(0, 200)}`);
  }
  return response;
}

function uploadId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function uploadLearningFile(
  spToken: string,
  folderPath: string,
  file: File,
  onProgress?: (progress: UploadProgress) => void,
): Promise<{ fileName: string }> {
  if (!SP_SITE_URL) throw new Error("SharePoint site URL is not configured.");

  const fileName = sanitizeUploadFileName(file.name);
  const folder = serverRelativeFolderPath(folderPath);
  const folderUrl = `${SP_SITE_URL}/_api/web/GetFolderByServerRelativePath(decodedurl='${encodeDecodedUrl(folder)}')`;
  const addUrl = `${folderUrl}/Files/add(url='${encodeURIComponent(fileName.replace(/'/g, "''"))}',overwrite=true)`;
  const digest = await getDigest(spToken);

  if (file.size <= CHUNK_THRESHOLD_BYTES) {
    onProgress?.({ loadedBytes: 0, totalBytes: file.size });
    await spUploadPost(spToken, digest, addUrl, file);
    onProgress?.({ loadedBytes: file.size, totalBytes: file.size });
    return { fileName };
  }

  // Large file: create the item empty, then stream it in chunks. Each call
  // returns the offset SharePoint has committed, which the next call must match.
  await spUploadPost(spToken, digest, addUrl, new Blob([]));

  const filePath = `${folder}/${fileName}`;
  const fileUrl = `${SP_SITE_URL}/_api/web/GetFileByServerRelativePath(decodedurl='${encodeDecodedUrl(filePath)}')`;
  const id = uploadId();
  let offset = 0;

  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_SIZE_BYTES, file.size);
    const chunk = file.slice(offset, end);
    const isFirst = offset === 0;
    const isLast = end >= file.size;

    const operation = isFirst
      ? `startupload(uploadId=guid'${id}')`
      : isLast
        ? `finishupload(uploadId=guid'${id}',fileOffset=${offset})`
        : `continueupload(uploadId=guid'${id}',fileOffset=${offset})`;

    // A first chunk that is also the last still has to start the session before
    // it can finish it, so the two calls are issued back to back.
    if (isFirst && isLast) {
      await spUploadPost(spToken, digest, `${fileUrl}/startupload(uploadId=guid'${id}')`, chunk);
      await spUploadPost(
        spToken,
        digest,
        `${fileUrl}/finishupload(uploadId=guid'${id}',fileOffset=${file.size})`,
        new Blob([]),
      );
    } else {
      await spUploadPost(spToken, digest, `${fileUrl}/${operation}`, chunk);
    }

    offset = end;
    onProgress?.({ loadedBytes: offset, totalBytes: file.size });
  }

  return { fileName };
}

// ── Display helpers ──────────────────────────────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function kindLabel(kind: LearningMaterialKind): string {
  switch (kind) {
    case "video":
      return "Video";
    case "image":
      return "Image";
    case "pdf":
      return "PDF";
    case "document":
      return "Document";
    default:
      return "File";
  }
}

export function formatViewCount(count: number): string {
  if (count === 1) return "1 viewer";
  return `${count} viewers`;
}

import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken } from "./_utils/graphClient.js";
import { resolveTenantIdentity } from "./_utils/careerPortalAccess.js";
import {
  createFolder,
  deleteFolder,
  deleteMaterial,
  ensureLearningLibrary,
  forgetMaterialSettings,
  learningLibraryExists,
  materialKind,
  moveMaterial,
  parseMaterialSettingsInput,
  parseTopicSettingsInput,
  readDownloadUrl,
  readDriveItem,
  readEmbedUrl,
  readLearningSettings,
  readLearningTree,
  readViewIndex,
  recordView,
  renameFolder,
  saveMaterialSettings,
  saveTopicSettings,
  sanitizeFolderPath,
  stripExtension,
  viewerKey,
  type LearningFile,
  type LearningFolder,
  type LearningMaterialKind,
  type MaterialSettings,
  type TopicSettings,
  type ViewIndex,
} from "./_utils/learningLibrary.js";
import { logError, logWarn } from "./_utils/logger.js";

interface ApiRequest {
  body: Record<string, unknown>;
  method: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

const ADMIN_GROUP = "_HR_ Forms Owners";
const SP_SITE_URL = (process.env.VITE_SP_SITE_URL || process.env.SP_SITE_URL || "").replace(/\/$/, "");

/**
 * Actions that change the library. These carry a delegated **SharePoint** token
 * and are checked against the HR Forms Owners group, exactly like job-admin.
 * Everything else carries a **Graph** token and only proves "a signed-in PMW
 * account", which is all a learner needs — and is what makes a view unique.
 */
const ADMIN_ACTIONS = new Set([
  "ensure-library",
  "create-folder",
  "rename-folder",
  "delete-folder",
  "update-material",
  "update-topic",
  "move-material",
  "delete-material",
]);

interface SharePointUser {
  Email?: string;
  LoginName?: string;
  UserPrincipalName?: string;
}

interface DelegatedUser {
  email: string;
  login: string;
}

function getHeader(headers: Record<string, string | string[] | undefined>, name: string): string {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lowerName) continue;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value[0] || "";
  }
  return "";
}

function getBearerToken(headers: Record<string, string | string[] | undefined>): string {
  const authorization = getHeader(headers, "authorization");
  if (!authorization.toLowerCase().startsWith("bearer ")) return "";
  return authorization.slice(7).trim();
}

async function delegatedSharePointGet<T>(accessToken: string, path: string): Promise<T> {
  if (!SP_SITE_URL) throw new Error("SharePoint site URL is not configured");
  const response = await fetch(`${SP_SITE_URL}${path}`, {
    headers: {
      Accept: "application/json;odata=nometadata",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) throw new Error(`SharePoint GET ${response.status}`);
  return (await response.json()) as T;
}

function normalizeDelegatedUser(user: SharePointUser): DelegatedUser | null {
  const email = String(user.Email || user.UserPrincipalName || "").toLowerCase();
  const login = String(user.LoginName || "").toLowerCase();
  const loginEmail = login.split("|").pop() || "";
  const resolvedEmail = email || loginEmail;
  if (!resolvedEmail && !login) return null;
  return { email: resolvedEmail, login };
}

async function resolveDelegatedAdmin(accessToken: string): Promise<DelegatedUser | null> {
  if (!accessToken) return null;

  let user: DelegatedUser | null;
  try {
    user = normalizeDelegatedUser(
      await delegatedSharePointGet<SharePointUser>(
        accessToken,
        "/_api/web/currentuser?$select=Email,UserPrincipalName,LoginName",
      ),
    );
  } catch (error) {
    logWarn("api:learning", "Failed to resolve delegated user", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
  if (!user) return null;

  try {
    const members = await delegatedSharePointGet<{ value?: SharePointUser[] }>(
      accessToken,
      `/_api/web/sitegroups/getByName('${encodeURIComponent(ADMIN_GROUP)}')/users?$select=LoginName,Email,UserPrincipalName`,
    );
    const isAdmin = (members.value || []).some((member) => {
      const memberUser = normalizeDelegatedUser(member);
      if (!memberUser) return false;
      return (
        (user.email && memberUser.email === user.email) ||
        (user.login && memberUser.login === user.login) ||
        (user.email && memberUser.login.endsWith(user.email))
      );
    });
    return isAdmin ? user : null;
  } catch (error) {
    logWarn("api:learning", "Failed to verify learning admin membership", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ── Response shaping ─────────────────────────────────────────────────────────

interface MaterialPayload {
  id: string;
  fileName: string;
  title: string;
  description: string;
  kind: LearningMaterialKind;
  extension: string;
  folderPath: string;
  sizeBytes: number;
  thumbnailUrl: string;
  mediaUrl?: string;
  downloadable: boolean;
  sortOrder: number;
  createdAt: string;
  modifiedAt: string;
  viewCount: number;
  viewedByMe: boolean;
}

function isMediaKind(kind: LearningMaterialKind): boolean {
  return kind === "video" || kind === "image";
}

function buildMaterial(
  file: LearningFile,
  settings: MaterialSettings | undefined,
  views: ViewIndex,
): MaterialPayload {
  return {
    id: file.id,
    fileName: file.name,
    title: settings?.title?.trim() || stripExtension(file.name),
    description: settings?.description ?? "",
    kind: file.kind,
    extension: file.extension,
    folderPath: file.folderPath,
    sizeBytes: file.sizeBytes,
    thumbnailUrl: file.thumbnailUrl,
    // Videos autoplay a preview on the card and images cross-fade through their
    // folder, so media needs its bytes up front. Documents never get a direct
    // URL here — they open through the embed viewer instead.
    ...(isMediaKind(file.kind) && file.downloadUrl ? { mediaUrl: file.downloadUrl } : {}),
    downloadable: settings?.downloadable === true,
    sortOrder: settings?.sortOrder ?? 0,
    createdAt: file.createdAt,
    modifiedAt: file.modifiedAt,
    viewCount: views.counts[file.id] ?? 0,
    viewedByMe: views.viewedByMe.has(file.id),
  };
}

function buildTopics(
  folders: LearningFolder[],
  files: LearningFile[],
  topicSettings: Record<string, TopicSettings>,
): Array<Record<string, unknown>> {
  return folders
    .map((folder) => {
      const settings = topicSettings[folder.path];
      const directCount = files.filter((file) => file.folderPath === folder.path).length;
      const totalCount = files.filter(
        (file) => file.folderPath === folder.path || file.folderPath.startsWith(`${folder.path}/`),
      ).length;
      const subtopicCount = folders.filter((child) => child.parentPath === folder.path).length;

      return {
        path: folder.path,
        name: folder.name,
        parentPath: folder.parentPath,
        description: settings?.description ?? "",
        sortOrder: settings?.sortOrder ?? 0,
        materialCount: directCount,
        totalMaterialCount: totalCount,
        subtopicCount,
        coverThumbnails: folder.childThumbnails,
      };
    })
    .sort((a, b) => {
      const orderDiff = Number(a.sortOrder) - Number(b.sortOrder);
      if (orderDiff !== 0) return orderDiff;
      return String(a.path).localeCompare(String(b.path));
    });
}

function materialIdParam(raw: unknown): string {
  const value = String(raw ?? "").trim();
  // Drive item ids are opaque, but they are never punctuation-heavy — this keeps
  // anything creative out of the Graph URL path.
  if (!value || !/^[A-Za-z0-9!._%\-=]{4,300}$/.test(value)) {
    throw new Error("Invalid material id.");
  }
  return value;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers as Record<string, string | string[] | undefined>);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Learner-facing content answers per caller — never cache it at the edge.
  res.setHeader("Cache-Control", "private, no-store");

  const bearer = getBearerToken(req.headers);
  const action = req.method === "POST" ? String(req.body?.action || "") : "list";
  const isAdminAction = ADMIN_ACTIONS.has(action);

  try {
    const token = await getGraphToken();

    if (isAdminAction) {
      const admin = await resolveDelegatedAdmin(bearer);
      if (!admin) {
        return res.status(403).json({ error: "Managing learning materials is limited to HR Forms Owners." });
      }
      return await handleAdminAction(req, res, token, action, admin.email);
    }

    const signedInEmail = await resolveTenantIdentity(bearer);
    if (!signedInEmail) {
      return res.status(403).json({
        error: "Sign in with your PMW Microsoft 365 account to open learning materials.",
        code: "learning-sign-in-required",
      });
    }

    return await handleLearnerAction(req, res, token, action, signedInEmail);
  } catch (e) {
    logError("api:learning", "Learning materials request failed", e);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

async function handleLearnerAction(
  req: ApiRequest,
  res: ApiResponse,
  token: string,
  action: string,
  signedInEmail: string,
): Promise<void> {
  const viewer = viewerKey(signedInEmail);

  if (action === "list") {
    if (!(await learningLibraryExists(token))) {
      return res.status(200).json({ topics: [], materials: [], libraryReady: false });
    }

    const [{ folders, files }, settings, views] = await Promise.all([
      readLearningTree(token),
      readLearningSettings(token),
      readViewIndex(token, viewer),
    ]);

    const materials = files
      .map((file) => buildMaterial(file, settings.materials[file.id], views))
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.title.localeCompare(b.title);
      });

    return res.status(200).json({
      topics: buildTopics(folders, files, settings.topics),
      materials,
      libraryReady: true,
    });
  }

  if (action === "open-material" || action === "record-view") {
    const materialId = materialIdParam(req.body?.materialId);
    // Resolved through the learning library's own drive, so an id belonging to
    // some other library simply is not found here.
    const item = await readDriveItem(token, materialId);
    if (!item?.name || item.folder) {
      return res.status(404).json({ error: "This material is no longer available." });
    }
    const kind = materialKind(item.name);

    if (action === "record-view") {
      const viewCount = await recordView(token, materialId, viewer);
      return res.status(200).json({ viewCount });
    }

    const settings = await readLearningSettings(token);
    const downloadable = settings.materials[materialId]?.downloadable === true;

    if (isMediaKind(kind)) {
      const url = await readDownloadUrl(token, materialId);
      if (!url) return res.status(502).json({ error: "SharePoint did not return a playable link." });
      return res.status(200).json({
        mode: "media",
        url,
        ...(downloadable ? { downloadUrl: url } : {}),
      });
    }

    // Documents are shown through SharePoint's own viewer. It keeps the file URL
    // out of the page, which is the only reason a "no download" document stays
    // one once it is on screen.
    let embedUrl = "";
    try {
      embedUrl = await readEmbedUrl(token, materialId);
    } catch (error) {
      logWarn("api:learning", "Preview URL unavailable", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
    if (!embedUrl) {
      return res.status(502).json({
        error: "This document cannot be previewed right now. Try again shortly.",
      });
    }

    return res.status(200).json({
      mode: "embed",
      url: embedUrl,
      ...(downloadable ? { downloadUrl: await readDownloadUrl(token, materialId) } : {}),
    });
  }

  return res.status(400).json({ error: "Unknown action" });
}

async function handleAdminAction(
  req: ApiRequest,
  res: ApiResponse,
  token: string,
  action: string,
  adminEmail: string,
): Promise<void> {
  const body = req.body || {};

  try {
    if (action === "ensure-library") {
      await ensureLearningLibrary(token);
      return res.status(200).json({ success: true, libraryReady: true });
    }

    if (action === "create-folder") {
      const created = await createFolder(token, String(body.parentPath ?? ""), String(body.name ?? ""));
      return res.status(200).json({ success: true, path: created.path });
    }

    if (action === "rename-folder") {
      const renamed = await renameFolder(token, String(body.path ?? ""), String(body.name ?? ""));
      return res.status(200).json({ success: true, path: renamed.path });
    }

    if (action === "delete-folder") {
      await deleteFolder(token, String(body.path ?? ""));
      return res.status(200).json({ success: true });
    }

    if (action === "update-topic") {
      const path = sanitizeFolderPath(body.path);
      if (!path) return res.status(400).json({ error: "A topic is required." });
      await saveTopicSettings(token, path, parseTopicSettingsInput(body), adminEmail);
      return res.status(200).json({ success: true });
    }

    if (action === "update-material") {
      const materialId = materialIdParam(body.materialId);
      const settings = await saveMaterialSettings(
        token,
        materialId,
        parseMaterialSettingsInput(body),
        adminEmail,
      );
      return res.status(200).json({ success: true, settings: settings as Record<string, unknown> });
    }

    if (action === "move-material") {
      const materialId = materialIdParam(body.materialId);
      await moveMaterial(token, materialId, String(body.targetPath ?? ""));
      return res.status(200).json({ success: true });
    }

    if (action === "delete-material") {
      const materialId = materialIdParam(body.materialId);
      await deleteMaterial(token, materialId);
      // Best effort: an orphaned settings entry is harmless, a failed delete is not.
      await forgetMaterialSettings(token, materialId, adminEmail).catch(() => undefined);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    logWarn("api:learning", "Learning admin action failed", { action, errorMessage: raw });
    return res.status(400).json({ error: adminErrorMessage(raw) });
  }
}

/**
 * Validation errors raised here are written for the admin reading them, so they
 * pass through. A raw Graph failure is not — it carries site and drive ids — so
 * it is translated into the one thing the admin can act on.
 */
function adminErrorMessage(raw: string): string {
  if (!/^Graph [A-Z]+/.test(raw)) return raw.slice(0, 300);
  if (raw.includes("409") || raw.toLowerCase().includes("namealreadyexists")) {
    return "A folder with that name already exists here.";
  }
  if (raw.includes("404")) return "That folder or material no longer exists. Refresh and try again.";
  if (raw.includes("403")) return "SharePoint refused the change. Check the app's permissions on the library.";
  return "SharePoint rejected the change. Please try again.";
}

import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken } from "./_utils/graphClient.js";
import { resolveTenantIdentity } from "./_utils/careerPortalAccess.js";
import {
  collectCoverThumbnails,
  createFolder,
  deleteFolder,
  deleteMaterial,
  driveItemFolderPath,
  ensureLearningLibrary,
  forgetMaterialSettings,
  learningLibraryExists,
  materialKind,
  moveMaterial,
  parseMaterialSettingsInput,
  parseTopicSettingsInput,
  publicMaterialSettings,
  readDownloadUrl,
  readDriveItem,
  readEmbedUrl,
  readLearningSettings,
  readLearningTree,
  portalViewerKey,
  readViewIndex,
  recordView,
  renameFolder,
  saveMaterialPassword,
  saveMaterialSettings,
  saveTopicPassword,
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
import {
  ancestorsUnlocked,
  buildLockIndex,
  hashLockPassword,
  lockCooldownSeconds,
  lockKey,
  materialLock,
  noteLockFailure,
  noteLockSuccess,
  readSatisfiedLocks,
  signLockPass,
  topicOwnLock,
  topicUnlocked,
  validateLockPassword,
  verifyLockPassword,
  MATERIAL_PASS_TTL_SECONDS,
  TOPIC_PASS_TTL_SECONDS,
  type EffectiveLock,
  type LockIndex,
} from "./_utils/learningLocks.js";
import {
  authenticateAccount,
  createAccount,
  deleteAccount,
  ensureInternalAccountsSchema,
  isPortalSessionCurrent,
  listAccounts,
  normalizeLoginId,
  resetAccountPassword,
  setAccountStatus,
  unlockAccount,
  LOCKOUT_MINUTES,
} from "./_utils/internalAccounts.js";
import {
  ensureLearningAccessLogSchema,
  readAccessLog,
  recordAccessLogEntry,
} from "./_utils/learningAccessLog.js";
import {
  looksLikePortalToken,
  portalSessionsEnabled,
  signPortalSession,
  verifyPortalSession,
  PORTAL_SESSIONS_DISABLED_MESSAGE,
} from "./_utils/internalSession.js";
import { resolveHrFormsOwner } from "./_utils/hrFormsOwner.js";
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

/**
 * Actions that change the library. These carry a delegated **SharePoint** token
 * and are checked against the HR Forms Owners group, exactly like job-admin.
 * Everything else carries a **Graph** token and only proves "a signed-in PMW
 * account", which is all a learner needs — and is what makes a view unique.
 */
const ADMIN_ACTIONS = new Set([
  "admin-list",
  "ensure-library",
  "create-folder",
  "rename-folder",
  "delete-folder",
  "update-material",
  "update-topic",
  "move-material",
  "delete-material",
  // Password locks. Same gate as every other content change: deciding what is
  // behind a password is editing the library, not reading it.
  "set-material-password",
  "set-topic-password",
  // Portal account management. Same gate, same token, same failure path as the
  // library actions above — HR issues these accounts to reach this hub, so the
  // people who may create one are exactly the people who may fill it.
  "portal-ensure-schema",
  "portal-list-accounts",
  "portal-create-account",
  "portal-reset-password",
  "portal-set-status",
  "portal-unlock-account",
  "portal-delete-account",
  "portal-view-log",
]);

/**
 * Portal accounts live on this endpoint rather than one of their own because
 * Vercel's Hobby plan caps a deployment at 12 serverless functions and `api/`
 * was already at 12. Grouping them here is the least arbitrary place to spend
 * the budget: an HR-issued account exists to reach this library, its admin
 * actions want the identical HR Forms Owner gate, and `record-view` already
 * writes the access log these actions read back.
 *
 * `portal-sign-in` is the one action on this file that answers before anybody is
 * signed in — it is the front door — so it is dispatched ahead of both the owner
 * check and the learner check, and is protected by the password verification and
 * per-account lockout alone.
 */
const PORTAL_SIGN_IN_ACTION = "portal-sign-in";

/** How long a portal session lasts before the person signs in again. */
const PORTAL_SESSION_TTL_HOURS = 12;

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
  /** A password stands between this material and being opened — every time. */
  locked: boolean;
  /**
   * The password is set on this material rather than inherited from a topic.
   * The admin screen's switch reflects this one: a material inside a locked
   * topic is protected without having a password of its own to turn off.
   */
  lockOwn: boolean;
  /** What to name in the prompt: this material, or the topic whose lock it is. */
  lockLabel: string;
}

function isMediaKind(kind: LearningMaterialKind): boolean {
  return kind === "video" || kind === "image";
}

function topicDisplayPath(path: string): string {
  return path.replace(/\//g, " › ");
}

function buildMaterial(
  file: LearningFile,
  settings: MaterialSettings | undefined,
  views: ViewIndex,
  lock: EffectiveLock | null,
  satisfied: Set<string>,
  revealAll: boolean,
): MaterialPayload {
  const title = settings?.title?.trim() || stripExtension(file.name);
  /**
   * Whether this caller has already proved the password that guards it. A
   * material behind its own password is never revealed by `list` — the pass for
   * one is issued at the moment it is opened and thrown away again. A material
   * inside a topic the caller has just unlocked is: they typed that password to
   * get here, and greying out the folder they just opened would be theatre.
   */
  const revealed = revealAll || !lock || satisfied.has(lockKey(lock.scope, lock.target));

  return {
    id: file.id,
    fileName: file.name,
    title,
    // Redacted, not just un-openable. A thumbnail is a frame of the video and a
    // description can be the whole point of the material — "blocked from
    // preview" has to mean the card carries nothing to preview.
    description: revealed ? settings?.description ?? "" : "",
    kind: file.kind,
    extension: file.extension,
    folderPath: file.folderPath,
    sizeBytes: file.sizeBytes,
    thumbnailUrl: revealed ? file.thumbnailUrl : "",
    // Videos autoplay a preview on the card and images cross-fade through their
    // folder, so media needs its bytes up front. Documents never get a direct
    // URL here — they open through the embed viewer instead.
    ...(revealed && isMediaKind(file.kind) && file.downloadUrl ? { mediaUrl: file.downloadUrl } : {}),
    downloadable: settings?.downloadable === true,
    sortOrder: settings?.sortOrder ?? 0,
    createdAt: file.createdAt,
    modifiedAt: file.modifiedAt,
    viewCount: views.counts[file.id] ?? 0,
    viewedByMe: views.viewedByMe.has(file.id),
    locked: Boolean(lock),
    lockOwn: lock?.scope === "material",
    lockLabel: !lock ? "" : lock.scope === "material" ? title : topicDisplayPath(lock.target),
  };
}

/**
 * The topics this caller may know about. A topic inside a locked one is left out
 * of the answer entirely rather than returned locked: a tree of folder names is
 * itself a description of what is being kept back, one name at a time.
 */
function buildTopics(
  folders: LearningFolder[],
  files: LearningFile[],
  topicSettings: Record<string, TopicSettings>,
  locks: LockIndex,
  satisfied: Set<string>,
  revealAll: boolean,
): Array<Record<string, unknown>> {
  const canBrowse = (path: string) => revealAll || topicUnlocked(locks, path, satisfied);

  return folders
    .filter((folder) => revealAll || ancestorsUnlocked(locks, folder.path, satisfied))
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
        // Counts survive a lock. They say how much is inside, never what — and
        // an empty-looking folder that turns out to hold nine videos is a worse
        // answer than a locked one that says so.
        materialCount: directCount,
        totalMaterialCount: totalCount,
        subtopicCount,
        coverThumbnails: collectCoverThumbnails(folder.path, folders, files, canBrowse),
        // Two facts, not one. `locked` is "a password is set on this topic",
        // which stays true after somebody opens it — the badge on the card says
        // so, and the admin screen's switch reads it. `unlocked` is "this caller
        // may look inside right now", which is what decides between navigating
        // into the topic and asking for the password.
        locked: Boolean(topicOwnLock(locks, folder.path)),
        unlocked: canBrowse(folder.path),
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

    // Ahead of every other check: this is how somebody with no Microsoft account
    // proves who they are in the first place.
    if (action === PORTAL_SIGN_IN_ACTION) {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      // Credentials in, session out — never cached anywhere, by anyone.
      res.setHeader("Cache-Control", "no-store");
      return await handlePortalSignIn(req, res, token);
    }

    if (isAdminAction) {
      const admin = await resolveHrFormsOwner(bearer);
      if (!admin) {
        return res.status(403).json({ error: "Managing learning materials is limited to HR Forms Owners." });
      }
      return await handleAdminAction(req, res, token, action, admin);
    }

    const learner = await resolveLearnerViewer(bearer, token);
    if (!learner) {
      return res.status(403).json({
        error: "Sign in with your PMW Microsoft 365 account or portal account to open learning materials.",
        code: "learning-sign-in-required",
      });
    }

    return await handleLearnerAction(req, res, token, action, learner);
  } catch (e) {
    logError("api:learning", "Learning materials request failed", e);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

/**
 * Two ways to be a learner: a PMW Microsoft 365 account, and an HR-issued portal
 * account. Both fold into the one opaque key the view index counts by, and only
 * one of them carries a name.
 */
interface Learner {
  /** What the view index counts. Never reversible to a person. */
  key: string;
  /**
   * Set only for a portal account, and only because HR issues those to be
   * followed up by name — it is what the access log writes. Staff signing in
   * with Microsoft 365 resolve to `null` here, which is what keeps the named
   * trail limited to the population that was told about it.
   */
  portal: { loginId: string; fullName: string } | null;
}

/**
 * A portal token is checked first and answers without a network call, so an
 * HR-issued account never pays for a Graph `/me` round trip that could not
 * possibly recognise it. `isPortalSessionCurrent` is the second half of that
 * check: the signature proves who they are, the account state proves they are
 * still allowed in after a disable or a password reset.
 */
async function resolveLearnerViewer(bearer: string, graphToken: string): Promise<Learner | null> {
  if (looksLikePortalToken(bearer)) {
    const claims = verifyPortalSession(bearer);
    if (!claims) return null;
    if (!(await isPortalSessionCurrent(graphToken, claims.loginId, claims.tokenVersion))) return null;
    return {
      key: portalViewerKey(claims.loginId),
      portal: { loginId: claims.loginId, fullName: claims.fullName },
    };
  }

  const signedInEmail = await resolveTenantIdentity(bearer);
  return signedInEmail ? { key: viewerKey(signedInEmail), portal: null } : null;
}

async function handleLearnerAction(
  req: ApiRequest,
  res: ApiResponse,
  token: string,
  action: string,
  learner: Learner,
): Promise<void> {
  const viewer = learner.key;
  if (action === "list") {
    return res.status(200).json(await readLibrary(token, viewer, req.body?.passes, false));
  }

  // Just the numbers behind the eye icons. The hub polls this while it is on
  // screen, so it deliberately skips the library walk `list` does — one read of
  // the views list, served from a short server-side cache.
  if (action === "view-counts") {
    const views = await readViewIndex(token, viewer);
    return res.status(200).json({
      counts: views.counts,
      viewedByMe: Array.from(views.viewedByMe),
    });
  }

  // Typing a password. Answers with a short-lived signed pass rather than a
  // cookie or a stored flag, because the pass is the whole persistence model:
  // the browser holds it in memory, and the one issued for opening a material
  // is spent on that open and thrown away.
  if (action === "unlock") {
    return await handleUnlock(req, res, token, viewer);
  }

  if (action === "open-material" || action === "record-view") {
    const materialId = materialIdParam(req.body?.materialId);
    // Resolved through the learning library's own drive, so an id belonging to
    // some other library simply is not found here. The `item.folder` test is
    // what keeps a view attached to one material: a topic is a folder, and a
    // folder is never openable and never viewable.
    const item = await readDriveItem(token, materialId);
    if (!item?.name || item.folder) {
      return res.status(404).json({ error: "This material is no longer available." });
    }
    const kind = materialKind(item.name);

    // The gate, ahead of both branches. `open-material` needs it because
    // everything past it hands back a URL that plays the file — and `record-view`
    // needs it because the named access log is evidence: a row saying somebody
    // opened a locked briefing has to mean they got through its password, not
    // that they knew the material's id.
    const settings = await readLearningSettings(token);
    const locks = buildLockIndex(settings);
    const lock = materialLock(locks, materialId, driveItemFolderPath(item));
    if (lock && !readSatisfiedLocks(req.body?.passes, viewer, locks).has(lockKey(lock.scope, lock.target))) {
      return res.status(403).json({
        error: "This material is password protected.",
        code: "learning-locked",
        lockLabel: lock.scope === "material" ? stripExtension(item.name) : topicDisplayPath(lock.target),
      });
    }

    if (action === "record-view") {
      const viewCount = await recordView(token, materialId, viewer);

      // Named trail for HR-issued accounts only, and written after the view has
      // been counted so a log failure can never cost somebody their view. `item`
      // is the material this endpoint already resolved and refused to treat as a
      // folder, so the name recorded is the file they actually opened.
      if (learner.portal) {
        await recordAccessLogEntry(token, {
          loginId: learner.portal.loginId,
          viewerName: learner.portal.fullName,
          materialId,
          materialName: stripExtension(item.name),
        });
      }

      return res.status(200).json({ viewCount });
    }

    const downloadable = settings.materials[materialId]?.downloadable === true;

    // The viewer asks for the embed after a `<video>` has failed on it, so a
    // container this browser cannot decode still plays through SharePoint.
    const preferEmbed = req.body?.preferEmbed === true;

    if (isMediaKind(kind) && !preferEmbed) {
      const url = await readDownloadUrl(token, materialId);
      if (url) {
        return res.status(200).json({
          mode: "media",
          url,
          ...(downloadable ? { downloadUrl: url } : {}),
        });
      }
      // No direct source — usually a file SharePoint is still processing. Rather
      // than tell someone their video is broken, fall through to SharePoint's
      // own player below, which can play what the <video> tag cannot reach.
      logWarn("api:learning", "No direct media URL; falling back to the embed viewer", { kind });
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
        error: "This material cannot be opened right now. Try again shortly.",
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

/**
 * The whole library as one caller may see it.
 *
 * `revealAll` is the HR Forms Owner's view and nothing else: an admin sets these
 * passwords, and a management screen that hid the folder whose password an admin
 * had just set — with no way back in short of typing it — would be unusable. It
 * is reached only through `admin-list`, which sits behind the same owner check
 * as every other library edit. Learners always pass `false`, and what they may
 * see is decided from their passes alone.
 */
async function readLibrary(
  token: string,
  viewer: string,
  passes: unknown,
  revealAll: boolean,
): Promise<Record<string, unknown>> {
  if (!(await learningLibraryExists(token))) {
    return { topics: [], materials: [], libraryReady: false, viewsReady: false };
  }

  const [{ folders, files }, settings, views] = await Promise.all([
    readLearningTree(token),
    readLearningSettings(token),
    readViewIndex(token, viewer),
  ]);

  const locks = buildLockIndex(settings);
  const satisfied = readSatisfiedLocks(passes, viewer, locks);

  const materials = files
    // A material inside a locked topic is not in the answer at all, so it cannot
    // be searched for, counted in a total, or linked to. Filtering client-side
    // would have shipped every title and thumbnail to the browser and asked it
    // politely not to look.
    .filter((file) => revealAll || topicUnlocked(locks, file.folderPath, satisfied))
    .map((file) =>
      buildMaterial(
        file,
        settings.materials[file.id],
        views,
        materialLock(locks, file.id, file.folderPath),
        satisfied,
        revealAll,
      ),
    )
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.title.localeCompare(b.title);
    });

  return {
    topics: buildTopics(folders, files, settings.topics, locks, satisfied, revealAll),
    materials,
    libraryReady: true,
    // Separate from `libraryReady` on purpose. A library whose tracking list is
    // missing still serves every material perfectly, so learners must not be
    // told it is unavailable — but an admin has to be told, because until they
    // provision it nothing is counted and no portal view is logged.
    viewsReady: views.ready,
  };
}

/**
 * Verifies a password against whichever lock actually guards the thing being
 * asked for, and issues a pass for exactly that lock.
 *
 * The caller names the material or the topic, never the lock. That is the point:
 * for a material inside a locked folder the answer is the *folder's* password,
 * and letting a request nominate which lock it would like to be checked against
 * is how a per-material password gets used to open a whole department's folder.
 */
async function handleUnlock(
  req: ApiRequest,
  res: ApiResponse,
  token: string,
  viewer: string,
): Promise<void> {
  // Credentials in, pass out. Never cached anywhere, by anyone.
  res.setHeader("Cache-Control", "no-store");

  const settings = await readLearningSettings(token);
  const locks = buildLockIndex(settings);
  const scope = String(req.body?.scope ?? "");

  let lock: EffectiveLock | null;
  let ttlSeconds: number;

  if (scope === "material") {
    const materialId = materialIdParam(req.body?.materialId);
    const item = await readDriveItem(token, materialId);
    if (!item?.name || item.folder) {
      return res.status(404).json({ error: "This material is no longer available." });
    }
    lock = materialLock(locks, materialId, driveItemFolderPath(item));
    // Long enough to cover the open that follows, and the second request the
    // viewer makes when a video falls back to SharePoint's player. Not long
    // enough to be worth keeping.
    ttlSeconds = MATERIAL_PASS_TTL_SECONDS;
  } else if (scope === "topic") {
    lock = topicOwnLock(locks, sanitizeFolderPath(req.body?.path));
    // A browsing session's worth. The pass still dies with the page: the hub
    // holds it in React state and never writes it anywhere.
    ttlSeconds = TOPIC_PASS_TTL_SECONDS;
  } else {
    return res.status(400).json({ error: "Unknown unlock scope" });
  }

  if (!lock) {
    // Nothing to unlock — the password was removed, or the material moved out of
    // the folder that was guarding it. Say so plainly rather than refusing: the
    // caller's next move is simply to open it.
    return res.status(200).json({ unlocked: true, alreadyOpen: true });
  }

  const cooldown = lockCooldownSeconds(viewer, lock);
  if (cooldown > 0) {
    return res.status(429).json({
      error: `Too many wrong passwords. Try again in ${cooldown} second${cooldown === 1 ? "" : "s"}.`,
    });
  }

  const password = String(req.body?.password ?? "");
  if (!password || !(await verifyLockPassword(password, lock.hash))) {
    noteLockFailure(viewer, lock);
    return res.status(401).json({ error: "That password is not right." });
  }

  noteLockSuccess(viewer, lock);
  try {
    const { pass, expiresAt } = signLockPass(lock, viewer, ttlSeconds);
    return res.status(200).json({ unlocked: true, pass, expiresAt });
  } catch (error) {
    // The signing secret is missing, which is a deployment problem and not this
    // learner's. They typed the right password; refusing them with "wrong
    // password" would send them to look for a password that works.
    logError("api:learning", "Could not sign a learning unlock pass", error);
    return res.status(503).json({
      error: "Password-protected materials are unavailable right now. Please contact HR.",
    });
  }
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
    if (action.startsWith("portal-")) {
      // Portal account management never touches the document library, and its
      // errors are written for the admin reading them, so it gets its own
      // handler and its own catch rather than sharing the library's.
      return await handlePortalAdminAction(req, res, token, action, adminEmail);
    }

    if (action === "admin-list") {
      // The management view: every topic and material, locked ones included and
      // with their covers intact, because this is the screen the passwords are
      // set from. Views are still counted against the admin's own key, so an
      // owner browsing their own library reads the same numbers a learner does.
      return res.status(200).json(await readLibrary(token, viewerKey(adminEmail), null, true));
    }

    if (action === "ensure-library") {
      await ensureLearningLibrary(getBearerToken(req.headers));
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
      // `publicMaterialSettings`, not the record itself: the stored settings
      // carry the password hash and this answer goes to a browser.
      return res.status(200).json({ success: true, settings: publicMaterialSettings(settings) });
    }

    /**
     * Set, replace, or remove a password. An empty `password` removes it, which
     * is what makes this one action rather than three — the admin screen toggles
     * a switch, and off is a value, not a different operation.
     *
     * There is no read side. The stored value is a one-way hash, so an admin can
     * replace a lock password but never look one up, exactly as with a portal
     * account.
     */
    if (action === "set-material-password" || action === "set-topic-password") {
      const raw = String(body.password ?? "");
      const passwordHash = raw ? await hashLockPassword(validateLockPassword(raw)) : "";

      if (action === "set-material-password") {
        await saveMaterialPassword(token, materialIdParam(body.materialId), passwordHash, adminEmail);
      } else {
        const path = sanitizeFolderPath(body.path);
        if (!path) return res.status(400).json({ error: "A topic is required." });
        await saveTopicPassword(token, path, passwordHash, adminEmail);
      }

      return res.status(200).json({ success: true, locked: Boolean(passwordHash) });
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

// ── Portal accounts ──────────────────────────────────────────────────────────

async function handlePortalSignIn(req: ApiRequest, res: ApiResponse, graphToken: string): Promise<void> {
  if (!portalSessionsEnabled()) {
    // The fix is an environment variable, which is the admin's problem and not
    // the visitor's — so the reason goes to the log, and the person at the
    // sign-in box gets something they can actually act on. Admins see the real
    // state on `portal-list-accounts`, which reports `sessionsConfigured`.
    logWarn("api:learning", PORTAL_SESSIONS_DISABLED_MESSAGE, {});
    return res.status(503).json({
      error: "Portal account sign-in is unavailable right now. Use Microsoft 365, or contact HR.",
    });
  }

  const loginId = normalizeLoginId(req.body?.loginId);
  const password = String(req.body?.password ?? "");

  const result = await authenticateAccount(graphToken, loginId, password);

  if (!result.ok) {
    if (result.reason === "locked") {
      // Naming the lockout tells an attacker this login ID is real — but they
      // already had to guess it five times to get here, and the person actually
      // locked out otherwise has no idea why their correct password stopped
      // working. The support call costs more than the hint does.
      return res.status(429).json({
        error: `Too many failed attempts. Try again in ${result.minutes || LOCKOUT_MINUTES} minutes, or ask HR to unlock the account.`,
      });
    }
    if (result.reason === "disabled") {
      return res.status(403).json({ error: "This portal account has been disabled. Contact HR." });
    }
    return res.status(401).json({ error: "That login ID and password do not match." });
  }

  const { token, expiresAt } = signPortalSession(
    {
      loginId: result.account.loginId,
      fullName: result.account.fullName,
      tokenVersion: result.account.tokenVersion,
    },
    PORTAL_SESSION_TTL_HOURS,
  );

  return res.status(200).json({
    session: { token, loginId: result.account.loginId, fullName: result.account.fullName, expiresAt },
  });
}

async function handlePortalAdminAction(
  req: ApiRequest,
  res: ApiResponse,
  graphToken: string,
  action: string,
  adminEmail: string,
): Promise<void> {
  const body = req.body || {};
  // Account state is not library state — never let it sit in a shared cache.
  res.setHeader("Cache-Control", "no-store");

  try {
    if (action === "portal-ensure-schema") {
      // Both lists, one button. An accounts list without its log would let HR
      // issue accounts that quietly record nothing, and the promise made when
      // the account is handed over is that the viewing *is* recorded.
      // The admin's own token, not the application's: SharePoint refuses the
      // app-only principal both the lists and their columns.
      const delegatedToken = getBearerToken(req.headers);
      await ensureInternalAccountsSchema(delegatedToken);
      await ensureLearningAccessLogSchema(delegatedToken);
      return res.status(200).json({ success: true, sessionsConfigured: portalSessionsEnabled() });
    }

    if (action === "portal-list-accounts") {
      // A missing list is the ordinary first-run state, not a failure: the admin
      // screen turns `provisioned: false` into a "Set up" button. Reporting it as
      // an error instead would greet every new deployment with a red banner
      // describing a problem that has not happened yet.
      const listed = await listAccounts(graphToken).catch(() => null);
      return res.status(200).json({
        accounts: listed ?? [],
        provisioned: listed !== null,
        sessionsConfigured: portalSessionsEnabled(),
      });
    }

    if (action === "portal-view-log") {
      return res.status(200).json({ entries: await readAccessLog(graphToken) });
    }

    if (action === "portal-create-account") {
      const account = await createAccount(
        graphToken,
        {
          loginId: String(body.loginId ?? ""),
          fullName: String(body.fullName ?? ""),
          password: String(body.password ?? ""),
        },
        adminEmail,
      );
      return res.status(200).json({ success: true, account });
    }

    if (action === "portal-reset-password") {
      await resetAccountPassword(graphToken, normalizeLoginId(body.loginId), String(body.password ?? ""));
      return res.status(200).json({ success: true });
    }

    if (action === "portal-set-status") {
      const status = String(body.status ?? "") === "disabled" ? "disabled" : "active";
      await setAccountStatus(graphToken, normalizeLoginId(body.loginId), status);
      return res.status(200).json({ success: true, status });
    }

    if (action === "portal-unlock-account") {
      await unlockAccount(graphToken, normalizeLoginId(body.loginId));
      return res.status(200).json({ success: true });
    }

    if (action === "portal-delete-account") {
      await deleteAccount(graphToken, normalizeLoginId(body.loginId));
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    logWarn("api:learning", "Portal account admin action failed", { action, errorMessage: raw });
    // Validation messages are written for the admin reading them and pass
    // through; a raw Graph failure carries site and drive ids and does not.
    if (/^(Graph|SP REST) /.test(raw)) {
      return res.status(400).json({ error: "SharePoint rejected the change. Please try again." });
    }
    return res.status(400).json({ error: raw.slice(0, 300) });
  }
}

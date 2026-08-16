import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  CloudUploadOutlined,
  CreateNewFolderOutlined,
  DeleteOutlined,
  DriveFileMoveOutlined,
  DriveFileRenameOutline,
  EditOutlined,
  FolderOutlined,
  LibraryBooksOutlined,
  LockOutlined,
  Refresh,
  VisibilityOutlined,
} from "@mui/icons-material";
import LearningHeader from "../components/learning/LearningHeader";
import SetLockPasswordDialog from "../components/learning/SetLockPasswordDialog";
import {
  LearningEmptyState,
  kindStyle,
  learningButtonSx,
  learningContentSx,
  learningPageSx,
  learningPanelSx,
} from "../components/learning/learningUi";
import {
  acquireLearningIdentityToken,
  createLearningFolder,
  deleteLearningFolder,
  deleteLearningMaterial,
  ensureLearningLibraryProvisioned,
  fetchLearningLibraryForAdmin,
  formatFileSize,
  moveLearningMaterial,
  renameLearningFolder,
  setLearningMaterialPassword,
  setLearningTopicPassword,
  updateLearningMaterial,
  uploadLearningFile,
} from "../utils/learningService";
import { mergeViewCounts, useLearningViewCounts } from "../hooks/useLearningViewCounts";
import { acquireAccessTokenSilentOrRedirect } from "../utils/authRecovery";
import { loginRequest } from "../auth/msalConfig";
import { editorial } from "../theme/editorial";
import type { LearningMaterial, LearningTopic, LearningViewCounts } from "../types";

type Feedback = { message: string; severity: "success" | "error" } | null;

interface MaterialDraft {
  title: string;
  description: string;
  downloadable: boolean;
  sortOrder: number;
}

interface UploadState {
  fileName: string;
  loaded: number;
  total: number;
  index: number;
  count: number;
}

export default function AdminLearningPage() {
  const navigate = useNavigate();
  const { instance } = useMsal();

  const [spToken, setSpToken] = useState("");
  const [identityToken, setIdentityToken] = useState("");
  const [topics, setTopics] = useState<LearningTopic[]>([]);
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [libraryReady, setLibraryReady] = useState(true);
  const [viewsReady, setViewsReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selectedPath, setSelectedPath] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [folderDialog, setFolderDialog] = useState<{ mode: "create" | "rename"; path: string } | null>(null);
  const [folderName, setFolderName] = useState("");
  const [editing, setEditing] = useState<LearningMaterial | null>(null);
  const [draft, setDraft] = useState<MaterialDraft>({ title: "", description: "", downloadable: false, sortOrder: 0 });
  const [upload, setUpload] = useState<UploadState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /**
   * Which thing is having a password set, or null. Held as the target rather
   * than a boolean so the dialog can be mounted only while it is open — a
   * password must not sit in state after the dialog that collected it is gone.
   */
  const [passwordTarget, setPasswordTarget] = useState<
    { scope: "material"; material: LearningMaterial } | { scope: "topic"; topic: LearningTopic } | null
  >(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
        const [sharePointToken, graphToken] = await Promise.all([
          acquireAccessTokenSilentOrRedirect(instance, { scopes: loginRequest.scopes, account: account ?? undefined }),
          acquireLearningIdentityToken(instance, account),
        ]);
        if (cancelled) return;
        setSpToken(sharePointToken);
        setIdentityToken(graphToken);

        // The owner's view, on the SharePoint token: password-locked topics come
        // back whole here, which is the only way their contents can be managed
        // from the screen the passwords are set on.
        const data = await fetchLearningLibraryForAdmin(sharePointToken);
        if (cancelled) return;
        setTopics(data.topics);
        setMaterials(data.materials);
        setLibraryReady(data.libraryReady);
        setViewsReady(data.viewsReady);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "The library could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [instance, reloadKey]);

  const reload = () => setReloadKey((key) => key + 1);

  // Engagement is the reason this list carries view counts at all, so they
  // refresh on their own while the page is open rather than on a Refresh click.
  const applyLiveCounts = useCallback((data: LearningViewCounts) => {
    setMaterials((current) => mergeViewCounts(current, data));
  }, []);

  useLearningViewCounts(identityToken, Boolean(identityToken) && !loading, applyLiveCounts);

  async function runAction(operation: () => Promise<void>, successMessage: string) {
    setBusy(true);
    try {
      await operation();
      setFeedback({ message: successMessage, severity: "success" });
      reload();
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : "The change could not be saved.",
        severity: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  const folderMaterials = materials.filter((material) => material.folderPath === selectedPath);
  const selectedTopic = topics.find((topic) => topic.path === selectedPath) ?? null;

  const handleProvision = () =>
    runAction(async () => {
      await ensureLearningLibraryProvisioned(spToken);
    }, "SharePoint library ready.");

  const submitFolderDialog = () => {
    if (!folderDialog) return;
    const name = folderName.trim();
    if (!name) return;

    const dialog = folderDialog;
    setFolderDialog(null);
    void runAction(async () => {
      if (dialog.mode === "create") {
        await createLearningFolder(dialog.path, name, spToken);
      } else {
        const renamed = await renameLearningFolder(dialog.path, name, spToken);
        setSelectedPath(renamed.path);
      }
    }, dialog.mode === "create" ? `Topic "${name}" created.` : `Topic renamed to "${name}".`);
  };

  const handleDeleteFolder = (topic: LearningTopic) => {
    if (
      !window.confirm(
        `Delete "${topic.name}" and everything inside it? ${topic.totalMaterialCount} material(s) will be removed from SharePoint.`,
      )
    ) {
      return;
    }
    void runAction(async () => {
      await deleteLearningFolder(topic.path, spToken);
      setSelectedPath(topic.parentPath);
    }, `Topic "${topic.name}" deleted.`);
  };

  const handleDeleteMaterial = (material: LearningMaterial) => {
    if (!window.confirm(`Delete "${material.title}"? This removes the file from SharePoint.`)) return;
    void runAction(async () => {
      await deleteLearningMaterial(material.id, spToken);
    }, `"${material.title}" deleted.`);
  };

  const handleToggleDownloadable = (material: LearningMaterial, downloadable: boolean) => {
    // Optimistic: the switch is the whole interaction, so it has to feel instant.
    setMaterials((current) =>
      current.map((item) => (item.id === material.id ? { ...item, downloadable } : item)),
    );
    void runAction(async () => {
      await updateLearningMaterial(material.id, { downloadable }, spToken);
    }, downloadable ? "Download enabled." : "Download disabled.");
  };

  /**
   * The lock switch, deliberately shaped like the download switch next to it:
   * on opens the password dialog, off removes the password after a confirmation.
   * Turning it on is the only half that needs a value, so it is the only half
   * that asks for one.
   */
  const handleToggleLock = (material: LearningMaterial, locked: boolean) => {
    if (locked) {
      setPasswordTarget({ scope: "material", material });
      return;
    }
    if (!window.confirm(`Remove the password from "${material.title}"? Anyone signed in will be able to open it.`)) {
      return;
    }
    void runAction(async () => {
      await setLearningMaterialPassword(material.id, "", spToken);
    }, "Password removed.");
  };

  const handleToggleTopicLock = (topic: LearningTopic, locked: boolean) => {
    if (locked) {
      setPasswordTarget({ scope: "topic", topic });
      return;
    }
    if (
      !window.confirm(
        `Remove the password from "${topic.name}"? Everything inside it becomes visible to anyone signed in.`,
      )
    ) {
      return;
    }
    void runAction(async () => {
      await setLearningTopicPassword(topic.path, "", spToken);
    }, "Password removed.");
  };

  const savePassword = (password: string) => {
    const target = passwordTarget;
    if (!target) return;
    setPasswordTarget(null);

    void runAction(async () => {
      if (target.scope === "material") {
        await setLearningMaterialPassword(target.material.id, password, spToken);
      } else {
        await setLearningTopicPassword(target.topic.path, password, spToken);
      }
    }, "Password saved. Share it with the people who need it — it cannot be looked up again.");
  };

  const handleMoveMaterial = (material: LearningMaterial, targetPath: string) => {
    void runAction(async () => {
      await moveLearningMaterial(material.id, targetPath, spToken);
    }, "Material moved.");
  };

  const openEditor = (material: LearningMaterial) => {
    setEditing(material);
    setDraft({
      title: material.title,
      description: material.description,
      downloadable: material.downloadable,
      sortOrder: material.sortOrder,
    });
  };

  const saveEditor = () => {
    const material = editing;
    if (!material) return;
    setEditing(null);
    void runAction(async () => {
      await updateLearningMaterial(
        material.id,
        {
          title: draft.title.trim(),
          description: draft.description.trim(),
          downloadable: draft.downloadable,
          sortOrder: Number(draft.sortOrder) || 0,
        },
        spToken,
      );
    }, "Material updated.");
  };

  async function handleFilesSelected(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    setBusy(true);
    let uploaded = 0;
    try {
      for (const [index, file] of files.entries()) {
        setUpload({ fileName: file.name, loaded: 0, total: file.size, index: index + 1, count: files.length });
        await uploadLearningFile(spToken, selectedPath, file, (progress) => {
          setUpload({
            fileName: file.name,
            loaded: progress.loadedBytes,
            total: progress.totalBytes,
            index: index + 1,
            count: files.length,
          });
        });
        uploaded += 1;
      }
      setFeedback({
        message: `Uploaded ${uploaded} file${uploaded === 1 ? "" : "s"}. New materials are view-only until you enable download.`,
        severity: "success",
      });
      reload();
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : "The upload failed.",
        severity: "error",
      });
      if (uploaded > 0) reload();
    } finally {
      setUpload(null);
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Box sx={learningPageSx}>
      <LearningHeader
        title="Manage learning materials"
        subtitle="Organise topics, upload files, and control who can download or open what."
        backPath="/learning"
        backLabel="Back to the learning hub"
        actions={
          <>
            <Button
              size="small"
              startIcon={<Refresh />}
              onClick={reload}
              disabled={busy}
              sx={{ ...learningButtonSx, color: editorial.pmwBlueDark }}
            >
              Refresh
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<LibraryBooksOutlined />}
              onClick={() => navigate("/learning")}
              sx={learningButtonSx}
            >
              Open hub
            </Button>
          </>
        }
      />

      {busy && <LinearProgress sx={{ height: 3 }} />}

      <Container maxWidth="xl" disableGutters>
        <Box sx={learningContentSx}>
          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: "10px", fontWeight: 700 }}>
              {error}
            </Alert>
          )}

          {/*
            A library can be fully usable and still have no tracking list — the
            document library was made by hand, or provisioning half-finished.
            Nothing looks wrong from the outside: materials open, and every view
            count sits at zero as though nobody had opened them. So it is said
            plainly, next to the one button that fixes it.
          */}
          {!loading && libraryReady && !viewsReady && (
            <Alert
              severity="warning"
              sx={{ mb: 2 }}
              action={
                <Button
                  size="small"
                  color="inherit"
                  onClick={handleProvision}
                  disabled={busy || !spToken}
                >
                  Set up
                </Button>
              }
            >
              Views are not being recorded. The "Learning Material Views" list is missing from SharePoint,
              so every count stays at zero and nothing a portal account opens reaches the access log.
              Materials still open normally.
            </Alert>
          )}

          {!loading && !libraryReady ? (
            <LearningEmptyState
              icon={<LibraryBooksOutlined />}
              title="Set up the learning library"
              description={`This creates the "Learning Materials" document library and the view-tracking list in SharePoint. Topics become folders inside it.`}
              action={
                <Button
                  variant="contained"
                  startIcon={<CreateNewFolderOutlined />}
                  onClick={handleProvision}
                  disabled={busy || !spToken}
                  sx={learningButtonSx}
                >
                  Create the library
                </Button>
              }
            />
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "minmax(240px, 300px) minmax(0, 1fr)" },
                gap: { xs: 2, md: 3 },
                alignItems: "start",
              }}
            >
              <Paper sx={{ ...learningPanelSx, p: 1.5, position: { md: "sticky" }, top: { md: 88 } }}>
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1, px: 0.5 }}>
                  <Typography variant="overline" sx={{ fontWeight: 900, color: editorial.softMuted }}>
                    Topics
                  </Typography>
                  <Tooltip title="New top-level topic">
                    <span>
                      <IconButton
                        size="small"
                        disabled={busy}
                        onClick={() => {
                          setFolderName("");
                          setFolderDialog({ mode: "create", path: "" });
                        }}
                        sx={{ color: editorial.pmwBlueDark }}
                      >
                        <CreateNewFolderOutlined fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>

                <TopicTreeButton
                  label="All materials (root)"
                  depth={0}
                  count={materials.filter((material) => !material.folderPath).length}
                  selected={selectedPath === ""}
                  onSelect={() => setSelectedPath("")}
                />
                {topics.map((topic) => (
                  <TopicTreeButton
                    key={topic.path}
                    label={topic.name}
                    depth={topic.path.split("/").length}
                    count={topic.materialCount}
                    selected={selectedPath === topic.path}
                    onSelect={() => setSelectedPath(topic.path)}
                  />
                ))}

                {topics.length === 0 && (
                  <Typography variant="caption" sx={{ display: "block", px: 1, py: 1.5, color: editorial.softMuted }}>
                    No topics yet. Create one to group materials.
                  </Typography>
                )}
              </Paper>

              <Box sx={{ display: "flex", flexDirection: "column", gap: { xs: 2, md: 2.5 }, minWidth: 0 }}>
                <Paper sx={{ ...learningPanelSx, p: { xs: 1.75, md: 2.5 } }}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.5}
                    sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <FolderOutlined sx={{ color: editorial.pmwBlueDark }} />
                        <Typography variant="h6" sx={{ fontWeight: 900, color: editorial.ink }}>
                          {selectedPath ? selectedPath.replace(/\//g, " › ") : "All materials (root)"}
                        </Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 600, mt: 0.25 }}>
                        {folderMaterials.length} material{folderMaterials.length === 1 ? "" : "s"} stored directly here.
                      </Typography>
                    </Box>

                    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                      <Button
                        size="small"
                        startIcon={<CreateNewFolderOutlined />}
                        disabled={busy}
                        onClick={() => {
                          setFolderName("");
                          setFolderDialog({ mode: "create", path: selectedPath });
                        }}
                        sx={{ ...learningButtonSx, color: editorial.pmwBlueDark }}
                      >
                        {selectedPath ? "New subtopic" : "New topic"}
                      </Button>
                      {selectedTopic && (
                        <>
                          {/* The topic's own lock, in the same shape as the
                              per-material switch below: on asks for a password,
                              off removes one. Everything inside — subtopics
                              included — is hidden from the hub while it is on. */}
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                            <Tooltip
                              title={
                                selectedTopic.locked
                                  ? "Password protected — switch off to remove"
                                  : "Password protect this topic and everything in it"
                              }
                            >
                              <Switch
                                size="small"
                                color="warning"
                                checked={selectedTopic.locked}
                                disabled={busy}
                                onChange={(event) => handleToggleTopicLock(selectedTopic, event.target.checked)}
                                slotProps={{ input: { "aria-label": `Password protect ${selectedTopic.name}` } }}
                              />
                            </Tooltip>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: editorial.muted }}>
                              Password
                            </Typography>
                            {selectedTopic.locked && (
                              <Button
                                size="small"
                                startIcon={<LockOutlined />}
                                disabled={busy}
                                onClick={() => setPasswordTarget({ scope: "topic", topic: selectedTopic })}
                                sx={{ ...learningButtonSx, color: editorial.pmwBlueDark }}
                              >
                                Change
                              </Button>
                            )}
                          </Stack>
                          <Button
                            size="small"
                            startIcon={<DriveFileRenameOutline />}
                            disabled={busy}
                            onClick={() => {
                              setFolderName(selectedTopic.name);
                              setFolderDialog({ mode: "rename", path: selectedTopic.path });
                            }}
                            sx={{ ...learningButtonSx, color: editorial.pmwBlueDark }}
                          >
                            Rename
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            startIcon={<DeleteOutlined />}
                            disabled={busy}
                            onClick={() => handleDeleteFolder(selectedTopic)}
                            sx={learningButtonSx}
                          >
                            Delete topic
                          </Button>
                        </>
                      )}
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<CloudUploadOutlined />}
                        disabled={busy || !spToken}
                        onClick={() => fileInputRef.current?.click()}
                        sx={learningButtonSx}
                      >
                        Upload files
                      </Button>
                    </Stack>
                  </Stack>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    onChange={(event) => void handleFilesSelected(event.target.files)}
                  />

                  {upload && (
                    <Box sx={{ mt: 2 }}>
                      <Stack direction="row" sx={{ justifyContent: "space-between", mb: 0.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 800, color: editorial.ink }}>
                          Uploading {upload.index}/{upload.count}: {upload.fileName}
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 800, color: editorial.muted, fontVariantNumeric: "tabular-nums" }}>
                          {formatFileSize(upload.loaded)} / {formatFileSize(upload.total)}
                        </Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        value={upload.total > 0 ? Math.round((upload.loaded / upload.total) * 100) : 0}
                        sx={{ height: 6, borderRadius: 999 }}
                      />
                    </Box>
                  )}

                  <Alert severity="info" sx={{ mt: 2, borderRadius: "10px", fontWeight: 600 }}>
                    Uploaded files are view-only by default. Turn on Download for anything staff should be able to keep
                    a copy of, and the lock switch for anything that needs a password — a locked material shows no
                    thumbnail and no preview until the password is entered, every time. Files go straight from this
                    browser to SharePoint, so large videos are fine.
                  </Alert>
                </Paper>

                <Paper sx={{ ...learningPanelSx, p: { xs: 1.25, md: 2 } }}>
                  {loading ? (
                    <Stack sx={{ alignItems: "center", py: 6 }}>
                      <CircularProgress sx={{ color: editorial.pmwBlue }} />
                    </Stack>
                  ) : folderMaterials.length === 0 ? (
                    <Box sx={{ py: 5, textAlign: "center" }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800, color: editorial.ink }}>
                        No materials in this topic
                      </Typography>
                      <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 600, mt: 0.5 }}>
                        Upload PDFs, Word documents, images, or videos to publish them to the hub.
                      </Typography>
                    </Box>
                  ) : (
                    <Stack divider={<Divider />} spacing={0}>
                      {folderMaterials.map((material) => {
                        const style = kindStyle(material.kind);
                        return (
                          <Box
                            key={material.id}
                            sx={{
                              display: "grid",
                              gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) auto" },
                              gap: 1.5,
                              alignItems: "center",
                              py: 1.5,
                              px: { xs: 0.5, md: 1 },
                            }}
                          >
                            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
                              <Box
                                sx={{
                                  width: 44,
                                  height: 44,
                                  borderRadius: "10px",
                                  flexShrink: 0,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  backgroundColor: style.wash,
                                  color: style.color,
                                  backgroundImage: material.thumbnailUrl ? `url(${material.thumbnailUrl})` : "none",
                                  backgroundSize: "cover",
                                  backgroundPosition: "center",
                                }}
                              >
                                {!material.thumbnailUrl && style.icon}
                              </Box>
                              <Box sx={{ minWidth: 0 }}>
                                <Typography
                                  variant="subtitle2"
                                  sx={{
                                    fontWeight: 800,
                                    color: editorial.ink,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {material.title}
                                </Typography>
                                <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                                  <Chip
                                    size="small"
                                    label={style.label}
                                    sx={{
                                      height: 20,
                                      fontSize: "0.65rem",
                                      fontWeight: 800,
                                      color: style.color,
                                      backgroundColor: style.wash,
                                    }}
                                  />
                                  <Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 700 }}>
                                    {formatFileSize(material.sizeBytes)}
                                  </Typography>
                                  <Stack direction="row" spacing={0.4} sx={{ alignItems: "center", color: editorial.softMuted }}>
                                    <VisibilityOutlined sx={{ fontSize: 14 }} />
                                    <Typography variant="caption" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                                      {material.viewCount}
                                    </Typography>
                                  </Stack>
                                </Stack>
                              </Box>
                            </Stack>

                            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", justifySelf: { md: "end" } }}>
                              <Tooltip title={material.downloadable ? "Download allowed" : "View only"}>
                                <Switch
                                  size="small"
                                  checked={material.downloadable}
                                  disabled={busy}
                                  onChange={(event) => handleToggleDownloadable(material, event.target.checked)}
                                  slotProps={{ input: { "aria-label": `Allow download of ${material.title}` } }}
                                />
                              </Tooltip>
                              {/* Same control as the one beside it, because it is
                                  the same kind of decision: one switch per
                                  material, on or off, no menu to go hunting in.
                                  A material inside a locked topic shows the
                                  switch off and says where its lock comes from —
                                  there is no password here to turn off. */}
                              <Tooltip
                                title={
                                  material.lockOwn
                                    ? "Password protected — click to remove"
                                    : material.locked
                                      ? `Protected by the topic ${material.lockLabel}`
                                      : "Open to everyone signed in"
                                }
                              >
                                <Switch
                                  size="small"
                                  color="warning"
                                  checked={material.lockOwn}
                                  disabled={busy}
                                  onChange={(event) => handleToggleLock(material, event.target.checked)}
                                  slotProps={{ input: { "aria-label": `Password protect ${material.title}` } }}
                                />
                              </Tooltip>
                              <FormControl size="small" sx={{ minWidth: 132 }}>
                                <InputLabel id={`move-${material.id}`}>Move to</InputLabel>
                                <Select
                                  labelId={`move-${material.id}`}
                                  label="Move to"
                                  value=""
                                  disabled={busy}
                                  onChange={(event) => handleMoveMaterial(material, String(event.target.value))}
                                  sx={{ borderRadius: "8px" }}
                                >
                                  <MenuItem value="">Root</MenuItem>
                                  {topics
                                    .filter((topic) => topic.path !== material.folderPath)
                                    .map((topic) => (
                                      <MenuItem key={topic.path} value={topic.path}>
                                        {topic.path.replace(/\//g, " › ")}
                                      </MenuItem>
                                    ))}
                                </Select>
                              </FormControl>
                              <Tooltip title="Edit details">
                                <span>
                                  <IconButton size="small" disabled={busy} onClick={() => openEditor(material)}>
                                    <EditOutlined fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title="Delete material">
                                <span>
                                  <IconButton
                                    size="small"
                                    disabled={busy}
                                    onClick={() => handleDeleteMaterial(material)}
                                    sx={{ color: editorial.error }}
                                  >
                                    <DeleteOutlined fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </Stack>
                          </Box>
                        );
                      })}
                    </Stack>
                  )}
                </Paper>
              </Box>
            </Box>
          )}
        </Box>
      </Container>

      <Dialog open={Boolean(folderDialog)} onClose={() => setFolderDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 900 }}>
          {folderDialog?.mode === "rename" ? "Rename topic" : folderDialog?.path ? "New subtopic" : "New topic"}
        </DialogTitle>
        <DialogContent>
          {folderDialog?.mode === "create" && folderDialog.path && (
            <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 600, mb: 1.5 }}>
              Inside {folderDialog.path.replace(/\//g, " › ")}
            </Typography>
          )}
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Topic name"
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitFolderDialog();
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setFolderDialog(null)} sx={learningButtonSx}>
            Cancel
          </Button>
          <Button variant="contained" onClick={submitFolderDialog} disabled={!folderName.trim()} sx={learningButtonSx}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>Material details</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              fullWidth
              size="small"
              label="Display title"
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              helperText="Shown on the card instead of the file name."
            />
            <TextField
              fullWidth
              multiline
              minRows={3}
              size="small"
              label="Description"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Sort order"
              value={draft.sortOrder}
              onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })}
              helperText="Lower numbers appear first."
            />
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Switch
                checked={draft.downloadable}
                onChange={(event) => setDraft({ ...draft, downloadable: event.target.checked })}
                slotProps={{ input: { "aria-label": "Allow download" } }}
              />
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 800, color: editorial.ink }}>
                  Allow download
                </Typography>
                <Typography variant="caption" sx={{ color: editorial.muted, fontWeight: 600 }}>
                  Off means staff can open it in the viewer but get no download button.
                </Typography>
              </Box>
            </Stack>

            {/* Set and replace live here rather than on the row switch, which
                only knows on and off. Both act immediately — a password is not
                part of the draft above and is never saved with it. */}
            <Divider />
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 800, color: editorial.ink }}>
                  Password protection
                </Typography>
                <Typography variant="caption" sx={{ color: editorial.muted, fontWeight: 600 }}>
                  {editing?.lockOwn
                    ? "Protected. Staff enter this password every time they open it."
                    : editing?.locked
                      ? `Protected by the topic ${editing.lockLabel}.`
                      : "Open to everyone signed in."}
                </Typography>
              </Box>
              <Button
                size="small"
                startIcon={<LockOutlined />}
                disabled={busy}
                onClick={() => {
                  const material = editing;
                  if (!material) return;
                  setEditing(null);
                  setPasswordTarget({ scope: "material", material });
                }}
                sx={{ ...learningButtonSx, color: editorial.pmwBlueDark, flexShrink: 0 }}
              >
                {editing?.lockOwn ? "Change" : "Set"}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditing(null)} sx={learningButtonSx}>
            Cancel
          </Button>
          <Button variant="contained" onClick={saveEditor} sx={learningButtonSx}>
            Save changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Mounted only while open, so the typed password never outlives it. */}
      {passwordTarget && (
        <SetLockPasswordDialog
          scope={passwordTarget.scope}
          label={
            passwordTarget.scope === "material"
              ? passwordTarget.material.title
              : passwordTarget.topic.path.replace(/\//g, " › ")
          }
          replacing={
            passwordTarget.scope === "material" ? passwordTarget.material.lockOwn : passwordTarget.topic.locked
          }
          onSave={savePassword}
          onClose={() => setPasswordTarget(null)}
        />
      )}

      <Snackbar
        open={Boolean(feedback)}
        autoHideDuration={5000}
        onClose={() => setFeedback(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={feedback?.severity ?? "success"}
          onClose={() => setFeedback(null)}
          sx={{ borderRadius: "10px", fontWeight: 700 }}
        >
          {feedback?.message}
        </Alert>
      </Snackbar>

      {!identityToken && !loading && (
        <Box sx={{ px: 3, pb: 3 }}>
          <Alert severity="warning" sx={{ borderRadius: "10px", fontWeight: 700 }}>
            Microsoft 365 identity could not be confirmed, so material lists and view counts may be incomplete. Refresh
            the page to try again.
          </Alert>
        </Box>
      )}
    </Box>
  );
}

function TopicTreeButton({
  label,
  depth,
  count,
  selected,
  onSelect,
}: {
  label: string;
  depth: number;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onSelect}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        width: "100%",
        px: 1,
        py: 0.9,
        pl: 1 + depth * 1.5,
        cursor: "pointer",
        textAlign: "left",
        borderRadius: "8px",
        border: selected ? `1px solid ${editorial.pmwBlueSoft}` : "1px solid transparent",
        backgroundColor: selected ? editorial.blueWash : "transparent",
        color: selected ? editorial.pmwBlueDark : editorial.ink,
        transition: "background-color 0.16s ease",
        "&:hover": { backgroundColor: selected ? editorial.pmwBlueSoft : editorial.paperSoft },
        "&:focus-visible": { outline: `2px solid ${editorial.pmwBlue}`, outlineOffset: 1 },
      }}
    >
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
        {depth > 0 ? (
          <DriveFileMoveOutlined sx={{ fontSize: 16, color: "inherit", opacity: 0.7 }} />
        ) : (
          <FolderOutlined sx={{ fontSize: 16, color: "inherit", opacity: 0.7 }} />
        )}
        <Typography
          variant="body2"
          sx={{ fontWeight: selected ? 800 : 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {label}
        </Typography>
      </Stack>
      <Typography variant="caption" sx={{ fontWeight: 800, color: editorial.softMuted, fontVariantNumeric: "tabular-nums" }}>
        {count}
      </Typography>
    </Box>
  );
}

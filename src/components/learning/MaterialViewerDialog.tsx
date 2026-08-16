import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  ChevronLeftRounded,
  ChevronRightRounded,
  Close,
  DownloadOutlined,
  LockOutlined,
  LockPersonOutlined,
  VisibilityOffOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";
import { InputAdornment, TextField } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import {
  formatViewCount,
  isLearningLockedError,
  learningLockLabel,
  openLearningMaterial,
  recordLearningView,
  unlockLearningMaterial,
} from "../../utils/learningService";
import { kindStyle, learningButtonSx } from "./learningUi";
import type { LearningMaterial, LearningMaterialOpenResult } from "../../types";

/**
 * How long a video has to actually run before it counts as viewed. Opening a
 * player and closing it again is not watching, and the count is meant to mean
 * something to the people reading it.
 */
const VIDEO_VIEW_SECONDS = 5;

/**
 * How long anything else has to stay open before it counts. An image, a PDF and
 * SharePoint's embedded player give no playback signal, so time on screen is the
 * only evidence there is that someone actually looked.
 *
 * This is what keeps a view attached to the one material it belongs to. Holding
 * the arrow key through a folder of images used to bank a view on every one of
 * them on the way past; now a material has to be the one being looked at.
 */
const DWELL_VIEW_SECONDS = 4;

/**
 * The largest jump between two `timeupdate` events that still counts as
 * playback. Real playback advances a fraction of a second at a time; dragging
 * the scrubber to the end jumps by minutes, and skipping to the credits is not
 * watching the material.
 */
const MAX_PLAYBACK_STEP_SECONDS = 1.5;

interface MaterialViewerDialogProps {
  material: LearningMaterial | null;
  /** Same-kind neighbours the arrows step through — images in the same folder. */
  siblings: LearningMaterial[];
  accessToken: string;
  /**
   * Unlock passes for the topics this visit has opened. They travel with every
   * request because a material inside a locked topic is guarded by that topic's
   * password — having walked into the folder is what lets its files open.
   */
  topicPasses: string[];
  onClose: () => void;
  onNavigate: (material: LearningMaterial) => void;
  onViewRecorded: (materialId: string, viewCount: number) => void;
}

export default function MaterialViewerDialog({
  material,
  siblings,
  accessToken,
  topicPasses,
  onClose,
  onNavigate,
  onViewRecorded,
}: MaterialViewerDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [result, setResult] = useState<LearningMaterialOpenResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  /**
   * Set when the API refused this material for want of a password, and the
   * dialog shows the gate instead of a player. What the password *is* attached
   * to — this file, or a topic above it — is the server's decision; the label is
   * simply what it named.
   */
  const [lockLabel, setLockLabel] = useState("");
  /**
   * The pass earned by typing the password, tagged with the material it was
   * earned for. Deliberately not a plain string: tagging is what makes it expire
   * the moment the viewer moves on, and clearing it on close is what makes the
   * password get asked for again on the very next open.
   */
  const [materialPass, setMaterialPass] = useState<{ id: string; pass: string } | null>(null);
  const [password, setPassword] = useState("");
  const [passwordShown, setPasswordShown] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  /** Bumped to re-run the open after an unlock that issued no pass of its own. */
  const [retryKey, setRetryKey] = useState(0);
  /**
   * The material whose `<video>` refused to play, so the reload asks for
   * SharePoint's player instead. Holding the id rather than a flag means moving
   * to another material starts fresh without a reset.
   */
  const [embedFallbackId, setEmbedFallbackId] = useState("");
  const recordedRef = useRef<Set<string>>(new Set());
  const watchedSecondsRef = useRef(0);
  const lastPlaybackTimeRef = useRef(0);
  const materialId = material?.id ?? "";

  /** "" once the viewer moves to another material — a pass is never reused. */
  const activePass = materialPass?.id === materialId ? materialPass.pass : "";
  /** Everything this viewer can prove right now: the topic's, plus its own. */
  const activePasses = activePass ? [...topicPasses, activePass] : topicPasses;
  // A joined string rather than the array itself, so a parent re-render with an
  // equal-but-new array does not reload a video that is already playing.
  const topicPassKey = topicPasses.join("|");

  /**
   * Leaving a material throws its pass away — closing the viewer, or stepping to
   * the next image. That is the contract this feature is built on: nothing about
   * having unlocked something outlives looking at it, so coming back to it asks
   * for the password again.
   */
  const leaveMaterial = () => {
    setMaterialPass(null);
    setLockLabel("");
  };

  const handleClose = () => {
    leaveMaterial();
    onClose();
  };

  const handleNavigate = (next: LearningMaterial) => {
    leaveMaterial();
    onNavigate(next);
  };

  useEffect(() => {
    // Closing leaves the last result in place rather than clearing it: nothing
    // renders it while the dialog is shut, and the next open resets it anyway.
    if (!materialId || !material) return;

    let cancelled = false;
    let dwellTimer = 0;
    setLoading(true);
    setError("");
    setLockLabel("");
    setResult(null);
    watchedSecondsRef.current = 0;
    lastPlaybackTimeRef.current = 0;

    const isVideo = material.kind === "video";
    const title = material.title;
    const passes = activePasses;

    async function load() {
      try {
        const opened = await openLearningMaterial(
          materialId,
          accessToken,
          embedFallbackId === materialId,
          passes,
        );
        if (cancelled) return;
        setResult(opened);

        // A video counts on seconds actually played — see `handleTimeUpdate`.
        // Everything else has no such signal, so it counts on time on screen.
        if (!isVideo || opened.mode === "embed") {
          dwellTimer = window.setTimeout(
            () => void markViewed(materialId, passes),
            DWELL_VIEW_SECONDS * 1000,
          );
        }
      } catch (err) {
        if (cancelled) return;
        // Being asked for a password is the feature working, not a failure, so
        // it renders as a gate rather than as a red error box.
        if (isLearningLockedError(err)) {
          setLockLabel(learningLockLabel(err) || title);
          setPassword("");
          setUnlockError("");
          return;
        }
        setError(err instanceof Error ? err.message : "This material could not be opened.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      // Moving to the next material, or closing the dialog, cancels the pending
      // view. Passing through is not viewing.
      window.clearTimeout(dwellTimer);
    };
  }, [materialId, accessToken, embedFallbackId, activePass, topicPassKey, retryKey]);

  /**
   * Trades the typed password for a pass, which re-runs the load effect above.
   * The material is named, never the lock: the server decides whether it is this
   * file's own password or the one on the topic holding it.
   */
  async function handleUnlock() {
    if (!password || unlocking || !materialId) return;
    setUnlocking(true);
    setUnlockError("");
    try {
      const { pass } = await unlockLearningMaterial(materialId, password, accessToken);
      setPassword("");
      setMaterialPass(pass ? { id: materialId, pass } : null);
      setLockLabel("");
      // An `alreadyOpen` answer carries no pass — the lock was lifted while the
      // prompt was on screen — so nothing in the load effect's inputs would have
      // changed and the material would sit there refusing to open.
      setRetryKey((key) => key + 1);
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "That password could not be checked.");
    } finally {
      setUnlocking(false);
    }
  }

  // `passes` travels here too: the API records a view on a locked material only
  // for a caller who got through its password, so a row in the named access log
  // means what it says.
  async function markViewed(id: string, passes: string[]) {
    if (!id || recordedRef.current.has(id)) return;
    recordedRef.current.add(id);
    try {
      const viewCount = await recordLearningView(id, accessToken, passes);
      onViewRecorded(id, viewCount);
    } catch {
      // A lost view count must never interrupt the person watching. Allow the
      // next open to try again.
      recordedRef.current.delete(id);
    }
  }

  const handleTimeUpdate = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const position = event.currentTarget.currentTime;
    const step = position - lastPlaybackTimeRef.current;
    lastPlaybackTimeRef.current = position;

    // Seeks are jumps, forwards or back, and neither one is time spent watching.
    if (step > 0 && step <= MAX_PLAYBACK_STEP_SECONDS) {
      watchedSecondsRef.current += step;
    }
    if (watchedSecondsRef.current >= VIDEO_VIEW_SECONDS) void markViewed(materialId, activePasses);
  };

  async function handleDownload() {
    const url = result?.downloadUrl;
    if (!url || !material) return;

    setDownloading(true);
    try {
      // Fetching to a blob keeps the download inside the page. SharePoint's
      // pre-authenticated URL may refuse the cross-origin read, in which case
      // handing it to the browser directly is the honest fallback.
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = material.fileName;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  }

  const siblingIndex = material ? siblings.findIndex((item) => item.id === material.id) : -1;
  const hasSiblings = siblingIndex >= 0 && siblings.length > 1;
  const previousSibling = hasSiblings
    ? siblings[(siblingIndex - 1 + siblings.length) % siblings.length]
    : null;
  const nextSibling = hasSiblings ? siblings[(siblingIndex + 1) % siblings.length] : null;
  const style = material ? kindStyle(material.kind) : null;

  // Not a security boundary — anyone determined can reach the bytes a browser is
  // playing. It removes the obvious paths (right-click → save, the player's own
  // download button) so "view only" is what the interface actually offers.
  const preventContextMenu = (event: React.MouseEvent) => {
    if (!material?.downloadable) event.preventDefault();
  };

  return (
    <Dialog
      open={Boolean(material)}
      onClose={handleClose}
      fullScreen={fullScreen}
      maxWidth="lg"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: fullScreen ? 0 : "14px",
            overflow: "hidden",
            backgroundColor: editorial.white,
            maxHeight: fullScreen ? "100%" : "92vh",
          },
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: { xs: 2, md: 3 },
          py: { xs: 1.5, md: 2 },
          borderBottom: editorialHairline,
          backgroundColor: editorial.paperSoft,
        }}
      >
        {style && (
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: style.wash,
              color: style.color,
              flexShrink: 0,
              "& .MuiSvgIcon-root": { fontSize: 22 },
            }}
          >
            {style.icon}
          </Box>
        )}
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 900,
              color: editorial.ink,
              lineHeight: 1.25,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {material?.title}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 0.25, flexWrap: "wrap" }}>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", color: editorial.softMuted }}>
              <VisibilityOutlined sx={{ fontSize: 15 }} />
              <Typography variant="caption" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                {formatViewCount(material?.viewCount ?? 0)}
              </Typography>
            </Stack>
            {material && !material.downloadable && (
              <Chip
                size="small"
                icon={<LockOutlined sx={{ fontSize: 14 }} />}
                label="View only"
                sx={{
                  height: 22,
                  fontWeight: 800,
                  fontSize: "0.66rem",
                  color: editorial.muted,
                  backgroundColor: editorial.paper,
                  border: editorialHairline,
                  "& .MuiChip-icon": { color: editorial.muted },
                }}
              />
            )}
          </Stack>
        </Box>

        {material?.downloadable && result?.downloadUrl && (
          <Button
            size="small"
            variant="outlined"
            startIcon={downloading ? <CircularProgress size={14} color="inherit" /> : <DownloadOutlined />}
            onClick={handleDownload}
            disabled={downloading}
            sx={{ ...learningButtonSx, display: { xs: "none", sm: "inline-flex" } }}
          >
            Download
          </Button>
        )}

        <IconButton onClick={handleClose} aria-label="Close viewer" sx={{ color: editorial.muted, flexShrink: 0 }}>
          <Close />
        </IconButton>
      </Box>

      <Box
        onContextMenu={preventContextMenu}
        sx={{
          position: "relative",
          flexGrow: 1,
          minHeight: { xs: "60vh", md: 520 },
          // The ink backdrop belongs to a picture or a player. While the gate is
          // up there is neither, and dark-on-dark would swallow the prompt.
          backgroundColor:
            !lockLabel && (material?.kind === "video" || material?.kind === "image")
              ? editorial.ink
              : editorial.paper,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {loading && <CircularProgress sx={{ color: editorial.pmwBlue }} />}

        {!loading && error && (
          <Alert severity="error" sx={{ m: 3, borderRadius: "10px", fontWeight: 700 }}>
            {error}
          </Alert>
        )}

        {/* The gate. It replaces the player rather than covering it, because
            there is nothing underneath to cover: the API sent no URL. */}
        {!loading && !error && lockLabel && (
          <Box sx={{ px: 3, py: 5, maxWidth: 380, width: "100%", textAlign: "center" }}>
            <Box
              sx={{
                width: 56,
                height: 56,
                mx: "auto",
                mb: 2,
                borderRadius: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: editorial.blueWash,
                color: editorial.pmwBlueDark,
                "& .MuiSvgIcon-root": { fontSize: 28 },
              }}
            >
              <LockPersonOutlined />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 900, color: editorial.ink, textWrap: "balance" }}>
              Password required
            </Typography>
            <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 600, mt: 0.75 }}>
              {lockLabel} is protected. The password is needed every time it is opened.
            </Typography>

            {unlockError && (
              <Alert severity="error" sx={{ mt: 2, borderRadius: "10px", fontWeight: 700, textAlign: "left" }}>
                {unlockError}
              </Alert>
            )}

            <TextField
              autoFocus
              fullWidth
              size="small"
              type={passwordShown ? "text" : "password"}
              label="Password"
              value={password}
              disabled={unlocking}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleUnlock();
              }}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        edge="end"
                        onClick={() => setPasswordShown((shown) => !shown)}
                        aria-label={passwordShown ? "Hide password" : "Show password"}
                      >
                        {passwordShown ? (
                          <VisibilityOffOutlined fontSize="small" />
                        ) : (
                          <VisibilityOutlined fontSize="small" />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
                htmlInput: { autoComplete: "off" },
              }}
              sx={{ mt: 2.5, backgroundColor: editorial.white, borderRadius: "10px" }}
            />

            <Button
              fullWidth
              variant="contained"
              onClick={() => void handleUnlock()}
              disabled={!password || unlocking}
              startIcon={unlocking ? <CircularProgress size={14} color="inherit" /> : <LockOutlined />}
              sx={{ ...learningButtonSx, mt: 1.5 }}
            >
              Unlock
            </Button>
          </Box>
        )}

        {!loading && !error && !lockLabel && result && material && (
          <>
            {result.mode === "media" && material.kind === "image" && (
              <Box
                component="img"
                src={result.url}
                alt={material.title}
                draggable={false}
                sx={{
                  maxWidth: "100%",
                  maxHeight: fullScreen ? "70vh" : "78vh",
                  objectFit: "contain",
                  userSelect: "none",
                }}
              />
            )}

            {result.mode === "media" && material.kind === "video" && (
              <Box
                component="video"
                src={result.url}
                controls
                autoPlay
                playsInline
                controlsList={material.downloadable ? undefined : "nodownload noplaybackrate"}
                disablePictureInPicture={!material.downloadable}
                onTimeUpdate={handleTimeUpdate}
                // Nothing here distinguishes "wrong codec" from "blocked
                // source" — either way this browser is not going to play the
                // file, and SharePoint's own player is the answer to both.
                onError={() => setEmbedFallbackId(material.id)}
                sx={{
                  width: "100%",
                  maxHeight: fullScreen ? "70vh" : "78vh",
                  backgroundColor: editorial.black,
                }}
              />
            )}

            {result.mode === "embed" && (
              <Box
                component="iframe"
                src={result.url}
                title={material.title}
                referrerPolicy="no-referrer"
                sx={{
                  width: "100%",
                  height: fullScreen ? "78vh" : "78vh",
                  border: "none",
                  backgroundColor: editorial.white,
                }}
              />
            )}

            {hasSiblings && (
              <>
                <IconButton
                  onClick={() => previousSibling && handleNavigate(previousSibling)}
                  aria-label="Previous item"
                  sx={viewerArrowSx("left")}
                >
                  <ChevronLeftRounded />
                </IconButton>
                <IconButton
                  onClick={() => nextSibling && handleNavigate(nextSibling)}
                  aria-label="Next item"
                  sx={viewerArrowSx("right")}
                >
                  <ChevronRightRounded />
                </IconButton>
              </>
            )}
          </>
        )}
      </Box>

      {material?.description && (
        <Box sx={{ px: { xs: 2, md: 3 }, py: 1.75, borderTop: editorialHairline, backgroundColor: editorial.paperSoft }}>
          <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 600, textWrap: "pretty" }}>
            {material.description}
          </Typography>
        </Box>
      )}
    </Dialog>
  );
}

function viewerArrowSx(side: "left" | "right") {
  return {
    position: "absolute",
    top: "50%",
    [side]: 12,
    transform: "translateY(-50%)",
    width: 44,
    height: 44,
    color: editorial.ink,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    border: editorialHairline,
    "&:hover": { backgroundColor: editorial.white },
  } as const;
}

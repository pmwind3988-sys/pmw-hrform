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
  VisibilityOutlined,
} from "@mui/icons-material";
import { editorial, editorialHairline } from "../../theme/editorial";
import {
  formatViewCount,
  openLearningMaterial,
  recordLearningView,
} from "../../utils/learningService";
import { kindStyle, learningButtonSx } from "./learningUi";
import type { LearningMaterial, LearningMaterialOpenResult } from "../../types";

/**
 * How long a video has to actually run before it counts as viewed. Opening a
 * player and closing it again is not watching, and the count is meant to mean
 * something to the people reading it.
 */
const VIDEO_VIEW_SECONDS = 5;

interface MaterialViewerDialogProps {
  material: LearningMaterial | null;
  /** Same-kind neighbours the arrows step through — images in the same folder. */
  siblings: LearningMaterial[];
  accessToken: string;
  onClose: () => void;
  onNavigate: (material: LearningMaterial) => void;
  onViewRecorded: (materialId: string, viewCount: number) => void;
}

export default function MaterialViewerDialog({
  material,
  siblings,
  accessToken,
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
   * The material whose `<video>` refused to play, so the reload asks for
   * SharePoint's player instead. Holding the id rather than a flag means moving
   * to another material starts fresh without a reset.
   */
  const [embedFallbackId, setEmbedFallbackId] = useState("");
  const recordedRef = useRef<Set<string>>(new Set());
  const watchedSecondsRef = useRef(0);
  const materialId = material?.id ?? "";

  useEffect(() => {
    // Closing leaves the last result in place rather than clearing it: nothing
    // renders it while the dialog is shut, and the next open resets it anyway.
    if (!materialId || !material) return;

    let cancelled = false;
    setLoading(true);
    setError("");
    setResult(null);
    watchedSecondsRef.current = 0;

    const isVideo = material.kind === "video";

    async function load() {
      try {
        const opened = await openLearningMaterial(
          materialId,
          accessToken,
          embedFallbackId === materialId,
        );
        if (cancelled) return;
        setResult(opened);

        // A document or an image is on screen the moment it opens, so that is
        // the view. A video has only started buffering — see the timer below.
        // An embedded player gives us no timer at all, so opening has to count.
        if (!isVideo || opened.mode === "embed") void markViewed();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "This material could not be opened.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [materialId, accessToken, embedFallbackId]);

  async function markViewed() {
    if (!materialId || recordedRef.current.has(materialId)) return;
    recordedRef.current.add(materialId);
    try {
      const viewCount = await recordLearningView(materialId, accessToken);
      onViewRecorded(materialId, viewCount);
    } catch {
      // A lost view count must never interrupt the person watching. Allow the
      // next open to try again.
      recordedRef.current.delete(materialId);
    }
  }

  const handleTimeUpdate = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    watchedSecondsRef.current = event.currentTarget.currentTime;
    if (watchedSecondsRef.current >= VIDEO_VIEW_SECONDS) void markViewed();
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
      onClose={onClose}
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

        <IconButton onClick={onClose} aria-label="Close viewer" sx={{ color: editorial.muted, flexShrink: 0 }}>
          <Close />
        </IconButton>
      </Box>

      <Box
        onContextMenu={preventContextMenu}
        sx={{
          position: "relative",
          flexGrow: 1,
          minHeight: { xs: "60vh", md: 520 },
          backgroundColor: material?.kind === "video" || material?.kind === "image" ? editorial.ink : editorial.paper,
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

        {!loading && !error && result && material && (
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
                  onClick={() => previousSibling && onNavigate(previousSibling)}
                  aria-label="Previous item"
                  sx={viewerArrowSx("left")}
                >
                  <ChevronLeftRounded />
                </IconButton>
                <IconButton
                  onClick={() => nextSibling && onNavigate(nextSibling)}
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

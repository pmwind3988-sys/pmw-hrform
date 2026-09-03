import { useEffect, useRef, useState } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import {
  CheckCircle,
  LockOutlined,
  PlayArrowRounded,
  VisibilityOutlined,
} from "@mui/icons-material";
import { editorial, editorialHairline, editorialShadow, editorialShadowHover } from "../../theme/editorial";
import { formatFileSize, formatViewCount } from "../../utils/learningService";
import { kindStyle, learningReduceMotionSx } from "./learningUi";
import type { LearningMaterial } from "../../types";

/** How much of a video the card plays before looping back. */
const PREVIEW_SECONDS = 8;
/** A pointer passing over a card on its way somewhere else must not start a download. */
const PREVIEW_START_DELAY_MS = 260;
const SLIDESHOW_INTERVAL_MS = 1800;

function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setPrefersReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return prefersReduced;
}

interface MaterialCardProps {
  material: LearningMaterial;
  /**
   * Every image sitting in the same folder, this one first. An image card
   * cross-fades through them on hover, which is the only way a still picture
   * can preview more than itself.
   */
  slideshowUrls?: string[];
  showFolderPath?: boolean;
  onOpen: (material: LearningMaterial) => void;
}

export default function MaterialCard({
  material,
  slideshowUrls = [],
  showFolderPath = false,
  onOpen,
}: MaterialCardProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [previewing, setPreviewing] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const previewTimerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const style = kindStyle(material.kind);

  const canPreviewVideo = material.kind === "video" && Boolean(material.mediaUrl) && !prefersReducedMotion;
  const slides = material.kind === "image" ? slideshowUrls.filter(Boolean) : [];
  const canRunSlideshow = slides.length > 1 && !prefersReducedMotion;

  const clearPreviewTimer = () => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  };

  useEffect(() => clearPreviewTimer, []);

  useEffect(() => {
    if (!previewing || !canRunSlideshow) return;

    const interval = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % slides.length);
    }, SLIDESHOW_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [previewing, canRunSlideshow, slides.length]);

  const startPreview = () => {
    if (!canPreviewVideo && !canRunSlideshow) return;
    clearPreviewTimer();
    previewTimerRef.current = window.setTimeout(() => setPreviewing(true), PREVIEW_START_DELAY_MS);
  };

  const stopPreview = () => {
    clearPreviewTimer();
    setPreviewing(false);
    setSlideIndex(0);
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
  };

  // The clip restarts rather than running the whole file: a preview is a taste
  // of the material, and a card quietly streaming a 40-minute video is not.
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (video && video.currentTime >= PREVIEW_SECONDS) {
      video.currentTime = 0;
    }
  };

  const stillImage = slides[0] || material.thumbnailUrl;
  const activeSlide = previewing && canRunSlideshow ? slides[slideIndex] : stillImage;

  return (
    <Box
      component="button"
      type="button"
      onClick={() => onOpen(material)}
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
      onFocus={startPreview}
      onBlur={stopPreview}
      aria-label={material.locked ? `Unlock ${material.title}` : `Open ${material.title}`}
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        p: 0,
        textAlign: "left",
        cursor: "pointer",
        borderRadius: "12px",
        overflow: "hidden",
        border: editorialHairline,
        backgroundColor: editorial.white,
        boxShadow: editorialShadow,
        transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
        "&:hover": {
          transform: "translateY(-3px)",
          boxShadow: editorialShadowHover,
          borderColor: editorial.pmwBlueSoft,
        },
        "&:focus-visible": {
          outline: `3px solid ${editorial.pmwBlueSoft}`,
          outlineOffset: 2,
        },
        ...learningReduceMotionSx,
      }}
    >
      <Box
        sx={{
          position: "relative",
          width: "100%",
          aspectRatio: "16 / 9",
          overflow: "hidden",
          backgroundColor: editorial.paperSoft,
          backgroundImage: `linear-gradient(135deg, ${style.wash} 0%, ${editorial.white} 100%)`,
        }}
      >
        {activeSlide ? (
          <Box
            component="img"
            src={activeSlide}
            alt=""
            loading="lazy"
            sx={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transition: "opacity 0.45s ease",
              ...learningReduceMotionSx,
            }}
          />
        ) : (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: material.locked ? editorial.pmwBlueDark : style.color,
              opacity: 0.65,
              "& .MuiSvgIcon-root": { fontSize: 48 },
            }}
          >
            {/* Nothing to show, by design: the server withholds the thumbnail
                for a material whose password has not been given, so a locked
                card cannot preview even a frame of what it is holding. */}
            {material.locked ? <LockOutlined /> : style.icon}
          </Box>
        )}

        {canPreviewVideo && previewing && (
          <Box
            component="video"
            ref={videoRef}
            src={material.mediaUrl}
            muted
            autoPlay
            loop
            playsInline
            preload="none"
            disablePictureInPicture
            onTimeUpdate={handleTimeUpdate}
            sx={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              backgroundColor: editorial.ink,
            }}
          />
        )}

        {material.kind === "video" && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              opacity: previewing ? 0 : 1,
              transition: "opacity 0.25s ease",
              ...learningReduceMotionSx,
            }}
          >
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(16, 16, 16, 0.58)",
                color: editorial.white,
                boxShadow: "0 6px 18px rgba(16, 16, 16, 0.28)",
              }}
            >
              <PlayArrowRounded sx={{ fontSize: 32 }} />
            </Box>
          </Box>
        )}

        <Chip
          size="small"
          label={style.label}
          sx={{
            position: "absolute",
            top: 10,
            left: 10,
            height: 24,
            fontWeight: 700,
            fontSize: "0.72rem",
            color: style.color,
            backgroundColor: "rgba(255, 255, 255, 0.94)",
            border: `1px solid ${style.wash}`,
          }}
        />

        {material.locked && (
          <Box
            sx={{
              position: "absolute",
              top: 10,
              right: 10,
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 0.9,
              py: 0.35,
              borderRadius: "999px",
              backgroundColor: "rgba(255, 255, 255, 0.94)",
              border: `1px solid ${editorial.pmwBlueSoft}`,
              color: editorial.pmwBlueDark,
            }}
          >
            <LockOutlined sx={{ fontSize: 14 }} />
            <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1 }}>
              Locked
            </Typography>
          </Box>
        )}

        {material.viewedByMe && !material.locked && (
          <Box
            sx={{
              position: "absolute",
              top: 10,
              right: 10,
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 0.9,
              py: 0.35,
              borderRadius: "999px",
              backgroundColor: "rgba(255, 255, 255, 0.94)",
              border: `1px solid rgba(16, 124, 16, 0.28)`,
              color: editorial.success,
            }}
          >
            <CheckCircle sx={{ fontSize: 14 }} />
            <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1 }}>
              Viewed
            </Typography>
          </Box>
        )}
      </Box>

      <Box sx={{ p: 1.75, display: "flex", flexDirection: "column", gap: 0.75, flexGrow: 1, minWidth: 0 }}>
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 700,
            color: editorial.ink,
            lineHeight: 1.3,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textWrap: "pretty",
          }}
        >
          {material.title}
        </Typography>

        {material.description && (
          <Typography
            variant="body2"
            sx={{
              color: editorial.muted,
              fontWeight: 600,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {material.description}
          </Typography>
        )}

        {showFolderPath && material.folderPath && (
          <Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 700 }}>
            {material.folderPath.replace(/\//g, " › ")}
          </Typography>
        )}

        <Stack
          direction="row"
          spacing={1.25}
          sx={{ mt: "auto", pt: 0.5, alignItems: "center", color: editorial.softMuted }}
        >
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <VisibilityOutlined sx={{ fontSize: 15 }} />
            <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {formatViewCount(material.viewCount)}
            </Typography>
          </Stack>
          {material.sizeBytes > 0 && (
            <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {formatFileSize(material.sizeBytes)}
            </Typography>
          )}
        </Stack>
      </Box>
    </Box>
  );
}

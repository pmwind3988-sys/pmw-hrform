import { useEffect, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { FolderOutlined, LayersOutlined, LockOutlined, PlayLessonOutlined } from "@mui/icons-material";
import { editorial, editorialHairline, editorialShadow, editorialShadowHover } from "../../theme/editorial";
import { learningReduceMotionSx } from "./learningUi";
import type { LearningTopic } from "../../types";

const COVER_INTERVAL_MS = 2200;

interface TopicCardProps {
  topic: LearningTopic;
  onOpen: (topic: LearningTopic) => void;
}

/**
 * A topic is a folder, so its cover is whatever is inside it: the thumbnails of
 * its own materials, cycling while the pointer rests on the card.
 */
export default function TopicCard({ topic, onOpen }: TopicCardProps) {
  const [hovering, setHovering] = useState(false);
  const [coverIndex, setCoverIndex] = useState(0);
  const covers = topic.coverThumbnails.filter(Boolean);
  /** Protected *and* still shut — a topic already opened stays badged, not barred. */
  const needsPassword = topic.locked && !topic.unlocked;

  useEffect(() => {
    if (!hovering || covers.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const interval = window.setInterval(() => {
      setCoverIndex((current) => (current + 1) % covers.length);
    }, COVER_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [hovering, covers.length]);

  const activeCover = covers[hovering ? coverIndex : 0];

  return (
    <Box
      component="button"
      type="button"
      onClick={() => onOpen(topic)}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => {
        setHovering(false);
        setCoverIndex(0);
      }}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
      aria-label={needsPassword ? `Unlock topic ${topic.name}` : `Open topic ${topic.name}`}
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        width: "100%",
        minHeight: 168,
        p: 2,
        textAlign: "left",
        cursor: "pointer",
        overflow: "hidden",
        borderRadius: "12px",
        border: editorialHairline,
        boxShadow: editorialShadow,
        color: editorial.white,
        backgroundColor: editorial.pmwBlueDark,
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        "&:hover": { transform: "translateY(-3px)", boxShadow: editorialShadowHover },
        "&:focus-visible": { outline: `3px solid ${editorial.pmwBlueSoft}`, outlineOffset: 2 },
        ...learningReduceMotionSx,
      }}
    >
      {activeCover && (
        <Box
          component="img"
          src={activeCover}
          alt=""
          loading="lazy"
          sx={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transition: "opacity 0.5s ease",
            ...learningReduceMotionSx,
          }}
        />
      )}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background: activeCover
            ? "linear-gradient(180deg, rgba(16,16,16,0.12) 0%, rgba(16,16,16,0.78) 100%)"
            : `linear-gradient(135deg, ${editorial.pmwBlue} 0%, ${editorial.pmwPurple} 100%)`,
        }}
      />

      {/* A locked topic has no cover to cycle — the server sends none — so the
          badge is the only thing that says why the card looks bare. It stays on
          after the password is given, because "this topic is protected" is worth
          knowing even once you are inside. */}
      {topic.locked && (
        <Stack
          direction="row"
          spacing={0.5}
          sx={{
            position: "absolute",
            top: 12,
            right: 12,
            alignItems: "center",
            px: 0.9,
            py: 0.4,
            borderRadius: "999px",
            backgroundColor: "rgba(255, 255, 255, 0.94)",
            color: needsPassword ? editorial.pmwBlueDark : editorial.success,
          }}
        >
          <LockOutlined sx={{ fontSize: 14 }} />
          <Typography variant="caption" sx={{ fontWeight: 800, lineHeight: 1 }}>
            {needsPassword ? "Locked" : "Unlocked"}
          </Typography>
        </Stack>
      )}

      <Box sx={{ position: "relative", minWidth: 0 }}>
        {needsPassword ? (
          <LockOutlined sx={{ fontSize: 22, opacity: 0.9, mb: 0.5 }} />
        ) : (
          <FolderOutlined sx={{ fontSize: 22, opacity: 0.9, mb: 0.5 }} />
        )}
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 900,
            lineHeight: 1.25,
            textWrap: "pretty",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {topic.name}
        </Typography>
        {topic.description && (
          <Typography
            variant="caption"
            sx={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              opacity: 0.86,
              fontWeight: 600,
              mt: 0.25,
            }}
          >
            {topic.description}
          </Typography>
        )}
        <Stack direction="row" spacing={1.5} sx={{ mt: 1, alignItems: "center", opacity: 0.92 }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <PlayLessonOutlined sx={{ fontSize: 15 }} />
            <Typography variant="caption" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {topic.totalMaterialCount} item{topic.totalMaterialCount === 1 ? "" : "s"}
            </Typography>
          </Stack>
          {topic.subtopicCount > 0 && (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <LayersOutlined sx={{ fontSize: 15 }} />
              <Typography variant="caption" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                {topic.subtopicCount} subtopic{topic.subtopicCount === 1 ? "" : "s"}
              </Typography>
            </Stack>
          )}
        </Stack>
      </Box>
    </Box>
  );
}

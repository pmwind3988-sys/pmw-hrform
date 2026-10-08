import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import { FolderOutlined, LockOutlined } from "@mui/icons-material";
import { editorial, si, siType } from "../../theme/editorial";
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
  const itemCount = `${topic.totalMaterialCount} item${topic.totalMaterialCount === 1 ? "" : "s"}`;
  const subtopicCount = topic.subtopicCount > 0 ? ` · ${topic.subtopicCount} subtopic${topic.subtopicCount === 1 ? "" : "s"}` : "";

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
        display: "flex",
        flexDirection: "column",
        width: "100%",
        p: 0,
        textAlign: "left",
        cursor: "pointer",
        overflow: "hidden",
        border: "none",
        borderRadius: `${si.radius}px`,
        boxShadow: si.shadow,
        color: editorial.ink,
        backgroundColor: editorial.panel,
        transition: "background-color 0.15s ease",
        "&:hover": { backgroundColor: editorial.blueSoft },
        "&:focus-visible": { outline: `2px solid ${editorial.navy}`, outlineOffset: 2 },
        ...learningReduceMotionSx,
      }}
    >
      {/* A locked topic has no cover to cycle -- the server sends none -- so
          the lock icon and the words beneath the name are what say why the
          card looks plain. */}
      {activeCover && (
        <Box
          component="img"
          src={activeCover}
          alt=""
          loading="lazy"
          sx={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", display: "block" }}
        />
      )}

      <Box sx={{ p: 2, display: "flex", alignItems: "flex-start", gap: 1.5, minWidth: 0, width: "100%" }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: needsPassword ? editorial.skySoft : editorial.blueWash,
            color: needsPassword ? editorial.muted : editorial.navy,
          }}
        >
          {needsPassword ? <LockOutlined fontSize="small" /> : <FolderOutlined fontSize="small" />}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              ...siType.cardTitle,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textWrap: "pretty",
            }}
          >
            {topic.name}
          </Typography>
          {topic.description && !needsPassword && (
            <Typography
              sx={{
                ...siType.subtext,
                color: editorial.muted,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {topic.description}
            </Typography>
          )}
          <Typography sx={{ ...siType.subtext, color: editorial.muted, mt: 0.25 }}>
            {needsPassword ? "Password required" : `${itemCount}${subtopicCount}`}
            {topic.locked && !needsPassword && " · Unlocked"}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

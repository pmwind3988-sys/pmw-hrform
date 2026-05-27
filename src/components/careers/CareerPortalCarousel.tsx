import { useEffect, useRef, useState } from "react";
import { Box, Chip, Skeleton, Typography } from "@mui/material";
import type { CareerPortalCard } from "../../types";

const DEFAULT_CARD_COLORS = {
  start: "#BFDDF4",
  end: "#F7F5EF",
  accent: "#FFF546",
};
const DEFAULT_CARD_IMAGE_OPACITY = 0.72;

const DEFAULT_PORTAL_CARDS: CareerPortalCard[] = [
  {
    id: "system-default-1",
    title: "Grow into your next role",
    description: "Browse internal openings, compare fit, and move forward with confidence.",
    imageUrl: "",
    imageSource: "",
    imageOpacity: DEFAULT_CARD_IMAGE_OPACITY,
    sortOrder: 1,
    status: "Active",
    targetType: "none",
    targetValue: "",
    colorStart: "#BFDDF4",
    colorEnd: "#F7F5EF",
    colorAccent: "#FFF546",
    isSystemDefault: true,
    locked: true,
    source: "system",
    created: "",
  },
  {
    id: "system-default-2",
    title: "Your progress stays visible",
    description: "Keep every submitted application easy to find while HR reviews your next step.",
    imageUrl: "",
    imageSource: "",
    imageOpacity: DEFAULT_CARD_IMAGE_OPACITY,
    sortOrder: 2,
    status: "Active",
    targetType: "none",
    targetValue: "",
    colorStart: "#F7F5EF",
    colorEnd: "#DCECF8",
    colorAccent: "#FFF546",
    isSystemDefault: true,
    locked: true,
    source: "system",
    created: "",
  },
  {
    id: "system-default-3",
    title: "Built for PMW talent",
    description: "Internal advancement opportunities are gathered here for quick, focused browsing.",
    imageUrl: "",
    imageSource: "",
    imageOpacity: DEFAULT_CARD_IMAGE_OPACITY,
    sortOrder: 3,
    status: "Active",
    targetType: "none",
    targetValue: "",
    colorStart: "#EAF5FC",
    colorEnd: "#BFDDF4",
    colorAccent: "#FFF546",
    isSystemDefault: true,
    locked: true,
    source: "system",
    created: "",
  },
];

const reduceMotionSx = {
  "@media (prefers-reduced-motion: reduce)": {
    animation: "none",
    transition: "none",
    transform: "none",
    "&:hover": {
      transform: "none",
    },
    "&:active": {
      transform: "none",
    },
  },
};

function safeColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function cardGradient(card: CareerPortalCard): string {
  return `linear-gradient(135deg, ${safeColor(card.colorStart, DEFAULT_CARD_COLORS.start)} 0%, ${safeColor(card.colorEnd, DEFAULT_CARD_COLORS.end)} 58%, ${safeColor(card.colorAccent, DEFAULT_CARD_COLORS.accent)} 100%)`;
}

function cardImageOpacity(value: number | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_CARD_IMAGE_OPACITY;
  return Math.min(1, Math.max(0, parsed));
}

interface CareerPortalCarouselProps {
  cards: CareerPortalCard[];
  onCardTarget: (card: CareerPortalCard) => void;
  loading?: boolean;
}

export default function CareerPortalCarousel({
  cards,
  onCardTarget,
  loading = false,
}: CareerPortalCarouselProps) {
  const activeCards = cards.length > 0 ? cards : DEFAULT_PORTAL_CARDS;
  const [activeIndex, setActiveIndex] = useState(0);
  const swipeRef = useRef({ startX: 0, startY: 0, deltaX: 0, deltaY: 0, swiped: false });
  const boundedActiveIndex = Math.min(activeIndex, activeCards.length - 1);

  useEffect(() => {
    setActiveIndex(0);
  }, [activeCards.length]);

  useEffect(() => {
    if (activeCards.length <= 1) return undefined;
    const intervalId = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % activeCards.length);
    }, 4400);
    return () => window.clearInterval(intervalId);
  }, [activeCards.length]);

  const showAdjacentCard = (direction: number) => {
    setActiveIndex((current) => (current + direction + activeCards.length) % activeCards.length);
  };

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: { xs: 250, md: 280 },
          borderRadius: "8px",
          overflow: "hidden",
          border: "1px solid rgba(17, 24, 39, 0.08)",
          boxShadow: "0 12px 26px rgba(17, 24, 39, 0.08)",
        }}
      >
        <Skeleton variant="rounded" width="100%" height="100%" sx={{ minHeight: { xs: 250, md: 280 }, borderRadius: "8px" }} />
      </Box>
    );
  }

  return (
    <Box
      onTouchStart={(event) => {
        if (activeCards.length <= 1) return;
        const touch = event.touches[0];
        swipeRef.current = { startX: touch.clientX, startY: touch.clientY, deltaX: 0, deltaY: 0, swiped: false };
      }}
      onTouchMove={(event) => {
        if (activeCards.length <= 1) return;
        const touch = event.touches[0];
        swipeRef.current.deltaX = touch.clientX - swipeRef.current.startX;
        swipeRef.current.deltaY = touch.clientY - swipeRef.current.startY;
      }}
      onTouchEnd={() => {
        if (activeCards.length <= 1) return;
        const { deltaX, deltaY } = swipeRef.current;
        if (Math.abs(deltaX) > 44 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
          swipeRef.current.swiped = true;
          showAdjacentCard(deltaX < 0 ? 1 : -1);
          window.setTimeout(() => {
            swipeRef.current.swiped = false;
          }, 0);
        }
      }}
      sx={{
        position: "relative",
        minHeight: { xs: 250, md: 280 },
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid rgba(17, 24, 39, 0.08)",
        background: "linear-gradient(135deg, #EEF6FF 0%, #F4F3FF 56%, #EAF7EF 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75), 0 12px 26px rgba(17, 24, 39, 0.08)",
        touchAction: "pan-y",
        ...reduceMotionSx,
      }}
      aria-label="Career portal highlights"
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          width: `${activeCards.length * 100}%`,
          transform: `translateX(-${boundedActiveIndex * (100 / activeCards.length)}%)`,
          transition: "transform 0.62s cubic-bezier(0.22, 1, 0.36, 1)",
          "@media (prefers-reduced-motion: reduce)": {
            transition: "none",
          },
        }}
      >
        {activeCards.map((card, index) => {
          const showFallback = !card.imageUrl;
          const canOpen = card.targetType !== "none" && Boolean(card.targetValue.trim());
          return (
            <Box
              key={card.id || `${card.title}-${index}`}
              sx={{
                flex: `0 0 ${100 / activeCards.length}%`,
                minWidth: 0,
                p: { xs: 1.5, sm: 1.75 },
                boxSizing: "border-box",
              }}
            >
              <Box
                role={canOpen ? "button" : undefined}
                tabIndex={canOpen ? 0 : undefined}
                onClick={canOpen ? () => {
                  if (swipeRef.current.swiped) return;
                  onCardTarget(card);
                } : undefined}
                onKeyDown={(event) => {
                  if (!canOpen) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onCardTarget(card);
                  }
                }}
                sx={{
                  position: "relative",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  borderRadius: "8px",
                  overflow: "hidden",
                  backgroundColor: "#111827",
                  boxShadow: "0 14px 32px rgba(17, 24, 39, 0.18)",
                  cursor: canOpen ? "pointer" : "default",
                  outline: "none",
                  transition: "transform 0.18s ease, box-shadow 0.18s ease",
                  "&:hover": canOpen ? {
                    transform: "translateY(-2px)",
                    boxShadow: "0 18px 36px rgba(17, 24, 39, 0.22)",
                  } : undefined,
                  "&:focus-visible": {
                    boxShadow: "0 0 0 3px rgba(0, 120, 212, 0.35), 0 18px 36px rgba(17, 24, 39, 0.22)",
                  },
                  ...reduceMotionSx,
                }}
              >
                {showFallback ? (
                  <Box
                    sx={{
                      position: "absolute",
                      inset: 0,
                      background: cardGradient(card),
                    }}
                  />
                ) : (
                  <Box
                    component="img"
                    src={card.imageUrl}
                    alt=""
                    sx={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      opacity: cardImageOpacity(card.imageOpacity),
                      filter: "saturate(1.02)",
                    }}
                  />
                )}
                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(180deg, rgba(17,24,39,0.05) 0%, rgba(17,24,39,0.62) 58%, rgba(17,24,39,0.86) 100%)",
                  }}
                />
                <Box sx={{ position: "relative", p: { xs: 2, sm: 2.5 }, pb: { xs: 4.75, sm: 5 } }}>
                  <Chip
                    label={canOpen ? "Tap to open" : "Portal highlight"}
                    size="small"
                    sx={{
                      mb: 1,
                      width: "fit-content",
                      borderRadius: "8px",
                      backgroundColor: "rgba(255,255,255,0.88)",
                      color: "#005A9E",
                      fontWeight: 800,
                      fontSize: "0.68rem",
                    }}
                  />
                  <Typography
                    variant="h6"
                    sx={{
                      color: "#ffffff",
                      fontWeight: 800,
                      fontSize: { xs: "1.05rem", sm: "1.18rem" },
                      lineHeight: 1.24,
                      mb: 0.65,
                    }}
                  >
                    {card.title}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: "rgba(255,255,255,0.86)",
                      fontWeight: 500,
                      lineHeight: 1.5,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {card.description}
                  </Typography>
                </Box>
                {card.imageUrl && card.imageSource && (
                  <Typography
                    variant="caption"
                    sx={{
                      position: "absolute",
                      right: 14,
                      bottom: 12,
                      zIndex: 2,
                      maxWidth: "45%",
                      color: "rgba(255,255,255,0.78)",
                      fontSize: "0.62rem",
                      lineHeight: 1.2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {card.imageSource}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box
        sx={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: { xs: 18, sm: 20 },
          zIndex: 2,
          display: "flex",
          justifyContent: "center",
          gap: 0.75,
          pointerEvents: "auto",
        }}
      >
        {activeCards.map((card, index) => {
          const selected = boundedActiveIndex === index;
          return (
            <Box
              key={`dot-${card.id || index}`}
              component="button"
              type="button"
              aria-label={`Show highlight ${index + 1}`}
              aria-current={selected ? "true" : undefined}
              onClick={() => setActiveIndex(index)}
              sx={{
                width: selected ? 18 : 6,
                height: 6,
                p: 0,
                border: 0,
                borderRadius: 999,
                cursor: "pointer",
                backgroundColor: selected ? "#ffffff" : "rgba(255,255,255,0.52)",
                boxShadow: selected ? "0 0 0 1px rgba(255,255,255,0.38), 0 2px 8px rgba(0,0,0,0.18)" : "none",
                transition: "width 0.2s ease, background-color 0.2s ease, transform 0.2s ease",
                "&:hover": {
                  transform: "translateY(-1px)",
                  backgroundColor: "#ffffff",
                },
                "&:focus-visible": {
                  outline: "2px solid #ffffff",
                  outlineOffset: 3,
                },
                ...reduceMotionSx,
              }}
            />
          );
        })}
      </Box>
    </Box>
  );
}

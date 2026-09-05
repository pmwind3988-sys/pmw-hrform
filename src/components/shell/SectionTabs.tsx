import { useCallback, useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";
import { ChevronLeft, ChevronRight } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { editorial, si, siType } from "../../theme/editorial";
import type { NavTab } from "../../config/navigation";
import { NAV_ICONS } from "./navIcons";

interface SectionTabsProps {
  tabs: NavTab[];
  activePath: string | null;
}

/**
 * The strip of sub-sections under the top bar, one per tab in the current
 * category.
 *
 * Scrolls horizontally with the scrollbar hidden (`.no-scrollbar`), because the
 * Admin category carries eight tabs and that is wider than any phone. The
 * alternative — wrapping to a second row — moves the page content down by
 * 40-odd pixels on exactly one category, which reads as the layout shifting
 * rather than as a menu being long.
 *
 * The active tab is marked with a 2px navy underline rather than a filled pill:
 * the strip sits directly on the white bar above the canvas, and five filled
 * pills in a row compete with the page's own cards for attention.
 *
 * Hiding the scrollbar removed the only sign that the strip scrolls at all, so
 * a tab past the edge simply did not exist as far as the reader was concerned.
 * The chevrons put that sign back: they appear only on the side that actually
 * has more, which makes them an answer to "is there more?" rather than
 * permanent furniture.
 */
export default function SectionTabs({ tabs, activePath }: SectionTabsProps) {
  const navigate = useNavigate();
  const stripRef = useRef<HTMLElement | null>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    // A pixel of slack: sub-pixel layout leaves scrollLeft a hair short of the
    // end, which would otherwise show a chevron pointing at nothing.
    const max = el.scrollWidth - el.clientWidth;
    setOverflow({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
  }, []);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    // Rotating a phone, or a category with more tabs, changes the answer.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure, tabs]);

  const scrollBy = (direction: 1 | -1) => {
    const el = stripRef.current;
    if (!el) return;
    // Most of a screenful, so a press always lands on a tab boundary-ish place
    // rather than leaving a sliver of the one you were reading.
    el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.75), behavior: "smooth" });
  };

  // One tab is not a choice. A strip that offers no alternative is furniture.
  if (tabs.length < 2) return null;

  const arrowSx = (side: "left" | "right") => ({
    position: "absolute" as const,
    [side]: 0,
    top: 0,
    bottom: 0,
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: side === "left" ? "flex-start" : "flex-end",
    width: 40,
    border: "none",
    cursor: "pointer",
    color: editorial.navy,
    px: 0.25,
    // Fades the strip out under the chevron so a half-cut label reads as
    // continuing rather than as clipped.
    background: `linear-gradient(to ${side === "left" ? "right" : "left"}, ${editorial.panel} 55%, transparent 100%)`,
    "&:focus-visible": { outline: `2px solid ${editorial.navy}`, outlineOffset: "-2px" },
  });

  return (
    <Box sx={{ position: "relative", borderTop: `1px solid ${editorial.border}`, backgroundColor: editorial.panel }}>
      {overflow.left && (
        <Box
          component="button"
          type="button"
          aria-label="Scroll sections left"
          onClick={() => scrollBy(-1)}
          sx={arrowSx("left")}
        >
          <ChevronLeft sx={{ fontSize: 22 }} />
        </Box>
      )}
      {overflow.right && (
        <Box
          component="button"
          type="button"
          aria-label="Scroll sections right"
          onClick={() => scrollBy(1)}
          sx={arrowSx("right")}
        >
          <ChevronRight sx={{ fontSize: 22 }} />
        </Box>
      )}

    <Box
      component="nav"
      aria-label="Section"
      className="no-scrollbar"
      ref={stripRef}
      sx={{
        display: "flex",
        alignItems: "stretch",
        gap: 0.5,
        px: { xs: 1.5, lg: 3 },
        overflowX: "auto",
        // Momentum scrolling inside the strip on touch devices.
        WebkitOverflowScrolling: "touch",
        // The border and ground moved to the positioned wrapper, so the
        // chevrons sit on the same surface as the strip rather than over a gap.
        scrollBehavior: "smooth",
        "@media (prefers-reduced-motion: reduce)": { scrollBehavior: "auto" },
      }}
    >
      {tabs.map((tab) => {
        const Icon = NAV_ICONS[tab.icon];
        const isActive = tab.path === activePath;
        return (
          <Box
            key={tab.path}
            component="button"
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => navigate(tab.path)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              flexShrink: 0,
              border: "none",
              background: "none",
              cursor: "pointer",
              px: 1.5,
              // 44px tall, which is the touch floor and also the height the
              // underline needs to sit clear of the text.
              minHeight: si.touchTarget,
              ...siType.cardTitle,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? editorial.navy : editorial.muted,
              whiteSpace: "nowrap",
              // Drawn as a border rather than a pseudo-element so it occupies
              // layout space on every tab, active or not: an underline that
              // appears only when active would shift the labels by 2px.
              borderBottom: `2px solid ${isActive ? editorial.navy : "transparent"}`,
              "&:hover": {
                color: editorial.navy,
                backgroundColor: isActive ? "transparent" : editorial.skySoft,
              },
              "&:focus-visible": {
                outline: `2px solid ${editorial.navy}`,
                outlineOffset: "-2px",
              },
            }}
          >
            <Icon sx={{ fontSize: 17 }} />
            {tab.label}
          </Box>
        );
      })}
    </Box>
    </Box>
  );
}

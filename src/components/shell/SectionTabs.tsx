import { Box } from "@mui/material";
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
 */
export default function SectionTabs({ tabs, activePath }: SectionTabsProps) {
  const navigate = useNavigate();

  // One tab is not a choice. A strip that offers no alternative is furniture.
  if (tabs.length < 2) return null;

  return (
    <Box
      component="nav"
      aria-label="Section"
      className="no-scrollbar"
      sx={{
        display: "flex",
        alignItems: "stretch",
        gap: 0.5,
        px: { xs: 1.5, lg: 3 },
        overflowX: "auto",
        // Momentum scrolling inside the strip on touch devices.
        WebkitOverflowScrolling: "touch",
        borderTop: `1px solid ${editorial.border}`,
        backgroundColor: editorial.panel,
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
  );
}

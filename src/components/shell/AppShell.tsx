import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { LogoutOutlined, SwapHorizOutlined } from "@mui/icons-material";
import { useLocation, useNavigate } from "react-router-dom";
import Logo from "../Logo";
import SectionTabs from "./SectionTabs";
import { NAV_ICONS } from "./navIcons";
import { editorial, si, siType } from "../../theme/editorial";
import {
  categoryLandingPath,
  resolveNavLocation,
  visibleCategories,
  type NavCategory,
  type NavPermissions,
} from "../../config/navigation";

export interface AppShellProps extends NavPermissions {
  userName: string;
  userEmail: string;
  /** "Administrator", "Form Builder", or both — whatever the account holds. */
  roleLabel: string;
  onSignOut: () => void;
  onSwitchAccount: () => void;
  children: React.ReactNode;
}

const BREAKPOINT = `@media (min-width: ${si.shellBreakpoint}px)`;
const MOBILE_ONLY = `@media (max-width: ${si.shellBreakpoint - 1}px)`;

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

/**
 * The application frame: a navy sidebar on desktop, a navy bottom bar on
 * phones, a white top bar carrying the current category's tab strip, and the
 * canvas beneath.
 *
 * TWO LAYOUTS FROM ONE TREE, switched at 1024px in CSS rather than with a
 * JavaScript width check — so there is no frame of the wrong layout on first
 * paint, and no resize listener to keep in sync.
 *
 *   >= 1024px  the categories are a sticky 224px column on the left
 *   <  1024px  the same categories are a fixed row along the bottom
 *
 * WHY A BOTTOM BAR AND NOT A DRAWER. A drawer costs two taps to change section
 * (open, then choose) and hides where you are while it is open. On a phone the
 * five categories fit a single row at the 44px touch floor, so the menu can
 * simply always be there. The cost is the 60px it occupies permanently, which
 * is why `main` carries matching bottom padding — without it the last row of a
 * submissions list sits underneath the bar and reads as the list being cut off.
 */
export default function AppShell({
  userName,
  userEmail,
  roleLabel,
  isAdmin,
  canUseFormBuilder,
  onSignOut,
  onSwitchAccount,
  children,
}: AppShellProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const permissions = useMemo<NavPermissions>(
    () => ({ isAdmin, canUseFormBuilder }),
    [isAdmin, canUseFormBuilder],
  );
  const categories = useMemo(() => visibleCategories(permissions), [permissions]);
  const { categoryKey, tabPath } = useMemo(() => resolveNavLocation(pathname), [pathname]);

  const activeCategory = categories.find((category) => category.key === categoryKey) ?? null;
  const homePath = isAdmin ? "/admin/dashboard" : "/user/dashboard";

  const go = (category: NavCategory) => navigate(categoryLandingPath(category, permissions));

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        // The canvas. `--app-bg` is still honoured so the background picker
        // keeps working; the flat canvas is only the fallback.
        background: `var(--app-bg, ${editorial.paper})`,
      }}
    >
      {/* Straight past the navigation to the content. Every page begins with a
          dozen nav stops; this is the one control that helps everyone on a
          keyboard, and it stays invisible until focused. */}
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: "absolute",
          left: -9999,
          top: 0,
          zIndex: 100,
          "&:focus": {
            left: 12,
            top: 12,
            px: 2,
            py: 1,
            borderRadius: `${si.radiusSm}px`,
            backgroundColor: editorial.navy,
            color: editorial.white,
            ...siType.cardTitle,
            textDecoration: "none",
          },
        }}
      >
        Skip to main content
      </Box>

      {/* ---------------- Desktop sidebar ---------------- */}
      <Box
        component="aside"
        aria-label="Main navigation"
        className="si-navy"
        sx={{
          display: "none",
          [BREAKPOINT]: {
            display: "flex",
            position: "sticky",
            top: 0,
            height: "100dvh",
            width: si.sidebarWidth,
            flexShrink: 0,
            flexDirection: "column",
            overflowY: "auto",
            p: 2,
          },
        }}
      >
        <Box
          component="button"
          type="button"
          onClick={() => navigate(homePath)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            mb: 3,
            px: 1,
            border: "none",
            background: "none",
            cursor: "pointer",
            textAlign: "left",
            "&:focus-visible": { outline: `2px solid ${editorial.white}`, outlineOffset: "2px" },
          }}
          aria-label="PMW HR Forms — dashboard"
        >
          {/* On a white tile. The PMW mark is a dark navy oval, so directly on
              the navy sidebar it was very nearly invisible -- the same reason
              SI gives its own mark a white plate in the equivalent spot. */}
          <Logo
            size={22}
            sx={{
              flexShrink: 0,
              p: 0.5,
              boxSizing: "content-box",
              borderRadius: `${si.radiusSm}px`,
              backgroundColor: editorial.white,
            }}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ ...siType.cardTitle, fontWeight: 800, color: editorial.white, lineHeight: 1 }}>
              PMW
            </Typography>
            <Typography
              sx={{
                mt: 0.25,
                fontSize: "0.5625rem",
                lineHeight: 1,
                letterSpacing: "0.06em",
                color: editorial.navyDim,
              }}
            >
              HR FORMS
            </Typography>
          </Box>
        </Box>

        <Box component="nav" sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {categories.map((category) => {
            const Icon = NAV_ICONS[category.icon];
            const isActive = category.key === categoryKey;
            return (
              <Box
                key={category.key}
                component="button"
                type="button"
                onClick={() => go(category)}
                aria-current={isActive ? "page" : undefined}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  width: "100%",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  px: 1.25,
                  py: 1,
                  minHeight: 40,
                  borderRadius: `${si.radiusSm}px`,
                  ...siType.cardTitle,
                  backgroundColor: isActive ? editorial.navyMid : "transparent",
                  color: isActive ? editorial.white : editorial.navyDim,
                  "&:hover": {
                    backgroundColor: isActive ? editorial.navyMid : "rgba(30, 79, 160, 0.4)",
                    color: editorial.white,
                  },
                  "&:focus-visible": {
                    outline: `2px solid ${editorial.white}`,
                    outlineOffset: "-2px",
                  },
                }}
              >
                <Icon sx={{ fontSize: 18 }} />
                {category.label}
              </Box>
            );
          })}
        </Box>

        {/* Identity, pinned to the bottom. */}
        <Box sx={{ mt: "auto", pt: 1.5, borderTop: `1px solid ${editorial.navyLine}` }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1.25 }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                flexShrink: 0,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: editorial.accent,
                color: editorial.navyDeep,
                fontSize: "0.78rem",
                fontWeight: 700,
              }}
            >
              {initialsOf(userName || userEmail)}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                noWrap
                sx={{ fontSize: "0.78rem", fontWeight: 600, color: editorial.white }}
                title={userEmail}
              >
                {userName || userEmail}
              </Typography>
              {roleLabel && (
                <Typography noWrap sx={{ fontSize: "0.66rem", color: editorial.navyDim }}>
                  {roleLabel}
                </Typography>
              )}
            </Box>
          </Box>
          {[
            { label: "Switch account", icon: SwapHorizOutlined, onClick: onSwitchAccount },
            { label: "Sign out", icon: LogoutOutlined, onClick: onSignOut },
          ].map((action) => (
            <Box
              key={action.label}
              component="button"
              type="button"
              onClick={action.onClick}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                width: "100%",
                border: "none",
                background: "none",
                cursor: "pointer",
                textAlign: "left",
                px: 1.25,
                py: 1,
                minHeight: 38,
                borderRadius: `${si.radiusSm}px`,
                fontSize: "0.78rem",
                color: editorial.navyDim,
                "&:hover": { backgroundColor: "rgba(30, 79, 160, 0.4)", color: editorial.white },
                "&:focus-visible": { outline: `2px solid ${editorial.white}`, outlineOffset: "-2px" },
              }}
            >
              <action.icon sx={{ fontSize: 15 }} />
              {action.label}
            </Box>
          ))}
        </Box>
      </Box>

      {/* ---------------- Main column ---------------- */}
      <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <Box
          component="header"
          sx={{
            position: "sticky",
            top: 0,
            zIndex: 30,
            backgroundColor: editorial.panel,
            borderBottom: `1px solid ${editorial.border}`,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: { xs: 1.5, lg: 3 },
              minHeight: si.topBarHeight,
            }}
          >
            {/* The sidebar's brand mark is off-screen on a phone, so the bar
                carries one of its own. Desktop already has it in the sidebar,
                so it would be the same mark twice. */}
            <Box
              component="button"
              type="button"
              onClick={() => navigate(homePath)}
              aria-label="PMW HR Forms — dashboard"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                border: "none",
                background: "none",
                cursor: "pointer",
                p: 0,
                [BREAKPOINT]: { display: "none" },
              }}
            >
              <Logo size={26} sx={{ borderRadius: 1 }} />
            </Box>

            <Typography component="h1" sx={{ ...siType.pageTitle, minWidth: 0 }} noWrap>
              {activeCategory?.label ?? "PMW HR Forms"}
            </Typography>
          </Box>

          {activeCategory && <SectionTabs tabs={activeCategory.tabs} activePath={tabPath} />}
        </Box>

        {/* Keyed on the path so the entrance animation replays on navigation
            rather than only on first mount — which is the point of it: on a
            phone it is the only cue that the content changed. */}
        <Box
          component="main"
          id="main-content"
          tabIndex={-1}
          key={pathname}
          className="rise"
          sx={{
            flex: 1,
            minWidth: 0,
            p: { xs: 2, lg: 3 },
            "&:focus": { outline: "none" },
            // Clear of the bottom bar, plus the gesture pill beneath it.
            [MOBILE_ONLY]: {
              pb: `calc(${si.bottomBarHeight}px + 1.5rem + env(safe-area-inset-bottom))`,
            },
          }}
        >
          {children}
        </Box>
      </Box>

      {/* ---------------- Phone bottom bar ---------------- */}
      <Box
        component="nav"
        aria-label="Main navigation"
        className="si-navy"
        sx={{
          display: "flex",
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          pb: "env(safe-area-inset-bottom)",
          borderTop: `1px solid ${editorial.navyLine}`,
          [BREAKPOINT]: { display: "none" },
        }}
      >
        {categories.map((category) => {
          const Icon = NAV_ICONS[category.icon];
          const isActive = category.key === categoryKey;
          return (
            <Box
              key={category.key}
              component="button"
              type="button"
              onClick={() => go(category)}
              aria-current={isActive ? "page" : undefined}
              sx={{
                flex: 1,
                minWidth: 0,
                minHeight: si.bottomBarHeight,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.25,
                border: "none",
                background: "none",
                cursor: "pointer",
                px: 0.5,
                color: isActive ? editorial.white : editorial.navyDim,
                "&:focus-visible": { outline: `2px solid ${editorial.white}`, outlineOffset: "-3px" },
              }}
            >
              {/* The active marker is a bar above the icon rather than a filled
                  background: a filled cell in a five-cell row on a 360px screen
                  leaves the label no contrast headroom. */}
              <Box
                aria-hidden
                sx={{
                  width: 18,
                  height: 2,
                  borderRadius: 1,
                  backgroundColor: isActive ? editorial.accent : "transparent",
                }}
              />
              <Icon sx={{ fontSize: 20 }} />
              <Typography
                noWrap
                sx={{
                  fontSize: "0.625rem",
                  fontWeight: isActive ? 700 : 500,
                  maxWidth: "100%",
                }}
              >
                {category.shortLabel}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

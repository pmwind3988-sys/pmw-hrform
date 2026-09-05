import { useMemo, useState } from "react";
import { Box, Divider, ListItemIcon, Menu, MenuItem, Typography } from "@mui/material";
import { LogoutOutlined, SwapHorizOutlined } from "@mui/icons-material";
import { useLocation, useNavigate } from "react-router-dom";
import Logo from "../Logo";
import SectionTabs from "./SectionTabs";
import { NAV_ICONS } from "./navIcons";
import { editorial, si, siType } from "../../theme/editorial";
import { useDashboardBackground } from "../../hooks/useDashboardBackground";
import { InShellContext } from "./ShellContext";
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
 * The application frame: a white top bar carrying the brand, the section title,
 * the account menu and the current category's tabs, over the canvas, with one
 * navy bar of category buttons pinned to the bottom.
 *
 * ONE NAVIGATION, AT EVERY WIDTH. This began as the usual pair — a sidebar on
 * desktop, a bottom bar on phones — which meant two things to build, two to
 * keep in step, and a layout that rearranged itself at 1024px. The bottom bar
 * won because it is the one that works everywhere: five categories fit a single
 * row from 360px up, it is always one tap or click from the content, and it
 * costs a fixed 60px rather than a permanent 224px column.
 *
 * What the sidebar used to carry has moved rather than gone. The brand mark and
 * the account block — name, roles, Switch account, Sign out — are in the top
 * bar now, the account behind a menu so it costs one button rather than a
 * standing panel.
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
  const [accountMenu, setAccountMenu] = useState<HTMLElement | null>(null);

  /**
   * Applies the tenant's chosen dashboard background, for its side effect only.
   *
   * This has to run somewhere that mounts on EVERY signed-in screen, and the
   * shell is the only such place. It used to run in `dashboard/Header.tsx`,
   * which the landing dashboard rendered — so deleting that Header in favour of
   * this shell quietly reduced a tenant-wide setting to "applies only while
   * Profile > Appearance is open". Caught against the live site, where the
   * setting is a full-opacity photograph an administrator chose in June and the
   * app was rendering the flat fallback instead.
   *
   * `AppearancePage` keeps its own instance for the editing UI. That costs one
   * extra GET when someone opens that page, and saving from there calls
   * `applyDashboardBackground` itself, so this copy going stale cannot leave the
   * wrong background on screen.
   */
  useDashboardBackground(isAdmin);

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
    <InShellContext.Provider value>
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        // The canvas. `--app-bg` is still honoured so the background picker
        // keeps working; the flat canvas is only the fallback.
        background: `var(--app-bg, ${editorial.paper})`,
      }}
    >
      {/* Straight past the navigation to the content. This is the one control
          that helps everyone on a keyboard, and it stays invisible until
          focused. */}
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

      {/* ---------------- Top bar ---------------- */}
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
              flexShrink: 0,
              "&:focus-visible": { outline: `2px solid ${editorial.navy}`, outlineOffset: "2px" },
            }}
          >
            <Logo size={26} sx={{ borderRadius: 1 }} />
          </Box>

          <Typography component="h1" sx={{ ...siType.pageTitle, minWidth: 0 }} noWrap>
            {activeCategory?.label ?? "PMW HR Forms"}
          </Typography>

          {/* The account block the sidebar used to hold, as one button. The
              name is hidden on a narrow screen where the section title needs
              the room; the avatar always identifies who is signed in. */}
          <Box
            component="button"
            type="button"
            onClick={(event) => setAccountMenu(event.currentTarget)}
            aria-label={`Account: ${userName || userEmail}`}
            aria-haspopup="menu"
            aria-expanded={Boolean(accountMenu)}
            sx={{
              ml: "auto",
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexShrink: 0,
              border: "none",
              background: "none",
              cursor: "pointer",
              px: 0.5,
              py: 0.5,
              minHeight: si.touchTarget,
              borderRadius: `${si.radiusSm}px`,
              "&:hover": { backgroundColor: editorial.appSurface },
              "&:focus-visible": { outline: `2px solid ${editorial.navy}`, outlineOffset: "2px" },
            }}
          >
            <Box
              sx={{
                width: 30,
                height: 30,
                flexShrink: 0,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: editorial.navy,
                color: editorial.white,
                fontSize: "0.72rem",
                fontWeight: 700,
              }}
            >
              {initialsOf(userName || userEmail)}
            </Box>
            <Box sx={{ minWidth: 0, textAlign: "left", display: { xs: "none", md: "block" } }}>
              <Typography
                noWrap
                sx={{ fontSize: "0.78rem", fontWeight: 600, color: editorial.ink, maxWidth: 180 }}
              >
                {userName || userEmail}
              </Typography>
              {roleLabel && (
                <Typography noWrap sx={{ fontSize: "0.66rem", color: editorial.muted, maxWidth: 180 }}>
                  {roleLabel}
                </Typography>
              )}
            </Box>
          </Box>

          <Menu
            anchorEl={accountMenu}
            open={Boolean(accountMenu)}
            onClose={() => setAccountMenu(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            slotProps={{
              paper: {
                sx: {
                  mt: 0.5,
                  minWidth: 230,
                  borderRadius: `${si.radius}px`,
                  boxShadow: si.shadowRaised,
                },
              },
            }}
          >
            {/* Not a MenuItem: it is a label, and a menu whose first entry is
                focusable but does nothing is a keyboard dead end. */}
            <Box sx={{ px: 2, py: 1.25 }}>
              <Typography sx={{ ...siType.cardTitle, color: editorial.ink }} noWrap>
                {userName || userEmail}
              </Typography>
              <Typography sx={{ ...siType.subtext, color: editorial.muted }} noWrap>
                {userEmail}
              </Typography>
              {roleLabel && (
                <Typography sx={{ ...siType.subtext, color: editorial.muted }} noWrap>
                  {roleLabel}
                </Typography>
              )}
            </Box>
            <Divider />
            <MenuItem
              onClick={() => {
                setAccountMenu(null);
                onSwitchAccount();
              }}
              sx={{ ...siType.body, minHeight: si.touchTarget }}
            >
              <ListItemIcon>
                <SwapHorizOutlined sx={{ fontSize: 18, color: editorial.muted }} />
              </ListItemIcon>
              Switch account
            </MenuItem>
            <MenuItem
              onClick={() => {
                setAccountMenu(null);
                onSignOut();
              }}
              sx={{ ...siType.body, minHeight: si.touchTarget }}
            >
              <ListItemIcon>
                <LogoutOutlined sx={{ fontSize: 18, color: editorial.muted }} />
              </ListItemIcon>
              Sign out
            </MenuItem>
          </Menu>
        </Box>

        {activeCategory && <SectionTabs tabs={activeCategory.tabs} activePath={tabPath} />}
      </Box>

      {/* Keyed on the path so the entrance animation replays on navigation
          rather than only on first mount — which is the point of it: it marks
          that the content changed. */}
      <Box
        component="main"
        id="main-content"
        tabIndex={-1}
        key={pathname}
        className="rise"
        sx={{
          flex: 1,
          minWidth: 0,
          // Sides and top only. A responsive `p` shorthand emits its padding
          // inside a media query, which then outranks the plain padding-bottom
          // below and silently reinstates 24px — putting the last row back
          // under the bar.
          px: { xs: 2, lg: 3 },
          pt: { xs: 2, lg: 3 },
          "&:focus": { outline: "none" },
          // Clear of the bottom bar, plus the gesture pill beneath it.
          pb: `calc(${si.bottomBarHeight}px + 1.5rem + env(safe-area-inset-bottom))`,
        }}
      >
        {children}
      </Box>

      {/* ---------------- Bottom bar ---------------- */}
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
                "&:hover": { color: editorial.white },
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
                sx={{ fontSize: "0.625rem", fontWeight: isActive ? 700 : 500, maxWidth: "100%" }}
              >
                {category.shortLabel}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
    </InShellContext.Provider>
  );
}

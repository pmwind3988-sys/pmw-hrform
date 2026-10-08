import { useState } from "react";
import { Box, Divider, ListItemIcon, Menu, MenuItem, Typography } from "@mui/material";
import { AddRounded, LogoutOutlined, SwapHorizOutlined } from "@mui/icons-material";
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

/** Wide screens get the floating panel; everything narrower gets the two bars. */
const WIDE = `@media (min-width: ${si.shellBreakpoint}px)`;
const NARROW = `@media (max-width: ${si.shellBreakpoint - 0.02}px)`;

/** A soft navy tint for hover on white — the same "you can press this" cue everywhere. */
const HOVER_TINT = "rgba(15, 61, 145, 0.06)";

/**
 * The application frame.
 *
 * TWO LAYOUTS, ONE MAP. Both read `navigation.ts`, so they cannot disagree
 * about what exists or who may see it; they differ only in where it is drawn.
 *
 * - Wide (>= `si.shellBreakpoint`): a floating white panel on the left holding
 *   the brand, a "Start a form" button, the five sections, the current
 *   section's pages nested under it, and the account at the foot. The page
 *   title sits on the canvas beside it. There is deliberately no top bar: on a
 *   desktop the panel is always in reach, and a second band of chrome above the
 *   content is the thing that made every screen read as boxes inside boxes.
 * - Narrow: a white top bar (brand, page title, account, page chips) and the
 *   navy bottom bar of sections, where a thumb can reach them.
 *
 * The bottom bar used to be the only navigation at every width. On a 1440px
 * monitor that put every section change at the far bottom of the screen behind
 * 10px labels, so the panel came back for wide screens.
 *
 * Switched in CSS rather than `useMediaQuery`, so the first paint already has
 * the right layout and nothing jumps once JavaScript measures the window.
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
  const [accountMenu, setAccountMenu] = useState<{ el: HTMLElement; fromPanel: boolean } | null>(null);

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

  const permissions: NavPermissions = { isAdmin, canUseFormBuilder };
  const categories = visibleCategories(permissions);
  const { categoryKey, tabPath } = resolveNavLocation(pathname);

  const activeCategory = categories.find((category) => category.key === categoryKey) ?? null;
  const activeTab = activeCategory?.tabs.find((tab) => tab.path === tabPath) ?? null;
  const homePath = isAdmin ? "/admin/dashboard" : "/user/dashboard";
  // The page's own name when it has one ("My Submissions"), the section's when
  // it is the section ("Dashboard"). The section is already marked in the
  // navigation; repeating it as the title told you nothing about the page.
  const pageTitle = activeTab?.label ?? activeCategory?.label ?? "PMW HR Forms";

  const go = (category: NavCategory) => navigate(categoryLandingPath(category, permissions));
  const displayName = userName || userEmail;
  const initials = initialsOf(displayName);

  const avatar = (size: number) => (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: editorial.navy,
        color: editorial.white,
        fontSize: size >= 36 ? "0.8125rem" : "0.75rem",
        fontWeight: 700,
      }}
    >
      {initials}
    </Box>
  );

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
        [WIDE]: { flexDirection: "row", alignItems: "flex-start" },
      }}
    >
      {/* Straight past the navigation to the content. This is the one control
          that helps everyone on a keyboard, and it stays invisible until
          focused. Fixed, so it surfaces above the sticky chrome rather than
          underneath it. */}
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: "fixed",
          left: -9999,
          top: 0,
          zIndex: 100,
          "&:focus": {
            left: 12,
            top: 12,
            px: 2,
            py: 1,
            borderRadius: `${si.radiusPill}px`,
            backgroundColor: editorial.navy,
            color: editorial.white,
            ...siType.cardTitle,
            textDecoration: "none",
          },
        }}
      >
        Skip to main content
      </Box>

      {/* ---------------- Floating panel (wide) ---------------- */}
      <Box
        component="nav"
        aria-label="Main navigation"
        sx={{
          display: "none",
          [WIDE]: {
            display: "flex",
            flexDirection: "column",
            position: "sticky",
            top: 12,
            flexShrink: 0,
            width: si.railWidth,
            height: "calc(100dvh - 24px)",
            m: "12px 0 12px 12px",
            p: 1.5,
            // A pale blue-grey sheet, so the current section can sit on it as
            // a raised WHITE pill. A white panel with a tinted selection is
            // the stock pattern; this inverts it.
            backgroundColor: editorial.blueSoft,
            borderRadius: `${si.radiusSheet}px`,
            boxShadow: si.shadow,
            overflowY: "auto",
            zIndex: 30,
          },
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
            gap: 1.25,
            border: "none",
            background: "none",
            cursor: "pointer",
            px: 1,
            py: 1,
            borderRadius: `${si.radiusPill}px`,
            textAlign: "left",
            color: editorial.ink,
          }}
        >
          <Logo size={30} sx={{ outline: "none" }} />
          <Typography component="span" sx={{ ...siType.cardTitle, fontWeight: 700 }}>
            HR Portal
          </Typography>
        </Box>

        {/* The one primary action in the frame. Navy, full width and labelled,
            so it never reads as just another row of the menu. */}
        <Box
          component="button"
          type="button"
          onClick={() => navigate("/forms")}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            mt: 1.5,
            mb: 2,
            pl: 0.75,
            pr: 2,
            minHeight: 48,
            border: "none",
            cursor: "pointer",
            borderRadius: `${si.radiusPill}px`,
            backgroundColor: editorial.navy,
            color: editorial.white,
            ...siType.cardTitle,
            fontWeight: 700,
            transition: "background-color 0.2s ease, box-shadow 0.2s ease",
            "&:hover": {
              backgroundColor: editorial.navyDeep,
              boxShadow: "0 6px 16px -8px rgba(15, 61, 145, 0.6)",
            },
          }}
        >
          <Box
            aria-hidden
            sx={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: editorial.accent,
              color: editorial.ink,
            }}
          >
            <AddRounded sx={{ fontSize: 22 }} />
          </Box>
          Start a form
        </Box>

        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gap: 0.5 }}>
          {categories.map((category) => {
            const Icon = NAV_ICONS[category.icon];
            const isActive = category.key === categoryKey;
            const showTabs = isActive && category.tabs.length > 1;
            return (
              <Box component="li" key={category.key}>
                <Box
                  component="button"
                  type="button"
                  onClick={() => go(category)}
                  aria-current={isActive && !tabPath ? "page" : undefined}
                  aria-expanded={category.tabs.length > 1 ? isActive : undefined}
                  sx={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 1.25,
                    border: "none",
                    cursor: "pointer",
                    pl: 0.5,
                    pr: 1.5,
                    minHeight: 44,
                    borderRadius: `${si.radiusPill}px`,
                    textAlign: "left",
                    ...siType.body,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? editorial.navy : editorial.ink,
                    // The current section is a raised white pill on the panel's
                    // blue-grey, not a tinted wash: it sits ON the panel, the
                    // way a selected chip sits on a page.
                    backgroundColor: isActive ? editorial.panel : "transparent",
                    boxShadow: isActive ? "0 1px 2px rgba(15, 23, 42, 0.08), 0 2px 8px rgba(15, 23, 42, 0.08)" : "none",
                    transition: "background-color 0.15s ease, box-shadow 0.2s ease",
                    "&:hover": { backgroundColor: isActive ? editorial.panel : HOVER_TINT },
                  }}
                >
                  <Box
                    aria-hidden
                    sx={{
                      width: 36,
                      height: 36,
                      flexShrink: 0,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isActive ? editorial.navy : "transparent",
                      color: isActive ? editorial.white : editorial.muted,
                      transition: "background-color 0.2s ease, color 0.2s ease",
                    }}
                  >
                    <Icon sx={{ fontSize: 20 }} />
                  </Box>
                  {category.label}
                </Box>

                {showTabs && (
                  <Box
                    component="ul"
                    aria-label={`${category.label} pages`}
                    sx={{ listStyle: "none", m: "4px 0 8px", p: 0, pl: 5.5, display: "grid", gap: 0.25 }}
                  >
                    {category.tabs.map((tab) => {
                      const isTab = tab.path === tabPath;
                      return (
                        <Box component="li" key={tab.path}>
                          <Box
                            component="button"
                            type="button"
                            onClick={() => navigate(tab.path)}
                            aria-current={isTab ? "page" : undefined}
                            sx={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              border: "none",
                              cursor: "pointer",
                              px: 1.5,
                              minHeight: 36,
                              borderRadius: `${si.radiusPill}px`,
                              textAlign: "left",
                              ...siType.subtext,
                              fontWeight: isTab ? 700 : 500,
                              color: isTab ? editorial.navy : editorial.muted,
                              backgroundColor: isTab ? editorial.sky : "transparent",
                              "&:hover": { backgroundColor: isTab ? editorial.sky : HOVER_TINT, color: editorial.navy },
                            }}
                          >
                            <Box
                              aria-hidden
                              sx={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                flexShrink: 0,
                                backgroundColor: isTab ? editorial.accent : editorial.border,
                              }}
                            />
                            {tab.label}
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>

        {/* The account, at the foot of the panel where it is always one click
            away and never competes with the page for the top of the screen. */}
        <Box
          component="button"
          type="button"
          onClick={(event) => setAccountMenu({ el: event.currentTarget, fromPanel: true })}
          aria-label={`Account: ${displayName}`}
          aria-haspopup="menu"
          aria-expanded={Boolean(accountMenu)}
          sx={{
            mt: "auto",
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            width: "100%",
            border: "none",
            cursor: "pointer",
            p: 0.75,
            pr: 1.5,
            borderRadius: `${si.radiusPill}px`,
            backgroundColor: editorial.panel,
            textAlign: "left",
            "&:hover": { backgroundColor: editorial.skySoft },
          }}
        >
          {avatar(36)}
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ ...siType.subtext, fontWeight: 600, color: editorial.ink }}>
              {displayName}
            </Typography>
            {roleLabel && (
              <Typography noWrap sx={{ fontSize: "0.6875rem", color: editorial.muted }}>
                {roleLabel}
              </Typography>
            )}
          </Box>
        </Box>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignSelf: "stretch" }}>
        {/* ---------------- Top bar (narrow) ---------------- */}
        <Box
          component="header"
          sx={{
            position: "sticky",
            top: 0,
            zIndex: 30,
            backgroundColor: editorial.panel,
            boxShadow: "0 1px 0 rgba(15, 23, 42, 0.06)",
            [WIDE]: { display: "none" },
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.25,
              px: 1.5,
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
                border: "none",
                background: "none",
                cursor: "pointer",
                p: 0.5,
                flexShrink: 0,
                borderRadius: `${si.radiusPill}px`,
              }}
            >
              <Logo size={28} sx={{ outline: "none" }} />
            </Box>

            <Typography component="h1" sx={{ ...siType.pageTitle, minWidth: 0 }} noWrap>
              {pageTitle}
            </Typography>

            <Box
              component="button"
              type="button"
              onClick={(event) => setAccountMenu({ el: event.currentTarget, fromPanel: false })}
              aria-label={`Account: ${displayName}`}
              aria-haspopup="menu"
              aria-expanded={Boolean(accountMenu)}
              sx={{
                ml: "auto",
                display: "flex",
                border: "none",
                background: "none",
                cursor: "pointer",
                p: 0.5,
                borderRadius: "50%",
                "&:hover": { backgroundColor: HOVER_TINT },
              }}
            >
              {avatar(34)}
            </Box>
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
            px: 2,
            pt: 2,
            "&:focus": { outline: "none" },
            // Clear of the bottom bar, plus the gesture pill beneath it.
            pb: `calc(${si.bottomBarHeight}px + 1.5rem + env(safe-area-inset-bottom))`,
            [WIDE]: { px: 3.5, pt: 3, pb: 4 },
          }}
        >
          {/* The page's h1 on wide screens, for screen readers only. Most pages
              open with a heading of their own ("Approval routing", "Learning
              Materials"), and the panel already shows where you are, so a
              visible title here would say the same thing twice. */}
          <Typography
            component="h1"
            sx={{
              display: "none",
              [WIDE]: {
                display: "block",
                position: "absolute",
                // Strings, not numbers: in `sx` a bare 1 means 100%.
                width: "1px",
                height: "1px",
                overflow: "hidden",
                clip: "rect(0 0 0 0)",
                whiteSpace: "nowrap",
              },
            }}
          >
            {pageTitle}
          </Typography>
          {children}
        </Box>
      </Box>

      <Menu
        anchorEl={accountMenu?.el ?? null}
        open={Boolean(accountMenu)}
        onClose={() => setAccountMenu(null)}
        anchorOrigin={accountMenu?.fromPanel ? { vertical: "top", horizontal: "left" } : { vertical: "bottom", horizontal: "right" }}
        transformOrigin={accountMenu?.fromPanel ? { vertical: "bottom", horizontal: "left" } : { vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              mt: accountMenu?.fromPanel ? -1 : 0.5,
              minWidth: 260,
              borderRadius: `${si.radius}px`,
              boxShadow: si.shadowRaised,
            },
          },
        }}
      >
        {/* Not a MenuItem: it is a label, and a menu whose first entry is
            focusable but does nothing is a keyboard dead end. */}
        <Box sx={{ px: 2, py: 1.5, display: "flex", gap: 1.5, alignItems: "center" }}>
          {avatar(40)}
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ ...siType.cardTitle, color: editorial.ink }} noWrap>
              {displayName}
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

      {/* ---------------- Bottom bar (narrow) ---------------- */}
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
          [WIDE]: { display: "none" },
          [NARROW]: { display: "flex" },
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
                gap: 0.5,
                border: "none",
                background: "none",
                cursor: "pointer",
                px: 0.5,
                color: isActive ? editorial.white : editorial.navyDim,
                "&:hover": { color: editorial.white },
                "&:focus-visible": { outline: `2px solid ${editorial.white}`, outlineOffset: "-3px" },
              }}
            >
              {/* A pill behind the active icon. Sized to the icon, not the
                  cell, so five of them in a row on a 360px screen never touch
                  and the label underneath keeps its contrast on the navy. */}
              <Box
                aria-hidden
                sx={{
                  width: 52,
                  height: 28,
                  borderRadius: `${si.radiusPill}px`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isActive ? "rgba(255, 255, 255, 0.18)" : "transparent",
                  transition: "background-color 0.2s ease",
                }}
              >
                <Icon sx={{ fontSize: 20 }} />
              </Box>
              <Typography
                noWrap
                sx={{ fontSize: "0.6875rem", fontWeight: isActive ? 700 : 600, maxWidth: "100%" }}
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

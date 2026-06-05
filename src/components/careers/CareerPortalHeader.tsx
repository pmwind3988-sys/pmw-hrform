import { useState, type MouseEvent, type ReactNode } from "react";
import {
  Box,
  Container,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import {
  ArrowBack,
  AssignmentInd,
  AutoAwesome,
  Edit,
  Logout,
  Menu as MenuIcon,
  Person,
  PrivacyTip,
  WorkOutlined,
} from "@mui/icons-material";
import { useMsal } from "@azure/msal-react";
import { useNavigate } from "react-router-dom";
import { loginRequest } from "../../auth/msalConfig";
import { clearStoredAuthDecision } from "../../utils/authDecision";
import Logo from "../Logo";
import { editorial, editorialHairline } from "../../theme/editorial";
import { careerActionButtonSx, careerIconButtonSx } from "./careerUi";

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

type CareerPortalSection = "opportunities" | "applications" | "manage" | "cards" | "apply";

interface CareerPortalHeaderProps {
  title: string;
  subtitle: string;
  activeSection: CareerPortalSection;
  isAdmin?: boolean;
  backPath: string;
  backLabel: string;
  maxWidth?: "md" | "lg" | "xl";
  actions?: ReactNode;
  showSectionNav?: boolean;
  showPrivacyLink?: boolean;
}

const sectionItems: {
  section: CareerPortalSection;
  label: string;
  path: string;
  adminOnly?: boolean;
  icon: ReactNode;
}[] = [
  { section: "opportunities", label: "Opportunities", path: "/career-portal", icon: <WorkOutlined /> },
  { section: "applications", label: "Applications", path: "/admin/career/applications", adminOnly: true, icon: <AssignmentInd /> },
  { section: "manage", label: "Openings", path: "/admin/career/opportunities", adminOnly: true, icon: <Edit /> },
  { section: "cards", label: "Cards", path: "/admin/career/cards", adminOnly: true, icon: <AutoAwesome /> },
];

export default function CareerPortalHeader({
  title,
  subtitle,
  activeSection,
  isAdmin = false,
  backPath,
  backLabel,
  maxWidth = "lg",
  actions,
  showSectionNav = true,
  showPrivacyLink = true,
}: CareerPortalHeaderProps) {
  const navigate = useNavigate();
  const { instance, accounts } = useMsal();
  const [profileAnchorEl, setProfileAnchorEl] = useState<null | HTMLElement>(null);
  const [mobileMenuAnchorEl, setMobileMenuAnchorEl] = useState<null | HTMLElement>(null);
  const visibleSections = sectionItems.filter((item) => !item.adminOnly || isAdmin);
  const profileOpen = Boolean(profileAnchorEl);
  const mobileMenuOpen = Boolean(mobileMenuAnchorEl);
  const hasMobileActionMenu = Boolean(actions);
  const userEmail = accounts[0]?.username || "";

  const handleProfileOpen = (event: MouseEvent<HTMLElement>) => {
    setProfileAnchorEl(event.currentTarget);
  };

  const handleProfileClose = () => {
    setProfileAnchorEl(null);
  };

  const handleMobileMenuOpen = (event: MouseEvent<HTMLElement>) => {
    setMobileMenuAnchorEl(event.currentTarget);
  };

  const handleMobileMenuClose = () => {
    setMobileMenuAnchorEl(null);
  };

  const navigateFromProfile = (path: string) => {
    handleProfileClose();
    navigate(path);
  };

  const handleSwitchAccount = () => {
    handleProfileClose();
    clearStoredAuthDecision();
    void instance.logoutPopup().catch(() => {
      void instance.logoutRedirect();
    });
    window.setTimeout(() => {
      void instance.loginRedirect(loginRequest);
    }, 100);
  };

  const handleSignOut = () => {
    handleProfileClose();
    clearStoredAuthDecision();
    void instance.logoutRedirect();
  };

  return (
    <Paper
      sx={{
        borderRadius: 0,
        boxShadow: "none",
        backgroundColor: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(14px)",
        borderBottom: editorialHairline,
        position: "sticky",
        top: 0,
        zIndex: 10,
        overflow: "hidden",
        ...reduceMotionSx,
      }}
    >
      <Container maxWidth={maxWidth} sx={{ position: "relative" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: { xs: 1.25, sm: 1.5, md: 2 },
            py: { xs: 0.8, sm: 1.1, md: 2 },
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
            <IconButton
              onClick={() => navigate(backPath)}
              aria-label={backLabel}
              sx={{
                color: editorial.pmwBlueDark,
                p: { xs: 0.75, sm: 1 },
                flexShrink: 0,
                transition: "transform 0.18s ease, background-color 0.18s ease, color 0.18s ease",
                "&:hover": {
                  transform: "translateX(-2px)",
                  color: editorial.pmwBlue,
                  backgroundColor: editorial.blueWash,
                },
                "&:active": { transform: "translateX(-1px) scale(0.96)" },
                ...reduceMotionSx,
              }}
            >
              <ArrowBack />
            </IconButton>
            <Box
              sx={{
                width: { xs: 38, sm: 46 },
                height: { xs: 38, sm: 46 },
                borderRadius: "8px",
                border: `1px solid ${editorial.pmwBlueSoft}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.82)",
                flexShrink: 0,
                overflow: "hidden",
                transition: "transform 0.18s ease, border-color 0.18s ease",
                "&:hover": {
                  transform: "translateY(-1px)",
                  borderColor: editorial.ink,
                },
                ...reduceMotionSx,
              }}
            >
              <Logo size={{ xs: 30, sm: 38 }} />
            </Box>
            <Box sx={{ minWidth: 0, display: { xs: "none", sm: "block" } }}>
              <Typography
                variant="h5"
                component="h1"
                sx={{
                  fontWeight: 800,
                  color: editorial.ink,
                  fontSize: { xs: "1.1rem", sm: "1.35rem", md: "1.5rem" },
                  lineHeight: 1,
                  letterSpacing: 0,
                  textWrap: "balance",
                }}
              >
                {title}
              </Typography>
              <Typography variant="body2" sx={{ color: editorial.muted, fontSize: { sm: "0.8rem", md: "0.85rem" }, display: { sm: "none", md: "block" } }}>
                {subtitle}
              </Typography>
            </Box>
          </Box>

          <Box
            sx={{
              display: { xs: "flex", md: "none" },
              alignItems: "center",
              gap: 0.75,
              flexShrink: 0,
            }}
          >
            <IconButton
              onClick={handleProfileOpen}
              aria-label="Open account menu"
              sx={{
                ...careerIconButtonSx,
                p: 0.45,
                "&:hover": {
                  transform: "translateY(-1px)",
                  backgroundColor: editorial.blueWash,
                  borderColor: editorial.pmwBlue,
                },
                "&:active": { transform: "scale(0.96)" },
                ...reduceMotionSx,
              }}
            >
              <Box
                sx={{
                  width: 31,
                  height: 31,
                  borderRadius: "8px",
                  backgroundColor: "rgba(0, 120, 212, 0.10)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Person sx={{ fontSize: 18, color: editorial.pmwBlueDark }} />
              </Box>
            </IconButton>
            {hasMobileActionMenu && (
              <IconButton
                onClick={handleMobileMenuOpen}
                aria-label="Open page actions"
                aria-controls={mobileMenuOpen ? "career-mobile-menu" : undefined}
                aria-haspopup="true"
                aria-expanded={mobileMenuOpen ? "true" : undefined}
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: "8px",
                  color: editorial.pmwBlueDark,
                  backgroundColor: "#ffffff",
                  border: `1px solid ${editorial.border}`,
                  transition: "transform 0.18s ease, background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease",
                  "&:hover": {
                    transform: "translateY(-1px)",
                    color: editorial.pmwBlue,
                    backgroundColor: "#F0F7FF",
                    borderColor: editorial.pmwBlue,
                  },
                  "&:active": { transform: "scale(0.96)" },
                  ...reduceMotionSx,
                }}
              >
                <MenuIcon />
              </IconButton>
            )}
          </Box>

          <Stack
            direction="row"
            spacing={1}
            sx={{
              display: { xs: "none", md: "flex" },
              alignItems: "center",
              justifyContent: "flex-end",
              flexWrap: "wrap",
              flexShrink: 0,
              "& > .MuiButton-root": {
                ...careerActionButtonSx,
                fontSize: { xs: "0.72rem", sm: "0.82rem" },
                "& .MuiButton-startIcon": {
                  transition: "transform 0.18s ease",
                },
                ...reduceMotionSx,
              },
            }}
          >
            {actions}
            <IconButton
              onClick={handleProfileOpen}
              aria-label="Open account menu"
              sx={{
                ...careerIconButtonSx,
                p: 0.45,
                "&:hover": {
                  transform: "translateY(-1px)",
                  backgroundColor: editorial.blueWash,
                  borderColor: editorial.pmwBlue,
                },
                "&:active": { transform: "scale(0.96)" },
                ...reduceMotionSx,
              }}
            >
              <Box
                sx={{
                  width: 31,
                  height: 31,
                  borderRadius: "8px",
                  backgroundColor: "rgba(0, 120, 212, 0.10)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Person sx={{ fontSize: 18, color: editorial.pmwBlueDark }} />
              </Box>
            </IconButton>
            <Menu
              anchorEl={profileAnchorEl}
              open={profileOpen}
              onClose={handleProfileClose}
              slotProps={{
                paper: {
                  sx: {
                    minWidth: 250,
                    borderRadius: "8px",
                    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
                    border: "1px solid rgba(0, 0, 0, 0.06)",
                    mt: 1,
                  },
                },
              }}
              transformOrigin={{ horizontal: "right", vertical: "top" }}
              anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
            >
              <MenuItem disabled sx={{ cursor: "default", px: 2.5, py: 1.5 }}>
                <Typography
                  variant="body2"
                  sx={{
                    color: editorial.ink,
                    fontWeight: 700,
                    maxWidth: 210,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {userEmail || "Account"}
                </Typography>
              </MenuItem>
              {((showSectionNav && visibleSections.length > 0) || showPrivacyLink) && (
                <>
                  <Divider sx={{ my: 0.5 }} />
                  {showSectionNav && visibleSections.map((item) => {
                    const selected = activeSection === item.section;
                    return (
                      <MenuItem
                        key={item.section}
                        selected={selected}
                        onClick={() => navigateFromProfile(item.path)}
                        sx={{ py: 1.25, px: 2.5 }}
                      >
                        <Box sx={{ mr: 1.5, color: selected ? editorial.pmwBlue : editorial.muted, display: "flex", "& .MuiSvgIcon-root": { fontSize: 20 } }}>
                          {item.icon}
                        </Box>
                        <Typography variant="body2">{item.label}</Typography>
                      </MenuItem>
                    );
                  })}
                  {showPrivacyLink && (
                    <MenuItem onClick={() => navigateFromProfile("/privacy")} sx={{ py: 1.25, px: 2.5 }}>
                      <PrivacyTip sx={{ mr: 1.5, fontSize: 20, color: editorial.muted }} />
                      <Typography variant="body2">Privacy</Typography>
                    </MenuItem>
                  )}
                </>
              )}
              <Divider sx={{ my: 0.5 }} />
              <MenuItem onClick={handleSwitchAccount} sx={{ py: 1.25, px: 2.5 }}>
                <Person sx={{ mr: 1.5, fontSize: 20, color: editorial.muted }} />
                <Typography variant="body2">Switch account</Typography>
              </MenuItem>
              <MenuItem onClick={handleSignOut} sx={{ py: 1.25, px: 2.5 }}>
                <Logout sx={{ mr: 1.5, fontSize: 20, color: "#DC2626" }} />
                <Typography variant="body2" sx={{ color: "#DC2626" }}>Sign out</Typography>
              </MenuItem>
            </Menu>
          </Stack>
          <Menu
            id="career-mobile-menu"
            anchorEl={mobileMenuAnchorEl}
            open={mobileMenuOpen}
            onClose={handleMobileMenuClose}
            slotProps={{
              paper: {
                sx: {
                  width: 280,
                  maxWidth: "calc(100vw - 24px)",
                  borderRadius: "8px",
                  boxShadow: "0 10px 34px rgba(17, 24, 39, 0.16)",
                  border: "1px solid rgba(17, 24, 39, 0.08)",
                  mt: 1,
                  overflow: "hidden",
                  "& .MuiMenuItem-root": {
                    minHeight: 44,
                  },
                },
              },
            }}
            transformOrigin={{ horizontal: "right", vertical: "top" }}
            anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
          >
            {actions && (
              <Box
                onClick={handleMobileMenuClose}
                sx={{
                  px: 1,
                  py: 0.75,
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.75,
                  "& .MuiButton-root": {
                    width: "100%",
                    justifyContent: "flex-start",
                    borderRadius: "8px",
                    textTransform: "none",
                    fontWeight: 700,
                  },
                }}
              >
                {actions}
              </Box>
            )}
          </Menu>
        </Box>
      </Container>
    </Paper>
  );
}

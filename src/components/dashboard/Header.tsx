import {
  AppBar,
  Box,
  Button,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import {
  Person as PersonIcon,
  Logout as LogoutIcon,
  Settings as SettingsIcon,
  WorkOutlined as WorkIcon,
  Edit as EditIcon,
  Public as PublicIcon,
  Menu as MenuIcon,
} from "@mui/icons-material";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import RoleBadge from "./RoleBadge";
import Logo from "../Logo";
import BackgroundPicker from "./BackgroundPicker";

interface HeaderProps {
  userEmail: string;
  isAdmin: boolean;
  onLogout: () => void;
  onSwitch: () => void;
  onOpenBuilder?: () => void;
}

export default function Header({
  userEmail,
  isAdmin,
  onLogout,
  onSwitch,
  onOpenBuilder,
}: HeaderProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const navigate = useNavigate();
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [profileAnchorEl, setProfileAnchorEl] = useState<null | HTMLElement>(null);
  const [mainMenuAnchorEl, setMainMenuAnchorEl] = useState<null | HTMLElement>(null);
  const profileOpen = Boolean(profileAnchorEl);
  const mainMenuOpen = Boolean(mainMenuAnchorEl);

  const handleProfileOpen = (event: React.MouseEvent<HTMLElement>) => {
    setProfileAnchorEl(event.currentTarget);
  };

  const handleProfileClose = () => {
    setProfileAnchorEl(null);
  };

  const handleMainMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMainMenuAnchorEl(event.currentTarget);
  };

  const handleMainMenuClose = () => {
    setMainMenuAnchorEl(null);
  };

  const bgIcon = (
    <Box sx={{ width: 18, height: 18, borderRadius: "4px", background: "linear-gradient(135deg, #6264A7 25%, #0078D4 25%, #0078D4 50%, #6264A7 50%, #6264A7 75%, #0078D4 75%)", border: "1px solid rgba(0,0,0,0.08)" }} />
  );

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        backgroundColor: "rgba(255, 255, 255, 0.92)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
        zIndex: theme.zIndex.drawer + 1,
        minHeight: isMobile ? 56 : 64,
      }}
    >
      <Toolbar sx={{ gap: 2, minHeight: "inherit" }}>
        {/* Brand mark */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Logo size={isMobile ? 32 : 40} />
          <Stack direction="column" spacing={0}>
            <Typography
              variant="h5"
              component="h1"
              sx={{
                fontWeight: 700,
                color: "#111827",
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
                fontSize: "1.25rem",
              }}
            >
              PMW HR
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "#6B7280",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                fontSize: "0.7rem",
                fontWeight: 600,
                lineHeight: 1,
              }}
            >
              Forms Portal
            </Typography>
          </Stack>
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        {isMobile ? (
          <>
            {/* ── Mobile: Single hamburger menu ── */}
            <IconButton
              onClick={handleMainMenuOpen}
              size="small"
              sx={{
                borderRadius: "10px",
                color: "#6B7280",
                backgroundColor: "rgba(0,0,0,0.04)",
              }}
            >
              <MenuIcon />
            </IconButton>
            <Menu
              anchorEl={mainMenuAnchorEl}
              open={mainMenuOpen}
              onClose={handleMainMenuClose}
              slotProps={{
                paper: {
                  sx: {
                    minWidth: 230,
                    borderRadius: "14px",
                    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
                    border: "1px solid rgba(0, 0, 0, 0.06)",
                    mt: 1,
                  },
                },
              }}
              transformOrigin={{ horizontal: "right", vertical: "top" }}
              anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
            >
              {/* 1. Profile */}
              <MenuItem disabled sx={{ cursor: "default", px: 2.5, py: 1.5 }}>
                <Typography variant="body2" sx={{ color: "#111827", fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {userEmail}
                </Typography>
              </MenuItem>
              <MenuItem onClick={() => { handleMainMenuClose(); onSwitch(); }} sx={{ py: 1.25, px: 2.5 }}>
                <PersonIcon sx={{ mr: 1.5, fontSize: 20, color: "#6B7280" }} />
                <Typography variant="body2">Switch account</Typography>
              </MenuItem>
              <MenuItem onClick={() => { handleMainMenuClose(); onLogout(); }} sx={{ py: 1.25, px: 2.5 }}>
                <LogoutIcon sx={{ mr: 1.5, fontSize: 20, color: "#DC2626" }} />
                <Typography variant="body2" sx={{ color: "#DC2626" }}>Sign out</Typography>
              </MenuItem>

              <Divider sx={{ my: 0.5 }} />

              {/* 2. RoleBadge */}
              <Box sx={{ px: 2.5, py: 1 }}>
                <RoleBadge isAdmin={isAdmin} />
              </Box>

              <Divider sx={{ my: 0.5 }} />

              {/* 3. Careers */}
              <MenuItem onClick={() => { handleMainMenuClose(); navigate("/careers"); }} sx={{ py: 1.25, px: 2.5 }}>
                <PublicIcon sx={{ mr: 1.5, fontSize: 20, color: "#34A853" }} />
                <Typography variant="body2">Careers</Typography>
              </MenuItem>

              {/* 4. Admin items */}
              {isAdmin && (
                <>
                  <Divider sx={{ my: 0.5 }} />
                  {onOpenBuilder && (
                    <MenuItem onClick={() => { handleMainMenuClose(); onOpenBuilder(); }} sx={{ py: 1.25, px: 2.5 }}>
                      <SettingsIcon sx={{ mr: 1.5, fontSize: 20, color: "#6264A7" }} />
                      <Typography variant="body2">Form Builder</Typography>
                    </MenuItem>
                  )}
                  <MenuItem onClick={() => { handleMainMenuClose(); navigate("/admin/jobs"); }} sx={{ py: 1.25, px: 2.5 }}>
                    <WorkIcon sx={{ mr: 1.5, fontSize: 20, color: "#0078D4" }} />
                    <Typography variant="body2">Applications</Typography>
                  </MenuItem>
                  <MenuItem onClick={() => { handleMainMenuClose(); navigate("/admin/jobs/manage"); }} sx={{ py: 1.25, px: 2.5 }}>
                    <EditIcon sx={{ mr: 1.5, fontSize: 20, color: "#6264A7" }} />
                    <Typography variant="body2">Manage Jobs</Typography>
                  </MenuItem>
                </>
              )}

              <Divider sx={{ my: 0.5 }} />

              {/* 5. Background picker */}
              <MenuItem onClick={() => { handleMainMenuClose(); setBgPickerOpen(true); }} sx={{ py: 1.25, px: 2.5 }}>
                <Box sx={{ mr: 1.5, display: "flex", alignItems: "center" }}>{bgIcon}</Box>
                <Typography variant="body2">Choose Background</Typography>
              </MenuItem>
            </Menu>
          </>
        ) : (
          <>
            {/* ── Desktop: separate controls ── */}
            <IconButton
              onClick={() => setBgPickerOpen(true)}
              size="small"
              sx={{
                mr: 0.5,
                borderRadius: "10px",
                color: "#6B7280",
                backgroundColor: "rgba(0,0,0,0.03)",
                "&:hover": { backgroundColor: "rgba(0,0,0,0.06)" },
              }}
            >
              {bgIcon}
            </IconButton>

            {isAdmin && (
              <>
                {onOpenBuilder && (
                  <Button
                    variant="contained"
                    startIcon={<SettingsIcon />}
                    onClick={onOpenBuilder}
                    sx={{
                      mr: 1,
                      borderRadius: "12px",
                      textTransform: "none",
                      backgroundColor: "#6264A7",
                      color: "#ffffff",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      py: 1,
                      px: 2.5,
                      boxShadow: "0 2px 8px rgba(98, 100, 167, 0.25)",
                      transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                      "&:hover": {
                        backgroundColor: "#4A4C80",
                        boxShadow: "0 4px 12px rgba(98, 100, 167, 0.35)",
                        transform: "translateY(-1px)",
                      },
                      "&:active": { transform: "scale(0.98) translateY(0)" },
                    }}
                  >
                    Form Builder
                  </Button>
                )}
                <Button
                  variant="outlined"
                  startIcon={<WorkIcon />}
                  onClick={() => navigate("/admin/jobs")}
                  sx={{
                    mr: 1,
                    borderRadius: "12px",
                    textTransform: "none",
                    color: "#0078D4",
                    borderColor: "rgba(0, 120, 212, 0.3)",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    py: 1,
                    px: 2.5,
                    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                    "&:hover": {
                      borderColor: "#0078D4",
                      backgroundColor: "rgba(0, 120, 212, 0.06)",
                      transform: "translateY(-1px)",
                    },
                  }}
                >
                  Applications
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<EditIcon />}
                  onClick={() => navigate("/admin/jobs/manage")}
                  sx={{
                    mr: 1,
                    borderRadius: "12px",
                    textTransform: "none",
                    color: "#6264A7",
                    borderColor: "rgba(98, 100, 167, 0.3)",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    py: 1,
                    px: 2.5,
                    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                    "&:hover": {
                      borderColor: "#6264A7",
                      backgroundColor: "rgba(98, 100, 167, 0.06)",
                      transform: "translateY(-1px)",
                    },
                  }}
                >
                  Manage Jobs
                </Button>
              </>
            )}

            <Button
              variant="outlined"
              startIcon={<PublicIcon />}
              onClick={() => navigate("/careers")}
              sx={{
                mr: 1,
                borderRadius: "12px",
                textTransform: "none",
                color: "#34A853",
                borderColor: "rgba(52, 168, 83, 0.3)",
                fontWeight: 600,
                fontSize: "0.85rem",
                py: 1,
                px: 2.5,
                transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                "&:hover": {
                  borderColor: "#34A853",
                  backgroundColor: "rgba(52, 168, 83, 0.06)",
                  transform: "translateY(-1px)",
                },
              }}
            >
              Careers
            </Button>

            <RoleBadge isAdmin={isAdmin} />

            <IconButton
              onClick={handleProfileOpen}
              size="small"
              sx={{
                ml: 0.5,
                p: 0.75,
                borderRadius: "12px",
                backgroundColor: "rgba(0, 120, 212, 0.06)",
                border: "1px solid rgba(0, 120, 212, 0.1)",
                transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                "&:hover": {
                  backgroundColor: "rgba(0, 120, 212, 0.12)",
                  borderColor: "rgba(0, 120, 212, 0.2)",
                  transform: "translateY(-1px)",
                },
              }}
            >
              <Box sx={{ width: 32, height: 32, borderRadius: "10px", backgroundColor: "rgba(0, 120, 212, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <PersonIcon sx={{ fontSize: 18, color: "#0078D4" }} />
              </Box>
            </IconButton>

            <Menu
              anchorEl={profileAnchorEl}
              open={profileOpen}
              onClose={handleProfileClose}
              slotProps={{
                paper: {
                  sx: {
                    minWidth: 220,
                    borderRadius: "14px",
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
                <Typography variant="body2" sx={{ color: "#111827", fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {userEmail}
                </Typography>
              </MenuItem>
              <MenuItem onClick={() => { handleProfileClose(); onSwitch(); }} sx={{ py: 1.25, px: 2.5 }}>
                <PersonIcon sx={{ mr: 1.5, fontSize: 20, color: "#6B7280" }} />
                <Typography variant="body2">Switch account</Typography>
              </MenuItem>
              <MenuItem onClick={() => { handleProfileClose(); onLogout(); }} sx={{ py: 1.25, px: 2.5 }}>
                <LogoutIcon sx={{ mr: 1.5, fontSize: 20, color: "#DC2626" }} />
                <Typography variant="body2" sx={{ color: "#DC2626" }}>Sign out</Typography>
              </MenuItem>
            </Menu>
          </>
        )}

        <BackgroundPicker open={bgPickerOpen} onClose={() => setBgPickerOpen(false)} />
      </Toolbar>
    </AppBar>
  );
}
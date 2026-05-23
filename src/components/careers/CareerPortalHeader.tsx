import { useState, type MouseEvent, type ReactNode } from "react";
import {
  Box,
  Button,
  Chip,
  Container,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { keyframes } from "@mui/material/styles";
import {
  ArrowBack,
  AssignmentInd,
  AutoAwesome,
  Edit,
  Logout,
  Person,
  PrivacyTip,
  Settings,
  WorkOutlined,
} from "@mui/icons-material";
import { useMsal } from "@azure/msal-react";
import { useNavigate } from "react-router-dom";
import { loginRequest } from "../../auth/msalConfig";
import { clearStoredAuthDecision } from "../../utils/authDecision";
import Logo from "../Logo";

const headerReveal = keyframes`
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const subtleSheen = keyframes`
  from {
    transform: translateX(-120%);
  }
  to {
    transform: translateX(120%);
  }
`;

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
  const visibleSections = sectionItems.filter((item) => !item.adminOnly || isAdmin);
  const profileOpen = Boolean(profileAnchorEl);
  const userEmail = accounts[0]?.username || "";

  const handleProfileOpen = (event: MouseEvent<HTMLElement>) => {
    setProfileAnchorEl(event.currentTarget);
  };

  const handleProfileClose = () => {
    setProfileAnchorEl(null);
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
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        backgroundColor: "rgba(255,255,255,0.94)",
        backdropFilter: "blur(14px)",
        borderBottom: "1px solid rgba(17, 24, 39, 0.08)",
        position: "sticky",
        top: 0,
        zIndex: 10,
        overflow: "hidden",
        animation: `${headerReveal} 0.32s ease both`,
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          background: "linear-gradient(110deg, transparent 0%, rgba(0,120,212,0.06) 35%, transparent 55%)",
          transform: "translateX(-120%)",
          animation: `${subtleSheen} 6.5s ease-in-out infinite`,
          pointerEvents: "none",
        },
        ...reduceMotionSx,
      }}
    >
      <Container maxWidth={maxWidth} sx={{ position: "relative" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: { xs: "stretch", md: "center" },
            justifyContent: "space-between",
            gap: { xs: 1.25, sm: 1.5, md: 2 },
            py: { xs: 1.25, sm: 2 },
            flexDirection: { xs: "column", md: "row" },
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
            <IconButton
              onClick={() => navigate(backPath)}
              aria-label={backLabel}
              sx={{
                color: "#6B7280",
                p: { xs: 0.75, sm: 1 },
                flexShrink: 0,
                transition: "transform 0.18s ease, background-color 0.18s ease, color 0.18s ease",
                "&:hover": {
                  transform: "translateX(-2px)",
                  color: "#0078D4",
                  backgroundColor: "#F0F7FF",
                },
                "&:active": { transform: "translateX(-1px) scale(0.98)" },
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
                border: "1px solid rgba(17, 24, 39, 0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#ffffff",
                flexShrink: 0,
                overflow: "hidden",
                position: "relative",
                transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
                "&::after": {
                  content: '""',
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(110deg, transparent 20%, rgba(0,120,212,0.10) 48%, transparent 72%)",
                  transform: "translateX(-120%)",
                  pointerEvents: "none",
                },
                "&:hover": {
                  transform: "translateY(-1px)",
                  borderColor: "rgba(0, 120, 212, 0.25)",
                  boxShadow: "0 6px 14px rgba(0, 120, 212, 0.12)",
                  "&::after": {
                    animation: `${subtleSheen} 0.9s ease`,
                  },
                },
                ...reduceMotionSx,
              }}
            >
              <Logo size={{ xs: 30, sm: 38 }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.25, flexWrap: "wrap" }}>
                <Chip
                  label="Internal Career Advancement"
                  size="small"
                  sx={{
                    height: 22,
                    borderRadius: "8px",
                    backgroundColor: "#E6F4EA",
                    color: "#2E7D32",
                    fontWeight: 700,
                    fontSize: "0.68rem",
                  }}
                />
              </Stack>
              <Typography
                variant="h5"
                component="h1"
                sx={{
                  fontWeight: 700,
                  color: "#111827",
                  fontSize: { xs: "1.05rem", sm: "1.3rem" },
                  lineHeight: 1.2,
                  letterSpacing: 0,
                }}
              >
                {title}
              </Typography>
              <Typography variant="body2" sx={{ color: "#6B7280", fontSize: { xs: "0.75rem", sm: "0.85rem" } }}>
                {subtitle}
              </Typography>
            </Box>
          </Box>

          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
              justifyContent: { xs: "stretch", md: "flex-end" },
              flexWrap: "wrap",
              flexShrink: 0,
              "& > .MuiButton-root": {
                borderRadius: "8px",
                textTransform: "none",
                fontWeight: 700,
                fontSize: { xs: "0.72rem", sm: "0.82rem" },
                minHeight: 36,
                transition: "transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease",
                "& .MuiButton-startIcon": {
                  transition: "transform 0.18s ease",
                },
                "&:active": {
                  transform: "translateY(0) scale(0.98)",
                },
                ...reduceMotionSx,
              },
            }}
          >
            {showSectionNav && visibleSections.map((item) => {
              const selected = activeSection === item.section;
              return (
                <Button
                  key={item.section}
                  variant={selected ? "contained" : "outlined"}
                  startIcon={item.icon}
                  onClick={() => navigate(item.path)}
                  sx={{
                    flex: { xs: "1 1 auto", md: "0 0 auto" },
                    whiteSpace: "nowrap",
                    backgroundColor: selected ? "#0078D4" : "#ffffff",
                    color: selected ? "#ffffff" : "#374151",
                    borderColor: selected ? "#0078D4" : "#D1D5DB",
                    "&:hover": {
                      backgroundColor: selected ? "#106EBE" : "#F8FAFC",
                      borderColor: selected ? "#106EBE" : "#9CA3AF",
                      transform: "translateY(-1px)",
                      boxShadow: selected ? "0 6px 16px rgba(0, 120, 212, 0.18)" : "0 6px 14px rgba(17, 24, 39, 0.08)",
                      "& .MuiButton-startIcon": {
                        transform: selected ? "scale(1.08)" : "translateX(1px)",
                      },
                    },
                    ...reduceMotionSx,
                  }}
                >
                  {item.label}
                </Button>
              );
            })}
            {actions}
            {showPrivacyLink && (
              <Button
                variant="text"
                startIcon={<PrivacyTip />}
                onClick={() => navigate("/privacy")}
                sx={{
                  color: "#6B7280",
                  flex: { xs: "1 1 auto", md: "0 0 auto" },
                  whiteSpace: "nowrap",
                  "&:hover": {
                    color: "#0078D4",
                    backgroundColor: "#F0F7FF",
                    transform: "translateY(-1px)",
                    "& .MuiButton-startIcon": {
                      transform: "scale(1.08)",
                    },
                  },
                  ...reduceMotionSx,
                }}
              >
                Privacy
              </Button>
            )}
            <IconButton
              onClick={handleProfileOpen}
              aria-label="Open account menu"
              sx={{
                p: 0.45,
                borderRadius: "8px",
                backgroundColor: "rgba(0, 120, 212, 0.06)",
                border: "1px solid rgba(0, 120, 212, 0.12)",
                transition: "transform 0.18s ease, background-color 0.18s ease, border-color 0.18s ease",
                "&:hover": {
                  transform: "translateY(-1px)",
                  backgroundColor: "rgba(0, 120, 212, 0.12)",
                  borderColor: "rgba(0, 120, 212, 0.24)",
                },
                "&:active": { transform: "translateY(0) scale(0.98)" },
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
                <Person sx={{ fontSize: 18, color: "#0078D4" }} />
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
                    color: "#111827",
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
              {isAdmin && (
                <>
                  <Divider sx={{ my: 0.5 }} />
                  <MenuItem onClick={() => navigateFromProfile("/admin/builder")} sx={{ py: 1.25, px: 2.5 }}>
                    <Settings sx={{ mr: 1.5, fontSize: 20, color: "#6264A7" }} />
                    <Typography variant="body2">Form Builder</Typography>
                  </MenuItem>
                  <MenuItem onClick={() => navigateFromProfile("/admin/career/applications")} sx={{ py: 1.25, px: 2.5 }}>
                    <AssignmentInd sx={{ mr: 1.5, fontSize: 20, color: "#0078D4" }} />
                    <Typography variant="body2">Career Applications</Typography>
                  </MenuItem>
                  <MenuItem onClick={() => navigateFromProfile("/admin/career/opportunities")} sx={{ py: 1.25, px: 2.5 }}>
                    <Edit sx={{ mr: 1.5, fontSize: 20, color: "#6264A7" }} />
                    <Typography variant="body2">Manage Openings</Typography>
                  </MenuItem>
                  <MenuItem onClick={() => navigateFromProfile("/admin/career/cards")} sx={{ py: 1.25, px: 2.5 }}>
                    <AutoAwesome sx={{ mr: 1.5, fontSize: 20, color: "#16A34A" }} />
                    <Typography variant="body2">Manage Cards</Typography>
                  </MenuItem>
                </>
              )}
              <Divider sx={{ my: 0.5 }} />
              <MenuItem onClick={handleSwitchAccount} sx={{ py: 1.25, px: 2.5 }}>
                <Person sx={{ mr: 1.5, fontSize: 20, color: "#6B7280" }} />
                <Typography variant="body2">Switch account</Typography>
              </MenuItem>
              <MenuItem onClick={handleSignOut} sx={{ py: 1.25, px: 2.5 }}>
                <Logout sx={{ mr: 1.5, fontSize: 20, color: "#DC2626" }} />
                <Typography variant="body2" sx={{ color: "#DC2626" }}>Sign out</Typography>
              </MenuItem>
            </Menu>
          </Stack>
        </Box>
      </Container>
    </Paper>
  );
}

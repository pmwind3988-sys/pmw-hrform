import {
  AppBar,
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
  useTheme,
} from "@mui/material";
import {
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  Person as PersonIcon,
  Dashboard as DashboardIcon,
} from "@mui/icons-material";
import { useState } from "react";
import RoleBadge from "./RoleBadge";

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
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        backgroundColor: "rgba(255, 255, 255, 0.88)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
        zIndex: theme.zIndex.drawer + 1,
      }}
    >
      <Toolbar sx={{ gap: 2 }}>
        {/* Brand mark */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "10px",
              background: "linear-gradient(135deg, #0078D4 0%, #6264A7 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0, 120, 212, 0.25)",
            }}
          >
            <DashboardIcon sx={{ fontSize: 20, color: "#fff" }} />
          </Box>
          <Stack direction="column" spacing={0.1}>
            <Typography
              variant="h5"
              component="h1"
              sx={{
                fontWeight: 600,
                color: "#1A1A2E",
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
                fontSize: "1.15rem",
              }}
            >
              PMW HR
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "rgba(26, 26, 46, 0.45)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                fontSize: "0.6rem",
                fontWeight: 600,
              }}
            >
              Forms Portal
            </Typography>
          </Stack>
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        {isAdmin && onOpenBuilder && (
          <Button
            variant="outlined"
            startIcon={<SettingsIcon />}
            onClick={onOpenBuilder}
            sx={{
              mr: 1,
              borderRadius: "10px",
              textTransform: "none",
              borderColor: "rgba(98, 100, 167, 0.35)",
              color: "#6264A7",
              fontWeight: 500,
              fontSize: "0.85rem",
              py: 1,
              px: 2,
              "&:hover": {
                borderColor: "#6264A7",
                backgroundColor: "rgba(98, 100, 167, 0.06)",
              },
            }}
          >
            Form Builder
          </Button>
        )}

        <RoleBadge isAdmin={isAdmin} />

        <IconButton
          onClick={handleMenuOpen}
          size="small"
          sx={{
            ml: 0.5,
            p: 0.75,
            borderRadius: "12px",
            backgroundColor: "rgba(0, 120, 212, 0.06)",
            border: "1px solid rgba(0, 120, 212, 0.1)",
            transition: "all 0.2s ease",
            "&:hover": {
              backgroundColor: "rgba(0, 120, 212, 0.12)",
              borderColor: "rgba(0, 120, 212, 0.2)",
            },
          }}
        >
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: "10px",
              backgroundColor: "rgba(0, 120, 212, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <PersonIcon sx={{ fontSize: 18, color: "#0078D4" }} />
          </Box>
        </IconButton>

        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleMenuClose}
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
            <Typography
              variant="body2"
              sx={{
                color: "#1A1A2E",
                fontWeight: 500,
                maxWidth: 200,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {userEmail}
            </Typography>
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleMenuClose();
              onSwitch();
            }}
            sx={{ py: 1.25, px: 2.5 }}
          >
            <PersonIcon sx={{ mr: 1.5, fontSize: 20, color: "rgba(26, 26, 46, 0.5)" }} />
            <Typography variant="body2">Switch account</Typography>
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleMenuClose();
              onLogout();
            }}
            sx={{ py: 1.25, px: 2.5 }}
          >
            <LogoutIcon sx={{ mr: 1.5, fontSize: 20, color: "rgba(220, 38, 38, 0.6)" }} />
            <Typography variant="body2" sx={{ color: "#DC2626" }}>
              Sign out
            </Typography>
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}

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
        backgroundColor: "#ffffff",
        borderBottom: "1px solid rgba(0,0,0,0.04)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        zIndex: theme.zIndex.drawer + 1,
      }}
    >
      <Toolbar>
        <Stack direction="column">
          <Typography
            variant="h5"
            component="h1"
            sx={{
              fontWeight: 600,
              color: "#1a1a2e",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            PMW HR Forms
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: "rgba(0,0,0,0.4)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontSize: "0.65rem",
            }}
          >
            HR Forms Portal
          </Typography>
        </Stack>

        <Box sx={{ flexGrow: 1 }} />

        {isAdmin && onOpenBuilder && (
          <Button
            variant="outlined"
            startIcon={<SettingsIcon />}
            onClick={onOpenBuilder}
            sx={{
              mr: 2,
              borderRadius: "10px",
              textTransform: "none",
              borderColor: "rgba(98,100,167,0.3)",
              color: "#6264A7",
              "&:hover": {
                borderColor: "#6264A7",
                backgroundColor: "rgba(98,100,167,0.04)",
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
          sx={{ ml: 1 }}
        >
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              backgroundColor: "rgba(0,120,212,0.1)",
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
                minWidth: 200,
                borderRadius: "12px",
                boxShadow: "0 4px 24px rgba(0,0,0,0.1)",
                border: "1px solid rgba(0,0,0,0.06)",
              },
            },
          }}
        >
          <MenuItem disabled sx={{ cursor: "default", px: 2 }}>
            <Typography
              variant="body2"
              sx={{
                color: "#1a1a2e",
                fontWeight: 500,
                maxWidth: 180,
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
            sx={{ py: 1 }}
          >
            <PersonIcon sx={{ mr: 1.5, fontSize: 20, color: "rgba(0,0,0,0.5)" }} />
            <Typography variant="body2">Switch account</Typography>
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleMenuClose();
              onLogout();
            }}
            sx={{ py: 1 }}
          >
            <LogoutIcon sx={{ mr: 1.5, fontSize: 20, color: "rgba(220,38,38,0.6)" }} />
            <Typography variant="body2" sx={{ color: "#dc2626" }}>
              Sign out
            </Typography>
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}

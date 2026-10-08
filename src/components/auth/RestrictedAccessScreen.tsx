import { Box, Button } from "@mui/material";
import {
  Logout as LogoutIcon,
  Refresh as RefreshIcon,
  SwitchAccount as SwitchAccountIcon,
} from "@mui/icons-material";
import StatusPanel from "../common/StatusPanel";
import { editorial } from "../../theme/editorial";

interface RestrictedAccessScreenProps {
  userEmail: string;
  onRetry: () => void;
  onSwitch: () => void;
  onSignOut: () => void;
}

export default function RestrictedAccessScreen({
  userEmail,
  onRetry,
  onSwitch,
  onSignOut,
}: RestrictedAccessScreenProps) {
  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        backgroundColor: editorial.paper,
      }}
    >
      <StatusPanel
        variant="page"
        tone="no-access"
        title="You don't have access to the HR portal yet"
        body={
          userEmail
            ? `Ask IT Support to give ${userEmail} access to the HR SharePoint site.`
            : "Ask IT Support to give you access to the HR SharePoint site."
        }
        primary={{ label: "Try again", onClick: onRetry, icon: <RefreshIcon /> }}
        secondary={{ label: "Switch account", onClick: onSwitch, icon: <SwitchAccountIcon /> }}
      />
      <Box sx={{ textAlign: "center", pb: 4 }}>
        <Button
          variant="text"
          startIcon={<LogoutIcon />}
          onClick={onSignOut}
          sx={{ color: editorial.muted, textTransform: "none", fontWeight: 600 }}
        >
          Sign out
        </Button>
      </Box>
    </Box>
  );
}

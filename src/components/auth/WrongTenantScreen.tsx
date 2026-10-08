import { Box } from "@mui/material";
import StatusPanel from "../common/StatusPanel";
import { editorial } from "../../theme/editorial";

interface WrongTenantScreenProps {
  userEmail: string;
  onLogout: () => void;
  onSwitch: () => void;
}

export default function WrongTenantScreen({
  userEmail,
  onLogout,
  onSwitch,
}: WrongTenantScreenProps) {
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
        title="This isn't a PMW account"
        body={`You're signed in as ${userEmail}. Sign in with your @pmw-group.com account instead.`}
        primary={{ label: "Switch account", onClick: onSwitch }}
        secondary={{ label: "Sign out", onClick: onLogout }}
      />
    </Box>
  );
}

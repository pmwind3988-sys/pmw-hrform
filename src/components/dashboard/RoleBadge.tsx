import { Chip } from "@mui/material";
import { Shield as ShieldIcon, Person as PersonIcon } from "@mui/icons-material";

interface RoleBadgeProps {
  isAdmin: boolean;
}

export default function RoleBadge({ isAdmin }: RoleBadgeProps) {

  if (isAdmin) {
    return (
      <Chip
        icon={<ShieldIcon sx={{ color: "#b45309 !important" }} />}
        label="ADMIN"
        size="small"
        sx={{
          backgroundColor: "rgba(245,158,11,0.1)",
          color: "#b45309",
          border: "1px solid rgba(245,158,11,0.2)",
          fontWeight: 600,
          letterSpacing: 0,
          fontSize: "0.7rem",
        }}
      />
    );
  }

  return (
    <Chip
      icon={<PersonIcon sx={{ color: "#0078D4 !important" }} />}
      label="USER"
      size="small"
      sx={{
        backgroundColor: "rgba(0,120,212,0.08)",
        color: "#0078D4",
        border: "1px solid rgba(0,120,212,0.15)",
        fontWeight: 600,
        letterSpacing: 0,
        fontSize: "0.7rem",
      }}
    />
  );
}

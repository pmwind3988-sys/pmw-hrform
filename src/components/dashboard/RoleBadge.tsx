import { Chip } from "@mui/material";
import { Shield as ShieldIcon, Person as PersonIcon } from "@mui/icons-material";

interface RoleBadgeProps {
  isAdmin: boolean;
}

export default function RoleBadge({ isAdmin }: RoleBadgeProps) {

  if (isAdmin) {
    return (
      <Chip
        icon={<ShieldIcon sx={{ color: "#101010 !important" }} />}
        label="ADMIN"
        size="small"
        sx={{
          backgroundColor: "#FFF546",
          color: "#101010",
          border: "1px solid #101010",
          fontWeight: 800,
          letterSpacing: 0,
          fontSize: "0.7rem",
        }}
      />
    );
  }

  return (
    <Chip
      icon={<PersonIcon sx={{ color: "#101010 !important" }} />}
      label="USER"
      size="small"
      sx={{
        backgroundColor: "#EAF5FC",
        color: "#101010",
        border: "1px solid #101010",
        fontWeight: 800,
        letterSpacing: 0,
        fontSize: "0.7rem",
      }}
    />
  );
}

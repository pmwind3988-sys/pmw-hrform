import { Chip } from "@mui/material";

interface ListBadgeProps {
  title: string;
  icon: string;
  color: string;
  pale: string;
}

export default function ListBadge({ title, icon, color, pale }: ListBadgeProps) {
  return (
    <Chip
      label={`${icon} ${title}`}
      size="small"
      sx={{
        backgroundColor: pale,
        color,
        border: `1px solid ${color}20`,
        fontWeight: 500,
        fontSize: "0.75rem",
        textTransform: "none",
      }}
    />
  );
}

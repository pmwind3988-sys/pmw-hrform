import { Chip } from "@mui/material";
import { ensureReadable } from "../../theme/contrast";
import { DescriptionOutlined as DescriptionIcon } from "@mui/icons-material";

interface ListBadgeProps {
  title: string;
  color: string;
  pale: string;
}

export default function ListBadge({ title, color, pale }: ListBadgeProps) {
  /*
    The pale wash is chosen per form, so this pairing is only known at render.
    Keep the form's own colour where it reads, and fall back to legible ink
    where it does not — a tint someone picked should not decide whether the
    label can be read.
  */
  const ink = ensureReadable(color, pale);

  return (
    <Chip
      icon={<DescriptionIcon sx={{ color: `${color} !important`, fontSize: "0.9375rem" }} />}
      label={title}
      size="small"
      sx={{
        backgroundColor: pale,
        color: ink,
        boxShadow: `inset 0 0 0 1px ${color}33`,
        fontWeight: 700,
        fontSize: "0.78rem",
        textTransform: "none",
        maxWidth: "100%",
        "& .MuiChip-label": {
          overflow: "hidden",
          textOverflow: "ellipsis",
        },
      }}
    />
  );
}

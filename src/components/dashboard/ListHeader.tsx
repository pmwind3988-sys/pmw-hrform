import { Box, Typography, useMediaQuery, useTheme } from "@mui/material";
import { editorial } from "../../theme/editorial";

interface ListHeaderProps {
  isAdmin: boolean;
}

export default function ListHeader({ isAdmin }: ListHeaderProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  if (isMobile) return null;

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: isAdmin ? "2fr 1.5fr 1fr 1fr 1fr 40px" : "2fr 1fr 1fr 1fr 40px",
        gap: 2,
        px: 3,
        py: 1.5,
        backgroundColor: editorial.paper,
        borderRadius: "14px 14px 0 0",
        border: `1px solid ${editorial.border}`,
        borderBottom: 0,
        alignItems: "center",
      }}
    >
      <Typography
        variant="caption"
        sx={{
          textTransform: "uppercase",
          letterSpacing: 0,
          color: editorial.muted,
          fontWeight: 600,
          fontSize: "0.7rem",
        }}
      >
        Submission
      </Typography>
      {isAdmin && (
        <Typography
          variant="caption"
          sx={{
            textTransform: "uppercase",
            letterSpacing: 0,
            color: editorial.muted,
            fontWeight: 600,
            fontSize: "0.7rem",
          }}
        >
          Submitted By
        </Typography>
      )}
      <Typography
        variant="caption"
        sx={{
          textTransform: "uppercase",
          letterSpacing: 0,
          color: editorial.muted,
          fontWeight: 600,
          fontSize: "0.7rem",
        }}
      >
        List
      </Typography>
      <Typography
        variant="caption"
        sx={{
          textTransform: "uppercase",
          letterSpacing: 0,
          color: editorial.muted,
          fontWeight: 600,
          fontSize: "0.7rem",
        }}
      >
        Category
      </Typography>
      <Typography
        variant="caption"
        sx={{
          textTransform: "uppercase",
          letterSpacing: 0,
          color: editorial.muted,
          fontWeight: 600,
          fontSize: "0.7rem",
        }}
      >
        Status
      </Typography>
      <Box />
    </Box>
  );
}

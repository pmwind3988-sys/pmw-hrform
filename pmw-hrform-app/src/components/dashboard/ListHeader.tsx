import { Box, Typography, useMediaQuery, useTheme } from "@mui/material";

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
        backgroundColor: "rgba(98,100,167,0.04)",
        borderRadius: "12px 12px 0 0",
        alignItems: "center",
      }}
    >
      <Typography
        variant="caption"
        sx={{
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "rgba(0,0,0,0.45)",
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
            letterSpacing: "0.05em",
            color: "rgba(0,0,0,0.45)",
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
          letterSpacing: "0.05em",
          color: "rgba(0,0,0,0.45)",
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
          letterSpacing: "0.05em",
          color: "rgba(0,0,0,0.45)",
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
          letterSpacing: "0.05em",
          color: "rgba(0,0,0,0.45)",
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
